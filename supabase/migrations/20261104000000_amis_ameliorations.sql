-- Améliorations des bâtiments, garde-robe du personnage et classement entre
-- amis. Additive et rejouable : rien de ce qui existe n'est retiré.

-- ── Niveau des bâtiments : 1 à la construction, 3 au plus ──
alter table public.constructions add column if not exists niveau smallint not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'constructions_niveau_borne' and conrelid = 'public.constructions'::regclass) then
    alter table public.constructions add constraint constructions_niveau_borne check (niveau between 1 and 3);
  end if;
end;
$$;

-- ── Ce que les amis voient : un pseudo, l'apparence du personnage, le niveau ──
alter table public.profils add column if not exists pseudo text;
alter table public.profils add column if not exists apparence jsonb not null default '{}'::jsonb;
-- Le niveau se calcule depuis les sessions, que les amis ne lisent pas :
-- l'application recopie ici celui qu'elle calcule.
alter table public.profils add column if not exists niveau smallint not null default 1;
alter table public.profils add column if not exists code_ami text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profils_pseudo_borne' and conrelid = 'public.profils'::regclass) then
    alter table public.profils add constraint profils_pseudo_borne check (pseudo is null or char_length(btrim(pseudo)) between 1 and 24);
  end if;
  -- Un objet, et petit : ce n'est qu'une liste d'identifiants de la garde-robe.
  if not exists (select 1 from pg_constraint where conname = 'profils_apparence_objet' and conrelid = 'public.profils'::regclass) then
    alter table public.profils add constraint profils_apparence_objet check (jsonb_typeof(apparence) = 'object' and pg_column_size(apparence) <= 1024);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profils_niveau_borne' and conrelid = 'public.profils'::regclass) then
    alter table public.profils add constraint profils_niveau_borne check (niveau between 1 and 999);
  end if;
  -- Sans I, O, 0 ni 1 : un code se dicte sans confusion.
  if not exists (select 1 from pg_constraint where conname = 'profils_code_ami_forme' and conrelid = 'public.profils'::regclass) then
    alter table public.profils add constraint profils_code_ami_forme check (code_ami is null or code_ami ~ '^[A-HJ-NP-Z2-9]{8}$');
  end if;
end;
$$;
create unique index if not exists profils_code_ami_unique on public.profils (code_ami) where code_ami is not null;

-- ── Amitiés : une ligne dans chaque sens, pour que chacun lise les siennes ──
create table if not exists public.amities (
  utilisateur uuid not null references auth.users (id) on delete cascade,
  ami uuid not null references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (utilisateur, ami),
  constraint amities_pas_soi check (utilisateur <> ami)
);
alter table public.amities enable row level security;
drop policy if exists amities_lecture on public.amities;
create policy amities_lecture on public.amities
  for select to authenticated
  using (utilisateur = auth.uid());
-- Ni insertion ni suppression directes : seules les fonctions ci-dessous
-- créent une amitié (avec un code) et la défont (des deux côtés à la fois).

-- Code de 8 caractères tirés d'un UUID v4 : ses octets 0 à 5, 10 et 11 sont
-- aléatoires (pas ceux de version et de variante), et 256 se divise par 32 :
-- chaque lettre a la même chance. random() serait prévisible.
create or replace function public.hameau_code_aleatoire()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(u.b, t.i) % 32, 1), '' order by t.i)
  from (select uuid_send(gen_random_uuid()) as b) u
  cross join unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as t(i);
$$;

-- Ton code ami : créé au premier appel, puis toujours le même. SECURITY
-- INVOKER : les politiques RLS s'appliquent, chacun n'écrit que son profil.
create or replace function public.hameau_mon_code()
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'connexion requise' using errcode = '28000';
  end if;
  select code_ami into v_code from public.profils where user_id = auth.uid();
  if v_code is not null then
    return v_code;
  end if;
  for essai in 1..5 loop
    begin
      insert into public.profils (user_id, code_ami) values (auth.uid(), public.hameau_code_aleatoire())
      on conflict (user_id) do update set code_ami = coalesce(public.profils.code_ami, excluded.code_ami)
      returning code_ami into v_code;
      return v_code;
    exception when unique_violation then
      -- Code déjà pris par un autre hameau : on en tire un autre.
      null;
    end;
  end loop;
  raise exception 'impossible de créer un code, réessaie' using errcode = '40001';
end;
$$;

-- Un nouveau code : l'ancien cesse de marcher, les amis actuels le restent.
create or replace function public.hameau_nouveau_code()
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  perform public.hameau_mon_code();
  for essai in 1..5 loop
    begin
      update public.profils set code_ami = public.hameau_code_aleatoire() where user_id = auth.uid()
      returning code_ami into v_code;
      return v_code;
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'impossible de créer un code, réessaie' using errcode = '40001';
end;
$$;

-- Ajouter un ami par son code. SECURITY DEFINER : il faut lire le profil de
-- l'autre pour trouver son code, ce que la RLS interdit — à juste titre —
-- partout ailleurs. Seuls son identifiant et son pseudo sont rendus.
create or replace function public.hameau_ajouter_ami(p_code text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_moi uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_ami uuid;
  v_pseudo text;
begin
  if v_moi is null then
    raise exception 'connexion requise' using errcode = '28000';
  end if;
  select user_id, pseudo into v_ami, v_pseudo from public.profils where code_ami = v_code;
  if v_ami is null then
    raise exception 'code inconnu' using errcode = 'P0002';
  end if;
  if v_ami = v_moi then
    raise exception 'C''est ton propre code : envoie-le à un ami pour qu''il t''ajoute.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.amities where utilisateur = v_moi and ami = v_ami)
     and (select count(*) from public.amities where utilisateur = v_moi) >= 50 then
    raise exception 'trop d''amis' using errcode = '54000';
  end if;
  insert into public.amities (utilisateur, ami) values (v_moi, v_ami), (v_ami, v_moi)
  on conflict do nothing;
  return json_build_object('ami', v_ami, 'pseudo', v_pseudo);
end;
$$;

-- Défaire une amitié, des deux côtés : l'un ne doit pas continuer à voir l'autre.
create or replace function public.hameau_retirer_ami(p_ami uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.amities
  where (utilisateur = auth.uid() and ami = p_ami)
     or (utilisateur = p_ami and ami = auth.uid());
$$;

-- Le classement : toi et tes amis, sur `p_jours` jours à partir de
-- `p_depuis`, jours découpés dans le fuseau de celui qui demande. Les
-- sessions restent en base : on ne rend que des totaux (et la session en
-- cours, pour montrer qui travaille en ce moment). Chaque session est
-- plafonnée comme le sont les points (`p_plafond_minutes`, la valeur de
-- l'application) : un chrono oublié toute la nuit ne gagne pas la semaine.
create or replace function public.hameau_classement(
  p_depuis date,
  p_jours integer default 7,
  p_fuseau text default 'Europe/Paris',
  p_plafond_minutes integer default 240
)
returns table (
  id uuid,
  moi boolean,
  pseudo text,
  nom_hameau text,
  apparence jsonb,
  niveau integer,
  secondes bigint,
  sessions integer,
  par_jour integer[],
  ouverte_debut timestamptz,
  ouverte_pause_secondes integer,
  ouverte_pause_depuis timestamptz,
  batiments integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_moi uuid := auth.uid();
  v_fuseau text := coalesce(nullif(p_fuseau, ''), 'Europe/Paris');
  v_jours integer := least(greatest(coalesce(p_jours, 7), 1), 31);
  v_plafond bigint := least(greatest(coalesce(p_plafond_minutes, 240), 1), 1440)::bigint * 60;
  v_debut timestamptz;
  v_fin timestamptz;
begin
  if v_moi is null then
    raise exception 'connexion requise' using errcode = '28000';
  end if;
  if p_depuis is null then
    raise exception 'période sans début' using errcode = '22023';
  end if;
  -- Un fuseau inconnu ne doit pas priver de classement : Paris par défaut.
  begin
    perform now() at time zone v_fuseau;
  exception when others then
    v_fuseau := 'Europe/Paris';
  end;
  v_debut := p_depuis::timestamp at time zone v_fuseau;
  v_fin := (p_depuis + v_jours)::timestamp at time zone v_fuseau;
  return query
  with membres as (
    select v_moi as uid
    union
    select a.ami from public.amities a where a.utilisateur = v_moi
  ),
  seances as (
    select s.user_id,
           -- Rattachée au jour de son début, comme dans les statistiques.
           (s.debut at time zone v_fuseau)::date - p_depuis as jour,
           least(v_plafond, greatest(0, floor(extract(epoch from s.fin - s.debut))::bigint - s.pause_secondes)) as sec
    from public.sessions s
    join membres m on m.uid = s.user_id
    where s.fin is not null and s.debut >= v_debut and s.debut < v_fin
  )
  select m.uid,
         m.uid = v_moi,
         p.pseudo,
         coalesce(p.nom_hameau, 'Mon hameau'),
         coalesce(p.apparence, '{}'::jsonb),
         coalesce(p.niveau, 1)::integer,
         coalesce((select sum(x.sec) from seances x where x.user_id = m.uid), 0)::bigint,
         (select count(*) from seances x where x.user_id = m.uid)::integer,
         array(
           select floor(coalesce((select sum(x.sec) from seances x where x.user_id = m.uid and x.jour = g.j), 0) / 60)::integer
           from generate_series(0, v_jours - 1) as g(j)
           order by g.j
         ),
         o.debut,
         o.pause_secondes,
         o.pause_depuis,
         (select count(*) from public.constructions c where c.user_id = m.uid)::integer
  from membres m
  left join public.profils p on p.user_id = m.uid
  left join public.sessions o on o.user_id = m.uid and o.fin is null;
end;
$$;

-- Supabase accorde d'office l'exécution des nouvelles fonctions à anon : on
-- la retire nommément. Rien de tout ceci n'a de sens sans compte.
revoke all on function public.hameau_code_aleatoire() from public, anon;
revoke all on function public.hameau_mon_code() from public, anon;
revoke all on function public.hameau_nouveau_code() from public, anon;
revoke all on function public.hameau_ajouter_ami(text) from public, anon;
revoke all on function public.hameau_retirer_ami(uuid) from public, anon;
revoke all on function public.hameau_classement(date, integer, text, integer) from public, anon;
grant execute on function public.hameau_code_aleatoire() to authenticated;
grant execute on function public.hameau_mon_code() to authenticated;
grant execute on function public.hameau_nouveau_code() to authenticated;
grant execute on function public.hameau_ajouter_ami(text) to authenticated;
grant execute on function public.hameau_retirer_ami(uuid) to authenticated;
grant execute on function public.hameau_classement(date, integer, text, integer) to authenticated;

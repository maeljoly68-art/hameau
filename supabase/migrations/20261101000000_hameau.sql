-- Hameau : sessions de travail et constructions du village.
-- Rejouable : chaque instruction tolère d'avoir déjà été appliquée.

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Heure du SERVEUR par défaut : deux appareils aux horloges décalées
  -- afficheraient sinon deux chronos différents pour la même session.
  debut timestamptz not null default now(),
  fin timestamptz,
  description text not null default '',
  categorie text not null default '',
  appareil text not null default '',
  constraint sessions_fin_apres_debut check (fin is null or fin >= debut)
);

-- Une seule session ouverte par personne : lancer depuis l'iPad pendant que
-- le PC tourne doit retrouver la session existante, pas en créer une seconde.
create unique index if not exists sessions_une_ouverte on public.sessions (user_id) where fin is null;
create index if not exists sessions_par_debut on public.sessions (user_id, debut desc);

create table if not exists public.constructions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  batiment text not null,
  x integer not null check (x >= 0),
  y integer not null check (y >= 0),
  cout integer not null check (cout >= 0),
  construit_le timestamptz not null default now()
);

-- Deux appareils qui posent un bâtiment sur la même case au même moment :
-- la base tranche, pas l'interface.
create unique index if not exists constructions_une_par_case on public.constructions (user_id, x, y);

-- Jeton personnel des raccourcis iPhone/iPad. Seule son empreinte est gardée :
-- une fuite de la table ne donne pas de quoi piloter le compte.
create table if not exists public.jetons_raccourci (
  user_id uuid primary key references auth.users (id) on delete cascade,
  empreinte text not null unique,
  cree_le timestamptz not null default now()
);

alter table public.sessions enable row level security;
alter table public.constructions enable row level security;
alter table public.jetons_raccourci enable row level security;

drop policy if exists sessions_proprietaire on public.sessions;
create policy sessions_proprietaire on public.sessions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists constructions_proprietaire on public.constructions;
create policy constructions_proprietaire on public.constructions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Aucune politique sur jetons_raccourci : on n'y accède que par les
-- fonctions ci-dessous, jamais directement.

-- Crée (ou remplace) le jeton du compte connecté et le rend en clair, une fois.
create or replace function public.hameau_nouveau_jeton()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jeton text;
begin
  if auth.uid() is null then
    raise exception 'connexion requise' using errcode = '28000';
  end if;
  -- Deux UUID v4 : 244 bits aléatoires, sans dépendre de pgcrypto.
  v_jeton := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.jetons_raccourci (user_id, empreinte)
  values (auth.uid(), encode(sha256(convert_to(v_jeton, 'UTF8')), 'hex'))
  on conflict (user_id) do update set empreinte = excluded.empreinte, cree_le = now();
  return v_jeton;
end;
$$;

-- Point d'entrée des Raccourcis Apple : un seul appel HTTP, sans session de
-- connexion (un jeton d'accès Supabase expire au bout d'une heure, un
-- raccourci ne sait pas le rafraîchir).
-- p_action : 'demarrer', 'arreter', 'basculer' ou 'etat'.
create or replace function public.hameau_raccourci(
  p_jeton text,
  p_action text,
  p_description text default '',
  p_categorie text default ''
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_session public.sessions;
  v_action text := lower(coalesce(p_action, ''));
begin
  select user_id into v_user from public.jetons_raccourci
  where empreinte = encode(sha256(convert_to(coalesce(p_jeton, ''), 'UTF8')), 'hex');
  if v_user is null then
    raise exception 'jeton inconnu' using errcode = '28000';
  end if;

  select * into v_session from public.sessions where user_id = v_user and fin is null;

  if v_action = 'basculer' then
    v_action := case when v_session.id is null then 'demarrer' else 'arreter' end;
  end if;

  if v_action = 'demarrer' then
    if v_session.id is null then
      insert into public.sessions (user_id, categorie, appareil)
      values (v_user, left(coalesce(p_categorie, ''), 80), 'Raccourci')
      returning * into v_session;
      return json_build_object('etat', 'en_cours', 'debut', v_session.debut,
        'message', 'Session lancée. Bon courage !');
    end if;
    return json_build_object('etat', 'en_cours', 'debut', v_session.debut,
      'message', 'Une session tourne déjà depuis ' || floor(extract(epoch from now() - v_session.debut) / 60) || ' min.');
  elsif v_action = 'arreter' then
    if v_session.id is null then
      return json_build_object('etat', 'aucune', 'message', 'Aucune session en cours.');
    end if;
    update public.sessions
    set fin = now(),
        description = left(coalesce(p_description, ''), 2000),
        categorie = case when coalesce(p_categorie, '') = '' then categorie else left(p_categorie, 80) end
    where id = v_session.id
    returning * into v_session;
    return json_build_object('etat', 'terminee', 'debut', v_session.debut, 'fin', v_session.fin,
      'minutes', floor(extract(epoch from v_session.fin - v_session.debut) / 60),
      'message', 'Session de ' || floor(extract(epoch from v_session.fin - v_session.debut) / 60) || ' min enregistrée.');
  elsif v_action = 'etat' then
    if v_session.id is null then
      return json_build_object('etat', 'aucune', 'message', 'Pas de session en cours.');
    end if;
    return json_build_object('etat', 'en_cours', 'debut', v_session.debut,
      'minutes', floor(extract(epoch from now() - v_session.debut) / 60),
      'message', 'En session depuis ' || floor(extract(epoch from now() - v_session.debut) / 60) || ' min.');
  end if;
  raise exception 'action inconnue : %', p_action using errcode = '22023';
end;
$$;

revoke all on function public.hameau_nouveau_jeton() from public;
revoke all on function public.hameau_raccourci(text, text, text, text) from public;
grant execute on function public.hameau_nouveau_jeton() to authenticated;
-- anon : le raccourci appelle sans être connecté ; le jeton fait office d'identité.
grant execute on function public.hameau_raccourci(text, text, text, text) to anon, authenticated;

-- Temps réel : sans ça, le chrono lancé sur le téléphone n'apparaît sur le PC
-- qu'au prochain rechargement.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions') then
      alter publication supabase_realtime add table public.sessions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'constructions') then
      alter publication supabase_realtime add table public.constructions;
    end if;
  end if;
end;
$$;

-- ================================================================
-- À COLLER DANS SUPABASE (projet hameau) — SQL Editor, puis « Run ».
-- Fichier ENGENDRÉ par scripts/fichier-a-coller.sh : ne pas le modifier
-- à la main, modifier les migrations puis relancer le script.
-- Rejouable : le relancer sur une base à jour ne change rien.
-- ================================================================

-- ── 20261101000000_hameau.sql ──
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

-- Supabase accorde d'office l'exécution des nouvelles fonctions à anon : le
-- « from public » ne suffit pas, il faut le retirer nommément.
revoke all on function public.hameau_nouveau_jeton() from public, anon;
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

-- ── 20261102000000_objectifs_profil.sql ──
-- Objectif de session, profil (nom du hameau, objectif quotidien) et raccourci
-- qui accepte un objectif. Additive et rejouable : aucune donnée n'est touchée.

alter table public.sessions
  add column if not exists objectif_minutes integer
  check (objectif_minutes is null or (objectif_minutes > 0 and objectif_minutes <= 600));

create table if not exists public.profils (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nom_hameau text not null default 'Mon hameau' check (char_length(nom_hameau) between 1 and 40),
  objectif_jour integer not null default 120 check (objectif_jour between 5 and 960),
  maj_le timestamptz not null default now()
);

alter table public.profils enable row level security;

drop policy if exists profils_proprietaire on public.profils;
create policy profils_proprietaire on public.profils
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- L'ancienne signature à 4 paramètres doit disparaître : en la gardant à côté
-- de la nouvelle, un appel sans p_objectif serait ambigu et PostgREST le
-- refuserait — tous les raccourcis existants cesseraient de marcher.
drop function if exists public.hameau_raccourci(text, text, text, text);

create or replace function public.hameau_raccourci(
  p_jeton text,
  p_action text,
  p_description text default '',
  p_categorie text default '',
  p_objectif integer default null
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
  v_objectif integer := case when p_objectif between 1 and 600 then p_objectif end;
  v_minutes integer;
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
      insert into public.sessions (user_id, categorie, appareil, objectif_minutes)
      values (v_user, left(coalesce(p_categorie, ''), 80), 'Raccourci', v_objectif)
      returning * into v_session;
      return json_build_object('etat', 'en_cours', 'debut', v_session.debut, 'objectif', v_session.objectif_minutes,
        'message', 'Session lancée' || coalesce(' (objectif ' || v_objectif || ' min)', '') || '. Bon courage !');
    end if;
    v_minutes := floor(extract(epoch from now() - v_session.debut) / 60);
    return json_build_object('etat', 'en_cours', 'debut', v_session.debut, 'objectif', v_session.objectif_minutes,
      'message', 'Une session tourne déjà depuis ' || v_minutes || ' min.');
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
    v_minutes := floor(extract(epoch from v_session.fin - v_session.debut) / 60);
    return json_build_object('etat', 'terminee', 'debut', v_session.debut, 'fin', v_session.fin, 'minutes', v_minutes,
      'message', 'Session de ' || v_minutes || ' min enregistrée.');
  elsif v_action = 'etat' then
    if v_session.id is null then
      return json_build_object('etat', 'aucune', 'message', 'Pas de session en cours.');
    end if;
    v_minutes := floor(extract(epoch from now() - v_session.debut) / 60);
    return json_build_object('etat', 'en_cours', 'debut', v_session.debut, 'minutes', v_minutes, 'objectif', v_session.objectif_minutes,
      'message', 'En session depuis ' || v_minutes || ' min' ||
        coalesce(case when v_minutes >= v_session.objectif_minutes then ' — objectif de ' || v_session.objectif_minutes || ' min atteint !'
                      else ', encore ' || (v_session.objectif_minutes - v_minutes) || ' min avant l''objectif.' end, '.'));
  end if;
  raise exception 'action inconnue : %', p_action using errcode = '22023';
end;
$$;

revoke all on function public.hameau_raccourci(text, text, text, text, integer) from public;
grant execute on function public.hameau_raccourci(text, text, text, text, integer) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profils') then
    alter publication supabase_realtime add table public.profils;
  end if;
end;
$$;

-- ── 20261103000000_pauses.sql ──
-- Pauses : une session peut s'interrompre sans s'arrêter. Additive et
-- rejouable, sans aucune instruction de suppression : rien de ce qui existe
-- n'est retiré.

alter table public.sessions add column if not exists pause_secondes integer not null default 0 check (pause_secondes >= 0);
alter table public.sessions add column if not exists pause_depuis timestamptz;

-- Une session close n'est jamais « en pause », et une pause ne commence pas
-- avant la session.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_pause_coherente' and conrelid = 'public.sessions'::regclass) then
    alter table public.sessions add constraint sessions_pause_coherente
      check ((fin is null or pause_depuis is null) and (pause_depuis is null or pause_depuis >= debut));
  end if;
end;
$$;

-- Clore une session pendant sa pause arrête la pause à la fin, quel que soit
-- le chemin (l'app, un raccourci, une correction dans l'historique). Placé en
-- base pour que chaque client n'ait pas à y penser.
create or replace function public.hameau_clore_pause()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.fin is not null then
    if new.pause_depuis is not null then
      new.pause_secondes := new.pause_secondes + greatest(0, floor(extract(epoch from new.fin - new.pause_depuis)))::integer;
      new.pause_depuis := null;
    end if;
    -- Le cumul ne dépasse jamais la durée totale : une fin corrigée plus tôt
    -- ne doit pas donner une durée négative.
    new.pause_secondes := least(new.pause_secondes, greatest(0, floor(extract(epoch from new.fin - new.debut)))::integer);
  end if;
  return new;
end;
$$;

create or replace trigger sessions_clore_pause
  before insert or update on public.sessions
  for each row execute function public.hameau_clore_pause();

-- Pause et reprise à l'heure du SERVEUR : deux appareils aux horloges
-- décalées ne doivent pas se disputer la durée d'une pause. SECURITY INVOKER :
-- les politiques RLS s'appliquent, chacun ne touche que ses sessions.
create or replace function public.hameau_pause(p_session uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.sessions set pause_depuis = now()
  where id = p_session and fin is null and pause_depuis is null;
$$;

create or replace function public.hameau_reprise(p_session uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.sessions
  set pause_secondes = pause_secondes + greatest(0, floor(extract(epoch from now() - pause_depuis)))::integer,
      pause_depuis = null
  where id = p_session and fin is null and pause_depuis is not null;
$$;

revoke all on function public.hameau_pause(uuid) from public, anon;
revoke all on function public.hameau_reprise(uuid) from public, anon;
grant execute on function public.hameau_pause(uuid) to authenticated;
grant execute on function public.hameau_reprise(uuid) to authenticated;

-- Le raccourci sait mettre en pause et reprendre, et ses durées déduisent
-- les pauses. Même signature qu'avant : les raccourcis existants marchent.
create or replace function public.hameau_raccourci(
  p_jeton text,
  p_action text,
  p_description text default '',
  p_categorie text default '',
  p_objectif integer default null
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
  v_objectif integer := case when p_objectif between 1 and 600 then p_objectif end;
  v_minutes integer;
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

  -- Minutes de travail de la session ouverte : pauses terminées et pause en
  -- cours déduites.
  if v_session.id is not null then
    v_minutes := floor(greatest(0, extract(epoch from now() - v_session.debut) - v_session.pause_secondes
      - coalesce(extract(epoch from now() - v_session.pause_depuis), 0)) / 60);
  end if;

  if v_action = 'demarrer' then
    if v_session.id is null then
      insert into public.sessions (user_id, categorie, appareil, objectif_minutes)
      values (v_user, left(coalesce(p_categorie, ''), 80), 'Raccourci', v_objectif)
      returning * into v_session;
      return json_build_object('etat', 'en_cours', 'debut', v_session.debut, 'objectif', v_session.objectif_minutes,
        'message', 'Session lancée' || coalesce(' (objectif ' || v_objectif || ' min)', '') || '. Bon courage !');
    end if;
    return json_build_object('etat', case when v_session.pause_depuis is null then 'en_cours' else 'en_pause' end,
      'debut', v_session.debut, 'objectif', v_session.objectif_minutes, 'minutes', v_minutes,
      'message', 'Une session tourne déjà : ' || v_minutes || ' min au compteur' || case when v_session.pause_depuis is null then '.' else ', en pause.' end);
  elsif v_action = 'pause' then
    if v_session.id is null then
      return json_build_object('etat', 'aucune', 'message', 'Aucune session en cours.');
    end if;
    if v_session.pause_depuis is not null then
      return json_build_object('etat', 'en_pause', 'minutes', v_minutes, 'message', 'Déjà en pause, ' || v_minutes || ' min au compteur.');
    end if;
    update public.sessions set pause_depuis = now() where id = v_session.id;
    return json_build_object('etat', 'en_pause', 'minutes', v_minutes, 'message', 'Pause après ' || v_minutes || ' min. Reprends quand tu veux.');
  elsif v_action = 'reprendre' then
    if v_session.id is null then
      return json_build_object('etat', 'aucune', 'message', 'Aucune session en cours.');
    end if;
    if v_session.pause_depuis is null then
      return json_build_object('etat', 'en_cours', 'minutes', v_minutes, 'message', 'La session n''était pas en pause.');
    end if;
    update public.sessions
    set pause_secondes = pause_secondes + greatest(0, floor(extract(epoch from now() - pause_depuis)))::integer,
        pause_depuis = null
    where id = v_session.id;
    return json_build_object('etat', 'en_cours', 'minutes', v_minutes, 'message', 'C''est reparti ! ' || v_minutes || ' min au compteur.');
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
    v_minutes := floor(greatest(0, extract(epoch from v_session.fin - v_session.debut) - v_session.pause_secondes) / 60);
    return json_build_object('etat', 'terminee', 'debut', v_session.debut, 'fin', v_session.fin, 'minutes', v_minutes,
      'message', 'Session de ' || v_minutes || ' min enregistrée.');
  elsif v_action = 'etat' then
    if v_session.id is null then
      return json_build_object('etat', 'aucune', 'message', 'Pas de session en cours.');
    end if;
    if v_session.pause_depuis is not null then
      return json_build_object('etat', 'en_pause', 'debut', v_session.debut, 'minutes', v_minutes, 'objectif', v_session.objectif_minutes,
        'message', 'En pause, ' || v_minutes || ' min de travail au compteur.');
    end if;
    return json_build_object('etat', 'en_cours', 'debut', v_session.debut, 'minutes', v_minutes, 'objectif', v_session.objectif_minutes,
      'message', 'En session depuis ' || v_minutes || ' min' ||
        coalesce(case when v_minutes >= v_session.objectif_minutes then ' — objectif de ' || v_session.objectif_minutes || ' min atteint !'
                      else ', encore ' || (v_session.objectif_minutes - v_minutes) || ' min avant l''objectif.' end, '.'));
  end if;
  raise exception 'action inconnue : %', p_action using errcode = '22023';
end;
$$;

revoke all on function public.hameau_raccourci(text, text, text, text, integer) from public;
grant execute on function public.hameau_raccourci(text, text, text, text, integer) to anon, authenticated;

-- ── 20261104000000_amis_ameliorations.sql ──
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

-- ── 20261105000000_cours.sql ──
-- Cours, chapitres, notes et temps disponible pour l'étude. Additive et
-- rejouable : rien de ce qui existe n'est retiré.

-- ── Cours : un par matière, avec la date de son partiel ──
create table if not exists public.cours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titre text not null check (char_length(btrim(titre)) between 1 and 120),
  couleur text not null default '#6b8afd' check (couleur ~ '^#[0-9a-fA-F]{6}$'),
  partiel date,
  -- Adresse de l'artefact d'origine : https seulement, un « javascript: » collé là finirait dans un lien.
  lien text check (lien is null or (lien ~ '^https://[^[:space:]]+$' and char_length(lien) <= 500)),
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  -- Cible de la clé composite des chapitres : voir plus bas.
  constraint cours_id_user unique (id, user_id)
);
create index if not exists cours_par_ordre on public.cours (user_id, ordre);

-- ── Chapitres : l'unité qu'on apprend, avec où elle en est dans le cycle ──
create table if not exists public.chapitres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cours_id uuid not null,
  titre text not null check (char_length(btrim(titre)) between 1 and 120),
  ordre integer not null default 0,
  duree_min integer not null default 20 check (duree_min between 5 and 240),
  -- 0 = à découvrir, puis un cran par révision réussie (l'échelle est dans l'application).
  niveau smallint not null default 0 check (niveau between 0 and 6),
  derniere_revision date,
  prochaine_revision date,
  lien text check (lien is null or (lien ~ '^https://[^[:space:]]+$' and char_length(lien) <= 500)),
  maj_le timestamptz not null default now(),
  -- Le cours ET le chapitre sont du même compte. Avec une clé étrangère simple, quelqu'un pourrait
  -- rattacher SON chapitre à l'identifiant d'un cours d'autrui : invisible pour l'autre (la RLS le
  -- cache), mais une donnée incohérente dans la base.
  constraint chapitres_cours_du_meme_compte foreign key (cours_id, user_id) references public.cours (id, user_id) on delete cascade,
  constraint chapitres_id_user unique (id, user_id)
);
create index if not exists chapitres_par_cours on public.chapitres (user_id, cours_id, ordre);

-- ── Notes : les annotations de chapitre ──
create table if not exists public.notes_chapitres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapitre_id uuid not null,
  texte text not null check (char_length(btrim(texte)) between 1 and 4000),
  -- Le passage annoté, quand la note porte sur un extrait précis.
  citation text check (citation is null or char_length(citation) <= 1000),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint notes_chapitre_du_meme_compte foreign key (chapitre_id, user_id) references public.chapitres (id, user_id) on delete cascade
);
create index if not exists notes_par_chapitre on public.notes_chapitres (user_id, chapitre_id, cree_le);

-- ── Temps disponible : à part du profil, pour que le profil (tenue, pseudo…) ne dépende pas de cette migration ──
create table if not exists public.reglages_cours (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- { "semaine": [minutes du lundi … du dimanche], "libres": ["AAAA-MM-JJ", …] } ; l'application en valide le détail.
  disponibilites jsonb not null default '{}'::jsonb check (jsonb_typeof(disponibilites) = 'object' and pg_column_size(disponibilites) <= 8192),
  maj_le timestamptz not null default now()
);

-- La date de dernière modification se tient à jour toute seule, quel que soit le client.
create or replace function public.hameau_maj_le()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.maj_le := now();
  return new;
end;
$$;

create or replace trigger chapitres_maj_le before update on public.chapitres for each row execute function public.hameau_maj_le();
create or replace trigger notes_chapitres_maj_le before update on public.notes_chapitres for each row execute function public.hameau_maj_le();
create or replace trigger reglages_cours_maj_le before update on public.reglages_cours for each row execute function public.hameau_maj_le();

-- ── Chacun ne voit et n'écrit que les siens ──
alter table public.cours enable row level security;
alter table public.chapitres enable row level security;
alter table public.notes_chapitres enable row level security;
alter table public.reglages_cours enable row level security;

drop policy if exists cours_proprietaire on public.cours;
create policy cours_proprietaire on public.cours
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists chapitres_proprietaire on public.chapitres;
create policy chapitres_proprietaire on public.chapitres
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notes_chapitres_proprietaire on public.notes_chapitres;
create policy notes_chapitres_proprietaire on public.notes_chapitres
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists reglages_cours_proprietaire on public.reglages_cours;
create policy reglages_cours_proprietaire on public.reglages_cours
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Temps réel : une note ou un chapitre noté sur le téléphone apparaît sur le PC sans recharger.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['cours', 'chapitres', 'notes_chapitres', 'reglages_cours'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- ── 20261106000000_agenda.sql ──
-- Emploi du temps de l'université. Additive et rejouable : rien de ce qui existe n'est retiré.
--
-- · l'adresse du flux iCalendar : c'est un SECRET (quiconque la connaît lit l'emploi du temps), donc
--   dans la ligne de réglages du compte, que la RLS réserve à son propriétaire. https seulement : un
--   « javascript: » collé là finirait dans une requête.
-- · pour chaque cours, les mots qui rattachent les créneaux du flux à ce cours.
alter table public.reglages_cours
  add column if not exists agenda_url text
  check (agenda_url is null or (agenda_url ~ '^https://[^[:space:]]+$' and char_length(agenda_url) <= 500));

alter table public.cours
  add column if not exists motifs text not null default ''
  check (char_length(motifs) <= 300);

-- ── 20261107000000_cours_en_pause.sql ──
-- Cours en pause. Additive et rejouable : rien de ce qui existe n'est retiré.
--
-- Un cours en pause reste dans la liste, avec ses chapitres, ses notes et sa progression, mais sort du
-- calendrier : ni séance, ni alerte, ni partiel affiché. C'est un état du cours, pas une suppression.
alter table public.cours
  add column if not exists en_pause boolean not null default false;

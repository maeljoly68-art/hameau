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

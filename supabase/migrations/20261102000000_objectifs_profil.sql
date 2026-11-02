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

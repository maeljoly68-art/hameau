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

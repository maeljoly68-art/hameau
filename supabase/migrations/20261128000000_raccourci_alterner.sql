-- Les widgets du chrono (iPhone et Windows) : un seul bouton à toucher. L'action « alterner » du raccourci lance une
-- session s'il n'y en a pas, met en pause celle qui tourne, reprend celle qui est en pause. Elle n'arrête JAMAIS :
-- terminer reste « arreter », un autre bouton, pour qu'un toucher de trop ne close pas une session au milieu.
-- Rejouable : la fonction est remplacée à l'identique de 20261126 (secondes), cette action en plus.

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
  v_secondes integer;
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
  -- « alterner » se résout ici en l'action qu'il remplace : ses réponses sont celles de demarrer, pause et reprendre.
  if v_action = 'alterner' then
    v_action := case when v_session.id is null then 'demarrer'
                     when v_session.pause_depuis is null then 'pause'
                     else 'reprendre' end;
  end if;

  -- Minutes de travail de la session ouverte : pauses terminées et pause en
  -- cours déduites.
  if v_session.id is not null then
    v_secondes := floor(greatest(0, extract(epoch from now() - v_session.debut) - v_session.pause_secondes
      - coalesce(extract(epoch from now() - v_session.pause_depuis), 0)));
    v_minutes := v_secondes / 60;
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
      return json_build_object('etat', 'en_pause', 'debut', v_session.debut, 'minutes', v_minutes, 'secondes', v_secondes, 'objectif', v_session.objectif_minutes,
        'message', 'En pause, ' || v_minutes || ' min de travail au compteur.');
    end if;
    -- « depuis » : l'heure où le chrono aurait démarré sans ses pauses. Un widget qui compte à partir de là affiche le
    -- temps de travail à la seconde, sans redemander l'état à chaque instant.
    return json_build_object('etat', 'en_cours', 'debut', v_session.debut, 'minutes', v_minutes, 'secondes', v_secondes,
      'depuis', now() - make_interval(secs => v_secondes), 'objectif', v_session.objectif_minutes,
      'message', 'En session depuis ' || v_minutes || ' min' ||
        coalesce(case when v_minutes >= v_session.objectif_minutes then ' — objectif de ' || v_session.objectif_minutes || ' min atteint !'
                      else ', encore ' || (v_session.objectif_minutes - v_minutes) || ' min avant l''objectif.' end, '.'));
  end if;
  raise exception 'action inconnue : %', p_action using errcode = '22023';
end;
$$;

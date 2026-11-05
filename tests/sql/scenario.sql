-- Scénario joué après la migration, sur la base simulée. Chaque bloc lève
-- une exception si le comportement attendu n'est pas là.
\set ON_ERROR_STOP 1
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');

set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false) \gset

-- Une seule session ouverte par personne.
insert into public.sessions (categorie) values ('Code');
do $$ begin
  insert into public.sessions (categorie) values ('Doublon');
  raise exception 'ÉCHEC : deux sessions ouvertes acceptées';
exception when unique_violation then null; end $$;

-- La fin ne peut pas précéder le début.
do $$ begin
  update public.sessions set fin = debut - interval '1 minute' where fin is null;
  raise exception 'ÉCHEC : fin avant début acceptée';
exception when check_violation then null; end $$;

-- Une case, un bâtiment.
insert into public.constructions (batiment, x, y, cout) values ('arbre', 0, 0, 15);
do $$ begin
  insert into public.constructions (batiment, x, y, cout) values ('puits', 0, 0, 60);
  raise exception 'ÉCHEC : deux bâtiments sur la même case';
exception when unique_violation then null; end $$;

-- Jeton de raccourci.
select public.hameau_nouveau_jeton() as jeton \gset
select set_config('test.jeton', :'jeton', false) \gset

-- L'autre compte ne voit rien du premier (RLS).
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false) \gset
do $$ begin
  if (select count(*) from public.sessions) <> 0 then raise exception 'ÉCHEC : RLS sessions'; end if;
  if (select count(*) from public.constructions) <> 0 then raise exception 'ÉCHEC : RLS constructions'; end if;
end $$;
-- Ni ne peut écrire pour lui.
do $$ begin
  insert into public.sessions (user_id) values ('11111111-1111-1111-1111-111111111111');
  raise exception 'ÉCHEC : écriture pour un autre compte';
exception when insufficient_privilege then null; end $$;
-- Ni lire les jetons.
do $$ begin
  perform * from public.jetons_raccourci;
  if found then raise exception 'ÉCHEC : jetons lisibles'; end if;
end $$;

-- Le raccourci, sans connexion.
reset role;
set role anon;
select set_config('test.uid', '', false) \gset
do $$ begin
  perform public.hameau_raccourci('mauvais', 'etat');
  raise exception 'ÉCHEC : jeton inconnu accepté';
exception when invalid_authorization_specification then null; end $$;

select public.hameau_raccourci(:'jeton', 'etat')->>'etat' as e \gset
select :'e' = 'en_cours' as ok \gset
\if :ok \else \echo 'ÉCHEC : etat' \quit 3 \endif

select public.hameau_raccourci(:'jeton', 'demarrer')->>'etat' as e \gset
select :'e' = 'en_cours' as ok \gset
\if :ok \else \echo 'ÉCHEC : demarrer sur session ouverte' \quit 3 \endif

select public.hameau_raccourci(:'jeton', 'basculer', 'Chapitre 3 relu', 'Lecture')->>'etat' as e \gset
select :'e' = 'terminee' as ok \gset
\if :ok \else \echo 'ÉCHEC : basculer -> arreter' \quit 3 \endif

select public.hameau_raccourci(:'jeton', 'arreter')->>'etat' as e \gset
select :'e' = 'aucune' as ok \gset
\if :ok \else \echo 'ÉCHEC : arreter sans session' \quit 3 \endif

select public.hameau_raccourci(:'jeton', 'basculer', '', 'Sport')->>'etat' as e \gset
select :'e' = 'en_cours' as ok \gset
\if :ok \else \echo 'ÉCHEC : basculer -> demarrer' \quit 3 \endif

do $$ begin
  perform public.hameau_raccourci(current_setting('test.jeton'), 'danser');
  raise exception 'ÉCHEC : action inconnue acceptée';
exception when invalid_parameter_value then null; end $$;

-- anon ne peut pas fabriquer de jeton.
do $$ begin
  perform public.hameau_nouveau_jeton();
  raise exception 'ÉCHEC : anon exécute hameau_nouveau_jeton';
exception when insufficient_privilege then null; end $$;

-- anon ne lit pas les tables directement.
do $$ begin
  perform * from public.sessions;
  if found then raise exception 'ÉCHEC : anon lit les sessions'; end if;
end $$;
reset role;

do $$ begin
  if (select description from public.sessions where categorie = 'Lecture') <> 'Chapitre 3 relu' then
    raise exception 'ÉCHEC : description du raccourci perdue';
  end if;
  if (select count(*) from public.sessions where fin is null) <> 1 then
    raise exception 'ÉCHEC : session relancée absente';
  end if;
  if (select appareil from public.sessions where fin is null) <> 'Raccourci' then
    raise exception 'ÉCHEC : appareil';
  end if;
end $$;

-- Migration 2 : une seule signature du raccourci, sinon les appels sans
-- p_objectif deviennent ambigus.
do $$ begin
  if (select count(*) from pg_proc where proname = 'hameau_raccourci') <> 1 then
    raise exception 'ÉCHEC : plusieurs signatures de hameau_raccourci';
  end if;
end $$;

-- Objectif de session : borné, et transmis par le raccourci.
do $$ begin
  update public.sessions set objectif_minutes = 0 where fin is null;
  raise exception 'ÉCHEC : objectif de 0 minute accepté';
exception when check_violation then null; end $$;

set role anon;
select public.hameau_raccourci(current_setting('test.jeton'), 'arreter') \gset ignore_
select public.hameau_raccourci(current_setting('test.jeton'), 'demarrer', '', 'Code', 50)->>'objectif' as o \gset
select :'o' = '50' as ok \gset
\if :ok \else \echo 'ÉCHEC : objectif du raccourci' \quit 3 \endif
select public.hameau_raccourci(current_setting('test.jeton'), 'etat')->>'message' as m \gset
select :'m' like '%avant l''objectif%' as ok \gset
\if :ok \else \echo 'ÉCHEC : message d''état avec objectif' \quit 3 \endif
-- Un objectif absurde est ignoré plutôt que de faire échouer le raccourci.
select public.hameau_raccourci(current_setting('test.jeton'), 'arreter') \gset ignore_
select public.hameau_raccourci(current_setting('test.jeton'), 'demarrer', '', '', 5000)->>'etat' as e \gset
select :'e' = 'en_cours' as ok \gset
\if :ok \else \echo 'ÉCHEC : objectif absurde' \quit 3 \endif
-- Les anciens appels à 4 paramètres marchent toujours.
select public.hameau_raccourci(current_setting('test.jeton'), 'arreter', 'fin', 'Code')->>'etat' as e \gset
select :'e' = 'terminee' as ok \gset
\if :ok \else \echo 'ÉCHEC : appel sans p_objectif' \quit 3 \endif
reset role;

-- Profils : chacun le sien.
set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false) \gset
insert into public.profils (nom_hameau, objectif_jour) values ('Bourg', 90);
do $$ begin
  update public.profils set objectif_jour = 0;
  raise exception 'ÉCHEC : objectif quotidien de 0 accepté';
exception when check_violation then null; end $$;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false) \gset
do $$ begin
  if (select count(*) from public.profils) <> 0 then raise exception 'ÉCHEC : RLS profils'; end if;
end $$;
reset role;

-- Migration 3 : pauses, déduites et closes avec la session.
set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false) \gset
insert into public.sessions (categorie, debut) values ('Pause', now() - interval '60 minutes') returning id as sid \gset
select set_config('test.sid', :'sid', false) \gset
select public.hameau_pause(:'sid') \gset ignore_
do $$ begin
  if (select pause_depuis from public.sessions where id = current_setting('test.sid')::uuid) is null then
    raise exception 'ÉCHEC : hameau_pause sans effet';
  end if;
end $$;
-- Une deuxième pause ne repousse pas la première.
update public.sessions set pause_depuis = now() - interval '20 minutes' where id = :'sid';
select public.hameau_pause(:'sid') \gset ignore_
select public.hameau_reprise(:'sid') \gset ignore_
do $$ declare v int; begin
  select pause_secondes into v from public.sessions where id = current_setting('test.sid')::uuid;
  if v not between 1195 and 1205 then raise exception 'ÉCHEC : reprise, pause de % s au lieu de 1200', v; end if;
  if (select pause_depuis from public.sessions where id = current_setting('test.sid')::uuid) is not null then
    raise exception 'ÉCHEC : reprise sans effacer la pause';
  end if;
end $$;
-- Une pause ne commence pas avant la session.
do $$ begin
  update public.sessions set pause_depuis = debut - interval '1 minute' where id = current_setting('test.sid')::uuid;
  raise exception 'ÉCHEC : pause antérieure au début acceptée';
exception when check_violation then null; end $$;
-- Terminer pendant une pause : la pause s'arrête à la fin.
update public.sessions set pause_depuis = now() - interval '5 minutes' where id = :'sid';
update public.sessions set fin = now() where id = :'sid';
do $$ declare v int; begin
  select pause_secondes into v from public.sessions where id = current_setting('test.sid')::uuid;
  if v not between 1495 and 1505 then raise exception 'ÉCHEC : clôture en pause, % s au lieu de 1500', v; end if;
  if (select pause_depuis from public.sessions where id = current_setting('test.sid')::uuid) is not null then
    raise exception 'ÉCHEC : session close restée en pause';
  end if;
end $$;
-- Le cumul ne dépasse jamais la durée : une fin corrigée plus tôt le borne.
update public.sessions set fin = debut + interval '10 minutes' where id = :'sid';
do $$ begin
  if (select pause_secondes from public.sessions where id = current_setting('test.sid')::uuid) <> 600 then
    raise exception 'ÉCHEC : cumul de pause supérieur à la durée';
  end if;
end $$;
-- Un autre compte ne met pas en pause les sessions des autres.
insert into public.sessions (categorie) values ('Autre') returning id as sid2 \gset
select set_config('test.sid2', :'sid2', false) \gset
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false) \gset
select public.hameau_pause(:'sid2') \gset ignore_
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false) \gset
do $$ begin
  if (select pause_depuis from public.sessions where id = current_setting('test.sid2')::uuid) is not null then
    raise exception 'ÉCHEC : pause posée par un autre compte';
  end if;
end $$;
update public.sessions set fin = now() where id = :'sid2';
reset role;
set role anon;
do $$ begin
  perform public.hameau_pause(current_setting('test.sid2')::uuid);
  raise exception 'ÉCHEC : anon exécute hameau_pause';
exception when insufficient_privilege then null; end $$;
-- Le raccourci : pause, état, reprise, arrêt avec durée effective.
select public.hameau_raccourci(current_setting('test.jeton'), 'demarrer')->>'etat' as e \gset
reset role;
update public.sessions set debut = now() - interval '60 minutes', pause_secondes = 600 where fin is null and user_id = '11111111-1111-1111-1111-111111111111';
set role anon;
select public.hameau_raccourci(current_setting('test.jeton'), 'pause')->>'message' as m \gset
select :'m' like 'Pause après 50 min%' as ok \gset
\if :ok \else \echo 'ÉCHEC : raccourci pause' :'m' \quit 3 \endif
select public.hameau_raccourci(current_setting('test.jeton'), 'pause')->>'message' as m \gset
select :'m' like 'Déjà en pause%' as ok \gset
\if :ok \else \echo 'ÉCHEC : double pause par raccourci' \quit 3 \endif
select public.hameau_raccourci(current_setting('test.jeton'), 'etat')->>'etat' as e \gset
select :'e' = 'en_pause' as ok \gset
\if :ok \else \echo 'ÉCHEC : état en pause' \quit 3 \endif
select public.hameau_raccourci(current_setting('test.jeton'), 'reprendre')->>'etat' as e \gset
select :'e' = 'en_cours' as ok \gset
\if :ok \else \echo 'ÉCHEC : reprise par raccourci' \quit 3 \endif
select public.hameau_raccourci(current_setting('test.jeton'), 'arreter')->>'minutes' as mn \gset
select :'mn' = '50' as ok \gset
\if :ok \else \echo 'ÉCHEC : durée effective du raccourci' :'mn' \quit 3 \endif
reset role;

-- Migration 4 : niveaux des bâtiments.
set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false) \gset
insert into public.constructions (batiment, x, y, cout) values ('maison', 3, 3, 90) returning id as cid \gset
select set_config('test.cid', :'cid', false) \gset
do $$ begin
  if (select niveau from public.constructions where id = current_setting('test.cid')::uuid) <> 1 then raise exception 'ÉCHEC : niveau par défaut'; end if;
end $$;
-- Amélioration gardée par le niveau vu : la seconde, faite « en même temps », ne touche rien.
update public.constructions set niveau = 2, cout = cout + 72 where id = :'cid' and niveau = 1;
update public.constructions set niveau = 2, cout = cout + 72 where id = :'cid' and niveau = 1;
do $$ begin
  if (select cout from public.constructions where id = current_setting('test.cid')::uuid) <> 162 then raise exception 'ÉCHEC : palier payé deux fois'; end if;
  update public.constructions set niveau = 4 where id = current_setting('test.cid')::uuid;
  raise exception 'ÉCHEC : niveau 4 accepté';
exception when check_violation then null; end $$;

-- Amis : profil public, code, ajout, classement, retrait.
reset role;
insert into auth.users values ('33333333-3333-3333-3333-333333333333');
set role authenticated;
update public.profils set pseudo = 'Maël', niveau = 7, apparence = '{"chapeau":"paille"}' where user_id = auth.uid();
do $$ begin
  update public.profils set pseudo = repeat('x', 30) where user_id = auth.uid();
  raise exception 'ÉCHEC : pseudo de 30 caractères accepté';
exception when check_violation then null; end $$;
do $$ begin
  update public.profils set apparence = '[1, 2]' where user_id = auth.uid();
  raise exception 'ÉCHEC : apparence qui n''est pas un objet';
exception when check_violation then null; end $$;
select public.hameau_mon_code() as code1 \gset
select set_config('test.code1', :'code1', false) \gset
select :'code1' ~ '^[A-HJ-NP-Z2-9]{8}$' as ok \gset
\if :ok \else \echo 'ÉCHEC : forme du code' :'code1' \quit 3 \endif
select public.hameau_mon_code() = :'code1' as ok \gset
\if :ok \else \echo 'ÉCHEC : le code change à chaque appel' \quit 3 \endif
do $$ begin
  update public.profils set code_ami = 'ABCDEFG0' where user_id = auth.uid();
  raise exception 'ÉCHEC : code hors alphabet accepté';
exception when check_violation then null; end $$;
do $$ begin
  perform public.hameau_ajouter_ami(current_setting('test.code1'));
  raise exception 'ÉCHEC : s''ajouter soi-même';
exception when invalid_parameter_value then null; end $$;
-- Sessions à dates fixes (semaine du lundi 2 mars 2026) : 90 min, puis 6 h
-- plafonnées à 4 h, plus une avant la semaine, hors du compte. Deux autres
-- commencent entre minuit et 1 h à Paris, quand UTC est encore la veille :
-- elles comptent pour le jour de Paris, et la première ouvre la semaine.
insert into public.sessions (debut, fin, categorie) values
  ('2026-03-03 09:00+01', '2026-03-03 10:30+01', 'A'),
  ('2026-03-04 08:00+01', '2026-03-04 14:00+01', 'B'),
  ('2026-03-02 00:30+01', '2026-03-02 00:40+01', 'Lundi 0 h 30'),
  ('2026-03-05 00:30+01', '2026-03-05 00:50+01', 'Jeudi 0 h 30'),
  ('2026-03-01 23:00+01', '2026-03-01 23:50+01', 'Avant');

-- Le deuxième compte ajoute le premier, avec un code saisi en minuscules et tiret.
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false) \gset
select public.hameau_ajouter_ami(lower(substr(:'code1', 1, 4) || '-' || substr(:'code1', 5))) ->> 'pseudo' as ps \gset
select :'ps' = 'Maël' as ok \gset
\if :ok \else \echo 'ÉCHEC : ajout par code' :'ps' \quit 3 \endif
do $$ begin
  perform public.hameau_ajouter_ami('ZZZZ2222');
  raise exception 'ÉCHEC : code inconnu accepté';
exception when no_data_found then null; end $$;
-- 50 min dont 10 de pause, commencée dimanche soir à Paris : lundi à New York ? Non,
-- dimanche aussi (17 h 30). Celle de lundi 3 h à Paris est encore dimanche à New York.
insert into public.sessions (debut, fin, pause_secondes, categorie) values
  ('2026-03-02 23:30+01', '2026-03-03 00:20+01', 600, 'Nuit'),
  ('2026-03-09 03:00+01', '2026-03-09 03:30+01', 0, 'Lundi suivant à Paris');
insert into public.sessions (categorie) values ('En cours');
-- Ni lecture du profil de l'autre, ni amitié écrite à la main.
do $$ begin
  if (select count(*) from public.profils where user_id <> auth.uid()) <> 0 then raise exception 'ÉCHEC : profil d''un autre lisible'; end if;
  if (select count(*) from public.amities) <> 1 then raise exception 'ÉCHEC : amitiés lues, % au lieu de 1', (select count(*) from public.amities); end if;
end $$;
do $$ begin
  insert into public.amities (utilisateur, ami) values (auth.uid(), '33333333-3333-3333-3333-333333333333');
  raise exception 'ÉCHEC : amitié créée sans code';
exception when insufficient_privilege then null; end $$;

create temporary table classement_paris as select * from public.hameau_classement('2026-03-02', 7, 'Europe/Paris', 240);
do $$ declare r record; begin
  if (select count(*) from classement_paris) <> 2 then raise exception 'ÉCHEC : classement, % membres au lieu de 2', (select count(*) from classement_paris); end if;
  select * into r from classement_paris where not moi;
  if r.pseudo <> 'Maël' or r.niveau <> 7 or r.apparence->>'chapeau' <> 'paille' then raise exception 'ÉCHEC : vitrine de l''ami'; end if;
  if r.secondes <> 21600 then raise exception 'ÉCHEC : 10 + 90 min + 4 h plafonnées + 20 min = 21600 s, pas %', r.secondes; end if;
  if r.par_jour <> array[10, 90, 240, 20, 0, 0, 0] then raise exception 'ÉCHEC : minutes par jour %', r.par_jour; end if;
  if r.ouverte_debut is not null then raise exception 'ÉCHEC : session ouverte inventée'; end if;
  if r.batiments <> 2 then raise exception 'ÉCHEC : bâtiments %', r.batiments; end if;
  select * into r from classement_paris where moi;
  if r.secondes <> 2400 then raise exception 'ÉCHEC : pause déduite, 2400 s attendues, pas %', r.secondes; end if;
  if r.par_jour[1] <> 40 then raise exception 'ÉCHEC : session rattachée au jour de son début'; end if;
  if r.ouverte_debut is null then raise exception 'ÉCHEC : la session en cours ne se voit pas'; end if;
end $$;
drop table classement_paris;
-- Le fuseau découpe les jours : à New York, lundi 3 h de Paris est encore dimanche.
do $$ declare s bigint; begin
  select secondes into s from public.hameau_classement('2026-03-02', 7, 'America/New_York', 240) where moi;
  if s <> 2400 + 1800 then raise exception 'ÉCHEC : fuseau de New York, % s', s; end if;
  select secondes into s from public.hameau_classement('2026-03-02', 7, 'Mars/Olympus', 240) where moi;
  if s <> 2400 then raise exception 'ÉCHEC : fuseau inconnu, Paris attendu, % s', s; end if;
end $$;

-- Un compte sans amis ne voit que lui.
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', false) \gset
do $$ begin
  if (select count(*) from public.hameau_classement('2026-03-02', 7, 'Europe/Paris', 240)) <> 1 then raise exception 'ÉCHEC : un inconnu voit le classement des autres'; end if;
end $$;

-- Retirer un ami le retire des deux côtés ; un nouveau code périme l'ancien.
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false) \gset
select public.hameau_retirer_ami('22222222-2222-2222-2222-222222222222') \gset ignore_
select public.hameau_nouveau_code() <> :'code1' as ok \gset
\if :ok \else \echo 'ÉCHEC : nouveau code identique' \quit 3 \endif
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false) \gset
do $$ begin
  if (select count(*) from public.hameau_classement('2026-03-02', 7, 'Europe/Paris', 240)) <> 1 then raise exception 'ÉCHEC : ami retiré toujours visible'; end if;
  perform public.hameau_ajouter_ami(current_setting('test.code1'));
  raise exception 'ÉCHEC : l''ancien code marche encore';
exception when no_data_found then null; end $$;
reset role;

-- Sans compte, rien de tout cela.
set role anon;
do $$ begin
  perform public.hameau_classement('2026-03-02', 7, 'Europe/Paris', 240);
  raise exception 'ÉCHEC : anon exécute hameau_classement';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.hameau_mon_code();
  raise exception 'ÉCHEC : anon exécute hameau_mon_code';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.hameau_ajouter_ami('ABCD2345');
  raise exception 'ÉCHEC : anon exécute hameau_ajouter_ami';
exception when insufficient_privilege then null; end $$;
reset role;

-- Migration 5 : cours, chapitres, notes, temps disponible.
set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false) \gset
insert into public.cours (titre, partiel, lien, ordre) values ('Droit des sociétés', '2026-12-04', 'https://claude.ai/artifact/abc', 0) returning id as cid \gset
select set_config('test.cid', :'cid', false) \gset
insert into public.chapitres (cours_id, titre, ordre, duree_min) values (:'cid', 'Fiche 1 · Bases', 0, 20) returning id as hid \gset
select set_config('test.hid', :'hid', false) \gset
do $$ begin
  if (select niveau from public.chapitres where id = current_setting('test.hid')::uuid) <> 0 then raise exception 'ÉCHEC : niveau par défaut d''un chapitre'; end if;
end $$;

-- Formes refusées.
do $$ begin insert into public.cours (titre) values ('   '); raise exception 'ÉCHEC : titre de cours vide accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.cours (titre, couleur) values ('X', 'rouge'); raise exception 'ÉCHEC : couleur invalide acceptée'; exception when check_violation then null; end $$;
do $$ begin insert into public.cours (titre, lien) values ('X', 'http://exemple.fr'); raise exception 'ÉCHEC : lien http accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.cours (titre, lien) values ('X', 'javascript:alert(1)'); raise exception 'ÉCHEC : lien javascript accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.chapitres (cours_id, titre, duree_min) values (current_setting('test.cid')::uuid, 'X', 4); raise exception 'ÉCHEC : durée de 4 minutes acceptée'; exception when check_violation then null; end $$;
do $$ begin update public.chapitres set niveau = 7 where id = current_setting('test.hid')::uuid; raise exception 'ÉCHEC : niveau 7 accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.notes_chapitres (chapitre_id, texte) values (current_setting('test.hid')::uuid, repeat('x', 4001)); raise exception 'ÉCHEC : note de 4001 caractères acceptée'; exception when check_violation then null; end $$;
do $$ begin insert into public.reglages_cours (disponibilites) values ('[1,2]'); raise exception 'ÉCHEC : disponibilités qui ne sont pas un objet'; exception when check_violation then null; end $$;

-- Notes et temps disponible.
insert into public.notes_chapitres (chapitre_id, texte, citation) values (:'hid', 'À retenir : 100 associés au plus en SARL', 'L223-3');
insert into public.reglages_cours (disponibilites) values ('{"semaine":[60,60,60,60,60,90,90],"libres":[]}');

-- La date de modification se met à jour toute seule.
select maj_le as avant from public.chapitres where id = :'hid' \gset
select set_config('test.avant', :'avant', false) \gset
update public.chapitres set niveau = 1, derniere_revision = '2026-11-05', prochaine_revision = '2026-11-06' where id = :'hid';
do $$ begin
  if (select maj_le from public.chapitres where id = current_setting('test.hid')::uuid) <= current_setting('test.avant')::timestamptz then
    raise exception 'ÉCHEC : maj_le non mise à jour';
  end if;
end $$;

-- L'autre compte ne voit rien, ne peut pas se rattacher à mes cours, ni écrire pour moi.
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false) \gset
do $$ begin
  if (select count(*) from public.cours) + (select count(*) from public.chapitres) + (select count(*) from public.notes_chapitres) + (select count(*) from public.reglages_cours) <> 0 then
    raise exception 'ÉCHEC : RLS des cours';
  end if;
end $$;
do $$ begin
  insert into public.chapitres (cours_id, titre) values (current_setting('test.cid')::uuid, 'Intrus');
  raise exception 'ÉCHEC : chapitre rattaché au cours d''un autre compte';
exception when foreign_key_violation then null; end $$;
do $$ begin
  insert into public.cours (user_id, titre) values ('11111111-1111-1111-1111-111111111111', 'Pour autrui');
  raise exception 'ÉCHEC : cours écrit pour un autre compte';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.cours set titre = 'Piraté' where id = current_setting('test.cid')::uuid;
  if found then raise exception 'ÉCHEC : cours d''autrui modifié'; end if;
end $$;
do $$ begin
  delete from public.chapitres where id = current_setting('test.hid')::uuid;
  if found then raise exception 'ÉCHEC : chapitre d''autrui supprimé'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  if (select count(*) from public.cours) + (select count(*) from public.notes_chapitres) <> 0 then raise exception 'ÉCHEC : anon lit des cours'; end if;
end $$;
reset role;

-- Supprimer un cours emporte ses chapitres et leurs notes.
set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false) \gset
delete from public.cours where id = :'cid';
do $$ begin
  if (select count(*) from public.chapitres where cours_id = current_setting('test.cid')::uuid) <> 0 then raise exception 'ÉCHEC : chapitres orphelins'; end if;
  if (select count(*) from public.notes_chapitres) <> 0 then raise exception 'ÉCHEC : notes orphelines'; end if;
end $$;
-- De quoi vérifier que la suppression du compte emporte aussi tout cela.
insert into public.cours (titre) values ('Éco indus') returning id as cid2 \gset
insert into public.chapitres (cours_id, titre) values (:'cid2', '1.1') returning id as hid2 \gset
insert into public.notes_chapitres (chapitre_id, texte) values (:'hid2', 'une note');
reset role;

-- Supprimer le compte emporte tout ce qui est à lui, amitiés comprises.
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  if (select count(*) from public.sessions where user_id = '11111111-1111-1111-1111-111111111111')
     + (select count(*) from public.constructions where user_id = '11111111-1111-1111-1111-111111111111')
     + (select count(*) from public.jetons_raccourci where user_id = '11111111-1111-1111-1111-111111111111')
     + (select count(*) from public.profils where user_id = '11111111-1111-1111-1111-111111111111')
     + (select count(*) from public.amities where '11111111-1111-1111-1111-111111111111' in (utilisateur, ami))
     + (select count(*) from public.cours where user_id = '11111111-1111-1111-1111-111111111111')
     + (select count(*) from public.chapitres where user_id = '11111111-1111-1111-1111-111111111111')
     + (select count(*) from public.notes_chapitres where user_id = '11111111-1111-1111-1111-111111111111')
     + (select count(*) from public.reglages_cours where user_id = '11111111-1111-1111-1111-111111111111') <> 0 then
    raise exception 'ÉCHEC : cascade';
  end if;
end $$;
\echo 'Scénario SQL : tout est conforme.'

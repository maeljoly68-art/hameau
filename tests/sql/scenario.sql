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

-- Déplacer = changer de case : le niveau et ce qu'il a coûté suivent ; une case prise refuse ; la base garde un bâtiment par case.
insert into public.constructions (batiment, x, y, cout) values ('fleurs', 1, 3, 10);
update public.constructions set x = 4, y = 4 where id = :'cid';
do $$ begin
  if (select x || ',' || y from public.constructions where id = current_setting('test.cid')::uuid) <> '4,4' then raise exception 'ÉCHEC : déplacement non enregistré'; end if;
  if (select niveau from public.constructions where id = current_setting('test.cid')::uuid) <> 2 or (select cout from public.constructions where id = current_setting('test.cid')::uuid) <> 162 then raise exception 'ÉCHEC : le déplacement a touché au niveau ou au coût'; end if;
end $$;
do $$ begin
  update public.constructions set x = 1, y = 3 where id = current_setting('test.cid')::uuid;
  raise exception 'ÉCHEC : déplacement sur une case occupée accepté';
exception when unique_violation then null; end $$;
do $$ begin
  if (select x || ',' || y from public.constructions where id = current_setting('test.cid')::uuid) <> '4,4' then raise exception 'ÉCHEC : un déplacement refusé a quand même bougé le bâtiment'; end if;
end $$;
do $$ begin update public.constructions set x = -1 where id = current_setting('test.cid')::uuid; raise exception 'ÉCHEC : case négative acceptée'; exception when check_violation then null; end $$;
update public.constructions set x = 3, y = 3 where id = :'cid';
delete from public.constructions where batiment = 'fleurs' and x = 1 and y = 3;

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

-- Migration 6 : emploi du temps — l'adresse du flux (un secret) et les mots qui rattachent ses créneaux à chaque cours.
do $$ begin
  if (select motifs from public.cours where id = current_setting('test.cid')::uuid) is distinct from '' then raise exception 'ÉCHEC : mots d''un cours neuf non vides (ou nuls)'; end if;
  if (select agenda_url from public.reglages_cours) is not null then raise exception 'ÉCHEC : adresse du flux non vide par défaut'; end if;
end $$;
update public.cours set motifs = 'droit spécial des sociétés, SAE droit des sociétés' where id = :'cid';
update public.reglages_cours set agenda_url = 'https://monemploidutemps.unistra.fr/api/calendar/00000000-0000-0000-0000-000000000000/export';
do $$ begin
  if (select motifs from public.cours where id = current_setting('test.cid')::uuid) <> 'droit spécial des sociétés, SAE droit des sociétés' then raise exception 'ÉCHEC : mots du cours non enregistrés'; end if;
  if (select agenda_url from public.reglages_cours) <> 'https://monemploidutemps.unistra.fr/api/calendar/00000000-0000-0000-0000-000000000000/export' then raise exception 'ÉCHEC : adresse du flux non enregistrée'; end if;
end $$;
do $$ begin update public.reglages_cours set agenda_url = 'http://exemple.fr/cal.ics'; raise exception 'ÉCHEC : flux en http accepté'; exception when check_violation then null; end $$;
do $$ begin update public.reglages_cours set agenda_url = 'javascript:alert(1)'; raise exception 'ÉCHEC : flux javascript accepté'; exception when check_violation then null; end $$;
do $$ begin update public.reglages_cours set agenda_url = 'https://exemple.fr/un lien'; raise exception 'ÉCHEC : flux avec une espace accepté'; exception when check_violation then null; end $$;
do $$ begin update public.reglages_cours set agenda_url = 'https://exemple.fr/' || repeat('x', 500); raise exception 'ÉCHEC : flux de plus de 500 caractères accepté'; exception when check_violation then null; end $$;
do $$ begin update public.cours set motifs = repeat('x', 301) where id = current_setting('test.cid')::uuid; raise exception 'ÉCHEC : mots de plus de 300 caractères acceptés'; exception when check_violation then null; end $$;
-- Enregistrer le temps disponible (upsert de l'application) ne doit pas effacer l'adresse du flux.
insert into public.reglages_cours (user_id, disponibilites) values (auth.uid(), '{"semaine":[30,30,30,30,30,30,30],"libres":[],"reduction":50}'::jsonb)
  on conflict (user_id) do update set disponibilites = excluded.disponibilites, maj_le = now();
do $$ begin
  if (select agenda_url from public.reglages_cours) is null then raise exception 'ÉCHEC : l''enregistrement du temps disponible a effacé l''adresse du flux'; end if;
  if (select disponibilites->>'reduction' from public.reglages_cours) <> '50' then raise exception 'ÉCHEC : réduction non enregistrée'; end if;
end $$;
-- Retirer le flux : l'adresse s'efface sans toucher au reste.
update public.reglages_cours set agenda_url = null;
do $$ begin
  if (select agenda_url from public.reglages_cours) is not null then raise exception 'ÉCHEC : adresse du flux non effaçable'; end if;
  if (select disponibilites->'semaine'->>0 from public.reglages_cours) <> '30' then raise exception 'ÉCHEC : retirer le flux a touché au temps disponible'; end if;
end $$;
update public.reglages_cours set agenda_url = 'https://monemploidutemps.unistra.fr/api/calendar/00000000-0000-0000-0000-000000000000/export';

-- Migration 7 : cours en pause — un état du cours, qui ne touche ni aux chapitres ni aux notes.
do $$ begin
  if (select en_pause from public.cours where id = current_setting('test.cid')::uuid) is distinct from false then raise exception 'ÉCHEC : un cours neuf est en pause (ou sa pause est nulle)'; end if;
end $$;
select count(*) as nb_chapitres_avant from public.chapitres where cours_id = :'cid' \gset
select set_config('test.nbch', :'nb_chapitres_avant', false) \gset
update public.cours set en_pause = true where id = :'cid';
do $$ begin
  if (select en_pause from public.cours where id = current_setting('test.cid')::uuid) is distinct from true then raise exception 'ÉCHEC : pause non enregistrée'; end if;
  if (select count(*) from public.chapitres where cours_id = current_setting('test.cid')::uuid) <> current_setting('test.nbch')::int or current_setting('test.nbch')::int = 0 then raise exception 'ÉCHEC : la pause a touché aux chapitres (ou il n''y en avait pas à vérifier)'; end if;
end $$;
do $$ begin update public.cours set en_pause = null where id = current_setting('test.cid')::uuid; raise exception 'ÉCHEC : pause nulle acceptée'; exception when not_null_violation then null; end $$;
update public.cours set en_pause = false where id = :'cid';
do $$ begin
  if (select en_pause from public.cours where id = current_setting('test.cid')::uuid) is distinct from false then raise exception 'ÉCHEC : pause non levée'; end if;
end $$;

-- Migration 8 : journal des passages.
insert into public.passages (chapitre_id, jour, sorte, note, minutes, score_pct, vitesse, rappel) values (:'hid', '2026-11-06', 'revision', 'bien', 12, 85.5, 1.11, 'les trois points de la fiche');
insert into public.passages (chapitre_id, jour, sorte) values (:'hid', '2026-11-06', 'lecture');
do $$ begin
  if (select count(*) from public.passages) <> 2 then raise exception 'ÉCHEC : passages non enregistrés'; end if;
  -- Une durée, une note, un score absents restent absents : jamais 0.
  if (select count(*) from public.passages where minutes is null and note is null and score_pct is null and vitesse is null and rappel is null) <> 1 then raise exception 'ÉCHEC : un passage sans durée ni note doit les garder nulles'; end if;
  if (select count(*) from public.passages where user_id = current_setting('test.uid')::uuid) <> 2 then raise exception 'ÉCHEC : le compte n''est pas celui de la session par défaut'; end if;
  if (select score_pct from public.passages where sorte = 'revision') <> 85.5 or (select vitesse from public.passages where sorte = 'revision') <> 1.11 then raise exception 'ÉCHEC : score ou vitesse déformés'; end if;
end $$;
-- Chaque sorte, chaque note et chaque borne permise passent (une contrainte trop serrée casserait la validation d'un jour).
insert into public.passages (chapitre_id, jour, sorte, note, minutes, vitesse, rappel) values
  (:'hid', '2026-11-06', 'relecture', null, 0, 0.5, repeat('x', 2000)),
  (:'hid', '2026-11-06', 'rappel', 'a-revoir', 1440, 2.5, null),
  (:'hid', '2026-11-06', 'examen', 'difficile', 90, null, null),
  (:'hid', '2026-11-06', 'revision', 'facile', null, null, null);
insert into public.passages (chapitre_id, jour, sorte, score_pct) values (:'hid', '2026-11-06', 'examen', 100), (:'hid', '2026-11-06', 'examen', 0);
do $$ begin
  if (select count(*) from public.passages) <> 8 then raise exception 'ÉCHEC : sortes, notes ou bornes permises refusées'; end if;
  if (select count(distinct sorte) from public.passages) <> 5 or (select count(distinct note) from public.passages) <> 4 then raise exception 'ÉCHEC : toutes les sortes et toutes les notes doivent passer'; end if;
end $$;
do $$ begin insert into public.passages (chapitre_id, jour, sorte) values (current_setting('test.hid')::uuid, '2026-11-06', 'devinette'); raise exception 'ÉCHEC : sorte inconnue acceptée'; exception when check_violation then null; end $$;
do $$ begin insert into public.passages (chapitre_id, jour, sorte, note) values (current_setting('test.hid')::uuid, '2026-11-06', 'revision', 'moyen'); raise exception 'ÉCHEC : note inconnue acceptée'; exception when check_violation then null; end $$;
do $$ begin insert into public.passages (chapitre_id, jour, sorte, minutes) values (current_setting('test.hid')::uuid, '2026-11-06', 'lecture', -1); raise exception 'ÉCHEC : durée négative acceptée'; exception when check_violation then null; end $$;
do $$ begin insert into public.passages (chapitre_id, jour, sorte, minutes) values (current_setting('test.hid')::uuid, '2026-11-06', 'lecture', 1441); raise exception 'ÉCHEC : durée de plus d''un jour acceptée'; exception when check_violation then null; end $$;
do $$ begin insert into public.passages (chapitre_id, jour, sorte, score_pct) values (current_setting('test.hid')::uuid, '2026-11-06', 'examen', 100.01); raise exception 'ÉCHEC : score au-dessus de 100 pour cent accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.passages (chapitre_id, jour, sorte, score_pct) values (current_setting('test.hid')::uuid, '2026-11-06', 'examen', -0.01); raise exception 'ÉCHEC : score négatif accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.passages (chapitre_id, jour, sorte, vitesse) values (current_setting('test.hid')::uuid, '2026-11-06', 'lecture', 0.49); raise exception 'ÉCHEC : vitesse sous 0,5 acceptée'; exception when check_violation then null; end $$;
do $$ begin insert into public.passages (chapitre_id, jour, sorte, vitesse) values (current_setting('test.hid')::uuid, '2026-11-06', 'lecture', 2.51); raise exception 'ÉCHEC : vitesse au-dessus de 2,5 acceptée'; exception when check_violation then null; end $$;
do $$ begin insert into public.passages (chapitre_id, jour, sorte, rappel) values (current_setting('test.hid')::uuid, '2026-11-06', 'rappel', repeat('x', 2001)); raise exception 'ÉCHEC : rappel de plus de 2000 caractères accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.passages (chapitre_id, jour, sorte) values (current_setting('test.hid')::uuid, null, 'lecture'); raise exception 'ÉCHEC : passage sans jour accepté'; exception when not_null_violation then null; end $$;

-- Migration 9 : rappels mensuels.
insert into public.rappels (titre) values ('Remplir mon rapport du mois sur Studea') returning id as rid \gset
select set_config('test.rid', :'rid', false) \gset
do $$ begin
  if (select jour_du_mois from public.rappels where id = current_setting('test.rid')::uuid) <> 1 then raise exception 'ÉCHEC : un rappel est dû le 1er du mois par défaut'; end if;
  if (select fait_le from public.rappels where id = current_setting('test.rid')::uuid) is not null then raise exception 'ÉCHEC : un rappel neuf ne doit pas être déjà fait'; end if;
  if (select lien from public.rappels where id = current_setting('test.rid')::uuid) is not null then raise exception 'ÉCHEC : lien absent par défaut'; end if;
end $$;
insert into public.rappels (titre, jour_du_mois, fait_le, lien) values ('Dernier jour permis', 28, '2026-11-03', 'https://exemple.fr/rapport'), ('Premier jour permis', 1, null, null);
do $$ begin
  if (select count(*) from public.rappels) <> 3 then raise exception 'ÉCHEC : rappels non enregistrés (ou bornes 1 et 28 refusées)'; end if;
end $$;
insert into public.rappels (titre) values ('x');
insert into public.rappels (titre, lien) values ('Lien de 500 caractères', 'https://' || repeat('x', 492));
do $$ begin
  if (select count(*) from public.rappels) <> 5 then raise exception 'ÉCHEC : titre d''un caractère ou lien de 500 caractères refusés'; end if;
end $$;
do $$ begin insert into public.rappels (titre, lien) values ('x', 'https://' || repeat('x', 493)); raise exception 'ÉCHEC : lien de 501 caractères accepté'; exception when check_violation then null; end $$;
update public.rappels set fait_le = '2026-11-06' where id = :'rid';
do $$ begin
  if (select fait_le from public.rappels where id = current_setting('test.rid')::uuid) <> '2026-11-06' then raise exception 'ÉCHEC : rappel non marqué fait'; end if;
end $$;
update public.rappels set fait_le = null where id = :'rid';
do $$ begin
  if (select fait_le from public.rappels where id = current_setting('test.rid')::uuid) is not null then raise exception 'ÉCHEC : « fait » non effaçable'; end if;
end $$;
do $$ begin insert into public.rappels (titre, jour_du_mois) values ('x', 0); raise exception 'ÉCHEC : jour 0 accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.rappels (titre, jour_du_mois) values ('x', 29); raise exception 'ÉCHEC : jour 29 accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.rappels (titre) values ('   '); raise exception 'ÉCHEC : titre vide accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.rappels (titre) values (repeat('x', 121)); raise exception 'ÉCHEC : titre de plus de 120 caractères accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.rappels (titre) values (repeat('x', 120)); exception when check_violation then raise exception 'ÉCHEC : titre de 120 caractères refusé'; end $$;
do $$ begin insert into public.rappels (titre, lien) values ('x', 'http://exemple.fr'); raise exception 'ÉCHEC : lien http accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.rappels (titre, lien) values ('x', 'https://exemple.fr/un lien'); raise exception 'ÉCHEC : lien avec une espace accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.rappels (titre, lien) values ('x', 'https://exemple.fr/' || repeat('x', 500)); raise exception 'ÉCHEC : lien de plus de 500 caractères accepté'; exception when check_violation then null; end $$;
do $$ begin insert into public.rappels (titre, fait_le) values ('x', 'pas une date'); raise exception 'ÉCHEC : date absurde acceptée'; exception when invalid_datetime_format then null; end $$;

-- Migration 10 : pages à savoir mot pour mot — un réglage de la page, faux par défaut, qui ne touche pas au cycle.
do $$ begin
  if (select par_coeur from public.chapitres where id = current_setting('test.hid')::uuid) is distinct from false then raise exception 'ÉCHEC : une page neuve est à savoir mot pour mot (ou le réglage est nul)'; end if;
end $$;
update public.chapitres set par_coeur = true where id = :'hid';
do $$ begin
  if (select par_coeur from public.chapitres where id = current_setting('test.hid')::uuid) is distinct from true then raise exception 'ÉCHEC : réglage mot pour mot non enregistré'; end if;
  if (select niveau from public.chapitres where id = current_setting('test.hid')::uuid) <> 0 then raise exception 'ÉCHEC : le réglage a touché au niveau de la page'; end if;
end $$;
do $$ begin update public.chapitres set par_coeur = null where id = current_setting('test.hid')::uuid; raise exception 'ÉCHEC : réglage nul accepté'; exception when not_null_violation then null; end $$;
update public.chapitres set par_coeur = false where id = :'hid';
do $$ begin
  if (select par_coeur from public.chapitres where id = current_setting('test.hid')::uuid) is distinct from false then raise exception 'ÉCHEC : réglage mot pour mot non levé'; end if;
end $$;

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
  if (select count(*) from public.cours) + (select count(*) from public.chapitres) + (select count(*) from public.notes_chapitres) + (select count(*) from public.reglages_cours) + (select count(*) from public.passages) + (select count(*) from public.rappels) <> 0 then
    raise exception 'ÉCHEC : RLS des cours';
  end if;
end $$;
do $$ begin
  insert into public.chapitres (cours_id, titre) values (current_setting('test.cid')::uuid, 'Intrus');
  raise exception 'ÉCHEC : chapitre rattaché au cours d''un autre compte';
exception when foreign_key_violation then null; end $$;
do $$ begin
  insert into public.passages (chapitre_id, jour, sorte) values (current_setting('test.hid')::uuid, '2026-11-06', 'lecture');
  raise exception 'ÉCHEC : passage rattaché au chapitre d''un autre compte';
exception when foreign_key_violation then null; end $$;
do $$ begin
  insert into public.passages (user_id, chapitre_id, jour, sorte) values ('11111111-1111-1111-1111-111111111111', current_setting('test.hid')::uuid, '2026-11-06', 'lecture');
  raise exception 'ÉCHEC : passage écrit pour un autre compte';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.passages set note = 'facile';
  if found then raise exception 'ÉCHEC : passage d''autrui modifié'; end if;
  delete from public.passages;
  if found then raise exception 'ÉCHEC : passage d''autrui supprimé'; end if;
end $$;
do $$ begin
  insert into public.rappels (user_id, titre) values ('11111111-1111-1111-1111-111111111111', 'Pour autrui');
  raise exception 'ÉCHEC : rappel écrit pour un autre compte';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.rappels set fait_le = '2026-11-06';
  if found then raise exception 'ÉCHEC : rappel d''autrui modifié'; end if;
  delete from public.rappels;
  if found then raise exception 'ÉCHEC : rappel d''autrui supprimé'; end if;
end $$;
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
  if (select count(*) from public.cours) + (select count(*) from public.notes_chapitres) + (select count(*) from public.passages) + (select count(*) from public.rappels) <> 0 then raise exception 'ÉCHEC : anon lit des cours'; end if;
end $$;
reset role;

-- Supprimer un cours emporte ses chapitres et leurs notes.
set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false) \gset
delete from public.cours where id = :'cid';
do $$ begin
  if (select count(*) from public.chapitres where cours_id = current_setting('test.cid')::uuid) <> 0 then raise exception 'ÉCHEC : chapitres orphelins'; end if;
  if (select count(*) from public.notes_chapitres) <> 0 then raise exception 'ÉCHEC : notes orphelines'; end if;
  if (select count(*) from public.passages) <> 0 then raise exception 'ÉCHEC : passages orphelins'; end if;
end $$;
-- De quoi vérifier que la suppression du compte emporte aussi tout cela.
insert into public.cours (titre) values ('Éco indus') returning id as cid2 \gset
insert into public.chapitres (cours_id, titre) values (:'cid2', '1.1') returning id as hid2 \gset
insert into public.notes_chapitres (chapitre_id, texte) values (:'hid2', 'une note');
insert into public.passages (chapitre_id, jour, sorte) values (:'hid2', '2026-11-06', 'lecture');
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
     + (select count(*) from public.passages where user_id = '11111111-1111-1111-1111-111111111111')
     + (select count(*) from public.rappels where user_id = '11111111-1111-1111-1111-111111111111')
     + (select count(*) from public.reglages_cours where user_id = '11111111-1111-1111-1111-111111111111') <> 0 then
    raise exception 'ÉCHEC : cascade';
  end if;
end $$;
\echo 'Scénario SQL : tout est conforme.'

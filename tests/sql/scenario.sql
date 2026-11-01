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

-- Supprimer le compte emporte tout.
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  if (select count(*) from public.sessions) + (select count(*) from public.constructions) + (select count(*) from public.jetons_raccourci) <> 0 then
    raise exception 'ÉCHEC : cascade';
  end if;
end $$;
\echo 'Scénario SQL : tout est conforme.'

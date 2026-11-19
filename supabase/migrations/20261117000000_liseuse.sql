-- La liseuse : les cours se lisent DANS Hameau, plus seulement sur claude.ai. On y écrit, on surligne, on gomme, et
-- tout se retrouve sur l'autre appareil ; pendant une séance, Hameau note les pages lues pour les valider seul.
-- Additive et rejouable : rien de ce qui existe n'est retiré.

-- Le document d'un cours (« croissance ») et, pour chaque page du cours, sa ou ses planches dans ce document
-- (« C1-2-Modeles », ou « F01-Notions,F02-Capital-flux » quand une page de Hameau en couvre plusieurs).
alter table public.cours add column if not exists document text;
alter table public.chapitres add column if not exists ancre text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cours_document_valide' and conrelid = 'public.cours'::regclass) then
    alter table public.cours add constraint cours_document_valide check (document is null or document ~ '^[a-z0-9][a-z0-9-]{0,59}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chapitres_ancre_valide' and conrelid = 'public.chapitres'::regclass) then
    alter table public.chapitres add constraint chapitres_ancre_valide check (ancre is null or (char_length(ancre) <= 400 and ancre ~ '^[A-Za-z0-9_][A-Za-z0-9_.-]*(,[A-Za-z0-9_][A-Za-z0-9_.-]*)*$'));
  end if;
end;
$$;

-- Les pages des cours sont publiées CHIFFRÉES avec le site (public/cours/*.bin) : le site est public, les cours ne le
-- sont pas. La clé de chaque document est ici, derrière la RLS : seul le compte à qui elle est donnée peut la lire.
-- Pas d'écriture depuis l'app : les clés sont posées par le propriétaire du projet, en SQL, avec le fichier qu'elles
-- ouvrent (le nom du fichier change à chaque nouvelle version du cours, la clé et lui vont ensemble).
create table if not exists public.cles_documents (
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  fichier text not null check (fichier ~ '^[a-z0-9][a-z0-9.-]{0,99}\.bin$'),
  cle text not null check (cle ~ '^[A-Za-z0-9+/]{43}=$'),
  maj_le timestamptz not null default now(),
  primary key (user_id, document)
);
alter table public.cles_documents enable row level security;
drop policy if exists cles_documents_lecture on public.cles_documents;
create policy cles_documents_lecture on public.cles_documents
  for select to authenticated
  using (user_id = auth.uid());

-- L'encre : un trait par ligne. Deux appareils qui écrivent en même temps ajoutent chacun leurs lignes au lieu de
-- s'écraser. Gommer un trait supprime sa ligne ; annuler le gommage la remet, avec le même identifiant (choisi par
-- l'appareil qui a tracé le trait, pour reconnaître son propre trait quand il revient par le temps réel).
-- Les points sont dans le repère de la planche (pixels de la page à sa largeur fixe) : [x0, y0, x1, y1, …].
create table if not exists public.traits (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document text not null check (document ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  page text not null check (char_length(page) between 1 and 120),
  outil text not null check (outil in ('stylo', 'surligneur')),
  couleur text not null check (couleur ~ '^#[0-9A-Fa-f]{6}$'),
  epaisseur real not null check (epaisseur > 0 and epaisseur <= 64),
  points jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) between 2 and 12000),
  cree_le timestamptz not null default now()
);
create index if not exists traits_par_document on public.traits (user_id, document);
alter table public.traits enable row level security;
drop policy if exists traits_proprietaire on public.traits;
create policy traits_proprietaire on public.traits
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Ce qu'une planche garde d'habitude dans le navigateur (cases du plan cochées, meilleur score au quiz, date
-- d'examen…) et l'endroit où on s'est arrêté : par compte, pour le retrouver sur l'autre appareil.
-- Une clé retirée garde sa ligne, valeur vide (null) : le temps réel n'applique pas la RLS aux suppressions et les
-- annoncerait, clé comprise, à tous les comptes à l'écoute ; une mise à jour, elle, ne part qu'au propriétaire.
create table if not exists public.etats_documents (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document text not null check (document ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  cle text not null check (char_length(cle) between 1 and 200),
  valeur text check (valeur is null or char_length(valeur) <= 100000),
  maj_le timestamptz not null default now(),
  primary key (user_id, document, cle)
);
alter table public.etats_documents enable row level security;
drop policy if exists etats_documents_proprietaire on public.etats_documents;
create policy etats_documents_proprietaire on public.etats_documents
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Les pages lues pendant une séance : le temps passé sur la page et la part de la page qu'on a eue sous les yeux.
-- Une ligne par (séance, page, appareil), qui porte le total CUMULÉ et le réécrit à chaque envoi : un envoi répété
-- ne compte pas deux fois, et l'iPad et le PC sur la même séance ne s'écrasent pas.
create table if not exists public.lectures (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  chapitre_id uuid not null,
  appareil text not null check (char_length(appareil) between 1 and 64),
  secondes integer not null check (secondes between 0 and 86400),
  couverture smallint not null check (couverture between 0 and 100),
  maj_le timestamptz not null default now(),
  primary key (session_id, chapitre_id, appareil),
  -- La séance ET la page sont du même compte que la ligne (même raison que pour les passages).
  constraint lectures_session_du_meme_compte foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  constraint lectures_chapitre_du_meme_compte foreign key (chapitre_id, user_id) references public.chapitres (id, user_id) on delete cascade
);
create index if not exists lectures_par_compte on public.lectures (user_id, maj_le);
alter table public.lectures enable row level security;
drop policy if exists lectures_proprietaire on public.lectures;
create policy lectures_proprietaire on public.lectures
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Temps réel : un trait tracé sur l'iPad apparaît sur le PC sans recharger ; une case cochée aussi.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'traits') then
      alter publication supabase_realtime add table public.traits;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'etats_documents') then
      alter publication supabase_realtime add table public.etats_documents;
    end if;
  end if;
end;
$$;

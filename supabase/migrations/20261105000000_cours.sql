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

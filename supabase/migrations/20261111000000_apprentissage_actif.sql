-- Apprentissage actif : la confiance avant la note, le carnet d'erreurs, les cartes question/réponse.
-- Additive et rejouable : rien de ce qui existe n'est retiré.

-- « Je pense savoir… » dit AVANT de comparer à la fiche : de 0 (pas du tout) à 3 (sûr de moi). Absente : jamais 0.
alter table public.passages add column if not exists confiance smallint;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'passages_confiance_bornee' and conrelid = 'public.passages'::regclass) then
    alter table public.passages add constraint passages_confiance_bornee check (confiance is null or confiance between 0 and 3);
  end if;
end;
$$;

-- Le carnet d'erreurs : une ligne par erreur, écrite quand on se trompe, qui revient tant qu'on n'a pas dit « je sais ».
create table if not exists public.erreurs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapitre_id uuid not null,
  texte text not null check (char_length(btrim(texte)) between 1 and 300),
  -- Le jour de l'appareil où on s'est trompé.
  jour date not null,
  -- « Je sais » : l'erreur ne revient plus.
  reglee_le date,
  -- « Encore flou » : le dernier jour où elle est revenue sans être sue.
  revue_le date,
  cree_le timestamptz not null default now(),
  constraint erreurs_chapitre_du_meme_compte foreign key (chapitre_id, user_id) references public.chapitres (id, user_id) on delete cascade
);
create index if not exists erreurs_par_compte on public.erreurs (user_id, reglee_le, jour);
create index if not exists erreurs_par_chapitre on public.erreurs (user_id, chapitre_id);

-- Les cartes question/réponse d'une page : de vraies questions pour le rappel.
create table if not exists public.cartes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapitre_id uuid not null,
  question text not null check (char_length(btrim(question)) between 1 and 300),
  reponse text not null check (char_length(btrim(reponse)) between 1 and 800),
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  constraint cartes_chapitre_du_meme_compte foreign key (chapitre_id, user_id) references public.chapitres (id, user_id) on delete cascade
);
create index if not exists cartes_par_chapitre on public.cartes (user_id, chapitre_id, ordre);

alter table public.erreurs enable row level security;
drop policy if exists erreurs_proprietaire on public.erreurs;
create policy erreurs_proprietaire on public.erreurs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.cartes enable row level security;
drop policy if exists cartes_proprietaire on public.cartes;
create policy cartes_proprietaire on public.cartes
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Temps réel : une carte ou une erreur ajoutée sur le téléphone apparaît sur le PC sans recharger.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['erreurs', 'cartes'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

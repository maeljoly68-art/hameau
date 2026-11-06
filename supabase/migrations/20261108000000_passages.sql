-- Journal des passages : chaque lecture, révision, relecture, rappel ou examen blanc validé laisse une ligne.
-- Additive et rejouable : rien de ce qui existe n'est retiré.
--
-- Le calendrier n'en a pas besoin : il se recalcule depuis l'état des chapitres. Le journal garde ce que l'état
-- ne dit pas — une page est-elle fragile (plusieurs notes basses de suite) ? qu'a-t-on fait cette semaine ?
-- à quelle vitesse ? — et ce qu'on a écrit de tête avant d'ouvrir la fiche.
create table if not exists public.passages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapitre_id uuid not null,
  -- Le jour de l'appareil, pas le jour UTC : un passage à 0 h 30 compte pour le jour où on l'a fait.
  jour date not null,
  sorte text not null check (sorte in ('lecture', 'revision', 'relecture', 'rappel', 'examen')),
  note text check (note is null or note in ('a-revoir', 'difficile', 'bien', 'facile')),
  -- Absente quand on ne la sait pas (jamais 0) : un passage sans chrono n'a pas de durée.
  minutes integer check (minutes is null or minutes between 0 and 1440),
  score_pct numeric(5, 2) check (score_pct is null or score_pct between 0 and 100),
  vitesse numeric(4, 2) check (vitesse is null or vitesse between 0.5 and 2.5),
  -- Ce qu'on a écrit de tête avant d'ouvrir la fiche.
  rappel text check (rappel is null or char_length(rappel) <= 2000),
  cree_le timestamptz not null default now(),
  -- Le chapitre ET le passage sont du même compte (même raison que pour les notes).
  constraint passages_chapitre_du_meme_compte foreign key (chapitre_id, user_id) references public.chapitres (id, user_id) on delete cascade
);
create index if not exists passages_par_jour on public.passages (user_id, jour);
create index if not exists passages_par_chapitre on public.passages (user_id, chapitre_id, jour);

alter table public.passages enable row level security;
drop policy if exists passages_proprietaire on public.passages;
create policy passages_proprietaire on public.passages
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Temps réel : un passage validé sur le téléphone apparaît dans le bilan du PC sans recharger.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'passages') then
    alter publication supabase_realtime add table public.passages;
  end if;
end;
$$;

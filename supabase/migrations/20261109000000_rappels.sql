-- Rappels mensuels : « remplir mon rapport du mois » revient chaque jour, à partir du jour dit, tant qu'il n'est pas
-- fait. Additive et rejouable : rien de ce qui existe n'est retiré.
create table if not exists public.rappels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titre text not null check (char_length(btrim(titre)) between 1 and 120),
  -- Le jour du mois où il devient dû : de 1 à 28, car tous les mois ont ces jours-là.
  jour_du_mois smallint not null default 1 check (jour_du_mois between 1 and 28),
  -- La dernière fois qu'on l'a fait : il n'est plus dû jusqu'au mois suivant.
  fait_le date,
  -- Où le faire : https seulement, un « javascript: » collé là finirait dans un lien.
  lien text check (lien is null or (lien ~ '^https://[^[:space:]]+$' and char_length(lien) <= 500)),
  cree_le timestamptz not null default now()
);
create index if not exists rappels_par_compte on public.rappels (user_id, cree_le);

alter table public.rappels enable row level security;
drop policy if exists rappels_proprietaire on public.rappels;
create policy rappels_proprietaire on public.rappels
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Temps réel : un rappel fait sur le téléphone disparaît du PC sans recharger.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rappels') then
    alter publication supabase_realtime add table public.rappels;
  end if;
end;
$$;

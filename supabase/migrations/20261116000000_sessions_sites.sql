-- Les sites sur lesquels on a travaillé pendant une session : l'extension Chrome de concentration mesure le temps passé
-- sur chaque site (le NOM du site, jamais l'adresse complète) tant qu'un chrono tourne, et l'envoie ici pour que Hameau
-- l'affiche (Historique, Statistiques). Additive et rejouable : rien de ce qui existe n'est retiré.

-- Une clé étrangère composite (session, compte) empêche de rattacher ses sites à la session d'un autre compte.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_id_user' and conrelid = 'public.sessions'::regclass) then
    alter table public.sessions add constraint sessions_id_user unique (id, user_id);
  end if;
end;
$$;

-- Une ligne par (session, appareil, site, titre) : le total CUMULÉ de secondes, réécrit à chaque envoi. Par appareil :
-- deux navigateurs sur la même session ne s'écrasent pas, et un envoi renouvelé ne compte pas deux fois. Le titre de la
-- page n'est gardé que si on l'a choisi (« » sinon) ; il distingue par exemple deux artefacts du même site.
create table if not exists public.sessions_sites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  appareil text not null check (char_length(appareil) between 1 and 64),
  site text not null check (char_length(site) between 3 and 253),
  titre text not null default '' check (char_length(titre) <= 120),
  secondes integer not null check (secondes between 0 and 86400),
  maj_le timestamptz not null default now(),
  primary key (session_id, appareil, site, titre),
  constraint sessions_sites_session_du_meme_compte foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade
);
create index if not exists sessions_sites_par_compte on public.sessions_sites (user_id, maj_le);

alter table public.sessions_sites enable row level security;
drop policy if exists sessions_sites_proprietaire on public.sessions_sites;
create policy sessions_sites_proprietaire on public.sessions_sites
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

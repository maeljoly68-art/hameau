-- Notifications push : un rappel par jour sur le téléphone, à l'heure choisie.
-- Additive et rejouable : rien de ce qui existe n'est retiré.
--
-- Trois pièces : un abonnement par appareil (ce que le navigateur donne pour être prévenu), le réglage de la
-- personne (heure, fuseau), et la fonction qui dit QUI prévenir maintenant et avec quel message. L'envoi lui-même
-- est fait par une fonction Edge (supabase/functions/rappel-push) que la base appelle tous les quarts d'heure.
create table if not exists public.abonnements_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- L'adresse que le service de notifications du navigateur a donnée à cet appareil : https seulement.
  endpoint text not null check (endpoint ~ '^https://[^[:space:]]+$' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 10 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  cree_le timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.notifications_reglage (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  actif boolean not null default true,
  -- L'heure (de 0 à 23) à laquelle on veut être prévenu, dans SON fuseau : un rappel à 18 h est à 18 h chez soi.
  heure smallint not null default 18 check (heure between 0 and 23),
  fuseau text not null default 'Europe/Paris' check (char_length(fuseau) between 1 and 64),
  -- Le dernier jour (dans son fuseau) où on l'a prévenu : un seul rappel par jour, même si la base tourne souvent.
  dernier_envoi date,
  maj_le timestamptz not null default now()
);

alter table public.abonnements_push enable row level security;
drop policy if exists abonnements_push_proprietaire on public.abonnements_push;
create policy abonnements_push_proprietaire on public.abonnements_push
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.notifications_reglage enable row level security;
drop policy if exists notifications_reglage_proprietaire on public.notifications_reglage;
create policy notifications_reglage_proprietaire on public.notifications_reglage
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Qui prévenir maintenant, et avec quel message. Réservée à la fonction Edge (rôle de service) : elle lit les
-- données de TOUS les comptes, jamais de quoi l'ouvrir à un visiteur ou à un compte.
-- Un message n'est produit que s'il y a quelque chose à dire : pas de rappel « rien à faire ».
create or replace function public.notifications_du_moment(p_ref timestamptz default now())
returns table (user_id uuid, endpoint text, p256dh text, auth text, titre text, corps text, jour date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  d date;
  h integer;
  n_app integer;
  n_rev integer;
  n_err integer;
  texte_rappels text;
  texte_partiels text;
  morceaux text[];
begin
  for r in select s.user_id as uid, s.heure as heure_voulue, s.fuseau as fuseau, s.dernier_envoi as dernier
             from public.notifications_reglage s where s.actif loop
    begin
      d := (p_ref at time zone r.fuseau)::date;
      h := extract(hour from (p_ref at time zone r.fuseau))::integer;
      if h <> r.heure_voulue or r.dernier is not distinct from d then
        continue;
      end if;

      -- Les pages dues : à apprendre par cœur (premier retour, ou cran 2 pour une page « mot pour mot »), ou à réviser.
      -- Un cours en pause, ou dont le partiel est passé, n'est plus au calendrier : il ne fait pas de bruit.
      select count(*) filter (where ch.niveau <= case when ch.par_coeur then 2 else 1 end),
             count(*) filter (where ch.niveau > case when ch.par_coeur then 2 else 1 end)
        into n_app, n_rev
        from public.chapitres ch
        join public.cours c on c.id = ch.cours_id and c.user_id = ch.user_id
       where ch.user_id = r.uid and not c.en_pause and (c.partiel is null or c.partiel > d)
         and ch.niveau >= 1 and ch.prochaine_revision <= d;

      -- Les erreurs du carnet de retour : 6 jours après, puis 3 jours après un « encore flou » (voir erreurs.ts).
      select count(*) into n_err from (
        select 1 from public.erreurs e
         where e.user_id = r.uid and e.reglee_le is null
           and ((e.revue_le is null and e.jour <= d - 6) or (e.revue_le is not null and e.revue_le <= d - 3))
         limit 2) x;

      -- Les rappels mensuels dus : le jour du mois est arrivé et ils ne sont pas faits depuis (voir rappels.ts).
      select string_agg(q.titre, ', ' order by q.titre) into texte_rappels
        from public.rappels q
       where q.user_id = r.uid
         and d >= (date_trunc('month', d)::date + (q.jour_du_mois - 1))
         and (q.fait_le is null or q.fait_le < (date_trunc('month', d)::date + (q.jour_du_mois - 1)));

      -- Un partiel dans un ou deux jours : la fiche de la veille.
      select string_agg(c.titre || ' dans ' || (c.partiel - d) || ' j', ', ' order by c.partiel, c.titre) into texte_partiels
        from public.cours c
       where c.user_id = r.uid and not c.en_pause and c.partiel is not null and (c.partiel - d) between 1 and 2;

      morceaux := array[]::text[];
      if n_app > 0 then morceaux := morceaux || (n_app || case when n_app > 1 then ' pages à apprendre par cœur' else ' page à apprendre par cœur' end); end if;
      if n_rev > 0 then morceaux := morceaux || (n_rev || case when n_rev > 1 then ' pages à réviser' else ' page à réviser' end); end if;
      if n_err > 0 then morceaux := morceaux || (n_err || case when n_err > 1 then ' erreurs de retour' else ' erreur de retour' end); end if;
      if texte_rappels is not null then morceaux := morceaux || ('À faire : ' || texte_rappels); end if;
      if texte_partiels is not null then morceaux := morceaux || ('Partiel de ' || texte_partiels || ' : la fiche de la veille t’attend'); end if;
      if coalesce(array_length(morceaux, 1), 0) = 0 then
        continue;
      end if;

      return query
        select a.user_id, a.endpoint, a.p256dh, a.auth, 'Hameau · ton rappel du jour'::text, array_to_string(morceaux, ' · '), d
          from public.abonnements_push a where a.user_id = r.uid;
    exception when others then
      -- Un fuseau illisible ou une donnée étrange chez UNE personne ne doit pas priver les autres de leur rappel.
      continue;
    end;
  end loop;
end;
$$;

-- Après l'envoi : un seul rappel par jour.
create or replace function public.notifications_marquer(p_user uuid, p_jour date)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notifications_reglage set dernier_envoi = p_jour where user_id = p_user;
$$;

-- Supabase accorde d'office l'exécution des nouvelles fonctions à anon et authenticated : « revoke from public » ne
-- la retire pas. Ces deux fonctions lisent ou écrivent pour tous les comptes : seul le rôle de service les appelle.
revoke all on function public.notifications_du_moment(timestamptz) from public, anon, authenticated;
revoke all on function public.notifications_marquer(uuid, date) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.notifications_du_moment(timestamptz) to service_role;
    grant execute on function public.notifications_marquer(uuid, date) to service_role;
  end if;
end;
$$;

-- Pratique quotidienne : un cours dont on doit faire un minimum de minutes CHAQUE jour (l'artefact d'erreurs du
-- TOEIC, bientôt celui du TAGE MAGE). Additive et rejouable : rien de ce qui existe n'est retiré.

-- Minutes minimum par jour ; absente : le cours n'a pas de pratique quotidienne.
alter table public.cours add column if not exists pratique_min smallint;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cours_pratique_bornee' and conrelid = 'public.cours'::regclass) then
    alter table public.cours add constraint cours_pratique_bornee check (pratique_min is null or pratique_min between 1 and 120);
  end if;
end;
$$;

-- Les minutes déclarées à la main (« j'ai fait mes 5 min » sur l'artefact, hors chrono). Celles du chrono ne sont pas
-- ici : elles viennent des sessions, pour que rien ne soit compté deux fois.
create table if not exists public.pratiques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cours_id uuid not null,
  -- Le jour de l'appareil où la pratique a eu lieu.
  jour date not null,
  minutes smallint not null check (minutes between 1 and 240),
  cree_le timestamptz not null default now(),
  constraint pratiques_cours_du_meme_compte foreign key (cours_id, user_id) references public.cours (id, user_id) on delete cascade
);
create index if not exists pratiques_par_cours on public.pratiques (user_id, cours_id, jour);

alter table public.pratiques enable row level security;
drop policy if exists pratiques_proprietaire on public.pratiques;
create policy pratiques_proprietaire on public.pratiques
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Temps réel : une pratique déclarée sur le téléphone apparaît sur le PC sans recharger.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pratiques') then
    alter publication supabase_realtime add table public.pratiques;
  end if;
end;
$$;

-- Le rappel quotidien (voir notifications_du_moment) ajoute la pratique du jour tant qu'elle n'est pas faite.
-- `create or replace` garde les droits : seul le rôle de service appelle cette fonction.
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
  texte_pratique text;
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

      -- La pratique quotidienne (l'artefact d'erreurs du TOEIC…) pas encore faite aujourd'hui : les minutes du jour sont
      -- celles du chrono (sessions « <cours> · erreurs », pauses déduites) plus celles déclarées, à la minute près.
      select string_agg(c.titre || ' ' || c.pratique_min || ' min', ', ' order by c.titre) into texte_pratique
        from public.cours c
       where c.user_id = r.uid and c.pratique_min is not null and not c.en_pause and (c.partiel is null or c.partiel >= d)
         and round(
               coalesce((select sum(p.minutes) from public.pratiques p where p.user_id = r.uid and p.cours_id = c.id and p.jour = d), 0)
               + coalesce((select sum(greatest(0, extract(epoch from (s.fin - s.debut)) - s.pause_secondes)) / 60.0
                             from public.sessions s
                            where s.user_id = r.uid and s.fin is not null
                              and lower(regexp_replace(btrim(s.categorie), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(c.titre), '\s+', ' ', 'g') || ' · erreurs')
                              and (s.debut at time zone r.fuseau)::date = d), 0)
             ) < c.pratique_min;

      morceaux := array[]::text[];
      if n_app > 0 then morceaux := morceaux || (n_app || case when n_app > 1 then ' pages à apprendre par cœur' else ' page à apprendre par cœur' end); end if;
      if n_rev > 0 then morceaux := morceaux || (n_rev || case when n_rev > 1 then ' pages à réviser' else ' page à réviser' end); end if;
      if n_err > 0 then morceaux := morceaux || (n_err || case when n_err > 1 then ' erreurs de retour' else ' erreur de retour' end); end if;
      if texte_pratique is not null then morceaux := morceaux || ('Pratique du jour : ' || texte_pratique); end if;
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

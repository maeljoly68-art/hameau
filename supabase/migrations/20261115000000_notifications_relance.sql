-- Notifications : un message mieux rangé, et une relance du soir. Additive et rejouable côté données ; les deux fonctions
-- du serveur de rappels changent de forme (la fonction Edge rappel-push est déployée avec elles).
--
--  * le message : un titre qui dit COMBIEN de choses attendent, puis une ligne par chose (au lieu d'une phrase à
--    rallonge séparée par des points) ;
--  * la relance : trois heures après l'heure choisie, si quelque chose attend encore (pages dues, erreurs de retour,
--    pratique du jour pas faite…), un second message « Il te reste … » ; rien s'il ne reste rien. Désactivable.
alter table public.notifications_reglage add column if not exists relance boolean not null default true;
alter table public.notifications_reglage add column if not exists derniere_relance date;

-- La forme du résultat change (une colonne « genre ») : l'ancienne fonction part, la nouvelle porte un autre nom.
drop function if exists public.notifications_du_moment(timestamptz);
drop function if exists public.notifications_marquer(uuid, date);

create or replace function public.notifications_a_envoyer(p_ref timestamptz default now())
returns table (user_id uuid, endpoint text, p256dh text, auth text, titre text, corps text, jour date, genre text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  d date;
  h integer;
  g text;
  n_app integer;
  n_rev integer;
  n_err integer;
  texte_rappels text;
  texte_partiels text;
  texte_pratique text;
  morceaux text[];
  n integer;
begin
  for r in select s.user_id as uid, s.heure as heure_voulue, s.fuseau as fuseau, s.dernier_envoi as dernier, s.relance as veut_relance, s.derniere_relance as relance_faite
             from public.notifications_reglage s where s.actif loop
    begin
      d := (p_ref at time zone r.fuseau)::date;
      h := extract(hour from (p_ref at time zone r.fuseau))::integer;
      -- À l'heure choisie : le rappel du jour. Trois heures plus tard : la relance (pas si elle sortirait de la journée).
      if h = r.heure_voulue and r.dernier is distinct from d then
        g := 'rappel';
      elsif r.veut_relance and r.heure_voulue + 3 <= 23 and h = r.heure_voulue + 3 and r.relance_faite is distinct from d then
        g := 'relance';
      else
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
      select string_agg(c.titre || ' (' || c.pratique_min || ' min)', ', ' order by c.titre) into texte_pratique
        from public.cours c
       where c.user_id = r.uid and c.pratique_min is not null and not c.en_pause and (c.partiel is null or c.partiel >= d)
         and round(
               coalesce((select sum(p.minutes) from public.pratiques p where p.user_id = r.uid and p.cours_id = c.id and p.jour = d and p.sorte = 'erreurs'), 0)
               + coalesce((select sum(greatest(0, extract(epoch from (s.fin - s.debut)) - s.pause_secondes)) / 60.0
                             from public.sessions s
                            where s.user_id = r.uid and s.fin is not null
                              and lower(regexp_replace(btrim(s.categorie), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(c.titre), '\s+', ' ', 'g') || ' · erreurs')
                              and (s.debut at time zone r.fuseau)::date = d), 0)
             ) < c.pratique_min;

      -- Une ligne par chose, la plus pressante en premier : le partiel proche, puis ce qui s'apprend, puis le reste.
      morceaux := array[]::text[];
      if texte_partiels is not null then morceaux := morceaux || ('Partiel de ' || texte_partiels || ' : la fiche de la veille t’attend'); end if;
      if n_app > 0 then morceaux := morceaux || (n_app || case when n_app > 1 then ' pages à apprendre par cœur' else ' page à apprendre par cœur' end); end if;
      if n_rev > 0 then morceaux := morceaux || (n_rev || case when n_rev > 1 then ' pages à réviser' else ' page à réviser' end); end if;
      if n_err > 0 then morceaux := morceaux || (n_err || case when n_err > 1 then ' erreurs de retour' else ' erreur de retour' end); end if;
      if texte_pratique is not null then morceaux := morceaux || ('Pratique du jour : ' || texte_pratique); end if;
      if texte_rappels is not null then morceaux := morceaux || ('À faire : ' || texte_rappels); end if;
      n := coalesce(array_length(morceaux, 1), 0);
      if n = 0 then
        continue;
      end if;

      return query
        select a.user_id, a.endpoint, a.p256dh, a.auth,
               case when g = 'relance'
                    then case when n = 1 then 'Il te reste une chose' else 'Il te reste ' || n || ' choses' end
                    else case when n = 1 then 'Une chose t’attend aujourd’hui' else n || ' choses t’attendent aujourd’hui' end end,
               '• ' || array_to_string(morceaux, E'\n• '), d, g
          from public.abonnements_push a where a.user_id = r.uid;
    exception when others then
      -- Un fuseau illisible ou une donnée étrange chez UNE personne ne doit pas priver les autres de leur rappel.
      continue;
    end;
  end loop;
end;
$$;

-- Après l'envoi : un seul rappel et une seule relance par jour.
create or replace function public.notifications_marquer(p_user uuid, p_jour date, p_genre text default 'rappel')
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notifications_reglage
     set dernier_envoi = case when p_genre = 'relance' then dernier_envoi else p_jour end,
         derniere_relance = case when p_genre = 'relance' then p_jour else derniere_relance end
   where user_id = p_user;
$$;

-- Supabase accorde d'office l'exécution des nouvelles fonctions à anon et authenticated : « revoke from public » ne
-- la retire pas. Ces fonctions lisent ou écrivent pour tous les comptes : seul le rôle de service les appelle.
revoke all on function public.notifications_a_envoyer(timestamptz) from public, anon, authenticated;
revoke all on function public.notifications_marquer(uuid, date, text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.notifications_a_envoyer(timestamptz) to service_role;
    grant execute on function public.notifications_marquer(uuid, date, text) to service_role;
  end if;
end;
$$;

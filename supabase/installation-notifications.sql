-- À lancer UNE FOIS sur le projet Supabase, après la migration 20261112 (éditeur SQL, « Run »). Rejouable.
-- Propre à Supabase (Vault, pg_cron, pg_net) : absent des migrations, qui se vérifient sur un PostgreSQL nu.
-- Aucun secret dans ce fichier : le secret de l'appel est tiré au hasard ICI, dans la base ; les clés VAPID sont
-- créées au premier appel de la fonction Edge `rappel-push` et rangées dans le même coffre.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hameau_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'hameau_cron_secret', 'Secret de l''appel du rappel quotidien');
  end if;
end;
$$;

-- Lues et écrites par la fonction Edge seulement (rôle de service) : un compte ne lit jamais une clé privée.
create or replace function public.cles_push()
returns table (publique text, privee text, cron text)
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select (select decrypted_secret from vault.decrypted_secrets where name = 'hameau_vapid_public'),
         (select decrypted_secret from vault.decrypted_secrets where name = 'hameau_vapid_private'),
         (select decrypted_secret from vault.decrypted_secrets where name = 'hameau_cron_secret');
$$;

-- Écrit la paire de clés si elle n'existe pas encore ; ne remplace jamais une paire existante (les abonnements déjà
-- pris en dépendent : en changer les rendrait tous muets).
create or replace function public.cles_push_enregistrer(p_publique text, p_privee text)
returns boolean
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
begin
  if exists (select 1 from vault.secrets where name = 'hameau_vapid_public') then
    return false;
  end if;
  perform vault.create_secret(p_publique, 'hameau_vapid_public', 'Clé publique VAPID');
  perform vault.create_secret(p_privee, 'hameau_vapid_private', 'Clé privée VAPID');
  return true;
end;
$$;

revoke all on function public.cles_push() from public, anon, authenticated;
revoke all on function public.cles_push_enregistrer(text, text) from public, anon, authenticated;
grant execute on function public.cles_push() to service_role;
grant execute on function public.cles_push_enregistrer(text, text) to service_role;

-- Tous les quarts d'heure : la fonction dit à qui envoyer (ceux dont c'est l'heure, dans leur fuseau, une fois par jour).
-- Remplacer <REF> par la référence du projet (Réglages > Général), ex. nisjysdlyryyrsgwmcaa.
select cron.schedule(
  'hameau-rappel-quotidien',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://<REF>.supabase.co/functions/v1/rappel-push',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hameau_cron_secret')),
    body := '{"action":"cron"}'::jsonb
  );
  $cron$
);

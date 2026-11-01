import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Adresse du projet et clé PUBLIABLE : elles sont faites pour être livrées au
// navigateur, la sécurité repose sur les politiques RLS de la base. Elles
// vivent ici, et nulle part ailleurs : une copie dans les réglages du dépôt
// finirait par diverger de celle-ci sans que rien ne le signale.
// Une clé secrète (service_role, sb_secret_…) ne doit JAMAIS apparaître ici.
const PROJET = {
  url: 'https://nisjysdlyryyrsgwmcaa.supabase.co',
  cle: 'sb_publishable_06uV9QEJP7WmyV31tKe9pQ_yvGjTp-c',
};

// Pour développer contre un autre projet : VITE_SUPABASE_URL et
// VITE_SUPABASE_PUBLISHABLE_KEY dans .env.local. Chaîne vide = non réglé.
const URL_SUPABASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || PROJET.url;
const CLE_PUBLIQUE = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || PROJET.cle;

export const urlSupabase = URL_SUPABASE;
export const clePublique = CLE_PUBLIQUE;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!URL_SUPABASE || !CLE_PUBLIQUE) return null;
  client ??= createClient(URL_SUPABASE, CLE_PUBLIQUE, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

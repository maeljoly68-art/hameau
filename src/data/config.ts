import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Adresse du projet et clé PUBLIABLE (anon) : elles sont faites pour être
// livrées au navigateur, la sécurité repose sur les politiques RLS. Aucune
// clé secrète (service_role) ne doit jamais porter le préfixe VITE_.
const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CLE_PUBLIQUE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const urlSupabase = URL_SUPABASE ?? '';
export const clePublique = CLE_PUBLIQUE ?? '';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!URL_SUPABASE || !CLE_PUBLIQUE) return null;
  client ??= createClient(URL_SUPABASE, CLE_PUBLIQUE, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

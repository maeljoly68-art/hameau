import type { SupabaseClient } from '@supabase/supabase-js';

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
export const urlSupabase = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || PROJET.url;
export const clePublique = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || PROJET.cle;

/**
 * Sillage, l'autre application : son adresse et sa clé PUBLIABLE (publique
 * par conception, comme celle de Hameau). Hameau s'y connecte avec le compte
 * Sillage de la personne, et ses règles d'accès s'appliquent telles quelles :
 * aucun droit de plus que dans Sillage même.
 */
export const SILLAGE = {
  url: 'https://rabdbdchtyogqitppsao.supabase.co',
  cle: 'sb_publishable_PnitE2JdCXhDlg1X2D7g6w_CM0id3p7',
  app: 'https://maeljoly68-art-jdtpromaelfx.maeljoly68.workers.dev',
} as const;

/**
 * L'adresse de l'app, celle où les e-mails (confirmation d'inscription, mot
 * de passe oublié) ramènent la personne. Sans elle, Supabase renverrait vers
 * l'adresse par défaut du projet, qui n'est pas celle de l'app.
 */
export const adresseApp = () => new URL(import.meta.env.BASE_URL, location.origin).href;

let promesse: Promise<SupabaseClient> | null = null;

/**
 * Client Supabase, chargé à la demande. La bibliothèque pèse plus que tout le
 * reste de l'app réuni : l'importer d'emblée retarderait le premier affichage
 * du village, alors que le cache suffit à le peindre.
 */
export function client(): Promise<SupabaseClient> {
  promesse ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(urlSupabase, clePublique, { auth: { persistSession: true, autoRefreshToken: true } }),
  );
  return promesse;
}

/** Clé sous laquelle supabase-js range la connexion dans localStorage. */
const CLE_AUTH = `sb-${new URL(urlSupabase).hostname.split('.')[0]}-auth-token`;

export interface CompteLocal {
  id: string;
  email: string | null;
}

/**
 * Le compte connecté, lu SANS charger la bibliothèque : de quoi afficher le
 * bon hameau tout de suite. Ce n'est qu'un indice — la bibliothèque, une fois
 * chargée, confirme ou déconnecte.
 */
export function compteLocal(): CompteLocal | null {
  try {
    const brut = localStorage.getItem(CLE_AUTH);
    if (!brut) return null;
    const u = (JSON.parse(brut) as { user?: { id?: string; email?: string } }).user;
    return u?.id ? { id: u.id, email: u.email ?? null } : null;
  } catch {
    return null;
  }
}

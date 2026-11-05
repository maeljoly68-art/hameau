// Mot de passe oublié : lecture du lien reçu par e-mail, règles du nouveau
// mot de passe, messages d'erreur. Pur : rien n'est lu ni envoyé d'ici.

export type LienAuth =
  /** Lien de récupération valide : une connexion temporaire vient avec lui. */
  | { type: 'recuperation' }
  /** Lien périmé, déjà ouvert, ou refusé. */
  | { type: 'erreur'; code: string };

/**
 * Ce que l'adresse de la page dit d'un lien reçu par e-mail. Supabase ramène
 * la personne sur l'app avec tout dans le FRAGMENT (« #… ») :
 *  - « #access_token=…&type=recovery » : le lien est bon ;
 *  - « #error=access_denied&error_code=otp_expired… » : il ne l'est plus.
 * Le reste (une invitation « #ami=… », la confirmation d'une inscription,
 * « type=signup ») n'est pas de son ressort : null.
 */
export function lireLienAuth(fragment: string): LienAuth | null {
  const p = new URLSearchParams(fragment.replace(/^#/, ''));
  if (p.has('error') || p.has('error_code') || p.has('error_description')) return { type: 'erreur', code: p.get('error_code') ?? p.get('error') ?? 'inconnue' };
  // Le type SEUL ne suffit pas, ni le jeton seul : une confirmation
  // d'inscription porte un jeton aussi, et ne doit pas ouvrir cet écran.
  if (p.get('type') === 'recovery' && p.has('access_token')) return { type: 'recuperation' };
  return null;
}

export const MOT_DE_PASSE_MIN = 8;
/** Limite de bcrypt, que Supabase applique : au-delà, la base refuse (ou tronque) le mot de passe. */
export const MOT_DE_PASSE_MAX_OCTETS = 72;

/** Pourquoi ce nouveau mot de passe ne peut pas être enregistré, ou null s'il peut l'être. */
export function validerNouveauMotDePasse(motDePasse: string, confirmation: string): string | null {
  // Par caractères et non par unités UTF-16 : un émoji compte pour un.
  if ([...motDePasse].length < MOT_DE_PASSE_MIN) return `Choisis un mot de passe d’au moins ${MOT_DE_PASSE_MIN} caractères.`;
  // Par OCTETS : « é » en pèse deux, un émoji quatre. 40 lettres accentuées
  // dépassent la limite sans que la longueur affichée le laisse croire.
  if (new TextEncoder().encode(motDePasse).length > MOT_DE_PASSE_MAX_OCTETS) return 'Mot de passe trop long : 72 caractères au plus (les accents et les émojis en comptent plusieurs).';
  // Les espaces sont permis dans un mot de passe, mais pas qu'eux.
  if (motDePasse.trim() === '') return 'Choisis un mot de passe qui ne soit pas fait que d’espaces.';
  // Pas de « trim » avant de comparer : un espace de fin en trop dans l'un
  // des deux champs EST une différence, qui enfermerait dehors au prochain essai.
  if (motDePasse !== confirmation) return 'Les deux mots de passe ne sont pas identiques.';
  return null;
}

/**
 * Les erreurs de Supabase arrivent en anglais, et plusieurs ne disent pas
 * quoi faire. `code` est celui de l'erreur quand la bibliothèque le donne.
 */
export function traduireErreurAuth(message: string, code?: string): string {
  const m = message;
  if (/invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
  if (/email not confirmed/i.test(m)) return 'Adresse pas encore confirmée : clique sur le lien reçu par email.';
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cette adresse.';
  // Deux limites d'envoi, à ne pas confondre : une par personne (« after 52
  // seconds », qui passe vite) et une pour tout le projet, par heure.
  const attente = /after (\d+) seconds?/i.exec(m);
  if (attente) return `Un lien vient d’être demandé : réessaie dans ${attente[1]} s.`;
  if (code === 'over_email_send_rate_limit' || /rate limit|too many/i.test(m)) return 'Trop d’e-mails envoyés pour le moment : réessaie dans une heure.';
  if (code === 'email_address_not_authorized' || /not authorized/i.test(m)) return 'Impossible d’envoyer un e-mail à cette adresse pour le moment.';
  if (code === 'email_address_invalid' || /unable to validate email|invalid format|email address.*invalid/i.test(m)) return 'Cette adresse e-mail n’est pas valide.';
  if (code === 'same_password' || /should be different from the old password/i.test(m)) return 'C’est déjà ton mot de passe actuel : choisis-en un nouveau.';
  const court = /at least (\d+) characters?/i.exec(m);
  if (court) return `Mot de passe trop court (${court[1]} caractères minimum).`;
  if (/longer than 72|too long/i.test(m)) return 'Mot de passe trop long : 72 caractères au plus.';
  if (/known to be weak|easy to guess|pwned/i.test(m)) return 'Ce mot de passe est trop courant : choisis-en un autre.';
  if (code === 'weak_password' || /should contain at least one character/i.test(m)) return 'Mot de passe refusé : mélange lettres, chiffres et symboles.';
  if (estSessionPerdue(m, code)) return 'Ce lien n’est plus valable : demandes-en un nouveau.';
  return m;
}

/** La connexion que le lien avait ouverte n'existe plus (lien refermé, expiré, ou déconnexion ailleurs). */
export function estSessionPerdue(message: string, code?: string): boolean {
  return code === 'session_not_found' || code === 'session_expired' || /auth session missing|session.*(not found|expired)/i.test(message);
}

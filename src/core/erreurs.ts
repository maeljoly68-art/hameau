// Le carnet d'erreurs : une ligne par erreur, écrite au moment où on se trompe, qui revient plus tard. Pur.
//
// Se corriger sur le moment ne suffit pas : l'erreur qu'on a comprise mardi est celle qu'on refait samedi. Chaque
// erreur notée revient une première fois quelques jours après, puis tant qu'on n'a pas dit « je sais » ; et elle
// finit dans la fiche de la veille du partiel.
import { ecartJours } from './jours.ts';

export interface Erreur {
  id: string;
  chapitreId: string;
  texte: string;
  /** Le jour où on s'est trompé. */
  jour: string;
  /** Le jour où on a dit « je sais » : l'erreur ne revient plus. */
  regleeLe: string | null;
  /** Le dernier jour où elle est revenue sans être sue (« encore flou »). */
  revueLe: string | null;
}

export const ERREUR_TEXTE_MAX = 300;
/** Une erreur revient 6 jours après : assez tard pour que le rappel coûte, assez tôt pour qu'elle ne soit pas oubliée. */
export const ERREUR_PREMIER_RETOUR = 6;
/** « Encore flou » : elle revient 3 jours plus tard. */
export const ERREUR_RETOUR_SUIVANT = 3;
/** Au plus deux erreurs par jour : un carnet qui déborde n'est plus relu. */
export const ERREURS_PAR_JOUR = 2;

/** Le texte tel qu'on l'enregistre : espaces nettoyés, borné ; null s'il ne reste rien. */
export function texteErreur(brut: string): string | null {
  const t = brut.replace(/\s+/g, ' ').trim().slice(0, ERREUR_TEXTE_MAX).trim();
  return t === '' ? null : t;
}

export function erreurValide(brut: unknown): Erreur | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.chapitreId !== 'string' || typeof o.texte !== 'string' || typeof o.jour !== 'string') return null;
  const texte = texteErreur(o.texte);
  if (texte === null) return null;
  const jour = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const j = jour(o.jour);
  if (j === null) return null;
  return { id: o.id, chapitreId: o.chapitreId, texte, jour: j, regleeLe: jour(o.regleeLe), revueLe: jour(o.revueLe) };
}

/** Pas encore sue ? */
export const estOuverte = (e: Erreur): boolean => e.regleeLe === null;

/** L'erreur est-elle de retour aujourd'hui ? Jamais le jour même où on l'a notée, ni une fois sue. */
export function estDue(e: Erreur, aujourdhui: string): boolean {
  if (!estOuverte(e)) return false;
  const depuis = e.revueLe ?? e.jour;
  return ecartJours(depuis, aujourdhui) >= (e.revueLe === null ? ERREUR_PREMIER_RETOUR : ERREUR_RETOUR_SUIVANT);
}

/** Les erreurs de retour aujourd'hui : les plus anciennes d'abord, deux au plus. */
export function erreursDuJour(erreurs: readonly Erreur[], aujourdhui: string, dejaRevues = 0): Erreur[] {
  const reste = Math.max(0, ERREURS_PAR_JOUR - Math.max(0, Math.floor(dejaRevues)));
  return erreurs
    .filter((e) => estDue(e, aujourdhui))
    .sort((a, b) => (a.revueLe ?? a.jour).localeCompare(b.revueLe ?? b.jour) || a.jour.localeCompare(b.jour) || a.id.localeCompare(b.id))
    .slice(0, reste);
}

// Ta vitesse d'apprentissage, apprise au fil de ce que tu coches. Pur.
//
// L'estimation d'une page vient de sa taille (environ 30 mots à la minute) : une moyenne. Ta vitesse est le
// rapport entre ton temps réel et cette estimation. Elle se règle à la main, et chaque lecture que tu coches
// (« plus vite », « comme prévu », « plus lent ») ou que tu chronomètres la rapproche de la réalité.
import { VITESSE_MAX, VITESSE_MIN, vitesseValide } from './cours.ts';

export type Ressenti = 'plus-vite' | 'prevu' | 'plus-lent';

/** Ce que veut dire chaque coche, par rapport au temps annoncé AVEC ta vitesse du moment. */
export const RAPPORT_RESSENTI: Record<Ressenti, number> = { 'plus-vite': 0.75, prevu: 1, 'plus-lent': 1.35 };
/** Une coche est un ressenti : elle pèse peu. Un chrono est une mesure : elle pèse plus. */
export const POIDS_COCHE = 0.3;
export const POIDS_CHRONO = 0.5;
/**
 * Un chrono hors de ces bornes est une erreur — minuteur oublié pendant une pause, appui par mégarde — et pas ta
 * vitesse : il est ignoré, sinon dix heures de chrono feraient passer la vitesse du simple au double d'un coup.
 */
export const RAPPORT_CHRONO_IGNORE_MIN = 0.2;
export const RAPPORT_CHRONO_IGNORE_MAX = 5;
/** Dans ces bornes, un chrono ne pèse pas plus que ce rapport : une mauvaise journée ne réécrit pas ta vitesse. */
export const RAPPORT_CHRONO_MIN = 0.5;
export const RAPPORT_CHRONO_MAX = 2;

/** Approche la vitesse de `vitesse × rapport`, du poids donné ; jamais hors des bornes. */
function approcher(vitesse: number, rapport: number, poids: number): number {
  const v = vitesseValide(vitesse);
  return vitesseValide(v * (1 + poids * (rapport - 1)));
}

export function vitesseApresCoche(vitesse: number, ressenti: Ressenti): number {
  return approcher(vitesse, RAPPORT_RESSENTI[ressenti], POIDS_COCHE);
}

/**
 * Après un chrono : `minutesReelles` (pauses déduites) contre `minutesPrevues` (annoncées avec la vitesse du
 * moment). Une durée absente ou nulle n'apprend rien (`null`, jamais 0 : une session sans durée n'est pas une
 * session instantanée).
 */
export function vitesseApresChrono(vitesse: number, minutesReelles: number | null, minutesPrevues: number): number {
  if (minutesReelles === null) return vitesseValide(vitesse);
  // Une durée nulle, négative, illisible, ou rien de prévu donnent un rapport hors de ces bornes (ou illisible) : ignoré.
  const brut = minutesReelles / minutesPrevues;
  if (!(brut >= RAPPORT_CHRONO_IGNORE_MIN && brut <= RAPPORT_CHRONO_IGNORE_MAX)) return vitesseValide(vitesse);
  return approcher(vitesse, Math.min(RAPPORT_CHRONO_MAX, Math.max(RAPPORT_CHRONO_MIN, brut)), POIDS_CHRONO);
}

/** « 1,3 » → « 30 % plus lent que la moyenne » ; pour l'écran. */
export function libelleVitesse(vitesse: number): string {
  const v = vitesseValide(vitesse);
  const ecart = Math.round(Math.abs(v - 1) * 100);
  if (ecart < 3) return 'comme l’estimation';
  return v > 1 ? `${ecart} % plus lent que l’estimation` : `${ecart} % plus rapide que l’estimation`;
}

export { VITESSE_MAX, VITESSE_MIN };

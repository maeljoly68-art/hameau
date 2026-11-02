// Objectif d'une session : le chrono monte, et un compte à rebours vers la
// durée visée tourne en parallèle. Pur : l'écoulé est passé en paramètre.
import { BLOC_MINUTES, PLAFOND_MINUTES } from './points.ts';

export const DUREES_PROPOSEES = [25, 50, 90] as const;
export const OBJECTIF_MAX = 600;

export interface Progression {
  /** Part de l'objectif accomplie, bornée à 1 pour l'anneau. */
  ratio: number;
  atteint: boolean;
  /** Minutes restantes avant l'objectif ; 0 une fois atteint. */
  reste: number;
  /** Minutes faites au-delà de l'objectif. */
  auDela: number;
}

/** null pour une session libre : il n'y a rien à remplir, pas « 0 % ». */
export function progression(ecouleMin: number, objectif: number | null): Progression | null {
  if (objectif === null || !Number.isFinite(objectif) || objectif <= 0) return null;
  const e = Math.max(0, ecouleMin);
  return {
    ratio: Math.min(1, e / objectif),
    atteint: e >= objectif,
    reste: Math.max(0, objectif - e),
    auDela: Math.max(0, e - objectif),
  };
}

/**
 * Minutes avant le prochain bonus de bloc. null au-delà du plafond : promettre
 * un bonus que le barème ne versera jamais serait mentir.
 */
export function prochainBonus(ecouleMin: number): number | null {
  const e = Math.max(0, ecouleMin);
  const prochain = (Math.floor(e / BLOC_MINUTES) + 1) * BLOC_MINUTES;
  if (prochain > PLAFOND_MINUTES) return null;
  return prochain - e;
}

/** Objectif saisi → valeur stockable, ou null s'il ne veut rien dire. */
export function objectifValide(v: unknown): number | null {
  const n = Math.round(Number(v));
  // Number(null) et Number('') valent 0 : c'est « n > 0 » qui empêche « pas
  // d'objectif » de devenir un objectif de zéro minute, atteint d'emblée.
  return Number.isFinite(n) && n > 0 && n <= OBJECTIF_MAX ? n : null;
}

// Barème des points de concentration. Pur : ni réseau, ni React.

/** En dessous, une session ne rapporte rien : démarrer/arrêter en boucle ne doit pas payer. */
export const MINUTES_MINIMUM = 5;
/**
 * Au-delà, les minutes ne rapportent plus. Un chrono oublié toute la nuit
 * ferait sinon gagner 600 points d'un coup et viderait le jeu de son sens.
 */
export const PLAFOND_MINUTES = 240;
/** Chaque bloc ininterrompu de cette durée donne un bonus : on récompense la concentration longue. */
export const BLOC_MINUTES = 25;
export const BONUS_PAR_BLOC = 5;

/** Points gagnés pour une session de `minutes` minutes. */
export function pointsSession(minutes: number | null): number {
  // null = session en cours ou dates illisibles : elle ne vaut rien tant
  // qu'elle n'est pas close, et surtout pas « 0 minute » par conversion.
  if (minutes === null || !Number.isFinite(minutes)) return 0;
  if (minutes < MINUTES_MINIMUM) return 0;
  const m = Math.floor(Math.min(minutes, PLAFOND_MINUTES));
  return m + Math.floor(m / BLOC_MINUTES) * BONUS_PAR_BLOC;
}

/** Points nécessaires pour ATTEINDRE le niveau n (niveau 1 = 0). */
export function seuilNiveau(n: number): number {
  // Progression triangulaire : chaque niveau demande 60 points de plus que le
  // précédent, soit environ une heure de concentration supplémentaire.
  return (60 * (n - 1) * n) / 2;
}

export interface Niveau {
  niveau: number;
  /** Points gagnés depuis le début du niveau courant. */
  dansNiveau: number;
  /** Points que demande le niveau courant en entier. */
  tailleNiveau: number;
}

/** Niveau atteint pour un total de points GAGNÉS (les dépenses ne font pas reculer). */
export function niveauPour(pointsGagnes: number): Niveau {
  const p = Math.max(0, Math.floor(pointsGagnes));
  let n = 1;
  while (seuilNiveau(n + 1) <= p) n++;
  const bas = seuilNiveau(n);
  return { niveau: n, dansNiveau: p - bas, tailleNiveau: seuilNiveau(n + 1) - bas };
}

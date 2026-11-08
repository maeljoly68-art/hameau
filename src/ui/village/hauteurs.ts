// Où finit le toit de chaque bâtiment : de quoi poser une petite flèche juste au-dessus. Pur.

/**
 * Où finit le toit de chaque bâtiment (en pixels au-dessus de sa base) au niveau 1 puis au niveau 2, mesuré sur le dessin :
 * la flèche d'amélioration se pose juste au-dessus. Au niveau 3 il n'y a plus rien à améliorer.
 */
export const HAUT_BATIMENT: Readonly<Record<string, readonly [number, number]>> = {
  fleurs: [8, 10],
  arbre: [35, 40],
  cabane: [28, 28],
  lanterne: [45, 45],
  ruche: [30, 30],
  potager: [15, 34],
  puits: [32, 32],
  maison: [40, 43],
  etang: [12, 12],
  moulin: [62, 62],
  forge: [40, 40],
  bibliotheque: [38, 38],
  marche: [32, 32],
  tour: [80, 80],
  observatoire: [51, 54],
  chateau: [68, 68],
};

/** Ordonnée du haut du bâtiment (négative : au-dessus de sa base). Un bâtiment inconnu : une hauteur moyenne. */
export function hautDuBatiment(id: string, niveau: number): number {
  const h = HAUT_BATIMENT[id];
  return -(h ? h[niveau >= 2 ? 1 : 0] : 40);
}


// La promenade d'un habitant : un tour au hasard dans le village, qui part de sa maison et y revient. Pur.
//
// Avant, tous les habitants faisaient la même chose (maison → feu → maison) : ils allaient dans le même sens, comme
// des perles sur un fil. Chacun a maintenant son propre tour, tiré au hasard — mais d'un hasard REPRODUCTIBLE
// (une graine, pas Math.random) : le village se redessine à chaque survol, et un tour qui changerait à chaque
// dessin ferait repartir les habitants de zéro, en saccades.

export interface Case {
  x: number;
  y: number;
}

/** Une case, comme clé d'ensemble (« x,y »), la même que celle des cases occupées du village. */
export const cle = (c: Case): string => `${c.x},${c.y}`;

/** Un nombre au hasard entre 0 et 1, toujours le même pour une graine donnée (mulberry32). */
export function aleatoire(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Une graine à partir de quelques nombres (rang de l'habitant, case de sa maison…) : deux habitants ne partagent pas la leur. */
export function graine(...nombres: number[]): number {
  let h = 2166136261;
  for (const n of nombres) {
    h = Math.imul(h ^ (Math.floor(n) + 0x9e3779b9), 16777619);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** Un arrêt n'est pas à moins de 2 cases du précédent : sinon le tour ne serait qu'un piétinement. */
export const DISTANCE_MIN = 2;
/** Un tour compte de 3 à 5 arrêts avant le retour à la maison. */
export const ARRETS_MIN = 3;
export const ARRETS_MAX = 5;

export interface EntreeTour {
  graine: number;
  maison: Case;
  /** Les autres maisons : on passe parfois chez un voisin. */
  voisins: readonly Case[];
  feu: Case;
  /** Côté du terrain : les cases vont de 0 à taille − 1. */
  taille: number;
  /** Cases prises (bâtiments, feu), « x,y » : on ne marche pas dedans. */
  occupees: ReadonlySet<string>;
}

const distance = (a: Case, b: Case) => Math.hypot(a.x - b.x, a.y - b.y);

/** Une case libre à côté de `c`, la plus proche de `depuis` ; null si elles sont toutes prises. */
function voisineLibre(c: Case, depuis: Case, e: EntreeTour): Case | null {
  const candidates: Case[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const v = { x: c.x + dx, y: c.y + dy };
      if ((dx !== 0 || dy !== 0) && v.x >= 0 && v.y >= 0 && v.x < e.taille && v.y < e.taille && !e.occupees.has(cle(v))) candidates.push(v);
    }
  candidates.sort((a, b) => distance(a, depuis) - distance(b, depuis) || a.x - b.x || a.y - b.y);
  return candidates[0] ?? null;
}

/**
 * Le tour d'un habitant : sa maison, 3 à 5 arrêts, sa maison. Un arrêt est, au hasard, le feu (un peu moins d'une
 * fois sur quatre), le seuil d'un voisin (autant) ou n'importe quelle case libre du terrain — c'est elle qui donne
 * des directions dans tous les sens. Jamais deux arrêts de suite à moins de `DISTANCE_MIN` cases.
 */
export function tracerTour(e: EntreeTour): Case[] {
  const hasard = aleatoire(e.graine);
  const libres: Case[] = [];
  for (let y = 0; y < e.taille; y++) for (let x = 0; x < e.taille; x++) if (!e.occupees.has(`${x},${y}`)) libres.push({ x, y });
  const nombre = ARRETS_MIN + Math.floor(hasard() * (ARRETS_MAX - ARRETS_MIN + 1));
  const tour: Case[] = [e.maison];
  for (let i = 0; i < nombre; i++) {
    const depuis = tour[tour.length - 1];
    let choisi: Case | null = null;
    // Quelques essais : un tirage trop proche est refait, pas gardé.
    for (let essai = 0; essai < 12 && choisi === null; essai++) {
      const tirage = hasard();
      let candidat: Case | null;
      if (tirage < 0.22) candidat = voisineLibre(e.feu, depuis, e);
      else if (tirage < 0.44 && e.voisins.length > 0) candidat = voisineLibre(e.voisins[Math.floor(hasard() * e.voisins.length)], depuis, e);
      else candidat = libres.length > 0 ? libres[Math.floor(hasard() * libres.length)] : null;
      if (candidat !== null && distance(candidat, depuis) >= DISTANCE_MIN) choisi = candidat;
    }
    if (choisi !== null) tour.push(choisi);
  }
  // Aucun arrêt assez loin : s'il reste une case libre près du feu, l'habitant y va au moins ; sinon (terrain plein), il reste chez lui.
  if (tour.length === 1) {
    const feu = voisineLibre(e.feu, e.maison, e);
    if (feu !== null) tour.push(feu);
  }
  tour.push(e.maison);
  return tour;
}

/** Longueur d'un tour, dans l'unité des points donnés (la durée de marche s'en déduit : même allure pour tous les chemins). */
export function longueurTour(points: readonly { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

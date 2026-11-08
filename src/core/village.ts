// Règles du village : catalogue, taille du terrain, solde, placement. Pur.
import { pointsSession } from './points.ts';
import { dureeSession } from './session.ts';
import type { Construction, Session } from './types.ts';

export interface Batiment {
  id: string;
  nom: string;
  cout: number;
  niveauRequis: number;
  description: string;
  /** Ce que changent les niveaux 2 et 3, en quelques mots. */
  ameliorations: readonly [string, string];
  /** Nom féminin : « la maison est construite », pas « construit ». */
  f?: true;
}

/** Accorde un participe avec le nom du bâtiment : « Maison démolie », « Moulin démoli ». */
export function accord(b: Pick<Batiment, 'f'> | undefined, participe: string): string {
  return b?.f ? `${participe}e` : participe;
}

export const CATALOGUE: readonly Batiment[] = [
  { id: 'fleurs', nom: 'Parterre de fleurs', cout: 10, niveauRequis: 1, description: 'Un peu de couleur.', ameliorations: ['Deux fois plus de fleurs', 'Une vasque où boivent les oiseaux'] },
  { id: 'arbre', nom: 'Chêne', cout: 15, niveauRequis: 1, description: 'Il pousse pendant que tu bosses.', ameliorations: ['Une ramure plus large et un nichoir', 'Un arbre centenaire, chargé de fruits'] },
  { id: 'cabane', nom: 'Cabane', f: true, cout: 40, niveauRequis: 1, description: 'Le premier toit du hameau.', ameliorations: ['Une fenêtre et un tas de bois', 'Une cheminée de pierre et une lanterne'] },
  { id: 'lanterne', nom: 'Lanterne', f: true, cout: 20, niveauRequis: 2, description: 'Elle s’allume à la nuit tombée.', ameliorations: ['Un second bras, une seconde flamme', 'Un candélabre de fer forgé'] },
  { id: 'ruche', nom: 'Ruche', f: true, cout: 35, niveauRequis: 2, description: 'Les abeilles bourdonnent quand tu bosses.', ameliorations: ['Une deuxième ruche', 'Un rucher et ses pots de miel'] },
  { id: 'potager', nom: 'Potager', cout: 50, niveauRequis: 2, description: 'Ce qu’on sème finit par pousser.', ameliorations: ['Un épouvantail veille', 'Des citrouilles et une clôture'] },
  { id: 'puits', nom: 'Puits', cout: 60, niveauRequis: 2, description: 'Une source fiable.', ameliorations: ['Un seau et sa manivelle', 'Un toit de tuiles et des pots fleuris'] },
  { id: 'maison', nom: 'Maison', f: true, cout: 90, niveauRequis: 3, description: 'Un villageois s’installe.', ameliorations: ['Une cheminée et des jardinières', 'Une annexe et une girouette'] },
  { id: 'etang', nom: 'Étang', cout: 120, niveauRequis: 3, description: 'Calme et profond.', ameliorations: ['Des nénuphars et un canard', 'Un ponton de bois et des roseaux'] },
  { id: 'moulin', nom: 'Moulin', cout: 200, niveauRequis: 4, description: 'Le travail régulier fait tourner les ailes.', ameliorations: ['Un socle de pierre et des sacs de farine', 'De grandes ailes et un fanion'] },
  { id: 'forge', nom: 'Forge', f: true, cout: 250, niveauRequis: 5, description: 'On y façonne ce qui dure.', ameliorations: ['Une enclume devant la porte', 'Une seconde cheminée, un feu plus vif'] },
  { id: 'bibliotheque', nom: 'Bibliothèque', f: true, cout: 300, niveauRequis: 6, description: 'Tout ce que tu as appris.', ameliorations: ['Des bannières et un banc de lecture', 'Une coupole dorée'] },
  { id: 'marche', nom: 'Marché', cout: 350, niveauRequis: 7, description: 'Le hameau commerce avec ses voisins.', ameliorations: ['Des cageots bien remplis', 'Des fanions de fête'] },
  { id: 'tour', nom: 'Tour de guet', f: true, cout: 450, niveauRequis: 8, description: 'On voit loin.', ameliorations: ['Des torches pour la nuit', 'Une flèche dorée'] },
  { id: 'observatoire', nom: 'Observatoire', cout: 800, niveauRequis: 10, description: 'Pour les longues nuits de travail.', ameliorations: ['Une plus grande lunette', 'Une coupole d’or étoilée'] },
  { id: 'chateau', nom: 'Château', cout: 1500, niveauRequis: 14, description: 'Le hameau est devenu une ville.', ameliorations: ['Des bannières aux tours', 'Des toits d’or'] },
];

/** Habitants logés par bâtiment : seuls les toits comptent. */
const HABITANTS: Readonly<Record<string, number>> = { cabane: 1, maison: 2, forge: 1, moulin: 1, bibliotheque: 1, marche: 2, chateau: 4 };

/** Habitants logés par ce bâtiment à ce niveau : un de plus par amélioration, s'il a un toit. */
export function habitants(id: string, niveau: number): number {
  const base = HABITANTS[id] ?? 0;
  return base > 0 ? base + niveauValide(niveau) - 1 : 0;
}

/** Population du hameau : le gardien du feu, plus les habitants logés. */
export function population(constructions: readonly Construction[]): number {
  let n = 1;
  for (const c of constructions) n += habitants(c.batiment, c.niveau);
  return n;
}

export const NIVEAU_MAX = 3;

/** Niveau d'un bâtiment lu en base ou sur l'appareil : les anciennes données n'en ont pas. */
export function niveauValide(n: unknown): number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= NIVEAU_MAX ? n : 1;
}

/** Prix pour passer du niveau `actuel` au suivant, ou null au niveau maximal. */
export function coutAmelioration(b: Batiment, actuel: number): number | null {
  if (actuel >= NIVEAU_MAX) return null;
  // Moins cher que de construire au niveau 2, plus cher au niveau 3 : la
  // première amélioration se tente, la dernière se mérite.
  return Math.round(b.cout * (actuel <= 1 ? 0.8 : 1.6));
}

/** Niveau du village demandé pour porter ce bâtiment au niveau `cible`. */
export function niveauRequisAmelioration(b: Batiment, cible: number): number {
  return b.niveauRequis + (cible <= 2 ? 1 : 3);
}

export type RefusAmelioration = 'inconnu' | 'max' | 'niveau' | 'solde';

/** Pourquoi ce bâtiment ne peut pas monter de niveau maintenant, ou null. */
export function refusAmelioration(c: Construction, etat: { niveau: number; solde: number }): RefusAmelioration | null {
  const b = batiment(c.batiment);
  if (!b) return 'inconnu';
  const actuel = niveauValide(c.niveau);
  const cout = coutAmelioration(b, actuel);
  if (cout === null) return 'max';
  if (etat.niveau < niveauRequisAmelioration(b, actuel + 1)) return 'niveau';
  if (etat.solde < cout) return 'solde';
  return null;
}

/**
 * Les bâtiments qu'on peut améliorer MAINTENANT (assez de points, village assez grand, pas au niveau maximal) :
 * ceux que la scène signale d'une petite flèche.
 */
export function ameliorables(constructions: readonly Construction[], etat: { niveau: number; solde: number }): Set<string> {
  const ids = new Set<string>();
  for (const c of constructions) if (refusAmelioration(c, etat) === null) ids.add(c.id);
  return ids;
}

export function batiment(id: string): Batiment | undefined {
  return CATALOGUE.find((b) => b.id === id);
}

/** Côté du terrain carré : il s'agrandit avec le niveau, de 5 à 11 cases. */
export function tailleTerrain(niveau: number): number {
  return Math.min(11, 5 + Math.floor((Math.max(1, niveau) - 1) / 2));
}

/** Le feu de camp occupe le centre du terrain de départ et ne se déplace jamais. */
export const FEU = { x: 2, y: 2 } as const;

export function pointsGagnes(sessions: readonly Session[]): number {
  let total = 0;
  for (const s of sessions) total += pointsSession(dureeSession(s));
  return total;
}

export function pointsDepenses(constructions: readonly Construction[]): number {
  let total = 0;
  for (const c of constructions) total += c.cout;
  return total;
}

export function solde(sessions: readonly Session[], constructions: readonly Construction[]): number {
  return pointsGagnes(sessions) - pointsDepenses(constructions);
}

export type RefusConstruction = 'inconnu' | 'niveau' | 'solde' | 'hors-terrain' | 'occupee';

export type RefusDeplacement = 'hors-terrain' | 'occupee';

/**
 * Pourquoi un bâtiment ne peut pas aller sur cette case, ou null si c'est possible. Déplacer ne coûte rien et
 * ne demande aucun niveau : seul compte le terrain. Toute case occupée est refusée, la sienne comprise (ce ne
 * serait pas un déplacement) — même si le bâtiment n'est plus dans la liste, supprimé entre-temps.
 */
export function refusDeplacement(
  c: Pick<Construction, 'x' | 'y'>,
  x: number,
  y: number,
  etat: { niveau: number; constructions: readonly Pick<Construction, 'x' | 'y'>[] },
): RefusDeplacement | null {
  const t = tailleTerrain(etat.niveau);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= t || y >= t) return 'hors-terrain';
  if (x === FEU.x && y === FEU.y) return 'occupee';
  if (x === c.x && y === c.y) return 'occupee';
  if (etat.constructions.some((k) => k.x === x && k.y === y)) return 'occupee';
  return null;
}

/** Les cases (« x,y ») où ce bâtiment peut aller, pour les mettre en surbrillance. */
export function casesDeplacement(c: Pick<Construction, 'x' | 'y'>, etat: { niveau: number; constructions: readonly Pick<Construction, 'x' | 'y'>[] }): Set<string> {
  const t = tailleTerrain(etat.niveau);
  const libres = new Set<string>();
  for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) if (refusDeplacement(c, x, y, etat) === null) libres.add(`${x},${y}`);
  return libres;
}

/** Pourquoi on ne peut pas construire ici, ou null si c'est possible. */
export function refusConstruction(
  id: string,
  x: number,
  y: number,
  etat: { niveau: number; solde: number; constructions: readonly Construction[] },
): RefusConstruction | null {
  const b = batiment(id);
  if (!b) return 'inconnu';
  if (etat.niveau < b.niveauRequis) return 'niveau';
  if (etat.solde < b.cout) return 'solde';
  const t = tailleTerrain(etat.niveau);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= t || y >= t) return 'hors-terrain';
  if (x === FEU.x && y === FEU.y) return 'occupee';
  if (etat.constructions.some((c) => c.x === x && c.y === y)) return 'occupee';
  return null;
}

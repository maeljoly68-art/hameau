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
}

export const CATALOGUE: readonly Batiment[] = [
  { id: 'fleurs', nom: 'Parterre de fleurs', cout: 10, niveauRequis: 1, description: 'Un peu de couleur.' },
  { id: 'arbre', nom: 'Chêne', cout: 15, niveauRequis: 1, description: 'Il pousse pendant que tu bosses.' },
  { id: 'cabane', nom: 'Cabane', cout: 40, niveauRequis: 1, description: 'Le premier toit du hameau.' },
  { id: 'lanterne', nom: 'Lanterne', cout: 20, niveauRequis: 2, description: 'Elle s’allume à la nuit tombée.' },
  { id: 'ruche', nom: 'Ruche', cout: 35, niveauRequis: 2, description: 'Les abeilles bourdonnent quand tu bosses.' },
  { id: 'potager', nom: 'Potager', cout: 50, niveauRequis: 2, description: 'Ce qu’on sème finit par pousser.' },
  { id: 'puits', nom: 'Puits', cout: 60, niveauRequis: 2, description: 'Une source fiable.' },
  { id: 'maison', nom: 'Maison', cout: 90, niveauRequis: 3, description: 'Un villageois s’installe.' },
  { id: 'etang', nom: 'Étang', cout: 120, niveauRequis: 3, description: 'Calme et profond.' },
  { id: 'moulin', nom: 'Moulin', cout: 200, niveauRequis: 4, description: 'Le travail régulier fait tourner les ailes.' },
  { id: 'forge', nom: 'Forge', cout: 250, niveauRequis: 5, description: 'On y façonne ce qui dure.' },
  { id: 'bibliotheque', nom: 'Bibliothèque', cout: 300, niveauRequis: 6, description: 'Tout ce que tu as appris.' },
  { id: 'marche', nom: 'Marché', cout: 350, niveauRequis: 7, description: 'Le hameau commerce avec ses voisins.' },
  { id: 'tour', nom: 'Tour de guet', cout: 450, niveauRequis: 8, description: 'On voit loin.' },
  { id: 'observatoire', nom: 'Observatoire', cout: 800, niveauRequis: 10, description: 'Pour les longues nuits de travail.' },
  { id: 'chateau', nom: 'Château', cout: 1500, niveauRequis: 14, description: 'Le hameau est devenu une ville.' },
];

/** Habitants logés par bâtiment : seuls les toits comptent. */
const HABITANTS: Readonly<Record<string, number>> = { cabane: 1, maison: 2, forge: 1, moulin: 1, bibliotheque: 1, marche: 2, chateau: 4 };

/** Population du hameau : le gardien du feu, plus les habitants logés. */
export function population(constructions: readonly Construction[]): number {
  let n = 1;
  for (const c of constructions) n += HABITANTS[c.batiment] ?? 0;
  return n;
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

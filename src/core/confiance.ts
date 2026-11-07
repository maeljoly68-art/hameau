// « Je pense savoir… » : la confiance dite AVANT de comparer à la fiche, puis la note donnée APRÈS. Pur.
//
// Relire donne l'impression de savoir ; c'est justement ce qu'il faut attraper. Quand on se dit sûr de soi
// puis qu'on se note « à revoir », l'écart est la mesure de l'illusion de savoir. Le bilan le montre.
import { ecartJours } from './jours.ts';
import type { Passage } from './passages.ts';
import { NOTES, type Note } from './revision.ts';

export const CONFIANCES: readonly { id: number; nom: string }[] = [
  { id: 0, nom: 'Pas du tout' },
  { id: 1, nom: 'Un peu' },
  { id: 2, nom: 'Plutôt' },
  { id: 3, nom: 'Sûr de moi' },
];

/** Même échelle que la confiance : à revoir 0, difficile 1, bien 2, facile 3. */
export const rangNote = (n: Note): number => NOTES.findIndex((x) => x.id === n);

/** On regarde les 30 derniers jours ; en dessous de 6 passages mesurés, un écart ne dit rien. */
export const CALIBRAGE_JOURS = 30;
export const CALIBRAGE_MIN = 6;
/** Un écart moyen d'au moins un demi-cran, dans un sens ou dans l'autre, est un vrai biais. */
export const CALIBRAGE_SEUIL = 0.5;

export interface Calibrage {
  /** Passages avec confiance ET note. */
  n: number;
  /** Confiance moyenne moins note moyenne, en crans : positif = tu te crois meilleur que tu n'es. */
  ecart: number;
  verdict: 'insuffisant' | 'surestime' | 'sous-estime' | 'juste';
  /** Combien de fois « sûr de moi » (3) puis noté « à revoir » ou « difficile » : l'illusion de savoir, prise sur le fait. */
  illusions: number;
}

export function calibrage(passages: readonly Passage[], aujourdhui: string): Calibrage {
  const mesures = passages.filter((p) => p.confiance !== null && p.note !== null && ecartJours(p.jour, aujourdhui) >= 0 && ecartJours(p.jour, aujourdhui) < CALIBRAGE_JOURS);
  const n = mesures.length;
  if (n === 0) return { n: 0, ecart: 0, verdict: 'insuffisant', illusions: 0 };
  const ecart = mesures.reduce((t, p) => t + (p.confiance! - rangNote(p.note!)), 0) / n;
  const illusions = mesures.filter((p) => p.confiance! >= 3 && rangNote(p.note!) <= 1).length;
  const verdict = n < CALIBRAGE_MIN ? 'insuffisant' : ecart >= CALIBRAGE_SEUIL ? 'surestime' : ecart <= -CALIBRAGE_SEUIL ? 'sous-estime' : 'juste';
  return { n, ecart, verdict, illusions };
}

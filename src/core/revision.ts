// Le cycle d'apprentissage : un chapitre vu est revu à intervalles croissants,
// raccourcis ou allongés selon la note qu'on se donne. Pur.
import { ajouterJours } from './jours.ts';

/** 0 = à découvrir, 1 = vu une fois, puis un cran par révision réussie. */
export const NIVEAU_MAX = 6;

/**
 * Jours à attendre APRÈS avoir atteint ce niveau avant de revoir le chapitre.
 * Les écarts grandissent : c'est ce qui fait passer le cours en mémoire longue
 * (même logique que les plans de révision des fiches : 1, 3, 7, 14 jours…).
 */
export const ECART_JOURS: readonly number[] = [0, 1, 3, 7, 14, 30, 60];

export type Note = 'a-revoir' | 'difficile' | 'bien' | 'facile';

export const NOTES: readonly { id: Note; nom: string }[] = [
  { id: 'a-revoir', nom: 'À revoir' },
  { id: 'difficile', nom: 'Difficile' },
  { id: 'bien', nom: 'Bien' },
  { id: 'facile', nom: 'Facile' },
];

export interface EtatRevision {
  niveau: number;
  /** Dernier passage, « AAAA-MM-JJ ». */
  derniere: string | null;
  /** Date à partir de laquelle le chapitre est à revoir, ou null s'il n'est pas encore vu. */
  prochaine: string | null;
}

export const ETAT_INITIAL: EtatRevision = { niveau: 0, derniere: null, prochaine: null };

const borne = (n: number) => Math.min(NIVEAU_MAX, Math.max(0, Math.floor(n)));

/** Niveau lu en base ou ailleurs : hors échelle ou illisible, il vaut 0. */
export function niveauValide(n: unknown): number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= NIVEAU_MAX ? n : 0;
}

/**
 * Première lecture : le chapitre est vu, on le revoit dès le lendemain. Pas de
 * note ici : on ne juge pas ce qu'on retient avant d'avoir essayé de s'en souvenir.
 */
export function apresDecouverte(jour: string): EtatRevision {
  return { niveau: 1, derniere: jour, prochaine: ajouterJours(jour, ECART_JOURS[1]) };
}

/** Un passage de révision, noté. Sur un chapitre pas encore vu, c'est une découverte. */
export function apresRevision(etat: EtatRevision, note: Note, jour: string): EtatRevision {
  if (etat.niveau < 1) return apresDecouverte(jour);
  const n = etat.niveau;
  if (note === 'a-revoir') {
    // Perdu : on redescend de deux crans et on réessaie demain, sans attendre.
    return { niveau: borne(Math.max(1, n - 2)), derniere: jour, prochaine: ajouterJours(jour, 1) };
  }
  if (note === 'difficile') {
    // Même cran, mais on revient deux fois plus tôt : ce qui a coûté se revoit vite.
    return { niveau: n, derniere: jour, prochaine: ajouterJours(jour, Math.max(1, Math.round(ECART_JOURS[n] / 2))) };
  }
  const suivant = borne(n + (note === 'facile' ? 2 : 1));
  return { niveau: suivant, derniere: jour, prochaine: ajouterJours(jour, ECART_JOURS[suivant]) };
}

/** Maîtrise de 0 à 100 %, linéaire sur l'échelle. */
export function maitrise(niveau: number): number {
  return Math.round((niveauValide(niveau) / NIVEAU_MAX) * 100);
}

export type Statut = 'a-decouvrir' | 'en-cours' | 'maitrise';

/** À partir du cran 5, le chapitre se revoit tous les mois : on le tient pour su. */
export function statut(niveau: number): Statut {
  const n = niveauValide(niveau);
  return n === 0 ? 'a-decouvrir' : n >= 5 ? 'maitrise' : 'en-cours';
}

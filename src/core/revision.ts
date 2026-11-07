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

/**
 * Une page à savoir mot pour mot (une formule, une définition, un article, un dialogue) revient plus souvent : le
 * même cycle, resserré. Savoir par cœur, ce n'est pas avoir lu : c'est avoir été obligé de se le redire, plusieurs fois.
 */
export const ECART_JOURS_PAR_COEUR: readonly number[] = [0, 1, 2, 4, 7, 14, 30];

/** L'échelle de la page : celle de tout le monde, ou la resserrée. */
export const ecartsPour = (parCoeur: boolean): readonly number[] => (parCoeur ? ECART_JOURS_PAR_COEUR : ECART_JOURS);

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
export function apresRevision(etat: EtatRevision, note: Note, jour: string, parCoeur = false): EtatRevision {
  if (etat.niveau < 1) return apresDecouverte(jour);
  const ecarts = ecartsPour(parCoeur);
  const n = etat.niveau;
  if (note === 'a-revoir') {
    // Perdu : on redescend de deux crans et on réessaie demain, sans attendre.
    return { niveau: borne(Math.max(1, n - 2)), derniere: jour, prochaine: ajouterJours(jour, 1) };
  }
  if (note === 'difficile') {
    // Même cran, mais on revient deux fois plus tôt : ce qui a coûté se revoit vite.
    return { niveau: n, derniere: jour, prochaine: ajouterJours(jour, Math.max(1, Math.round(ecarts[n] / 2))) };
  }
  const suivant = borne(n + (note === 'facile' ? 2 : 1));
  return { niveau: suivant, derniere: jour, prochaine: ajouterJours(jour, ecarts[suivant]) };
}

/**
 * Un passage noté AVANT l'échéance (rappel d'une page qui n'est pas encore due, micro-révision d'une page
 * fragile). Le cycle compte sur l'oubli : revoir trop tôt ne vaut pas un cran, donc un passage réussi n'en fait
 * pas monter — il est seulement retenu comme dernier passage. Un passage raté, lui, compte pour de vrai, sans
 * jamais reculer l'échéance déjà prévue.
 */
export function apresRappelAnticipe(etat: EtatRevision, note: Note, jour: string, parCoeur = false): EtatRevision {
  if (etat.niveau < 1) return apresDecouverte(jour);
  if (note === 'bien' || note === 'facile') return { ...etat, derniere: jour };
  const apres = apresRevision(etat, note, jour, parCoeur);
  const prevue = etat.prochaine;
  return prevue !== null && apres.prochaine !== null && prevue < apres.prochaine ? { ...apres, prochaine: prevue } : apres;
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

// Cours, chapitres, notes : les types, et ce qu'on en déduit. Pur.
import { ecartJours, estJour } from './jours.ts';
import { maitrise } from './revision.ts';

export interface Cours {
  id: string;
  titre: string;
  couleur: string;
  /** Jour du partiel, « AAAA-MM-JJ », ou null tant qu'il n'est pas connu. */
  partiel: string | null;
  /** L'artefact d'origine (adresse), pour l'ouvrir depuis Hameau. */
  lien: string | null;
  ordre: number;
  /** Les mots qui rattachent les créneaux de l'emploi du temps à ce cours (« droit spécial des sociétés, SAE droit… »). */
  motifs: string;
  /** Un cours en pause n'est pas dans le calendrier (ni alerte) : on le garde, on ne le travaille pas. */
  enPause: boolean;
}

export interface Chapitre {
  id: string;
  coursId: string;
  titre: string;
  ordre: number;
  /** Minutes pour une première lecture. */
  dureeMin: number;
  /** Où en est le chapitre dans le cycle (voir revision.ts). */
  niveau: number;
  derniere: string | null;
  prochaine: string | null;
  lien: string | null;
}

export interface NoteChapitre {
  id: string;
  chapitreId: string;
  texte: string;
  /** Le passage annoté, quand la note porte sur un extrait précis. */
  citation: string | null;
  creeLe: string;
}

export interface Disponibilites {
  /** Minutes disponibles par jour de la semaine, lundi en premier. */
  semaine: number[];
  /** Jours précis sans travail (« AAAA-MM-JJ ») : vacances, week-end chargé. */
  libres: string[];
  /**
   * Part du temps retirée les journées pleines de cours (de 0 à 90 %, atteinte à 8 h de cours).
   * Absente des réglages enregistrés avant l'emploi du temps : la valeur par défaut s'applique alors.
   */
  reduction?: number;
  /**
   * Minutes de relecture les jours de cours, prises SUR le temps du jour (1 h 30 dont 30 min de relecture) :
   * les cours dont le partiel est le plus proche, déjà lus, avant toute lecture nouvelle.
   */
  relecture?: number;
  /**
   * Ta vitesse d'apprentissage : 1 = comme l'estimation tirée de la taille des pages ; 1,3 = tu mets 30 % de
   * plus. Elle se règle à la main, et se précise à chaque lecture cochée (voir vitesse.ts).
   */
  vitesse?: number;
}

export interface DonneesCours {
  cours: Cours[];
  chapitres: Chapitre[];
  notes: NoteChapitre[];
  disponibilites: Disponibilites;
  /** Adresse du flux d'emploi du temps de l'université ; c'est un secret (quiconque l'a lit l'emploi du temps). */
  agendaLien: string | null;
}

export const DUREE_DEFAUT_MIN = 20;
export const DUREE_MIN = 5;
export const DUREE_MAX = 240;
export const MINUTES_JOUR_MAX = 720;
export const MAX_LIBRES = 366;
export const MAX_CHAPITRES_PAR_AJOUT = 100;

/** Moitié moins de temps pour huit heures de cours : un point de départ, réglable. */
export const REDUCTION_DEFAUT = 50;
export const REDUCTION_MAX = 90;
export const RELECTURE_MAX = 120;
export const VITESSE_MIN = 0.5;
export const VITESSE_MAX = 2.5;

/** Une heure en semaine, une heure et demie le week-end : un point de départ, à régler. */
export const DISPONIBILITES_DEFAUT: Disponibilites = { semaine: [60, 60, 60, 60, 60, 90, 90], libres: [], reduction: REDUCTION_DEFAUT, relecture: 0, vitesse: 1 };

/** Une vitesse lue en base ou sur l'appareil : bornée, arrondie au centième, 1 si elle n'a pas de sens. */
export const vitesseValide = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(VITESSE_MAX, Math.max(VITESSE_MIN, v)) * 100) / 100 : 1);

/** Teintes des étiquettes de cours, assez écartées pour se distinguer sur un calendrier. */
export const COULEURS_COURS = ['#6b8afd', '#ff9f5a', '#4fd1a5', '#e873a8', '#b98cf2', '#f2c14e', '#5ec7e8', '#a3d65c'] as const;

export const dureeValide = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.min(DUREE_MAX, Math.max(DUREE_MIN, Math.round(n))) : DUREE_DEFAUT_MIN);

/**
 * Disponibilités lues en base ou sur l'appareil : une valeur absente ou
 * absurde (un jour à 5 000 minutes) revient au réglage par défaut, pour ce
 * jour seulement — les autres jours bien réglés sont gardés.
 */
export function disponibilitesValides(brut: unknown): Disponibilites {
  const o = brut && typeof brut === 'object' ? (brut as Record<string, unknown>) : {};
  const semaine = DISPONIBILITES_DEFAUT.semaine.map((defaut, i) => {
    const v = Array.isArray(o.semaine) ? o.semaine[i] : undefined;
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MINUTES_JOUR_MAX ? Math.round(v) : defaut;
  });
  const libres = Array.isArray(o.libres) ? [...new Set(o.libres.filter(estJour))].sort().slice(0, MAX_LIBRES) : [];
  const r = o.reduction;
  const reduction = typeof r === 'number' && r >= 0 && r <= REDUCTION_MAX ? Math.round(r) : REDUCTION_DEFAUT;
  const rel = o.relecture;
  const relecture = typeof rel === 'number' && Number.isFinite(rel) && rel >= 0 && rel <= RELECTURE_MAX ? Math.round(rel) : 0;
  return { semaine, libres, reduction, relecture, vitesse: vitesseValide(o.vitesse) };
}

/** Maîtrise moyenne d'un cours, de 0 à 100 : chaque chapitre pèse pareil, quelle que soit sa durée. */
export function maitriseCours(chapitres: readonly Chapitre[]): number {
  if (chapitres.length === 0) return 0;
  return Math.round(chapitres.reduce((t, c) => t + maitrise(c.niveau), 0) / chapitres.length);
}

/** Jours avant le partiel (0 = aujourd'hui), ou null sans date. Négatif : il est passé. */
export function joursAvantPartiel(c: Pick<Cours, 'partiel'>, aujourdhui: string): number | null {
  return c.partiel === null ? null : ecartJours(aujourdhui, c.partiel);
}

/**
 * Une liste de chapitres collée d'un bloc : une ligne = un chapitre. La durée
 * se donne après une barre verticale ou un point-virgule (« Fiche 3 | 45 »),
 * jamais « en fin de ligne » : « Fiche 3 » se termine par un nombre qui est
 * son nom, pas sa durée.
 */
export function lignesVersChapitres(texte: string): { titre: string; dureeMin: number }[] {
  const r: { titre: string; dureeMin: number }[] = [];
  for (const brute of texte.split(/\r?\n/)) {
    // Puces de liste, pas les numéros : « 1.1 Définition » garde son 1.1.
    let ligne = brute.trim().replace(/^[-*•–]\s+/, '');
    if (!ligne) continue;
    let dureeMin = DUREE_DEFAUT_MIN;
    const m = /\s*[|;]\s*(\d{1,3})\s*(?:min)?\s*$/i.exec(ligne);
    if (m) {
      dureeMin = dureeValide(Number(m[1]));
      ligne = ligne.slice(0, m.index).trim();
    }
    if (!ligne) continue;
    r.push({ titre: ligne.slice(0, 120), dureeMin });
    if (r.length >= MAX_CHAPITRES_PAR_AJOUT) break;
  }
  return r;
}

/** Adresse d'artefact acceptée : https seulement (la base refuse le reste). */
export function lienValide(s: string): string | null {
  const t = s.trim();
  return /^https:\/\/\S+$/i.test(t) && t.length <= 500 ? t : null;
}

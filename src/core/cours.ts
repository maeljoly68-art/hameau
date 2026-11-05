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
}

export interface DonneesCours {
  cours: Cours[];
  chapitres: Chapitre[];
  notes: NoteChapitre[];
  disponibilites: Disponibilites;
}

export const DUREE_DEFAUT_MIN = 20;
export const DUREE_MIN = 5;
export const DUREE_MAX = 240;
export const MINUTES_JOUR_MAX = 720;
export const MAX_LIBRES = 366;
export const MAX_CHAPITRES_PAR_AJOUT = 100;

/** Une heure en semaine, une heure et demie le week-end : un point de départ, à régler. */
export const DISPONIBILITES_DEFAUT: Disponibilites = { semaine: [60, 60, 60, 60, 60, 90, 90], libres: [] };

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
  return { semaine, libres };
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

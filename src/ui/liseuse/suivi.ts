// Le compteur de lecture : pendant une séance, chaque seconde passée dans la liseuse va à la page qu'on a sous les
// yeux, et la part de chaque page parcourue s'accumule. Un seul compteur pour l'app (pas un par écran) : la fin de
// séance doit pouvoir lui demander d'envoyer ce qu'il sait, même si la liseuse vient d'être fermée.
//
// Ne compte que si : une séance tourne et n'est pas en pause, l'onglet est visible, et on a touché à la page depuis
// moins de 5 minutes (une liseuse oubliée ouverte pendant le déjeuner n'est pas une page lue).
import { ajouterIntervalle, totauxParChapitre, type CompteurPlanche } from '../../core/lecture.ts';
import { enregistrerLectures } from '../../data/liseuse.ts';

export const INACTIVITE_MS = 5 * 60_000;
const ENVOI_MS = 15_000;
/** Une planche compte comme « vue » à cet instant si elle occupe au moins un quart de l'écran (ou y tient entière). */
const PART_ECRAN = 0.25;

export interface VuePage {
  id: string;
  de: number;
  a: number;
  h: number;
}

interface Etat {
  sessionId: string | null;
  /** Par « document/planche » : deux cours ont chacun leur planche « Quiz ». */
  pages: Map<string, CompteurPlanche>;
  document: string | null;
  /** Planche → page du cours (chapitre), pour le document ouvert. */
  correspondance: Map<string, string>;
  vue: { pages: VuePage[]; haut: number } | null;
  activite: number;
  change: boolean;
  dernierEnvoi: number;
}

const etat: Etat = { sessionId: null, pages: new Map(), document: null, correspondance: new Map(), vue: null, activite: 0, change: false, dernierEnvoi: 0 };
const cleLocale = (sessionId: string) => `hameau.lecture.${sessionId}`;

function charger(sessionId: string): Map<string, CompteurPlanche> {
  try {
    const brut = JSON.parse(localStorage.getItem(cleLocale(sessionId)) ?? '{}') as Record<string, CompteurPlanche>;
    return new Map(Object.entries(brut).filter(([, p]) => typeof p?.chapitreId === 'string' && typeof p.secondes === 'number' && Array.isArray(p.vus)));
  } catch {
    return new Map();
  }
}

function garder(): void {
  if (!etat.sessionId) return;
  try {
    localStorage.setItem(cleLocale(etat.sessionId), JSON.stringify(Object.fromEntries(etat.pages)));
  } catch {
    // Stockage plein ou refusé : l'envoi en base garde l'essentiel.
  }
}

/** La séance en cours (null : aucune). Une nouvelle séance repart de zéro ; la même, rouverte, reprend son compte. */
export function suivreSession(sessionId: string | null): void {
  if (sessionId === etat.sessionId) return;
  etat.sessionId = sessionId;
  etat.pages = sessionId ? charger(sessionId) : new Map();
  etat.change = false;
  // Les comptes des séances finies ne servent plus : on fait le ménage (garder ceux d'aujourd'hui suffit).
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const cle = localStorage.key(i);
      if (cle && cle.startsWith('hameau.lecture.') && cle !== (sessionId ? cleLocale(sessionId) : '')) localStorage.removeItem(cle);
    }
  } catch {
    // Rien de grave : ce ne sont que des restes.
  }
}

/** Le document ouvert dans la liseuse et, pour chacune de ses planches, la page du cours qu'elle forme (null : fermé). */
export function documentOuvert(document: string | null, correspondance: Map<string, string> | null): void {
  if (document !== etat.document) etat.vue = null;
  etat.document = document;
  etat.correspondance = correspondance ?? new Map();
}

export function vue(pages: VuePage[], haut: number): void {
  etat.vue = { pages, haut };
}

export function activite(): void {
  etat.activite = Date.now();
}

/** Une seconde de plus : appelée chaque seconde par la liseuse ouverte. */
export function tic(maintenant: number, enPause: boolean): void {
  if (!etat.sessionId || enPause || !etat.vue || etat.vue.pages.length === 0) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (maintenant - etat.activite > INACTIVITE_MS) return;
  if (!etat.document) return;
  const { pages, haut } = etat.vue;
  const compteur = (p: VuePage, chapitreId: string): CompteurPlanche => {
    const cle = `${etat.document}/${p.id}`;
    const c = etat.pages.get(cle) ?? { chapitreId, secondes: 0, vus: [], hauteur: p.h };
    c.chapitreId = chapitreId;
    c.hauteur = p.h;
    etat.pages.set(cle, c);
    return c;
  };
  let dominante: { p: VuePage; chapitreId: string } | null = null;
  for (const p of pages) {
    const chapitreId = etat.correspondance.get(p.id);
    if (!chapitreId) continue;
    const visible = p.a - p.de;
    if (!dominante || visible > dominante.p.a - dominante.p.de) dominante = { p, chapitreId };
    if (visible >= PART_ECRAN * haut || visible >= 0.9 * p.h) {
      const c = compteur(p, chapitreId);
      c.vus = ajouterIntervalle(c.vus, p.de, p.a);
    }
  }
  if (dominante) {
    compteur(dominante.p, dominante.chapitreId).secondes += 1;
    etat.change = true;
  }
  if (etat.change && maintenant - etat.dernierEnvoi >= ENVOI_MS) void vider();
}

let envoiEnCours: Promise<void> | null = null;

/** Envoie le total de la séance (réécrit, jamais ajouté : un envoi répété ne compte pas deux fois). */
export function vider(): Promise<void> {
  if (envoiEnCours) return envoiEnCours;
  const sessionId = etat.sessionId;
  if (!sessionId || !etat.change) return Promise.resolve();
  const lignes = totauxParChapitre(etat.pages.values()).filter((l) => l.secondes > 0);
  etat.change = false;
  etat.dernierEnvoi = Date.now();
  garder();
  envoiEnCours = enregistrerLectures(sessionId, lignes)
    .catch(() => {
      // Hors ligne : on réessaiera au prochain envoi, le compte est gardé sur l'appareil.
      etat.change = true;
    })
    .finally(() => {
      envoiEnCours = null;
    });
  return envoiEnCours;
}

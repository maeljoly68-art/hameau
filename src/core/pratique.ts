// La pratique quotidienne : un cours dont on fait un minimum de minutes CHAQUE jour (l'artefact d'erreurs du TOEIC,
// bientôt celui du TAGE MAGE). Ce n'est pas du calendrier de pages : c'est une habitude, donc une série. Pur.
//
// Les minutes d'un jour viennent de deux sources, jamais recopiées l'une dans l'autre (sinon elles se compteraient
// deux fois) : les sessions du chrono lancées sur « <cours> · erreurs », et les minutes déclarées à la main pour
// ce qu'on a fait hors chrono.
import { ajouterJours, ecartJours, estJour } from './jours.ts';
import { dureeSession } from './session.ts';
import { cleJour } from './temps.ts';
import type { Session } from './types.ts';

/** Cinq minutes par jour : assez courtes pour qu'on ne saute jamais, assez longues pour refaire quelques erreurs. */
export const PRATIQUE_DEFAUT = 5;
export const PRATIQUE_MAX = 120;
/** Au plus quatre heures déclarées d'un coup : au-delà, c'est une faute de frappe. */
export const PRATIQUE_DECLAREE_MAX = 240;
/** La série se compte sur ce nombre de jours au plus. */
export const SERIE_HORIZON = 400;
/** Les points de la petite semaine affichée sur la carte. */
export const JOURS_SEMAINE = 7;

export interface Pratique {
  id: string;
  coursId: string;
  /** Le jour de l'appareil, « AAAA-MM-JJ ». */
  jour: string;
  minutes: number;
}

/** Les minutes minimum par jour d'un cours : un entier de 1 à 120, ou null (pas de pratique quotidienne). */
export function pratiqueMinValide(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  return v >= 1 && v <= PRATIQUE_MAX ? v : null;
}

export function pratiqueValide(brut: unknown): Pratique | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.coursId !== 'string' || typeof o.jour !== 'string' || !estJour(o.jour)) return null;
  if (typeof o.minutes !== 'number' || !Number.isInteger(o.minutes) || o.minutes < 1 || o.minutes > PRATIQUE_DECLAREE_MAX) return null;
  return { id: o.id, coursId: o.coursId, jour: o.jour, minutes: o.minutes };
}

/** La catégorie du chrono lancé sur la pratique d'un cours. Elle sert aussi à retrouver ces sessions. */
export const categoriePratique = (titreCours: string): string => `${titreCours.trim()} · erreurs`;

const normaliser = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Cette session est-elle de la pratique de ce cours ? Majuscules et espaces ne comptent pas. */
export const estSessionPratique = (session: Pick<Session, 'categorie'>, titreCours: string): boolean => normaliser(session.categorie) === normaliser(categoriePratique(titreCours));

/**
 * La pratique est due tant que le cours n'est pas en pause et que son partiel n'est pas passé (le jour même
 * compris) : après l'épreuve, un minimum quotidien n'a plus d'objet.
 */
export function pratiqueDue(c: { pratiqueMin: number | null; enPause: boolean; partiel: string | null }, aujourdhui: string): boolean {
  if (c.pratiqueMin === null || c.enPause) return false;
  return c.partiel === null || ecartJours(aujourdhui, c.partiel) >= 0;
}

/**
 * Les minutes de pratique de chaque jour pour un cours. Une session qui tourne encore n'a pas de durée (null) :
 * elle ne compte pas, plutôt que pour zéro puis pour tout d'un coup. Une session compte le jour où elle a commencé.
 */
export function minutesParJour(coursId: string, titreCours: string, pratiques: readonly Pratique[], sessions: readonly Pick<Session, 'debut' | 'fin' | 'categorie' | 'pauseSecondes' | 'pauseDepuis'>[]): Map<string, number> {
  const m = new Map<string, number>();
  const ajouter = (jour: string, minutes: number) => m.set(jour, (m.get(jour) ?? 0) + minutes);
  for (const p of pratiques) if (p.coursId === coursId) ajouter(p.jour, p.minutes);
  for (const s of sessions) {
    if (!estSessionPratique(s, titreCours)) continue;
    const duree = dureeSession(s);
    const debut = Date.parse(s.debut);
    if (duree === null || !Number.isFinite(debut)) continue;
    ajouter(cleJour(new Date(debut)), duree);
  }
  return m;
}

export interface JourPratique {
  jour: string;
  /** Minutes arrondies à la minute. */
  minutes: number;
  fait: boolean;
  /** Un jour libre (réglage du temps disponible) : la pratique n'y est pas due, il ne casse pas la série. */
  libre: boolean;
}

export interface EtatPratique {
  cible: number;
  faites: number;
  restantes: number;
  fait: boolean;
  /** Jours de suite où le minimum est atteint, aujourd'hui compris s'il l'est. */
  serie: number;
  /** Les sept derniers jours, du plus ancien à aujourd'hui. */
  semaine: JourPratique[];
}

/** À la minute près : 4 min 40 s d'une session arrêtée au chrono comptent pour 5. */
const minutesDuJour = (m: ReadonlyMap<string, number>, jour: string): number => Math.round(m.get(jour) ?? 0);

/**
 * Où en est la pratique aujourd'hui, et la série. Aujourd'hui pas encore fait ne casse pas la série (la journée
 * n'est pas finie) ; hier non fait, si. Un jour libre est ignoré, ni compté ni cassant.
 */
export function etatPratique(entree: { cible: number; minutes: ReadonlyMap<string, number>; aujourdhui: string; libres?: ReadonlySet<string> }): EtatPratique {
  const { cible, minutes, aujourdhui } = entree;
  const libres = entree.libres ?? new Set<string>();
  const faites = minutesDuJour(minutes, aujourdhui);
  let serie = 0;
  for (let i = 0; i < SERIE_HORIZON; i++) {
    const j = ajouterJours(aujourdhui, -i);
    if (minutesDuJour(minutes, j) >= cible) serie++;
    else if (libres.has(j) || i === 0) continue;
    else break;
  }
  const semaine: JourPratique[] = [];
  for (let i = JOURS_SEMAINE - 1; i >= 0; i--) {
    const jour = ajouterJours(aujourdhui, -i);
    const mn = minutesDuJour(minutes, jour);
    semaine.push({ jour, minutes: mn, fait: mn >= cible, libre: libres.has(jour) });
  }
  return { cible, faites, restantes: Math.max(0, cible - faites), fait: faites >= cible, serie, semaine };
}

/** Une réserve du planning : `minutes` par jour, jusqu'à `jusquau` compris (null : sans fin). */
export interface ReservePratique {
  minutes: number;
  jusquau: string | null;
}

/** Les pratiques dues, sous la forme que le planificateur déduit de chaque journée. */
export function reservesPratique(cours: readonly { pratiqueMin: number | null; enPause: boolean; partiel: string | null }[], aujourdhui: string): ReservePratique[] {
  const r: ReservePratique[] = [];
  for (const c of cours) if (c.pratiqueMin !== null && pratiqueDue(c, aujourdhui)) r.push({ minutes: c.pratiqueMin, jusquau: c.partiel });
  return r;
}

/** Les minutes réservées à la pratique ce jour-là. */
export function minutesReservees(reserves: readonly ReservePratique[], jour: string): number {
  let t = 0;
  for (const r of reserves) if (r.jusquau === null || ecartJours(jour, r.jusquau) >= 0) t += r.minutes;
  return t;
}

/**
 * Le temps qui reste à une journée une fois la pratique retirée. Jamais sous zéro : une journée plus courte que la
 * pratique est sans temps, pas en dette (une dette ferait paraître le temps total des jours suivants plus petit
 * qu'il n'est). Un jour libre (0) le reste.
 */
export const apresPratique = (capacite: number, reservees: number): number => Math.max(0, capacite - reservees);

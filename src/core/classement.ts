// Classement entre amis : périodes, rangs, codes d'invitation. Pur.
import { cleJour, decalerJours, lundi } from './temps.ts';
import type { Apparence } from './types.ts';

export type Periode = 'jour' | 'semaine' | 'mois';

/**
 * Premier jour LOCAL de la période et son nombre de jours. La base découpe
 * les jours dans le fuseau du téléphone qui demande : la semaine de chacun
 * commence à son lundi, pas à celui d'UTC.
 */
export function bornesPeriode(maintenant: Date, periode: Periode): { depuis: string; jours: number } {
  if (periode === 'jour') return { depuis: cleJour(maintenant), jours: 1 };
  if (periode === 'semaine') return { depuis: cleJour(lundi(maintenant)), jours: 7 };
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  // Jour 0 du mois suivant = dernier jour de celui-ci : 28 à 31 selon le mois.
  const jours = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0).getDate();
  return { depuis: cleJour(debut), jours };
}

/** Jours de la période, du premier au dernier (« AAAA-MM-JJ »), pour légender les barres. */
export function joursDePeriode(depuis: string, jours: number): string[] {
  const [a, m, j] = depuis.split('-').map(Number);
  const d0 = new Date(a, m - 1, j, 12);
  return Array.from({ length: jours }, (_, i) => cleJour(decalerJours(d0, i)));
}

export interface Membre {
  id: string;
  moi: boolean;
  pseudo: string | null;
  nomHameau: string;
  apparence: Apparence;
  niveau: number;
  /** Secondes de concentration sur la période, pauses déduites. */
  secondes: number;
  sessions: number;
  /** Minutes par jour de la période. */
  parJour: number[];
  /** Session qui tourne en ce moment chez ce membre, ou null. */
  ouverte: { debut: string; pauseSecondes: number; pauseDepuis: string | null } | null;
  batiments: number;
}

export interface Rang {
  membre: Membre;
  /** 1 pour le premier ; deux ex æquo partagent le rang (1, 1, 3). */
  rang: number;
  minutes: number;
}

const nom = (m: Membre) => (m.pseudo ?? '').toLocaleLowerCase('fr');

export function classer(membres: readonly Membre[]): Rang[] {
  // À la minute près : deux amis à 59 et 61 secondes ne sont pas séparés
  // par ce qu'affiche l'écran (« 1 min » chacun).
  const tries = membres
    .map((membre) => ({ membre, minutes: Math.floor(membre.secondes / 60) }))
    .sort((a, b) => b.minutes - a.minutes || nom(a.membre).localeCompare(nom(b.membre), 'fr') || a.membre.id.localeCompare(b.membre.id));
  const r: Rang[] = [];
  tries.forEach((t, i) => {
    const rang = i > 0 && t.minutes === tries[i - 1].minutes ? r[i - 1].rang : i + 1;
    r.push({ ...t, rang });
  });
  return r;
}

/**
 * Le plus proche devant soi, et les minutes qu'il faut pour le dépasser
 * (une de plus que l'écart : l'égaler ne suffit pas). null si l'on mène.
 */
export function ecartAuSuivant(rangs: readonly Rang[]): { devant: Membre; minutes: number } | null {
  const i = rangs.findIndex((r) => r.membre.moi);
  if (i < 0) return null;
  const moi = rangs[i];
  for (let k = i - 1; k >= 0; k--) {
    if (rangs[k].minutes > moi.minutes) return { devant: rangs[k].membre, minutes: rangs[k].minutes - moi.minutes + 1 };
  }
  return null;
}

/** Sans I, O, 0 ni 1 : un code se dicte et se recopie sans confusion. */
export const ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LONGUEUR_CODE = 8;

/** Code saisi → code canonique, ou null s'il ne peut pas en être un. Tolère espaces, tirets et minuscules. */
export function normaliserCode(saisie: string): string | null {
  const c = saisie.toUpperCase().replace(/[\s-]/g, '');
  if (c.length !== LONGUEUR_CODE) return null;
  for (const x of c) if (!ALPHABET_CODE.includes(x)) return null;
  return c;
}

/** « ABCD2345 » → « ABCD-2345 », plus facile à lire et à dicter. */
export function formaterCode(code: string): string {
  return code.length === LONGUEUR_CODE ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Lien qui ouvre Hameau et propose d'ajouter l'ami. Dans le fragment : il ne part jamais vers un serveur. */
export function lienInvitation(adresse: string, code: string): string {
  return `${adresse.replace(/#.*$/, '')}#ami=${code}`;
}

export function codeDansLien(fragment: string): string | null {
  const m = /(?:^#|&)ami=([^&]+)/.exec(fragment);
  return m ? normaliserCode(decodeURIComponent(m[1])) : null;
}

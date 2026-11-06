// Les rappels mensuels : « remplir mon rapport du mois » revient chaque jour, à partir du jour dit, tant qu'il n'est pas fait. Pur.
import { estJour } from './jours.ts';

export interface RappelMensuel {
  id: string;
  titre: string;
  /** Le jour du mois où il devient dû, de 1 à 28 (tous les mois ont ces jours-là). */
  jourDuMois: number;
  /** Le jour où on l'a fait pour la dernière fois, « AAAA-MM-JJ » ; il n'est plus dû jusqu'au mois suivant. */
  faitLe: string | null;
  /** Où le faire (https seulement). */
  lien: string | null;
}

export const JOUR_MOIS_MIN = 1;
export const JOUR_MOIS_MAX = 28;
export const TITRE_RAPPEL_MAX = 120;

/** Un rappel lu en base ou sur l'appareil : une ligne illisible est écartée plutôt que d'afficher n'importe quoi. */
export function rappelValide(brut: unknown): RappelMensuel | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.titre !== 'string') return null;
  const titre = o.titre.trim().slice(0, TITRE_RAPPEL_MAX);
  if (titre === '') return null;
  const j = o.jourDuMois;
  if (typeof j !== 'number' || !Number.isInteger(j) || j < JOUR_MOIS_MIN || j > JOUR_MOIS_MAX) return null;
  const lien = typeof o.lien === 'string' && /^https:\/\/\S+$/i.test(o.lien) && o.lien.length <= 500 ? o.lien : null;
  return { id: o.id, titre, jourDuMois: j, faitLe: typeof o.faitLe === 'string' && estJour(o.faitLe) ? o.faitLe : null, lien };
}

/** Le jour où le rappel est dû dans le mois de `aujourdhui`. */
export function echeanceDuMois(jourDuMois: number, aujourdhui: string): string {
  return `${aujourdhui.slice(0, 7)}-${String(jourDuMois).padStart(2, '0')}`;
}

/**
 * Dû : le jour du mois est arrivé, et on ne l'a pas fait depuis. « Fait » un 3 novembre le tient quitte jusqu'au
 * 1er décembre ; non fait, il revient chaque jour. Jamais fait : dû dès le jour dit du mois en cours.
 */
export function estDu(r: Pick<RappelMensuel, 'jourDuMois' | 'faitLe'>, aujourdhui: string): boolean {
  const echeance = echeanceDuMois(r.jourDuMois, aujourdhui);
  if (aujourdhui < echeance) return false;
  return r.faitLe === null || r.faitLe < echeance;
}

export interface RappelDu {
  rappel: RappelMensuel;
  /** Depuis quel jour il est dû (le jour du mois, ce mois-ci). */
  depuis: string;
}

/** Les rappels dus aujourd'hui, le plus ancien d'abord (à jour égal, par titre). */
export function rappelsDus(rappels: readonly RappelMensuel[], aujourdhui: string): RappelDu[] {
  return rappels
    .filter((r) => estDu(r, aujourdhui))
    .map((rappel) => ({ rappel, depuis: echeanceDuMois(rappel.jourDuMois, aujourdhui) }))
    .sort((a, b) => a.depuis.localeCompare(b.depuis) || a.rappel.titre.localeCompare(b.rappel.titre) || a.rappel.id.localeCompare(b.rappel.id));
}

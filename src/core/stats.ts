// Statistiques de travail. Pur : « maintenant » est toujours un paramètre.
import { cleJour, decalerJours, dureeMinutes, lundi } from './temps.ts';
import type { Session } from './types.ts';

/** Minutes à atteindre dans la journée pour qu'elle compte dans la série. */
export const SEUIL_SERIE_MINUTES = 25;

/** Minutes de travail par jour local. Une session est rattachée au jour de son début. */
export function minutesParJour(sessions: readonly Session[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const d = dureeMinutes(s.debut, s.fin);
    // Une session en cours n'a pas de durée : l'ignorer plutôt que la compter
    // pour zéro, ce qui créerait un jour « travaillé » vide.
    if (d === null) continue;
    const k = cleJour(new Date(s.debut));
    m.set(k, (m.get(k) ?? 0) + d);
  }
  return m;
}

/**
 * Nombre de jours consécutifs au-dessus du seuil, en finissant aujourd'hui.
 * Si aujourd'hui n'est pas encore validé, la série d'hier tient toujours :
 * elle ne doit pas s'afficher à zéro chaque matin au réveil.
 */
export function serie(sessions: readonly Session[], maintenant: Date): number {
  const parJour = minutesParJour(sessions);
  const valide = (d: Date) => (parJour.get(cleJour(d)) ?? 0) >= SEUIL_SERIE_MINUTES;
  let jour = valide(maintenant) ? maintenant : decalerJours(maintenant, -1);
  let n = 0;
  while (valide(jour)) {
    n++;
    jour = decalerJours(jour, -1);
  }
  return n;
}

export function minutesAujourdhui(sessions: readonly Session[], maintenant: Date): number {
  return minutesParJour(sessions).get(cleJour(maintenant)) ?? 0;
}

export function minutesSemaine(sessions: readonly Session[], maintenant: Date): number {
  const parJour = minutesParJour(sessions);
  const debut = lundi(maintenant);
  let total = 0;
  for (let i = 0; i < 7; i++) total += parJour.get(cleJour(decalerJours(debut, i))) ?? 0;
  return total;
}

/** Les `n` derniers jours, du plus ancien à aujourd'hui. */
export function derniersJours(sessions: readonly Session[], maintenant: Date, n: number) {
  const parJour = minutesParJour(sessions);
  const r: { jour: string; minutes: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = cleJour(decalerJours(maintenant, -i));
    r.push({ jour: k, minutes: parJour.get(k) ?? 0 });
  }
  return r;
}

/**
 * Minutes par catégorie sur les `n` derniers jours, triées de la plus grosse
 * à la plus petite. Ici la question EST « où passe mon temps » : classer par
 * total est le bon critère.
 */
export function parCategorie(sessions: readonly Session[], maintenant: Date, n: number) {
  const depuis = cleJour(decalerJours(maintenant, -(n - 1)));
  const m = new Map<string, number>();
  for (const s of sessions) {
    const d = dureeMinutes(s.debut, s.fin);
    if (d === null) continue;
    if (cleJour(new Date(s.debut)) < depuis) continue;
    const c = s.categorie.trim() || 'Sans catégorie';
    m.set(c, (m.get(c) ?? 0) + d);
  }
  return [...m.entries()].map(([categorie, minutes]) => ({ categorie, minutes })).sort((a, b) => b.minutes - a.minutes);
}

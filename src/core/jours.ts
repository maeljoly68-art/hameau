// Calcul sur des jours « AAAA-MM-JJ ». Un jour de partiel est une DATE de
// calendrier, pas un instant : le ranger en Date et ajouter des multiples de
// 24 h se tromperait d'un jour aux changements d'heure. Pur.
import { cleJour } from './temps.ts';

const FORME = /^(\d{4})-(\d{2})-(\d{2})$/;

/** « 2026-12-04 » est un vrai jour : « 2026-02-30 » et « 2026-13-01 » n'en sont pas. */
export function estJour(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = FORME.exec(s);
  if (!m) return false;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mo - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j;
}

/** Ce jour à midi, heure locale : loin des minuits où un décalage d'heure ferait basculer la date. */
export function versDate(jour: string): Date {
  const m = FORME.exec(jour)!;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

export function ajouterJours(jour: string, n: number): string {
  const d = versDate(jour);
  d.setDate(d.getDate() + n);
  return cleJour(d);
}

/** Jours entiers de `de` à `a` : positif si `a` est après. */
export function ecartJours(de: string, a: string): number {
  const x = FORME.exec(de)!;
  const y = FORME.exec(a)!;
  // En UTC : la différence de deux minuits UTC est toujours un nombre entier de jours.
  return Math.round((Date.UTC(Number(y[1]), Number(y[2]) - 1, Number(y[3])) - Date.UTC(Number(x[1]), Number(x[2]) - 1, Number(x[3]))) / 86_400_000);
}

/** Lundi = 0 … dimanche = 6 : la semaine commence le lundi. */
export function jourSemaine(jour: string): number {
  return (versDate(jour).getDay() + 6) % 7;
}

/** « 2026-11-05 » → « jeu. 5 nov. ». */
export function jourCourt(jour: string): string {
  return versDate(jour).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Premier jour du mois de `jour`. */
export function debutDuMois(jour: string): string {
  return `${jour.slice(0, 7)}-01`;
}

export function moisSuivant(jour: string, n = 1): string {
  const d = versDate(debutDuMois(jour));
  d.setMonth(d.getMonth() + n);
  return cleJour(d);
}

/** Les jours d'un mois, complétés pour former des semaines entières du lundi au dimanche. */
export function grilleDuMois(premier: string): string[] {
  const debut = ajouterJours(premier, -jourSemaine(premier));
  const suivant = moisSuivant(premier);
  const dernier = ajouterJours(suivant, -1);
  const fin = ajouterJours(dernier, 6 - jourSemaine(dernier));
  const jours: string[] = [];
  for (let j = debut; ecartJours(j, fin) >= 0; j = ajouterJours(j, 1)) jours.push(j);
  return jours;
}

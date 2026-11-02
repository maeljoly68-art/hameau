// Statistiques de travail. Pur : « maintenant » est toujours un paramètre.
import { dureeSession } from './session.ts';
import { cleJour, decalerJours, lundi } from './temps.ts';
import type { Session } from './types.ts';

/** Minutes à atteindre dans la journée pour qu'elle compte dans la série. */
export const SEUIL_SERIE_MINUTES = 25;

/** Minutes de travail par jour local. Une session est rattachée au jour de son début. */
export function minutesParJour(sessions: readonly Session[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const d = dureeSession(s);
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
    const d = dureeSession(s);
    if (d === null) continue;
    if (cleJour(new Date(s.debut)) < depuis) continue;
    const c = s.categorie.trim() || 'Sans catégorie';
    m.set(c, (m.get(c) ?? 0) + d);
  }
  return [...m.entries()].map(([categorie, minutes]) => ({ categorie, minutes })).sort((a, b) => b.minutes - a.minutes);
}

/** La plus longue série jamais faite (pas seulement la série en cours). */
export function meilleureSerie(sessions: readonly Session[]): number {
  const jours = [...minutesParJour(sessions).entries()]
    .filter(([, m]) => m >= SEUIL_SERIE_MINUTES)
    .map(([k]) => k)
    .sort();
  let record = 0;
  let courant = 0;
  let precedent: string | null = null;
  for (const k of jours) {
    const veille = cleJour(decalerJours(new Date(`${k}T12:00:00`), -1));
    courant = precedent === veille ? courant + 1 : 1;
    record = Math.max(record, courant);
    precedent = k;
  }
  return record;
}

/**
 * Intensité 0–4 d'une case du calendrier, rapportée à l'objectif du jour.
 * Une échelle calée sur le plus gros jour serait fixée par un seul marathon et
 * écraserait tous les autres jours dans la teinte la plus pâle.
 */
export function intensite(minutes: number, objectifJour: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  const r = minutes / Math.max(1, objectifJour);
  if (r >= 1) return 4;
  if (r >= 0.5) return 3;
  if (r >= 0.25) return 2;
  return 1;
}

/** Calendrier de `semaines` colonnes (lundi → dimanche), la dernière contenant aujourd'hui. */
export function calendrier(sessions: readonly Session[], maintenant: Date, semaines: number) {
  const parJour = minutesParJour(sessions);
  const aujourdhui = cleJour(maintenant);
  const premier = decalerJours(lundi(maintenant), -7 * (semaines - 1));
  const colonnes: { jour: string; minutes: number; futur: boolean }[][] = [];
  for (let s = 0; s < semaines; s++) {
    const col = [];
    for (let j = 0; j < 7; j++) {
      const k = cleJour(decalerJours(premier, s * 7 + j));
      col.push({ jour: k, minutes: parJour.get(k) ?? 0, futur: k > aujourdhui });
    }
    colonnes.push(col);
  }
  return colonnes;
}

/** Minutes de la semaine précédente, du lundi au même jour de la semaine. */
export function minutesSemainePrecedenteAuMemeJour(sessions: readonly Session[], maintenant: Date): number {
  // Comparer une semaine entamée à une semaine entière donnerait toujours
  // l'impression de reculer le lundi matin.
  const parJour = minutesParJour(sessions);
  const debut = decalerJours(lundi(maintenant), -7);
  const jours = (maintenant.getDay() + 6) % 7;
  let total = 0;
  for (let i = 0; i <= jours; i++) total += parJour.get(cleJour(decalerJours(debut, i))) ?? 0;
  return total;
}

export interface Bilan {
  sessions: number;
  totalMinutes: number;
  moyenne: number | null;
  plusLongue: number | null;
}

/** Bilan des sessions closes. Moyenne null sans session : 0 serait un vrai chiffre. */
export function bilan(sessions: readonly Session[]): Bilan {
  let n = 0;
  let total = 0;
  let max: number | null = null;
  for (const s of sessions) {
    const d = dureeSession(s);
    if (d === null) continue;
    n++;
    total += d;
    max = max === null ? d : Math.max(max, d);
  }
  return { sessions: n, totalMinutes: total, moyenne: n ? total / n : null, plusLongue: max };
}

export type Moment = 'matin' | 'apres-midi' | 'soir' | 'nuit';

export const MOMENTS: readonly { id: Moment; nom: string; plage: string; complement: string }[] = [
  { id: 'matin', nom: 'Matin', plage: '5 h – 12 h', complement: 'du matin' },
  { id: 'apres-midi', nom: 'Après-midi', plage: '12 h – 18 h', complement: 'de l’après-midi' },
  { id: 'soir', nom: 'Soir', plage: '18 h – 22 h', complement: 'du soir' },
  { id: 'nuit', nom: 'Nuit', plage: '22 h – 5 h', complement: 'de la nuit' },
];

export function momentPour(heure: number): Moment {
  if (heure >= 5 && heure < 12) return 'matin';
  if (heure >= 12 && heure < 18) return 'apres-midi';
  if (heure >= 18 && heure < 22) return 'soir';
  return 'nuit';
}

/** Sessions nécessaires dans un moment avant d'en tirer une moyenne. */
export const ECHANTILLON_MINIMUM = 3;

export interface Concentration {
  moment: Moment;
  sessions: number;
  /** Durée moyenne d'une session ; null sous l'échantillon minimum. */
  moyenne: number | null;
}

/**
 * Quand es-tu le plus concentré ? La question n'est pas « quand travailles-tu
 * le plus » — classer par total désignerait toujours le moment le plus
 * fréquent — mais « quand tiens-tu le plus longtemps » : on compare la durée
 * MOYENNE d'une session. Les sessions de moins de 5 minutes (faux départs) en
 * sont exclues, et une moyenne sur une ou deux sessions n'est pas affichée :
 * un seul marathon désignerait sinon le « meilleur » moment à tort.
 */
export function concentrationParMoment(sessions: readonly Session[], minimumSessions = ECHANTILLON_MINIMUM) {
  const acc = new Map<Moment, { n: number; total: number }>();
  for (const s of sessions) {
    const d = dureeSession(s);
    if (d === null || d < 5) continue;
    const m = momentPour(new Date(s.debut).getHours());
    const a = acc.get(m) ?? { n: 0, total: 0 };
    a.n++;
    a.total += d;
    acc.set(m, a);
  }
  const lignes: Concentration[] = MOMENTS.map(({ id }) => {
    const a = acc.get(id);
    return { moment: id, sessions: a?.n ?? 0, moyenne: a && a.n >= minimumSessions ? a.total / a.n : null };
  });
  let meilleur: Moment | null = null;
  let record = -1;
  for (const l of lignes) {
    if (l.moyenne !== null && l.moyenne > record) {
      record = l.moyenne;
      meilleur = l.moment;
    }
  }
  return { lignes, meilleur };
}

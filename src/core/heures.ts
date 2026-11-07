// Quand apprends-tu le mieux ? Les notes que tu te donnes, par moment de la journée. Pur.
//
// Les mêmes pages ne se retiennent pas pareil à 9 h et à 23 h. Le journal garde l'heure de chaque passage noté :
// on en tire le moment où tes notes sont les meilleures, pour y garder les pages difficiles. Hameau conseille, il
// ne place pas les séances à une heure précise : le calendrier raisonne en jours.
import type { Passage } from './passages.ts';
import { rangNote } from './confiance.ts';

export interface Moment {
  id: 'matin' | 'midi' | 'apres-midi' | 'soir' | 'nuit';
  nom: string;
  /** Plage horaire, pour l'affichage. */
  plage: string;
  /** Heures [de, a[ ; la nuit enjambe minuit. */
  de: number;
  a: number;
}

export const MOMENTS: readonly Moment[] = [
  { id: 'matin', nom: 'Matin', plage: '6 h – 11 h', de: 6, a: 11 },
  { id: 'midi', nom: 'Midi', plage: '11 h – 14 h', de: 11, a: 14 },
  { id: 'apres-midi', nom: 'Après-midi', plage: '14 h – 18 h', de: 14, a: 18 },
  { id: 'soir', nom: 'Soir', plage: '18 h – 22 h', de: 18, a: 22 },
  { id: 'nuit', nom: 'Nuit', plage: '22 h – 6 h', de: 22, a: 6 },
];

export function momentDe(heure: number): Moment {
  const h = ((Math.floor(heure) % 24) + 24) % 24;
  return MOMENTS.find((m) => (m.de < m.a ? h >= m.de && h < m.a : h >= m.de || h < m.a)) ?? MOMENTS[4];
}

/** En dessous de 5 passages notés dans un moment, sa moyenne ne dit rien. */
export const HEURES_MIN = 5;
/** Le meilleur moment n'est « meilleur » qu'à partir d'un quart de cran d'avance sur le moins bon. */
export const HEURES_ECART_MIN = 0.25;

export interface StatMoment {
  moment: Moment;
  n: number;
  /** Note moyenne de 0 (à revoir) à 3 (facile) ; null sans passage noté. */
  moyenne: number | null;
}

export interface Heures {
  moments: StatMoment[];
  meilleur: Moment | null;
  pire: Moment | null;
}

/** `heureDe` : l'heure de l'appareil à laquelle le passage a été écrit (le cœur ne lit pas l'horloge ni le fuseau). */
export function heuresProductives(passages: readonly Passage[], heureDe: (creeLe: string) => number | null): Heures {
  const somme = new Map<Moment['id'], { n: number; total: number }>();
  for (const p of passages) {
    if (p.note === null) continue; // seules les notes disent si ça a tenu (une lecture ancienne n'en a pas : le rappel écrit de la première séance en donne une)
    const h = heureDe(p.creeLe);
    if (h === null) continue;
    const m = momentDe(h);
    const s = somme.get(m.id) ?? { n: 0, total: 0 };
    s.n++;
    s.total += rangNote(p.note);
    somme.set(m.id, s);
  }
  const moments = MOMENTS.map((moment): StatMoment => {
    const s = somme.get(moment.id);
    return { moment, n: s?.n ?? 0, moyenne: s && s.n > 0 ? s.total / s.n : null };
  });
  const fiables = moments.filter((m) => m.n >= HEURES_MIN && m.moyenne !== null);
  if (fiables.length === 0) return { moments, meilleur: null, pire: null };
  const tries = fiables.slice().sort((a, b) => b.moyenne! - a.moyenne! || b.n - a.n || MOMENTS.indexOf(a.moment) - MOMENTS.indexOf(b.moment));
  const haut = tries[0];
  const bas = tries[tries.length - 1];
  // Un seul moment fiable : haut et bas sont le même, l'écart est nul et il n'y a pas de conseil à donner.
  if (haut.moyenne! - bas.moyenne! < HEURES_ECART_MIN) return { moments, meilleur: null, pire: null };
  return { moments, meilleur: haut.moment, pire: bas.moment };
}

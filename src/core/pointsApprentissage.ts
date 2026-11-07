// Les points de village gagnés en APPRENANT, pas seulement en restant assis devant un chrono. Pur.
//
// Le village grandit avec le temps de travail ; apprendre vraiment (lire puis écrire de mémoire, se rappeler, se
// tester) doit compter aussi. Rien n'est stocké : les points se recalculent depuis le journal, comme le calendrier.
import { ajouterJours, ecartJours } from './jours.ts';
import type { Note } from './revision.ts';

/** Ce que rapporte un passage du journal, avant la prime de réussite. */
export const POINTS_PASSAGE: Readonly<Record<string, number>> = { lecture: 4, rappel: 3, revision: 3, relecture: 1, examen: 10 };
/** Se rappeler et réussir (bien ou facile) vaut plus que se rappeler : la prime ne s'applique ni à la lecture ni à la relecture. */
export const PRIME_REUSSITE = 2;
/** Un plafond par jour : on ne gagne pas un village en validant cent fois la même page. */
export const PLAFOND_JOUR = 60;
/** La série : chaque jour d'apprentissage d'affilée ajoute 1 point de plus, jusqu'à 7. */
export const PRIME_SERIE_MAX = 7;

export interface PassageLeger {
  jour: string;
  sorte: string;
  note: Note | null;
}

export interface PointsApprentissage {
  total: number;
  /** Les points de chaque jour d'apprentissage. */
  parJour: Map<string, number>;
  /** Jours d'affilée avec au moins un passage qui compte, jusqu'à aujourd'hui (ou hier : la série ne tombe qu'à la fin du jour suivant). */
  serie: number;
}

const compte = (p: PassageLeger): number => {
  const base = POINTS_PASSAGE[p.sorte] ?? 0;
  const prime = (p.sorte === 'rappel' || p.sorte === 'revision' || p.sorte === 'examen') && (p.note === 'bien' || p.note === 'facile') ? PRIME_REUSSITE : 0;
  return base + prime;
};

/** Un jour de relecture seule n'entretient pas la série : revoir sans se tester n'est pas apprendre. */
const entretientLaSerie = (p: PassageLeger): boolean => p.sorte === 'lecture' || p.sorte === 'rappel' || p.sorte === 'revision' || p.sorte === 'examen';

export function pointsApprentissage(passages: readonly PassageLeger[], aujourdhui: string): PointsApprentissage {
  const brut = new Map<string, number>();
  const actifs = new Set<string>();
  for (const p of passages) {
    if (ecartJours(p.jour, aujourdhui) < 0) continue; // un jour à venir (horloge décalée) ne rapporte rien
    brut.set(p.jour, (brut.get(p.jour) ?? 0) + compte(p));
    if (entretientLaSerie(p)) actifs.add(p.jour);
  }
  const parJour = new Map<string, number>();
  let total = 0;
  let courante = 0;
  let precedent: string | null = null;
  for (const jour of [...brut.keys()].sort()) {
    courante = actifs.has(jour) ? (precedent !== null && ecartJours(precedent, jour) === 1 ? courante + 1 : 1) : 0;
    precedent = actifs.has(jour) ? jour : null;
    const points = Math.min(PLAFOND_JOUR, brut.get(jour)!) + (actifs.has(jour) ? Math.min(PRIME_SERIE_MAX, courante) : 0);
    parJour.set(jour, points);
    total += points;
  }
  // La série d'aujourd'hui : elle compte jusqu'à hier même si on n'a rien encore fait aujourd'hui.
  const dernier = actifs.has(aujourdhui) ? aujourdhui : actifs.has(ajouterJours(aujourdhui, -1)) ? ajouterJours(aujourdhui, -1) : null;
  let serie = 0;
  if (dernier !== null) for (let j = dernier; actifs.has(j); j = ajouterJours(j, -1)) serie++;
  return { total, parJour, serie };
}

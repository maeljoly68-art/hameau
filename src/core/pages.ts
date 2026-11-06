// Le calendrier parle en pages : « pages 1 à 7 · ≈ 55 min » plutôt qu'un chapitre pour une heure. Pur.
//
// Une page de l'artefact = un chapitre dans Hameau (un tableau de l'artefact). Son numéro est son rang dans
// le cours, en partant de 1 ; sa durée vient de sa taille (voir `dureeMin`). Regrouper ne change rien au
// calendrier : c'est la même liste de séances, lue par blocs de pages qui se suivent.
import type { Chapitre } from './cours.ts';
import type { Seance, TypeSeance } from './planning.ts';

/** Numéro de page de chaque chapitre (1 = le premier du cours), dans le même ordre que celui où le calendrier les lit. */
export function numerosDePages(chapitres: readonly Chapitre[]): Map<string, number> {
  const parCours = new Map<string, Chapitre[]>();
  for (const ch of chapitres) parCours.set(ch.coursId, [...(parCours.get(ch.coursId) ?? []), ch]);
  const numeros = new Map<string, number>();
  for (const liste of parCours.values()) {
    liste
      .slice()
      .sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id))
      .forEach((ch, i) => numeros.set(ch.id, i + 1));
  }
  return numeros;
}

/** « Page 3 », « Pages 1 à 7 », « Pages 1 à 3 et 6 », « Pages 2 et 5 » : les suites de 3 pages ou plus se résument. */
export function libellePages(pages: readonly number[]): string {
  const triees = [...new Set(pages)].sort((a, b) => a - b);
  if (triees.length === 0) return '';
  const morceaux: string[] = [];
  for (let i = 0; i < triees.length; ) {
    let j = i;
    while (j + 1 < triees.length && triees[j + 1] === triees[j] + 1) j++;
    if (j - i >= 2) morceaux.push(`${triees[i]} à ${triees[j]}`);
    else for (let k = i; k <= j; k++) morceaux.push(String(triees[k]));
    i = j + 1;
  }
  const suite = morceaux.length === 1 ? morceaux[0] : `${morceaux.slice(0, -1).join(', ')} et ${morceaux[morceaux.length - 1]}`;
  return `${triees.length > 1 ? 'Pages' : 'Page'} ${suite}`;
}

/**
 * « En retard de 3 j » ne doit pas se couper entre le nombre et son unité (un « j » seul sur une ligne) :
 * l'espace devient insécable. Les mots qui commencent comme une unité (« 3 jours ») ne sont pas touchés.
 */
export const sansCoupure = (texte: string): string => texte.replace(/(\d) (j|min|h)(?![\p{L}])/gu, '$1\u00a0$2');

/** Une durée annoncée à 5 minutes près : « ≈ 55 min » ne promet pas la minute. */
export const arrondi5 = (minutes: number): number => Math.max(5, Math.round(minutes / 5) * 5);

export interface Bloc {
  jour: string;
  coursId: string;
  type: TypeSeance;
  /** Les chapitres du bloc, dans l'ordre des pages. */
  chapitreIds: string[];
  pages: number[];
  /** Ceux dont la séance finit le chapitre ce jour-là : seuls eux passent pour lus quand on valide. */
  termines: string[];
  minutes: number;
  /** Au moins une lecture continue un autre jour. */
  suite: boolean;
  retard: number;
  /** Au moins une page du bloc est fragile (plusieurs notes basses de suite). */
  fragile: boolean;
  raison: string;
}

/**
 * Les séances d'un jour, regroupées par cours et par sorte de travail : lire, revoir, relire ou faire le
 * dernier passage ne se valident pas de la même façon, donc ne se mélangent pas. Les blocs sont dans l'ordre
 * où le calendrier les a placés ; les pages d'un bloc, dans l'ordre du cours.
 */
export function regrouper(seances: readonly Seance[], chapitres: readonly Chapitre[]): Bloc[] {
  const numeros = numerosDePages(chapitres);
  const blocs = new Map<string, Seance[]>();
  for (const s of seances) {
    const cle = `${s.coursId}|${s.type}`;
    blocs.set(cle, [...(blocs.get(cle) ?? []), s]);
  }
  return [...blocs.values()].map((liste) => {
    const triees = liste.slice().sort((a, b) => (numeros.get(a.chapitreId) ?? 0) - (numeros.get(b.chapitreId) ?? 0));
    const premiere = triees[0];
    const retard = Math.max(...triees.map((s) => s.retard));
    let raison = premiere.raison;
    if (triees.length > 1) {
      if (premiere.type === 'revision') raison = retard > 0 ? `En retard de ${retard} j` : 'Révision espacée';
      else if (premiere.type === 'decouverte') raison = (triees.find((s) => !s.suite) ?? premiere).raison;
    }
    return {
      jour: premiere.jour,
      coursId: premiere.coursId,
      type: premiere.type,
      chapitreIds: triees.map((s) => s.chapitreId),
      pages: triees.map((s) => numeros.get(s.chapitreId) ?? 0),
      termines: triees.filter((s) => s.complete).map((s) => s.chapitreId),
      minutes: triees.reduce((t, s) => t + s.minutes, 0),
      suite: triees.some((s) => s.suite),
      retard,
      fragile: triees.some((s) => s.fragile),
      raison,
    };
  });
}

// Ce qu'on a lu dans la liseuse pendant une séance, et ce qu'on en fait à la fin. Pur.
//
// La liseuse note, pour chaque page, le temps passé dessus et la part de la page qu'on a eue sous les yeux. Une page
// ne compte comme « vue » qu'avec les deux : assez longtemps (on ne lit pas une page en la survolant pour chercher
// autre chose) et en grande partie (rester une heure sur le haut d'une page n'est pas l'avoir lue).
import type { Chapitre } from './cours.ts';
import { libellePages, numerosDePages, etapeDe } from './pages.ts';
import type { Passage } from './passages.ts';

/** Ce que la liseuse a mesuré pour une page pendant une séance, sur un appareil. */
export interface Lecture {
  chapitreId: string;
  appareil: string;
  secondes: number;
  /** Part de la page vue, de 0 à 100. */
  couverture: number;
}

// ── La part d'une page qu'on a eue sous les yeux ──

export type Intervalle = readonly [number, number];

/** Ajoute [de, a] aux intervalles vus (triés, sans chevauchement) : une zone vue deux fois ne compte qu'une fois. */
export function ajouterIntervalle(vus: readonly Intervalle[], de: number, a: number): Intervalle[] {
  if (!Number.isFinite(de) || !Number.isFinite(a) || a <= de) return [...vus];
  const tous = [...vus, [de, a] as const].sort((x, y) => x[0] - y[0]);
  const fusion: [number, number][] = [];
  for (const [d, f] of tous) {
    const dernier = fusion[fusion.length - 1];
    if (dernier && d <= dernier[1]) dernier[1] = Math.max(dernier[1], f);
    else fusion.push([d, f]);
  }
  return fusion;
}

/** Part (0 à 100, arrondie) d'une page de hauteur donnée couverte par les intervalles vus. */
export function couverture(vus: readonly Intervalle[], hauteur: number): number {
  if (!Number.isFinite(hauteur) || hauteur <= 0) return 0;
  let total = 0;
  for (const [d, f] of vus) total += Math.max(0, Math.min(f, hauteur) - Math.max(d, 0));
  return Math.min(100, Math.round((total / hauteur) * 100));
}

/** Ce que la liseuse a compté pour une planche pendant la séance, sur cet appareil. */
export interface CompteurPlanche {
  /** La page du cours (chapitre) que forme la planche. */
  chapitreId: string;
  secondes: number;
  vus: Intervalle[];
  hauteur: number;
}

/**
 * Les totaux par page du cours, à envoyer : une page faite de plusieurs planches additionne leurs secondes, et sa
 * couverture se pèse par la hauteur de chaque planche (avoir lu une petite planche sur deux n'est pas avoir lu la moitié).
 */
export function totauxParChapitre(compteurs: Iterable<CompteurPlanche>): { chapitreId: string; secondes: number; couverture: number }[] {
  const parChapitre = new Map<string, { secondes: number; vu: number; hauteur: number }>();
  for (const c of compteurs) {
    const t = parChapitre.get(c.chapitreId) ?? { secondes: 0, vu: 0, hauteur: 0 };
    const h = Number.isFinite(c.hauteur) && c.hauteur > 0 ? c.hauteur : 0;
    t.secondes += Number.isFinite(c.secondes) && c.secondes > 0 ? c.secondes : 0;
    t.vu += (couverture(c.vus, h) / 100) * h;
    t.hauteur += h;
    parChapitre.set(c.chapitreId, t);
  }
  return [...parChapitre.entries()].map(([chapitreId, t]) => ({ chapitreId, secondes: t.secondes, couverture: t.hauteur > 0 ? Math.round((t.vu / t.hauteur) * 100) : 0 }));
}

// ── Vue ou pas ──

/** Au moins 45 s sur une page, même minuscule ; jamais plus de 3 min exigées, même pour une longue page. */
export const SECONDES_MIN = 45;
export const SECONDES_MAX = 180;
/** Une page vue, c'est au moins le cinquième de son temps de lecture… */
export const PART_DE_LA_DUREE = 0.2;
/** …et au moins 60 % de la page passée sous les yeux. */
export const COUVERTURE_MIN = 60;

export function secondesPourVoir(dureeMin: number): number {
  const d = Number.isFinite(dureeMin) && dureeMin > 0 ? dureeMin : 0;
  return Math.min(SECONDES_MAX, Math.max(SECONDES_MIN, Math.round(d * 60 * PART_DE_LA_DUREE)));
}

/** Le cumul d'une page sur la séance : les temps de tous les appareils s'ajoutent, on garde la meilleure couverture. */
export function cumulParPage(lectures: readonly Lecture[]): Map<string, { secondes: number; couverture: number }> {
  const cumul = new Map<string, { secondes: number; couverture: number }>();
  for (const l of lectures) {
    if (!Number.isFinite(l.secondes) || l.secondes <= 0) continue;
    const c = cumul.get(l.chapitreId) ?? { secondes: 0, couverture: 0 };
    c.secondes += l.secondes;
    c.couverture = Math.max(c.couverture, Number.isFinite(l.couverture) ? Math.min(100, Math.max(0, l.couverture)) : 0);
    cumul.set(l.chapitreId, c);
  }
  return cumul;
}

/** Les pages vues pendant la séance, dans l'ordre du cours. Une page qu'on ne connaît plus (supprimée) est ignorée. */
export function pagesVues(lectures: readonly Lecture[], chapitres: readonly Chapitre[]): string[] {
  const cumul = cumulParPage(lectures);
  return chapitres
    .filter((c) => {
      const l = cumul.get(c.id);
      return l !== undefined && l.couverture >= COUVERTURE_MIN && l.secondes >= secondesPourVoir(c.dureeMin);
    })
    .sort((a, b) => a.coursId.localeCompare(b.coursId) || a.ordre - b.ordre || a.id.localeCompare(b.id))
    .map((c) => c.id);
}

// ── La combientième fois ──

/**
 * Combien de fois la page a été vue, ce jour compris : un jour où on l'a vue compte une fois, quel que soit le
 * nombre de lignes du journal (une lecture et un rappel le même jour, c'est un passage, pas deux).
 */
export function rangDuPassage(passages: readonly Pick<Passage, 'chapitreId' | 'jour'>[], chapitreId: string, jour: string): number {
  const jours = new Set(passages.filter((p) => p.chapitreId === chapitreId && p.jour <= jour).map((p) => p.jour));
  jours.add(jour);
  return jours.size;
}

export const ordinal = (n: number): string => (n === 1 ? '1er' : `${n}e`);
/** « 1re fois », « 3e fois » : comme on le dit (« c'est la troisième fois que je la vois »). */
export const fois = (n: number): string => (n === 1 ? '1re fois' : `${n}e fois`);

export interface GroupeLu {
  /** Combientième passage pour ces pages. */
  rang: number;
  /** Leurs numéros dans le cours. */
  pages: number[];
}
export interface CoursLu {
  coursId: string;
  chapitreIds: string[];
  /** Les pages regroupées par rang, dans l'ordre du cours. */
  groupes: GroupeLu[];
}

/** « Croissance : pages 1 à 3, 3e passage ; pages 4 et 5, 1er passage » — par cours, dans l'ordre des cours. */
export function resumeLecture(vues: readonly string[], chapitres: readonly Chapitre[], passages: readonly Pick<Passage, 'chapitreId' | 'jour'>[], jour: string, ordreCours: readonly string[] = []): CoursLu[] {
  const numeros = numerosDePages(chapitres);
  const parCours = new Map<string, Chapitre[]>();
  for (const id of new Set(vues)) {
    const c = chapitres.find((x) => x.id === id);
    if (c) parCours.set(c.coursId, [...(parCours.get(c.coursId) ?? []), c]);
  }
  const rangCours = (id: string) => (ordreCours.includes(id) ? ordreCours.indexOf(id) : ordreCours.length);
  return [...parCours.entries()]
    .sort(([a], [b]) => rangCours(a) - rangCours(b) || a.localeCompare(b))
    .map(([coursId, liste]) => {
      const triees = liste.slice().sort((a, b) => (numeros.get(a.id) ?? 0) - (numeros.get(b.id) ?? 0));
      const parRang = new Map<number, number[]>();
      for (const c of triees) {
        const r = rangDuPassage(passages, c.id, jour);
        parRang.set(r, [...(parRang.get(r) ?? []), numeros.get(c.id) ?? 0]);
      }
      const groupes = [...parRang.entries()].map(([rang, pages]) => ({ rang, pages })).sort((a, b) => a.pages[0] - b.pages[0]);
      return { coursId, chapitreIds: triees.map((c) => c.id), groupes };
    });
}

/** « pages 1 à 3 (3e fois), page 5 (1re fois) » : de quoi décrire la séance dans l'historique. */
export function phraseLecture(groupes: readonly GroupeLu[]): string {
  return groupes.map((g) => `${libellePages(g.pages).toLowerCase()} (${fois(g.rang)})`).join(', ');
}

// ── Ce que la fin de séance valide ──

export interface PlanValidation {
  /** Jamais lues : elles passent pour lues (le calendrier les reprendra demain, pour les apprendre par cœur). */
  nouvelles: string[];
  /** À revoir aujourd'hui ou en retard : une note les fait avancer dans le cycle. */
  aNoter: string[];
  /** Parmi elles, celles qu'on doit encore apprendre par cœur : on écrit de mémoire avant de se noter. */
  aApprendre: string[];
  /** Déjà lues et pas encore dues : on retient qu'on les a relues, sans toucher au cycle. */
  relues: string[];
  /** Déjà validées aujourd'hui (depuis le planning ou l'autre appareil) : rien à refaire. */
  dejaFaites: string[];
}

export function planValidation(vues: readonly string[], chapitres: readonly Chapitre[], aujourdhui: string): PlanValidation {
  const plan: PlanValidation = { nouvelles: [], aNoter: [], aApprendre: [], relues: [], dejaFaites: [] };
  for (const id of new Set(vues)) {
    const c = chapitres.find((x) => x.id === id);
    if (!c) continue;
    if (c.niveau === 0) plan.nouvelles.push(id);
    else if (c.derniere === aujourdhui) plan.dejaFaites.push(id);
    else if (c.prochaine !== null && c.prochaine <= aujourdhui) {
      plan.aNoter.push(id);
      if (etapeDe('revision', c.niveau, c.parCoeur) === 'apprendre') plan.aApprendre.push(id);
    } else plan.relues.push(id);
  }
  return plan;
}

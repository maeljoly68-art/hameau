// La semaine d'étude : ce qu'il y a à faire chaque jour, page par page, de quoi s'avancer, et de quoi déclarer qu'on
// est allé plus loin que prévu. Pur.
//
// Rien n'est stocké ici non plus : la semaine est une lecture du calendrier (voir planning.ts) et du journal. Faire
// une séance d'avance, ou déclarer des pages lues en plus, change l'état réel des pages ; le calendrier se recalcule
// alors tout seul, et les semaines suivantes s'allègent.
import type { Chapitre, Cours } from './cours.ts';
import { dureeLecture, seancesDuJour, type Plan } from './planning.ts';
import { ajouterJours, jourSemaine } from './jours.ts';
import { libellePages, numerosDePages, regrouper, type Bloc, type Etape } from './pages.ts';
import type { Passage, SortePassage } from './passages.ts';
import type { SeanceLibre } from './revisionLibre.ts';

export type QuandJour = 'passe' | 'aujourdhui' | 'futur';

/** Ce qui a été fait un jour : les pages d'un cours, d'une sorte de passage. */
export interface LigneFaite {
  coursId: string;
  sorte: SortePassage;
  pages: number[];
  /** Somme des temps connus (passages au chrono) ; null si aucun n'est connu. */
  minutes: number | null;
}

export interface JourSemaine {
  jour: string;
  quand: QuandJour;
  /** Les passages du journal ce jour-là (jours passés et aujourd'hui). */
  faits: LigneFaite[];
  /** Ce qui reste à faire d'après le calendrier (aujourd'hui et jours à venir). */
  blocs: Bloc[];
  /** Séances d'étude libre (cours sans artefact). */
  libres: SeanceLibre[];
  /** Minutes prévues : blocs et étude libre. */
  minutes: number;
  /** Les cours dont le partiel tombe ce jour-là. */
  partiels: string[];
}

/** Le lundi de la semaine de `jour` : la semaine commence le lundi, comme partout dans l'application. */
export const debutDeSemaine = (jour: string): string => ajouterJours(jour, -jourSemaine(jour));

export const joursDeSemaine = (lundi: string): string[] => Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));

/** « 9 – 15 nov. », ou « 28 oct. – 3 nov. » quand la semaine change de mois. */
export function libelleSemaine(lundi: string): string {
  const d = (j: string, avecMois: boolean) => new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', avecMois ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
  const dimanche = ajouterJours(lundi, 6);
  return lundi.slice(0, 7) === dimanche.slice(0, 7) ? `${d(lundi, false)} – ${d(dimanche, true)}` : `${d(lundi, true)} – ${d(dimanche, true)}`;
}

const quandDe = (jour: string, aujourdhui: string): QuandJour => (jour < aujourdhui ? 'passe' : jour === aujourdhui ? 'aujourdhui' : 'futur');

const ORDRE_SORTES: readonly SortePassage[] = ['lecture', 'revision', 'rappel', 'relecture', 'examen'];

/** Les passages d'un jour, regroupés par cours et par sorte (« lu : pages 1 à 7 »). */
function faitsDuJour(jour: string, passages: readonly Passage[], chapitres: readonly Chapitre[], numeros: ReadonlyMap<string, number>): LigneFaite[] {
  const parId = new Map(chapitres.map((c) => [c.id, c]));
  const m = new Map<string, { coursId: string; sorte: SortePassage; pages: Set<number>; minutes: number | null }>();
  for (const p of passages) {
    if (p.jour !== jour) continue;
    const ch = parId.get(p.chapitreId);
    const page = numeros.get(p.chapitreId);
    if (!ch || page === undefined) continue;
    const cle = `${ch.coursId}|${p.sorte}`;
    const l = m.get(cle) ?? { coursId: ch.coursId, sorte: p.sorte, pages: new Set<number>(), minutes: null };
    l.pages.add(page);
    if (p.minutes !== null) l.minutes = (l.minutes ?? 0) + p.minutes;
    m.set(cle, l);
  }
  const ordreCours = new Map<string, number>();
  for (const c of chapitres) if (!ordreCours.has(c.coursId)) ordreCours.set(c.coursId, ordreCours.size);
  return [...m.values()]
    .map((l) => ({ coursId: l.coursId, sorte: l.sorte, pages: [...l.pages].sort((a, b) => a - b), minutes: l.minutes }))
    .sort((a, b) => (ordreCours.get(a.coursId) ?? 0) - (ordreCours.get(b.coursId) ?? 0) || ORDRE_SORTES.indexOf(a.sorte) - ORDRE_SORTES.indexOf(b.sorte));
}

export interface EntreeSemaine {
  lundi: string;
  aujourdhui: string;
  plan: Plan;
  chapitres: readonly Chapitre[];
  cours: readonly Pick<Cours, 'id' | 'partiel' | 'enPause'>[];
  passages: readonly Passage[];
  libres: readonly SeanceLibre[];
}

/**
 * Les sept jours d'une semaine : ce qui a été fait (journal) pour les jours passés, ce qui reste à faire (calendrier)
 * pour aujourd'hui et la suite. Aujourd'hui montre les deux : le fait ne figure plus au calendrier, qui ne propose que le reste.
 */
export function semaine(e: EntreeSemaine): JourSemaine[] {
  const numeros = numerosDePages(e.chapitres);
  return joursDeSemaine(e.lundi).map((jour) => {
    const quand = quandDe(jour, e.aujourdhui);
    const blocs = quand === 'passe' ? [] : regrouper(seancesDuJour(e.plan, jour), e.chapitres);
    const libres = quand === 'passe' ? [] : e.libres.filter((s) => s.jour === jour);
    return {
      jour,
      quand,
      faits: quand === 'futur' ? [] : faitsDuJour(jour, e.passages, e.chapitres, numeros),
      blocs,
      libres,
      minutes: blocs.reduce((t, b) => t + b.minutes, 0) + libres.reduce((t, s) => t + s.minutes, 0),
      partiels: e.cours.filter((c) => !c.enPause && c.partiel === jour).map((c) => c.id),
    };
  });
}

const ORDRE_ETAPES: readonly Etape[] = ['lire', 'apprendre', 'reviser', 'dernier', 'relire', 'examen'];

export interface LigneObjectif {
  etape: Etape;
  /** Les pages de cette étape sur toute la semaine, sans doublon, dans l'ordre. */
  pages: number[];
  minutes: number;
  /** Les jours où elle tombe. */
  jours: string[];
}

export interface ObjectifCours {
  coursId: string;
  lignes: LigneObjectif[];
  /** Les séances d'étude libre de la semaine. */
  libre: { seances: number; minutes: number };
  minutes: number;
}

/**
 * Ce qu'il reste à faire cette semaine, cours par cours : « lire les pages 1 à 14, apprendre les pages 1 à 7, réviser… ».
 * Compte aujourd'hui (ce qui reste) et les jours à venir ; les jours passés sont faits ou manqués, plus à faire.
 */
export function objectifsDeSemaine(jours: readonly JourSemaine[]): ObjectifCours[] {
  const m = new Map<string, { lignes: Map<Etape, { pages: Set<number>; minutes: number; jours: string[] }>; libre: { seances: number; minutes: number } }>();
  const cours = (id: string) => {
    const e = m.get(id) ?? { lignes: new Map(), libre: { seances: 0, minutes: 0 } };
    m.set(id, e);
    return e;
  };
  for (const j of jours) {
    if (j.quand === 'passe') continue;
    for (const b of j.blocs) {
      const l = cours(b.coursId).lignes.get(b.etape) ?? { pages: new Set<number>(), minutes: 0, jours: [] };
      for (const p of b.pages) l.pages.add(p);
      l.minutes += b.minutes;
      if (!l.jours.includes(j.jour)) l.jours.push(j.jour);
      cours(b.coursId).lignes.set(b.etape, l);
    }
    for (const s of j.libres) {
      const e = cours(s.coursId);
      e.libre.seances += 1;
      e.libre.minutes += s.minutes;
    }
  }
  return [...m.entries()].map(([coursId, e]) => {
    const lignes = ORDRE_ETAPES.flatMap((etape) => {
      const l = e.lignes.get(etape);
      return l ? [{ etape, pages: [...l.pages].sort((a, b) => a - b), minutes: l.minutes, jours: l.jours }] : [];
    });
    return { coursId, lignes, libre: e.libre, minutes: lignes.reduce((t, l) => t + l.minutes, 0) + e.libre.minutes };
  });
}

// ── S'avancer ──

export type Faisable = { ok: true } | { ok: false; raison: string };

/**
 * Une séance d'un autre jour peut-elle se faire maintenant ? Lire : seulement des pages encore jamais lues. Apprendre,
 * réviser, refaire : seulement des pages déjà lues (sinon la séance dépend d'une lecture prévue avant elle, qui n'est
 * pas faite). Un examen blanc se passe quand on veut.
 */
export function peutFaireDAvance(bloc: Pick<Bloc, 'etape' | 'chapitreIds' | 'termines'>, chapitres: readonly Pick<Chapitre, 'id' | 'niveau'>[]): Faisable {
  const niveau = new Map(chapitres.map((c) => [c.id, c.niveau]));
  if (bloc.etape === 'examen') return { ok: true };
  if (bloc.etape === 'lire') {
    if (bloc.termines.length === 0) return { ok: false, raison: 'Cette lecture se termine un autre jour.' };
    return bloc.termines.every((id) => (niveau.get(id) ?? 0) === 0) ? { ok: true } : { ok: false, raison: 'Déjà lu.' };
  }
  return bloc.chapitreIds.every((id) => (niveau.get(id) ?? 0) >= 1) ? { ok: true } : { ok: false, raison: 'Il faut d’abord lire ces pages.' };
}

/**
 * Les pages de la séance qui ne sont pas encore dues : faites maintenant, elles comptent comme un rappel en plus (un
 * passage réussi avant l'échéance ne fait pas monter le cran, voir `apresRappelAnticipe`). Les pages déjà dues, elles,
 * comptent pour de vrai. Une lecture n'a pas d'échéance.
 */
export function pagesPasEncoreDues(bloc: Pick<Bloc, 'etape' | 'chapitreIds'>, chapitres: readonly Pick<Chapitre, 'id' | 'prochaine'>[], aujourdhui: string): string[] {
  if (bloc.etape === 'lire' || bloc.etape === 'relire' || bloc.etape === 'examen') return [];
  const prochaine = new Map(chapitres.map((c) => [c.id, c.prochaine]));
  return bloc.chapitreIds.filter((id) => {
    const p = prochaine.get(id);
    return p !== null && p !== undefined && p > aujourdhui;
  });
}

// ── Aller plus loin que prévu ──

export interface PageAjoutable {
  id: string;
  /** Le numéro de la page dans le cours. */
  page: number;
  titre: string;
  dureeMin: number;
}

/** Les pages jamais lues d'un cours, dans l'ordre : celles qu'on peut déclarer lues en plus. */
export function pagesAjoutables(coursId: string, chapitres: readonly Chapitre[]): PageAjoutable[] {
  const numeros = numerosDePages(chapitres);
  return chapitres
    .filter((c) => c.coursId === coursId && c.niveau === 0)
    .map((c) => ({ id: c.id, page: numeros.get(c.id) ?? 0, titre: c.titre, dureeMin: c.dureeMin }))
    .sort((a, b) => a.page - b.page);
}

/** Les pages jamais lues entre deux numéros, bornes comprises (dans n'importe quel ordre de saisie). */
export function pagesEntre(ajoutables: readonly PageAjoutable[], de: number, a: number): PageAjoutable[] {
  const [bas, haut] = de <= a ? [de, a] : [a, de];
  return ajoutables.filter((p) => p.page >= bas && p.page <= haut);
}

/** Le temps de première lecture que ces pages auraient demandé au calendrier, à ta vitesse : l'avance que tu prends. */
export function minutesDAvance(pages: readonly Pick<PageAjoutable, 'dureeMin'>[], vitesse: number, partRappel?: number): number {
  return pages.reduce((t, p) => t + dureeLecture({ dureeMin: p.dureeMin }, vitesse, partRappel), 0);
}

/** « Pages 8 à 10 », « Page 8 » : ce qu'on déclare. */
export const libelleDeclaration = (pages: readonly Pick<PageAjoutable, 'page'>[]): string => libellePages(pages.map((p) => p.page));

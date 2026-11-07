// Le journal des passages : ce que l'état des chapitres ne dit pas. Pur.
//
// Le calendrier se recalcule depuis l'état des chapitres (niveau, dernier et prochain passage) et n'a pas besoin
// d'historique. Le journal dit trois choses que l'état ne peut pas dire : une page est-elle fragile (plusieurs
// notes basses de suite) ? qu'a-t-on fait cette semaine, et à quelle vitesse ? un examen blanc a-t-il déjà été passé ?
import { VITESSE_MAX, VITESSE_MIN, type Chapitre, type Cours } from './cours.ts';
import { ajouterJours, ecartJours, estJour } from './jours.ts';
import { JOURS_SANS_NOUVEAU } from './planning.ts';
import { NOTES, type Note } from './revision.ts';

export type SortePassage = 'lecture' | 'revision' | 'relecture' | 'rappel' | 'examen';
export const SORTES_PASSAGE: readonly SortePassage[] = ['lecture', 'revision', 'relecture', 'rappel', 'examen'];

export interface Passage {
  id: string;
  chapitreId: string;
  /** Le jour de l'appareil, « AAAA-MM-JJ ». */
  jour: string;
  sorte: SortePassage;
  note: Note | null;
  /** Null quand on ne la connaît pas : jamais 0. */
  minutes: number | null;
  scorePct: number | null;
  vitesse: number | null;
  /** Ce qu'on a écrit de tête avant d'ouvrir la fiche. */
  rappel: string | null;
  /** « Je pense savoir… » dit AVANT de comparer à la fiche : de 0 (pas du tout) à 3 (sûr de moi). Voir confiance.ts. */
  confiance: number | null;
  /** Pour départager deux passages du même jour : l'ordre où ils ont été écrits. */
  creeLe: string;
}

const NOTES_CONNUES = new Set<string>(NOTES.map((n) => n.id));
const entre = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

/** Un passage lu en base ou sur l'appareil : une ligne illisible est écartée plutôt que de casser le bilan. */
export function passageValide(brut: unknown): Passage | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.chapitreId !== 'string') return null;
  if (typeof o.jour !== 'string' || !estJour(o.jour)) return null;
  if (!SORTES_PASSAGE.includes(o.sorte as SortePassage)) return null;
  return {
    id: o.id,
    chapitreId: o.chapitreId,
    jour: o.jour,
    sorte: o.sorte as SortePassage,
    note: typeof o.note === 'string' && NOTES_CONNUES.has(o.note) ? (o.note as Note) : null,
    minutes: entre(o.minutes, 0, 1440),
    scorePct: entre(o.scorePct, 0, 100),
    vitesse: entre(o.vitesse, VITESSE_MIN, VITESSE_MAX),
    rappel: typeof o.rappel === 'string' && o.rappel.length > 0 ? o.rappel.slice(0, 2000) : null,
    confiance: typeof o.confiance === 'number' && Number.isInteger(o.confiance) ? entre(o.confiance, 0, 3) : null,
    creeLe: typeof o.creeLe === 'string' ? o.creeLe : '',
  };
}

// ── Score → note ──

/** Un score de 90 % ou plus : facile ; 70 % : bien ; 50 % : difficile ; en dessous : à revoir. */
export const SEUIL_FACILE = 90;
export const SEUIL_BIEN = 70;
export const SEUIL_DIFFICILE = 50;

/** « 14 sur 20 » → 70 (au centième) ; null si ce n'est pas un score possible. */
export function scorePct(points: number, sur: number): number | null {
  if (!Number.isFinite(points) || !Number.isFinite(sur) || sur <= 0 || points < 0 || points > sur) return null;
  return Math.round((points / sur) * 10000) / 100;
}

export function noteDepuisPct(pct: number): Note {
  if (pct >= SEUIL_FACILE) return 'facile';
  if (pct >= SEUIL_BIEN) return 'bien';
  if (pct >= SEUIL_DIFFICILE) return 'difficile';
  return 'a-revoir';
}

// ── Pages fragiles ──

/** On regarde les quatre derniers passages notés, sur les 45 derniers jours. */
export const FRAGILE_DERNIERS = 4;
export const FRAGILE_FENETRE_JOURS = 45;
/** Deux notes basses (« à revoir » ou « difficile ») parmi eux : la page est fragile. */
export const FRAGILE_ECHECS = 2;
const BASSES: ReadonlySet<Note> = new Set<Note>(['a-revoir', 'difficile']);

/**
 * Les pages qui ne tiennent pas : au moins deux notes basses parmi les quatre derniers passages notés. Deux bons
 * passages de suite à la fin la libèrent : c'est le signe qu'elle est remontée.
 */
export function pagesFragiles(passages: readonly Passage[], aujourdhui: string): Set<string> {
  const parPage = new Map<string, Passage[]>();
  for (const p of passages) {
    if (p.note === null) continue;
    const age = ecartJours(p.jour, aujourdhui);
    if (age < 0 || age > FRAGILE_FENETRE_JOURS) continue;
    const liste = parPage.get(p.chapitreId);
    if (liste) liste.push(p);
    else parPage.set(p.chapitreId, [p]);
  }
  const fragiles = new Set<string>();
  for (const [id, liste] of parPage) {
    liste.sort((a, b) => a.jour.localeCompare(b.jour) || a.creeLe.localeCompare(b.creeLe) || a.id.localeCompare(b.id));
    const derniers = liste.slice(-FRAGILE_DERNIERS);
    const basses = derniers.filter((p) => BASSES.has(p.note!)).length;
    const remontee = derniers.slice(-2).every((p) => !BASSES.has(p.note!));
    if (basses >= FRAGILE_ECHECS && !remontee) fragiles.add(id);
  }
  return fragiles;
}

// ── Examens blancs ──

/** Un examen blanc passé depuis moins de trois semaines : inutile d'en proposer un autre pour ce cours. */
export const EXAMEN_VALIDITE_JOURS = 21;

export function examensFaits(passages: readonly Passage[], chapitres: readonly Pick<Chapitre, 'id' | 'coursId'>[], aujourdhui: string): Set<string> {
  const coursDe = new Map(chapitres.map((c) => [c.id, c.coursId]));
  const faits = new Set<string>();
  for (const p of passages) {
    if (p.sorte !== 'examen') continue;
    const age = ecartJours(p.jour, aujourdhui);
    const cours = coursDe.get(p.chapitreId);
    if (age >= 0 && age <= EXAMEN_VALIDITE_JOURS && cours !== undefined) faits.add(cours);
  }
  return faits;
}

// ── Bilan de la semaine ──

export const BILAN_JOURS = 7;
/** Le rythme de lecture se mesure sur les deux dernières semaines : une semaine creuse ne le fait pas tomber à zéro. */
export const RYTHME_JOURS = 14;

export interface BilanCours {
  coursId: string;
  pagesRestantes: number;
  /** Pages lues par jour sur les deux dernières semaines. */
  rythme: number;
  /** Jour où tout serait lu à ce rythme ; null s'il n'y a rien à lire ou pas encore de rythme. */
  fin: string | null;
  /** La lecture finit-elle avant que le calendrier n'arrête les pages neuves ? Null sans partiel ou sans fin. */
  avantPartiel: boolean | null;
}

export interface Bilan {
  du: string;
  au: string;
  joursActifs: number;
  /** Nombre de pages validées, par sorte de passage. */
  passages: Record<SortePassage, number>;
  notes: Record<Note, number>;
  /** Première et dernière vitesse notées dans la période ; null si aucune. */
  vitesse: { debut: number; fin: number } | null;
  /** Pages à revoir dont l'échéance est passée. */
  enRetard: number;
  /** Pages fragiles des cours en cours (au plus 8). */
  fragiles: string[];
  cours: BilanCours[];
}

export function bilanSemaine(e: { passages: readonly Passage[]; chapitres: readonly Chapitre[]; cours: readonly Cours[]; aujourdhui: string; fragiles: ReadonlySet<string> }): Bilan {
  const { passages, chapitres, aujourdhui } = e;
  const du = ajouterJours(aujourdhui, -(BILAN_JOURS - 1));
  const actifs = e.cours.filter((c) => !c.enPause && (c.partiel === null || ecartJours(aujourdhui, c.partiel) > 0)).slice().sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id));
  const coursActifs = new Set(actifs.map((c) => c.id));

  const semaine = passages.filter((p) => ecartJours(du, p.jour) >= 0 && ecartJours(p.jour, aujourdhui) >= 0);
  const compte: Record<SortePassage, number> = { lecture: 0, revision: 0, relecture: 0, rappel: 0, examen: 0 };
  const notes: Record<Note, number> = { 'a-revoir': 0, difficile: 0, bien: 0, facile: 0 };
  for (const p of semaine) {
    compte[p.sorte]++;
    if (p.note !== null) notes[p.note]++;
  }
  const avecVitesse = semaine.filter((p) => p.vitesse !== null).sort((a, b) => a.jour.localeCompare(b.jour) || a.creeLe.localeCompare(b.creeLe) || a.id.localeCompare(b.id));
  const vitesse = avecVitesse.length > 0 ? { debut: avecVitesse[0].vitesse!, fin: avecVitesse[avecVitesse.length - 1].vitesse! } : null;

  const parOrdre = (a: Chapitre, b: Chapitre) => (e.cours.find((c) => c.id === a.coursId)?.ordre ?? 0) - (e.cours.find((c) => c.id === b.coursId)?.ordre ?? 0) || a.ordre - b.ordre || a.id.localeCompare(b.id);
  const enRetard = chapitres.filter((c) => coursActifs.has(c.coursId) && c.niveau >= 1 && c.prochaine !== null && ecartJours(c.prochaine, aujourdhui) > 0).length;
  const fragiles = chapitres.filter((c) => coursActifs.has(c.coursId) && e.fragiles.has(c.id)).sort(parOrdre).slice(0, 8).map((c) => c.id);

  const debutRythme = ajouterJours(aujourdhui, -(RYTHME_JOURS - 1));
  const coursDe = new Map(chapitres.map((c) => [c.id, c.coursId]));
  const cours: BilanCours[] = actifs.map((c) => {
    const pagesRestantes = chapitres.filter((h) => h.coursId === c.id && h.niveau === 0).length;
    const lues = passages.filter((p) => p.sorte === 'lecture' && coursDe.get(p.chapitreId) === c.id && ecartJours(debutRythme, p.jour) >= 0 && ecartJours(p.jour, aujourdhui) >= 0).length;
    const rythme = lues / RYTHME_JOURS;
    const fin = pagesRestantes > 0 && rythme > 0 ? ajouterJours(aujourdhui, Math.ceil(pagesRestantes / rythme)) : null;
    // Les pages neuves s'arrêtent JOURS_SANS_NOUVEAU jours avant le partiel (voir le calendrier) : la dernière lecture doit tomber avant.
    const avantPartiel = c.partiel !== null && fin !== null ? ecartJours(fin, ajouterJours(c.partiel, -(JOURS_SANS_NOUVEAU + 1))) >= 0 : null;
    return { coursId: c.id, pagesRestantes, rythme, fin, avantPartiel };
  });

  return { du, au: aujourdhui, joursActifs: new Set(semaine.map((p) => p.jour)).size, passages: compte, notes, vitesse, enRetard, fragiles, cours };
}

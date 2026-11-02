// Pont vers Sillage : habitudes du jour, ordre des tâches, et séances envoyées
// dans le circuit « focus_externe » que le portail de Sillage lit déjà.
// Pur : ni réseau, ni React ; le jour courant est toujours passé en paramètre.
//
// Les règles des habitudes et du tri sont CELLES DE SILLAGE (src/lib/life/
// habits.ts et src/lib/tasks.ts) : deux règles différentes pour « à faire
// aujourd'hui » finiraient par afficher deux listes qui se contredisent.
import { pointsSession } from './points.ts';
import { dureeSession } from './session.ts';
import type { Session } from './types.ts';

/* ── Habitudes ─────────────────────────────────────────────────────────── */

export interface HabitudeSillage {
  id: string;
  title: string;
  kind: 'scheduled' | 'flexible';
  /** 0 = dimanche … 6 = samedi ; vide ou null = tous les jours. */
  weekdays: number[] | null;
  times_per_week: number | null;
  started_on: string | null;
  archived_at: string | null;
  position: number | null;
}

export interface CocheSillage {
  habit_id: string;
  day: string;
}

export interface HabitudeDuJour {
  id: string;
  titre: string;
  faite: boolean;
  /** Pour une habitude « n fois par semaine » : où on en est. */
  semaine: { faites: number; cible: number } | null;
}

const jourUtc = (jour: string) => Date.parse(`${jour}T00:00:00Z`);

/** Jour de la semaine d'une date « AAAA-MM-JJ », 0 = dimanche, sans fuseau. */
export function jourDeSemaine(jour: string): number {
  return new Date(jourUtc(jour)).getUTCDay();
}

/** Lundi de la semaine d'une date « AAAA-MM-JJ ». */
export function lundiDe(jour: string): string {
  const j = jourDeSemaine(jour);
  return new Date(jourUtc(jour) - (j === 0 ? 6 : j - 1) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Les habitudes à montrer aujourd'hui : celles qui sont attendues ce jour-là,
 * plus celles déjà cochées (on doit pouvoir décocher une erreur). Une
 * habitude flexible est attendue tant que sa semaine n'est pas remplie.
 */
export function habitudesDuJour(habitudes: readonly HabitudeSillage[], coches: readonly CocheSillage[], aujourdhui: string): HabitudeDuJour[] {
  const lundi = lundiDe(aujourdhui);
  return [...habitudes]
    .filter((h) => !h.archived_at && !(h.started_on && h.started_on > aujourdhui))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .flatMap((h) => {
      const miennes = coches.filter((c) => c.habit_id === h.id);
      const faite = miennes.some((c) => c.day === aujourdhui);
      let semaine: HabitudeDuJour['semaine'] = null;
      let attendue: boolean;
      if (h.kind === 'flexible') {
        const faites = miennes.filter((c) => c.day >= lundi && c.day <= aujourdhui).length;
        const cible = Math.max(1, h.times_per_week ?? 1);
        semaine = { faites, cible };
        attendue = faites < cible;
      } else {
        attendue = !h.weekdays || h.weekdays.length === 0 || h.weekdays.includes(jourDeSemaine(aujourdhui));
      }
      return attendue || faite ? [{ id: h.id, titre: h.title, faite, semaine }] : [];
    });
}

/* ── Tâches ────────────────────────────────────────────────────────────── */

export interface TacheSillage {
  id: string;
  title: string;
  notes: string | null;
  importance: number | null;
  due_on: string | null;
  done_at: string | null;
  estimate_min: number | null;
}

export const IMPORTANCES = [
  { niveau: 1, nom: 'Basse' },
  { niveau: 2, nom: 'Normale' },
  { niveau: 3, nom: 'Haute' },
] as const;

/** Jours avant l'échéance (négatif = en retard), ou null sans échéance. */
export function joursAvant(dueOn: string | null, aujourdhui: string): number | null {
  if (!dueOn || !/^\d{4}-\d{2}-\d{2}/.test(dueOn)) return null;
  return Math.round((jourUtc(dueOn.slice(0, 10)) - jourUtc(aujourdhui)) / 86_400_000);
}

/** Même ordre que Sillage : non faites, puis échéance la plus proche (sans date en dernier), puis importance. */
export function trierTaches<T extends TacheSillage>(taches: readonly T[], aujourdhui: string): T[] {
  return [...taches].sort((a, b) => {
    const fa = a.done_at ? 1 : 0;
    const fb = b.done_at ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const ja = joursAvant(a.due_on, aujourdhui);
    const jb = joursAvant(b.due_on, aujourdhui);
    if (ja === null && jb !== null) return 1;
    if (jb === null && ja !== null) return -1;
    if (ja !== null && jb !== null && ja !== jb) return ja - jb;
    // Importance absente = « Normale », comme dans Sillage — pas 0 : une
    // tâche sans niveau ne doit pas tomber sous les tâches « Basse ».
    return (b.importance ?? 2) - (a.importance ?? 2);
  });
}

export function echeanceTexte(dueOn: string | null, aujourdhui: string): string | null {
  const j = joursAvant(dueOn, aujourdhui);
  if (j === null) return null;
  if (j < -1) return `en retard de ${-j} j`;
  if (j === -1) return 'en retard d’un jour';
  if (j === 0) return 'aujourd’hui';
  if (j === 1) return 'demain';
  if (j <= 6) return `dans ${j} j`;
  return new Date(jourUtc(dueOn!.slice(0, 10))).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/* ── Temps de travail envoyé à Sillage ─────────────────────────────────── */

/** Nom de la source dans « focus_externe » : c'est ce qui distingue Hameau de Promethee. */
export const SOURCE = 'hameau';

/** Une séance telle que Sillage la range (colonnes de focus_externe, sans profil ni source). */
export interface SeanceSillage {
  external_id: string;
  started_at: string;
  ended_at: string;
  minutes: number;
  objet: string | null;
  note: string | null;
  fin_raison: string | null;
  xp: number;
}

/** Plafond de la colonne `minutes` de Sillage : au-delà, la ligne serait refusée. */
const MINUTES_MAX = 1440;

/**
 * Les sessions closes de Hameau, au format de Sillage. Une session en cours
 * n'est pas envoyée : elle n'a pas de durée (et Number(null) vaudrait 0, une
 * séance fantôme de zéro minute). Une session de plus de 24 h (chrono oublié
 * des jours) est écartée plutôt que tronquée : un chiffre rogné à 24 h
 * mentirait autant qu'un chiffre faux.
 */
export function versSeances(sessions: readonly Session[]): SeanceSillage[] {
  const r: SeanceSillage[] = [];
  for (const s of sessions) {
    const d = dureeSession(s);
    if (d === null || s.fin === null) continue;
    const minutes = Math.round(d);
    if (minutes > MINUTES_MAX) continue;
    r.push({
      external_id: s.id,
      started_at: new Date(s.debut).toISOString(),
      ended_at: new Date(s.fin).toISOString(),
      minutes,
      // « Sur quoi » pour Sillage : la catégorie, qui alimente son « par objet ».
      objet: s.categorie.trim() || null,
      note: s.description.trim() || null,
      fin_raison: s.objectif === null ? null : d >= s.objectif ? 'objectif atteint' : 'avant l’objectif',
      xp: pointsSession(d),
    });
  }
  return r;
}

/** Ce qu'il faut écrire et effacer pour que Sillage reflète exactement Hameau. */
export function differences(locales: readonly SeanceSillage[], distantes: readonly SeanceSillage[]) {
  const parId = new Map(distantes.map((d) => [d.external_id, d]));
  const aEcrire = locales.filter((l) => {
    const d = parId.get(l.external_id);
    if (!d) return true;
    // On compare CHAQUE champ de la séance locale : un champ ajouté plus tard
    // est comparé d'office, au lieu de rester figé à sa première valeur.
    return (Object.keys(l) as (keyof SeanceSillage)[]).some((k) =>
      k === 'started_at' || k === 'ended_at' ? Date.parse(String(l[k])) !== Date.parse(String(d[k])) : (l[k] ?? null) !== (d[k] ?? null),
    );
  });
  const ici = new Set(locales.map((l) => l.external_id));
  const aSupprimer = distantes.filter((d) => !ici.has(d.external_id)).map((d) => d.external_id);
  return { aEcrire, aSupprimer };
}

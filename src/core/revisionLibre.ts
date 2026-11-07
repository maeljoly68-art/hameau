// Les séances de révision libre : étudier un cours même sans artefact (Contrôle de gestion, Droit du numérique…), ou
// en plus de ses pages (Finance). Pas de page à lire : Hameau ne sait pas CE qu'il y a à étudier, il réserve du
// TEMPS aux bons jours (relire son cours, refaire des exercices, écrire de mémoire) et compte ce qui a été fait. Pur.
//
// Les jours sont comptés À REBOURS depuis le partiel (veille, J−3, J−6, J−10…) : les séances se resserrent à
// l'approche de l'épreuve, et — comme elles sont accrochées à la date du partiel, pas à aujourd'hui — elles ne
// glissent pas d'un jour à l'autre quand on rouvre l'application.
import { capaciteDuJour } from './planning.ts';
import type { Disponibilites } from './cours.ts';
import { ajouterJours, ecartJours } from './jours.ts';
import { minutesReservees, type ReservePratique } from './pratique.ts';

export const REVISION_LIBRE_DEFAUT = 45;
export const REVISION_LIBRE_MIN = 10;
export const REVISION_LIBRE_MAX = 180;
/** Jours avant le partiel où une séance est placée : plus on approche, plus elles se rapprochent. Huit au plus. */
export const ECARTS_AVANT_PARTIEL: readonly number[] = [1, 3, 6, 10, 15, 21, 28, 36];
/** Une séance qui ne tient pas le jour prévu (jour libre, journée pleine) recule d'un ou deux jours, pas plus. */
export const DECALAGE_MAX = 2;

/** Les minutes d'une séance libre : un entier de 10 à 180, ou null (pas de séances libres). */
export function revisionLibreMinValide(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  return v >= REVISION_LIBRE_MIN && v <= REVISION_LIBRE_MAX ? v : null;
}

export interface SeanceLibre {
  jour: string;
  coursId: string;
  minutes: number;
}

export interface CoursLibre {
  id: string;
  partiel: string | null;
  enPause: boolean;
  revisionLibreMin: number | null;
  ordre: number;
}

/**
 * Les séances libres de tous les cours, jour par jour. Un cours sans partiel n'en a pas (pas d'échéance à compter à
 * rebours), ni un cours en pause, ni un partiel passé. Chaque séance prend sa place SUR le temps du jour : on ne la
 * pose que si la journée (moins la pratique quotidienne et les séances déjà posées) peut la contenir.
 */
export function seancesLibres(entree: { cours: readonly CoursLibre[]; disponibilites: Disponibilites; aujourdhui: string; charge?: ReadonlyMap<string, number>; reserves?: readonly ReservePratique[] }): SeanceLibre[] {
  const { disponibilites, aujourdhui, charge } = entree;
  const reserves = entree.reserves ?? [];
  const libres = new Set(disponibilites.libres);
  const prises = new Map<string, number>();
  const reste = (jour: string) => capaciteDuJour(disponibilites, jour, charge?.get(jour) ?? 0, libres) - minutesReservees(reserves, jour) - (prises.get(jour) ?? 0);
  const seances: SeanceLibre[] = [];
  // Le partiel le plus proche choisit ses jours en premier : c'est lui qui a le moins de marge.
  const cours = entree.cours.filter((c) => c.revisionLibreMin !== null && !c.enPause && c.partiel !== null && ecartJours(aujourdhui, c.partiel) > 0).sort((a, b) => a.partiel!.localeCompare(b.partiel!) || a.ordre - b.ordre || a.id.localeCompare(b.id));
  for (const c of cours) {
    const minutes = c.revisionLibreMin!;
    const siens = new Set<string>();
    for (const ecart of ECARTS_AVANT_PARTIEL) {
      for (let recul = 0; recul <= DECALAGE_MAX; recul++) {
        const jour = ajouterJours(c.partiel!, -(ecart + recul));
        if (ecartJours(aujourdhui, jour) < 0) break;
        if (siens.has(jour) || reste(jour) < minutes) continue;
        siens.add(jour);
        prises.set(jour, (prises.get(jour) ?? 0) + minutes);
        seances.push({ jour, coursId: c.id, minutes });
        break;
      }
    }
  }
  return seances.sort((a, b) => a.jour.localeCompare(b.jour) || a.coursId.localeCompare(b.coursId));
}

/** Les minutes de séances libres de chaque jour : ce que le planificateur met de côté avant de placer les pages. */
export function minutesLibresParJour(seances: readonly SeanceLibre[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of seances) m.set(s.jour, (m.get(s.jour) ?? 0) + s.minutes);
  return m;
}

/** Le résumé de chaque jour du calendrier (minutes, matières) avec les séances libres en plus des pages. */
export function fusionnerLibres(resume: ReadonlyMap<string, { minutes: number; cours: string[] }>, seances: readonly SeanceLibre[]): Map<string, { minutes: number; cours: string[] }> {
  const m = new Map<string, { minutes: number; cours: string[] }>();
  for (const [jour, r] of resume) m.set(jour, { minutes: r.minutes, cours: [...r.cours] });
  for (const s of seances) {
    const r = m.get(s.jour) ?? { minutes: 0, cours: [] };
    r.minutes += s.minutes;
    if (!r.cours.includes(s.coursId)) r.cours.push(s.coursId);
    m.set(s.jour, r);
  }
  return m;
}

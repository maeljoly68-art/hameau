// Pauses d'une session. La durée qui compte (points, stats, succès) est la
// durée EFFECTIVE : du début à la fin, moins les pauses. Pur : l'instant
// courant est toujours passé en paramètre.
import { MINUTE_MS } from './temps.ts';
import type { Session } from './types.ts';

type AvecPauses = Pick<Session, 'debut' | 'fin' | 'pauseSecondes' | 'pauseDepuis'>;

/** Secondes de pause valides : une valeur absente (anciennes données) n'a pas eu de pause. */
export function pauseValide(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Durée effective en minutes à l'instant `maintenantMs` (ou à la fin si la session est close). */
export function ecouleEffectif(s: AvecPauses, maintenantMs: number): number {
  const debut = Date.parse(s.debut);
  const bout = s.fin !== null ? Date.parse(s.fin) : maintenantMs;
  if (!Number.isFinite(debut) || !Number.isFinite(bout)) return 0;
  let pauseMs = pauseValide(s.pauseSecondes) * 1000;
  // Pause en cours : le temps depuis son début ne compte pas non plus.
  if (s.pauseDepuis !== null) {
    const p = Date.parse(s.pauseDepuis);
    if (Number.isFinite(p)) pauseMs += Math.max(0, bout - p);
  }
  return Math.max(0, (bout - debut - pauseMs) / MINUTE_MS);
}

/**
 * Durée effective d'une session CLOSE ; null tant qu'elle tourne. Number(null)
 * vaudrait 0 : une session en cours compterait pour zéro minute de travail.
 */
export function dureeSession(s: AvecPauses): number | null {
  if (s.fin === null) return null;
  const f = Date.parse(s.fin);
  if (!Number.isFinite(f) || !Number.isFinite(Date.parse(s.debut))) return null;
  return ecouleEffectif(s, f);
}

export function enPause(s: Pick<Session, 'fin' | 'pauseDepuis'>): boolean {
  return s.fin === null && s.pauseDepuis !== null;
}

/** Met en pause à `instant` ; sans effet sur une session close ou déjà en pause. */
export function mettreEnPause<S extends AvecPauses>(s: S, instant: string): S {
  if (s.fin !== null || s.pauseDepuis !== null) return s;
  return { ...s, pauseDepuis: instant };
}

/** Reprend à `instant` : la pause en cours rejoint le cumul. */
export function reprendre<S extends AvecPauses>(s: S, instant: string): S {
  if (s.fin !== null || s.pauseDepuis === null) return s;
  const ajout = Math.max(0, Math.floor((Date.parse(instant) - Date.parse(s.pauseDepuis)) / 1000));
  return { ...s, pauseSecondes: pauseValide(s.pauseSecondes) + (Number.isFinite(ajout) ? ajout : 0), pauseDepuis: null };
}

/**
 * Clôt la session à `fin`. Une pause en cours s'arrête à la fin (on ne
 * compte pas comme travail le temps passé en pause avant d'appuyer sur
 * « Terminer »), et le cumul ne dépasse jamais la durée totale.
 */
export function clore<S extends AvecPauses>(s: S, fin: string): S {
  const repris = s.pauseDepuis !== null ? reprendre({ ...s, fin: null }, fin) : s;
  const total = Math.max(0, Math.floor((Date.parse(fin) - Date.parse(s.debut)) / 1000));
  return { ...repris, fin, pauseSecondes: Math.min(pauseValide(repris.pauseSecondes), Number.isFinite(total) ? total : 0), pauseDepuis: null };
}

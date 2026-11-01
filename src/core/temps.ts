// Fonctions de temps pures : aucune ne lit l'horloge elle-même, « maintenant »
// est toujours passé en paramètre, sinon les tests dépendraient de l'heure.

export const MINUTE_MS = 60_000;

/** Durée en minutes entre deux instants ISO. `fin` absente => null, jamais 0. */
export function dureeMinutes(debut: string, fin: string | null): number | null {
  // Number(null) vaut 0 : une session en cours ne doit pas compter pour
  // « zéro minute », elle n'a pas encore de durée.
  if (fin === null) return null;
  const d = Date.parse(debut);
  const f = Date.parse(fin);
  if (!Number.isFinite(d) || !Number.isFinite(f)) return null;
  return Math.max(0, (f - d) / MINUTE_MS);
}

/** Clé AAAA-MM-JJ du jour LOCAL de l'appareil. */
export function cleJour(date: Date): string {
  // toISOString donnerait le jour UTC : une session à 0 h 30 à Paris serait
  // comptée la veille, et la série casserait sans raison.
  const a = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const j = String(date.getDate()).padStart(2, '0');
  return `${a}-${m}-${j}`;
}

/** Recule (ou avance) de n jours calendaires, en heure locale. */
export function decalerJours(date: Date, n: number): Date {
  // Ajouter n × 24 h se tromperait d'un jour aux changements d'heure.
  const r = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, 12);
  return r;
}

/** Lundi (local) de la semaine contenant `date`. */
export function lundi(date: Date): Date {
  const decalage = (date.getDay() + 6) % 7;
  return decalerJours(date, -decalage);
}

/** Chrono « 12:03 » ou « 1:02:03 ». */
export function formatChrono(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Durée lisible « 45 min », « 1 h 05 ». */
export function formatDuree(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const reste = m % 60;
  return reste === 0 ? `${h} h` : `${h} h ${String(reste).padStart(2, '0')}`;
}

// Course du soleil et de la lune, pour le ciel du village. Pur : l'instant
// est toujours un paramètre.
//
// Le village suit l'heure du téléphone comme s'il était à Paris : latitude de
// Paris, heure légale française (UTC+1, UTC+2 l'été). Ailleurs, c'est l'heure
// de la montre qui fait foi plutôt que la position réelle : un ami à Montréal
// voit l'aube à son réveil, pas à celui de Paris.

export const LATITUDE = 48.85;
/**
 * Retard du soleil de Paris sur l'heure légale d'hiver : le fuseau UTC+1 est
 * calé sur le méridien 15° E, Paris est à 2,35° E, soit (15 − 2,35) × 4 min.
 * Sans lui, le soleil se lèverait 50 minutes trop tôt.
 */
const RETARD_MERIDIEN_H = ((15 - 2.35) * 4) / 60;
const RAD = Math.PI / 180;

/** Rang du jour dans l'année, 1 pour le 1er janvier (date locale). */
export function jourDeLAnnee(d: Date): number {
  const debut = new Date(d.getFullYear(), 0, 1).getTime();
  const ceJour = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Arrondi : le jour du passage à l'heure d'été ne dure que 23 heures.
  return Math.round((ceJour - debut) / 86_400_000) + 1;
}

/** Déclinaison du soleil (degrés) et équation du temps (minutes), formules de la NOAA. */
export function positionAnnuelle(jour: number): { declinaison: number; equationTemps: number } {
  const g = ((2 * Math.PI) / 365) * (jour - 1);
  const equationTemps =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const declinaison =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  return { declinaison: declinaison / RAD, equationTemps };
}

/** Heures d'avance de l'heure d'été sur l'heure d'hiver, à cette date, pour ce téléphone. */
function avanceEte(d: Date): number {
  const hiver = Math.max(new Date(d.getFullYear(), 0, 1).getTimezoneOffset(), new Date(d.getFullYear(), 6, 1).getTimezoneOffset());
  return (hiver - d.getTimezoneOffset()) / 60;
}

/** Heure solaire vraie (0–24) à Paris, pour l'heure qu'affiche le téléphone. */
export function heureSolaire(d: Date): number {
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  const { equationTemps } = positionAnnuelle(jourDeLAnnee(d));
  const t = h - avanceEte(d) - RETARD_MERIDIEN_H + equationTemps / 60;
  return ((t % 24) + 24) % 24;
}

/** Hauteur du soleil au-dessus de l'horizon, en degrés : négative la nuit. */
export function hauteurSoleil(jour: number, heureSol: number, latitude = LATITUDE): number {
  const { declinaison } = positionAnnuelle(jour);
  const angleHoraire = (heureSol - 12) * 15;
  const s =
    Math.sin(latitude * RAD) * Math.sin(declinaison * RAD) +
    Math.cos(latitude * RAD) * Math.cos(declinaison * RAD) * Math.cos(angleHoraire * RAD);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

/** Demi-durée du jour en heures, du lever (centre du disque) à midi solaire. */
function demiJour(jour: number, latitude = LATITUDE): number {
  const { declinaison } = positionAnnuelle(jour);
  const c = -Math.tan(latitude * RAD) * Math.tan(declinaison * RAD);
  return Math.acos(Math.max(-1, Math.min(1, c))) / RAD / 15;
}

export interface Soleil {
  /** Degrés au-dessus de l'horizon. */
  hauteur: number;
  /**
   * Part du « matin » dans les couleurs : 1 à 6 h solaires, 0 à 18 h, et une
   * pente douce entre les deux. Un simple « avant midi ? » ferait sauter les
   * couleurs d'un coup à midi l'hiver (soleil bas) et à minuit l'été (nuit
   * claire), quand l'aube et le crépuscule n'ont pas encore fini de se mêler.
   */
  poidsMatin: number;
  /**
   * Position dans le ciel : 0,08 au lever (à gauche), 0,5 à midi, 0,92 au
   * coucher (à droite), quelle que soit la saison. La nuit, il reste du côté
   * où il s'est couché, puis passe de l'autre à minuit, sous l'horizon.
   */
  x: number;
}

export function soleil(d: Date): Soleil {
  const t = heureSolaire(d);
  const jour = jourDeLAnnee(d);
  const x = 0.5 + ((t - 12) / demiJour(jour)) * 0.42;
  return { hauteur: hauteurSoleil(jour, t), poidsMatin: 0.5 + 0.5 * Math.cos((Math.PI * (t - 6)) / 12), x: Math.min(1, Math.max(0, x)) };
}

/** Âge de la lune, de 0 (nouvelle) à 1, 0,5 étant la pleine lune ; mois synodique moyen. */
export function phaseLune(d: Date): number {
  // Nouvelle lune de référence : 6 janvier 2000, 18 h 14 UTC.
  const p = (d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / (29.530588853 * 86_400_000);
  return ((p % 1) + 1) % 1;
}

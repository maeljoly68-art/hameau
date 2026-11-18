/**
 * La position du soleil, pour éclairer la ville à l'heure qu'il est.
 *
 * ── Ce que ça calcule ───────────────────────────────────────────────────
 *
 * La hauteur du soleil au-dessus de l'horizon et son azimut, par les
 * formules d'almanach à faible précision : justes à une fraction de degré,
 * ce qui est très au-delà de ce qu'un décor demande.
 *
 * ── Pourquoi un lieu fixe ───────────────────────────────────────────────
 *
 * Lyon, comme dans la ville d'origine. Demander la position de l'appareil
 * pour faire tomber la nuit dix minutes plus tôt serait une permission de
 * plus à accorder pour un effet que personne ne verrait.
 *
 * ── Le piège gardé ──────────────────────────────────────────────────────
 *
 * L'heure LOCALE de l'appareil ne doit pas entrer dans le calcul : il part
 * de l'instant universel. Un calcul fait sur `getHours()` afficherait le
 * plein jour à minuit chez quelqu'un qui voyage.
 *
 * Module de calcul pur : ni réseau, ni React, ni base.
 */

export const LATITUDE = 45.764;
export const LONGITUDE = 4.836;

const RAD = Math.PI / 180;

export type Soleil = {
  /** Hauteur au-dessus de l'horizon, en degrés. Négative la nuit. */
  alt: number;
  /** Azimut en radians, depuis le nord, dans le sens des aiguilles. */
  az: number;
};

export function positionSoleil(date: Date): Soleil {
  // Jours depuis le 1er janvier 2000 à midi, temps universel.
  const d = date.getTime() / 864e5 + 2440587.5 - 2451545;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 3.6e-7 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const lst = ((18.697374558 + 24.06570982441908 * d) * 15 + LONGITUDE) * RAD;
  const ha = lst - ra;
  const lat = LATITUDE * RAD;
  const alt = Math.asin(
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha),
  );
  const az = Math.atan2(
    -Math.sin(ha),
    Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha),
  );
  return { alt: alt / RAD, az };
}

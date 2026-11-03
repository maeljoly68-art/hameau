// Mélange de couleurs pour la lumière du village. Pur.

export type Rgb = [number, number, number];

/** « #rgb », « #rgba », « #rrggbb » ou « #rrggbbaa » → composantes et alpha (texte hexadécimal, ou ''). */
function lire(c: string): { rgb: Rgb; alpha: string } | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  return { rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)], alpha: h.slice(6) };
}

export function versRgb(c: string): Rgb {
  return lire(c)?.rgb ?? [0, 0, 0];
}

export function versHex([r, g, b]: Rgb, alpha = ''): string {
  const x = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${x(r)}${x(g)}${x(b)}${alpha}`;
}

/** De `a` (t = 0) à `b` (t = 1). */
export function melanger(a: string, b: string, t: number): string {
  const ca = lire(a);
  const cb = lire(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  const k = Math.min(1, Math.max(0, t));
  return versHex([0, 1, 2].map((i) => ca.rgb[i] + (cb.rgb[i] - ca.rgb[i]) * k) as Rgb, ca.alpha);
}

/**
 * La couleur sous une lumière colorée : multipliée par la teinte, dosée par
 * `force` (0 = inchangée). Une couleur qu'on ne sait pas lire (« rgba(…) »)
 * passe telle quelle, plutôt que de devenir noire.
 */
export function eclairer(couleur: string, teinte: string, force: number): string {
  if (force <= 0) return couleur;
  const c = lire(couleur);
  const t = lire(teinte);
  if (!c || !t) return couleur;
  const k = Math.min(1, force);
  return versHex([0, 1, 2].map((i) => c.rgb[i] * (1 - k + (k * t.rgb[i]) / 255)) as Rgb, c.alpha);
}

/** Vers le blanc (k > 0) ou vers le noir (k < 0). */
export function eclaircir(couleur: string, k: number): string {
  return k >= 0 ? melanger(couleur, '#ffffff', k) : melanger(couleur, '#000000', -k);
}

/** Écart entre deux couleurs, de 0 à 441 (distance dans le cube RGB). */
export function ecart(a: string, b: string): number {
  const x = versRgb(a);
  const y = versRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

// Couleurs du ciel et de la lumière selon la hauteur du soleil. Pur.
//
// Une palette par moment (aube, jour, soir, nuit) faisait changer le ciel d'un
// coup, à heure fixe, toute l'année. Ici, tout suit la hauteur réelle du
// soleil, par paliers interpolés : heure bleue, rose de l'aube, heure dorée,
// rouge du couchant, puis la nuit qui monte. L'aube et le soir ont chacun
// leurs teintes : plus froides et rosées le matin, plus chaudes le soir.
import { melanger } from './couleur.ts';
import { phaseLune, soleil, type Soleil } from './soleil.ts';

interface Cle {
  /** Hauteur du soleil, en degrés. */
  h: number;
  haut: string;
  milieu: string;
  bas: string;
  /** Lueur près de l'horizon, du côté du soleil. */
  lueur: string;
  lueurForce: number;
  /** Lumière qui baigne la scène : teinte multipliée, et sa force. */
  teinte: string;
  force: number;
  /** Disque du soleil. */
  astre: string;
}

const NUIT: Cle = { h: -18, haut: '#060a1c', milieu: '#0d1331', bas: '#18204a', lueur: '#18204a', lueurForce: 0, teinte: '#34428a', force: 0.62, astre: '#ff5a2e' };
const JOUR: Cle = { h: 30, haut: '#4c9ce6', milieu: '#86c2f2', bas: '#d2eafc', lueur: '#ffffff', lueurForce: 0, teinte: '#ffffff', force: 0, astre: '#fff6cf' };

// Paliers (mêmes hauteurs dans les deux tables), de la nuit au plein jour.
const MATIN: readonly Cle[] = [
  NUIT,
  { h: -12, haut: '#0a1130', milieu: '#161e4a', bas: '#2b2f6a', lueur: '#4a3f86', lueurForce: 0.18, teinte: '#3b4890', force: 0.56, astre: '#ff5a2e' },
  { h: -6, haut: '#142057', milieu: '#363d88', bas: '#8f76b6', lueur: '#ff9cb4', lueurForce: 0.42, teinte: '#5e58a8', force: 0.45, astre: '#ff6a3d' },
  { h: -2, haut: '#25397f', milieu: '#7472b8', bas: '#f0a2b6', lueur: '#ffaab0', lueurForce: 0.72, teinte: '#c98aa8', force: 0.32, astre: '#ff7f50' },
  { h: 0, haut: '#355597', milieu: '#a094c6', bas: '#ffc2a6', lueur: '#ffbe98', lueurForce: 0.85, teinte: '#f3a99a', force: 0.26, astre: '#ff9a5c' },
  { h: 3, haut: '#4d72b8', milieu: '#b1bde0', bas: '#ffdcb6', lueur: '#ffd5a6', lueurForce: 0.6, teinte: '#ffcfa2', force: 0.17, astre: '#ffc070' },
  { h: 7, haut: '#5a8fd2', milieu: '#a3cbee', bas: '#eaf1ee', lueur: '#fff0cc', lueurForce: 0.28, teinte: '#ffe4bd', force: 0.08, astre: '#ffe08a' },
  { h: 14, haut: '#559fe2', milieu: '#8dc6f1', bas: '#d0e9fa', lueur: '#fff8e6', lueurForce: 0.08, teinte: '#fff6e8', force: 0.02, astre: '#fff2b8' },
  JOUR,
];
const SOIR: readonly Cle[] = [
  NUIT,
  { h: -12, haut: '#0b1030', milieu: '#1a1b48', bas: '#33285e', lueur: '#5a2d62', lueurForce: 0.2, teinte: '#3e4388', force: 0.56, astre: '#ff4a26' },
  { h: -6, haut: '#161e52', milieu: '#46357c', bas: '#b05f82', lueur: '#ff6f5e', lueurForce: 0.48, teinte: '#744a8a', force: 0.45, astre: '#ff5a2e' },
  { h: -2, haut: '#2a357a', milieu: '#9562a0', bas: '#f5846a', lueur: '#ff6a40', lueurForce: 0.8, teinte: '#de6f5c', force: 0.33, astre: '#ff6a36' },
  { h: 0, haut: '#3a5596', milieu: '#c0849f', bas: '#ff9c62', lueur: '#ff7a38', lueurForce: 0.9, teinte: '#ff8c5c', force: 0.27, astre: '#ff7d3d' },
  { h: 3, haut: '#4f70b4', milieu: '#dcae9c', bas: '#ffbd76', lueur: '#ff9c4c', lueurForce: 0.65, teinte: '#ffb06e', force: 0.19, astre: '#ffa04c' },
  { h: 7, haut: '#5a8cd0', milieu: '#b5c9e2', bas: '#f8dcb4', lueur: '#ffc988', lueurForce: 0.32, teinte: '#ffd6a0', force: 0.1, astre: '#ffd27a' },
  { h: 14, haut: '#559fe2', milieu: '#8dc6f1', bas: '#d6e8f2', lueur: '#fff0d6', lueurForce: 0.1, teinte: '#fff2e0', force: 0.03, astre: '#fff0b0' },
  JOUR,
];

const borne = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** 0 en `a`, 1 en `b` (a > b est permis), en pente douce. */
function lisse(a: number, b: number, v: number): number {
  const t = borne((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function interpoler(table: readonly Cle[], h: number): Cle {
  if (h <= table[0].h) return table[0];
  const dernier = table[table.length - 1];
  if (h >= dernier.h) return dernier;
  let i = 0;
  while (table[i + 1].h < h) i++;
  const a = table[i];
  const b = table[i + 1];
  const t = (h - a.h) / (b.h - a.h);
  return melangerCles(a, b, t);
}

function melangerCles(a: Cle, b: Cle, t: number): Cle {
  return {
    h: a.h + (b.h - a.h) * t,
    haut: melanger(a.haut, b.haut, t),
    milieu: melanger(a.milieu, b.milieu, t),
    bas: melanger(a.bas, b.bas, t),
    lueur: melanger(a.lueur, b.lueur, t),
    lueurForce: a.lueurForce + (b.lueurForce - a.lueurForce) * t,
    teinte: melanger(a.teinte, b.teinte, t),
    force: a.force + (b.force - a.force) * t,
    astre: melanger(a.astre, b.astre, t),
  };
}

export interface Ambiance {
  /** Dégradé du ciel, du zénith à l'horizon. */
  ciel: [string, string, string];
  lueur: { couleur: string; force: number };
  astre: { couleur: string; rayon: number; halo: number };
  /** Lumière sur la scène : la couleur des objets est multipliée par `teinte`, dosée par `force`. */
  lumiere: { teinte: string; force: number };
  /** Soleil rasant : les faces tournées vers lui s'éclairent de cette couleur. */
  reflet: { couleur: string; force: number };
  nuages: { couleur: string; opacite: number };
  /** De 0 à 1 : étoiles, lune, fenêtres allumées, netteté des ombres. */
  etoiles: number;
  lune: number;
  fenetres: number;
  ombre: number;
  /** Assez noir pour que les habitants dorment et que les lucioles sortent. */
  nuit: boolean;
}

export function ambiance(hauteur: number, poidsMatin: number): Ambiance {
  const c = melangerCles(interpoler(SOIR, hauteur), interpoler(MATIN, hauteur), borne(poidsMatin));
  const h = hauteur;
  const blanc = melanger('#ffffff', c.lueur, c.lueurForce * 0.55);
  return {
    ciel: [c.haut, c.milieu, c.bas],
    lueur: { couleur: c.lueur, force: c.lueurForce },
    astre: { couleur: c.astre, rayon: 17 + 5 * lisse(12, 0, h), halo: 0.3 + 0.45 * lisse(12, 0, h) },
    lumiere: { teinte: c.teinte, force: c.force },
    reflet: { couleur: c.lueur, force: 0.16 * lisse(-1.5, 1.5, h) * lisse(16, 5, h) },
    nuages: { couleur: melanger(blanc, '#2a3264', lisse(-2, -11, h)), opacite: 0.92 - 0.66 * lisse(-1, -12, h) },
    etoiles: lisse(-3, -13, h),
    lune: lisse(-1, -7, h),
    fenetres: lisse(3, -3, h),
    ombre: lisse(-1, 10, h),
    nuit: h < -7,
  };
}

export interface Ciel {
  soleil: Soleil;
  ambiance: Ambiance;
  /** Âge de la lune, 0 = nouvelle, 0,5 = pleine. */
  lune: number;
}

export function cielPour(d: Date): Ciel {
  const s = soleil(d);
  return { soleil: s, ambiance: ambiance(s.hauteur, s.poidsMatin), lune: phaseLune(d) };
}

export type Moment = 'nuit' | 'aube' | 'lever' | 'jour' | 'coucher' | 'crepuscule';

/** Le moment de la journée, en mots : pour le lecteur d'écran et la légende. */
export function momentDuCiel(c: Ciel): Moment {
  const { hauteur: h, poidsMatin } = c.soleil;
  const matin = poidsMatin >= 0.5;
  if (h < -6) return 'nuit';
  if (h < 0) return matin ? 'aube' : 'crepuscule';
  if (h < 6) return matin ? 'lever' : 'coucher';
  return 'jour';
}

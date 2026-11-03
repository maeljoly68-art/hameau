import { createContext, useContext, type ReactNode } from 'react';
import type { Ambiance } from '../../core/ciel.ts';
import { eclaircir, eclairer, melanger } from '../../core/couleur.ts';
import type { Saison } from '../../core/saison.ts';

/**
 * Saison du dessin, partagée par contexte : la passer en paramètre à chacun
 * des seize dessins pour qu'elle atteigne trois arbres et quelques toits
 * aurait encombré toutes les signatures.
 */
export const SaisonContexte = createContext<Saison>('ete');

/** La lumière du moment, appliquée à chaque couleur peinte. */
export interface Lumiere {
  /** Couleur d'un objet sous la lumière du moment. */
  peindre(c: string): string;
  /** Pareil pour une face tournée à gauche ou à droite : le soleil rasant éclaire l'une, pas l'autre. */
  face(c: string, cote: 'gauche' | 'droite'): string;
  /** De 0 à 1 : fenêtres et lanternes allumées. Elles ne prennent pas la teinte : elles éclairent. */
  allume: number;
}

export const LUMIERE_NEUTRE: Lumiere = { peindre: (c) => c, face: (c) => c, allume: 0 };
/** Sans fournisseur (aperçus de la boutique), la lumière est celle de midi. */
export const LumiereContexte = createContext<Lumiere>(LUMIERE_NEUTRE);

export function lumierePour(a: Ambiance, soleilX: number): Lumiere {
  const { teinte, force } = a.lumiere;
  const memoire = new Map<string, string>();
  const peindre = (c: string) => {
    let r = memoire.get(c);
    if (r === undefined) {
      r = eclairer(c, teinte, force);
      memoire.set(c, r);
    }
    return r;
  };
  const coteSoleil = soleilX < 0.5 ? 'gauche' : 'droite';
  // Rasant ET de côté : à midi, le soleil n'éclaire pas une face plus que l'autre.
  const k = a.reflet.force * Math.min(1, Math.abs(soleilX - 0.5) * 2.4);
  const face = (c: string, cote: 'gauche' | 'droite') => {
    const base = peindre(c);
    if (k <= 0.001) return base;
    return cote === coteSoleil ? melanger(base, a.reflet.couleur, k) : eclaircir(base, -k * 0.6);
  };
  return { peindre, face, allume: a.fenetres };
}

const LUEUR = '#ffd76a';

// Rendu isométrique : une case fait 64 × 32 px à l'écran.
export const DX = 32;
export const DY = 16;

export const ecran = (x: number, y: number) => ({ sx: (x - y) * DX, sy: (x + y) * DY });

export type Pt = [number, number];
export const pts = (p: Pt[]) => p.map(([a, b]) => `${a},${b}`).join(' ');

/** Boîte isométrique posée sur la case, d'emprise `e` (0–1) et de hauteur `h`. */
function Boite({ e, h, gauche, droite, dessus, dy = 0 }: { e: number; h: number; gauche: string; droite: string; dessus: string; dy?: number }) {
  const l = useContext(LumiereContexte);
  const g: Pt = [-DX * e, dy];
  const b: Pt = [0, DY * e + dy];
  const d: Pt = [DX * e, dy];
  const t: Pt = [0, -DY * e + dy];
  const haut = (p: Pt): Pt => [p[0], p[1] - h];
  return (
    <g>
      <polygon points={pts([g, b, haut(b), haut(g)])} fill={l.face(gauche, 'gauche')} />
      <polygon points={pts([b, d, haut(d), haut(b)])} fill={l.face(droite, 'droite')} />
      <polygon points={pts([haut(t), haut(d), haut(b), haut(g)])} fill={l.peindre(dessus)} />
    </g>
  );
}

/** Toit en pyramide au-dessus d'une boîte. `epi` : l'ornement doré du niveau 3. */
function Toit({ e, h, r, clair, sombre, epi = false }: { e: number; h: number; r: number; clair: string; sombre: string; epi?: boolean }) {
  const l = useContext(LumiereContexte);
  const g: Pt = [-DX * e, -h];
  const b: Pt = [0, DY * e - h];
  const d: Pt = [DX * e, -h];
  const t: Pt = [0, -DY * e - h];
  const sommet: Pt = [0, -h - r];
  const neige = useContext(SaisonContexte) === 'hiver';
  // Neige sur le haut du toit : de la base vers le sommet, au-delà de 40 %.
  const vers = (p: Pt, k: number): Pt => [p[0] + (sommet[0] - p[0]) * k, p[1] + (sommet[1] - p[1]) * k];
  return (
    <g>
      <polygon points={pts([t, d, sommet])} fill={l.face(sombre, 'droite')} />
      <polygon points={pts([g, t, sommet])} fill={l.face(clair, 'gauche')} />
      <polygon points={pts([g, b, sommet])} fill={l.face(clair, 'gauche')} />
      <polygon points={pts([b, d, sommet])} fill={l.face(sombre, 'droite')} />
      {neige && (
        <>
          <polygon points={pts([vers(g, 0.4), vers(b, 0.4), sommet])} fill={l.peindre('#f4f8ff')} />
          <polygon points={pts([vers(b, 0.4), vers(d, 0.4), sommet])} fill={l.peindre('#d9e3f0')} />
          <path d={`M ${vers(g, 0.4)[0]} ${vers(g, 0.4)[1]} q 3 4 6 1 q 3 4 6 0`} stroke={l.peindre('#f4f8ff')} strokeWidth={2} fill="none" strokeLinecap="round" />
        </>
      )}
      {epi && (
        <g transform={`translate(0 ${sommet[1]})`}>
          <line x1={0} y1={0} x2={0} y2={-7} stroke={l.peindre('#8a6a2a')} strokeWidth={1.2} />
          <circle cy={-7.5} r={1.9} fill={l.peindre('#f2c14e')} />
        </g>
      )}
    </g>
  );
}

/** Fenêtre : bleutée le jour, puis dorée à mesure que la nuit tombe, avec un halo. */
function Fenetre({ x, y, l = 4, h = 5, rx = 1 }: { x: number; y: number; l?: number; h?: number; rx?: number }) {
  const lu = useContext(LumiereContexte);
  return (
    <>
      {lu.allume > 0.35 && <rect x={x - 1.6} y={y - 1.6} width={l + 3.2} height={h + 3.2} rx={rx + 1.5} fill={LUEUR} opacity={0.28 * lu.allume} />}
      <rect x={x} y={y} width={l} height={h} rx={rx} fill={melanger(lu.peindre('#5a7fa8'), LUEUR, lu.allume)} />
    </>
  );
}

/** Petit fanion qui flotte ; (0, 0) au pied du mât. */
function Fanion({ couleur = '#d94a4a', mat = 12 }: { couleur?: string; mat?: number }) {
  const l = useContext(LumiereContexte);
  return (
    <g>
      <line x1={0} y1={0} x2={0} y2={-mat} stroke={l.peindre('#5a3d22')} strokeWidth={1.2} />
      <polygon points={`0,${-mat} 9,${-mat + 3} 0,${-mat + 6}`} fill={l.peindre(couleur)} className="fanion" />
    </g>
  );
}

/** Buisson rond, fleuri ou non. */
function Buisson({ x, y, r = 4, fleurs }: { x: number; y: number; r?: number; fleurs?: string }) {
  const l = useContext(LumiereContexte);
  const saison = useContext(SaisonContexte);
  const vert = saison === 'automne' ? '#b98a35' : saison === 'hiver' ? '#6f8f7b' : '#3f8f4a';
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={0} cy={-r * 0.6} rx={r * 1.2} ry={r} fill={l.peindre(vert)} />
      <ellipse cx={-r * 0.4} cy={-r * 0.9} rx={r * 0.6} ry={r * 0.5} fill={l.peindre(eclaircir(vert, 0.18))} />
      {fleurs && saison !== 'hiver' && (
        <>
          <circle cx={-r * 0.5} cy={-r * 0.7} r={1.1} fill={l.peindre(fleurs)} />
          <circle cx={r * 0.5} cy={-r * 1.1} r={1.1} fill={l.peindre(fleurs)} />
          <circle cx={r * 0.2} cy={-r * 0.3} r={1} fill={l.peindre('#ffffff')} />
        </>
      )}
      {saison === 'hiver' && <ellipse cx={0} cy={-r * 1.35} rx={r * 0.9} ry={r * 0.35} fill={l.peindre('#f4f8ff')} />}
    </g>
  );
}

const FEUILLAGE: Record<Saison, [string, string, string]> = {
  printemps: ['#4fae55', '#43a04a', '#6cc46c'],
  ete: ['#3f8f4a', '#367d41', '#4fa95b'],
  automne: ['#d9822b', '#c0582a', '#efb441'],
  hiver: ['#5f7f6c', '#557563', '#6f8f7b'],
};

function Arbre({ dy = 0, niveau = 1 }: { dy?: number; niveau?: number }) {
  const l = useContext(LumiereContexte);
  const p = l.peindre;
  const saison = useContext(SaisonContexte);
  const [a, b, c] = FEUILLAGE[saison];
  // Plus vieux, plus large : la ramure grandit à chaque niveau.
  const k = niveau >= 3 ? 1.28 : niveau === 2 ? 1.14 : 1;
  return (
    <g transform={`translate(0 ${dy})`}>
      <Boite e={0.08 * k} h={12 * k} gauche="#6b4a2b" droite="#5a3d22" dessus="#7a5634" />
      {niveau >= 2 && (
        <g transform={`translate(1.5 ${-9 * k})`}>
          <rect x={-2.4} y={-3} width={4.8} height={4.2} fill={p('#b07d48')} />
          <polygon points="-3.2,-3 0,-6 3.2,-3" fill={p('#9e3f2a')} />
          <circle cy={-1} r={0.9} fill={p('#3a2a20')} />
        </g>
      )}
      <g transform={`scale(${k})`}>
        <circle cx={0} cy={-22} r={13} fill={p(a)} />
        <circle cx={-6} cy={-17} r={9} fill={p(b)} />
        <circle cx={6} cy={-27} r={8} fill={p(c)} />
        {saison === 'printemps' && (
          <g fill={p('#ffd3e2')}>
            <circle cx={-5} cy={-26} r={1.8} />
            <circle cx={5} cy={-19} r={1.8} />
            <circle cx={-1} cy={-31} r={1.6} />
            <circle cx={8} cy={-28} r={1.5} />
          </g>
        )}
        {niveau >= 3 && (saison === 'ete' || saison === 'automne') && (
          <g fill={p(saison === 'ete' ? '#e0473f' : '#f0a030')}>
            <circle cx={-7} cy={-24} r={1.9} />
            <circle cx={4} cy={-16} r={1.9} />
            <circle cx={8} cy={-24} r={1.7} />
            <circle cx={-2} cy={-30} r={1.7} />
            <circle cx={-9} cy={-15} r={1.6} />
          </g>
        )}
        {saison === 'hiver' && (
          <g fill={p('#f4f8ff')}>
            <ellipse cx={0} cy={-33} rx={8} ry={3.2} />
            <ellipse cx={6} cy={-33.5} rx={5} ry={2.4} />
            <ellipse cx={-7} cy={-24} rx={5} ry={2.2} />
          </g>
        )}
      </g>
    </g>
  );
}

function Fumee() {
  const l = useContext(LumiereContexte);
  return (
    <g className="fumee">
      <circle r={3} fill={l.peindre('#d9d9d9')} opacity={0.7} />
      <circle r={4} cx={3} cy={-7} fill={l.peindre('#e6e6e6')} opacity={0.5} />
      <circle r={5} cx={-1} cy={-15} fill={l.peindre('#f0f0f0')} opacity={0.35} />
    </g>
  );
}

/** Lanterne posée ou tenue ; (0, 0) au bas du verre. */
export function Lanterne({ echelle = 1 }: { echelle?: number }) {
  const l = useContext(LumiereContexte);
  return (
    <g transform={`scale(${echelle})`}>
      {l.allume > 0.3 && <circle cx={0} cy={-4} r={14} fill="url(#halo)" opacity={l.allume} />}
      <rect x={-6} y={-10} width={12} height={11} rx={2} fill={l.peindre('#3a3530')} />
      <rect x={-4} y={-8} width={8} height={7} rx={1} fill={melanger(l.peindre('#f3e7c4'), LUEUR, l.allume)} className={l.allume > 0.5 ? 'lueur' : undefined} />
      <polygon points="-7,-10 0,-16 7,-10" fill={l.peindre('#2a2622')} />
    </g>
  );
}

const FLEURS_1: [number, number, string][] = [[-12, 0, '#ff6b8a'], [-4, 5, '#ffd34d'], [6, -2, '#b07cff'], [12, 4, '#ff6b8a'], [0, -5, '#ffffff'], [-6, -3, '#ffd34d'], [4, 8, '#b07cff']];
const FLEURS_2: [number, number, string][] = [[-19, 2, '#ffd34d'], [18, 1, '#ffffff'], [-10, 8, '#b07cff'], [10, -7, '#ff6b8a'], [-15, -5, '#ff9e5e'], [16, 8, '#ffd34d'], [-2, 11, '#ff6b8a']];

/** Dessin d'un bâtiment à son niveau (1 à 3), origine au centre de sa case. */
export function Dessin({ id, actif, niveau = 1 }: { id: string; actif: boolean; niveau?: number }): ReactNode {
  const l = useContext(LumiereContexte);
  const p = l.peindre;
  const n = Math.min(3, Math.max(1, Math.floor(niveau) || 1));
  switch (id) {
    case 'fleurs': {
      // Au niveau 3, la vasque prend le centre : on écarte les fleurs qui la couvriraient.
      const fleurs = [...FLEURS_1, ...(n >= 2 ? FLEURS_2 : [])].filter(([x, y]) => n < 3 || Math.abs(x) > 7 || Math.abs(y) > 6);
      return (
        <g>
          {n >= 3 && (
            <g>
              <ellipse cx={0} cy={1} rx={7} ry={3.2} fill={p('#8e8e96')} />
              <rect x={-2} y={-7} width={4} height={8} fill={p('#a3a3ab')} />
              <ellipse cx={0} cy={-7} rx={8.5} ry={3.6} fill={p('#b5b5bd')} />
              <ellipse cx={0} cy={-7.4} rx={6} ry={2.3} fill={p('#5aa1e0')} className="eau" />
              <circle cx={4} cy={-11} r={1.6} fill={p('#6b6b75')} />
              <polygon points="5.5,-11 7.5,-10.6 5.5,-10.2" fill={p('#e8a23a')} />
            </g>
          )}
          {fleurs.map(([x, y, c], i) => (
            <g key={i}>
              <line x1={x} y1={y + 4} x2={x} y2={y} stroke={p('#2f7d3b')} strokeWidth={1.2} />
              <circle cx={x} cy={y} r={n >= 2 ? 2.9 : 2.6} fill={p(c)} />
            </g>
          ))}
        </g>
      );
    }
    case 'arbre':
      return <Arbre niveau={n} />;
    case 'cabane':
      return (
        <g>
          {n >= 2 && (
            <g transform="translate(-21 5)">
              {[[0, 0], [4.4, 0], [2.2, -3.6]].map(([x, y], i) => (
                <g key={i}>
                  <circle cx={x} cy={y} r={2.3} fill={p('#8a5e33')} />
                  <circle cx={x} cy={y} r={1.1} fill={p('#d9b07a')} />
                </g>
              ))}
            </g>
          )}
          <Boite e={0.45} h={14} gauche="#a0703f" droite="#8a5e33" dessus="#b07d48" />
          {n >= 3 && (
            <g>
              <rect x={5} y={-29} width={4.6} height={10} fill={p('#8e8e96')} />
              <rect x={4.4} y={-30} width={5.8} height={2} fill={p('#6b6b75')} />
              {actif && (
                <g transform="translate(7.3 -32)">
                  <Fumee />
                </g>
              )}
            </g>
          )}
          <Toit e={0.5} h={14} r={14} clair="#c0533a" sombre="#9e3f2a" epi={n >= 3} />
          <rect x={-9} y={-1} width={6} height={10} fill={p('#5a3a1c')} transform="skewY(26)" />
          {n >= 2 && (
            <g transform="skewY(-26)">
              <Fenetre x={5} y={-3} />
            </g>
          )}
          {n >= 3 && (
            <g transform="translate(-15 6)">
              <line x1={0} y1={0} x2={0} y2={-12} stroke={p('#3a3530')} strokeWidth={1.2} />
              <g transform="translate(0 -11)">
                <Lanterne echelle={0.45} />
              </g>
            </g>
          )}
        </g>
      );
    case 'maison':
      return (
        <g>
          {n >= 2 && (
            <g>
              <rect x={8} y={-42} width={6} height={13} fill={p('#a04a36')} />
              <rect x={7.2} y={-43.5} width={7.6} height={2.2} fill={p('#7d3626')} />
              {actif && (
                <g transform="translate(11 -46)">
                  <Fumee />
                </g>
              )}
            </g>
          )}
          <Boite e={0.6} h={22} gauche="#efe3cf" droite="#d6c7ae" dessus="#f5ecdc" />
          <Toit e={0.66} h={22} r={18} clair="#4d6fa8" sombre="#3b5888" />
          {n >= 3 && (
            <g transform="translate(0 -40)">
              <line x1={0} y1={0} x2={0} y2={-9} stroke={p('#3a3530')} strokeWidth={1.1} />
              <polygon points="-4.5,-8 4,-8 2.5,-9.6 4,-11 -4.5,-9.4" fill={p('#3a3530')} className="girouette" />
              <circle cy={-9} r={1.2} fill={p('#f2c14e')} />
            </g>
          )}
          <g transform="skewY(26)">
            <Fenetre x={-15} y={-4} />
            <rect x={-7} y={-6} width={6} height={12} fill={p('#6b4a2b')} />
          </g>
          <g transform="skewY(-26)">
            <Fenetre x={6} y={-6} />
            <Fenetre x={13} y={-6} />
            {n >= 2 &&
              [6, 13].map((x) => (
                <g key={x}>
                  <rect x={x - 0.6} y={-0.6} width={5.2} height={2.2} fill={p('#8a5e33')} />
                  <circle cx={x + 0.9} cy={-1.1} r={1.1} fill={p('#e0473f')} />
                  <circle cx={x + 3.1} cy={-1.2} r={1.1} fill={p('#ff8fb0')} />
                </g>
              ))}
          </g>
          {n >= 2 && <Buisson x={22} y={6} r={3.4} fleurs="#ff8fb0" />}
          {n === 2 && <Buisson x={-23} y={6} r={3.1} />}
          {n >= 3 && (
            <g transform="translate(-17 4)">
              <Boite e={0.27} h={12} gauche="#e6d6bb" droite="#cdbb9c" dessus="#efe3cf" />
              <Toit e={0.31} h={12} r={9} clair="#c0533a" sombre="#9e3f2a" />
              <g transform="skewY(26)">
                <Fenetre x={-5} y={-1} l={3.4} h={4} />
              </g>
            </g>
          )}
        </g>
      );
    case 'puits':
      return (
        <g>
          {n >= 3 &&
            [[-15, 4], [14, 5], [0, 11]].map(([x, y], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>
                <path d="M -2.6 0 L -2 -4 L 2 -4 L 2.6 0 Z" fill={p('#b5653d')} />
                <circle cx={-1} cy={-5} r={1.3} fill={p(['#ff6b8a', '#ffd34d', '#b07cff'][i])} />
                <circle cx={1.2} cy={-5.4} r={1.2} fill={p(['#ffd34d', '#ff6b8a', '#ffffff'][i])} />
              </g>
            ))}
          <ellipse cx={0} cy={2} rx={13} ry={7} fill={p('#7d7d84')} />
          <rect x={-13} y={-6} width={26} height={8} fill={p('#8e8e96')} />
          <ellipse cx={0} cy={-6} rx={13} ry={7} fill={p('#a3a3ab')} />
          <ellipse cx={0} cy={-6} rx={9} ry={4.5} fill={p('#2b4f7a')} />
          <line x1={-11} y1={-6} x2={-11} y2={-24} stroke={p('#6b4a2b')} strokeWidth={2} />
          <line x1={11} y1={-6} x2={11} y2={-24} stroke={p('#6b4a2b')} strokeWidth={2} />
          {n >= 2 && (
            <g>
              <line x1={-11} y1={-20} x2={11} y2={-20} stroke={p('#5a3d22')} strokeWidth={1.6} />
              <line x1={0} y1={-20} x2={0} y2={-12} stroke={p('#d9c7a0')} strokeWidth={0.8} />
              <path d="M -2.6 -12 L 2.6 -12 L 2 -8 L -2 -8 Z" fill={p('#8a5e33')} />
              <path d="M 11 -20 l 4 0 l 0 3" stroke={p('#5a3d22')} strokeWidth={1.4} fill="none" />
            </g>
          )}
          {n >= 3 ? (
            <g>
              <polygon points="-16,-22 0,-33 16,-22" fill={p('#4d6fa8')} />
              <polyline points="-11,-25.4 0,-31.5 11,-25.4" stroke={p('#3b5888')} strokeWidth={1} fill="none" />
              <polyline points="-6,-28.6 0,-32.4 6,-28.6" stroke={p('#3b5888')} strokeWidth={1} fill="none" />
            </g>
          ) : (
            <polygon points="-16,-22 0,-32 16,-22" fill={p('#9e3f2a')} />
          )}
        </g>
      );
    case 'potager':
      return (
        <g>
          <polygon points={pts([[-26, 0], [0, 13], [26, 0], [0, -13]])} fill={p('#7a5530')} />
          {[-8, 0, 8].map((o) => (
            <g key={o}>
              {[-12, -4, 4, 12].map((k) => (
                <circle key={k} cx={k + o * 0.9} cy={k * 0.5 - o * 0.5 - 2} r={2.6} fill={p('#5bbf4f')} />
              ))}
            </g>
          ))}
          {n >= 3 && (
            <g>
              {[[-14, 6], [-4, 9.5], [9, 6]].map(([x, y], i) => (
                <g key={i} transform={`translate(${x} ${y})`}>
                  <ellipse rx={3.6} ry={2.8} fill={p('#e8822e')} />
                  <path d="M -1.2 -2.6 v 5.2 M 1.2 -2.6 v 5.2" stroke={p('#c9661c')} strokeWidth={0.7} />
                  <rect x={-0.5} y={-4.2} width={1} height={1.8} fill={p('#4a7a2a')} />
                </g>
              ))}
              {[[-26, 0], [-13, 6.5], [0, 13], [13, 6.5], [26, 0]].map(([x, y], i) => (
                <rect key={i} x={x - 0.8} y={y - 6} width={1.6} height={6} fill={p('#d9c7a0')} />
              ))}
              <polyline points="-26,-3 -13,3.5 0,10 13,3.5 26,-3" stroke={p('#d9c7a0')} strokeWidth={1} fill="none" />
            </g>
          )}
          {n >= 2 && (
            <g transform="translate(2 -8)">
              <line x1={0} y1={0} x2={0} y2={-22} stroke={p('#6b4a2b')} strokeWidth={1.6} />
              <line x1={-8} y1={-15} x2={8} y2={-15} stroke={p('#6b4a2b')} strokeWidth={1.4} />
              <path d="M -5 -16 L 5 -16 L 4 -6 L -4 -6 Z" fill={p('#c4453a')} />
              <circle cy={-19.5} r={3.4} fill={p('#e8c66a')} />
              <ellipse cy={-21.5} rx={6.5} ry={1.8} fill={p('#d9b04a')} />
              <path d="M -2.5 -24.5 Q 0 -27 2.5 -24.5 Z" fill={p('#d9b04a')} />
            </g>
          )}
        </g>
      );
    case 'etang':
      return (
        <g>
          {n >= 3 && (
            <g>
              {[-20, -16, -12].map((x, i) => (
                <g key={x}>
                  <line x1={x} y1={-3} x2={x + 1} y2={-15 - i * 2} stroke={p('#4a7a3a')} strokeWidth={1.1} />
                  <rect x={x + 0.2} y={-16 - i * 2} width={1.8} height={4} rx={0.9} fill={p('#7a4a2a')} />
                </g>
              ))}
            </g>
          )}
          <ellipse cx={0} cy={0} rx={26} ry={12} fill={p('#3d7fc1')} />
          <ellipse cx={-3} cy={-1} rx={18} ry={7} fill={p('#5aa1e0')} className="eau" />
          <ellipse cx={10} cy={3} rx={4} ry={2} fill={p('#3f8f4a')} />
          {n >= 2 && (
            <g>
              <ellipse cx={-12} cy={3} rx={3.4} ry={1.6} fill={p('#4fae55')} />
              <ellipse cx={-6} cy={-4} rx={3} ry={1.4} fill={p('#4fae55')} />
              <circle cx={-12} cy={2.4} r={1.2} fill={p('#ff9ec0')} />
              <g className="canard">
                <ellipse cx={4} cy={-2} rx={3.8} ry={2.2} fill={p('#fbfbf5')} />
                <circle cx={6.6} cy={-4.4} r={1.8} fill={p('#fbfbf5')} />
                <polygon points="8.2,-4.6 10.2,-4.2 8.2,-3.6" fill={p('#f0a030')} />
              </g>
            </g>
          )}
          {n >= 3 && (
            <g>
              <polygon points={pts([[12, 8], [24, 2], [27, 3.5], [15, 9.5]])} fill={p('#b07d48')} />
              <polygon points={pts([[15, 9.5], [27, 3.5], [27, 5], [15, 11]])} fill={p('#8a5e33')} />
              {[16, 21, 26].map((x) => (
                <line key={x} x1={x} y1={10.5 - (x - 16) * 0.5} x2={x} y2={14 - (x - 16) * 0.5} stroke={p('#6b4a2b')} strokeWidth={1.2} />
              ))}
            </g>
          )}
        </g>
      );
    case 'moulin':
      return (
        <g>
          {n >= 2 && <Boite e={0.5} h={7} gauche="#9b9ba3" droite="#83838b" dessus="#b5b5bd" />}
          <Boite e={0.42} h={34} gauche="#e6d6b8" droite="#cbb894" dessus="#f0e4cc" dy={n >= 2 ? -1 : 0} />
          <Toit e={0.46} h={34} r={14} clair="#a0703f" sombre="#8a5e33" />
          <rect x={-8} y={-2} width={5} height={9} fill={p('#6b4a2b')} transform="skewY(26)" />
          {n >= 2 && (
            <g>
              <ellipse cx={17} cy={6} rx={4} ry={3} fill={p('#efe6cf')} />
              <ellipse cx={21} cy={3.6} rx={3.4} ry={2.6} fill={p('#e2d6b8')} />
              <path d="M 15.6 3.6 q 1.4 -1 2.8 0" stroke={p('#b5a27a')} strokeWidth={0.8} fill="none" />
            </g>
          )}
          {n >= 3 && (
            <g transform="translate(0 -48)">
              <Fanion couleur="#3d6fd1" mat={11} />
            </g>
          )}
          <g transform={`translate(6 -36) scale(${n >= 3 ? 1.16 : 1})`}>
            {/* L'origine de ce groupe est le moyeu : c'est autour d'elle que les ailes tournent. */}
            <g className={actif ? 'ailes tournent' : 'ailes'}>
              {[0, 90, 180, 270].map((a) => (
                <g key={a} transform={`rotate(${a})`}>
                  <line x1={0} y1={0} x2={0} y2={-26} stroke={p('#6b4a2b')} strokeWidth={1.6} strokeLinecap="round" />
                  <path d="M 1 -6 L 7.5 -7 L 7.5 -26 L 1 -25 Z" fill={p(n >= 3 ? '#fbf3e0' : '#f7f1e3')} stroke={p('#8a5e33')} strokeWidth={0.7} />
                  <path d="M 1 -12.5 L 7.5 -13.2 M 1 -19 L 7.5 -19.6 M 4.2 -6.5 L 4.2 -25.5" stroke={p('#cbb894')} strokeWidth={0.6} />
                </g>
              ))}
            </g>
            <circle r={3} fill={p('#5a3d22')} />
          </g>
        </g>
      );
    case 'forge':
      return (
        <g>
          <Boite e={0.55} h={18} gauche="#7d7d84" droite="#64646b" dessus="#8e8e96" />
          <Toit e={0.6} h={18} r={10} clair="#4a4a50" sombre="#38383d" />
          <rect x={8} y={-40} width={6} height={18} fill={p('#64646b')} />
          {n >= 3 && <rect x={-6} y={-38} width={5} height={14} fill={p('#5a5a61')} />}
          {actif && (
            <g transform="translate(11 -42)">
              <Fumee />
            </g>
          )}
          {actif && n >= 3 && (
            <g transform="translate(-3.5 -40)">
              <Fumee />
            </g>
          )}
          <g transform="skewY(26)">
            {actif && <rect x={-14} y={-8} width={12} height={12} rx={2} fill="#ff8a3d" opacity={n >= 3 ? 0.45 : 0.25} />}
            <rect x={-12} y={-6} width={8} height={8} fill={actif ? '#ff8a3d' : p('#3a2a20')} />
          </g>
          {n >= 2 && (
            <g>
              <g transform="translate(-21 6)">
                <rect x={-2} y={-5} width={4} height={5} fill={p('#4a3a2a')} />
                <path d="M -6 -5 L 5 -5 Q 7 -6.5 8 -8 L -4 -8 Z" fill={p('#3a3a40')} />
              </g>
              <g transform="translate(19 5)">
                <ellipse cy={0} rx={3.6} ry={1.6} fill={p('#6b4a2b')} />
                <rect x={-3.6} y={-7} width={7.2} height={7} fill={p('#8a5e33')} />
                <ellipse cy={-7} rx={3.6} ry={1.6} fill={p('#a0703f')} />
                <line x1={-3.6} y1={-3.5} x2={3.6} y2={-3.5} stroke={p('#4a4a50')} strokeWidth={0.8} />
              </g>
            </g>
          )}
        </g>
      );
    case 'bibliotheque':
      return (
        <g>
          <Boite e={0.7} h={26} gauche="#c9b48f" droite="#b09a74" dessus="#d8c6a3" />
          <Toit e={0.74} h={26} r={12} clair="#2f6b5a" sombre="#245446" />
          {n >= 3 && (
            <g transform="translate(0 -37)">
              <rect x={-5} y={-5} width={10} height={6} fill={p('#d8c6a3')} />
              <path d="M -6 -5 A 6 6 0 0 1 6 -5 Z" fill={p('#e6b84a')} />
              <line x1={0} y1={-11} x2={0} y2={-15} stroke={p('#c99a2e')} strokeWidth={1.2} />
              <circle cy={-15.5} r={1.5} fill={p('#f2c14e')} />
            </g>
          )}
          <g transform="skewY(26)">
            {[-20, -13, -6].map((x) => (
              <Fenetre key={x} x={x} y={-10} h={10} rx={2} />
            ))}
            {n >= 2 &&
              [-23.5, -2.5].map((x) => (
                <path key={x} d={`M ${x} -19 h 3 v 9 l -1.5 -1.6 l -1.5 1.6 z`} fill={p('#3d6fd1')} />
              ))}
          </g>
          <g transform="skewY(-26)">
            {[4, 11, 18].map((x) => (
              <Fenetre key={x} x={x} y={-10} h={10} rx={2} />
            ))}
          </g>
          {n >= 2 && (
            <g transform="translate(-6 16)">
              <rect x={-7} y={-3.4} width={14} height={1.8} fill={p('#8a5e33')} />
              <rect x={-6} y={-1.6} width={1.2} height={2.6} fill={p('#6b4a2b')} />
              <rect x={4.8} y={-1.6} width={1.2} height={2.6} fill={p('#6b4a2b')} />
            </g>
          )}
        </g>
      );
    case 'tour':
      return (
        <g>
          <Boite e={0.34} h={56} gauche="#a3a3ab" droite="#8e8e96" dessus="#b5b5bd" />
          {[-8, 0, 8].map((x) => (
            <rect key={x} x={x - 2.5} y={-64 + Math.abs(x) * 0.5} width={5} height={6} fill={p('#b5b5bd')} />
          ))}
          {n >= 3 ? (
            <g>
              <polygon points="-12,-60 0,-86 0,-56" fill={p('#e6b84a')} />
              <polygon points="0,-86 12,-60 0,-56" fill={p('#c99a2e')} />
              <g transform="translate(0 -86)">
                <Fanion couleur="#d94a4a" mat={13} />
              </g>
            </g>
          ) : (
            <>
              <line x1={0} y1={-62} x2={0} y2={-80} stroke={p('#5a3d22')} strokeWidth={1.5} />
              <polygon points="0,-80 13,-76 0,-72" fill={p('#d94a4a')} className="drapeau" />
            </>
          )}
          {n >= 2 &&
            [-7, 7].map((x) => (
              <g key={x} transform={`translate(${x} ${-30 + (x > 0 ? -3.5 : -3.5)})`}>
                <rect x={-0.8} y={0} width={1.6} height={6} fill={p('#4a3a2a')} />
                <path d="M 0 -5 Q 2.6 -1.5 0 0 Q -2.6 -1.5 0 -5 Z" fill={l.allume > 0.3 ? '#ffb547' : p('#8a6a3a')} className={l.allume > 0.3 ? 'flamme vive' : undefined} />
                {l.allume > 0.3 && <circle cy={-2} r={7} fill="url(#halo)" opacity={l.allume} />}
              </g>
            ))}
        </g>
      );
    case 'observatoire':
      return (
        <g>
          <Boite e={0.55} h={24} gauche="#5a5f7a" droite="#474b63" dessus="#6b7090" />
          <path d="M -20 -26 A 20 16 0 0 1 20 -26 Z" fill={p(n >= 3 ? '#e6c46a' : '#c9cde0')} />
          {n >= 3 && (
            <g fill={p('#fff6cf')}>
              <circle cx={-9} cy={-33} r={1.1} />
              <circle cx={-2} cy={-38} r={1} />
              <circle cx={8} cy={-34} r={1.2} />
            </g>
          )}
          <rect x={2} y={-44} width={n >= 2 ? 20 : 14} height={n >= 2 ? 6 : 5} fill={p('#3a3f5a')} transform="rotate(-30 2 -42)" />
          {l.allume > 0.8 && <circle cx={-26} cy={-58} r={1.6} fill="#fff" className="scintille" />}
          <g transform="skewY(26)">
            <Fenetre x={-12} y={-10} l={4} h={6} />
          </g>
        </g>
      );
    case 'chateau': {
      const or = n >= 3;
      return (
        <g transform="translate(0 4)">
          <Boite e={0.8} h={30} gauche="#b5b5bd" droite="#9b9ba3" dessus="#c6c6ce" />
          <g transform="translate(-20 -6)">
            <Boite e={0.22} h={46} gauche="#a3a3ab" droite="#8e8e96" dessus="#b5b5bd" />
            <Toit e={0.24} h={46} r={16} clair={or ? '#e6b84a' : '#4d6fa8'} sombre={or ? '#c99a2e' : '#3b5888'} epi={or} />
            {n >= 2 && <path d="M -5 -36 h 4 v 10 l -2 -2 l -2 2 z" fill={p('#c0333a')} transform="skewY(26)" />}
          </g>
          <g transform="translate(20 -6)">
            <Boite e={0.22} h={46} gauche="#a3a3ab" droite="#8e8e96" dessus="#b5b5bd" />
            <Toit e={0.24} h={46} r={16} clair={or ? '#e6b84a' : '#4d6fa8'} sombre={or ? '#c99a2e' : '#3b5888'} epi={or} />
            {n >= 2 && <path d="M 1 -36 h 4 v 10 l -2 -2 l -2 2 z" fill={p('#c0333a')} transform="skewY(-26)" />}
          </g>
          <g transform="translate(0 6)">
            <Boite e={0.26} h={58} gauche="#a3a3ab" droite="#8e8e96" dessus="#b5b5bd" />
            <Toit e={0.28} h={58} r={20} clair={or ? '#f2c14e' : '#c0533a'} sombre={or ? '#d4a33a' : '#9e3f2a'} />
            {or && (
              <g transform="translate(0 -78)">
                <Fanion couleur="#c0333a" mat={12} />
              </g>
            )}
            <g transform="skewY(26)">
              <Fenetre x={-5} y={-40} l={3} h={5} />
            </g>
          </g>
          <g transform="skewY(26)">
            <path d="M -6 18 v -10 a 4 4 0 0 1 8 0 v 10 z" fill={p('#5a3a1c')} />
          </g>
        </g>
      );
    }
    case 'lanterne':
      return (
        <g>
          {n >= 2 && <path d="M 0 -26 q 9 -1 10 6" stroke={p('#3a3530')} strokeWidth={1.4} fill="none" />}
          {n >= 3 && <path d="M 0 -26 q -9 -1 -10 6" stroke={p('#3a3530')} strokeWidth={1.4} fill="none" />}
          <rect x={-1.5} y={-30} width={3} height={30} fill={p('#3a3530')} />
          {n >= 3 && <ellipse cx={0} cy={0} rx={5} ry={2.2} fill={p('#2a2622')} />}
          <g transform="translate(0 -29)">
            <Lanterne />
          </g>
          {n >= 2 && (
            <g transform="translate(10 -12) scale(0.7)">
              <Lanterne />
            </g>
          )}
          {n >= 3 && (
            <g transform="translate(-10 -12) scale(0.7)">
              <Lanterne />
            </g>
          )}
        </g>
      );
    case 'ruche': {
      const ruche = (dx: number, dy: number, k: number, cle: string) => (
        <g key={cle} transform={`translate(${dx} ${dy}) scale(${k})`}>
          <rect x={-2} y={-8} width={4} height={8} fill={p('#6b4a2b')} />
          {[0, 1, 2, 3].map((i) => (
            <ellipse key={i} cx={0} cy={-11 - i * 5} rx={11 - i * 1.8} ry={3.6} fill={p(i % 2 ? '#e8b64a' : '#d9a23a')} />
          ))}
          <ellipse cx={0} cy={-11} rx={2.2} ry={1.6} fill={p('#5a3d22')} />
        </g>
      );
      return (
        <g>
          {n >= 3 && ruche(-15, -2, 0.7, 'c')}
          {n >= 2 && ruche(14, -3, 0.75, 'b')}
          {ruche(0, 0, 1, 'a')}
          {n >= 3 &&
            [[-6, 9], [-1.5, 10.5]].map(([x, y], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>
                <rect x={-2} y={-4} width={4} height={4} rx={1} fill={p('#e89a2a')} opacity={0.9} />
                <rect x={-2.2} y={-5} width={4.4} height={1.4} fill={p('#c0533a')} />
              </g>
            ))}
          {actif && (
            <g className="abeilles">
              <circle cx={12} cy={-24} r={1.4} fill={p('#2a2010')} />
              <circle cx={-10} cy={-30} r={1.4} fill={p('#2a2010')} />
              <circle cx={6} cy={-36} r={1.4} fill={p('#2a2010')} />
              {n >= 2 && <circle cx={18} cy={-18} r={1.3} fill={p('#2a2010')} />}
            </g>
          )}
        </g>
      );
    }
    case 'marche':
      return (
        <g>
          {n >= 3 && (
            <g>
              <path d="M -23 -29 Q 0 -20 25 -27" stroke={p('#6b4a2b')} strokeWidth={0.8} fill="none" />
              {[-18, -11, -4, 3, 10, 17].map((x, i) => {
                const y = -27.5 + 5.6 * (1 - ((x + 1) / 22) ** 2);
                return <polygon key={x} points={`${x - 2.4},${y} ${x + 2.4},${y} ${x},${y + 4.2}`} fill={p(['#d94a4a', '#ffd34d', '#3d8fd1', '#6fd39a', '#ff8a3d', '#b07cff'][i])} />;
              })}
            </g>
          )}
          {[-14, 14].map((ox) => (
            <g key={ox} transform={`translate(${ox} ${ox > 0 ? 2 : -2})`}>
              <Boite e={0.3} h={8} gauche="#a0703f" droite="#8a5e33" dessus="#b07d48" />
              <line x1={-9} y1={-8} x2={-9} y2={-24} stroke={p('#6b4a2b')} strokeWidth={1.5} />
              <line x1={9} y1={-8} x2={9} y2={-24} stroke={p('#6b4a2b')} strokeWidth={1.5} />
              <path d="M -13 -22 L 13 -22 L 10 -30 L -10 -30 Z" fill={p(ox < 0 ? '#d94a4a' : '#3d8fd1')} />
              <path d="M -13 -22 q 3.25 4 6.5 0 q 3.25 4 6.5 0 q 3.25 4 6.5 0 q 3.25 4 6.5 0" fill={p('#f7f1e3')} />
              <circle cx={-3} cy={-10} r={2.5} fill={p(ox < 0 ? '#ff8a3d' : '#7cc46b')} />
              <circle cx={3} cy={-10} r={2.5} fill={p(ox < 0 ? '#ffd34d' : '#d94a4a')} />
            </g>
          ))}
          {n >= 2 &&
            [[-2, 12, '#e0473f'], [6, 9, '#7cc46b']].map(([x, y, c], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>
                <rect x={-4} y={-4.5} width={8} height={4.5} fill={p('#b07d48')} />
                <line x1={-4} y1={-2.2} x2={4} y2={-2.2} stroke={p('#8a5e33')} strokeWidth={0.6} />
                <circle cx={-2} cy={-5} r={1.6} fill={p(c as string)} />
                <circle cx={1.2} cy={-5.4} r={1.6} fill={p(c as string)} />
                <circle cx={-0.4} cy={-6.6} r={1.5} fill={p(c as string)} />
              </g>
            ))}
        </g>
      );
    default:
      return <circle r={6} fill={p('#999')} />;
  }
}

/** Le feu de camp central. Le personnage et son compagnon se posent à côté. */
export function Feu({ actif, children }: { actif: boolean; children?: ReactNode }) {
  const l = useContext(LumiereContexte);
  return (
    <g>
      <ellipse cx={0} cy={3} rx={14} ry={6} fill={l.peindre('#6d6a66')} />
      <rect x={-10} y={-1} width={20} height={4} rx={2} fill={l.peindre('#6b4a2b')} transform="rotate(20)" />
      <rect x={-10} y={-1} width={20} height={4} rx={2} fill={l.peindre('#5a3d22')} transform="rotate(-20)" />
      {/* La flamme éclaire au lieu d'être éclairée : jamais teintée par la nuit. */}
      <g className={actif ? 'flamme vive' : 'flamme'}>
        <path d="M0,-22 C8,-12 8,-4 0,0 C-8,-4 -8,-12 0,-22 Z" fill="#ff8a3d" />
        <path d="M0,-14 C4,-8 4,-3 0,-1 C-4,-3 -4,-8 0,-14 Z" fill="#ffd34d" />
      </g>
      {children}
    </g>
  );
}

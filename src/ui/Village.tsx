import type { ReactNode } from 'react';
import type { Construction } from '../core/types.ts';
import { FEU, tailleTerrain } from '../core/village.ts';

// Rendu isométrique : une case fait 64 × 32 px à l'écran.
const DX = 32;
const DY = 16;

const ecran = (x: number, y: number) => ({ sx: (x - y) * DX, sy: (x + y) * DY });

type Pt = [number, number];
const pts = (p: Pt[]) => p.map(([a, b]) => `${a},${b}`).join(' ');

/** Boîte isométrique posée sur la case, d'emprise `e` (0–1) et de hauteur `h`. */
function Boite({ e, h, gauche, droite, dessus, dy = 0 }: { e: number; h: number; gauche: string; droite: string; dessus: string; dy?: number }) {
  const g: Pt = [-DX * e, dy];
  const b: Pt = [0, DY * e + dy];
  const d: Pt = [DX * e, dy];
  const t: Pt = [0, -DY * e + dy];
  const haut = (p: Pt): Pt => [p[0], p[1] - h];
  return (
    <g>
      <polygon points={pts([g, b, haut(b), haut(g)])} fill={gauche} />
      <polygon points={pts([b, d, haut(d), haut(b)])} fill={droite} />
      <polygon points={pts([haut(t), haut(d), haut(b), haut(g)])} fill={dessus} />
    </g>
  );
}

/** Toit en pyramide au-dessus d'une boîte. */
function Toit({ e, h, r, clair, sombre }: { e: number; h: number; r: number; clair: string; sombre: string }) {
  const g: Pt = [-DX * e, -h];
  const b: Pt = [0, DY * e - h];
  const d: Pt = [DX * e, -h];
  const t: Pt = [0, -DY * e - h];
  const sommet: Pt = [0, -h - r];
  return (
    <g>
      <polygon points={pts([t, d, sommet])} fill={sombre} />
      <polygon points={pts([g, t, sommet])} fill={clair} />
      <polygon points={pts([g, b, sommet])} fill={clair} />
      <polygon points={pts([b, d, sommet])} fill={sombre} />
    </g>
  );
}

const Fenetre = ({ x, y, nuit }: { x: number; y: number; nuit: boolean }) => (
  <rect x={x} y={y} width={4} height={5} rx={1} fill={nuit ? '#ffd76a' : '#5a7fa8'} />
);

function Arbre({ dy = 0 }: { dy?: number }) {
  return (
    <g transform={`translate(0 ${dy})`}>
      <Boite e={0.08} h={12} gauche="#6b4a2b" droite="#5a3d22" dessus="#7a5634" />
      <circle cx={0} cy={-22} r={13} fill="#3f8f4a" />
      <circle cx={-6} cy={-17} r={9} fill="#367d41" />
      <circle cx={6} cy={-27} r={8} fill="#4fa95b" />
    </g>
  );
}

function Fumee() {
  return (
    <g className="fumee">
      <circle r={3} fill="#d9d9d9" opacity={0.7} />
      <circle r={4} cx={3} cy={-7} fill="#e6e6e6" opacity={0.5} />
      <circle r={5} cx={-1} cy={-15} fill="#f0f0f0" opacity={0.35} />
    </g>
  );
}

/** Dessin d'un bâtiment, origine au centre de sa case. */
function Dessin({ id, actif, nuit }: { id: string; actif: boolean; nuit: boolean }): ReactNode {
  switch (id) {
    case 'fleurs':
      return (
        <g>
          {[[-12, 0, '#ff6b8a'], [-4, 5, '#ffd34d'], [6, -2, '#b07cff'], [12, 4, '#ff6b8a'], [0, -5, '#ffffff'], [-6, -3, '#ffd34d'], [4, 8, '#b07cff']].map(([x, y, c], i) => (
            <g key={i}>
              <line x1={x as number} y1={(y as number) + 4} x2={x as number} y2={y as number} stroke="#2f7d3b" strokeWidth={1.2} />
              <circle cx={x as number} cy={y as number} r={2.6} fill={c as string} />
            </g>
          ))}
        </g>
      );
    case 'arbre':
      return <Arbre />;
    case 'cabane':
      return (
        <g>
          <Boite e={0.45} h={14} gauche="#a0703f" droite="#8a5e33" dessus="#b07d48" />
          <Toit e={0.5} h={14} r={14} clair="#c0533a" sombre="#9e3f2a" />
          <rect x={-9} y={-1} width={6} height={10} fill="#5a3a1c" transform="skewY(26)" />
        </g>
      );
    case 'maison':
      return (
        <g>
          <Boite e={0.6} h={22} gauche="#efe3cf" droite="#d6c7ae" dessus="#f5ecdc" />
          <Toit e={0.66} h={22} r={18} clair="#4d6fa8" sombre="#3b5888" />
          <g transform="skewY(26)">
            <Fenetre x={-15} y={-4} nuit={nuit} />
            <rect x={-7} y={-6} width={6} height={12} fill="#6b4a2b" />
          </g>
          <g transform="skewY(-26)">
            <Fenetre x={6} y={-6} nuit={nuit} />
            <Fenetre x={13} y={-6} nuit={nuit} />
          </g>
        </g>
      );
    case 'puits':
      return (
        <g>
          <ellipse cx={0} cy={2} rx={13} ry={7} fill="#7d7d84" />
          <rect x={-13} y={-6} width={26} height={8} fill="#8e8e96" />
          <ellipse cx={0} cy={-6} rx={13} ry={7} fill="#a3a3ab" />
          <ellipse cx={0} cy={-6} rx={9} ry={4.5} fill="#2b4f7a" />
          <line x1={-11} y1={-6} x2={-11} y2={-24} stroke="#6b4a2b" strokeWidth={2} />
          <line x1={11} y1={-6} x2={11} y2={-24} stroke="#6b4a2b" strokeWidth={2} />
          <polygon points="-16,-22 0,-32 16,-22" fill="#9e3f2a" />
        </g>
      );
    case 'potager':
      return (
        <g>
          <polygon points={pts([[-26, 0], [0, 13], [26, 0], [0, -13]])} fill="#7a5530" />
          {[-8, 0, 8].map((o) => (
            <g key={o}>
              {[-12, -4, 4, 12].map((k) => (
                <circle key={k} cx={k + o * 0.9} cy={k * 0.5 - o * 0.5 - 2} r={2.6} fill="#5bbf4f" />
              ))}
            </g>
          ))}
        </g>
      );
    case 'etang':
      return (
        <g>
          <ellipse cx={0} cy={0} rx={26} ry={12} fill="#3d7fc1" />
          <ellipse cx={-3} cy={-1} rx={18} ry={7} fill="#5aa1e0" className="eau" />
          <ellipse cx={10} cy={3} rx={4} ry={2} fill="#3f8f4a" />
        </g>
      );
    case 'moulin':
      return (
        <g>
          <Boite e={0.42} h={34} gauche="#e6d6b8" droite="#cbb894" dessus="#f0e4cc" />
          <Toit e={0.46} h={34} r={14} clair="#a0703f" sombre="#8a5e33" />
          <g transform="translate(6 -36)">
            <g className={actif ? 'ailes tournent' : 'ailes'}>
              {[0, 90, 180, 270].map((a) => (
                <rect key={a} x={-2} y={-24} width={5} height={22} fill="#f7f1e3" stroke="#8a5e33" strokeWidth={0.8} transform={`rotate(${a})`} />
              ))}
            </g>
            <circle r={3} fill="#5a3d22" />
          </g>
        </g>
      );
    case 'forge':
      return (
        <g>
          <Boite e={0.55} h={18} gauche="#7d7d84" droite="#64646b" dessus="#8e8e96" />
          <Toit e={0.6} h={18} r={10} clair="#4a4a50" sombre="#38383d" />
          <rect x={8} y={-40} width={6} height={18} fill="#64646b" />
          {actif && (
            <g transform="translate(11 -42)">
              <Fumee />
            </g>
          )}
          <g transform="skewY(26)">
            <rect x={-12} y={-6} width={8} height={8} fill={actif ? '#ff8a3d' : '#3a2a20'} />
          </g>
        </g>
      );
    case 'bibliotheque':
      return (
        <g>
          <Boite e={0.7} h={26} gauche="#c9b48f" droite="#b09a74" dessus="#d8c6a3" />
          <Toit e={0.74} h={26} r={12} clair="#2f6b5a" sombre="#245446" />
          <g transform="skewY(26)">
            {[-20, -13, -6].map((x) => (
              <rect key={x} x={x} y={-10} width={4} height={10} rx={2} fill={nuit ? '#ffd76a' : '#4a6a8a'} />
            ))}
          </g>
          <g transform="skewY(-26)">
            {[4, 11, 18].map((x) => (
              <rect key={x} x={x} y={-10} width={4} height={10} rx={2} fill={nuit ? '#ffd76a' : '#4a6a8a'} />
            ))}
          </g>
        </g>
      );
    case 'tour':
      return (
        <g>
          <Boite e={0.34} h={56} gauche="#a3a3ab" droite="#8e8e96" dessus="#b5b5bd" />
          {[-8, 0, 8].map((x) => (
            <rect key={x} x={x - 2.5} y={-64 + Math.abs(x) * 0.5} width={5} height={6} fill="#b5b5bd" />
          ))}
          <line x1={0} y1={-62} x2={0} y2={-80} stroke="#5a3d22" strokeWidth={1.5} />
          <polygon points="0,-80 13,-76 0,-72" fill="#d94a4a" className="drapeau" />
        </g>
      );
    case 'observatoire':
      return (
        <g>
          <Boite e={0.55} h={24} gauche="#5a5f7a" droite="#474b63" dessus="#6b7090" />
          <path d="M -20 -26 A 20 16 0 0 1 20 -26 Z" fill="#c9cde0" />
          <rect x={2} y={-44} width={14} height={5} fill="#3a3f5a" transform="rotate(-30 2 -42)" />
          {nuit && <circle cx={-26} cy={-58} r={1.6} fill="#fff" className="scintille" />}
        </g>
      );
    case 'chateau':
      return (
        <g transform="translate(0 4)">
          <Boite e={0.8} h={30} gauche="#b5b5bd" droite="#9b9ba3" dessus="#c6c6ce" />
          <g transform="translate(-20 -6)">
            <Boite e={0.22} h={46} gauche="#a3a3ab" droite="#8e8e96" dessus="#b5b5bd" />
            <Toit e={0.24} h={46} r={16} clair="#4d6fa8" sombre="#3b5888" />
          </g>
          <g transform="translate(20 -6)">
            <Boite e={0.22} h={46} gauche="#a3a3ab" droite="#8e8e96" dessus="#b5b5bd" />
            <Toit e={0.24} h={46} r={16} clair="#4d6fa8" sombre="#3b5888" />
          </g>
          <g transform="translate(0 6)">
            <Boite e={0.26} h={58} gauche="#a3a3ab" droite="#8e8e96" dessus="#b5b5bd" />
            <Toit e={0.28} h={58} r={20} clair="#c0533a" sombre="#9e3f2a" />
          </g>
          <g transform="skewY(26)">
            <path d="M -6 18 v -10 a 4 4 0 0 1 8 0 v 10 z" fill="#5a3a1c" />
          </g>
        </g>
      );
    default:
      return <circle r={6} fill="#999" />;
  }
}

/** Le feu de camp central, et le personnage qui travaille à côté. */
function Feu({ actif }: { actif: boolean }) {
  return (
    <g>
      <ellipse cx={0} cy={3} rx={14} ry={6} fill="#6d6a66" />
      <rect x={-10} y={-1} width={20} height={4} rx={2} fill="#6b4a2b" transform="rotate(20)" />
      <rect x={-10} y={-1} width={20} height={4} rx={2} fill="#5a3d22" transform="rotate(-20)" />
      <g className={actif ? 'flamme vive' : 'flamme'}>
        <path d="M0,-22 C8,-12 8,-4 0,0 C-8,-4 -8,-12 0,-22 Z" fill="#ff8a3d" />
        <path d="M0,-14 C4,-8 4,-3 0,-1 C-4,-3 -4,-8 0,-14 Z" fill="#ffd34d" />
      </g>
      {/* Le villageois : il lit au coin du feu tant qu'une session tourne. */}
      <g transform="translate(22 -2)">
        <ellipse cx={0} cy={6} rx={6} ry={2.5} fill="rgba(0,0,0,.2)" />
        <rect x={-4} y={-8} width={8} height={13} rx={3} fill="#3d6fd1" />
        <circle cx={0} cy={-12} r={4.5} fill="#f2c9a0" />
        <path d="M-4.5,-13 a4.5,4.5 0 0 1 9,0 z" fill="#5a3d22" />
        {actif ? (
          <g className="livre">
            <rect x={-8} y={-5} width={7} height={5} fill="#fff" stroke="#c0533a" strokeWidth={1} />
            <rect x={-1} y={-5} width={7} height={5} fill="#fff" stroke="#c0533a" strokeWidth={1} />
          </g>
        ) : (
          <text x={6} y={-18} fontSize={9} fill="#fff" className="zzz">
            z
          </text>
        )}
      </g>
    </g>
  );
}

export interface PropsVillage {
  niveau: number;
  constructions: Construction[];
  actif: boolean;
  heure: number;
  /** Case surlignée comme posable pour le bâtiment choisi. */
  posable?: (x: number, y: number) => boolean;
  surCase?: (x: number, y: number) => void;
  surConstruction?: (c: Construction) => void;
}

export function Village({ niveau, constructions, actif, heure, posable, surCase, surConstruction }: PropsVillage) {
  const t = tailleTerrain(niveau);
  const nuit = heure >= 20 || heure < 7;
  const soir = !nuit && heure >= 18;

  const cases: { x: number; y: number }[] = [];
  for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) cases.push({ x, y });

  // Ordre de peinture : de l'arrière vers l'avant, sinon un bâtiment du fond
  // recouvre celui de devant.
  const objets = [
    ...constructions.map((c) => ({ x: c.x, y: c.y, c })),
    { x: FEU.x, y: FEU.y, c: null as Construction | null },
  ].sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);

  const largeur = t * DX * 2 + 40;
  const hauteur = t * DY * 2 + 130;
  const ox = largeur / 2;
  const oy = 110;

  const choixEnCours = Boolean(posable);

  return (
    <svg className="village" viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label={`Ton hameau, niveau ${niveau}`}>
      <defs>
        <linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={nuit ? '#0e1430' : soir ? '#f08a5d' : '#7cc4f0'} />
          <stop offset="1" stopColor={nuit ? '#27305a' : soir ? '#f7c784' : '#d4eefb'} />
        </linearGradient>
      </defs>
      <rect width={largeur} height={hauteur} fill="url(#ciel)" rx={18} />
      {nuit &&
        Array.from({ length: 24 }, (_, i) => (
          <circle key={i} cx={(i * 97) % largeur} cy={(i * 53) % 90} r={i % 3 === 0 ? 1.4 : 0.9} fill="#fff" opacity={0.8} className={i % 4 === 0 ? 'scintille' : undefined} />
        ))}
      {!nuit && <circle cx={largeur - 50} cy={44} r={20} fill={soir ? '#ffb15e' : '#ffe27a'} />}
      {nuit && <circle cx={largeur - 50} cy={44} r={14} fill="#f4f1de" />}

      <g transform={`translate(${ox} ${oy})`}>
        {/* Bord du plateau. */}
        <polygon
          points={pts([
            [-t * DX, t * DY - DY],
            [0, 2 * t * DY - DY],
            [0, 2 * t * DY - DY + 14],
            [-t * DX, t * DY - DY + 14],
          ])}
          fill="#7a5530"
        />
        <polygon
          points={pts([
            [0, 2 * t * DY - DY],
            [t * DX, t * DY - DY],
            [t * DX, t * DY - DY + 14],
            [0, 2 * t * DY - DY + 14],
          ])}
          fill="#5f4126"
        />
        {cases.map(({ x, y }) => {
          const { sx, sy } = ecran(x, y);
          const ok = posable?.(x, y) ?? false;
          return (
            <polygon
              key={`${x},${y}`}
              points={pts([
                [sx, sy - DY],
                [sx + DX, sy],
                [sx, sy + DY],
                [sx - DX, sy],
              ])}
              fill={(x + y) % 2 ? (nuit ? '#2f5a3a' : '#79c26b') : nuit ? '#2a5234' : '#6db760'}
              stroke={ok ? '#fff' : 'rgba(0,0,0,.08)'}
              strokeWidth={ok ? 1.5 : 1}
              className={ok ? 'case posable' : 'case'}
              onClick={choixEnCours ? () => surCase?.(x, y) : undefined}
            />
          );
        })}
        {objets.map(({ x, y, c }) => {
          const { sx, sy } = ecran(x, y);
          return (
            <g
              key={c ? c.id : 'feu'}
              transform={`translate(${sx} ${sy})`}
              className={c && surConstruction && !choixEnCours ? 'batiment cliquable' : 'batiment'}
              onClick={c && surConstruction && !choixEnCours ? () => surConstruction(c) : undefined}
              style={{ pointerEvents: choixEnCours ? 'none' : undefined }}
            >
              {c ? <Dessin id={c.batiment} actif={actif} nuit={nuit} /> : <Feu actif={actif} />}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

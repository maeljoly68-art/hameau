import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { Saison } from '../core/saison.ts';
import type { Construction } from '../core/types.ts';
import { FEU, population, tailleTerrain } from '../core/village.ts';
import { DX, DY, Dessin, Feu, SaisonContexte, ecran, pts } from './village/dessins.tsx';

export type Phase = 'aube' | 'jour' | 'soir' | 'nuit';

export function phasePour(heure: number): Phase {
  if (heure >= 21 || heure < 6) return 'nuit';
  if (heure < 8) return 'aube';
  if (heure >= 18) return 'soir';
  return 'jour';
}

const CIEL: Record<Phase, [string, string]> = {
  aube: ['#f4a6b8', '#fde2c4'],
  jour: ['#6fb8ee', '#cfeafb'],
  soir: ['#e9795a', '#f6c37f'],
  nuit: ['#0b1029', '#242c57'],
};
const HERBE: Record<Saison, Record<Phase, [string, string]>> = {
  printemps: { aube: ['#86c97c', '#7bbd71'], jour: ['#84cf74', '#78c369'], soir: ['#90bb63', '#84af59'], nuit: ['#2f5a3a', '#2a5234'] },
  ete: { aube: ['#7fbf7a', '#74b46f'], jour: ['#7cc56d', '#70b962'], soir: ['#88b45f', '#7ca856'], nuit: ['#2f5a3a', '#2a5234'] },
  automne: { aube: ['#b3ae63', '#a6a15a'], jour: ['#a9b85a', '#9dac50'], soir: ['#b5a24f', '#a99647'], nuit: ['#454c2e', '#3f4528'] },
  hiver: { aube: ['#f2e6ee', '#e8dce6'], jour: ['#eaf0f7', '#dfe7f1'], soir: ['#f1dccf', '#e8d0c2'], nuit: ['#3f4b66', '#39445e'] },
};
const COLLINES: Record<Saison, Record<Phase, [string, string]>> = {
  printemps: { aube: ['#c99bb0', '#b48aa3'], jour: ['#a8dcae', '#8ccc96'], soir: ['#b9776a', '#9c635c'], nuit: ['#1b2446', '#161d3a'] },
  ete: { aube: ['#c99bb0', '#b48aa3'], jour: ['#9fd0a8', '#86c093'], soir: ['#b9776a', '#9c635c'], nuit: ['#1b2446', '#161d3a'] },
  automne: { aube: ['#c9a08f', '#b78d80'], jour: ['#c9a25e', '#b88f4f'], soir: ['#b9725a', '#9c5f4c'], nuit: ['#1d2342', '#181d37'] },
  hiver: { aube: ['#e6d3e0', '#d8c3d3'], jour: ['#dfe8f3', '#cfdbea'], soir: ['#e3c1b4', '#d3ad9f'], nuit: ['#26304f', '#202945'] },
};

/** Ce qui n'est pas un toit n'attire pas de chemin : on ne va pas « chez » un parterre. */
const DECOR = new Set(['fleurs', 'arbre', 'lanterne', 'etang', 'ruche', 'potager']);

/** Hachage stable d'une case : le même brin d'herbe au même endroit à chaque affichage. */
function hache(x: number, y: number): number {
  return Math.abs((x * 73856093) ^ (y * 19349663)) % 100;
}

function Ornement({ x, y, saison }: { x: number; y: number; saison: Saison }) {
  const h = hache(x, y);
  const { sx, sy } = ecran(x, y);
  const ox = (h % 7) - 3;
  if (h < 16 && saison === 'hiver')
    return (
      <g transform={`translate(${sx + ox} ${sy + 1})`}>
        <ellipse cx={0} cy={0} rx={6} ry={2.6} fill="#fbfdff" />
        <ellipse cx={4} cy={1} rx={3} ry={1.6} fill="#f2f6fc" />
      </g>
    );
  if (h < 16)
    return (
      <g transform={`translate(${sx + ox} ${sy + 2})`}>
        <path d="M-4 0 q1 -6 2 0 M-1 0 q1 -8 2 0 M2 0 q1 -5 2 0" stroke={saison === 'automne' ? '#7f7f35' : '#3f8a3e'} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      </g>
    );
  if (h < 22)
    return (
      <g transform={`translate(${sx + ox} ${sy})`}>
        <ellipse cx={-3} cy={1} rx={3} ry={1.8} fill="#a7a49c" />
        <ellipse cx={2} cy={2} rx={2} ry={1.3} fill="#8e8b84" />
      </g>
    );
  // Selon la saison : feuilles mortes, ou fleurs (plus nombreuses au printemps).
  if (saison === 'automne' && h < 32)
    return (
      <g transform={`translate(${sx + ox} ${sy})`}>
        <ellipse cx={-3} cy={0} rx={2.4} ry={1.2} fill="#d9822b" transform="rotate(-20 -3 0)" />
        <ellipse cx={2} cy={2} rx={2.2} ry={1.1} fill="#c0582a" transform="rotate(30 2 2)" />
        <ellipse cx={4} cy={-1} rx={2} ry={1} fill="#efb441" />
      </g>
    );
  if ((saison === 'ete' && h < 26) || (saison === 'printemps' && h < 36))
    return (
      <g transform={`translate(${sx + ox} ${sy})`}>
        <circle cx={-2} cy={0} r={1.6} fill="#fff6" />
        <circle cx={2} cy={2} r={1.6} fill={saison === 'printemps' ? '#ff9ec0' : '#ffd34d'} />
        {saison === 'printemps' && <circle cx={5} cy={-1} r={1.4} fill="#b9a0ff" />}
      </g>
    );
  return null;
}

/** Feuilles, flocons ou pétales qui tombent sur le village ; rien en été. */
function Particules({ saison, largeur, hauteur }: { saison: Saison; largeur: number; hauteur: number }) {
  if (saison === 'ete') return null;
  const n = saison === 'hiver' ? 24 : 9;
  return (
    <g style={{ pointerEvents: 'none' }} aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const x = (((i * 137) % 100) / 100) * largeur;
        const duree = (saison === 'hiver' ? 9 : 13) + ((i * 7) % 8);
        const balance = (i % 2 ? 1 : -1) * (14 + ((i * 5) % 22));
        // Chute en balancier : un aller-retour latéral sur la descente.
        const chemin = `M ${x} -12 q ${balance} ${hauteur / 4} 0 ${hauteur / 2} t 0 ${hauteur / 2 + 24}`;
        return (
          <g key={i}>
            <animateMotion dur={`${duree}s`} repeatCount="indefinite" path={chemin} begin={`${-((i * 1.7) % duree)}s`} rotate={saison === 'hiver' ? undefined : 'auto'} />
            {saison === 'hiver' ? (
              <circle r={i % 3 === 0 ? 2 : 1.3} fill="#fff" opacity={0.9} />
            ) : saison === 'automne' ? (
              <ellipse rx={3.2} ry={1.6} fill={['#e0892f', '#c0582a', '#efb441'][i % 3]} />
            ) : (
              <ellipse rx={2.4} ry={1.4} fill="#ffc6d9" />
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Gerbes de feu d'artifice au passage de niveau. */
function FeuxDArtifice({ largeur }: { largeur: number }) {
  const gerbes = [
    { x: largeur * 0.25, y: 58, couleur: '#ffd34d', retard: 0 },
    { x: largeur * 0.72, y: 44, couleur: '#ff6b8a', retard: 0.45 },
    { x: largeur * 0.5, y: 82, couleur: '#6fd39a', retard: 0.9 },
    { x: largeur * 0.85, y: 92, couleur: '#7cc4f0', retard: 1.3 },
  ];
  return (
    <g style={{ pointerEvents: 'none' }} aria-hidden>
      {gerbes.map((f, i) => (
        <g key={i} transform={`translate(${f.x} ${f.y})`}>
          <g className="gerbe" style={{ animationDelay: `${f.retard}s`, color: f.couleur }}>
            {Array.from({ length: 14 }, (_, k) => {
              const a = (k / 14) * 2 * Math.PI;
              return <line key={k} x1={Math.cos(a) * 5} y1={Math.sin(a) * 5} x2={Math.cos(a) * 24} y2={Math.sin(a) * 24} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />;
            })}
            <circle r={3} fill="#fff" />
          </g>
        </g>
      ))}
    </g>
  );
}

interface Promeneur {
  maison: { x: number; y: number };
  couleur: string;
  duree: number;
}

const TENUES = ['#d1553d', '#3d6fd1', '#7a4fc4', '#2f9e7a', '#d19a3d', '#c43d7a'];

export interface PropsVillage {
  niveau: number;
  constructions: Construction[];
  actif: boolean;
  phase: Phase;
  saison: Saison;
  /** Passage de niveau en cours : feux d'artifice. */
  fete?: boolean;
  /** Cases où le bâtiment choisi peut être posé (« x,y »). */
  posables?: ReadonlySet<string>;
  /** Bâtiment en cours de pose, montré en transparence sous le pointeur. */
  fantome?: string;
  /** Dernier bâtiment construit, qui « pousse » à son apparition. */
  recent?: string | null;
  surCase?: (x: number, y: number) => void;
  surConstruction?: (c: Construction) => void;
}

/**
 * La scène. Mémoïsée : le chrono rafraîchit l'écran chaque seconde, et
 * redessiner des centaines de polygones à chaque fois faisait chauffer les
 * téléphones pour rien.
 */
export const Village = memo(function Village({ niveau, constructions, actif, phase, saison, fete, posables, fantome, recent, surCase, surConstruction }: PropsVillage) {
  const [survol, setSurvol] = useState<string | null>(null);
  const t = tailleTerrain(niveau);
  const nuit = phase === 'nuit';
  const choix = posables !== undefined;

  const cases: { x: number; y: number }[] = [];
  for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) cases.push({ x, y });
  const occupees = new Set(constructions.map((c) => `${c.x},${c.y}`));
  occupees.add(`${FEU.x},${FEU.y}`);

  // Ordre de peinture : de l'arrière vers l'avant, sinon un bâtiment du fond
  // recouvre celui de devant.
  const objets = [...constructions.map((c) => ({ x: c.x, y: c.y, c })), { x: FEU.x, y: FEU.y, c: null as Construction | null }].sort(
    (a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x,
  );

  const foyers = constructions.filter((c) => !DECOR.has(c.batiment));
  const habitants = Math.min(6, population(constructions) - 1);
  const promeneurs: Promeneur[] = [];
  for (let i = 0; i < habitants && foyers.length > 0; i++) {
    const m = foyers[i % foyers.length];
    promeneurs.push({ maison: { x: m.x, y: m.y }, couleur: TENUES[i % TENUES.length], duree: 13 + ((i * 7) % 9) });
  }

  const largeur = t * DX * 2 + 48;
  const hauteur = t * DY * 2 + 150;
  const ox = largeur / 2;
  const oy = 120;
  const feu = ecran(FEU.x, FEU.y);
  const [survolX, survolY] = (survol ?? '0,0').split(',').map(Number);
  const posSurvol = ecran(survolX, survolY);
  const [haut, bas] = CIEL[phase];
  const [herbeA, herbeB] = HERBE[saison][phase];
  const [collineA, collineB] = COLLINES[saison][phase];
  // Sur la neige, un contour blanc ne se verrait pas.
  const contourPosable = saison === 'hiver' && !nuit ? '#ff8a3d' : '#fff';

  return (
    <SaisonContexte.Provider value={saison}>
    <svg className={`village phase-${phase} saison-${saison}`} viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label={`Ton hameau, niveau ${niveau}`}>
      <defs>
        <linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={haut} />
          <stop offset="1" stopColor={bas} />
        </linearGradient>
        <radialGradient id="halo">
          <stop offset="0" stopColor="#ffcf6b" stopOpacity={0.55} />
          <stop offset="1" stopColor="#ffcf6b" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="lueur-feu">
          <stop offset="0" stopColor="#ffb547" stopOpacity={nuit ? 0.45 : 0.25} />
          <stop offset="1" stopColor="#ffb547" stopOpacity={0} />
        </radialGradient>
      </defs>

      <rect width={largeur} height={hauteur} fill="url(#ciel)" />

      {nuit &&
        Array.from({ length: 34 }, (_, i) => (
          <circle key={i} cx={(i * 97 + 13) % largeur} cy={(i * 53) % 110} r={i % 3 === 0 ? 1.4 : 0.8} fill="#fff" opacity={0.85} className={i % 4 === 0 ? 'scintille' : undefined} style={{ animationDelay: `${(i % 7) * 0.4}s` }} />
        ))}
      {nuit ? (
        <g transform="translate(56 46)">
          <circle r={15} fill="#f4f1de" />
          <circle r={15} cx={6} cy={-3} fill={haut} opacity={0.9} />
        </g>
      ) : (
        <circle cx={56} cy={phase === 'jour' ? 42 : 70} r={phase === 'jour' ? 20 : 24} fill={phase === 'jour' ? '#ffe27a' : '#ffb15e'} opacity={0.95} />
      )}
      {!nuit &&
        [0, 1, 2].map((i) => (
          // SMIL plutôt qu'une animation CSS : en CSS, la translation de
          // l'animation écraserait la hauteur donnée à chaque nuage.
          <g key={i} transform={`translate(0 ${24 + i * 22})`} opacity={phase === 'jour' ? 0.9 : 0.6}>
            <g>
              <animateTransform attributeName="transform" type="translate" from="-70 0" to={`${largeur + 70} 0`} dur={`${70 + i * 25}s`} begin={`${-i * 30 - 10}s`} repeatCount="indefinite" />
              <ellipse cx={0} cy={0} rx={22} ry={8} fill="#fff" />
              <ellipse cx={14} cy={-5} rx={14} ry={9} fill="#fff" />
              <ellipse cx={-12} cy={-3} rx={11} ry={7} fill="#fff" />
            </g>
          </g>
        ))}

      {/* Collines au loin : elles donnent de la profondeur au plateau. */}
      <path d={`M0 ${oy + 10} Q ${largeur * 0.2} ${oy - 50} ${largeur * 0.45} ${oy - 6} T ${largeur} ${oy - 24} V ${hauteur} H 0 Z`} fill={collineA} />
      <path d={`M0 ${oy + 30} Q ${largeur * 0.35} ${oy - 18} ${largeur * 0.6} ${oy + 14} T ${largeur} ${oy + 2} V ${hauteur} H 0 Z`} fill={collineB} />

      <g transform={`translate(${ox} ${oy})`}>
        {/* Tranche du plateau. */}
        <polygon points={pts([[-t * DX, t * DY - DY], [0, 2 * t * DY - DY], [0, 2 * t * DY - DY + 16], [-t * DX, t * DY - DY + 16]])} fill="#7a5530" />
        <polygon points={pts([[0, 2 * t * DY - DY], [t * DX, t * DY - DY], [t * DX, t * DY - DY + 16], [0, 2 * t * DY - DY + 16]])} fill="#5f4126" />
        <polygon points={pts([[-t * DX, t * DY - DY + 5], [0, 2 * t * DY - DY + 5], [0, 2 * t * DY - DY + 7], [-t * DX, t * DY - DY + 7]])} fill="#6b4a2b" />

        {cases.map(({ x, y }) => {
          const { sx, sy } = ecran(x, y);
          const k = `${x},${y}`;
          const ok = posables?.has(k) ?? false;
          return (
            <polygon
              key={k}
              points={pts([[sx, sy - DY], [sx + DX, sy], [sx, sy + DY], [sx - DX, sy]])}
              fill={(x + y) % 2 ? herbeA : herbeB}
              stroke={ok ? contourPosable : 'rgba(0,0,0,.07)'}
              strokeWidth={ok ? 1.5 : 1}
              className={ok ? 'case posable' : 'case'}
              onClick={choix && ok ? () => surCase?.(x, y) : undefined}
              onPointerEnter={choix ? () => setSurvol(k) : undefined}
            />
          );
        })}

        {/* Chemins de terre battue du feu vers chaque foyer. */}
        <g stroke={nuit ? '#5b5140' : saison === 'hiver' ? '#c4b59b' : '#d8bd85'} strokeWidth={7} strokeLinecap="round" opacity={0.55} style={{ pointerEvents: 'none' }}>
          {foyers.map((c) => {
            const { sx, sy } = ecran(c.x, c.y);
            return <line key={c.id} x1={feu.sx} y1={feu.sy} x2={sx} y2={sy} />;
          })}
        </g>

        <g style={{ pointerEvents: 'none' }}>{cases.filter(({ x, y }) => !occupees.has(`${x},${y}`)).map(({ x, y }) => <Ornement key={`o${x},${y}`} x={x} y={y} saison={saison} />)}</g>

        <circle cx={feu.sx} cy={feu.sy - 6} r={actif ? 90 : 55} fill="url(#lueur-feu)" style={{ pointerEvents: 'none' }} className={actif ? 'lueur' : undefined} />

        {objets.map(({ x, y, c }) => {
          const { sx, sy } = ecran(x, y);
          const cliquable = c !== null && surConstruction !== undefined && !choix;
          return (
            <g
              key={c ? c.id : 'feu'}
              transform={`translate(${sx} ${sy})`}
              className={cliquable ? 'batiment cliquable' : 'batiment'}
              onClick={cliquable ? () => surConstruction(c) : undefined}
              style={{ pointerEvents: choix ? 'none' : undefined }}
            >
              <ellipse cx={3} cy={3} rx={22} ry={9} fill="rgba(20,30,10,.18)" />
              <g className={c && c.id === recent ? 'pousse' : undefined}>{c ? <Dessin id={c.batiment} actif={actif} nuit={nuit} /> : <Feu actif={actif} />}</g>
            </g>
          );
        })}

        {choix && fantome && survol && posables?.has(survol) && (
          <g transform={`translate(${posSurvol.sx} ${posSurvol.sy})`} opacity={0.6} style={{ pointerEvents: 'none' }}>
            <Dessin id={fantome} actif={false} nuit={nuit} />
          </g>
        )}

        {/* Les habitants vont et viennent entre leur maison et le feu ; la nuit, ils dorment. */}
        {!nuit &&
          promeneurs.map((p, i) => {
            const m = ecran(p.maison.x, p.maison.y);
            const a = { x: feu.sx + 14 - (i % 3) * 10, y: feu.sy + 8 };
            return (
              <g key={i} style={{ pointerEvents: 'none' }}>
                <animateMotion dur={`${p.duree}s`} repeatCount="indefinite" path={`M ${m.sx} ${m.sy + 10} L ${a.x} ${a.y} L ${m.sx} ${m.sy + 10}`} begin={`${-i * 2.3}s`} />
                <ellipse cx={0} cy={1} rx={3.5} ry={1.4} fill="rgba(0,0,0,.2)" />
                <rect x={-2.5} y={-8} width={5} height={8} rx={2} fill={p.couleur} />
                <circle cx={0} cy={-10.5} r={2.8} fill="#f2c9a0" />
              </g>
            );
          })}

        {/* Lucioles : seulement par les nuits douces. */}
        {nuit &&
          (saison === 'printemps' || saison === 'ete') &&
          Array.from({ length: 10 }, (_, i) => {
            const { sx, sy } = ecran((i * 3) % t, (i * 5 + 1) % t);
            return <circle key={`l${i}`} cx={sx + ((i * 11) % 20) - 10} cy={sy - 14 - (i % 4) * 6} r={1.5} fill="#e9ff8a" className="luciole" style={{ animationDelay: `${i * 0.7}s`, pointerEvents: 'none' }} />;
          })}
      </g>
      <Particules saison={saison} largeur={largeur} hauteur={hauteur} />
      {fete && <FeuxDArtifice largeur={largeur} />}
    </svg>
    </SaisonContexte.Provider>
  );
});

/** Le village dans son cadre, avec le zoom (utile sur téléphone quand le terrain grandit). */
export function CadreVillage(props: PropsVillage & { pied?: React.ReactNode }) {
  const [zoom, setZoom] = useState(1);
  const cadre = useRef<HTMLDivElement>(null);

  // Au changement de zoom, on recentre sur le feu plutôt que de laisser la vue
  // collée au coin haut-gauche, où il n'y a que du ciel.
  useLayoutEffect(() => {
    const el = cadre.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.55;
  }, [zoom]);

  const { pied, ...village } = props;
  return (
    <section className="carte-village">
      <div ref={cadre} className={zoom > 1 ? 'cadre-village zoome' : 'cadre-village'}>
        <div style={{ width: `${zoom * 100}%` }}>
          <Village {...village} />
        </div>
      </div>
      <div className="village-outils">
        <span className="pastille" title="Habitants">
          <IconeHabitant /> {population(props.constructions)}
        </span>
        <button className="pastille bouton-pastille" onClick={() => setZoom(zoom > 1 ? 1 : 2)} aria-label={zoom > 1 ? 'Dézoomer' : 'Zoomer'}>
          {zoom > 1 ? '−' : '+'}
        </button>
      </div>
      {pied}
    </section>
  );
}

function IconeHabitant() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <circle cx="6" cy="3.2" r="2.4" fill="currentColor" />
      <path d="M1.5 11.5c0-2.8 2-4.6 4.5-4.6s4.5 1.8 4.5 4.6z" fill="currentColor" />
    </svg>
  );
}

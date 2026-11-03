import { useContext } from 'react';
import { couleurDe } from '../../core/apparence.ts';
import { eclaircir } from '../../core/couleur.ts';
import type { Apparence } from '../../core/types.ts';
import { Lanterne, LumiereContexte } from './dessins.tsx';

/** Ce que fait le personnage : il travaille pendant une session, se repose, ou dort la nuit. */
export type Pose = 'travail' | 'repos' | 'dort';

const YEUX = '#2a1f1a';

/** Coiffure : la partie derrière la tête (cheveux longs, chignon), dessinée avant elle. */
function CheveuxArriere({ coiffure, couleur }: { coiffure: string; couleur: string }) {
  if (coiffure === 'longue') return <path d="M -5.7 -22 Q -6.7 -14.4 -4.8 -13.2 L 4.8 -13.2 Q 6.7 -14.4 5.7 -22 Z" fill={couleur} />;
  if (coiffure === 'chignon') return <circle cx={2.4} cy={-27.2} r={2.7} fill={couleur} />;
  return null;
}

/** Coiffure : la frange et le dessus, posés sur la tête. */
function CheveuxAvant({ coiffure, couleur }: { coiffure: string; couleur: string }) {
  return (
    <g>
      <path d="M -5.4 -21.2 Q -5.7 -27 0 -26.8 Q 5.7 -27 5.4 -21.2 Q 4.1 -24.2 1.2 -23.8 Q -1.6 -25 -5.4 -21.2 Z" fill={couleur} />
      {coiffure === 'boucles' &&
        [[-4.5, -24.4], [-2.4, -26.4], [0.4, -27.2], [3, -26.5], [4.9, -24.3]].map(([x, y]) => <circle key={x} cx={x} cy={y} r={1.8} fill={couleur} />)}
    </g>
  );
}

function Chapeau({ id }: { id: string }) {
  const l = useContext(LumiereContexte);
  const p = l.peindre;
  switch (id) {
    case 'paille':
      return (
        <g>
          <ellipse cx={0} cy={-24.6} rx={8.4} ry={2.3} fill={p('#e3bd5a')} />
          <path d="M -4.3 -24.6 Q -4.4 -30 0 -30 Q 4.4 -30 4.3 -24.6 Z" fill={p('#f0d27a')} />
          <rect x={-4.3} y={-26} width={8.6} height={1.4} fill={p('#c0533a')} />
        </g>
      );
    case 'bonnet':
      return (
        <g>
          <path d="M -5.5 -22.6 Q -5.8 -30.6 0 -30.6 Q 5.8 -30.6 5.5 -22.6 Z" fill={p('#d14a4a')} />
          <path d="M -2.4 -29.8 v 6 M 0.6 -30.4 v 6.6 M 3.4 -29.6 v 5.8" stroke={p('#b83a3a')} strokeWidth={0.6} />
          <rect x={-5.8} y={-24.4} width={11.6} height={2.4} rx={1} fill={p('#a8333a')} />
          <circle cx={0} cy={-31.2} r={2} fill={p('#f7f1e3')} />
        </g>
      );
    case 'fleurs':
      return (
        <g>
          <path d="M -5.5 -24.2 Q 0 -27.6 5.5 -24.2" stroke={p('#3f8f4a')} strokeWidth={1.4} fill="none" />
          {[[-4.5, -24.7, '#ff6b8a'], [-1.6, -26.3, '#ffd34d'], [1.5, -26.4, '#ffffff'], [4.4, -24.9, '#b07cff']].map(([x, y, c]) => (
            <g key={x as number}>
              <circle cx={x as number} cy={y as number} r={1.5} fill={p(c as string)} />
              <circle cx={x as number} cy={y as number} r={0.5} fill={p('#f2c14e')} />
            </g>
          ))}
        </g>
      );
    case 'beret':
      return (
        <g transform="rotate(-10 0.9 -25.6)">
          <ellipse cx={0.9} cy={-25.6} rx={6.3} ry={2.8} fill={p('#3a3f6a')} />
          <rect x={1.1} y={-29.4} width={1} height={1.8} rx={0.4} fill={p('#3a3f6a')} />
        </g>
      );
    case 'casque':
      return (
        <g>
          <path d="M 0 -29.4 Q 3 -34.4 7.4 -31.8 Q 3.6 -31.4 1.2 -29.2 Z" fill={p('#d94a4a')} />
          <path d="M -5.7 -21.6 Q -6 -29.4 0 -29.4 Q 6 -29.4 5.7 -21.6 Z" fill={p('#a7acb7')} />
          <rect x={-5.9} y={-22.8} width={11.8} height={1.7} rx={0.6} fill={p('#8a8f9a')} />
          <rect x={-0.6} y={-22.6} width={1.2} height={3.4} fill={p('#8a8f9a')} />
        </g>
      );
    case 'mage':
      return (
        <g>
          <ellipse cx={0} cy={-24.2} rx={7.8} ry={2} fill={p('#3b3f8f')} />
          <path d="M -4.6 -24.2 Q -1 -31 2.8 -37.6 Q 3 -31 4.6 -24.2 Z" fill={p('#4a4fb0')} />
          <polygon points="0.4,-31.4 1.1,-29.8 2.7,-29.6 1.5,-28.6 1.8,-27 0.4,-27.9 -1,-27 -0.7,-28.6 -1.9,-29.6 -0.3,-29.8" fill={p('#ffd34d')} />
        </g>
      );
    case 'couronne':
      return (
        <g>
          <path d="M -4.8 -23.6 L -4.8 -28.2 L -2.4 -25.8 L 0 -29.4 L 2.4 -25.8 L 4.8 -28.2 L 4.8 -23.6 Z" fill={p('#f2c14e')} />
          <rect x={-4.8} y={-24.4} width={9.6} height={1.2} fill={p('#d4a33a')} />
          <circle cx={0} cy={-25.2} r={0.85} fill={p('#d94a4a')} />
          <circle cx={-3} cy={-24.9} r={0.7} fill={p('#3d6fd1')} />
          <circle cx={3} cy={-24.9} r={0.7} fill={p('#2f9e7a')} />
        </g>
      );
    default:
      return null;
  }
}

/** Ce que le personnage tient à la main au repos. (0, 0) au creux de la main droite. */
function ObjetEnMain({ id }: { id: string }) {
  const l = useContext(LumiereContexte);
  const p = l.peindre;
  switch (id) {
    case 'livre':
      return <rect x={-1.6} y={-3.4} width={3.6} height={5} rx={0.5} fill={p('#c0533a')} stroke={p('#8a2f22')} strokeWidth={0.5} />;
    case 'lanterne':
      return (
        <g transform="translate(0.4 6.6)">
          <line x1={0} y1={-6.6} x2={0} y2={-5} stroke={p('#3a3530')} strokeWidth={0.6} />
          <Lanterne echelle={0.36} />
        </g>
      );
    case 'tasse':
      return (
        <g>
          <rect x={-1.6} y={-3.2} width={3.4} height={3.6} rx={0.6} fill={p('#f0ebe0')} />
          <path d="M 1.8 -2.4 q 1.6 0.4 0 2" stroke={p('#f0ebe0')} strokeWidth={0.7} fill="none" />
          <g className="fumee" transform="translate(0 -4)">
            <circle r={0.9} fill={p('#e6e6e6')} opacity={0.6} />
            <circle cx={0.6} cy={-2.2} r={1.1} fill={p('#f0f0f0')} opacity={0.4} />
          </g>
        </g>
      );
    case 'marteau':
      return (
        <g transform="rotate(10)">
          <line x1={0} y1={2.6} x2={0} y2={-6} stroke={p('#8a5e33')} strokeWidth={1.1} />
          <rect x={-2.4} y={-7.8} width={4.8} height={2.4} rx={0.5} fill={p('#6b6b75')} />
        </g>
      );
    case 'plume':
      return <path d="M 0 1.6 Q -1 -4 3 -8.4 Q 2.2 -3.8 0.4 1.6 Z" fill={p('#f7f4ea')} stroke={p('#c9c2b0')} strokeWidth={0.4} />;
    case 'baton':
      return (
        <g>
          <line x1={0.6} y1={7.6} x2={1.4} y2={-19} stroke={p('#7a5634')} strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={1.5} cy={-19.6} r={1.5} fill={p('#5a3d22')} />
        </g>
      );
    default:
      return null;
  }
}

/**
 * Le personnage principal, les pieds en (0, 0), environ 30 px de haut.
 * Dessiné par couches, de l'arrière (cape) vers l'avant (chapeau, objet) :
 * chaque pièce de la garde-robe se pose sur les autres sans les redessiner.
 */
export function Personnage({ apparence, pose }: { apparence: Apparence; pose: Pose }) {
  const l = useContext(LumiereContexte);
  const p = l.peindre;
  const peau = p(couleurDe(apparence, 'peau'));
  const cheveux = p(couleurDe(apparence, 'cheveux'));
  const tenue = couleurDe(apparence, 'tenue');
  const cape = apparence.cape !== 'aucune' ? couleurDe(apparence, 'cape') : null;
  const travail = pose === 'travail';
  const dort = pose === 'dort';
  // Au travail, il tient son ouvrage à deux mains ; le marteau et la plume
  // sont des outils : ils remplacent le livre.
  const outil = travail && (apparence.accessoire === 'marteau' || apparence.accessoire === 'plume') ? apparence.accessoire : null;
  const manche = p(eclaircir(tenue, -0.12));
  return (
    <g className="perso">
      <ellipse cx={0} cy={0.5} rx={6.5} ry={2.4} fill="rgba(0,0,0,.22)" />
      <g className={dort ? 'perso-corps endormi' : 'perso-corps'}>
        {cape && (
          <>
            <path d="M -4.8 -15.6 Q 0 -17 4.8 -15.6 L 7.3 -2.4 Q 0 -0.6 -7.3 -2.4 Z" fill={p(cape)} />
            <path d="M 2 -16.2 Q 4 -16 4.8 -15.6 L 7.3 -2.4 Q 5 -1.6 2.6 -1.2 Z" fill={p(eclaircir(cape, -0.2))} />
          </>
        )}
        <rect x={-3.6} y={-5.6} width={3} height={5.6} rx={1.2} fill={p('#3a3348')} />
        <rect x={0.6} y={-5.6} width={3} height={5.6} rx={1.2} fill={p('#332d40')} />
        <ellipse cx={-2.2} cy={-0.3} rx={2.1} ry={1.1} fill={p('#2a2228')} />
        <ellipse cx={2.2} cy={-0.3} rx={2.1} ry={1.1} fill={p('#2a2228')} />
        <path d="M -5.4 -4.4 L -4.8 -13.8 Q -4.5 -16.2 -1.9 -16.2 L 1.9 -16.2 Q 4.5 -16.2 4.8 -13.8 L 5.4 -4.4 Q 0 -3.2 -5.4 -4.4 Z" fill={p(tenue)} />
        <path d="M 1.4 -16.2 L 1.9 -16.2 Q 4.5 -16.2 4.8 -13.8 L 5.4 -4.4 Q 3.4 -3.8 1.6 -3.7 Z" fill={p(eclaircir(tenue, -0.22))} />
        {apparence.tenue === 'or' && <path d="M -5.3 -5 Q 0 -3.8 5.3 -5" stroke={p('#fff1b8')} strokeWidth={0.8} fill="none" />}
        <rect x={-5.1} y={-8.7} width={10.2} height={1.6} fill={p('#5a3d22')} />
        <rect x={-0.9} y={-9} width={1.8} height={2.2} rx={0.4} fill={p('#e0b440')} />
        {cape && <circle cx={0} cy={-15.7} r={1.1} fill={p('#e0b440')} />}

        {travail ? (
          <g>
            <path d="M -4.5 -14.4 Q -5.6 -11 -2.8 -10.2" stroke={manche} strokeWidth={2.5} strokeLinecap="round" fill="none" />
            <path d="M 4.5 -14.4 Q 5.6 -11 2.8 -10.2" stroke={manche} strokeWidth={2.5} strokeLinecap="round" fill="none" />
            {outil === 'marteau' ? (
              <g transform="translate(3 -10)" className="marteler">
                <ObjetEnMain id="marteau" />
              </g>
            ) : outil === 'plume' ? (
              <g>
                <rect x={-5} y={-11.6} width={7.4} height={4.6} rx={0.6} fill={p('#f3ead2')} stroke={p('#c9b98f')} strokeWidth={0.4} />
                <g transform="translate(2.6 -10.4)" className="ecrire">
                  <ObjetEnMain id="plume" />
                </g>
              </g>
            ) : (
              <g className="livre">
                <rect x={-5.8} y={-12.6} width={5.6} height={4.2} rx={0.4} fill={p('#fbf7ee')} stroke={p('#c0533a')} strokeWidth={0.8} />
                <rect x={0.2} y={-12.6} width={5.6} height={4.2} rx={0.4} fill={p('#fbf7ee')} stroke={p('#c0533a')} strokeWidth={0.8} />
                <path d="M -4.6 -11.2 h 3.4 M -4.6 -9.9 h 3 M 1.3 -11.2 h 3.4 M 1.3 -9.9 h 2.6" stroke={p('#b5ab98')} strokeWidth={0.4} />
              </g>
            )}
            <circle cx={-2.6} cy={-10} r={1.3} fill={peau} />
            <circle cx={2.6} cy={-10} r={1.3} fill={peau} />
          </g>
        ) : (
          <g>
            <path d="M -4.6 -14.6 Q -6.2 -11.4 -6.2 -8.2" stroke={manche} strokeWidth={2.5} strokeLinecap="round" fill="none" />
            <path d="M 4.6 -14.6 Q 6.2 -11.4 6.2 -8.2" stroke={manche} strokeWidth={2.5} strokeLinecap="round" fill="none" />
            <circle cx={-6.2} cy={-7.6} r={1.35} fill={peau} />
            <g transform="translate(6.3 -7.6)">
              <ObjetEnMain id={apparence.accessoire} />
            </g>
            <circle cx={6.2} cy={-7.6} r={1.35} fill={peau} />
          </g>
        )}

        <CheveuxArriere coiffure={apparence.coiffure} couleur={cheveux} />
        <circle cx={0} cy={-21} r={5.2} fill={peau} />
        {dort ? (
          <path d="M -2.9 -21 q 1 0.9 2 0 M 0.9 -21 q 1 0.9 2 0" stroke={YEUX} strokeWidth={0.6} fill="none" strokeLinecap="round" />
        ) : (
          <g>
            <circle cx={-1.9} cy={-21} r={0.72} fill={YEUX} />
            <circle cx={1.9} cy={-21} r={0.72} fill={YEUX} />
            <path d="M -0.9 -18.7 q 0.9 0.7 1.8 0" stroke={YEUX} strokeWidth={0.5} fill="none" strokeLinecap="round" />
          </g>
        )}
        <circle cx={-3.3} cy={-19.4} r={1} fill="#f08a8a" opacity={0.35} />
        <circle cx={3.3} cy={-19.4} r={1} fill="#f08a8a" opacity={0.35} />
        <CheveuxAvant coiffure={apparence.coiffure} couleur={cheveux} />
        <Chapeau id={apparence.chapeau} />
      </g>
      {/* Au travail, les objets qu'il ne tient pas restent posés à ses pieds. */}
      {travail && !outil && apparence.accessoire !== 'aucun' && apparence.accessoire !== 'livre' && (
        <g transform="translate(9 0)">
          <ObjetEnMain id={apparence.accessoire} />
        </g>
      )}
      {dort && (
        <text x={6} y={-27} fontSize={9} fill="#fff" className="zzz">
          z
        </text>
      )}
    </g>
  );
}

/** Le compagnon, assis de l'autre côté du feu ; les pattes en (0, 0). */
export function Compagnon({ id, dort }: { id: string; dort: boolean }) {
  const l = useContext(LumiereContexte);
  const p = l.peindre;
  const ombre = <ellipse cx={0} cy={0.4} rx={5.4} ry={1.9} fill="rgba(0,0,0,.2)" />;
  const oeil = (x: number, y: number, r = 0.55) =>
    dort ? <path key={x} d={`M ${x - 0.8} ${y} q 0.8 0.6 1.6 0`} stroke={YEUX} strokeWidth={0.45} fill="none" /> : <circle key={x} cx={x} cy={y} r={r} fill={YEUX} />;
  switch (id) {
    case 'chat':
      return (
        <g className="compagnon">
          {ombre}
          <path d="M 3.4 -1.6 Q 8.4 -2 6.8 -8" stroke={p('#d0843c')} strokeWidth={1.6} fill="none" strokeLinecap="round" className="queue" />
          <ellipse cx={0} cy={-3.2} rx={4.2} ry={3.4} fill={p('#e0974a')} />
          <path d="M -1 -6 q 1 1.2 2 0 M 0.6 -4.6 q 1 1.2 2 0" stroke={p('#c07a36')} strokeWidth={0.6} fill="none" />
          <circle cx={-3.2} cy={-7.2} r={2.9} fill={p('#e0974a')} />
          <polygon points="-5.6,-8.4 -5.2,-11.4 -3.4,-9.6" fill={p('#e0974a')} />
          <polygon points="-2.8,-9.8 -1,-11.2 -0.8,-8.2" fill={p('#e0974a')} />
          {oeil(-4.2, -7.4)}
          {oeil(-2.2, -7.4)}
          <circle cx={-3.2} cy={-6.2} r={0.5} fill={p('#e86a7a')} />
        </g>
      );
    case 'chien':
      return (
        <g className="compagnon">
          {ombre}
          <path d="M 4 -2.4 Q 7.6 -3 7.4 -6.6" stroke={p('#9a6634')} strokeWidth={1.6} fill="none" strokeLinecap="round" className="queue" />
          <ellipse cx={0} cy={-3.6} rx={4.8} ry={3.6} fill={p('#b07840')} />
          <ellipse cx={0.6} cy={-2.6} rx={2.4} ry={1.8} fill={p('#e8d2b0')} />
          <circle cx={-3.6} cy={-8} r={3.1} fill={p('#b07840')} />
          <ellipse cx={-5.6} cy={-7} rx={1.4} ry={2.6} fill={p('#7a4f2a')} />
          <ellipse cx={-4.4} cy={-6.4} rx={1.9} ry={1.3} fill={p('#e8d2b0')} />
          <circle cx={-5.4} cy={-6.8} r={0.6} fill={YEUX} />
          {oeil(-3.8, -8.8)}
          {oeil(-2, -8.6)}
        </g>
      );
    case 'lapin':
      return (
        <g className="compagnon">
          {ombre}
          <circle cx={3.6} cy={-2.6} r={1.6} fill={p('#ffffff')} />
          <ellipse cx={0} cy={-3} rx={3.8} ry={3.2} fill={p('#eeeae4')} />
          <circle cx={-2.6} cy={-6.6} r={2.5} fill={p('#eeeae4')} />
          <ellipse cx={-3.6} cy={-11} rx={0.9} ry={2.8} fill={p('#eeeae4')} transform="rotate(-12 -3.6 -11)" />
          <ellipse cx={-1.8} cy={-11.2} rx={0.9} ry={2.8} fill={p('#eeeae4')} transform="rotate(10 -1.8 -11.2)" />
          <ellipse cx={-1.8} cy={-11} rx={0.4} ry={1.8} fill={p('#f2b8c0')} transform="rotate(10 -1.8 -11)" />
          {oeil(-3.4, -6.8, 0.5)}
          <circle cx={-4.6} cy={-6} r={0.4} fill={p('#e86a7a')} />
        </g>
      );
    case 'hibou':
      return (
        <g className="compagnon">
          {ombre}
          <rect x={-3.6} y={-4.4} width={7.2} height={4.4} rx={1} fill={p('#7a5634')} />
          <ellipse cx={0} cy={-4.4} rx={3.6} ry={1.2} fill={p('#a0703f')} />
          <ellipse cx={0} cy={-9.4} rx={3.7} ry={4.6} fill={p('#8a6a4a')} />
          <ellipse cx={0} cy={-8.2} rx={2.3} ry={3} fill={p('#c9ab84')} />
          <polygon points="-3.2,-12.6 -2.2,-15 -1.2,-13" fill={p('#8a6a4a')} />
          <polygon points="3.2,-12.6 2.2,-15 1.2,-13" fill={p('#8a6a4a')} />
          {dort ? (
            <path d="M -2.3 -11 q 0.9 0.6 1.8 0 M 0.5 -11 q 0.9 0.6 1.8 0" stroke={YEUX} strokeWidth={0.5} fill="none" />
          ) : (
            <g>
              {/* La nuit, ses yeux renvoient la lumière du feu. */}
              <circle cx={-1.4} cy={-11} r={1.3} fill={l.allume > 0.5 ? '#ffe27a' : p('#ffffff')} />
              <circle cx={1.4} cy={-11} r={1.3} fill={l.allume > 0.5 ? '#ffe27a' : p('#ffffff')} />
              <circle cx={-1.4} cy={-11} r={0.6} fill={YEUX} />
              <circle cx={1.4} cy={-11} r={0.6} fill={YEUX} />
            </g>
          )}
          <polygon points="-0.6,-9.6 0.6,-9.6 0,-8.4" fill={p('#e8a23a')} />
        </g>
      );
    case 'renard':
      return (
        <g className="compagnon">
          {ombre}
          <path d="M 3.6 -2.4 Q 10.4 -2 9.4 -8.6 Q 7.8 -4.2 3.8 -4.6 Z" fill={p('#e07a2e')} className="queue" />
          <path d="M 9.4 -8.6 Q 8.6 -6.6 7.2 -6 Q 8.8 -7.2 9.4 -8.6 Z" fill={p('#fbf3e6')} />
          <ellipse cx={0} cy={-3.4} rx={4.6} ry={3.2} fill={p('#e07a2e')} />
          <ellipse cx={-1.2} cy={-2.6} rx={2} ry={1.8} fill={p('#fbf3e6')} />
          <circle cx={-3.6} cy={-7} r={2.8} fill={p('#e07a2e')} />
          <polygon points="-5.8,-8.4 -5.6,-11.8 -3.8,-9.4" fill={p('#e07a2e')} />
          <polygon points="-3,-9.8 -1.2,-11.8 -1,-8.4" fill={p('#e07a2e')} />
          <path d="M -6.6 -6.4 Q -4.4 -4.6 -2.4 -6.2 Q -4 -5.2 -6.6 -6.4 Z" fill={p('#fbf3e6')} />
          <circle cx={-6.6} cy={-6.4} r={0.5} fill={YEUX} />
          {oeil(-4.2, -7.6)}
          {oeil(-2.4, -7.6)}
        </g>
      );
    default:
      return null;
  }
}

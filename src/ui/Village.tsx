import { memo, useMemo, useState } from 'react';
import { momentDuCiel, type Ciel, type Moment } from '../core/ciel.ts';
import { melanger } from '../core/couleur.ts';
import type { Saison } from '../core/saison.ts';
import { APPARENCE_DEFAUT, type Apparence, type Construction } from '../core/types.ts';
import { aleatoire, graine, longueurTour, tracerTour } from '../core/promenade.ts';
import { FEU, population, tailleTerrain } from '../core/village.ts';
import { DX, DY, Dessin, Feu, LumiereContexte, SaisonContexte, ecran, lumierePour, pts, type Lumiere } from './village/dessins.tsx';
import { hautDuBatiment } from './village/hauteurs.ts';
import { Compagnon, Personnage } from './village/personnage.tsx';

/** Couleurs du sol et des collines EN PLEIN JOUR : la lumière du moment les teinte ensuite. */
const HERBE: Record<Saison, [string, string]> = {
  printemps: ['#84cf74', '#78c369'],
  ete: ['#7cc56d', '#70b962'],
  automne: ['#a9b85a', '#9dac50'],
  hiver: ['#eaf0f7', '#dfe7f1'],
};
const COLLINES: Record<Saison, [string, string]> = {
  printemps: ['#a8dcae', '#8ccc96'],
  ete: ['#9fd0a8', '#86c093'],
  automne: ['#c9a25e', '#b88f4f'],
  hiver: ['#dfe8f3', '#cfdbea'],
};

const NOM_MOMENT: Record<Moment, string> = {
  nuit: 'la nuit',
  aube: 'à l’aube',
  lever: 'au lever du soleil',
  jour: 'en plein jour',
  coucher: 'au coucher du soleil',
  crepuscule: 'au crépuscule',
};

/** Ce qui n'est pas un toit n'attire pas de chemin : on ne va pas « chez » un parterre. */
const DECOR = new Set(['fleurs', 'arbre', 'lanterne', 'etang', 'ruche', 'potager']);

/** Hachage stable d'une case : le même brin d'herbe au même endroit à chaque affichage. */
function hache(x: number, y: number): number {
  return Math.abs((x * 73856093) ^ (y * 19349663)) % 100;
}

function Ornement({ x, y, saison, l }: { x: number; y: number; saison: Saison; l: Lumiere }) {
  const p = l.peindre;
  const h = hache(x, y);
  const { sx, sy } = ecran(x, y);
  const ox = (h % 7) - 3;
  if (h < 16 && saison === 'hiver')
    return (
      <g transform={`translate(${sx + ox} ${sy + 1})`}>
        <ellipse cx={0} cy={0} rx={6} ry={2.6} fill={p('#fbfdff')} />
        <ellipse cx={4} cy={1} rx={3} ry={1.6} fill={p('#f2f6fc')} />
      </g>
    );
  if (h < 16)
    return (
      <g transform={`translate(${sx + ox} ${sy + 2})`}>
        <path d="M-4 0 q1 -6 2 0 M-1 0 q1 -8 2 0 M2 0 q1 -5 2 0" stroke={p(saison === 'automne' ? '#7f7f35' : '#3f8a3e')} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      </g>
    );
  if (h < 22)
    return (
      <g transform={`translate(${sx + ox} ${sy})`}>
        <ellipse cx={-3} cy={1} rx={3} ry={1.8} fill={p('#a7a49c')} />
        <ellipse cx={2} cy={2} rx={2} ry={1.3} fill={p('#8e8b84')} />
      </g>
    );
  // Selon la saison : feuilles mortes, ou fleurs (plus nombreuses au printemps).
  if (saison === 'automne' && h < 32)
    return (
      <g transform={`translate(${sx + ox} ${sy})`}>
        <ellipse cx={-3} cy={0} rx={2.4} ry={1.2} fill={p('#d9822b')} transform="rotate(-20 -3 0)" />
        <ellipse cx={2} cy={2} rx={2.2} ry={1.1} fill={p('#c0582a')} transform="rotate(30 2 2)" />
        <ellipse cx={4} cy={-1} rx={2} ry={1} fill={p('#efb441')} />
      </g>
    );
  if ((saison === 'ete' && h < 26) || (saison === 'printemps' && h < 36))
    return (
      <g transform={`translate(${sx + ox} ${sy})`}>
        <circle cx={-2} cy={0} r={1.6} fill={p('#ffffff')} opacity={0.4} />
        <circle cx={2} cy={2} r={1.6} fill={p(saison === 'printemps' ? '#ff9ec0' : '#ffd34d')} />
        {saison === 'printemps' && <circle cx={5} cy={-1} r={1.4} fill={p('#b9a0ff')} />}
      </g>
    );
  return null;
}

/** Courbe douce, aller-retour : pour le balancier d'une feuille. */
const BALANCIER = { calcMode: 'spline', keyTimes: '0;0.5;1', keySplines: '0.45 0 0.55 1;0.45 0 0.55 1' } as const;

/** Feuilles, flocons ou pétales qui tombent sur le village ; rien en été. */
function Particules({ saison, largeur, hauteur, l }: { saison: Saison; largeur: number; hauteur: number; l: Lumiere }) {
  if (saison === 'ete') return null;
  const hiver = saison === 'hiver';
  const n = hiver ? 26 : 11;
  return (
    <g style={{ pointerEvents: 'none' }} aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const x = (((i * 137) % 100) / 100) * largeur;
        const duree = (hiver ? 10 : 15) + ((i * 7) % 8);
        const sens = i % 2 ? 1 : -1;
        const amplitude = (hiver ? 7 : 13) + ((i * 5) % 11);
        // Une feuille ne tombe pas droit : elle glisse d'un côté, puis de
        // l'autre, plusieurs fois. Chaque « t » renvoie l'arc du côté opposé.
        const pas = (hiver ? 74 : 56) + ((i * 13) % 26);
        const arcs = Math.ceil((hauteur + 30) / pas);
        const chemin = `M ${x} -14 q ${sens * amplitude} ${pas / 2} 0 ${pas}` + ` t 0 ${pas}`.repeat(arcs - 1);
        const debut = `${-((i * 1.7) % duree)}s`;
        // Le balancier suit les arcs (un arc = un demi-aller-retour) ; avant,
        // « rotate=auto » couchait la feuille dans le sens de la chute, et
        // elle tombait comme un trait de pluie.
        const periode = (2 * duree) / arcs;
        return (
          <g key={i}>
            <animateMotion dur={`${duree}s`} repeatCount="indefinite" path={chemin} begin={debut} />
            {hiver ? (
              <circle r={i % 3 === 0 ? 2 : 1.3} fill={l.peindre('#ffffff')} opacity={0.9} />
            ) : (
              <g>
                <animateTransform attributeName="transform" type="rotate" values={`${-38 * sens};${38 * sens};${-38 * sens}`} dur={`${periode}s`} begin={debut} repeatCount="indefinite" {...BALANCIER} />
                <g>
                  {/* Elle se retourne en tombant : un écrasement qui va et vient. */}
                  <animateTransform attributeName="transform" type="scale" values="1 1;0.3 1;1 1" dur={`${1.4 + (i % 4) * 0.35}s`} begin={debut} repeatCount="indefinite" {...BALANCIER} />
                  {saison === 'automne' ? (
                    <path d="M -5 0 Q -1.7 -3.4 5 0 Q -1.7 3.4 -5 0 Z" fill={l.peindre(['#e0892f', '#c0582a', '#efb441'][i % 3])} />
                  ) : (
                    <ellipse rx={2.8} ry={1.7} fill={l.peindre(i % 3 ? '#ffc6d9' : '#ffe1ea')} />
                  )}
                </g>
              </g>
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

/**
 * Le ciel : dégradé, lueur de l'horizon du côté du soleil, étoiles qui
 * s'allument une à une, lune dans sa vraie phase, soleil qui rougit en
 * descendant, nuages teintés par le couchant.
 */
function Firmament({ ciel, largeur, horizon }: { ciel: Ciel; largeur: number; horizon: number }) {
  const a = ciel.ambiance;
  const h = ciel.soleil.hauteur;
  const sx = largeur * (0.06 + 0.88 * ciel.soleil.x);
  // De l'horizon au haut du ciel. Sous l'horizon, il plonge d'un rayon par
  // degré : à −2°, il est déjà tout entier derrière les collines, au lieu de
  // rougeoyer en plein ciel une demi-heure avant l'aube.
  const sy = horizon - (Math.max(0, Math.min(58, h)) / 58) * (horizon - 28) + (h < 0 ? -h * a.astre.rayon : 0);
  const lune = ciel.lune;
  // Ombre de la lune : décalée à gauche quand elle croît (éclairée à droite),
  // à droite quand elle décroît ; à la pleine lune, elle ne couvre plus rien.
  const ombreLune = lune < 0.5 ? -4 * 15 * lune : 4 * 15 * (1 - lune);
  return (
    <g aria-hidden>
      <defs>
        <linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a.ciel[0]} />
          <stop offset="0.55" stopColor={a.ciel[1]} />
          <stop offset="1" stopColor={a.ciel[2]} />
        </linearGradient>
        <radialGradient id="lueur-horizon">
          <stop offset="0" stopColor={a.lueur.couleur} stopOpacity={a.lueur.force} />
          <stop offset="0.45" stopColor={a.lueur.couleur} stopOpacity={a.lueur.force * 0.35} />
          <stop offset="1" stopColor={a.lueur.couleur} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="halo-soleil">
          <stop offset="0" stopColor={a.astre.couleur} stopOpacity={a.astre.halo} />
          <stop offset="1" stopColor={a.astre.couleur} stopOpacity={0} />
        </radialGradient>
        <mask id="phase-lune">
          <circle r={15} fill="#fff" />
          <circle r={15.4} cx={ombreLune} fill="#000" />
        </mask>
      </defs>
      <rect width={largeur} height={horizon + 80} fill="url(#ciel)" />
      {a.lueur.force > 0.01 && <ellipse cx={sx} cy={horizon} rx={largeur * 0.62} ry={130} fill="url(#lueur-horizon)" />}
      {a.etoiles > 0.01 && (
        <g opacity={a.etoiles}>
          {Array.from({ length: 34 }, (_, i) => (
            <circle key={i} cx={(i * 97 + 13) % largeur} cy={(i * 53) % 110} r={i % 3 === 0 ? 1.4 : 0.8} fill="#fff" opacity={0.85} className={i % 4 === 0 ? 'scintille' : undefined} style={{ animationDelay: `${(i % 7) * 0.4}s` }} />
          ))}
        </g>
      )}
      {a.lune > 0.01 && (
        <g transform={`translate(${largeur * 0.16} 46)`} opacity={a.lune}>
          {/* La face sombre se devine : un disque à peine visible sous le croissant. */}
          <circle r={15} fill="#f4f1de" opacity={0.1} />
          <circle r={15} fill="#f4f1de" mask="url(#phase-lune)" />
        </g>
      )}
      {h > -2.5 && (
        <g>
          <circle cx={sx} cy={sy} r={a.astre.rayon * 2.8} fill="url(#halo-soleil)" />
          <circle cx={sx} cy={sy} r={a.astre.rayon} fill={a.astre.couleur} />
        </g>
      )}
      {[0, 1, 2].map((i) => (
        // SMIL plutôt qu'une animation CSS : en CSS, la translation de
        // l'animation écraserait la hauteur donnée à chaque nuage.
        <g key={i} transform={`translate(0 ${24 + i * 22})`} opacity={a.nuages.opacite * (i === 2 ? 0.85 : 1)}>
          <g>
            <animateTransform attributeName="transform" type="translate" from="-70 0" to={`${largeur + 70} 0`} dur={`${70 + i * 25}s`} begin={`${-i * 30 - 10}s`} repeatCount="indefinite" />
            <ellipse cx={0} cy={0} rx={22} ry={8} fill={a.nuages.couleur} />
            <ellipse cx={14} cy={-5} rx={14} ry={9} fill={a.nuages.couleur} />
            <ellipse cx={-12} cy={-3} rx={11} ry={7} fill={a.nuages.couleur} />
            {/* Le dessous du nuage prend la couleur de l'horizon. */}
            <ellipse cx={2} cy={4} rx={20} ry={3.4} fill={melanger(a.nuages.couleur, a.lueur.couleur, a.lueur.force * 0.7)} opacity={0.8} />
          </g>
        </g>
      ))}
    </g>
  );
}

interface Promeneur {
  /** Le tour à l'écran : la maison, quelques arrêts au hasard, la maison. */
  chemin: string;
  couleur: string;
  duree: number;
  /** Où en est l'habitant au premier affichage : ils ne partent pas tous ensemble. */
  decalage: number;
}

/** Allure de marche, en pixels d'écran par seconde : un peu différente d'un habitant à l'autre. */
const ALLURE_MIN = 9;
const ALLURE_MAX = 14;

const TENUES = ['#d1553d', '#3d6fd1', '#7a4fc4', '#2f9e7a', '#d19a3d', '#c43d7a'];

/** La petite flèche d'un bâtiment améliorable : elle flotte au-dessus du toit, et un toucher ouvre la fiche (le clic remonte au bâtiment). */
function FlecheAmelioration({ haut }: { haut: number }) {
  return (
    <g transform={`translate(0 ${haut - 14})`} className="fleche-amelioration-pose">
      <g className="fleche-amelioration">
        <title>Tu peux l’améliorer</title>
        <circle r={8.5} fill="#2fae6a" stroke="#fff" strokeWidth={1.6} />
        <path d="M0 -4.4 L4.8 0.9 H1.9 V4.6 H-1.9 V0.9 H-4.8 Z" fill="#fff" />
      </g>
    </g>
  );
}

export interface PropsVillage {
  niveau: number;
  constructions: Construction[];
  actif: boolean;
  ciel: Ciel;
  saison: Saison;
  /** Tenue du personnage principal. */
  apparence?: Apparence;
  /** Passage de niveau en cours : feux d'artifice. */
  fete?: boolean;
  /** Cases où le bâtiment choisi peut être posé (« x,y »). */
  posables?: ReadonlySet<string>;
  /** Bâtiment en cours de pose, montré en transparence sous le pointeur. */
  fantome?: string;
  /** Dernier bâtiment construit ou amélioré, qui « pousse » à son apparition. */
  recent?: string | null;
  /** Les bâtiments qu'on peut améliorer maintenant (identifiants) : chacun porte une petite flèche. */
  ameliorables?: ReadonlySet<string>;
  surCase?: (x: number, y: number) => void;
  surConstruction?: (c: Construction) => void;
  surPersonnage?: () => void;
}

/**
 * La scène. Mémoïsée : le chrono rafraîchit l'écran chaque seconde, et
 * redessiner des centaines de polygones à chaque fois faisait chauffer les
 * téléphones pour rien. Le ciel, lui, change à la minute.
 */
export const Village = memo(function Village({ niveau, constructions, actif, ciel, saison, apparence = APPARENCE_DEFAUT, fete, posables, fantome, recent, ameliorables, surCase, surConstruction, surPersonnage }: PropsVillage) {
  const [survol, setSurvol] = useState<string | null>(null);
  const a = ciel.ambiance;
  const l = useMemo(() => lumierePour(a, ciel.soleil.x), [a, ciel.soleil.x]);
  const p = l.peindre;
  const t = tailleTerrain(niveau);
  const nuit = a.nuit;
  const choix = posables !== undefined;
  // Obscurité de 0 (midi) à 1 (nuit noire) : elle ravive le feu, voile les collines.
  const obscurite = Math.min(1, a.lumiere.force / 0.62);

  const cases: { x: number; y: number }[] = [];
  for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) cases.push({ x, y });
  const occupees = new Set(constructions.map((c) => `${c.x},${c.y}`));
  occupees.add(`${FEU.x},${FEU.y}`);

  // Ordre de peinture : de l'arrière vers l'avant, sinon un bâtiment du fond
  // recouvre celui de devant.
  const objets = [...constructions.map((c) => ({ x: c.x, y: c.y, c })), { x: FEU.x, y: FEU.y, c: null as Construction | null }].sort(
    (u, v) => u.x + u.y - (v.x + v.y) || u.x - v.x,
  );

  const foyers = constructions.filter((c) => !DECOR.has(c.batiment));
  const habitants = Math.min(6, population(constructions) - 1);
  // Chaque habitant a son propre tour, tiré d'une graine : le même à chaque dessin (survol, zoom…), donc sans saccade,
  // et différent d'un habitant à l'autre. Il ne change que si le village change.
  const promeneurs = useMemo((): Promeneur[] => {
    const prises = new Set(constructions.map((c) => `${c.x},${c.y}`));
    prises.add(`${FEU.x},${FEU.y}`);
    const maisons = constructions.filter((c) => !DECOR.has(c.batiment));
    const liste: Promeneur[] = [];
    for (let i = 0; i < habitants && maisons.length > 0; i++) {
      const m = maisons[i % maisons.length];
      const tour = tracerTour({ graine: graine(i, m.x, m.y, t), maison: { x: m.x, y: m.y }, voisins: maisons.filter((v) => v !== m).map((v) => ({ x: v.x, y: v.y })), feu: FEU, taille: t, occupees: prises });
      // La maison se quitte par la porte (un peu plus bas que le centre de la case) ; les arrêts sont au milieu des cases.
      const points = tour.map((c, k) => {
        const { sx, sy } = ecran(c.x, c.y);
        return { x: sx, y: sy + (k === 0 || k === tour.length - 1 ? 10 : 6) };
      });
      const hasard = aleatoire(graine(i, m.x, m.y, 7));
      const duree = Math.max(12, longueurTour(points) / (ALLURE_MIN + hasard() * (ALLURE_MAX - ALLURE_MIN)));
      liste.push({ chemin: points.map((p, k) => `${k === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '), couleur: TENUES[i % TENUES.length], duree, decalage: -hasard() * duree });
    }
    return liste;
  }, [constructions, habitants, t]);

  const largeur = t * DX * 2 + 48;
  const hauteur = t * DY * 2 + 150;
  const ox = largeur / 2;
  const oy = 120;
  const feu = ecran(FEU.x, FEU.y);
  const [survolX, survolY] = (survol ?? '0,0').split(',').map(Number);
  const posSurvol = ecran(survolX, survolY);
  const [herbeA, herbeB] = HERBE[saison].map(p);
  // Au loin, les collines se fondent dans le bas du ciel : un voile léger le
  // jour, des silhouettes la nuit, des reflets roses ou dorés au crépuscule.
  const collineA = melanger(p(COLLINES[saison][0]), a.ciel[2], 0.22 + 0.4 * obscurite + 0.25 * a.lueur.force);
  const collineB = melanger(p(COLLINES[saison][1]), a.ciel[2], 0.1 + 0.28 * obscurite + 0.15 * a.lueur.force);
  // Sur la neige, un contour blanc ne se verrait pas.
  const contourPosable = saison === 'hiver' && obscurite < 0.4 ? '#ff8a3d' : '#fff';
  // Les ombres fuient le soleil et s'allongent quand il est bas ; la nuit,
  // il ne reste que l'ombre douce du pied des murs.
  const fuite = (0.5 - ciel.soleil.x) * 2;
  const longueur = Math.min(14, 3 / Math.max(0.2, Math.tan((Math.max(2, ciel.soleil.hauteur) * Math.PI) / 180)));
  const ombreDx = 3 + fuite * longueur * a.ombre;
  const ombreRx = 22 + Math.abs(fuite) * longueur * 0.6 * a.ombre;
  const ombreOpacite = 0.07 + 0.13 * a.ombre;
  const moment = momentDuCiel(ciel);
  const pose = actif ? 'travail' : nuit ? 'dort' : 'repos';

  return (
    <SaisonContexte.Provider value={saison}>
      <LumiereContexte.Provider value={l}>
        <svg className={`village moment-${moment} saison-${saison}`} viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label={`Ton hameau, niveau ${niveau}, ${NOM_MOMENT[moment]}`}>
          <defs>
            <radialGradient id="halo">
              <stop offset="0" stopColor="#ffcf6b" stopOpacity={0.55} />
              <stop offset="1" stopColor="#ffcf6b" stopOpacity={0} />
            </radialGradient>
            <radialGradient id="lueur-feu">
              <stop offset="0" stopColor="#ffb547" stopOpacity={0.22 + 0.28 * obscurite} />
              <stop offset="1" stopColor="#ffb547" stopOpacity={0} />
            </radialGradient>
          </defs>

          <Firmament ciel={ciel} largeur={largeur} horizon={oy - 14} />

          {/* Collines au loin : elles donnent de la profondeur au plateau. */}
          <path d={`M0 ${oy + 10} Q ${largeur * 0.2} ${oy - 50} ${largeur * 0.45} ${oy - 6} T ${largeur} ${oy - 24} V ${hauteur} H 0 Z`} fill={collineA} />
          <path d={`M0 ${oy + 30} Q ${largeur * 0.35} ${oy - 18} ${largeur * 0.6} ${oy + 14} T ${largeur} ${oy + 2} V ${hauteur} H 0 Z`} fill={collineB} />

          <g transform={`translate(${ox} ${oy})`}>
            {/* Tranche du plateau. */}
            <polygon points={pts([[-t * DX, t * DY - DY], [0, 2 * t * DY - DY], [0, 2 * t * DY - DY + 16], [-t * DX, t * DY - DY + 16]])} fill={l.face('#7a5530', 'gauche')} />
            <polygon points={pts([[0, 2 * t * DY - DY], [t * DX, t * DY - DY], [t * DX, t * DY - DY + 16], [0, 2 * t * DY - DY + 16]])} fill={l.face('#5f4126', 'droite')} />
            <polygon points={pts([[-t * DX, t * DY - DY + 5], [0, 2 * t * DY - DY + 5], [0, 2 * t * DY - DY + 7], [-t * DX, t * DY - DY + 7]])} fill={p('#6b4a2b')} />

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
            <g stroke={p(saison === 'hiver' ? '#c4b59b' : '#d8bd85')} strokeWidth={7} strokeLinecap="round" opacity={0.55} style={{ pointerEvents: 'none' }}>
              {foyers.map((c) => {
                const { sx, sy } = ecran(c.x, c.y);
                return <line key={c.id} x1={feu.sx} y1={feu.sy} x2={sx} y2={sy} />;
              })}
            </g>

            <g style={{ pointerEvents: 'none' }}>{cases.filter(({ x, y }) => !occupees.has(`${x},${y}`)).map(({ x, y }) => <Ornement key={`o${x},${y}`} x={x} y={y} saison={saison} l={l} />)}</g>

            <circle cx={feu.sx} cy={feu.sy - 6} r={actif ? 90 : 55 + 25 * obscurite} fill="url(#lueur-feu)" style={{ pointerEvents: 'none' }} className={actif ? 'lueur' : undefined} />

            {objets.map(({ x, y, c }) => {
              const { sx, sy } = ecran(x, y);
              const cliquable = c !== null && surConstruction !== undefined && !choix;
              return (
                <g
                  key={c ? c.id : 'feu'}
                  data-batiment={c ? c.batiment : 'feu'}
                  transform={`translate(${sx} ${sy})`}
                  className={cliquable ? 'batiment cliquable' : 'batiment'}
                  onClick={cliquable ? () => surConstruction(c) : undefined}
                  style={{ pointerEvents: choix ? 'none' : undefined }}
                >
                  <ellipse cx={ombreDx} cy={3} rx={ombreRx} ry={9} fill={`rgba(20,30,10,${ombreOpacite.toFixed(3)})`} />
                  <g className={c && c.id === recent ? 'pousse' : undefined}>
                    {c ? (
                      <Dessin id={c.batiment} actif={actif} niveau={c.niveau} />
                    ) : (
                      <Feu actif={actif}>
                        {apparence.compagnon !== 'aucun' && (
                          <g transform="translate(-20 6)">
                            <Compagnon id={apparence.compagnon} dort={nuit && !actif} />
                          </g>
                        )}
                        <g
                          transform="translate(22 4)"
                          className={surPersonnage && !choix ? 'personnage cliquable' : 'personnage'}
                          onClick={
                            surPersonnage && !choix
                              ? (e) => {
                                  e.stopPropagation();
                                  surPersonnage();
                                }
                              : undefined
                          }
                        >
                          {/* Zone de toucher plus large que le dessin : sur téléphone, il fait 30 px. */}
                          {surPersonnage && <rect x={-11} y={-36} width={22} height={40} fill="transparent" />}
                          <Personnage apparence={apparence} pose={pose} />
                        </g>
                      </Feu>
                    )}
                  </g>
                  {c && !choix && ameliorables?.has(c.id) && <FlecheAmelioration haut={hautDuBatiment(c.batiment, c.niveau)} />}
                </g>
              );
            })}

            {choix && fantome && survol && posables?.has(survol) && (
              <g transform={`translate(${posSurvol.sx} ${posSurvol.sy})`} opacity={0.6} style={{ pointerEvents: 'none' }}>
                <Dessin id={fantome} actif={false} />
              </g>
            )}

            {/* Les habitants se promènent chacun de leur côté, au hasard, puis rentrent chez eux ; la nuit, ils dorment. */}
            {!nuit &&
              promeneurs.map((m, i) => {
                return (
                  <g key={i} style={{ pointerEvents: 'none' }}>
                    <animateMotion dur={`${m.duree.toFixed(1)}s`} repeatCount="indefinite" path={m.chemin} begin={`${m.decalage.toFixed(1)}s`} />
                    <ellipse cx={0} cy={1} rx={3.5} ry={1.4} fill="rgba(0,0,0,.2)" />
                    <rect x={-2.5} y={-8} width={5} height={8} rx={2} fill={p(m.couleur)} />
                    <circle cx={0} cy={-10.5} r={2.8} fill={p('#f2c9a0')} />
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
          <Particules saison={saison} largeur={largeur} hauteur={hauteur} l={l} />
          {fete && <FeuxDArtifice largeur={largeur} />}
        </svg>
      </LumiereContexte.Provider>
    </SaisonContexte.Provider>
  );
});

/** Le village dans son cadre. */
export function CadreVillage(props: PropsVillage & { pied?: React.ReactNode }) {
  const { pied, ...village } = props;
  return (
    <section className="carte-village">
      <div className="cadre-village">
        <Village {...village} />
      </div>
      <div className="village-outils">
        <span className="pastille" title="Habitants">
          <IconeHabitant /> {population(props.constructions)}
        </span>
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

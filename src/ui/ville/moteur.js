import * as T from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { positionSoleil } from "./soleil";

/**
 * Le moteur de « Ma Ville » : une ville miniature en trois dimensions, dont
 * les quartiers réagissent à ce que disent les données.
 *
 * ── D'où vient ce fichier ───────────────────────────────────────────────
 *
 * C'est le moteur de la page « Ma Ville » d'origine, porté ici presque tel
 * quel : même plan, mêmes bâtiments, même circulation, même jour et nuit à
 * l'heure réelle. Ce qui a changé — le restaurant est devenu la boutique de
 * cartes, le parc et la maison se touchent, une bibliothèque a remplacé un
 * îlot de maisons, et la ville ne décide plus rien : elle reçoit des signaux
 * déjà calculés (`etat.ts`).
 *
 * ── Pourquoi du JavaScript dans un dépôt TypeScript ─────────────────────
 *
 * Neuf cents lignes de géométrie écrites serré, où presque chaque variable
 * est un nombre ou une matrice. Les typer une à une n'aurait rien appris au
 * compilateur et aurait obligé à réécrire un moteur qui fonctionne. Ce que
 * le reste de l'application a besoin de savoir — ce que la ville accepte et
 * ce qu'elle rend — est déclaré dans `moteur.d.ts`, et c'est par là que
 * TypeScript la connaît.
 *
 * ── Chargé à la demande ─────────────────────────────────────────────────
 *
 * three pèse plusieurs centaines de kilo-octets. Ce module n'est importé que
 * par un `import()` au moment où la ville s'affiche : qui reste sur l'accueil
 * classique ne le télécharge jamais.
 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RAD = Math.PI / 180;
/*
  three ne multiplie plus l'intensité des lumières par pi. Les valeurs du
  moteur ont été réglées quand il le faisait : on rend ce facteur, plutôt que
  de retoucher chaque intensité à l'œil.
*/
const LUM = Math.PI;

/*
  La ville d'avant les paliers : tout bâti, sans les nouveautés. Sert quand
  aucune progression n'est donnée (aperçus, outils), pour ne jamais montrer un
  terrain vague par accident.
*/
const VILLE_COMPLETE = {
  heures: 0,
  quartiers: { tower: 3, bank: 3, shop: 3, uni: 3, plaza: 3, library: 3, park: 3, home: 3 },
  routes: 2,
  eclairage: 1,
  feux: false,
  arbres: 6,
  decor: 4,
  vehicules: ["citadines", "camion", "bus"],
  parc: ["bancs", "canards"],
  ambiance: [],
  franchis: 1,
  total: 1,
};

/*
  Un rendu logiciel — pas de carte graphique, ou une carte écartée par le
  navigateur — calcule chaque pixel au processeur (SwiftShader, llvmpipe).
  RENDERER donne le vrai nom dans les navigateurs récents ; l'extension de
  débogage n'est interrogée que s'il est masqué, car Firefox la signale comme
  dépréciée dans la console.
*/
function rendusLogiciel(renderer) {
  try {
    const gl = renderer.getContext();
    let nom = String(gl.getParameter(gl.RENDERER) || "");
    if (/^webkit webgl$/i.test(nom)) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) nom = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
    }
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(nom);
  } catch {
    return false;
  }
}

export function creerVille(host, pinEls, onPick, progression, reglages) {
  /*
    Ce qui est bâti vient d'un seul objet, calculé hors d'ici (`progression.ts`,
    vérifié par ses tests). Le moteur ne décide d'aucun palier : il dessine ce
    qu'on lui dit, et la ville est reconstruite entière quand un palier tombe.
  */
  const PV = progression || VILLE_COMPLETE;
  const NQ = PV.quartiers;
  const aVehicule = (k) => PV.vehicules.includes(k);
  const aParc = (k) => PV.parc.includes(k);
  const aAmbiance = (k) => PV.ambiance.includes(k);
  const avance = PV.total ? PV.franchis / PV.total : 1;
  /* une ville dans une carte (Hameau) se cadre plus serré qu'une ville en plein écran (Sillage) */
  const cadrage = (reglages && reglages.cadrage) || 1;
  /*
    Les couleurs de la palette sont écrites en sRGB, telles qu'à l'écran ;
    three les passe en linéaire pour calculer la lumière, puis les rend en
    sRGB. Calculer l'éclairage directement sur des couleurs d'écran (l'ancien
    rendu) tirait les faces à l'ombre vers un gris boueux et rendait les
    reflets faux. Le tone mapping « neutre » garde les teintes de la palette
    et n'arrondit que les hautes lumières : verre au soleil, or, lampes.
  */
  T.ColorManagement.enabled = true;
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  /*
    Au processeur, matières physiques et ombres font tomber la ville à deux
    images par seconde : plus rien ne s'y vise. On y dessine la version
    légère (matières simples, sans ombres ni reflets), qui reste fluide.
  */
  const qualite = reglages && reglages.qualite;
  const legere = qualite === "legere" || (qualite !== "complete" && rendusLogiciel(renderer));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  const small =
    Math.min(window.innerWidth, window.innerHeight) < 720 || (navigator.maxTouchPoints || 0) > 1;
  renderer.setPixelRatio(legere ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !legere;
  renderer.shadowMap.type = T.PCFShadowMap;
  if (small) renderer.shadowMap.autoUpdate = false;
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
  /*
    Une brume légère sur le lointain : la ville a une profondeur, les îlots du
    fond s'effacent un peu dans la couleur de l'horizon au lieu d'être aussi
    nets que ceux de devant.
  */
  scene.fog = new T.Fog(0xf1efe4, 240, 560);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 1, 600);

  /* hasard à graine : la même ville à chaque visite */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = rng(20261113);
  const rr = (a, b) => a + (b - a) * R();
  const pick = (arr) => arr[Math.floor(R() * arr.length)];

  const C = {
    road: 0xd7dae1,
    pave: 0xedede8,
    /* une herbe de printemps, plus franche que le vert d'eau d'avant : c'est elle qui dit « nature » */
    lawn: 0xcfe6bd,
    plaza: 0xf3eddf,
    plaza2: 0xfaf6ec,
    white: 0xf6f5f0,
    wall: 0xf8f7f2,
    roof: 0xe8ebf1,
    blue: 0x2f49d1,
    blue2: 0x4f6bea,
    teal: 0x3ec79a,
    teal2: 0x27a97f,
    violet: 0x8e63ee,
    violet2: 0x6f47d6,
    orange: 0xf2924a,
    yellow: 0xf6c445,
    pink: 0xf27fa3,
    trunk: 0xb7a994,
    /* des feuillages de plusieurs verts, du tendre au sapin : un seul vert menthe faisait des arbres en plastique */
    leaf: [0x74c487, 0x63b479, 0x8fcf88, 0x55a56f, 0x9ccb76],
    pine: [0x3f9467, 0x4a8b5e, 0x568f62],
    dark: 0x2b3158,
    metal: 0xbfc4cf,
    water: 0x8fd0f5,
    gold: 0xf2c037,
    glass: 0xcfe0f4,
    wood: 0xcba57e,
    tire: 0x2e3350,
    panel: 0x2a3a9a,
  };
  const SLAB = 32.5,
    CURB = 0.14,
    RX = [-26, -13, 0, 13, 26],
    CELLS = [
      [-24.5, -14.5],
      [-11.5, -1.5],
      [1.5, 11.5],
      [14.5, 24.5],
    ];
  const BC = [-19.5, -6.5, 6.5, 19.5],
    RING = 27.5,
    NN = RX.length; // centres des îlots, bord intérieur de la couronne, routes par axe
  const PLX = BC[1],
    PLZ = BC[1],
    BKX = BC[3],
    BKZ = BC[1],
    UNX = BC[1],
    UNZ = BC[3],
    RSX = BC[2],
    RSZ = BC[2],
    PKX = BC[3],
    PKZ = BC[3],
    TWX = BC[0],
    TWZ = BC[0];
  /*
    ---- le plan des rues

    En damier, chaque îlot était cerné de sa rue : seize carrés pareils. Des
    îlots voisins sont maintenant soudés en terres d'un seul tenant : toute la
    campagne au nord et à l'ouest (bois, champs, verger, étang, la maison, les
    jardins), le grand parc au sud-est avec la bibliothèque et les maisons qui
    le bordent, et deux rues piétonnes dans le centre. Il reste deux places
    carrées, deux longs îlots, un L et une grande terre en équerre ; les
    voitures, les feux, les passages et les réverbères ne suivent que les rues
    qui restent. Aucune n'est une impasse : chaque carrefour a au moins deux
    sorties.

    [colonne, rangée, colonne, rangée, sol] : deux îlots voisins réunis ; le
    sol de la soudure est de l'herbe (campagne, parc) ou du pavé (rue piétonne).
  */
  const SOUDURES = [
    [0, 0, 1, 0, "herbe"],
    [1, 0, 2, 0, "herbe"],
    [2, 0, 3, 0, "herbe"],
    [0, 0, 0, 1, "herbe"],
    [0, 1, 0, 2, "herbe"],
    [0, 2, 0, 3, "herbe"],
    [2, 3, 3, 3, "herbe"],
    [3, 2, 3, 3, "herbe"],
    [2, 1, 3, 1, "pave"],
    [1, 2, 1, 3, "pave"],
  ];
  /* la route qui séparait deux îlots soudés : entre deux nœuds voisins du quadrillage */
  const cleRue = (i, j, i2, j2) =>
    i * 5 + j < i2 * 5 + j2 ? `${i},${j},${i2},${j2}` : `${i2},${j2},${i},${j}`;
  /*
    Au nord et à l'ouest, plus de route de ceinture : la campagne court
    jusqu'au bord de la maquette, autour des fermes de la couronne. La ville et
    ses rues se tiennent au sud-est. (Avec elles partent les deux bouts de
    ceinture qui n'auraient plus mené nulle part.)
  */
  const CEINTURE_OTEE = [
    [0, 0, 1, 0],
    [1, 0, 2, 0],
    [2, 0, 3, 0],
    [3, 0, 4, 0],
    [0, 0, 0, 1],
    [0, 1, 0, 2],
    [0, 2, 0, 3],
    [0, 3, 0, 4],
    [4, 0, 4, 1],
    [0, 4, 1, 4],
  ];
  const coupees = new Set([
    ...SOUDURES.map(([i, j, i2]) =>
      i2 !== i ? cleRue(i + 1, j, i + 1, j + 1) : cleRue(i, j + 1, i + 1, j + 1),
    ),
    ...CEINTURE_OTEE.map(([i, j, i2, j2]) => cleRue(i, j, i2, j2)),
  ]);
  const rue = (i, j, i2, j2) => !coupees.has(cleRue(i, j, i2, j2));
  const VOISINS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  /*
    Les îlots tels qu'on en fait le tour à pied : les soudures réunissent des
    cases. Un îlot rectangulaire est bordé de rues sur ses quatre côtés, on
    marche sur son trottoir ; la campagne en équerre et le parc en L n'ont pas
    de trottoir tout autour, les passants n'y tournent pas.
  */
  const ILOTS = (() => {
    const chef = Array.from({ length: 16 }, (_, k) => k);
    const trouver = (k) => (chef[k] === k ? k : (chef[k] = trouver(chef[k])));
    for (const [i, j, i2, j2] of SOUDURES) chef[trouver(i * 4 + j)] = trouver(i2 * 4 + j2);
    const groupes = new Map();
    for (let k = 0; k < 16; k++) groupes.set(trouver(k), [...(groupes.get(trouver(k)) || []), k]);
    return [...groupes.values()]
      .map((cases) => {
        const is = cases.map((k) => Math.floor(k / 4)),
          js = cases.map((k) => k % 4);
        const i0 = Math.min(...is),
          i1 = Math.max(...is),
          j0 = Math.min(...js),
          j1 = Math.max(...js);
        return {
          i0,
          i1,
          j0,
          j1,
          cases: cases.length,
          rectangle: (i1 - i0 + 1) * (j1 - j0 + 1) === cases.length,
        };
      })
      .filter((g) => g.rectangle);
  })();
  const sorties = (i, j) =>
    VOISINS.filter(([di, dj]) => {
      const a = i + di,
        b2 = j + dj;
      return a >= 0 && a < NN && b2 >= 0 && b2 < NN && rue(i, j, a, b2);
    }).length;

  /* ---- géométries unitaires (toutes non indexées, pour pouvoir être fusionnées) */
  function prismGeo() {
    const A = [-0.5, 0, -0.5],
      B = [0.5, 0, -0.5],
      Cc = [0, 1, -0.5],
      D = [-0.5, 0, 0.5],
      E = [0.5, 0, 0.5],
      F = [0, 1, 0.5];
    const tris = [A, D, F, A, F, Cc, B, Cc, F, B, F, E, D, E, F, B, A, Cc, A, B, E, A, E, D];
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(tris.flat(), 3));
    g.computeVertexNormals();
    return g;
  }
  function facettes(g) {
    g.computeVertexNormals();
    return g;
  }
  function pyrGeo() {
    const g = new T.ConeGeometry(Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4).toNonIndexed();
    g.computeVertexNormals();
    g.translate(0, 0.5, 0);
    return g;
  }
  const G = {
    box: new T.BoxGeometry(1, 1, 1).toNonIndexed(),
    cyl: new T.CylinderGeometry(0.5, 0.5, 1, 16).toNonIndexed(),
    cyl8: new T.CylinderGeometry(0.5, 0.5, 1, 8).toNonIndexed(),
    sph: new T.IcosahedronGeometry(0.5, 1),
    sph2: new T.IcosahedronGeometry(0.5, 2),
    cone: new T.ConeGeometry(0.5, 1, 10).toNonIndexed().translate(0, 0.5, 0),
    quad: new T.PlaneGeometry(1, 1).toNonIndexed(),
    prism: prismGeo(),
    pyr: pyrGeo(),
    cyl12: new T.CylinderGeometry(0.5, 0.5, 1, 12).toNonIndexed(),
    /* à facettes : chaque face garde sa normale, comme taillée */
    blob: facettes(new T.IcosahedronGeometry(0.5, 1)),
    pin: facettes(new T.ConeGeometry(0.5, 1, 7).toNonIndexed().translate(0, 0.5, 0)),
    tronc: facettes(new T.CylinderGeometry(0.32, 0.5, 1, 6).toNonIndexed()),
    /* la nature semée : des formes de quelques triangles, posées par centaines */
    caillou: facettes(new T.IcosahedronGeometry(0.5, 0)),
    oct: new T.OctahedronGeometry(0.5, 0),
    brin: facettes(new T.ConeGeometry(0.5, 1, 4, 1, true).toNonIndexed().translate(0, 0.5, 0)),
    disque: new T.CylinderGeometry(0.5, 0.5, 1, 7).toNonIndexed(),
  };

  /* ---- fusion : des milliers de petites formes deviennent une poignée d'appels de dessin */
  const _v = new T.Vector3(),
    _nm = new T.Matrix3(),
    _col = new T.Color();
  class Batch {
    /*
      `ombre` assombrit le pied des faces verticales, là où la lumière du ciel
      n'atteint pas l'angle entre un mur et le sol. Sans cette occlusion, un
      bâtiment paraît posé sur la dalle au lieu d'y être ancré. Elle est
      calculée une fois, à la fusion : elle ne coûte rien au rendu.

      `or` et `verre` : les lots où renvoyer ces deux couleurs. Fondues dans
      une matière mate, elles ne brillaient pas ; dans la leur, elles
      reflètent le ciel.
    */
    constructor(opt) {
      this.p = [];
      this.n = [];
      this.c = [];
      this.ombre = !!(opt && opt.ombre);
      this.or = (opt && opt.or) || null;
      this.verre = (opt && opt.verre) || null;
    }
    add(geo, m, color) {
      const pos = geo.attributes.position,
        nor = geo.attributes.normal;
      _nm.getNormalMatrix(m);
      _col.set(color);
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(m);
        const y = _v.y;
        this.p.push(_v.x, _v.y, _v.z);
        _v.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
        this.n.push(_v.x, _v.y, _v.z);
        let f = 1;
        if (this.ombre && Math.abs(_v.y) < 0.55) {
          const t = clamp((y - CURB) / 0.7, 0, 1);
          f = 0.62 + 0.38 * t * t * (3 - 2 * t);
        }
        this.c.push(_col.r * f, _col.g * f, _col.b * f);
      }
    }
    mesh(mat, cast, receive) {
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(this.p, 3));
      g.setAttribute("normal", new T.Float32BufferAttribute(this.n, 3));
      g.setAttribute("color", new T.Float32BufferAttribute(this.c, 3));
      const m = new T.Mesh(g, mat);
      m.castShadow = !!cast;
      m.receiveShadow = receive !== false;
      this.p = this.n = this.c = null;
      return m;
    }
  }
  const I4 = new T.Matrix4();
  const _l = new T.Matrix4(),
    _w = new T.Matrix4(),
    _p = new T.Vector3(),
    _q = new T.Quaternion(),
    _s = new T.Vector3(),
    _e = new T.Euler();
  const place = (x, z, ry, y) => new T.Matrix4().makeRotationY(ry || 0).setPosition(x, y || 0, z);
  /*
    ---- les emprises

    Tout ce qui est posé pendant la construction (bâtiment, arbre, banc,
    allée, bassin, potager) marque une grille du sol. La nature semée à la fin
    — touffes, fleurs, buissons, cailloux — ne pousse que dans les cases
    restées libres : sans ce registre, un buisson sortait d'une allée ou d'un
    étang, et il aurait fallu tenir à la main, pour chaque quartier et chaque
    palier, la liste des places encore vides.
  */
  const GR = 0.5,
    GO = 36,
    GN = Math.ceil((2 * GO) / GR);
  const occupe = new Uint8Array(GN * GN);
  let suivi = true;
  const _bw = new T.Box3();
  const caseDe = (v) => clamp(Math.floor((v + GO) / GR), 0, GN - 1);
  function marquer(x0, z0, x1, z1) {
    const i1 = caseDe(x1),
      j0 = caseDe(z0),
      j1 = caseDe(z1);
    for (let i = caseDe(x0); i <= i1; i++) for (let j = j0; j <= j1; j++) occupe[i * GN + j] = 1;
  }
  /* libre à r près : la case du point et ses voisines dans ce rayon */
  function libre(x, z, r) {
    const i1 = caseDe(x + r),
      j0 = caseDe(z - r),
      j1 = caseDe(z + r);
    for (let i = caseDe(x - r); i <= i1; i++)
      for (let j = j0; j <= j1; j++) if (occupe[i * GN + j]) return false;
    return true;
  }
  function emprise(b, geo, m) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    _bw.copy(geo.boundingBox).applyMatrix4(m);
    // un auvent, un toit ou une guirlande en hauteur ne gêne pas une touffe au sol
    if (_bw.min.y > CURB + 1.0) return;
    // les grands aplats (pelouses, dalle, couronne, îlots) ne sont pas des obstacles : c'est là qu'on sème
    if (b === B.ground && (_bw.max.x - _bw.min.x) * (_bw.max.z - _bw.min.z) > 30) return;
    marquer(_bw.min.x, _bw.min.z, _bw.max.x, _bw.max.z);
  }
  function put(b, geo, P, x, y, z, sx, sy, sz, color, ry, rx, rz) {
    if (color === C.gold && b.or) b = b.or;
    else if (color === C.glass && b.verre) b = b.verre;
    else if (color === C.water && b.eau) b = b.eau;
    _e.set(rx || 0, ry || 0, rz || 0, "YXZ");
    _l.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
    _w.multiplyMatrices(P, _l);
    if (suivi) emprise(b, geo, _w);
    b.add(geo, _w, color);
  }
  /* un tirage fixe attaché à une position : le même à chaque construction, quel que soit le palier */
  const h01 = (x, z, k) => {
    const s = Math.sin(x * 12.9898 + z * 78.233 + (k || 0) * 37.719) * 43758.5453;
    return s - Math.floor(s);
  };
  const bx = (b, P, x, y0, z, w, h, d, col, ry) =>
    put(b, G.box, P, x, y0 + h / 2, z, w, h, d, col, ry || 0);
  const cy = (b, P, x, y0, z, r, h, col, geo) =>
    put(b, geo || G.cyl, P, x, y0 + h / 2, z, r * 2, h, r * 2, col);
  const sp = (b, P, x, y, z, r, col, geo) =>
    put(b, geo || G.sph, P, x, y, z, r * 2, r * 2, r * 2, col);
  /*
    Les volumes à arêtes cassées. Une boîte aux arêtes vives n'a que trois
    teintes ; un chanfrein accroche la lumière sur chaque arête, et c'est ce
    liseré clair qui fait lire un volume comme un objet modelé plutôt que
    comme un cube de démonstration. Le pied reste à angle droit : posé sur le
    sol, un chanfrein y creuserait une rainure sombre.
  */
  const _chanfreins = new Map();
  function geoChanfrein(w, h, d) {
    const k = w.toFixed(3) + "|" + h.toFixed(3) + "|" + d.toFixed(3);
    let g = _chanfreins.get(k);
    if (!g) {
      const r = clamp(Math.min(w, h, d) * 0.08, 0.015, 0.075),
        a = w / 2,
        b = h / 2,
        c = d / 2,
        pts = [];
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          pts.push(
            new T.Vector3(sx * a, -b, sz * (c - r)),
            new T.Vector3(sx * (a - r), -b, sz * c),
            new T.Vector3(sx * a, b - r, sz * (c - r)),
            new T.Vector3(sx * (a - r), b, sz * (c - r)),
            new T.Vector3(sx * (a - r), b - r, sz * c),
          );
      g = new ConvexGeometry(pts);
      _chanfreins.set(k, g);
    }
    return g;
  }
  const bxc = (b, P, x, y0, z, w, h, d, col, ry) =>
    Math.min(w, h, d) < 0.12
      ? bx(b, P, x, y0, z, w, h, d, col, ry)
      : put(b, geoChanfrein(w, h, d), P, x, y0 + h / 2, z, 1, 1, 1, col, ry || 0);

  /* ---- matières */
  /*
    ---- matières

    Des matières physiques (rugosité, métal) plutôt que des aplats : le verre,
    l'eau, l'or et la carrosserie reflètent le ciel et prennent un reflet de
    soleil ; le reste reste mat, comme du plâtre ou de la peinture de maquette.
  */
  const mat = (o) => {
    if (!legere) return new T.MeshStandardMaterial({ roughness: 0.88, metalness: 0, ...o });
    const simple = {};
    for (const k in o)
      if (k !== "roughness" && k !== "metalness" && k !== "envMap") simple[k] = o[k];
    return new T.MeshLambertMaterial(simple);
  };
  const matStatic = mat({ vertexColors: true });
  const matGround = mat({ vertexColors: true, roughness: 0.96 });
  /* terre battue, puis pavés, puis goudron : la chaussée dit l'âge de la ville */
  const matSlab = mat({
    color: PV.routes >= 2 ? C.road : PV.routes === 1 ? 0xcfc9be : 0xd9c8a6,
    roughness: 0.94,
  });
  const matFlamme = mat({ color: 0xf6a23a, emissive: 0xff7a1a, emissiveIntensity: 0.9 });
  const matFeuA = new T.MeshBasicMaterial({ color: 0x27a97f });
  const matFeuB = new T.MeshBasicMaterial({ color: 0xe5484d });
  const matWinA = mat({ color: 0xeef4fc, roughness: 0.22, metalness: 0.1 });
  const matWinB = mat({ color: 0xd3dff3, roughness: 0.16, metalness: 0.2 });
  const matGlass = mat({ color: 0x86b4e0, roughness: 0.1, metalness: 0.25 });
  const matLamp = mat({ color: 0xf4f4ee, roughness: 0.35 });
  const matHead = mat({ color: 0xf7f7f0, roughness: 0.3 });
  const matGold = mat({ color: C.gold, roughness: 0.28, metalness: 0.85 });
  const matCloud = mat({ color: 0xffffff, roughness: 1 });
  const matStorm = mat({ color: 0x9aa2bc, roughness: 1 });
  const matClock = mat({ color: 0xffffff, roughness: 0.6 });
  const matDark = mat({ color: C.dark, roughness: 0.6 });
  const matDrop = mat({ color: 0xcfeefd, roughness: 0.08, metalness: 0.1 });
  const matFlag = mat({ color: C.yellow, side: T.DoubleSide });
  const matPed = mat({ color: 0xffffff, roughness: 0.92 });
  const matSkin = mat({ color: 0xffffff, roughness: 0.75 });
  const matWater = mat({ color: C.water, roughness: 0.05, metalness: 0.08 });
  const matCar = mat({ vertexColors: true, roughness: 0.36, metalness: 0.12 });

  /*
    ---- le ciel qu'on reflète

    Une matière brillante sans rien à refléter paraît noire ou plate. Un
    dégradé peint une fois — ciel, horizon clair, sol — suffit au verre, à
    l'eau et à l'or d'une ville en maquette ; son intensité suit le jour.
  */
  const refletants = [
    [matWinA, 0.9],
    [matWinB, 1.1],
    [matGlass, 1.25],
    [matGold, 1.1],
    [matWater, 1.2],
    [matCar, 0.75],
    [matDrop, 1],
  ];
  const envTex = legere
    ? null
    : (() => {
        const pm = new T.PMREMGenerator(renderer),
          sc = new T.Scene(),
          geo = new T.SphereGeometry(10, 48, 24),
          pos = geo.attributes.position,
          cols = [],
          haut = new T.Color(0x86ade4),
          horizon = new T.Color(0xfbf6ec),
          sol = new T.Color(0x8d8f86),
          c = new T.Color();
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i) / 10;
          if (y >= 0) c.copy(horizon).lerp(haut, Math.pow(y, 0.55));
          else c.copy(horizon).lerp(sol, Math.pow(-y, 0.35));
          cols.push(c.r, c.g, c.b);
        }
        geo.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
        const m = new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide });
        sc.add(new T.Mesh(geo, m));
        const t = pm.fromScene(sc, 0.04).texture;
        pm.dispose();
        geo.dispose();
        m.dispose();
        return t;
      })();
  if (envTex) for (const [m] of refletants) m.envMap = envTex;

  const B = {
    ground: new Batch(),
    winA: new Batch(),
    winB: new Batch(),
    lamp: new Batch(),
    glass: new Batch(),
    gold: new Batch(),
    water: new Batch(),
    car: new Batch({ ombre: false }),
  };
  B.main = new Batch({ ombre: true, or: B.gold, verre: B.glass });
  /* l'eau du sol (bassins, étang, piscine) va dans sa matière, qui reflète le ciel */
  B.ground.eau = B.water;
  B.ground.or = B.gold;

  /* ---- pièces réutilisables */
  const CADRE = 0xfbfaf5,
    PORTE = 0x55607a,
    LAMPADAIRE = 0x3b4256;
  const _c3 = new T.Color();
  /* une teinte plus sombre (k < 1) ou plus claire (k > 1), calculée en linéaire */
  const teinte = (c, k) => _c3.set(c).multiplyScalar(k).getHex();
  /*
    Une fenêtre : un vitrage et, quand le mur peut les porter, un cadre clair
    et un appui qui dépasse. Ce petit relief fait d'un quadrillage de carrés
    une façade : sans lui, les fenêtres semblaient peintes sur le mur.
  */
  function fenetre(vitre, cadre, P, x, y, z, ry, w, h) {
    const ox = Math.sin(ry),
      oz = Math.cos(ry);
    if (cadre) {
      put(cadre, G.quad, P, x + ox * 0.012, y, z + oz * 0.012, w + 0.1, h + 0.1, 1, CADRE, ry);
      put(
        cadre,
        G.box,
        P,
        x + ox * 0.04,
        y - h / 2 - 0.05,
        z + oz * 0.04,
        w + 0.16,
        0.045,
        0.08,
        CADRE,
        ry,
      );
    }
    put(vitre, G.quad, P, x + ox * 0.018, y, z + oz * 0.018, w, h, 1, 0xffffff, ry);
  }
  function windowsOn(wb, P, w, d, y0, floors, fh, rand, opt) {
    const faces = (opt && opt.faces) || [0, 1, 2, 3];
    for (const f of faces) {
      const span = f < 2 ? w : d,
        n = Math.max(1, Math.floor((span - 0.35) / 0.85)),
        step = span / n;
      for (let fl = 0; fl < floors; fl++) {
        const y = y0 + fl * fh + fh * 0.55;
        for (let i = 0; i < n; i++) {
          const t = -span / 2 + step * (i + 0.5),
            b = rand() < 0.6 ? wb.A : wb.B;
          if (opt && opt.skip && opt.skip(f, fl, t)) continue;
          if (f === 0) fenetre(b, wb.M, P, t, y, d / 2, 0, 0.44, 0.46);
          else if (f === 1) fenetre(b, wb.M, P, t, y, -d / 2, Math.PI, 0.44, 0.46);
          else if (f === 2) fenetre(b, wb.M, P, w / 2, y, t, Math.PI / 2, 0.44, 0.46);
          else fenetre(b, wb.M, P, -w / 2, y, t, -Math.PI / 2, 0.44, 0.46);
        }
      }
    }
  }
  const WIN = { A: B.winA, B: B.winB, M: B.main };
  /* le muret qui borde un toit-terrasse : un toit plat sans lui n'est qu'un couvercle */
  function acrotere(b, P, x, y, z, w, d, h, t, col) {
    bx(b, P, x, y, z + d / 2 - t / 2, w, h, t, col);
    bx(b, P, x, y, z - d / 2 + t / 2, w, h, t, col);
    bx(b, P, x + w / 2 - t / 2, y, z, t, h, d - 2 * t, col);
    bx(b, P, x - w / 2 + t / 2, y, z, t, h, d - 2 * t, col);
  }
  /*
    Les arbres : un tronc effilé et un houppier de trois masses à facettes, de
    trois tons, plutôt qu'une boule lisse ; les pins en trois étages. Les
    facettes accrochent la lumière comme les arêtes des bâtiments.
  */
  function tree(x, z, y0, s, pine) {
    s = s || 1;
    put(B.main, G.tronc, I4, x, y0 + 0.3 * s, z, 0.15 * s, 0.6 * s, 0.15 * s, C.trunk);
    if (pine) {
      const c = pick(C.pine);
      put(B.main, G.pin, I4, x, y0 + 0.3 * s, z, 1.1 * s, 0.82 * s, 1.1 * s, teinte(c, 0.9));
      put(B.main, G.pin, I4, x, y0 + 0.68 * s, z, 0.86 * s, 0.74 * s, 0.86 * s, c, 0.45);
      put(
        B.main,
        G.pin,
        I4,
        x,
        y0 + 1.02 * s,
        z,
        0.58 * s,
        0.66 * s,
        0.58 * s,
        teinte(c, 1.12),
        0.9,
      );
    } else {
      const c = pick(C.leaf),
        a = R() * 6.28,
        ca = Math.cos(a),
        sa = Math.sin(a);
      put(B.main, G.blob, I4, x, y0 + 0.95 * s, z, 1.02 * s, 0.94 * s, 1.02 * s, c, a);
      put(
        B.main,
        G.blob,
        I4,
        x + ca * 0.3 * s,
        y0 + 0.8 * s,
        z + sa * 0.3 * s,
        0.66 * s,
        0.6 * s,
        0.66 * s,
        teinte(c, 0.86),
        a + 1,
      );
      put(
        B.main,
        G.blob,
        I4,
        x - ca * 0.18 * s,
        y0 + 1.22 * s,
        z - sa * 0.18 * s,
        0.6 * s,
        0.54 * s,
        0.6 * s,
        teinte(c, 1.1),
        a + 2,
      );
    }
  }
  /*
    Les arbres des rues et de la couronne arrivent par lots. Chacun a sa place
    fixe et un rang tiré de sa position : un lot de plus ajoute des arbres sans
    jamais en déplacer un déjà planté.
  */
  function arbre(x, z, y0, s, pine) {
    const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    if (h < PV.arbres / 6) tree(x, z, y0, s, pine);
  }
  /*
    Les arbres de la campagne (bosquets, bords d'étang, haies d'arbres) : une
    partie pousse d'elle-même avant qu'on plante quoi que ce soit, le reste
    vient avec les lots. Même règle que les arbres des rues : un arbre déjà là
    ne bouge jamais quand un lot s'ajoute.
  */
  function arbreSauvage(x, z, y0, s, pine) {
    const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    if (h < (PV.arbres + 1.5) / 6) tree(x, z, y0, s, pine);
  }

  /*
    ---- la petite nature

    Une pelouse d'une seule couleur, c'est un tapis : les touffes, les fleurs
    sauvages, les buissons, les cailloux et les nuances d'herbe en font un pré.
    Tout est fait de formes de quelques triangles et fondu dans les lots fixes :
    des centaines de pièces pour presque rien au rendu.
  */
  const HERBE = [0x8cc275, 0x7bb66a, 0x9fcd7f, 0x6fab61];
  const FLEURS = [0xffffff, 0xf6d55c, 0xb9a3e3, 0xf4a6c0, 0xe5574b, 0x8fb3e8, 0xf7efe0];
  const FEUILLU = [0x5fae6b, 0x6db873, 0x4f9b60, 0x7cbf6c];
  function touffe(x, z, y0, s, r) {
    for (let k = 0; k < 3; k++) {
      const a = r() * 6.28,
        d = 0.05 + r() * 0.07;
      put(
        B.main,
        G.brin,
        I4,
        x + Math.cos(a) * d * s,
        y0,
        z + Math.sin(a) * d * s,
        0.09 * s,
        (0.2 + r() * 0.16) * s,
        0.09 * s,
        HERBE[Math.floor(r() * HERBE.length)],
        a,
        (r() - 0.5) * 0.5,
        (r() - 0.5) * 0.5,
      );
    }
  }
  function fleurs3(x, z, y0, r) {
    const c = FLEURS[Math.floor(r() * FLEURS.length)],
      n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = r() * 6.28,
        d = 0.06 + r() * 0.16,
        fx = x + Math.cos(a) * d,
        fz = z + Math.sin(a) * d,
        h = 0.12 + r() * 0.08;
      put(B.main, G.brin, I4, fx, y0, fz, 0.035, h, 0.035, 0x6fab61);
      put(B.main, G.oct, I4, fx, y0 + h, fz, 0.09, 0.07, 0.09, r() < 0.8 ? c : 0xf6d55c, a);
    }
  }
  function buisson(x, z, y0, s, r) {
    const c = FEUILLU[Math.floor(r() * FEUILLU.length)];
    const n = 2 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const a = r() * 6.28,
        d = k ? 0.18 * s : 0,
        t = (0.42 + r() * 0.2) * s;
      put(
        B.main,
        G.caillou,
        I4,
        x + Math.cos(a) * d,
        y0 + t * 0.34,
        z + Math.sin(a) * d,
        t,
        t * 0.78,
        t,
        teinte(c, 0.92 + r() * 0.2),
        a,
      );
    }
  }
  function caillou(x, z, y0, s, r) {
    const t = (0.22 + r() * 0.2) * s;
    put(
      B.main,
      G.caillou,
      I4,
      x,
      y0 + t * 0.18,
      z,
      t * 1.2,
      t * 0.65,
      t,
      r() < 0.5 ? 0xc9c3b6 : 0xb8b2a6,
      r() * 6.28,
    );
  }
  /* une nuance d'herbe au sol : plus claire ou plus sombre, jamais un motif */
  function tache(x, z, y0, rx, rz, col, a) {
    put(B.ground, G.disque, I4, x, y0 + 0.003, z, rx * 2, 0.004, rz * 2, col, a);
  }
  /* les pelouses où semer à la fin (rectangles du sol, avec la densité voulue) */
  const zones = [];
  /* k : densité de la nature semée ; f : la part de fleurs (une prairie en a beaucoup plus qu'un jardin) */
  const zone = (x0, z0, x1, z1, k, f) => zones.push({ x0, z0, x1, z1, k: k ?? 1, f: f ?? 1 });
  /* le réverbère : un socle, un fût sombre, un chapeau au-dessus du globe */
  const lampes = [];
  function lamp(x, z, y0) {
    if (PV.eclairage < 1) return;
    lampes.push([x, y0, z]);
    cy(B.main, I4, x, y0, z, 0.075, 0.14, LAMPADAIRE, G.cyl8);
    cy(B.main, I4, x, y0, z, 0.032, 1.74, LAMPADAIRE, G.cyl8);
    put(B.main, G.cone, I4, x, y0 + 1.86, z, 0.36, 0.16, 0.36, LAMPADAIRE);
    sp(B.lamp, I4, x, y0 + 1.78, z, 0.1, 0xffffff);
  }
  /*
    Les maisons des voisins. Six fois la même maisonnette côte à côte faisait
    un lotissement de jouets : chacune tire maintenant, de sa place, sa forme
    (chaumière, longère avec appentis, maison à étage, pavillon à croupe), son
    enduit, ses volets, et un bout de jardin devant (allée, clôture ou haie).
    Toujours la même maison à la même place : rien ne change d'une visite à
    l'autre.
  */
  const ENDUITS = [0xf6efe0, 0xefe2c8, 0xf3e3d3, 0xe9e4d8, 0xf1dbb8, 0xe6dccb, 0xf8f5ee];
  const VOLETS = [0x8aa58a, 0x7d93ad, 0x9c4a3c, 0xf8f5ee, 0x5f7f9c, 0xc9a25c];
  /* tuiles, ardoises, une tuile vernissée de temps en temps : les toits d'un vrai bourg, plus des bonbons */
  const TOITS = [0xc4683f, 0xb05a3c, 0x5d6677, 0xcf7a4a, 0x6b7487, 0xa9603f, 0x8a4b3a, 0x4f7a8c];
  function house(x, z, ry, roofCol, y0, etroit) {
    const P = place(x, z, ry, y0),
      f0 = Math.floor(h01(x, z, 1) * 4),
      // dans une rangée serrée, pas de longère : son appentis toucherait la voisine
      forme = etroit && f0 === 1 ? 0 : f0,
      mur = ENDUITS[Math.floor(h01(x, z, 2) * ENDUITS.length)],
      volet = VOLETS[Math.floor(h01(x, z, 3) * VOLETS.length)],
      avecVolets = h01(x, z, 4) < 0.6;
    // largeur, profondeur, hauteur des murs
    const [w, d, hm] =
      forme === 1
        ? [2.5, 1.5, 1.0]
        : forme === 2
          ? [1.8, 1.6, 1.75]
          : forme === 3
            ? [1.9, 1.8, 1.15]
            : [2.0, 1.6, 1.15];
    bxc(B.main, P, 0, 0, 0, w, hm, d, mur);
    bx(B.main, P, 0, 0, 0, w + 0.04, 0.16, d + 0.04, teinte(mur, 0.78));
    if (forme === 3) {
      // le toit à quatre pans : une pyramide écrasée, qui déborde un peu
      put(B.main, G.pyr, P, 0, hm, 0, w + 0.45, 0.9, d + 0.45, roofCol);
      bx(B.main, P, 0, hm - 0.04, 0, w + 0.1, 0.05, d + 0.1, teinte(roofCol, 0.55));
    } else {
      put(
        B.main,
        G.prism,
        P,
        0,
        hm,
        0,
        d + 0.34,
        forme === 2 ? 1.0 : 0.82,
        w + 0.36,
        roofCol,
        Math.PI / 2,
      );
      // un liseré sombre sous le toit : la toiture se détache du mur au lieu de s'y coller
      bx(B.main, P, 0, hm - 0.04, 0, w + 0.08, 0.05, d + 0.1, teinte(roofCol, 0.55));
    }
    // la cheminée, d'un côté ou de l'autre
    const cx = (h01(x, z, 5) < 0.5 ? -1 : 1) * w * 0.27;
    bxc(B.main, P, cx, hm + 0.15, -0.3, 0.24, forme === 2 ? 0.86 : 0.7, 0.24, teinte(mur, 0.9));
    bx(B.main, P, cx, hm + (forme === 2 ? 1.01 : 0.85), -0.3, 0.3, 0.05, 0.3, teinte(roofCol, 0.7));
    // la porte, son auvent et sa marche
    const px = forme === 1 ? -0.65 : -0.45;
    bx(B.main, P, px, 0, d / 2, 0.36, 0.66, 0.05, teinte(roofCol, 0.75));
    bx(B.main, P, px, 0.72, d / 2 + 0.11, 0.52, 0.04, 0.24, teinte(roofCol, 0.85));
    bx(B.ground, P, px, -0.02, d / 2 + 0.14, 0.5, 0.05, 0.26, 0xe2ddd2);
    // les fenêtres, et des volets sur certaines façades
    const fen = (fx, fy, fz, fry, fw, fh, vitre) => {
      fenetre(vitre, B.main, P, fx, fy, fz, fry, fw, fh);
      if (avecVolets && Math.abs(fry) < 0.1)
        for (const s of [-1, 1])
          bx(B.main, P, fx + s * (fw / 2 + 0.11), fy - fh / 2, fz + 0.03, 0.14, fh, 0.03, volet);
    };
    const xs = forme === 1 ? [0.25, 0.85] : [0.3];
    for (const fx of xs) fen(fx, 0.62, d / 2, 0, 0.42, 0.36, B.winA);
    if (forme === 2) for (const fx of [-0.45, 0.4]) fen(fx, 1.32, d / 2, 0, 0.38, 0.32, B.winA);
    fen(-0.4, 0.62, -d / 2, Math.PI, 0.42, 0.36, B.winB);
    fen(0.4, 0.62, -d / 2, Math.PI, 0.42, 0.36, B.winB);
    fen(w / 2, 0.62, 0, Math.PI / 2, 0.44, 0.36, B.winA);
    fen(-w / 2, 0.62, 0, -Math.PI / 2, 0.44, 0.36, B.winB);
    // la longère a son appentis, un toit en pente posé contre le pignon
    if (forme === 1) {
      bxc(B.main, P, w / 2 + 0.42, 0, 0, 0.84, 0.72, 1.2, teinte(mur, 0.94));
      put(B.main, G.box, P, w / 2 + 0.42, 0.78, 0, 1.0, 0.07, 1.36, roofCol, 0, 0, 0.32);
    }
    // devant : une allée jusqu'au trottoir, et une clôture blanche ou une haie de part et d'autre
    bx(B.ground, P, px, -0.02, d / 2 + 0.75, 0.42, 0.05, 0.95, 0xe7dfcf);
    const cl = d / 2 + 1.2;
    /* un bout de clôture ou de haie plus court qu'un pas faisait un petit cube posé là : on s'en passe */
    const courts = (s) =>
      Math.abs((s < 0 ? -w / 2 - 0.1 : w / 2 + (forme === 1 ? 0.9 : 0.1)) - (px + s * 0.34)) < 0.5;
    if (h01(x, z, 6) < 0.55)
      for (const s of [-1, 1]) {
        if (courts(s)) continue;
        const a = px + s * 0.34,
          b2 = s < 0 ? -w / 2 - 0.1 : w / 2 + (forme === 1 ? 0.9 : 0.1),
          lg = Math.abs(b2 - a),
          m = (a + b2) / 2;
        bx(B.main, P, m, 0.22, cl, lg, 0.05, 0.04, 0xf6f3ea);
        bx(B.main, P, m, 0.08, cl, lg, 0.05, 0.04, 0xf6f3ea);
        for (let t = 0; t <= lg + 0.01; t += 0.32)
          bx(B.main, P, Math.min(a, b2) + t, 0, cl, 0.05, 0.34, 0.05, 0xf6f3ea);
      }
    else
      for (const s of [-1, 1]) {
        if (courts(s)) continue;
        const a = px + s * 0.34,
          b2 = s < 0 ? -w / 2 - 0.05 : w / 2 + (forme === 1 ? 0.85 : 0.05);
        bxc(B.main, P, (a + b2) / 2, 0, cl, Math.abs(b2 - a), 0.36, 0.26, 0x5f9f62);
      }
  }
  function apartment(x, z, ry, w, d, floors, col, y0, band) {
    const P = place(x, z, ry, y0),
      fh = 0.78,
      h = floors * fh + 0.25;
    bxc(B.main, P, 0, 0, 0, w, h, d, col);
    // le soubassement, plus sombre : le rez-de-chaussée se lit
    bx(B.main, P, 0, 0, 0, w + 0.05, 0.3, d + 0.05, teinte(col, 0.74));
    bx(B.main, P, 0, h, 0, w - 0.12, 0.04, d - 0.12, C.roof);
    acrotere(B.main, P, 0, h, 0, w + 0.06, d + 0.06, 0.2, 0.09, C.white);
    bxc(B.main, P, w * 0.18, h + 0.04, -d * 0.15, 0.7, 0.36, 0.6, 0xd9dde5);
    bx(B.main, P, w * 0.18, h + 0.4, -d * 0.15, 0.76, 0.04, 0.66, 0xc9ced8);
    if (floors > 8) {
      cy(B.main, P, -w * 0.2, h + 0.04, d * 0.16, 0.3, 0.42, 0xdadee6);
      cy(B.main, P, -w * 0.2, h + 0.46, d * 0.16, 0.33, 0.04, 0xc9ced8);
    }
    if (band)
      bx(B.main, P, 0, Math.floor(floors / 2) * fh + 0.02, 0, w + 0.1, 0.14, d + 0.1, C.white);
    // l'entrée : une porte vitrée sombre sous un auvent
    bx(B.main, P, 0, 0, d / 2 + 0.02, 0.55, 0.72, 0.05, PORTE);
    bx(B.main, P, 0, 0.78, d / 2 + 0.2, 0.86, 0.05, 0.4, C.white);
    windowsOn(WIN, P, w, d, 0.12, floors, fh, R, {
      // pas de fenêtre en travers de la porte
      skip: (f, fl, t) => f === 0 && fl === 0 && Math.abs(t) < 0.55,
    });
  }
  const MURS_BOUTIQUE = [0xf4e7d4, 0xe7eee2, 0xf2ddd3, 0xe2e7f1, 0xf5efdb, 0xece3f2];
  function shop(x, z, ry, w, col, y0) {
    const P = place(x, z, ry, y0),
      mur = pick(MURS_BOUTIQUE);
    bxc(B.main, P, 0, 0, 0, w, 1.5, 2.4, mur);
    bx(B.main, P, 0, 0, 0, w + 0.04, 0.16, 2.44, teinte(mur, 0.8));
    /*
      Le toit. Un couvercle gris avec un climatiseur faisait des boutiques
      inachevées : une sur deux a maintenant ses tuiles et sa cheminée ;
      l'autre, un toit-terrasse bordé d'un muret de sa couleur, avec ses bacs
      de plantes.
    */
    const toit = TOITS[Math.floor(h01(x, z, 7) * TOITS.length)];
    if (h01(x, z, 8) < 0.5) {
      put(B.main, G.prism, P, 0, 1.5, 0, 2.7, 0.62, w + 0.2, toit, Math.PI / 2);
      bx(B.main, P, 0, 1.46, 0, w + 0.06, 0.05, 2.5, teinte(toit, 0.55));
      bxc(B.main, P, w * 0.28, 1.6, -0.55, 0.24, 0.6, 0.24, teinte(mur, 0.9));
    } else {
      bx(B.main, P, 0, 1.5, 0, w - 0.12, 0.04, 2.28, 0xd8d2c6);
      acrotere(B.main, P, 0, 1.5, 0, w + 0.06, 2.46, 0.2, 0.09, teinte(mur, 0.86));
      for (const t of [-0.3, 0.3]) {
        bxc(B.main, P, t * w, 1.54, -0.75, 0.7, 0.18, 0.32, 0xb08b63);
        for (const u of [-0.2, 0, 0.2])
          sp(
            B.main,
            P,
            t * w + u,
            1.78,
            -0.75,
            0.13,
            FEUILLU[(Math.round(u * 10) + 3) % FEUILLU.length],
          );
      }
    }
    /* le store rayé, une bande sur deux à la couleur de la boutique */
    const nb = 6,
      lb = (w - 0.08) / nb;
    for (let k = 0; k < nb; k++)
      put(
        B.main,
        G.box,
        P,
        -(w - 0.08) / 2 + lb * (k + 0.5),
        1.12,
        1.48,
        lb,
        0.06,
        0.72,
        k % 2 ? CADRE : col,
        0,
        0.36,
      );
    bx(B.main, P, 0, 1.3, 1.2, w * 0.62, 0.26, 0.08, col);
    bx(B.main, P, -w / 2 + 0.42, 0, 1.2, 0.42, 0.86, 0.05, PORTE);
    fenetre(B.winA, B.main, P, 0.28, 0.6, 1.2, 0, w * 0.5, 0.72);
  }

  /*
    ---- les véhicules

    Une caisse aux arêtes cassées, un habitacle aux vitres inclinées, des roues
    avec leur jante, des phares devant et des feux rouges derrière : assez pour
    reconnaître une 2 CV d'un taxi au premier coup d'œil, sans quitter la
    sobriété du décor.
  */
  const _cabines = new Map();
  function geoCabine(wb, wt, h, lb, lt, dz) {
    const k = [wb, wt, h, lb, lt, dz].map((v) => v.toFixed(3)).join("|");
    let g = _cabines.get(k);
    if (!g) {
      const pts = [];
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          pts.push(
            new T.Vector3((sx * wb) / 2, 0, (sz * lb) / 2),
            new T.Vector3((sx * wt) / 2, h, (sz * lt) / 2 + dz),
          );
      g = new ConvexGeometry(pts);
      _cabines.set(k, g);
    }
    return g;
  }
  function vehicle(b, lights, P, kind, col, stops) {
    const lb = lights || b,
      sb = stops || b;
    const roue = (x, z, r) => {
      put(b, G.cyl12, P, x, r, z, r * 2, 0.13, r * 2, C.tire, 0, 0, Math.PI / 2);
      put(
        b,
        G.cyl12,
        P,
        x + Math.sign(x) * 0.014,
        r,
        z,
        r * 1.05,
        0.12,
        r * 1.05,
        0xd5d9e2,
        0,
        0,
        Math.PI / 2,
      );
    };
    const quatre = (ex, z1, z2, r) => {
      roue(ex, z1, r);
      roue(-ex, z1, r);
      roue(ex, z2, r);
      roue(-ex, z2, r);
    };
    const phares = (y, z, w, ecart) => {
      bx(lb, P, ecart, y, z, w, 0.08, 0.03, 0xfff6d8);
      bx(lb, P, -ecart, y, z, w, 0.08, 0.03, 0xfff6d8);
    };
    const feux = (y, z, w, ecart) => {
      bx(sb, P, ecart, y, z - 0.03, w, 0.07, 0.03, 0xd8343c);
      bx(sb, P, -ecart, y, z - 0.03, w, 0.07, 0.03, 0xd8343c);
    };
    const vitres = (wb, wt, h, l1, l2, dz, y, z) =>
      put(b, geoCabine(wb, wt, h, l1, l2, dz), P, 0, y, z, 1, 1, 1, C.glass);
    const PARE = 0xc9ced8;
    if (kind === "velo") {
      put(b, G.cyl12, P, 0, 0.2, 0.32, 0.4, 0.04, 0.4, C.tire, 0, 0, Math.PI / 2);
      put(b, G.cyl12, P, 0, 0.2, -0.32, 0.4, 0.04, 0.4, C.tire, 0, 0, Math.PI / 2);
      bx(b, P, 0, 0.2, 0, 0.04, 0.05, 0.66, col);
      bx(b, P, 0, 0.22, -0.08, 0.04, 0.28, 0.04, col);
      bx(b, P, 0, 0.42, 0.26, 0.3, 0.03, 0.03, C.dark);
      cy(b, P, 0, 0.42, -0.04, 0.09, 0.34, col, G.cyl8);
      sp(b, P, 0, 0.86, -0.02, 0.09, 0xf3d3b5);
      return;
    }
    if (kind === "deudeuche") {
      /* la 2 CV : caisse basse, capot plongeant, toit bombé, ailes rondes */
      bxc(b, P, 0, 0.13, -0.05, 0.72, 0.28, 1.4, col);
      put(b, G.box, P, 0, 0.38, 0.5, 0.66, 0.06, 0.42, col, 0, 0.22);
      vitres(0.66, 0.58, 0.3, 0.86, 0.62, -0.06, 0.41, -0.12);
      put(b, G.cyl12, P, 0, 0.71, -0.18, 0.6, 0.62, 0.2, col, 0, Math.PI / 2);
      for (const s of [-1, 1]) for (const z of [0.5, -0.5]) sp(b, P, s * 0.34, 0.22, z, 0.17, col);
      bx(b, P, 0, 0.14, 0.7, 0.5, 0.12, 0.04, PARE);
      bx(b, P, 0, 0.14, -0.76, 0.6, 0.08, 0.04, PARE);
      sp(lb, P, 0.24, 0.36, 0.66, 0.06, 0xfff6d8);
      sp(lb, P, -0.24, 0.36, 0.66, 0.06, 0xfff6d8);
      feux(0.3, -0.75, 0.08, 0.27);
      quatre(0.34, 0.5, -0.5, 0.13);
      return;
    }
    if (kind === "camion") {
      bxc(b, P, 0, 0.2, 0.95, 0.9, 0.85, 0.75, col);
      bx(b, P, 0, 0.62, 1.33, 0.8, 0.3, 0.03, C.glass);
      bxc(b, P, 0, 0.26, -0.38, 0.96, 1.15, 1.9, C.white);
      bx(b, P, 0, 0.92, -0.38, 0.98, 0.16, 1.92, col);
      bx(b, P, 0, 0.12, 1.34, 0.86, 0.1, 0.05, PARE);
      phares(0.32, 1.34, 0.14, 0.3);
      feux(0.36, -1.33, 0.12, 0.36);
      roue(0.44, 0.95, 0.18);
      roue(-0.44, 0.95, 0.18);
      quatre(0.44, -0.6, -1.05, 0.18);
      return;
    }
    if (kind === "tram") {
      /* deux voitures articulées et un pantographe : il ne roule que sur goudron */
      for (const z of [-1.1, 1.1]) {
        bxc(b, P, 0, 0.2, z, 0.92, 0.95, 2.1, C.white);
        bx(b, P, 0, 0.6, z, 0.95, 0.32, 1.9, C.glass);
        bx(b, P, 0, 0.26, z, 0.95, 0.1, 2.1, col);
        bx(b, P, 0, 1.15, z, 0.84, 0.06, 2.0, C.metal);
      }
      bx(b, P, 0, 0.25, 0, 0.8, 0.85, 0.2, C.dark);
      put(b, G.box, P, 0, 1.5, 0.6, 0.04, 0.7, 0.04, C.dark, 0, 0.5);
      bx(b, P, 0, 1.78, 0.42, 0.5, 0.03, 0.06, C.dark);
      phares(0.4, 2.16, 0.16, 0.3);
      feux(0.4, -2.15, 0.14, 0.32);
      for (const z of [1.75, 0.45, -0.45, -1.75]) {
        roue(0.44, z, 0.15);
        roue(-0.44, z, 0.15);
      }
      return;
    }
    if (kind === "bus") {
      bxc(b, P, 0, 0.18, 0, 0.9, 0.86, 3.0, col);
      bx(b, P, 0, 0.6, 0, 0.93, 0.3, 2.7, C.glass);
      bx(b, P, 0, 0.6, 1.49, 0.8, 0.34, 0.03, C.glass);
      bxc(b, P, 0, 1.04, 0, 0.84, 0.06, 2.86, C.white);
      bx(b, P, 0, 0.16, 1.5, 0.86, 0.1, 0.05, PARE);
      phares(0.32, 1.51, 0.14, 0.3);
      feux(0.36, -1.5, 0.1, 0.36);
      quatre(0.44, 0.95, -0.95, 0.17);
      return;
    }
    if (kind === "van") {
      bxc(b, P, 0, 0.16, -0.2, 0.86, 0.8, 1.5, C.white);
      bxc(b, P, 0, 0.16, 0.78, 0.84, 0.56, 0.5, C.white);
      bx(b, P, 0, 0.44, 1.02, 0.76, 0.24, 0.03, C.glass);
      bx(b, P, 0, 0.44, -0.2, 0.89, 0.16, 1.3, col);
      bx(b, P, 0, 0.14, 1.04, 0.84, 0.1, 0.05, PARE);
      phares(0.28, 1.04, 0.14, 0.26);
      feux(0.34, -0.95, 0.1, 0.34);
      quatre(0.42, 0.62, -0.62, 0.16);
      return;
    }
    /* la citadine, et ses deux cousines : le taxi et la voiture de sport */
    const sport = kind === "sport",
      L = sport ? 1.75 : 1.6;
    bxc(b, P, 0, 0.12, 0, sport ? 0.84 : 0.76, sport ? 0.24 : 0.3, L, col);
    if (sport) {
      vitres(0.7, 0.56, 0.2, 0.84, 0.44, -0.1, 0.36, -0.08);
      bxc(b, P, 0, 0.56, -0.18, 0.58, 0.04, 0.46, col);
      bx(b, P, 0, 0.44, -0.84, 0.84, 0.04, 0.16, C.dark);
      for (const s of [-1, 1]) bx(b, P, s * 0.3, 0.32, -0.84, 0.04, 0.12, 0.06, C.dark);
    } else {
      vitres(0.68, 0.6, 0.26, 0.92, 0.6, -0.06, 0.42, -0.08);
      bxc(b, P, 0, 0.68, -0.14, 0.62, 0.05, 0.62, col);
    }
    if (kind === "taxi") {
      bxc(b, P, 0, 0.73, -0.14, 0.32, 0.12, 0.18, C.white);
      bx(b, P, 0, 0.3, 0, 0.78, 0.05, 1.1, C.dark);
    }
    bx(b, P, 0, 0.12, L / 2 + 0.01, 0.78, 0.1, 0.05, PARE);
    bx(b, P, 0, 0.12, -L / 2 - 0.01, 0.78, 0.1, 0.05, PARE);
    phares(sport ? 0.27 : 0.31, L / 2 + 0.01, 0.14, 0.25);
    feux(sport ? 0.29 : 0.33, -L / 2 - 0.01, 0.12, 0.27);
    quatre(0.37, L * 0.33, -L * 0.33, 0.15);
  }

  /*
    ---- les premiers âges d'un quartier

    Un quartier ne naît pas en immeuble : cabane (niveau 1), puis maison
    (niveau 2), puis le bâtiment de la ville (3), puis sa version de prestige
    (4). Les deux premiers âges partagent ces pièces ; chaque quartier y
    accroche le petit signe qui dit ce qu'il deviendra.
  */
  const YQ = CURB + 0.03;
  function pre(cx, cz, k, f) {
    bx(B.ground, I4, cx, CURB, cz, 8.6, 0.03, 8.6, C.lawn);
    zone(cx - 4.2, cz - 4.2, cx + 4.2, cz + 4.2, k, f);
  }
  function cabane(cx, cz, ry, accent) {
    const P = place(cx, cz, ry, YQ);
    bxc(B.main, P, 0, 0, 0, 2.2, 1.15, 1.8, C.wood);
    for (const y of [0.36, 0.76]) bx(B.main, P, 0, y, 0, 2.24, 0.05, 1.84, 0xb08a62);
    put(B.main, G.prism, P, 0, 1.15, 0, 2.15, 0.75, 2.6, 0x8a6a4a, Math.PI / 2);
    bx(B.main, P, 0, 1.11, 0, 2.3, 0.05, 1.9, 0x5e4630);
    bx(B.main, P, -0.45, 0, 0.91, 0.5, 0.82, 0.05, accent);
    fenetre(B.winA, null, P, 0.5, 0.64, 0.9, 0, 0.44, 0.36);
    bx(B.main, P, 0.5, 0.42, 0.95, 0.56, 0.05, 0.08, 0x8a6a4a);
    bx(B.ground, P, 0, -0.02, 1.6, 0.7, 0.03, 1.4, 0xe0cfae);
    return P;
  }
  function maisonnette(cx, cz, ry, w, mur, toit, accent) {
    const P = place(cx, cz, ry, YQ);
    bxc(B.main, P, 0, 0, -0.6, w, 1.7, 2.8, mur);
    bx(B.main, P, 0, 0, -0.6, w + 0.04, 0.18, 2.84, teinte(mur, 0.8));
    put(B.main, G.prism, P, 0, 1.7, -0.6, 3.1, 1.05, w + 0.3, toit, Math.PI / 2);
    bx(B.main, P, 0, 1.66, -0.6, w + 0.1, 0.05, 2.9, teinte(toit, 0.55));
    bxc(B.main, P, w * 0.28, 1.9, -1.1, 0.3, 0.8, 0.3, mur);
    bx(B.main, P, w * 0.28, 2.7, -1.1, 0.36, 0.05, 0.36, teinte(toit, 0.7));
    bx(B.main, P, 0, 0, 0.81, 0.6, 1.05, 0.05, accent);
    bx(B.main, P, 0, 1.12, 0.95, 0.8, 0.05, 0.3, teinte(toit, 0.85));
    for (const x of [-w * 0.3, w * 0.3]) fenetre(B.winA, B.main, P, x, 0.95, 0.8, 0, 0.62, 0.5);
    for (const x of [-w * 0.25, w * 0.25])
      fenetre(B.winB, B.main, P, x, 0.95, -2.0, Math.PI, 0.62, 0.5);
    fenetre(B.winA, B.main, P, w / 2, 0.95, -0.6, Math.PI / 2, 0.6, 0.5);
    bx(B.ground, P, 0, -0.02, 2.1, 0.9, 0.03, 2.6, C.pave);
    return P;
  }
  /* un terrain qui attend : quatre piquets et un cordeau */
  function piquets(cx, cz) {
    pre(cx, cz);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        cy(B.main, I4, cx + sx * 2.4, YQ, cz + sz * 2.4, 0.05, 0.5, C.wood, G.cyl8);
    for (const s of [-1, 1]) {
      bx(B.main, I4, cx, YQ + 0.42, cz + s * 2.4, 4.8, 0.02, 0.02, 0xf6f5f0);
      bx(B.main, I4, cx + s * 2.4, YQ + 0.42, cz, 0.02, 0.02, 4.8, 0xf6f5f0);
    }
  }
  /*
    Le prestige : des massifs fleuris aux quatre coins et un liseré doré. Les
    bacs restent en retrait du bord de l'îlot : les passants qui en font le
    tour les traversaient.
  */
  function fleurs(cx, cz) {
    const tons = [C.pink, C.yellow, C.violet, 0xffffff, C.orange];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = cx + sx * 3.85,
          z = cz + sz * 3.85;
        cy(B.main, I4, x, CURB, z, 0.5, 0.2, C.white);
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          sp(
            B.main,
            I4,
            x + Math.cos(a) * 0.3,
            CURB + 0.27,
            z + Math.sin(a) * 0.3,
            0.11,
            tons[(k + (sx + 2) * (sz + 3)) % 5],
          );
        }
        sp(B.main, I4, x, CURB + 0.3, z, 0.14, C.lawn);
      }
    for (const s of [-1, 1]) {
      bx(B.ground, I4, cx, CURB, cz + s * 4.95, 9.9, 0.05, 0.08, C.gold);
      bx(B.ground, I4, cx + s * 4.95, CURB, cz, 0.08, 0.05, 9.9, C.gold);
    }
  }

  /* ---- sol : dalle, îlots, pelouses, marquages */
  (function ground() {
    const sh = new T.Shape(),
      s = SLAB,
      r = 2.2;
    sh.moveTo(-s + r, -s);
    sh.lineTo(s - r, -s);
    sh.quadraticCurveTo(s, -s, s, -s + r);
    sh.lineTo(s, s - r);
    sh.quadraticCurveTo(s, s, s - r, s);
    sh.lineTo(-s + r, s);
    sh.quadraticCurveTo(-s, s, -s, s - r);
    sh.lineTo(-s, -s + r);
    sh.quadraticCurveTo(-s, -s, -s + r, -s);
    const g = new T.ExtrudeGeometry(sh, {
      depth: 1.8,
      bevelEnabled: false,
      curveSegments: 8,
      steps: 6,
    });
    g.rotateX(Math.PI / 2);
    /*
      Le socle de la maquette : une bordure de pierre, puis des strates de
      terre de plus en plus sombres. Un flanc uni gris faisait de la ville une
      plaque de plastique ; les strates en font un morceau de terrain découpé.
      Une couleur par triangle (et non par sommet) : des bandes nettes, pas un
      dégradé baveux.
    */
    const STRATES = [0xddd7ca, 0xbca487, 0xb09678, 0xa48a6b, 0x977c5e, 0x8a7052];
    const pos = g.attributes.position,
      cols = new Float32Array(pos.count * 3),
      cs = new T.Color();
    for (let i = 0; i + 2 < pos.count; i += 3) {
      const ym = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      cs.set(STRATES[clamp(Math.floor(-ym / 0.3), 0, STRATES.length - 1)]);
      for (let j = 0; j < 3; j++) cols.set([cs.r, cs.g, cs.b], (i + j) * 3);
    }
    g.setAttribute("color", new T.BufferAttribute(cols, 3));
    const slab = new T.Mesh(g, [matSlab, mat({ vertexColors: true, roughness: 1 })]);
    slab.receiveShadow = true;
    scene.add(slab);

    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const cx = cv.getContext("2d");
    cx.shadowColor = "rgba(26,30,66,.6)";
    cx.shadowBlur = 30;
    cx.fillStyle = "rgba(26,30,66,.3)";
    cx.beginPath();
    cx.moveTo(60, 44);
    cx.arcTo(212, 44, 212, 212, 16);
    cx.arcTo(212, 212, 44, 212, 16);
    cx.arcTo(44, 212, 44, 44, 16);
    cx.arcTo(44, 44, 212, 44, 16);
    cx.closePath();
    cx.fill();
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    const sz = (2 * SLAB * 256) / 168;
    const und = new T.Mesh(
      new T.PlaneGeometry(sz, sz),
      new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    und.rotation.x = -Math.PI / 2;
    und.position.y = -3.4;
    scene.add(und);

    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        bx(
          B.ground,
          I4,
          BC[i],
          0,
          BC[j],
          10,
          CURB,
          10,
          /* avant les pavés, les îlots sont des prés */
          PV.routes < 1 ? 0xd6e7c8 : BC[i] === PLX && BC[j] === PLZ ? C.plaza : C.pave,
        );
    /*
      Les soudures : la chaussée entre deux îlots réunis disparaît sous le sol
      de l'îlot. Côté campagne et parc, la pelouse passe d'un îlot à l'autre
      (le trottoir ne reste que le long des rues) ; dans le centre, c'est une
      rue piétonne pavée, plantée d'arbres, avec ses bancs.
    */
    for (const [i, j, i2, , sol] of SOUDURES) {
      const enX = i2 !== i,
        mx = enX ? RX[i + 1] : BC[i],
        mz = enX ? BC[j] : RX[j + 1];
      const base = PV.routes < 1 ? 0xd6e7c8 : C.pave;
      if (enX) bx(B.ground, I4, mx, 0, mz, 3.02, CURB, 10, base);
      else bx(B.ground, I4, mx, 0, mz, 10, CURB, 3.02, base);
      if (sol === "herbe") {
        if (enX) {
          bx(B.ground, I4, mx, CURB, mz, 4.42, 0.03, 8.6, C.lawn);
          zone(mx - 2.2, mz - 4.2, mx + 2.2, mz + 4.2);
        } else {
          bx(B.ground, I4, mx, CURB, mz, 8.6, 0.03, 4.42, C.lawn);
          zone(mx - 4.2, mz - 2.2, mx + 4.2, mz + 2.2);
        }
      } else {
        // la rue piétonne : trois arbres dans leurs bacs, deux bancs entre eux
        for (const t of [-3.2, 0, 3.2]) {
          const x = enX ? mx : mx + t,
            z = enX ? mz + t : mz;
          cy(B.main, I4, x, CURB, z, 0.42, 0.22, 0xe2ddd2, G.cyl8);
          tree(x, z, CURB + 0.22, 0.75, false);
        }
        for (const t of [-1.6, 1.6]) {
          const P = place(enX ? mx : mx + t, enX ? mz + t : mz, enX ? 0 : Math.PI / 2, CURB);
          bxc(B.main, P, 0, 0.18, 0, 0.3, 0.06, 0.95, C.wood);
          bxc(B.main, P, -0.14, 0.24, 0, 0.05, 0.28, 0.95, C.wood);
          for (const zz of [-0.38, 0.38]) bxc(B.main, P, 0, 0, zz, 0.26, 0.18, 0.05, C.dark);
        }
      }
    }
    /* la ceinture ôtée : de l'herbe, du bord des champs jusqu'aux fermes de la couronne */
    const LC = RING + 0.4,
      LI = 23.8;
    for (const [x0, z0, x1, z1] of [
      [-LC, -LC, LC, -LI],
      [-LC, -LC, -LI, LC],
      [LI, -LC, LC, -14.5],
      [-LC, LI, -14.5, LC],
    ]) {
      bx(B.ground, I4, (x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, CURB + 0.03, z1 - z0, C.lawn);
      zone(x0 + 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2);
    }
    /*
      Des chemins de terre partent des rues et serpentent entre les terres
      jusqu'aux fermes du bord : la campagne a ses passages, pas seulement des
      parcelles. Ils sont tracés avant le reste, qui s'écarte d'eux (registre
      des emprises).
    */
    const chemin = (x0, z0, x1, z1, amp, tours) => {
      const L = Math.hypot(x1 - x0, z1 - z0),
        n = Math.ceil(L / 0.55),
        ux = (x1 - x0) / L,
        uz = (z1 - z0) / L;
      let px = x0,
        pz = z0;
      for (let k = 1; k <= n; k++) {
        const t = k / n,
          // l'ondulation s'éteint aux deux bouts : le chemin part droit de la rue et arrive droit à la ferme
          w = Math.sin(t * Math.PI * 2 * tours) * amp * Math.sin(t * Math.PI),
          x = x0 + (x1 - x0) * t - uz * w,
          z = z0 + (z1 - z0) * t + ux * w,
          l = Math.hypot(x - px, z - pz);
        bx(
          B.ground,
          I4,
          (px + x) / 2,
          CURB + 0.03,
          (pz + z) / 2,
          0.55,
          0.008,
          l + 0.22,
          0xe3d6b8,
          Math.atan2(x - px, z - pz),
        );
        px = x;
        pz = z;
      }
    };
    chemin(-14.6, -14.6, -12.4, -27.9, 0.8, 1);
    chemin(-14.6, -14.6, -27.9, -11.9, 0.8, 1.5);
    chemin(0, -14.6, 0.5, -27.9, 0.55, 1);
    chemin(-14.6, 0, -27.9, 1.4, 0.7, 1);
    chemin(-14.6, 13, -27.9, 14.2, 0.6, 1.5);
    /*
      Les virages : là où une rue tourne sans croiser d'autre rue, l'angle
      extérieur de la chaussée s'arrondit (un congé de trottoir). Une rue qui
      tourne en équerre vive, c'était encore le damier.
    */
    const conge = (() => {
      const sh = new T.Shape();
      sh.moveTo(1, 0);
      sh.lineTo(1, 1);
      sh.lineTo(0, 1);
      sh.absarc(0, 0, 1, Math.PI / 2, 0, true);
      const g = new T.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 10 });
      g.rotateX(-Math.PI / 2);
      return g;
    })();
    for (let i = 0; i < NN; i++)
      for (let j = 0; j < NN; j++) {
        const ex = VOISINS.filter(([di, dj]) => {
          const a = i + di,
            b2 = j + dj;
          return a >= 0 && a < NN && b2 >= 0 && b2 < NN && rue(i, j, a, b2);
        });
        if (ex.length !== 2 || ex[0][0] + ex[1][0] === 0) continue;
        const sx = -(ex[0][0] + ex[1][0]),
          sz = -(ex[0][1] + ex[1][1]),
          ry = sx > 0 ? (sz < 0 ? 0 : -Math.PI / 2) : sz < 0 ? Math.PI / 2 : Math.PI;
        put(
          B.ground,
          conge,
          I4,
          RX[i],
          0,
          RX[j],
          1.5,
          CURB,
          1.5,
          PV.routes < 1 ? 0xd6e7c8 : C.pave,
          ry,
        );
      }
    /* couronne de pelouse */
    const ro = (RING + 4.2) * 2,
      rc = RING + 2.1,
      lc = RING + 2.3;
    bx(B.ground, I4, 0, 0, -rc, ro, CURB, 4.2, C.pave);
    bx(B.ground, I4, 0, CURB, -lc, ro, 0.03, 3.8, C.lawn);
    bx(B.ground, I4, 0, 0, rc, ro, CURB, 4.2, C.pave);
    bx(B.ground, I4, 0, CURB, lc, ro, 0.03, 3.8, C.lawn);
    bx(B.ground, I4, -rc, 0, 0, 4.2, CURB, RING * 2, C.pave);
    bx(B.ground, I4, -lc, CURB, 0, 3.8, 0.03, RING * 2, C.lawn);
    bx(B.ground, I4, rc, 0, 0, 4.2, CURB, RING * 2, C.pave);
    bx(B.ground, I4, lc, CURB, 0, 3.8, 0.03, RING * 2, C.lawn);

    /* pointillés des voies (goudron) et passages piétons (avec les feux) */
    if (PV.routes >= 2)
      for (let k = 0; k < NN; k++)
        for (let j = 0; j < NN - 1; j++) {
          const a = RX[j] + 2.9,
            b = RX[j + 1] - 2.9;
          const le = rue(k, j, k, j + 1),
            ln = rue(j, k, j + 1, k);
          for (let t = a + 0.4; t < b; t += 1.45) {
            if (le) bx(B.ground, I4, RX[k], 0.002, t, 0.12, 0.012, 0.75, 0xffffff);
            if (ln) bx(B.ground, I4, t, 0.002, RX[k], 0.75, 0.012, 0.12, 0xffffff);
          }
          // les lignes de rive : la chaussée a un bord, les voies une largeur
          for (const o of [-1.3, 1.3]) {
            if (le) bx(B.ground, I4, RX[k] + o, 0.002, (a + b) / 2, 0.06, 0.012, b - a, 0xf3f3ee);
            if (ln) bx(B.ground, I4, (a + b) / 2, 0.002, RX[k] + o, b - a, 0.012, 0.06, 0xf3f3ee);
          }
        }
    for (let i = 0; i < NN; i++)
      for (let j = 0; j < NN; j++) {
        const x = RX[i],
          z = RX[j];
        /* un virage ou une rue qui continue tout droit n'a ni passage ni feu : seulement les vrais carrefours */
        const carrefour = sorties(i, j) >= 3,
          o = i > 0 && rue(i - 1, j, i, j),
          e = i < NN - 1 && rue(i, j, i + 1, j),
          n = j > 0 && rue(i, j - 1, i, j),
          su = j < NN - 1 && rue(i, j, i, j + 1);
        for (let k = -2; k <= 2 && PV.feux && carrefour; k++) {
          if (o) bx(B.ground, I4, x - 2.0, 0.002, z + k * 0.54, 0.72, 0.012, 0.3, 0xffffff);
          if (e) bx(B.ground, I4, x + 2.0, 0.002, z + k * 0.54, 0.72, 0.012, 0.3, 0xffffff);
          if (n) bx(B.ground, I4, x + k * 0.54, 0.002, z - 2.0, 0.3, 0.012, 0.72, 0xffffff);
          if (su) bx(B.ground, I4, x + k * 0.54, 0.002, z + 2.0, 0.3, 0.012, 0.72, 0xffffff);
        }
        /* la ligne d'arrêt, en travers de la voie qui arrive, devant le passage piéton */
        if (PV.feux && carrefour && i > 0 && i < NN - 1 && j > 0 && j < NN - 1) {
          if (o) bx(B.ground, I4, x - 2.55, 0.002, z + 0.75, 0.14, 0.012, 1.3, 0xffffff);
          if (e) bx(B.ground, I4, x + 2.55, 0.002, z - 0.75, 0.14, 0.012, 1.3, 0xffffff);
          if (n) bx(B.ground, I4, x - 0.75, 0.002, z - 2.55, 1.3, 0.012, 0.14, 0xffffff);
          if (su) bx(B.ground, I4, x + 0.75, 0.002, z + 2.55, 1.3, 0.012, 0.14, 0xffffff);
        }
        if (sorties(i, j) > 0) lamp(x + 1.62, z + 1.62, CURB);
      }
  })();

  /*
    ---- feux tricolores et guirlandes

    Tous les carrefours suivent le même cycle : deux matières, l'une pour l'axe
    nord-sud, l'autre pour l'axe est-ouest, suffisent à les animer tous.
  */
  const feuxA = new Batch(),
    feuxB = new Batch(),
    ampoules = [];
  if (PV.feux)
    for (let i = 1; i < NN - 1; i++)
      for (let j = 1; j < NN - 1; j++)
        for (const [sx, sz] of sorties(i, j) < 3
          ? []
          : [
              [-1, 1],
              [1, -1],
            ]) {
          const x = RX[i] + sx * 1.62,
            z = RX[j] + sz * 1.62;
          cy(B.main, I4, x, CURB, z, 0.04, 1.55, C.dark, G.cyl8);
          bx(B.main, I4, x, CURB + 1.3, z, 0.2, 0.42, 0.2, C.dark);
          sp(feuxA, I4, x, CURB + 1.5, z + sz * 0.11, 0.07, 0xffffff);
          sp(feuxB, I4, x + sx * 0.11, CURB + 1.5, z, 0.07, 0xffffff);
          /* le bonhomme des piétons : il passe quand les voitures d'en face s'arrêtent */
          bx(B.main, I4, x, CURB + 0.78, z, 0.14, 0.22, 0.14, C.dark);
          sp(feuxB, I4, x, CURB + 0.84, z + sz * 0.08, 0.045, 0xffffff);
          sp(feuxA, I4, x + sx * 0.08, CURB + 0.84, z, 0.045, 0xffffff);
        }
  if (PV.eclairage >= 2)
    for (const k of [1, 2, 3])
      for (let j = 0; j < NN - 1; j++) {
        const a = RX[j] + 1.62,
          b = RX[j + 1] + 1.62,
          o = RX[k] + 1.62,
          le = rue(k, j, k, j + 1),
          ln = rue(j, k, j + 1, k);
        for (let t = 0.04; t < 0.97; t += 0.06) {
          const s = 1.9 - Math.sin(t * Math.PI) * 0.55;
          if (le) {
            sp(B.lamp, I4, o, CURB + s, a + (b - a) * t, 0.06, 0xffffff);
            ampoules.push(o, CURB + s, a + (b - a) * t);
          }
          if (ln) {
            sp(B.lamp, I4, a + (b - a) * t, CURB + s, o, 0.06, 0xffffff);
            ampoules.push(a + (b - a) * t, CURB + s, o);
          }
        }
      }

  /* ---- le reste de la ville : le décor entre les quartiers actifs */
  (function civil() {
    const Y = CURB,
      YL = CURB + 0.03;
    const roofs = TOITS;
    let ri = 0;
    const roof = () => roofs[ri++ % roofs.length];
    /* brique, pierre, ocre, enduit sauge ou bleu-gris : des façades de ville, pas des cubes de couleur vive */
    const walls = [0xc9785a, 0xe3cfa4, 0xd9a66b, 0x9fb7a0, 0x8fa3b8, 0xd08a62, 0xeadcc0];
    let wi = 0;
    const wall = () => walls[wi++ % walls.length];
    const aws = [C.orange, C.blue2, C.violet, C.yellow, C.pink, C.teal2];
    let ai = 0;
    const aw = () => aws[ai++ % aws.length];

    function towers(cx, cz, fl0) {
      /* les premiers immeubles sont bas : la ville monte avec le temps */
      const fl = PV.decor >= 4 ? fl0 : fl0.map((f) => Math.max(2, Math.ceil(f / 2)));
      apartment(cx - 2.2, cz - 2.2, 0, 3.6, 3.6, fl[0], wall(), Y, fl[0] > 7);
      apartment(cx + 2.2, cz - 2.3, 0, 3.4, 3.2, fl[1], wall(), Y, fl[1] > 7);
      apartment(cx - 2.3, cz + 2.2, 0, 3.2, 3.4, fl[2], wall(), Y, fl[2] > 7);
      apartment(cx + 2.2, cz + 2.2, 0, 3.4, 3.4, fl[3], wall(), Y, fl[3] > 7);
      arbre(cx, cz + 4.1, Y, 0.8);
      arbre(cx + 4.1, cz, Y, 0.8, true);
    }
    function shops(cx, cz, turned) {
      for (let k = 0; k < 3; k++) {
        const t = -3.1 + k * 3.1;
        if (turned) {
          shop(cx + t, cz - 2.6, Math.PI, 2.8, aw(), Y);
          shop(cx + t, cz + 2.6, 0, 2.8, aw(), Y);
        } else {
          shop(cx - 2.6, cz + t, -Math.PI / 2, 2.8, aw(), Y);
          shop(cx + 2.6, cz + t, Math.PI / 2, 2.8, aw(), Y);
        }
      }
      if (turned) {
        arbre(cx - 4.3, cz, Y, 0.75);
        arbre(cx + 4.3, cz, Y, 0.75);
      } else {
        arbre(cx, cz - 4.3, Y, 0.75);
        arbre(cx, cz + 4.3, Y, 0.75);
      }
    }
    function houses(cx, cz) {
      bx(B.ground, I4, cx, CURB, cz, 8.6, 0.03, 8.6, C.lawn);
      zone(cx - 4.2, cz - 4.2, cx + 4.2, cz + 4.2);
      for (let k = 0; k < 3; k++) {
        house(cx - 3 + k * 3, cz - 2.1, Math.PI, roof(), YL, true);
        house(cx - 3 + k * 3, cz + 2.1, 0, roof(), YL, true);
      }
      arbre(cx - 4.0, cz, YL, 0.8);
      arbre(cx - 1.5, cz, YL, 0.7, true);
      arbre(cx + 1.5, cz, YL, 0.8);
      arbre(cx + 4.0, cz, YL, 0.7, true);
    }
    function park(cx, cz) {
      const n = NQ.park;
      if (n < 1) return piquets(cx, cz);
      pre(cx, cz);
      if (n >= 2) {
        put(B.ground, G.cyl, I4, cx + 0.9, CURB + 0.04, cz + 0.5, 4.6, 0.02, 3.1, C.water);
        put(B.ground, G.cyl, I4, cx + 0.9, CURB + 0.035, cz + 0.5, 5.0, 0.02, 3.5, 0xefe9d9);
        put(B.ground, G.box, I4, cx - 2.4, CURB + 0.035, cz + 0.2, 0.7, 0.02, 8.4, C.pave);
      }
      /* les objets du parc prennent la place de quelques arbres, jamais l'inverse */
      const kiosque = aParc("kiosque"),
        jeux = aParc("jeux"),
        statue = aParc("statue"),
        pommiers = aParc("pommiers");
      const libre = (x, z) =>
        !(kiosque && Math.hypot(x + 3.2, z + 2.2) < 1.5) &&
        !(jeux && Math.hypot(x + 3.2, z - 2.8) < 1.6) &&
        !(statue && Math.hypot(x + 1.1, z + 2.2) < 0.9);
      const places = [
        [-3.4, -3.3],
        [3.7, -3.2],
        [-1.1, 3.7],
        [1.2, -3.5],
        [3.8, 3.4],
        [-3.5, -1],
        [-1.4, -3.4],
        [3.9, -1.6],
        [-3.4, 2.2],
        [1.6, 3.6],
        [-3.3, 3.9],
        [-0.8, -2.0],
      ];
      const nb = n === 1 ? 3 : n === 2 ? 7 : 12;
      const pomme = [
        [1.6, 3.6],
        [3.8, 3.4],
        [3.9, -1.6],
      ];
      places.slice(0, nb).forEach((p, i) => {
        if (!libre(p[0], p[1])) return;
        const s = 0.8 + ((i * 7) % 5) * 0.08;
        if (pommiers && pomme.some((q) => q[0] === p[0] && q[1] === p[1])) {
          tree(cx + p[0], cz + p[1], YL, s);
          for (let k = 0; k < 6; k++) {
            const a = k * 1.05;
            sp(
              B.main,
              I4,
              cx + p[0] + Math.cos(a) * 0.42 * s,
              YL + (0.86 + (k % 2) * 0.22) * s,
              cz + p[1] + Math.sin(a) * 0.42 * s,
              0.07,
              0xe5484d,
            );
          }
        } else tree(cx + p[0], cz + p[1], YL, s, i % 4 === 1);
      });
      if (aParc("bancs"))
        [
          [-1.75, -1.1, 0],
          [-1.75, 1.9, 0],
          [0.9, -1.75, Math.PI / 2],
          [0.9, 2.75, Math.PI / 2],
        ].forEach((b, i) => {
          if (n < 2 && i > 1) return;
          const P = place(cx + b[0], cz + b[1], b[2], YL);
          bxc(B.main, P, 0, 0.18, 0, 0.3, 0.06, 0.95, C.wood);
          bxc(B.main, P, -0.14, 0.24, 0, 0.05, 0.28, 0.95, C.wood);
          for (const z of [-0.38, 0.38]) bxc(B.main, P, 0, 0, z, 0.26, 0.18, 0.05, C.dark);
        });
      if (kiosque) {
        const X = cx - 3.2,
          Z = cz - 2.2;
        cy(B.main, I4, X, YL, Z, 1.0, 0.24, C.white, G.cyl8);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          cy(
            B.main,
            I4,
            X + Math.cos(a) * 0.82,
            YL + 0.24,
            Z + Math.sin(a) * 0.82,
            0.04,
            1.2,
            C.white,
            G.cyl8,
          );
        }
        put(B.main, G.cone, I4, X, YL + 1.44, Z, 2.3, 0.75, 2.3, C.teal2);
        sp(B.main, I4, X, YL + 2.26, Z, 0.1, C.gold);
      }
      if (jeux) {
        const X = cx - 3.2,
          Z = cz + 2.8;
        bx(B.ground, I4, X, YL, Z, 2.4, 0.03, 2.2, 0xf1dfb0);
        /* toboggan, balançoire, tourniquet */
        bxc(B.main, I4, X - 0.6, YL, Z - 0.5, 0.5, 0.9, 0.5, C.yellow);
        put(B.main, G.box, I4, X - 0.6, YL + 0.48, Z + 0.15, 0.36, 0.05, 1.15, C.pink, 0, 0.62);
        for (const z of [-0.6, 0.6])
          put(
            B.main,
            G.box,
            I4,
            X + 0.6,
            YL + 0.5,
            Z + z * 0.75,
            0.05,
            1.05,
            0.05,
            C.blue2,
            0,
            z * 0.5,
          );
        bxc(B.main, I4, X + 0.6, YL + 0.98, Z, 0.05, 0.05, 1.0, C.blue2);
        bxc(B.main, I4, X + 0.6, YL + 0.28, Z, 0.26, 0.04, 0.2, C.orange);
        cy(B.main, I4, X - 0.3, YL, Z + 0.75, 0.32, 0.08, C.teal);
      }
      if (statue) {
        const X = cx - 1.1,
          Z = cz - 2.2;
        bxc(B.main, I4, X, YL, Z, 0.7, 0.7, 0.7, C.white);
        cy(B.main, I4, X, YL + 0.7, Z, 0.16, 0.7, C.gold, G.cyl8);
        sp(B.main, I4, X, YL + 1.55, Z, 0.17, C.gold);
        put(B.main, G.box, I4, X + 0.18, YL + 1.3, Z, 0.07, 0.5, 0.07, C.gold, 0, 0, -0.7);
      }
      if (n >= 4) fleurs(cx, cz);
    }

    function maison(cx, cz) {
      const n = NQ.home;
      if (n < 1) return piquets(cx, cz);
      if (n < 3) {
        pre(cx, cz);
        if (n === 1) cabane(cx, cz, 0, C.orange);
        else maisonnette(cx, cz, 0, 3.6, C.wall, C.orange, C.blue2);
        /* le potager devant la porte */
        for (let k = 0; k < 4; k++)
          bx(B.ground, I4, cx - 2.6, YL, cz + 1.2 + k * 0.6, 1.8, 0.06, 0.3, 0x8a6a4a);
        for (let k = 0; k < 4; k++)
          for (let m = 0; m < 4; m++)
            sp(B.main, I4, cx - 3.3 + m * 0.45, YL + 0.12, cz + 1.2 + k * 0.6, 0.11, C.teal2);
        tree(cx + 3.0, cz + 3.0, YL, 0.85);
        if (n === 2) {
          bxc(B.main, I4, cx, YL, cz + 4.05, 8.5, 0.45, 0.35, 0x5fc48e);
          tree(cx - 3.2, cz - 3.0, YL, 0.8, true);
        }
        return;
      }
      villa(cx, cz);
      if (n >= 4) {
        fleurs(cx, cz);
        /* une girouette dorée sur le toit de la villa */
        cy(B.main, I4, cx - 1.9, YL + 2.72, cz - 1.2, 0.03, 0.9, C.gold, G.cyl8);
        put(B.main, G.box, I4, cx - 1.9, YL + 3.5, cz - 1.2, 0.6, 0.18, 0.04, C.gold);
      }
    }
    function villa(cx, cz) {
      /* la maison : volumes blancs à toit plat, noyau sombre, baies sur le jardin, terrasse, bassin, abri */
      const P = place(cx, cz, 0, YL),
        W = 0xfbfaf6,
        DK = 0x3a3f55,
        DECK = 0xd8b48a,
        HEDGE = 0x5fc48e;
      bx(B.ground, I4, cx, CURB, cz, 8.6, 0.03, 8.6, C.lawn);
      zone(cx - 4.2, cz - 4.2, cx + 4.2, cz + 4.2, 0.6);
      bxc(B.main, P, -1.0, 0, -1.6, 5.4, 1.3, 3.2, W);
      bxc(B.main, P, -1.0, 1.3, -1.6, 5.6, 0.1, 3.4, C.roof);
      bxc(B.main, P, -1.9, 1.4, -1.2, 3.6, 1.2, 3.4, 0xcda47a);
      bxc(B.main, P, -1.9, 2.6, -1.2, 3.9, 0.12, 3.7, C.roof);
      bxc(B.main, P, 0.9, 0, -2.2, 1.3, 2.9, 1.6, DK);
      // le noyau sombre : une fente vitrée sur deux faces et une corniche, plutôt qu'un cube noir
      put(B.glass, G.quad, P, 0.9, 1.7, -1.385, 0.34, 2.0, 1, 0xffffff, 0);
      put(B.glass, G.quad, P, 1.565, 1.7, -2.2, 0.34, 2.0, 1, 0xffffff, Math.PI / 2);
      bx(B.main, P, 0.9, 2.9, -2.2, 1.42, 0.08, 1.72, C.roof);
      bxc(B.main, P, 1.2, 0, 0.02, 0.7, 1.1, 0.05, DK);
      put(B.glass, G.quad, P, -1.6, 0.68, 0.015, 3.4, 0.95, 1, 0xffffff, 0);
      put(B.glass, G.quad, P, -1.9, 2.0, 0.515, 3.0, 0.8, 1, 0xffffff, 0);
      put(B.glass, G.quad, P, 1.715, 0.68, -1.0, 1.6, 0.9, 1, 0xffffff, Math.PI / 2);
      put(B.glass, G.quad, P, -0.085, 2.0, -1.2, 2.4, 0.8, 1, 0xffffff, Math.PI / 2);
      put(B.glass, G.quad, P, -1.6, 0.7, -3.215, 3.0, 0.6, 1, 0xffffff, Math.PI);
      put(B.glass, G.quad, P, -1.9, 2.0, -2.915, 2.4, 0.6, 1, 0xffffff, Math.PI);
      put(B.glass, G.quad, P, -3.715, 0.7, -1.6, 2.0, 0.6, 1, 0xffffff, -Math.PI / 2);
      put(B.glass, G.quad, P, -3.715, 2.0, -1.2, 2.0, 0.6, 1, 0xffffff, -Math.PI / 2);
      bx(B.ground, P, -1.0, 0, 1.1, 5.4, 0.08, 2.2, DECK);
      bx(B.ground, P, -0.9, 0, 3.15, 3.8, 0.07, 1.9, 0xf4f3ee);
      bx(B.ground, P, -0.9, 0.07, 3.15, 3.4, 0.012, 1.5, C.water);
      bxc(B.main, P, -2.7, 0.08, 1.25, 0.5, 0.14, 1.2, W);
      bxc(B.main, P, -2.0, 0.08, 1.25, 0.5, 0.14, 1.2, W);
      cy(B.main, P, -0.7, 0.08, 1.25, 0.035, 1.5, C.metal, G.cyl8);
      put(B.main, G.cone, P, -0.7, 1.4, 1.25, 1.7, 0.45, 1.7, 0xe5672e);
      bx(B.ground, P, 3.0, 0, 0.9, 1.9, 0.015, 6.8, C.pave);
      bxc(B.main, P, 3.0, 1.25, -2.2, 2.3, 0.1, 3.2, C.roof);
      cy(B.main, P, 3.95, 0, -0.8, 0.05, 1.25, DK, G.cyl8);
      cy(B.main, P, 3.95, 0, -3.6, 0.05, 1.25, DK, G.cyl8);
      vehicle(
        B.car,
        null,
        place(cx + 3.0, cz - 2.3, 0, YL + 0.015),
        NQ.home >= 4 && aVehicule("sport") ? "sport" : "car",
        NQ.home >= 4 && aVehicule("sport") ? 0xe5484d : C.blue2,
      );
      bxc(B.main, P, -4.05, 0, 0, 0.4, 0.5, 8.5, HEDGE);
      bxc(B.main, P, 0, 0, -4.05, 8.5, 0.5, 0.4, HEDGE);
      tree(cx - 3.4, cz + 3.3, YL, 0.85);
      tree(cx + 1.55, cz + 3.5, YL, 0.7, true);
    }

    /* haut derrière, bas devant : rien ne cache les quartiers actifs */
    /* le coin du fond reçoit la tour de la salle de marché, bâtie plus bas */
    /*
      Le décor vient par âges : des voisins (maisons), des commerces, puis des
      immeubles bas qui montent à leur hauteur au dernier âge.
    */
    /*
      Un îlot pas encore bâti n'est plus une pelouse vide avec un arbre : c'est
      de la campagne. D'abord sauvage (prairie fleurie, bosquet, étang) ; dès
      que des voisins s'installent, on la cultive (champs, verger, puis jardins
      familiaux) ; et les immeubles la remplacent au dernier âge. Chaque îlot a
      sa vocation : la ville ne se réarrange pas d'un palier à l'autre.
    */
    const tirage = (cx, cz) => rng(Math.round((cx + 50) * 977 + (cz + 50) * 131));
    const campagne = {
      /* une prairie fleurie, un groupe d'arbres dans un coin et un grand arbre seul */
      prairie(cx, cz) {
        pre(cx, cz, 1.1, 2.6);
        arbreSauvage(cx + 2.6, cz - 2.4, YL, 0.95);
        arbreSauvage(cx + 3.3, cz - 1.4, YL, 0.8, true);
        arbreSauvage(cx + 1.7, cz - 3.3, YL, 0.75);
        tree(cx - 2.4, cz + 2.2, YL, 1.15);
      },
      /* un bosquet : deux cercles d'arbres serrés, des buissons au pied, un tronc couché */
      bosquet(cx, cz) {
        const r = tirage(cx, cz),
          ox = cx - 0.8,
          oz = cz + 0.4;
        pre(cx, cz, 1);
        for (let k = 0; k < 9; k++) {
          const rad = k < 3 ? 1.0 : 2.4,
            a = (k < 3 ? k / 3 : (k - 3) / 6) * Math.PI * 2 + r() * 0.5,
            x = ox + Math.cos(a) * rad,
            z = oz + Math.sin(a) * rad;
          (k < 3 ? tree : arbreSauvage)(x, z, YL, 0.8 + r() * 0.4, k % 3 === 2);
        }
        for (let k = 0; k < 5; k++) {
          const a = r() * 6.28;
          buisson(ox + Math.cos(a) * 3.2, oz + Math.sin(a) * 3.0, YL, 1, r);
        }
        put(
          B.main,
          G.cyl8,
          I4,
          cx + 2.7,
          YL + 0.17,
          cz - 3.0,
          0.34,
          1.5,
          0.34,
          0x7a5a3e,
          0.5,
          0,
          Math.PI / 2,
        );
        for (let k = 0; k < 3; k++) caillou(cx + 2.0 + k * 0.5, cz - 2.2 + r() * 0.4, YL, 1.2, r);
      },
      /* un étang : deux lobes d'eau, une berge de sable, des roseaux, des nénuphars, un ponton */
      etang(cx, cz) {
        const r = tirage(cx, cz),
          X = cx + 0.5,
          Z = cz - 0.4;
        pre(cx, cz, 0.8);
        put(B.ground, G.cyl, I4, X, YQ, Z, 6.0, 0.02, 4.4, 0xe6dcc3);
        put(B.ground, G.cyl, I4, X - 1.9, YQ, Z + 1.6, 3.4, 0.02, 2.8, 0xe6dcc3);
        put(B.ground, G.cyl, I4, X, YQ + 0.012, Z, 5.3, 0.02, 3.7, C.water);
        put(B.ground, G.cyl, I4, X - 1.9, YQ + 0.012, Z + 1.6, 2.7, 0.02, 2.1, C.water);
        for (let k = 0; k < 6; k++) {
          const a = r() * 6.28,
            x = X + Math.cos(a) * r() * 1.8,
            z = Z + Math.sin(a) * r() * 1.1;
          put(B.ground, G.disque, I4, x, YQ + 0.036, z, 0.42, 0.006, 0.36, 0x5f9f52, a);
          if (k % 3 === 0) put(B.main, G.oct, I4, x, YQ + 0.08, z, 0.12, 0.09, 0.12, 0xf4a6c0);
        }
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2 + r() * 0.4,
            x = X + Math.cos(a) * 2.75,
            z = Z + Math.sin(a) * 1.95;
          for (let m = 0; m < 5; m++) {
            const h = 0.45 + r() * 0.35,
              bx2 = x + (r() - 0.5) * 0.35,
              bz = z + (r() - 0.5) * 0.3;
            put(
              B.main,
              G.brin,
              I4,
              bx2,
              YQ,
              bz,
              0.06,
              h,
              0.06,
              m % 2 ? 0x7f9f4f : 0x6b8e45,
              0,
              (r() - 0.5) * 0.3,
              (r() - 0.5) * 0.3,
            );
            if (m === 0) bx(B.main, I4, bx2, YQ + h - 0.05, bz, 0.05, 0.14, 0.05, 0x7a5236);
          }
        }
        // le ponton : des planches posées sur deux pieux, jusqu'à l'eau
        bx(B.main, I4, X + 2.2, YQ + 0.06, Z - 1.1, 0.6, 0.06, 1.3, 0xb08a62, -0.5);
        for (const t of [-0.45, 0.45])
          cy(B.main, I4, X + 2.2 + t * 0.48, YQ, Z - 1.1 - t * 0.88, 0.05, 0.3, 0x7a5a3e, G.cyl8);
        for (let k = 0; k < 6; k++) {
          const a = r() * 6.28;
          caillou(X + Math.cos(a) * 3.0, Z + Math.sin(a) * 2.2, YQ, 1, r);
        }
        tree(cx - 3.3, cz - 3.0, YL, 1.25);
        arbreSauvage(cx + 3.4, cz + 3.0, YL, 0.95, true);
        arbreSauvage(cx + 2.4, cz + 3.6, YL, 0.8, true);
      },
      /* des champs : blé, légumes, tournesols, une clôture de bois, deux bottes de foin */
      champ(cx, cz) {
        const r = tirage(cx, cz),
          z0 = cz - 0.7,
          L = 6.0;
        pre(cx, cz, 0.6);
        // le blé, en sillons dorés
        bx(B.ground, I4, cx - 2.6, YQ, z0, 2.5, 0.03, L, 0xd9bb62);
        for (let k = 0; k < 6; k++)
          bx(
            B.main,
            I4,
            cx - 3.6 + k * 0.4,
            YQ,
            z0,
            0.2,
            0.13,
            L - 0.2,
            k % 2 ? 0xe9cf7c : 0xd4b25a,
          );
        // les légumes, en rangs sur la terre
        bx(B.ground, I4, cx, YQ, z0, 2.5, 0.03, L, 0xa27f5a);
        for (let k = 0; k < 5; k++)
          for (let m = 0; m < 11; m++)
            put(
              B.main,
              G.oct,
              I4,
              cx - 1.0 + k * 0.5,
              YQ + 0.09,
              z0 - 2.6 + m * 0.52,
              0.26,
              0.18,
              0.26,
              k % 2 ? 0x5fa457 : 0x76b660,
              m,
            );
        // les tournesols
        bx(B.ground, I4, cx + 2.6, YQ, z0, 2.5, 0.03, L, 0x8e6c49);
        for (let k = 0; k < 4; k++)
          for (let m = 0; m < 8; m++) {
            const x = cx + 1.75 + k * 0.56,
              z = z0 - 2.55 + m * 0.72 + (r() - 0.5) * 0.12,
              h = 0.55 + r() * 0.18;
            put(B.main, G.brin, I4, x, YQ, z, 0.05, h, 0.05, 0x5f9a4c);
            put(B.main, G.disque, I4, x, YQ + h, z + 0.03, 0.2, 0.05, 0.2, 0xf2c23a, 0, 1.2);
          }
        // la clôture, sur deux côtés
        for (const [ax, az, lx, lz] of [
          [cx, cz - 4.05, 8.1, 0],
          [cx - 4.05, cz, 0, 8.1],
        ]) {
          const n = 9;
          for (let k = 0; k <= n; k++)
            bx(
              B.main,
              I4,
              ax + (lx ? -lx / 2 + (k * lx) / n : 0),
              YQ,
              az + (lz ? -lz / 2 + (k * lz) / n : 0),
              0.08,
              0.46,
              0.08,
              0x8a6a4a,
            );
          for (const y of [0.18, 0.36])
            bx(B.main, I4, ax, YQ + y, az, lx || 0.05, 0.05, lz || 0.05, 0xb08a62);
        }
        // les bottes de foin, dans l'herbe du bas du champ
        for (const [x, z, a] of [
          [cx + 1.2, cz + 3.4, 0.3],
          [cx + 2.3, cz + 3.1, 1.4],
        ]) {
          put(B.main, G.cyl12, I4, x, YQ + 0.36, z, 0.72, 0.7, 0.72, 0xe2c66b, a, 0, Math.PI / 2);
        }
        arbreSauvage(cx - 3.1, cz + 3.3, YL, 1.0);
      },
      /* un verger : neuf pommiers en quinconce, leurs fruits, une échelle, deux cagettes */
      verger(cx, cz) {
        const r = tirage(cx, cz),
          FRUITS = [0xe5484d, 0xf2924a, 0xf0c64a];
        pre(cx, cz, 0.8);
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 3; j++) {
            const x = cx - 2.7 + i * 2.7 + (j % 2 ? 0.5 : -0.3) + (r() - 0.5) * 0.3,
              z = cz - 2.6 + j * 2.6 + (r() - 0.5) * 0.3,
              s = 0.62 + r() * 0.14,
              c = FRUITS[(i + j) % 3];
            tree(x, z, YL, s);
            for (let k = 0; k < 6; k++) {
              const a = k * 1.05 + r();
              put(
                B.main,
                G.oct,
                I4,
                x + Math.cos(a) * 0.44 * s,
                YL + (0.82 + (k % 2) * 0.26) * s,
                z + Math.sin(a) * 0.44 * s,
                0.13,
                0.13,
                0.13,
                c,
                a,
              );
            }
          }
        // l'échelle appuyée contre un arbre
        const P = place(cx + 0.6, cz + 0.2, 0.4, YL);
        for (const t of [-0.16, 0.16])
          put(B.main, G.box, P, t, 0.5, 0, 0.05, 1.1, 0.05, 0xb08a62, 0, 0.32);
        for (let k = 0; k < 4; k++)
          bx(B.main, P, 0, 0.18 + k * 0.24, -0.06 - k * 0.075, 0.32, 0.04, 0.04, 0xb08a62);
        for (const [x, z] of [
          [cx - 3.6, cz + 3.6],
          [cx - 3.0, cz + 3.7],
        ]) {
          bxc(B.main, I4, x, YL, z, 0.5, 0.3, 0.36, 0xc9a06e);
          for (let k = 0; k < 4; k++)
            sp(
              B.main,
              I4,
              x - 0.12 + (k % 2) * 0.24,
              YL + 0.33,
              z - 0.08 + (k > 1 ? 0.16 : 0),
              0.09,
              0xe5484d,
              G.oct,
            );
        }
      },
      /* les jardins familiaux : quatre parcelles autour d'allées de gravier, une cabane à outils */
      jardins(cx, cz) {
        const r = tirage(cx, cz);
        pre(cx, cz, 0.5);
        bx(B.ground, I4, cx, YQ, cz, 0.7, 0.03, 8.2, 0xe6dccb);
        bx(B.ground, I4, cx, YQ, cz, 8.2, 0.03, 0.7, 0xe6dccb);
        const parcelle = (sx, sz) => {
          const x = cx + sx * 2.1,
            z = cz + sz * 2.1;
          bx(B.ground, I4, x, YQ, z, 3.1, 0.04, 3.1, 0x9c7b58);
          return [x, z];
        };
        // salades
        let [x, z] = parcelle(-1, -1);
        for (let i = 0; i < 5; i++)
          for (let j = 0; j < 5; j++)
            put(
              B.main,
              G.caillou,
              I4,
              x - 1.2 + i * 0.6,
              YQ + 0.1,
              z - 1.2 + j * 0.6,
              0.32,
              0.2,
              0.32,
              j % 2 ? 0x8fd16f : 0x7cc062,
              r() * 6,
            );
        // tomates, sur leurs tuteurs
        [x, z] = parcelle(1, -1);
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 4; j++) {
            const tx = x - 1.0 + i * 1.0,
              tz = z - 1.1 + j * 0.74;
            bx(B.main, I4, tx, YQ, tz, 0.04, 0.62, 0.04, 0xb08a62);
            put(B.main, G.caillou, I4, tx, YQ + 0.36, tz, 0.3, 0.4, 0.3, 0x5f9f52, r() * 6);
            for (let k = 0; k < 2; k++)
              put(
                B.main,
                G.oct,
                I4,
                tx + (k ? 0.1 : -0.09),
                YQ + 0.3 + k * 0.12,
                tz + 0.1,
                0.1,
                0.1,
                0.1,
                0xe5484d,
              );
          }
        // fleurs à couper
        [x, z] = parcelle(-1, 1);
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 4; j++) fleurs3(x - 1.1 + i * 0.73, z - 1.1 + j * 0.73, YQ + 0.02, r);
        // la cabane à outils, les potirons et le récupérateur d'eau
        [x, z] = parcelle(1, 1);
        const P = place(x + 0.6, z + 0.55, Math.PI, YQ);
        bxc(B.main, P, 0, 0, 0, 1.3, 1.0, 1.0, 0xa5825c);
        put(B.main, G.prism, P, 0, 1.0, 0, 1.2, 0.5, 1.5, 0x6f5a46, Math.PI / 2);
        bx(B.main, P, -0.25, 0, 0.51, 0.4, 0.72, 0.04, 0x7a5a3e);
        cy(B.main, I4, x - 0.2, YQ, z + 1.05, 0.22, 0.55, 0x4f7a5c, G.cyl8);
        for (let k = 0; k < 5; k++)
          put(
            B.main,
            G.caillou,
            I4,
            x - 1.1 + (k % 3) * 0.55,
            YQ + 0.13,
            z - 1.0 + Math.floor(k / 3) * 0.6,
            0.38,
            0.28,
            0.38,
            0xf08a2c,
            r() * 6,
          );
      },
    };
    const friche = (cx, cz, voulue) => {
      const sorte =
        (voulue === "champ" || voulue === "verger") && PV.decor < 1
          ? "prairie"
          : voulue === "jardins" && PV.decor < 2
            ? "bosquet"
            : voulue;
      campagne[sorte](cx, cz);
    };
    const immeubles = (cx, cz, fl, voulue) =>
      PV.decor >= 3 ? towers(cx, cz, fl) : friche(cx, cz, voulue);
    immeubles(BC[1], BC[0], [6, 9, 4, 5], "bosquet");
    immeubles(BC[2], BC[0], [10, 7, 6, 4], "champ");
    immeubles(BC[3], BC[0], [5, 7, 3, 4], "verger");
    immeubles(BC[0], BC[1], [8, 5, 6, 4], "etang");
    immeubles(BC[0], BC[3], [4, 6, 3, 5], "jardins");
    maison(BC[0], BC[2]);
    if (PV.decor >= 2) {
      shops(BC[2], BC[1], false);
      shops(BC[1], BC[2], true);
    } else {
      friche(BC[2], BC[1], "prairie");
      friche(BC[1], BC[2], "champ");
    }
    if (PV.decor >= 1) houses(BC[3], BC[2]);
    else friche(BC[3], BC[2], "verger");
    /* l'îlot de devant, entre l'école et le parc, reçoit la bibliothèque, bâtie plus bas */
    park(PKX, PKZ);

    /* couronne de maisons, avec un parc de stationnement et des bosquets */
    const E = RING + 2.5,
      ringTrees = [];
    let rang = 0;
    const voisin = () => {
      const r = rang++ % 3;
      return PV.decor >= 3 || (PV.decor === 2 && r !== 2) || (PV.decor === 1 && r === 0);
    };
    /*
      Pas deux maisons exactement alignées : chacune avance ou recule d'un
      rien et glisse un peu le long de la rue, comme dans un vrai bourg. Les
      trouées de la rangée deviennent de petits bosquets.
    */
    const glisse = (a, b2, k) => (h01(a, b2, k) - 0.5) * 0.3;
    const recul = (a, b2) => (h01(a, b2, 11) - 0.5) * 0.36;
    const bosquet = (x, z) => {
      ringTrees.push([x, z]);
      ringTrees.push([x + 0.9 * (h01(x, z, 12) - 0.5), z + 0.9 * (h01(x, z, 13) - 0.5)]);
    };
    for (let i = 0; i < 16; i++) {
      const x = -27 + i * 3.6;
      if (i % 4 === 3) bosquet(x, -E + 0.2);
      else if (voisin()) house(x + glisse(x, -E, 9), -E + recul(x, -E), 0, roof(), YL);
      ringTrees.push([x + 1.8, -E - 0.75]);
      if (Math.abs(x) < 6) bosquet(x, E + 0.1);
      else if (voisin()) house(x + glisse(x, E, 9), E + recul(x, E), Math.PI, roof(), YL);
      ringTrees.push([x + 1.8, E + 0.75]);
    }
    for (let i = 0; i < 14; i++) {
      const z = -23.4 + i * 3.6;
      if (i % 4 === 2) bosquet(-E, z);
      else if (voisin()) house(-E + recul(-E, z), z + glisse(-E, z, 9), Math.PI / 2, roof(), YL);
      ringTrees.push([-E - 0.8, z + 1.8]);
      if (Math.abs(z) > 7.3) {
        if (voisin()) house(E + recul(E, z), z + glisse(E, z, 9), -Math.PI / 2, roof(), YL);
        ringTrees.push([E + 0.8, z + 1.8]);
      }
    }
    ringTrees.forEach((p, i) =>
      arbre(
        p[0] + (h01(p[0], p[1], 14) - 0.5) * 0.6,
        p[1] + (h01(p[0], p[1], 15) - 0.5) * 0.5,
        YL,
        rr(0.75, 1.05),
        i % 3 === 0,
      ),
    );
    // les pelouses de la couronne, à semer comme les prés
    const r0 = RING + 0.45,
      r1 = RING + 4.15;
    zone(-r1, -r1, r1, -r0);
    zone(-r1, r0, r1, r1);
    zone(-r1, -r0, -r0, r0);
    zone(r0, -r0, r1, r0);
    [
      [-E - 0.2, -E + 0.1],
      [-E + 1.2, -E - 0.8],
      [E - 0.1, -E - 0.2],
      [E + 0.8, -E + 1.1],
      [-E - 0.1, E + 0.1],
      [-E - 0.8, E - 1.2],
      [E + 0.2, E - 0.1],
      [E - 1.1, E + 0.8],
    ].forEach((p) => arbre(p[0], p[1], YL, rr(0.9, 1.2), true));

    /* stationnement sur le bord droit, quand la ville est dense */
    if (PV.decor < 4) return;
    const px = RING + 2.25,
      Yp = YL + 0.012;
    bx(B.ground, I4, px, YL, 0, 3.5, 0.012, 11, 0xdfe2e8);
    // trop grand pour le registre (il le prendrait pour une pelouse) : on le réserve à la main
    marquer(px - 1.75, -5.5, px + 1.75, 5.5);
    for (let k = 0; k <= 8; k++)
      bx(B.ground, I4, px + 0.25, YL + 0.012, -5 + k * 1.25, 2.6, 0.01, 0.07, 0xffffff);
    [
      ["van", C.blue],
      ["car", C.pink],
      ["van", C.violet],
      null,
      ["car", C.yellow],
      ["van", C.orange],
      null,
      ["car", C.blue2],
    ].forEach((v, k) => {
      if (v)
        vehicle(
          B.car,
          null,
          place(px + (v[0] === "van" ? 0.35 : 0.5), -4.375 + k * 1.25, -Math.PI / 2, Yp),
          v[0],
          v[1],
        );
    });
  })();

  /* ---- Place centrale : une tour d'horloge dans une fontaine */
  const clockFaces = [],
    flammes = [];
  (function plaza() {
    const Y = CURB,
      X = PLX,
      Z = PLZ,
      n = NQ.plaza;
    if (n < 1) return piquets(X, Z);
    if (n === 1) {
      /* le feu de camp : un cercle de pierres, des bûches, des rondins pour s'asseoir */
      pre(X, Z);
      put(B.ground, G.cyl, I4, X, YQ, Z, 3.2, 0.02, 3.2, 0xe0cfae);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        sp(B.main, I4, X + Math.cos(a) * 0.62, YQ + 0.08, Z + Math.sin(a) * 0.62, 0.14, 0x9a9488);
      }
      for (const a of [0.4, 1.9, 3.3])
        put(B.main, G.cyl8, I4, X, YQ + 0.1, Z, 0.14, 0.9, 0.14, 0x6e5238, a, Math.PI / 2);
      for (const [h, r, c] of [
        [0.95, 0.32, 0xf6a23a],
        [0.6, 0.18, C.yellow],
      ]) {
        const m = new T.Mesh(G.cone, matFlamme.clone());
        m.material.color.set(c);
        m.position.set(X, YQ + 0.12, Z);
        m.scale.set(r * 2, h, r * 2);
        scene.add(m);
        flammes.push(m);
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.6;
        put(
          B.main,
          G.cyl8,
          I4,
          X + Math.cos(a) * 1.7,
          YQ + 0.16,
          Z + Math.sin(a) * 1.7,
          0.32,
          1.1,
          0.32,
          C.wood,
          -a,
          Math.PI / 2,
        );
      }
      return;
    }
    put(B.ground, G.cyl, I4, X, Y + 0.012, Z, 8.6, 0.02, 8.6, C.plaza2);
    put(B.ground, G.cyl, I4, X, Y + 0.024, Z, 6.0, 0.02, 6.0, C.plaza);
    cy(B.main, I4, X, Y, Z, 2.3, 0.32, C.white);
    put(B.ground, G.cyl, I4, X, Y + 0.34, Z, 4.2, 0.02, 4.2, C.water);
    cy(B.main, I4, X, Y, Z, n === 2 ? 0.5 : 1.25, 0.62, C.white);
    if (n >= 3) clocher();
    [
      [3.9, 3.9],
      [-3.9, 3.9],
      [3.9, -3.9],
      [-3.9, -3.9],
    ].forEach((p) => {
      if (n >= 4) {
        /* la place d'honneur : des mâts à oriflammes à la place des bacs */
        cy(B.main, I4, X + p[0], Y, Z + p[1], 0.05, 3.4, C.white, G.cyl8);
        put(
          B.main,
          G.box,
          I4,
          X + p[0] + 0.32,
          Y + 3.0,
          Z + p[1],
          0.6,
          0.7,
          0.03,
          p[0] > 0 ? C.violet : C.gold,
        );
        sp(B.main, I4, X + p[0], Y + 3.45, Z + p[1], 0.08, C.gold);
        return;
      }
      cy(B.main, I4, X + p[0], Y, Z + p[1], 0.55, 0.22, C.white);
      tree(X + p[0], Z + p[1], Y + 0.2, 1.05);
    });
    if (n >= 4)
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        sp(
          B.main,
          I4,
          X + Math.cos(a) * 2.75,
          Y + 0.12,
          Z + Math.sin(a) * 2.75,
          0.17,
          [C.pink, C.yellow, 0xffffff, C.violet][k % 4],
        );
      }
    lamp(X + 4.55, Z + 2.3, Y);
    lamp(X - 4.55, Z - 2.3, Y);
    lamp(X + 2.3, Z - 4.55, Y);
    lamp(X - 2.3, Z + 4.55, Y);
  })();
  function clocher() {
    const Y = CURB,
      X = PLX,
      Z = PLZ;
    bxc(B.main, I4, X, Y + 0.62, Z, 1.5, 5.6, 1.5, C.white);
    bxc(B.main, I4, X, Y + 2.3, Z, 1.62, 0.16, 1.62, C.violet);
    bxc(B.main, I4, X, Y + 4.4, Z, 1.62, 0.16, 1.62, C.violet);
    bxc(B.main, I4, X, Y + 6.22, Z, 2.0, 1.9, 2.0, C.violet);
    bxc(B.main, I4, X, Y + 8.12, Z, 2.2, 0.14, 2.2, C.white);
    put(B.main, G.pyr, I4, X, Y + 8.26, Z, 2.1, 1.5, 2.1, C.violet2);
    sp(B.main, I4, X, Y + 9.9, Z, 0.17, C.gold);
    const disc = new T.CircleGeometry(0.74, 28);
    const hGeo = new T.BoxGeometry(0.1, 0.4, 0.03).translate(0, 0.17, 0.03),
      mGeo = new T.BoxGeometry(0.065, 0.6, 0.03).translate(0, 0.26, 0.05);
    for (let k = 0; k < 4; k++) {
      const g = new T.Group(),
        a = (k * Math.PI) / 2;
      g.position.set(X + Math.sin(a) * 1.012, Y + 7.17, Z + Math.cos(a) * 1.012);
      g.rotation.y = a;
      const face = new T.Mesh(disc, matClock),
        hh = new T.Mesh(hGeo, matDark),
        mm = new T.Mesh(mGeo, matDark);
      g.add(face, hh, mm);
      scene.add(g);
      clockFaces.push({ hh, mm });
    }
  }

  /* ---- École : les tâches */
  const PU = place(UNX, UNZ, Math.PI / 2, CURB);
  const uniPt = (x, y, z) => new T.Vector3(x, y, z).applyMatrix4(PU);
  (function university() {
    const n = NQ.uni;
    if (n < 1) return piquets(UNX, UNZ);
    if (n < 3) {
      pre(UNX, UNZ);
      if (n === 1) {
        /* l'école sous un toit de planches : une cloche sur un poteau, un tableau noir */
        const P = cabane(UNX, UNZ, Math.PI / 2, C.blue2);
        cy(B.main, P, 1.6, 0, 0.9, 0.05, 1.7, C.wood, G.cyl8);
        bxc(B.main, P, 1.6, 1.65, 0.9, 0.5, 0.06, 0.08, C.wood);
        put(B.main, G.cone, P, 1.6, 1.25, 0.9, 0.3, 0.32, 0.3, C.gold);
        bxc(B.main, P, -1.6, 0, 1.2, 1.1, 1.0, 0.08, C.wood);
        bxc(B.main, P, -1.6, 0.35, 1.25, 0.95, 0.6, 0.02, 0x2f4a3a);
      } else {
        const P = maisonnette(UNX, UNZ, Math.PI / 2, 4.4, C.white, C.blue2, C.blue);
        /* le clocheton dit déjà « école » */
        bxc(B.main, P, -1.2, 2.3, -0.6, 0.7, 0.8, 0.7, C.white);
        put(B.main, G.pyr, P, -1.2, 3.1, -0.6, 0.85, 0.7, 0.85, C.blue2);
        put(B.main, G.cone, P, -1.2, 2.45, -0.6, 0.32, 0.3, 0.32, C.gold);
      }
      tree(uniPt(3.9, 0, 3.7).x, uniPt(3.9, 0, 3.7).z, CURB, 0.9);
      return;
    }
    if (n >= 4) fleurs(UNX, UNZ);
    bxc(B.main, PU, 0, 0, -2.5, 8.2, 2.5, 3.0, C.blue);
    bxc(B.main, PU, 0, 2.5, -2.5, 8.4, 0.14, 3.2, C.roof);
    for (const x of [-3.3, -2.3, 2.3, 3.3])
      for (const z of [-3.1, -1.9]) put(B.main, G.box, PU, x, 2.67, z, 0.8, 0.04, 0.9, C.panel);
    for (const s of [-1, 1]) {
      bxc(B.main, PU, s * 3.0, 0, 0.7, 2.2, 2.0, 3.4, C.blue);
      bxc(B.main, PU, s * 3.0, 2.0, 0.7, 2.4, 0.14, 3.6, C.roof);
      windowsOn(
        WIN,
        place(0, 0, 0, 0)
          .copy(PU)
          .multiply(new T.Matrix4().makeTranslation(s * 3.0, 0, 0.7)),
        2.2,
        3.4,
        0.1,
        2,
        0.9,
        R,
      );
    }
    windowsOn(
      WIN,
      new T.Matrix4().copy(PU).multiply(new T.Matrix4().makeTranslation(0, 0, -2.5)),
      8.2,
      3.0,
      0.1,
      3,
      0.8,
      R,
      { faces: [1, 2, 3] },
    );
    bxc(B.main, PU, 0, 0, -0.1, 3.8, 0.14, 1.9, C.white);
    bxc(B.main, PU, 0, 0.14, -0.35, 3.4, 0.12, 1.3, C.white);
    for (const x of [-1.2, -0.4, 0.4, 1.2]) cy(B.main, PU, x, 0.26, -0.3, 0.15, 2.0, C.white);
    bxc(B.main, PU, 0, 2.26, -0.55, 3.2, 0.26, 1.1, C.white);
    put(B.main, G.prism, PU, 0, 2.52, -0.55, 3.2, 0.8, 1.1, C.white);
    bxc(B.main, PU, 0, 0.26, -0.98, 1.0, 1.5, 0.06, 0xffffff);
    cy(B.main, PU, 0, 2.64, -2.5, 0.82, 0.7, C.white);
    put(B.main, G.sph2, PU, 0, 3.34, -2.5, 1.56, 1.3, 1.56, n >= 4 ? C.gold : C.blue2);
    cy(B.main, PU, 0, 3.95, -2.5, 0.035, 1.35, C.metal, G.cyl8);
    const t1 = uniPt(3.9, 0, 3.7),
      t2 = uniPt(-3.9, 0, 3.7),
      t3 = uniPt(-3.95, 0, -4.2 + 8),
      t4 = uniPt(0, 0, 3.9);
    tree(t1.x, t1.z, CURB, 0.95);
    tree(t2.x, t2.z, CURB, 0.95);
    void t3;
    void t4;
  })();
  const flag = new T.Mesh(new T.PlaneGeometry(0.75, 0.44).translate(0.375, 0, 0), matFlag);
  flag.position.copy(uniPt(0, 5.0, -2.5));
  flag.visible = NQ.uni >= 3;
  scene.add(flag);

  /*
    ---- Bibliothèque : une pile de livres sur le parvis par livre terminé
    dans l'année, des lecteurs sur les marches tant qu'un livre est en cours
  */
  const LBX = BC[2],
    LBZ = BC[3];
  const piles = [],
    lecteurSlots = [];
  (function bibliotheque() {
    const P = place(LBX, LBZ, 0, CURB),
      PIERRE = 0xf3e9d6,
      TOIT = 0xb5533c,
      n = NQ.library;
    if (n < 1) return piquets(LBX, LBZ);
    if (n < 3) {
      pre(LBX, LBZ);
      const Q =
        n === 1
          ? cabane(LBX - 1.2, LBZ - 0.6, 0, C.blue2)
          : maisonnette(LBX, LBZ, 0, 4.6, PIERRE, TOIT, C.blue2);
      /* la boîte à livres : on en prend un, on en laisse un */
      const bx0 = n === 1 ? 2.6 : 3.1;
      cy(B.main, Q, bx0, 0, 1.4, 0.05, 0.9, C.wood, G.cyl8);
      bxc(B.main, Q, bx0, 0.9, 1.4, 0.8, 0.6, 0.5, C.blue2);
      put(B.main, G.prism, Q, bx0, 1.5, 1.4, 0.6, 0.25, 0.9, C.blue, Math.PI / 2);
      [C.orange, C.yellow, C.pink, C.teal].forEach((c, i) =>
        bxc(B.main, Q, bx0 - 0.27 + i * 0.18, 0.98, 1.66, 0.14, 0.36, 0.02, c),
      );
      if (n === 2) {
        put(B.main, G.box, Q, -0.3, 2.05, 0.82, 0.6, 0.06, 0.4, 0xffffff, 0, Math.PI / 2, 0.4);
        put(B.main, G.box, Q, 0.3, 2.05, 0.82, 0.6, 0.06, 0.4, 0xffffff, 0, Math.PI / 2, -0.4);
      }
      tree(LBX + 4.0, LBZ + 3.9, YQ, 0.75, true);
      return;
    }
    if (n >= 4) fleurs(LBX, LBZ);
    bx(B.ground, I4, LBX, CURB, LBZ + 2.6, 8.8, 0.03, 3.4, 0xf4e8d2);
    /* le corps : un volume de pierre claire, un toit de tuile */
    bxc(B.main, P, 0, 0, -1.9, 7.6, 0.4, 4.6, C.white);
    bxc(B.main, P, 0, 0.4, -1.9, 7.0, 2.6, 4.0, PIERRE);
    bxc(B.main, P, 0, 3.0, -1.9, 7.3, 0.16, 4.3, C.white);
    put(B.main, G.prism, P, 0, 3.16, -1.9, 7.3, 1.1, 4.3, TOIT);
    /* le porche : quatre colonnes, un fronton */
    bxc(B.main, P, 0, 0, 0.55, 4.6, 0.14, 0.5, C.white);
    bxc(B.main, P, 0, 0.14, 0.3, 4.6, 0.14, 0.5, C.white);
    for (const x of [-1.65, -0.55, 0.55, 1.65]) cy(B.main, P, x, 0.4, 0.35, 0.17, 2.1, C.white);
    bxc(B.main, P, 0, 2.5, 0.2, 4.4, 0.26, 0.9, C.white);
    put(B.main, G.prism, P, 0, 2.76, 0.2, 4.4, 0.8, 0.9, C.white);
    bxc(B.main, P, 0, 0.4, 0.12, 1.1, 1.6, 0.06, TOIT);
    /* l'enseigne : un livre ouvert sur le faîte */
    put(B.main, G.box, P, -0.52, 4.75, -1.9, 1.05, 0.1, 1.5, 0xffffff, 0, 0, 0.42);
    put(B.main, G.box, P, 0.52, 4.75, -1.9, 1.05, 0.1, 1.5, 0xffffff, 0, 0, -0.42);
    const reliure = n >= 4 ? C.gold : C.blue2;
    put(B.main, G.box, P, -0.54, 4.69, -1.9, 1.15, 0.08, 1.62, reliure, 0, 0, 0.42);
    put(B.main, G.box, P, 0.54, 4.69, -1.9, 1.15, 0.08, 1.62, reliure, 0, 0, -0.42);
    bxc(B.main, P, 0, 4.3, -1.9, 0.14, 0.3, 1.62, reliure);
    put(B.winA, G.quad, P, -2.45, 1.7, 0.115, 1.2, 1.5, 1, 0xffffff, 0);
    put(B.winA, G.quad, P, 2.45, 1.7, 0.115, 1.2, 1.5, 1, 0xffffff, 0);
    windowsOn(
      WIN,
      new T.Matrix4().copy(P).multiply(new T.Matrix4().makeTranslation(0, 0, -1.9)),
      7.0,
      4.0,
      0.5,
      2,
      1.2,
      R,
      { faces: [1, 2, 3] },
    );
    tree(LBX - 4.1, LBZ + 4.0, CURB + 0.03, 0.75);
    tree(LBX + 4.1, LBZ + 4.0, CURB + 0.03, 0.75, true);
    lamp(LBX - 3.2, LBZ + 1.3, CURB);
    lamp(LBX + 3.2, LBZ + 1.3, CURB);
    /* les piles : de trois à six livres, aux couvertures de toutes les couleurs */
    const couvertures = [C.blue2, C.orange, C.teal, C.violet, C.yellow, C.pink, C.blue, C.teal2];
    for (let k = 0; k < 8; k++) {
      const b = new Batch(),
        tx = -3.3 + (k % 4) * 2.2,
        tz = k < 4 ? 2.0 : 3.5,
        Pt = place(LBX + tx, LBZ + tz, 0, CURB + 0.03),
        n = 3 + (k % 4);
      for (let i = 0; i < n; i++)
        put(
          b,
          G.box,
          Pt,
          0,
          0.09 + i * 0.17,
          0,
          0.62,
          0.15,
          0.46,
          couvertures[(k + i) % couvertures.length],
          (i % 3) * 0.35 - 0.3,
        );
      const m = b.mesh(matStatic, true);
      m.visible = false;
      scene.add(m);
      piles.push(m);
    }
    for (let k = 0; k < 6; k++) lecteurSlots.push([LBX - 2.2 + k * 0.88, LBZ + 1.05]);
  })();

  /* ---- Boutique de cartes : un présentoir en terrasse par objet mis en vente */
  const tables = [],
    dinerSlots = [];
  (function restaurant() {
    const P = place(RSX, RSZ, 0, CURB),
      n = NQ.shop;
    if (n < 1) return piquets(RSX, RSZ);
    if (n === 1) {
      /* l'échoppe : un comptoir sous une toile, quelques caisses */
      pre(RSX, RSZ);
      const Q = place(RSX, RSZ - 0.5, 0, YQ);
      for (const x of [-1.2, 1.2])
        for (const z of [-0.6, 0.6]) cy(B.main, Q, x, 0, z, 0.05, 1.6, C.wood, G.cyl8);
      bxc(B.main, Q, 0, 0, 0.5, 2.6, 0.8, 0.5, C.wood);
      put(B.main, G.prism, Q, 0, 1.6, 0, 1.6, 0.5, 2.8, C.orange, Math.PI / 2);
      [C.yellow, C.pink, C.teal, C.blue2].forEach((c, i) =>
        bxc(B.main, Q, -0.9 + i * 0.6, 0.8, 0.5, 0.36, 0.14, 0.3, c),
      );
      for (const [x, z] of [
        [1.9, 1.0],
        [2.3, 0.4],
        [1.95, 0.4],
      ])
        bxc(B.main, Q, x, z === 1.0 ? 0 : 0.4, z, 0.4, 0.4, 0.4, 0xb08a62);
      return;
    }
    if (n === 2) {
      pre(RSX, RSZ);
      shop(RSX - 1.6, RSZ - 1.0, 0, 3.0, C.orange, YQ);
      shop(RSX + 1.6, RSZ - 1.0, 0, 3.0, C.blue2, YQ);
      tree(RSX + 4.0, RSZ + 3.9, YQ, 0.7);
      return;
    }
    if (n >= 4) fleurs(RSX, RSZ);
    bx(B.ground, I4, RSX, CURB, RSZ + 1.7, 8.8, 0.03, 5.2, 0xf4e8d2);
    bxc(B.main, P, 0, 0, -2.5, 7.0, 2.7, 3.2, C.orange);
    bxc(B.main, P, 0, 2.7, -2.5, 7.2, 0.14, 3.4, C.roof);
    /* enseigne : trois cartes dressées sur le toit, en éventail */
    bxc(B.main, P, 1.2, 2.84, -2.5, 3.0, 0.16, 0.7, C.white);
    [
      [0.25, C.blue2, 0.22],
      [1.2, n >= 4 ? C.gold : C.yellow, 0],
      [2.15, C.pink, -0.22],
    ].forEach((c) => {
      put(B.main, G.box, P, c[0], 3.9, -2.5, 1.0, 1.5, 0.1, C.white, 0, 0, c[2]);
      put(B.main, G.box, P, c[0], 3.9, -2.44, 0.82, 1.3, 0.06, c[1], 0, 0, c[2]);
      put(B.main, G.cyl, P, c[0], 4.0, -2.39, 0.42, 0.04, 0.42, C.white, 0, Math.PI / 2, c[2]);
    });
    for (let k = 0; k < 7; k++)
      put(
        B.main,
        G.box,
        P,
        -3 + k,
        1.95,
        -0.5,
        1.0,
        0.08,
        0.9,
        k % 2 ? C.white : 0xe5672e,
        0,
        0.34,
      );
    bxc(B.main, P, 0, 0, -0.87, 1.0, 1.6, 0.06, 0xffffff);
    put(B.winA, G.quad, P, -2.1, 0.95, -0.885, 1.9, 1.1, 1, 0xffffff, 0);
    put(B.winA, G.quad, P, 2.1, 0.95, -0.885, 1.9, 1.1, 1, 0xffffff, 0);
    windowsOn(
      WIN,
      new T.Matrix4().copy(P).multiply(new T.Matrix4().makeTranslation(0, 0, -2.5)),
      7.0,
      3.2,
      0.3,
      2,
      1.1,
      R,
      { faces: [1, 2, 3] },
    );
    tree(RSX - 4.1, RSZ + 4.0, CURB + 0.03, 0.7);
    tree(RSX + 4.1, RSZ + 4.0, CURB + 0.03, 0.7);
    for (let k = 0; k < 8; k++) {
      const b = new Batch(),
        tx = -3.0 + (k % 4) * 2.0,
        tz = k < 4 ? 1.0 : 3.1,
        Pt = place(RSX + tx, RSZ + tz, 0, CURB + 0.03);
      cy(b, Pt, 0, 0, 0, 0.035, 1.75, C.metal, G.cyl8);
      cy(b, Pt, 0, 0.52, 0, 0.42, 0.06, C.white);
      put(b, G.cone, Pt, 0, 1.55, 0, 1.9, 0.5, 1.9, k % 2 ? C.white : 0xe5672e);
      const m = b.mesh(matStatic, true);
      m.visible = false;
      scene.add(m);
      tables.push(m);
      dinerSlots.push([RSX + tx - 0.62, RSZ + tz], [RSX + tx + 0.62, RSZ + tz]);
    }
  })();

  /* ---- la banque et la salle de marché, avant d'être des tours */
  (function premiersAges() {
    const nb = NQ.bank,
      nt = NQ.tower;
    if (nb < 1) piquets(BKX, BKZ);
    else if (nb < 3) {
      pre(BKX, BKZ);
      if (nb === 1) {
        /* le coffre en bois, cerclé et cadenassé d'or */
        const P = cabane(BKX - 1.0, BKZ - 0.8, 0, C.teal2);
        bxc(B.main, P, 2.6, 0, 1.0, 1.3, 0.7, 0.85, 0x9b7650);
        for (const x of [-0.45, 0.45]) bxc(B.main, P, 2.6 + x, 0, 1.0, 0.08, 0.72, 0.88, C.gold);
        bxc(B.main, P, 2.6, 0.32, 1.44, 0.2, 0.22, 0.04, C.gold);
      } else {
        const P = maisonnette(BKX, BKZ, 0, 4.4, C.white, C.teal, C.teal2);
        for (const x of [-0.7, 0.7]) cy(B.main, P, x, 0, 1.2, 0.12, 1.7, C.white);
        bxc(B.main, P, 0, 1.7, 1.0, 2.0, 0.16, 0.7, C.white);
        put(B.main, G.cyl, P, 0, 2.2, 0.83, 0.5, 0.05, 0.5, C.gold, 0, Math.PI / 2);
      }
    }
    if (nt < 1) piquets(TWX, TWZ);
    else if (nt < 3) {
      pre(TWX, TWZ);
      const P =
        nt === 1
          ? cabane(TWX, TWZ - 0.6, 0, 0x27306b)
          : maisonnette(TWX, TWZ, 0, 4.4, 0x27306b, C.white, C.yellow);
      /* le tableau des cours : une courbe qui monte, sur fond sombre */
      const yb = nt === 1 ? 0 : 0.1,
        zb = nt === 1 ? 1.6 : 1.9;
      for (const x of [-1.0, 1.0]) cy(B.main, P, x, 0, zb, 0.05, 1.6 + yb, C.wood, G.cyl8);
      bxc(B.main, P, 0, 0.9 + yb, zb + 0.05, 2.1, 0.8, 0.06, C.dark);
      [0.1, 0.25, 0.18, 0.4, 0.33, 0.55].forEach((h, i) =>
        bx(
          B.main,
          P,
          -0.8 + i * 0.32,
          1.0 + yb,
          zb + 0.09,
          0.2,
          h,
          0.02,
          i % 3 === 2 ? 0xe5484d : C.teal,
        ),
      );
    }
  })();

  /*
    ---- les semis

    Tout est bâti : on sème la petite nature dans ce qui reste de pelouse.
    Les places des passants (le tour de la place, celui de l'étang, les
    étudiants, les clients, les lecteurs) restent dégagées : personne ne doit
    marcher dans un buisson. Moins de pièces en rendu logiciel, où chaque
    triangle se calcule au processeur.
  */
  (function semer() {
    suivi = false;
    for (const [x, z] of dinerSlots.concat(lecteurSlots))
      marquer(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
    for (let a = 0; a < 5; a++)
      for (let b2 = 0; b2 < 2; b2++) {
        const p = uniPt(-1.5 + a * 0.75, 0, 1.1 + b2 * 1.4);
        marquer(p.x - 0.45, p.z - 0.45, p.x + 0.45, p.z + 0.45);
      }
    const passage = (x, z) => {
      if (NQ.plaza >= 1) {
        const d = Math.hypot(x - PLX, z - PLZ);
        if (d > 2.2 && d < 3.5) return true;
      }
      if (NQ.park >= 2) {
        const e = Math.hypot((x - PKX - 0.9) / 2.75, (z - PKZ - 0.5) / 1.95);
        if (e > 0.8 && e < 1.25) return true;
      }
      return false;
    };
    const part = legere ? 0.4 : 1;
    /*
      Un quartier encore jeune (une cabane, une maison) laissait un grand
      carré de pelouse nue autour : quelques arbres viennent dans les coins et
      les milieux de côtés restés libres, comme au fond d'un jardin.
    */
    for (const zn of zones) {
      if (zn.x1 - zn.x0 > 9) continue; // la couronne a déjà ses arbres
      const cx = (zn.x0 + zn.x1) / 2,
        cz = (zn.z0 + zn.z1) / 2;
      let n = 0;
      for (const [dx, dz] of [
        [-3.3, -3.3],
        [3.3, 3.3],
        [3.3, -3.3],
        [-3.3, 3.3],
        [0, -3.5],
        [3.5, 0],
        [0, 3.5],
        [-3.5, 0],
      ]) {
        const x = cx + dx + (h01(cx, cz, n + 20) - 0.5) * 0.5,
          z = cz + dz + (h01(cx, cz, n + 30) - 0.5) * 0.5;
        if (n >= 3 || passage(x, z) || !libre(x, z, 0.75)) continue;
        if (h01(x, z) < (PV.arbres + 1.5) / 6) {
          tree(x, z, YQ, 0.75 + h01(x, z, 2) * 0.35, h01(x, z, 3) < 0.3);
          marquer(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
          n++;
        }
      }
    }
    for (const zn of zones) {
      const w = zn.x1 - zn.x0,
        d = zn.z1 - zn.z0,
        aire = w * d;
      // un tirage par pelouse : un palier qui bâtit un autre îlot ne fait pas bouger les fleurs de celle-ci
      const RN = rng(Math.round((zn.x0 + 50) * 131 + (zn.z0 + 50) * 977 + aire * 7));
      const tirer = () => [zn.x0 + 0.2 + RN() * (w - 0.4), zn.z0 + 0.2 + RN() * (d - 0.4)];
      // les nuances d'herbe : à plat, elles peuvent passer sous un objet, pas sous une allée
      for (let k = Math.round(aire * 0.1 * zn.k * part); k > 0; k--) {
        const [x, z] = tirer();
        if (libre(x, z, 0))
          tache(
            x,
            z,
            YQ,
            0.5 + RN() * 0.7,
            0.4 + RN() * 0.6,
            RN() < 0.5 ? 0xc3dfae : 0xd9ecc6,
            RN() * 3,
          );
      }
      // les gros d'abord (ils retiennent leur place), puis fleurs et touffes, qui peuvent se serrer
      const semis = [
        [0.025, 0.3, true, (x, z) => caillou(x, z, YQ, 0.8 + RN() * 0.6, RN)],
        [0.035, 0.45, true, (x, z) => buisson(x, z, YQ, 0.8 + RN() * 0.5, RN)],
        [0.16 * zn.f, 0.15, false, (x, z) => fleurs3(x, z, YQ, RN)],
        [
          0.22,
          0.1,
          false,
          (x, z) => {
            for (let m = 0; m < 3; m++)
              touffe(x + (RN() - 0.5) * 0.4, z + (RN() - 0.5) * 0.4, YQ, 0.85 + RN() * 0.5, RN);
          },
        ],
      ];
      for (const [densite, rayon, retient, poser] of semis)
        for (let k = Math.round(aire * densite * zn.k * part); k > 0; k--) {
          const [x, z] = tirer();
          if (passage(x, z) || !libre(x, z, rayon)) continue;
          poser(x, z);
          if (retient) marquer(x - rayon, z - rayon, x + rayon, z + rayon);
        }
    }
  })();

  /* ---- maillages fixes */
  const mMain = B.main.mesh(matStatic, true);
  scene.add(mMain);
  const mGround = B.ground.mesh(matGround, false);
  scene.add(mGround);
  scene.add(
    B.winA.mesh(matWinA, false),
    B.winB.mesh(matWinB, false),
    B.lamp.mesh(matLamp, false, false),
    B.glass.mesh(matGlass, false),
    B.gold.mesh(matGold, true),
    B.water.mesh(matWater, false),
    B.car.mesh(matCar, true),
    feuxA.mesh(matFeuA, false, false),
    feuxB.mesh(matFeuB, false, false),
  );

  /* ---- Banque : la tour grandit avec le patrimoine net */
  const bank = { group: new T.Group(), floors: 0, top: 0, anim: null };
  scene.add(bank.group);
  const coin = new T.Mesh(new T.CylinderGeometry(1.0, 1.0, 0.22, 30).rotateX(Math.PI / 2), matGold);
  coin.castShadow = true;
  coin.visible = NQ.bank >= 3;
  scene.add(coin);
  function buildBank(floors) {
    while (bank.group.children.length) {
      const m = bank.group.children.pop();
      m.geometry.dispose();
    }
    const bo = new Batch(),
      b = new Batch({ ombre: true, or: bo }),
      wa = new Batch(),
      wb = new Batch(),
      rnd = rng(77);
    const P = place(BKX, BKZ, 0, CURB),
      fh = 0.8,
      H = floors * fh,
      y0 = 0.4;
    bxc(b, P, 0, 0, 0, 7.6, y0, 7.2, C.white);
    bxc(b, P, 0, 0, 3.8, 4.6, 0.27, 0.5, C.white);
    bxc(b, P, 0, 0, 4.15, 4.6, 0.13, 0.4, C.white);
    bxc(b, P, 0, y0, -0.6, 5.2, H, 4.4, C.teal);
    for (let f = 4; f < floors; f += 4)
      bxc(b, P, 0, y0 + f * fh - 0.07, -0.6, 5.32, 0.14, 4.52, C.white);
    bxc(b, P, 0, y0 + H, -0.6, 5.4, 0.16, 4.6, C.white);
    bxc(b, P, 1.4, y0 + H + 0.16, -1.4, 0.9, 0.4, 0.8, 0xdadee6);
    for (const x of [-1.65, -0.55, 0.55, 1.65]) cy(b, P, x, y0, 2.7, 0.2, 1.9, C.white);
    bxc(b, P, 0, y0 + 1.9, 2.35, 4.2, 0.28, 1.5, C.white);
    put(b, G.prism, P, 0, y0 + 2.18, 2.35, 4.2, 0.85, 1.5, C.white);
    put(b, G.cyl, P, 0, y0 + 2.52, 3.105, 0.52, 0.06, 0.52, C.gold, 0, Math.PI / 2);
    bxc(b, P, 0, y0, 1.62, 1.1, 1.5, 0.06, C.teal2);
    bxc(b, P, 0, y0 + H + 0.16, -0.6, 0.5, 0.3, 0.5, C.white);
    if (NQ.bank >= 4) {
      /* le prestige : une couronne dorée et un dôme au sommet */
      bxc(b, P, 0, y0 + H - 0.5, -0.6, 5.36, 0.22, 4.56, C.gold);
      cy(b, P, -1.2, y0 + H + 0.16, -0.6, 0.9, 0.3, C.white);
      put(b, G.sph2, P, -1.2, y0 + H + 0.46, -0.6, 1.5, 1.1, 1.5, C.gold);
    }
    const Pt = new T.Matrix4().copy(P).multiply(new T.Matrix4().makeTranslation(0, y0, -0.6));
    windowsOn({ A: wa, B: wb }, Pt, 5.2, 4.4, 0.05, floors, fh, rnd, {
      skip: (f, fl) => f === 0 && fl < 4,
    });
    bank.group.add(
      b.mesh(matStatic, true),
      wa.mesh(matWinA, false),
      wb.mesh(matWinB, false),
      bo.mesh(matGold, true),
    );
    bank.floors = floors;
    bank.top = CURB + y0 + H + 0.16;
    coin.position.set(BKX, bank.top + 1.3, BKZ - 0.6);
  }

  /* ---- Salle de marché : la tour grandit avec les trades du mois */
  const tower = { group: new T.Group(), floors: 0, top: 0, anim: null };
  scene.add(tower.group);
  const matBeacon = mat({ color: 0xf2c037, roughness: 0.3 });
  let feu = [0.95, 0.75, 0.2];
  const beacon = new T.Mesh(G.sph, matBeacon);
  beacon.scale.setScalar(0.36);
  beacon.visible = NQ.tower >= 3;
  scene.add(beacon);
  function buildTower(floors) {
    while (tower.group.children.length) {
      const m = tower.group.children.pop();
      m.geometry.dispose();
    }
    const bo = new Batch(),
      b = new Batch({ ombre: true, or: bo }),
      gl = new Batch(),
      P = place(TWX, TWZ, 0, CURB),
      fh = 0.8,
      NAVY = 0x27306b,
      y0 = 0.5;
    bxc(b, P, 0, 0, 0, 8.2, y0, 8.2, C.white);
    bxc(b, P, 0, y0, 0, 6.6, 1.6, 6.6, NAVY);
    put(gl, G.quad, P, 0, y0 + 0.8, 3.315, 5.6, 1.1, 1, 0xffffff, 0);
    put(gl, G.quad, P, 3.315, y0 + 0.8, 0, 5.6, 1.1, 1, 0xffffff, Math.PI / 2);
    bxc(b, P, 0, y0 + 1.6, 0, 6.9, 0.14, 6.9, C.white);
    const n1 = Math.ceil(floors * 0.6),
      n2 = floors - n1,
      yA = y0 + 1.74,
      hA = n1 * fh,
      yB = yA + hA + 0.14,
      hB = n2 * fh;
    bxc(b, P, 0, yA, 0, 5.4, hA, 5.4, NAVY);
    bxc(b, P, 0, yA + hA, 0, 5.6, 0.14, 5.6, C.white);
    bxc(b, P, 0, yB, 0, 4.0, hB, 4.0, NAVY);
    bxc(b, P, 0, yB + hB, 0, 4.2, 0.16, 4.2, C.white);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2,
        sa = Math.sin(a),
        ca = Math.cos(a);
      for (let fl = 0; fl < n1; fl++)
        put(gl, G.quad, P, sa * 2.715, yA + fl * fh + 0.42, ca * 2.715, 4.8, 0.5, 1, 0xffffff, a);
      for (let fl = 0; fl < n2; fl++)
        put(gl, G.quad, P, sa * 2.015, yB + fl * fh + 0.42, ca * 2.015, 3.4, 0.5, 1, 0xffffff, a);
    }
    const yT = yB + hB + 0.16;
    bxc(b, P, 0, yT, 0, 1.6, 0.7, 1.6, C.white);
    cy(b, P, 0, yT + 0.7, 0, 0.06, 2.4, NQ.tower >= 4 ? C.gold : C.metal, G.cyl8);
    if (NQ.tower >= 4) {
      bxc(b, P, 0, yB + hB - 0.3, 0, 4.12, 0.2, 4.12, C.gold);
      bxc(b, P, 0, yA + hA - 0.3, 0, 5.52, 0.2, 5.52, C.gold);
      put(b, G.pyr, P, 0, yT + 0.7, 0, 1.5, 1.2, 1.5, C.gold);
    }
    tower.group.add(b.mesh(matStatic, true), gl.mesh(matGlass, false), bo.mesh(matGold, true));
    tower.floors = floors;
    tower.top = CURB + yT + 3.1;
    beacon.position.set(TWX, tower.top, TWZ);
  }

  /* ---- accessoires qui réagissent aux données */
  const stalls = [];
  [
    [0, -3.95, 0],
    [-3.95, 0, Math.PI / 2],
    [3.95, 0, -Math.PI / 2],
    [0, 3.95, Math.PI],
  ]
    /* les étals se dressent sur une place pavée, pas autour d'un feu de camp */
    .filter(() => NQ.plaza >= 2)
    .forEach((p, i) => {
      const b = new Batch(),
        P = place(PLX + p[0], PLZ + p[1], p[2], CURB + 0.03),
        col = [C.orange, C.blue2, C.teal, C.pink][i];
      for (const x of [-0.75, 0.75])
        for (const z of [-0.4, 0.4]) cy(b, P, x, 0, z, 0.04, 1.15, C.white, G.cyl8);
      bx(b, P, 0, 0, 0, 1.5, 0.5, 0.7, C.wood);
      put(b, G.prism, P, 0, 1.15, 0, 1.25, 0.42, 1.9, col, Math.PI / 2);
      bx(b, P, -0.4, 0.5, 0, 0.34, 0.16, 0.34, C.yellow);
      bx(b, P, 0.1, 0.5, 0.05, 0.3, 0.2, 0.3, C.pink);
      bx(b, P, 0.5, 0.5, -0.05, 0.26, 0.14, 0.3, C.teal);
      const m = b.mesh(matStatic, true);
      m.visible = false;
      scene.add(m);
      stalls.push(m);
    });

  const storm = new T.Group();
  [
    [0, 0, 0, 1.5],
    [1.2, -0.15, 0.3, 1.15],
    [-1.25, -0.1, -0.2, 1.2],
    [0.2, 0.3, -0.7, 1.0],
    [-0.3, 0.25, 0.7, 1.05],
  ].forEach((c) => {
    const m = new T.Mesh(G.sph2, matStorm);
    m.position.set(c[0], c[1], c[2]);
    m.scale.set(c[3] * 2, c[3] * 1.3, c[3] * 2);
    storm.add(m);
  });
  const NR = 44,
    rainPos = new Float32Array(NR * 6),
    rainSeed = [];
  for (let i = 0; i < NR; i++) rainSeed.push([rr(-2.2, 2.2), rr(-1.6, 1.6), R()]);
  const rainGeo = new T.BufferGeometry();
  rainGeo.setAttribute("position", new T.BufferAttribute(rainPos, 3));
  const rain = new T.LineSegments(
    rainGeo,
    new T.LineBasicMaterial({ color: 0x7c9be0, transparent: true, opacity: 0.85 }),
  );
  rain.frustumCulled = false;
  storm.add(rain);
  storm.position.set(UNX, 9.2, UNZ);
  storm.visible = false;
  scene.add(storm);

  const balloons = new T.Group();
  [
    [-0.45, 2.6, 0, C.orange],
    [0.05, 3.0, 0.2, C.violet],
    [0.5, 2.7, -0.15, C.teal],
  ].forEach((bn) => {
    const m = new T.Mesh(G.sph2, mat({ color: bn[3], roughness: 0.35 }));
    m.position.set(bn[0], bn[1], bn[2]);
    m.scale.set(0.6, 0.72, 0.6);
    balloons.add(m);
    const st = new T.Mesh(G.cyl8, matLamp);
    st.scale.set(0.02, bn[1] - 0.36, 0.02);
    st.position.set(bn[0], (bn[1] - 0.36) / 2, bn[2]);
    balloons.add(st);
  });
  balloons.position.copy(uniPt(1.3, 0, 3.9));
  balloons.visible = false;
  scene.add(balloons);
  const balloonY = balloons.position.y;

  const clouds = [];
  [
    [-38, 24, -18, 1.0, 0.55],
    [2, 27, -30, 1.25, 0.4],
    [30, 25, -22, 0.9, 0.7],
    [-14, 26, -26, 0.8, 0.5],
  ].forEach((c) => {
    const g = new T.Group();
    [
      [0, 0, 0, 1.6],
      [1.5, -0.2, 0.2, 1.2],
      [-1.5, -0.15, -0.1, 1.25],
      [0.3, 0.35, -0.6, 1.0],
    ].forEach((p) => {
      const m = new T.Mesh(G.blob, matCloud);
      m.position.set(p[0], p[1], p[2]);
      m.scale.set(p[3] * 2, p[3] * 1.25, p[3] * 2);
      m.castShadow = !small;
      g.add(m);
    });
    g.position.set(c[0], c[1], c[2]);
    g.scale.setScalar(c[3]);
    g.userData.v = c[4];
    scene.add(g);
    clouds.push(g);
  });

  const ducks = [0, 1].map((i) => {
    const m = new T.Mesh(G.sph, matClock);
    m.scale.set(0.3, 0.22, 0.42);
    m.visible = NQ.park >= 2 && aParc("canards");
    scene.add(m);
    return { m, a: i * 2.4 };
  });

  const NDROP = 16;
  const drops = new T.InstancedMesh(G.sph, matDrop, NDROP);
  drops.frustumCulled = false;
  drops.visible = NQ.plaza >= 2;
  scene.add(drops);

  /* le jet d'eau de l'étang */
  const NJET = 14;
  const jet = new T.InstancedMesh(G.sph, matDrop, NJET);
  jet.frustumCulled = false;
  jet.visible = NQ.park >= 2 && aParc("fontaine");
  scene.add(jet);

  /* la montgolfière : elle dérive lentement au-dessus des toits */
  const ballon = new T.Group();
  if (aAmbiance("montgolfiere")) {
    const b = new Batch();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      put(
        b,
        G.sph2,
        I4,
        Math.cos(a) * 0.2,
        2.4,
        Math.sin(a) * 0.2,
        2.2,
        2.6,
        2.2,
        [C.orange, C.yellow][k % 2],
        a,
      );
    }
    put(b, G.cone, I4, 0, 0.7, 0, 1.3, 0.9, 1.3, C.orange, 0, Math.PI);
    bx(b, I4, 0, 0, 0, 0.6, 0.45, 0.6, C.wood);
    for (const [x, z] of [
      [-0.28, -0.28],
      [0.28, -0.28],
      [-0.28, 0.28],
      [0.28, 0.28],
    ])
      cy(b, I4, x, 0.45, z, 0.015, 0.75, C.dark, G.cyl8);
    // sur petit écran, les ombres ne sont recalculées qu'au fil du soleil : une ombre mobile y resterait figée
    ballon.add(b.mesh(matStatic, !small));
    scene.add(ballon);
  }

  /*
    ---- le feu d'artifice, les soirs de grand travail

    Quelques gerbes à la fois, chacune une poignée d'éclats instanciés : un seul
    appel de dessin pour tout le spectacle.
  */
  const NGERBE = 4,
    NECLAT = 26;
  const eclats = new T.InstancedMesh(
    G.sph,
    new T.MeshBasicMaterial({ color: 0xffffff }),
    NGERBE * NECLAT,
  );
  eclats.frustumCulled = false;
  eclats.visible = false;
  const gerbes = [];
  for (let g = 0; g < NGERBE; g++) {
    gerbes.push({ t: 2.3 - g * 0.55, x: 0, y: 0, z: 0, dirs: [] });
    for (let k = 0; k < NECLAT; k++) {
      const u = (k + 0.5) / NECLAT,
        th = Math.acos(1 - 2 * u),
        ph = k * 2.39996;
      gerbes[g].dirs.push([Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]);
    }
  }
  if (aAmbiance("feuArtifice")) scene.add(eclats);
  let fete = false;
  const TONS_FETE = [0xf2c037, 0xf27fa3, 0x4f6bea, 0x3ec79a, 0xffffff, 0xf2924a];
  function relancerGerbe(g, i) {
    g.t = 0;
    g.x = rr(-22, 22);
    g.z = rr(-22, 22);
    g.y = rr(19, 26);
    const c = TONS_FETE[(i + Math.floor(R() * 6)) % 6];
    for (let k = 0; k < NECLAT; k++) eclats.setColorAt(i * NECLAT + k, _col.set(c));
    if (eclats.instanceColor) eclats.instanceColor.needsUpdate = true;
  }
  function stepFete(dt) {
    const on = fete && nightK > 0.45;
    eclats.visible = on;
    if (!on) return;
    gerbes.forEach((g, i) => {
      g.t += dt;
      if (g.t > 2.2) relancerGerbe(g, i);
      const t = Math.max(0, g.t),
        r = 5.5 * (1 - Math.exp(-t * 2.4)),
        chute = 0.9 * t * t,
        sc = t < 0.05 ? 0 : 0.85 * Math.max(0, 1 - t / 2.2);
      g.dirs.forEach((d, k) => {
        _im.compose(
          _ip.set(g.x + d[0] * r, g.y + d[1] * r - chute, g.z + d[2] * r),
          _iq,
          _is.set(sc, sc, sc),
        );
        eclats.setMatrixAt(i * NECLAT + k, _im);
      });
    });
    eclats.instanceMatrix.needsUpdate = true;
  }

  /* le port : une bande d'eau devant la ville, un ponton, des voiliers */
  const voiliers = [];
  let scintillement = null,
    surfaceMer = null;
  if (aAmbiance("port")) {
    /*
      Le bassin est taillé comme la dalle : coins arrondis, flanc en coupe,
      clair en surface et sombre en profondeur. Un pavé bleu uni posé contre
      la ville faisait un bloc de plastique ; la coupe en fait de l'eau.
    */
    const x0 = -SLAB + 0.6,
      x1 = SLAB - 0.6,
      z0 = SLAB - 0.5,
      z1 = SLAB + 12,
      rc = 2.2;
    const sh = new T.Shape();
    sh.moveTo(x0, z0);
    sh.lineTo(x1, z0);
    sh.lineTo(x1, z1 - rc);
    sh.quadraticCurveTo(x1, z1, x1 - rc, z1);
    sh.lineTo(x0 + rc, z1);
    sh.quadraticCurveTo(x0, z1, x0, z1 - rc);
    sh.lineTo(x0, z0);
    const ge = new T.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: false, curveSegments: 8 });
    ge.rotateX(Math.PI / 2);
    ge.translate(0, -0.9, 0);
    const pe = ge.attributes.position,
      ce = [],
      cHaut = new T.Color(0x78bce6),
      cBas = new T.Color(0x22507e),
      cc = new T.Color();
    for (let i = 0; i < pe.count; i++) {
      cc.copy(cHaut).lerp(cBas, clamp((-0.9 - pe.getY(i)) / 0.9, 0, 1));
      ce.push(cc.r, cc.g, cc.b);
    }
    ge.setAttribute("color", new T.Float32BufferAttribute(ce, 3));
    const matMer = mat({ color: 0x4d93c6, roughness: 0.04, metalness: 0.1, envMap: envTex });
    refletants.push([matMer, 1.3]);
    const eau = new T.Mesh(ge, [matMer, mat({ vertexColors: true, roughness: 0.25 })]);
    eau.receiveShadow = true;
    scene.add(eau);
    /* des éclats qui glissent sur l'eau, comme sur l'étang, à l'échelle du large (texture posée plus bas) */
    const gs = new T.ShapeGeometry(sh, 8).rotateX(Math.PI / 2);
    surfaceMer = new T.Mesh(
      gs,
      new T.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        opacity: 0.35,
        side: T.DoubleSide,
      }),
    );
    surfaceMer.position.y = -0.885;
    surfaceMer.visible = false;
    scene.add(surfaceMer);
    const b = new Batch();
    for (const x of [-12, 8]) {
      bx(b, I4, x, -0.9, SLAB + 3.5, 1.4, 0.95, 7, C.wood);
      for (let k = 0; k < 4; k++)
        cy(b, I4, x + 0.75, -1.2, SLAB + 0.8 + k * 2, 0.1, 1.5, 0x8a6a4a, G.cyl8);
    }
    scene.add(b.mesh(matStatic, true));
    [
      [-8.5, SLAB + 5, C.white, C.orange],
      [-15, SLAB + 9, C.blue2, C.white],
      [4.5, SLAB + 7, C.white, C.teal],
      [12, SLAB + 4.5, C.pink, C.white],
    ].forEach((v, i) => {
      const vb = new Batch(),
        P = place(0, 0, 0.3 * i, 0);
      bx(vb, P, 0, -0.25, 0, 1.0, 0.45, 2.6, v[2]);
      put(vb, G.box, P, 0, -0.025, 1.3, 0.71, 0.45, 0.71, v[2], Math.PI / 4);
      cy(vb, P, 0, 0.2, -0.1, 0.04, 3.0, C.white, G.cyl8);
      put(vb, G.prism, P, 0.02, 0.45, -0.75, 1.3, 2.6, 0.04, v[3], Math.PI / 2);
      const g = new T.Group();
      g.add(vb.mesh(matStatic, !small));
      g.position.set(v[0], -0.75, v[1]);
      scene.add(g);
      voiliers.push(g);
    });
  }

  /* ---- circulation */
  const INT = 2.25,
    LANE = 0.72;
  const nodes = [];
  for (let i = 0; i < NN; i++)
    for (let j = 0; j < NN; j++) nodes.push({ i, j, x: RX[i], z: RX[j], nb: [] });
  const nodeAt = (i, j) => nodes[i * NN + j];
  nodes.forEach((n) => {
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].forEach((d) => {
      const i = n.i + d[0],
        j = n.j + d[1];
      if (i >= 0 && i < NN && j >= 0 && j < NN && rue(n.i, n.j, i, j)) n.nb.push(nodeAt(i, j));
    });
  });
  function laneOf(a, b) {
    const dx = Math.sign(b.x - a.x),
      dz = Math.sign(b.z - a.z),
      rx = -dz,
      rz = dx;
    const x0 = a.x + dx * INT + rx * LANE,
      z0 = a.z + dz * INT + rz * LANE,
      x1 = b.x - dx * INT + rx * LANE,
      z1 = b.z - dz * INT + rz * LANE;
    return { dx, dz, rx, rz, x0, z0, x1, z1, len: Math.abs(x1 - x0) + Math.abs(z1 - z0) };
  }
  const cars = [];
  const LONGUEURS = {
    car: 1.6,
    taxi: 1.6,
    sport: 1.75,
    deudeuche: 1.55,
    van: 2.1,
    camion: 2.7,
    bus: 3,
    tram: 4.4,
    velo: 0.9,
  };
  const flaqueToile = document.createElement("canvas");
  flaqueToile.width = 64;
  flaqueToile.height = 128;
  {
    const fx = flaqueToile.getContext("2d");
    if (fx) {
      const gr = fx.createRadialGradient(32, 40, 2, 32, 64, 62);
      gr.addColorStop(0, "rgba(255,236,190,0.9)");
      gr.addColorStop(0.5, "rgba(255,226,170,0.32)");
      gr.addColorStop(1, "rgba(255,220,160,0)");
      fx.fillStyle = gr;
      fx.fillRect(0, 0, 64, 128);
    }
  }
  const texFlaque = new T.CanvasTexture(flaqueToile);
  texFlaque.colorSpace = T.SRGBColorSpace;
  const matFlaque = new T.MeshBasicMaterial({
    map: texFlaque,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    opacity: 0,
  });
  matFlaque.visible = false;
  const geoFlaque = new T.PlaneGeometry(1.15, 2.1).rotateX(-Math.PI / 2);
  (function spawnCars() {
    const edges = [];
    nodes.forEach((a) => a.nb.forEach((b) => edges.push([a, b])));
    for (let i = edges.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      const t = edges[i];
      edges[i] = edges[j];
      edges[j] = t;
    }
    /*
      La circulation grandit avec ce qui a été débloqué : quelques vélos au
      début, puis chaque nouveau véhicule rejoint le flot. Le tram reste seul,
      les bus et camions restent rares.
    */
    const parType = {
      velo: ["velo", "velo", "velo"],
      deudeuche: ["deudeuche", "deudeuche"],
      taxi: ["taxi", "taxi"],
      camion: ["camion"],
      citadines: ["car", "car", "van", "car", "car"],
      bus: ["bus"],
      sport: ["sport"],
      tram: ["tram"],
    };
    const flot = [];
    for (const v of PV.vehicules) for (const k of parType[v] || []) flot.push(k);
    // mélangés une fois pour toutes : les types alternent au lieu de rouler en convoi
    const pool = flot.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const n = Math.min(small ? 15 : 26, flot.length ? 2 + Math.round(flot.length * 1.25) : 0);
    const cols = [C.white, C.blue, C.yellow, C.violet, C.white, C.orange, C.teal, C.pink, C.blue2];
    const COUL = {
      velo: [C.blue2, C.orange, C.teal, C.pink],
      deudeuche: [0xbfc4cf, 0x8fb8e8, 0xe8d38f, 0xd96b5b],
      taxi: [C.yellow],
      sport: [0xe5484d, C.yellow],
      camion: [C.blue, C.teal2],
      tram: [C.teal],
      bus: [C.orange, C.blue2],
    };
    let trams = 0;
    for (let k = 0; k < n; k++) {
      let kind = pool[k % pool.length];
      if (kind === "tram" && trams++ >= (small ? 1 : 2)) kind = pool[(k + 1) % pool.length];
      const col = COUL[kind] ? COUL[kind][k % COUL[kind].length] : cols[k % cols.length];
      const b = new Batch(),
        lb = new Batch(),
        tb = new Batch();
      vehicle(b, lb, I4, kind, col, tb);
      /* les feux arrière s'allument au freinage : chaque véhicule a les siens */
      const stopMat = mat({ color: 0xc8303a, emissive: 0xff2a2a, emissiveIntensity: 0 });
      const g = new T.Group(),
        body = b.mesh(matCar, !small),
        li = lb.mesh(matHead, false, false),
        st = tb.mesh(stopMat, false, false);
      g.add(body, li, st);
      if (kind !== "velo") {
        // la nuit, les phares posent une flaque de lumière sur la chaussée devant le véhicule
        const fl = new T.Mesh(geoFlaque, matFlaque);
        fl.position.set(0, 0.012, LONGUEURS[kind] / 2 + 1.05);
        fl.renderOrder = 1;
        g.add(fl);
      }
      scene.add(g);
      const a = edges[k][0],
        bb = edges[k][1],
        seg = laneOf(a, bb);
      cars.push({
        g,
        a,
        b: bb,
        seg,
        mode: "s",
        s: R() * seg.len,
        u: 0,
        cur: null,
        next: null,
        v: 0,
        vmax:
          kind === "velo"
            ? rr(1.5, 2.1)
            : rr(3.0, 4.6) * (kind === "bus" || kind === "tram" || kind === "camion" ? 0.8 : 1),
        x: 0,
        z: 0,
        fx: seg.dx,
        fz: seg.dz,
        wait: 0,
        ghost: 0,
        len: LONGUEURS[kind],
        stopMat,
        frein: 0,
        attente: false,
        attenteT: 0,
      });
    }
  })();
  /* un cycle de quatorze secondes : nord-sud passe, puis est-ouest */
  const CYCLE = 14;
  const vert = (estOuest) => {
    const ph = time % CYCLE;
    return estOuest ? ph >= 7 && ph < 13 : ph < 6;
  };
  const auCentre = (n) => n.i > 0 && n.i < NN - 1 && n.j > 0 && n.j < NN - 1 && n.nb.length >= 3;
  /*
    Un carrefour ne prend qu'un véhicule à la fois : celui de tête le réserve
    avant de s'engager, les autres l'attendent à la ligne. Sans cela, deux
    voitures qui tournaient se traversaient au milieu du croisement. Les feux
    s'ajoutent par-dessus, et chacun freine en proportion de la distance qui
    lui reste : une file qui ralentit, pas une suite d'arrêts nets.
  */
  function stepCar(c, dt) {
    let v = c.vmax,
      attente = false,
      devant = false;
    if (c.ghost > 0) c.ghost -= dt;
    else {
      for (const o of cars) {
        if (o === c) continue;
        const ex = o.x - c.x,
          ez = o.z - c.z,
          f = ex * c.fx + ez * c.fz,
          marge = 0.45 + (c.len + o.len) / 2;
        if (f > 0 && f < marge + 2.4 && Math.abs(ex * c.fz - ez * c.fx) < 0.6) {
          v = Math.min(v, Math.max(0, (f - marge) * 1.9));
          devant = true;
          // la file derrière un feu rouge ou un carrefour occupé attend, elle ne double pas
          if (o.attente) attente = true;
        }
      }
      if (c.mode === "s") {
        const reste = c.seg.len - c.s,
          n = c.b,
          ligne = 0.45 + c.len / 2;
        if (reste < 3 + ligne) {
          const rouge = PV.feux && auCentre(n) && !vert(c.seg.dx !== 0);
          if (!rouge && !devant && (!n.occupant || n.occupant === c)) n.occupant = c;
          if (n.occupant !== c) {
            v = Math.min(v, Math.max(0, (reste - ligne) * 1.6));
            attente = true;
          }
        }
      }
    }
    c.frein = v < c.v - 0.3 || (attente && c.v < 0.2) ? 1 : 0;
    c.v += (v - c.v) * Math.min(1, dt * 4);
    c.attente = attente;
    // Bloqué sans raison visible (un bouchon en boucle) : on finit par passer, mais jamais en brûlant un feu.
    c.attenteT = attente ? c.attenteT + dt : 0;
    if ((c.v < 0.08 && !attente) || c.attenteT > 14) {
      c.wait += dt;
      if (c.wait > 4 || c.attenteT > 14) {
        c.ghost = 2.5;
        c.wait = 0;
        c.attenteT = 0;
      }
    } else c.wait = 0;
    const adv = c.v * dt;
    if (c.mode === "s") {
      c.s += adv;
      if (c.s >= c.seg.len) {
        const opts = c.b.nb.filter((n) => n !== c.a);
        c.next = opts[Math.floor(Math.random() * opts.length)];
        const s2 = laneOf(c.b, c.next),
          s1 = c.seg;
        const cx =
          s1.dx === s2.dx && s1.dz === s2.dz ? (s1.x1 + s2.x0) / 2 : c.b.x + (s1.rx + s2.rx) * LANE;
        const cz =
          s1.dx === s2.dx && s1.dz === s2.dz ? (s1.z1 + s2.z0) / 2 : c.b.z + (s1.rz + s2.rz) * LANE;
        const chord = Math.hypot(s2.x0 - s1.x1, s2.z0 - s1.z1),
          poly = Math.hypot(cx - s1.x1, cz - s1.z1) + Math.hypot(s2.x0 - cx, s2.z0 - cz);
        c.cur = {
          x0: s1.x1,
          z0: s1.z1,
          cx,
          cz,
          x1: s2.x0,
          z1: s2.z0,
          len: (chord + poly) / 2,
          seg: s2,
        };
        c.u = (c.s - s1.len) / c.cur.len;
        c.mode = "t";
      } else {
        c.x = c.seg.x0 + c.seg.dx * c.s;
        c.z = c.seg.z0 + c.seg.dz * c.s;
        c.fx = c.seg.dx;
        c.fz = c.seg.dz;
      }
    } else c.u += adv / c.cur.len;
    if (c.mode === "t") {
      if (c.u >= 1) {
        const q = c.cur;
        if (c.b.occupant === c) c.b.occupant = null;
        c.a = c.b;
        c.b = c.next;
        c.seg = q.seg;
        c.s = (c.u - 1) * q.len;
        c.mode = "s";
        c.x = c.seg.x0 + c.seg.dx * c.s;
        c.z = c.seg.z0 + c.seg.dz * c.s;
        c.fx = c.seg.dx;
        c.fz = c.seg.dz;
      } else {
        const q = c.cur,
          u = c.u,
          w = 1 - u;
        c.x = w * w * q.x0 + 2 * w * u * q.cx + u * u * q.x1;
        c.z = w * w * q.z0 + 2 * w * u * q.cz + u * u * q.z1;
        const tx = 2 * w * (q.cx - q.x0) + 2 * u * (q.x1 - q.cx),
          tz = 2 * w * (q.cz - q.z0) + 2 * u * (q.z1 - q.cz),
          tl = Math.hypot(tx, tz) || 1;
        c.fx = tx / tl;
        c.fz = tz / tl;
      }
    }
    c.g.position.set(c.x, 0, c.z);
    c.g.rotation.y = Math.atan2(c.fx, c.fz);
    c.stopMat.emissiveIntensity = c.frein * 1.8 + nightK * 0.7;
  }

  /* ---- piétons (un corps et une tête instanciés pour tout le monde) */
  const peds = [];
  (function spawnPeds() {
    const shirts = [
        C.blue,
        C.orange,
        C.violet,
        C.teal,
        C.yellow,
        C.pink,
        C.blue2,
        0xffffff,
        C.dark,
      ],
      skins = [0xf3d3b5, 0xe2b48e, 0xc68e63, 0x9b6a45, 0xfbe3cc];
    const mk = (o) => {
      o.col = pick(shirts);
      o.skin = pick(skins);
      o.sc = rr(0.9, 1.12);
      o.ph = R() * 6.28;
      peds.push(o);
    };
    // une ville qui commence est presque vide : les passants arrivent avec elle
    const nLoop = Math.round((small ? 80 : 150) * (0.15 + 0.85 * avance));
    for (let k = 0; k < nLoop; k++) {
      let r;
      {
        // un îlot bordé de rues, d'autant plus fréquenté qu'il est grand
        const poids = ILOTS.reduce((t, g) => t + g.cases, 0);
        let tire = R() * poids,
          g = ILOTS[0];
        for (const c of ILOTS) {
          g = c;
          if ((tire -= c.cases) < 0) break;
        }
        // sur le trottoir, à distance des réverbères et des bacs posés aux angles des îlots
        const o = rr(0.32, 0.5);
        r = {
          x0: CELLS[g.i0][0] + o,
          x1: CELLS[g.i1][1] - o,
          z0: CELLS[g.j0][0] + o,
          z1: CELLS[g.j1][1] - o,
        };
      }
      r.per = 2 * (r.x1 - r.x0) + 2 * (r.z1 - r.z0);
      mk({ type: "loop", r, s: R() * r.per, dir: R() < 0.5 ? 1 : -1, v: rr(0.5, 1.0), y: CURB });
    }
    for (let k = 0; k < 16; k++)
      mk({
        type: "stroll",
        r0: rr(2.65, 3.0),
        th: R() * 6.28,
        w: rr(0.12, 0.22) * (R() < 0.5 ? 1 : -1),
        y: CURB + 0.03,
        idx: k,
      });
    const slots = [];
    for (let a = 0; a < 5; a++)
      for (let b2 = 0; b2 < 2; b2++)
        slots.push(uniPt(-1.5 + a * 0.75 + rr(-0.15, 0.15), 0, 1.1 + b2 * 1.4 + rr(-0.3, 0.3)));
    slots.forEach((p, k) =>
      mk({ type: "stand", grp: "students", x: p.x, z: p.z, y: CURB, idx: k }),
    );
    dinerSlots.forEach((p, k) =>
      mk({ type: "stand", grp: "diners", x: p[0], z: p[1], y: CURB + 0.03, idx: k }),
    );
    lecteurSlots.forEach((p, k) =>
      mk({ type: "stand", grp: "readers", x: p[0], z: p[1], y: CURB + 0.03, idx: k }),
    );
    for (let k = 0; k < 6; k++)
      mk({ type: "jog", th: R() * 6.28, w: rr(0.45, 0.7), y: CURB + 0.03, idx: k });
  })();
  // une gélule plutôt qu'un cylindre : des épaules arrondies, une silhouette et non un pion
  const pedBody = new T.InstancedMesh(
    new T.CapsuleGeometry(0.115, 0.2, 3, 10),
    matPed,
    peds.length,
  );
  const pedHead = new T.InstancedMesh(G.sph, matSkin, peds.length);
  pedBody.castShadow = !small;
  pedBody.frustumCulled = false;
  pedHead.frustumCulled = false;
  peds.forEach((p, i) => {
    pedBody.setColorAt(i, _col.set(p.col));
    pedHead.setColorAt(i, _col.set(p.skin));
  });
  scene.add(pedBody, pedHead);
  const _im = new T.Matrix4(),
    _iq = new T.Quaternion(),
    _ip = new T.Vector3(),
    _is = new T.Vector3();
  const live = { students: 0, strollers: 6, diners: 0, joggers: 0, readers: 0 };
  function stepPeds(dt, t) {
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      let x = 0,
        z = 0,
        on = true,
        bob = 0;
      if (p.type === "loop") {
        p.s += p.v * p.dir * dt;
        const r = p.r,
          w = r.x1 - r.x0,
          d = r.z1 - r.z0;
        const s = ((p.s % r.per) + r.per) % r.per;
        if (s < w) {
          x = r.x0 + s;
          z = r.z0;
        } else if (s < w + d) {
          x = r.x1;
          z = r.z0 + (s - w);
        } else if (s < 2 * w + d) {
          x = r.x1 - (s - w - d);
          z = r.z1;
        } else {
          x = r.x0;
          z = r.z1 - (s - 2 * w - d);
        }
        bob = Math.abs(Math.sin(t * 7 + p.ph)) * 0.035;
      } else if (p.type === "stroll") {
        on = p.idx < live.strollers;
        p.th += p.w * dt;
        const rad = p.r0 + Math.sin(t * 0.35 + p.ph) * 0.18;
        x = PLX + Math.cos(p.th) * rad;
        z = PLZ + Math.sin(p.th) * rad;
        bob = Math.abs(Math.sin(t * 6 + p.ph)) * 0.03;
      } else if (p.type === "jog") {
        /* le tour de l'étang, plus vite que les promeneurs */
        on = p.idx < live.joggers;
        p.th += p.w * dt;
        x = PKX + 0.9 + Math.cos(p.th) * 2.75;
        z = PKZ + 0.5 + Math.sin(p.th) * 1.95;
        bob = Math.abs(Math.sin(t * 9 + p.ph)) * 0.05;
      } else {
        on = p.idx < live[p.grp];
        x = p.x;
        z = p.z;
        bob = Math.max(0, Math.sin(t * 2.2 + p.ph)) * 0.03;
      }
      const sc = on ? p.sc : 0;
      _im.compose(_ip.set(x, p.y + 0.21 * sc + bob, z), _iq, _is.set(sc, sc, sc));
      pedBody.setMatrixAt(i, _im);
      _im.compose(
        _ip.set(x, p.y + 0.53 * sc + bob, z),
        _iq,
        _is.set(sc * 0.25, sc * 0.25, sc * 0.25),
      );
      pedHead.setMatrixAt(i, _im);
    }
    pedBody.instanceMatrix.needsUpdate = true;
    pedHead.instanceMatrix.needsUpdate = true;
  }

  /* ---- lumière */
  /*
    En linéaire, l'écart entre la face au soleil et la face à l'ombre se joue
    sur la part du soleil : un ciel plus discret et un soleil plus franc
    redonnent du relief que le passage au linéaire, à intensités égales, aurait
    aplati.
  */
  const hemi = new T.HemisphereLight(0xffffff, 0xe6e2d2, 0.58 * LUM);
  const sun = new T.DirectionalLight(0xffffff, 0.85 * LUM);
  sun.position.set(-30, 75, 60);
  sun.castShadow = !legere;
  // Un bord d'ombre fondu : net, il découpait chaque immeuble au cutter.
  sun.shadow.radius = 4;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  // Au plus près de la dalle : chaque texel d'ombre en couvre moins, les bords sont plus fins.
  sun.shadow.camera.left = -47;
  sun.shadow.camera.right = 47;
  sun.shadow.camera.top = 47;
  sun.shadow.camera.bottom = -47;
  sun.shadow.camera.near = 40;
  sun.shadow.camera.far = 230;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(hemi, sun);

  /* le jour et la nuit suivent l'heure réelle : ciel, teinte de la lumière, direction du soleil, fenêtres allumées */
  const SKY = [
    [-10, 0x12152e],
    [-3, 0x4a3e72],
    [1.5, 0xf2b48c],
    [9, 0xf1efe4],
  ];
  const HSKY = [
    [-10, 0x7c8bd6],
    [-2, 0xc7a3c4],
    [2, 0xffd3b0],
    [10, 0xffffff],
  ];
  const HGND = [
    [-10, 0x1b2046],
    [-3, 0x5a4e78],
    [2, 0xcdb3a8],
    [10, 0xe6e2d2],
  ];
  const SUNC = [
    [0, 0xff9a55],
    [6, 0xffc08a],
    [16, 0xffffff],
  ];
  const _c1 = new T.Color(),
    _c2 = new T.Color(),
    bgCol = new T.Color(0xf1efe4);
  /*
    ---- le ciel

    Un aplat faisait de la ville un objet posé sur une feuille de couleur. Un
    dégradé — plus dense en haut, clair à l'horizon — lui donne un dessus et
    un lointain. Il est peint sur une toile et non calculé par le rendu : il
    ne change que toutes les cinq secondes, avec le soleil.
  */
  const SKY_HAUT = [
    [-10, 0x080a1c],
    [-3, 0x2c2858],
    [1.5, 0x97aee2],
    [9, 0xd3e4f5],
  ];
  const hautCol = new T.Color(0xd3e4f5);
  const cielToile = document.createElement("canvas");
  cielToile.width = cielToile.height = 512;
  const cielCtx = cielToile.getContext("2d");
  const cielTex = new T.CanvasTexture(cielToile);
  cielTex.colorSpace = T.SRGBColorSpace;
  /* les étoiles : toujours aux mêmes places, comme le reste de la ville */
  const RE = rng(4242);
  const etoiles = [];
  for (let i = 0; i < 170; i++)
    etoiles.push([RE(), RE() * 0.66, 0.5 + RE() * 1.1, 0.3 + RE() * 0.7]);
  function peindreCiel(nuit) {
    if (!cielCtx) return;
    const g = cielCtx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#" + hautCol.getHexString());
    g.addColorStop(0.78, "#" + bgCol.getHexString());
    g.addColorStop(1, "#" + bgCol.getHexString());
    cielCtx.globalAlpha = 1;
    cielCtx.fillStyle = g;
    cielCtx.fillRect(0, 0, 512, 512);
    if (nuit > 0.05) {
      cielCtx.fillStyle = "#ffffff";
      for (const e of etoiles) {
        cielCtx.globalAlpha = nuit * e[3];
        cielCtx.beginPath();
        cielCtx.arc(e[0] * 512, e[1] * 512, e[2], 0, 6.2832);
        cielCtx.fill();
      }
      cielCtx.globalAlpha = 1;
    }
    cielTex.needsUpdate = true;
  }
  scene.background = cielCtx ? cielTex : bgCol;

  /*
    ---- les halos des réverbères

    La nuit, les lampes s'allumaient sans rien éclairer : un point brillant
    au-dessus d'un sol noir. Chaque réverbère pose maintenant une tache de
    lumière chaude à son pied. Un seul maillage instancié pour tous.
  */
  const haloToile = document.createElement("canvas");
  haloToile.width = haloToile.height = 64;
  const haloCtx = haloToile.getContext("2d");
  if (haloCtx) {
    const g = haloCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,226,150,0.95)");
    g.addColorStop(0.45, "rgba(255,210,120,0.35)");
    g.addColorStop(1, "rgba(255,200,100,0)");
    haloCtx.fillStyle = g;
    haloCtx.fillRect(0, 0, 64, 64);
  }
  const matHalo = new T.MeshBasicMaterial({
    map: (() => {
      const t = new T.CanvasTexture(haloToile);
      t.colorSpace = T.SRGBColorSpace;
      return t;
    })(),
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    opacity: 0,
  });
  const halos = new T.InstancedMesh(
    new T.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2),
    matHalo,
    Math.max(1, lampes.length),
  );
  /*
    Sans réverbère (avant le palier de l'éclairage), l'instance de réserve
    restait à l'origine : une tache de lumière au milieu du carrefour central,
    chaque nuit, sous aucune lampe.
  */
  halos.count = lampes.length;
  lampes.forEach((l, i) => {
    _im.makeTranslation(l[0], l[1] + 0.03, l[2]);
    halos.setMatrixAt(i, _im);
  });
  halos.frustumCulled = false;
  halos.visible = false;
  scene.add(halos);

  /*
    ---- les lueurs

    Le globe d'un réverbère allumé n'était qu'un point clair. Un halo tourné
    vers la caméra autour de chaque globe, et un point lumineux sur chaque
    ampoule de guirlande, donnent l'éblouissement d'une lampe vue de nuit,
    sans le coût d'un vrai flou lumineux en post-traitement.
  */
  const lueurToile = document.createElement("canvas");
  lueurToile.width = lueurToile.height = 64;
  {
    const lx = lueurToile.getContext("2d");
    if (lx) {
      const gr = lx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,246,220,1)");
      gr.addColorStop(0.18, "rgba(255,226,160,0.75)");
      gr.addColorStop(0.5, "rgba(255,200,120,0.18)");
      gr.addColorStop(1, "rgba(255,190,110,0)");
      lx.fillStyle = gr;
      lx.fillRect(0, 0, 64, 64);
    }
  }
  const texLueur = new T.CanvasTexture(lueurToile);
  texLueur.colorSpace = T.SRGBColorSpace;
  const matLueur = new T.SpriteMaterial({
    map: texLueur,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    opacity: 0,
  });
  matLueur.visible = false;
  for (const l of lampes) {
    const sp1 = new T.Sprite(matLueur);
    sp1.position.set(l[0], l[1] + 1.78, l[2]);
    sp1.scale.setScalar(1.25);
    scene.add(sp1);
  }
  const matPoints = new T.PointsMaterial({
    map: texLueur,
    size: 9,
    sizeAttenuation: false,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    opacity: 0,
  });
  matPoints.visible = false;
  if (ampoules.length) {
    const gp = new T.BufferGeometry();
    gp.setAttribute("position", new T.Float32BufferAttribute(ampoules, 3));
    scene.add(new T.Points(gp, matPoints));
  }

  /*
    ---- les reflets de l'eau

    La fontaine et l'étang étaient deux disques bleus immobiles. Une couche
    de petits éclats clairs glisse à leur surface : c'est ce mouvement, plus
    que la couleur, qui dit « eau ».
  */
  const refletToile = document.createElement("canvas");
  refletToile.width = refletToile.height = 128;
  const refletCtx = refletToile.getContext("2d");
  if (refletCtx) {
    const RR = rng(99);
    refletCtx.lineCap = "round";
    refletCtx.strokeStyle = "#ffffff";
    for (let i = 0; i < 26; i++) {
      const x = RR() * 128,
        y = RR() * 128,
        l = 6 + RR() * 16;
      refletCtx.globalAlpha = 0.3 + RR() * 0.55;
      refletCtx.lineWidth = 1.4 + RR() * 1.6;
      refletCtx.beginPath();
      refletCtx.moveTo(x, y);
      refletCtx.lineTo(x + l, y);
      refletCtx.stroke();
    }
  }
  const refletTex = new T.CanvasTexture(refletToile);
  refletTex.colorSpace = T.SRGBColorSpace;
  refletTex.wrapS = refletTex.wrapT = T.RepeatWrapping;
  if (surfaceMer) {
    scintillement = refletTex.clone();
    scintillement.repeat.set(0.11, 0.11);
    surfaceMer.material.map = scintillement;
    surfaceMer.material.needsUpdate = true;
    surfaceMer.visible = true;
  }
  refletTex.center.set(0.5, 0.5);
  const matReflet = new T.MeshBasicMaterial({
    map: refletTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.45,
  });
  const disqueEau = new T.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  [
    NQ.plaza >= 2 && [PLX, CURB + 0.37, PLZ, 2.05, 2.05], // le bassin de la fontaine
    NQ.park >= 2 && [PKX + 0.9, CURB + 0.065, PKZ + 0.5, 2.25, 1.5], // l'étang du parc
  ]
    .filter(Boolean)
    .forEach((e) => {
      const m = new T.Mesh(disqueEau, matReflet);
      m.position.set(e[0], e[1], e[2]);
      m.scale.set(e[3], 1, e[4]);
      scene.add(m);
    });
  function grad(stops, x, out) {
    if (x <= stops[0][0]) return out.set(stops[0][1]);
    for (let i = 1; i < stops.length; i++)
      if (x <= stops[i][0]) {
        const t = (x - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        return out.set(stops[i - 1][1]).lerp(_c1.set(stops[i][1]), t);
      }
    return out.set(stops[stops.length - 1][1]);
  }
  const step = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  let clockFn = () => new Date(),
    sunNext = 0,
    nightK = 0;
  function applySun() {
    const sp0 = positionSoleil(clockFn()),
      a = sp0.alt;
    const day = step(-7, 3, a),
      lit = 1 - step(-4, 3, a);
    grad(SKY, a, bgCol);
    scene.fog.color.copy(bgCol);
    // Le ciel reflété suit le jour : la nuit, le verre ne doit pas briller comme à midi.
    if (envTex) for (const [m, k] of refletants) m.envMapIntensity = k * (0.18 + 0.82 * day);
    grad(SKY_HAUT, a, hautCol);
    peindreCiel(lit);
    matHalo.opacity = 0.62 * lit;
    halos.visible = lit > 0.02 && lampes.length > 0;
    matLueur.opacity = 0.85 * lit;
    matLueur.visible = lit > 0.02;
    matPoints.opacity = 0.9 * lit;
    matPoints.visible = lit > 0.02;
    matFlaque.opacity = 0.55 * lit;
    matFlaque.visible = lit > 0.05;
    grad(HSKY, a, hemi.color);
    grad(HGND, a, hemi.groundColor);
    hemi.intensity = (0.36 + 0.22 * day) * LUM;
    if (a > 0) {
      const el = clamp(22 + 0.85 * a, 22, 72) * RAD,
        ce = Math.cos(el); // un peu plus haut que le vrai soleil : des ombres plus courtes, plus douces
      sun.position.set(
        ce * Math.sin(sp0.az) * 125,
        Math.sin(el) * 125,
        -ce * Math.cos(sp0.az) * 125,
      ); // est = +x, nord = -z
      grad(SUNC, a, sun.color);
      sun.intensity = 0.85 * step(-1, 5, a) * LUM;
    } else {
      sun.position.set(-37, 94, 75);
      sun.color.set(0x9fb0ff);
      sun.intensity = 0.32 * step(-5, -11, a) * LUM; // clair de lune
    }
    matWinA.color.set(0xeef4fc).lerp(_c2.set(0xffe3a3), lit);
    matWinA.emissive.set(0xf2b95a).multiplyScalar(lit);
    matWinB.color.set(0xd3dff3).lerp(_c2.set(0x39417c), lit);
    matGlass.color.set(0x86b4e0).lerp(_c2.set(0xffe3a3), lit);
    matGlass.emissive.set(0xf2b95a).multiplyScalar(lit);
    matLamp.emissive.set(0xffe7a8).multiplyScalar(lit);
    matHead.emissive.set(0xfff0c0).multiplyScalar(lit);
    matGold.emissive.set(0x6b4e08).multiplyScalar(lit);
    matClock.emissive.set(0xb9b39a).multiplyScalar(lit);
    matDrop.emissive.set(0x2a4b78).multiplyScalar(lit);
    nightK = lit;
    shadowDirty = true;
  }

  /* ---- caméra et commandes */
  const EL = 0.6,
    SE = Math.sin(EL),
    CE = Math.cos(EL),
    LIM = 37;
  const view = { az: Math.PI / 4, size: 36, tx: 0, tz: 0 },
    goal = { az: Math.PI / 4, size: 36, tx: 0, tz: 0 };
  const minS = 7;
  let W = 1,
    H = 1,
    maxS = 40,
    defS = 30,
    pristine = true,
    focusPrev = null,
    focusKey = null,
    shadowDirty = true;
  function resize() {
    W = Math.max(1, host.clientWidth);
    H = Math.max(1, host.clientHeight);
    renderer.setSize(W, H, false);
    const asp = W / H,
      need = Math.max(35, 48 / asp);
    defS = (asp < 1 ? need * 0.72 : need) * cadrage;
    maxS = need * 1.3;
    if (pristine && !focusKey) {
      goal.size = defS;
      if (!intro) view.size = defS;
    }
    goal.size = clamp(goal.size, minS, maxS);
    if (focusKey) focus(focusKey, true);
    pinDirty = true;
  }
  function applyCam() {
    const asp = W / H;
    cam.left = -view.size * asp;
    cam.right = view.size * asp;
    cam.top = view.size;
    cam.bottom = -view.size;
    cam.updateProjectionMatrix();
    cam.position.set(
      view.tx + CE * Math.sin(view.az) * 260,
      SE * 260,
      view.tz + CE * Math.cos(view.az) * 260,
    );
    cam.lookAt(view.tx, 0, view.tz);
    cam.updateMatrixWorld();
  }
  function panBy(dx, dy) {
    const u = (2 * view.size) / H,
      ca = Math.cos(goal.az),
      sa = Math.sin(goal.az);
    goal.tx = clamp(goal.tx - ca * dx * u - (sa * dy * u) / SE, -LIM, LIM);
    goal.tz = clamp(goal.tz + sa * dx * u - (ca * dy * u) / SE, -LIM, LIM);
    view.tx = goal.tx;
    view.tz = goal.tz;
  }
  const HMX = BC[0],
    HMZ = BC[2];
  /* avant d'être un bâtiment, un quartier est bas : l'étiquette et le cadrage s'y règlent */
  const ancreBasse = (n) => [1.6, 3.4, 4.6][n] || 4.6;
  const hautBas = (n) => [1.0, 2.4, 3.4][n] || 3.4;
  const anchors = {
    bank: new T.Vector3(BKX, 8, BKZ),
    uni: new T.Vector3(UNX, 6.7, UNZ),
    plaza: new T.Vector3(PLX, 10.7, PLZ),
    shop: new T.Vector3(RSX + 1.2, 5.6, RSZ - 2.5),
    tower: new T.Vector3(TWX, 14, TWZ),
    park: new T.Vector3(PKX + 0.9, 2.6, PKZ + 0.5),
    home: new T.Vector3(HMX - 1.4, 4.4, HMZ - 1.4),
    library: new T.Vector3(LBX, 6.2, LBZ - 1.9),
  };
  for (const k in anchors)
    if (NQ[k] < 3) {
      const c = {
        bank: [BKX, BKZ],
        uni: [UNX, UNZ],
        plaza: [PLX, PLZ],
        shop: [RSX, RSZ],
        tower: [TWX, TWZ],
        park: [PKX, PKZ],
        home: [HMX, HMZ],
        library: [LBX, LBZ],
      }[k];
      anchors[k].set(c[0], ancreBasse(NQ[k]), c[1]);
    }
  const centers = {
    bank: () => [BKX, bank.top / 2, BKZ],
    uni: () => [UNX, 2.4, UNZ],
    plaza: () => [PLX, 4.4, PLZ],
    shop: () => [RSX, 1.6, RSZ],
    tower: () => [TWX, tower.top / 2, TWZ],
    park: () => [PKX, 1.2, PKZ],
    home: () => [HMX, 1.6, HMZ],
    library: () => [LBX, 2.2, LBZ],
  };
  for (const k in centers)
    if (NQ[k] < 3) {
      const c0 = centers[k]();
      centers[k] = () => [c0[0], hautBas(NQ[k]) / 2 + 0.6, c0[2]];
    }
  function focus(k, keep) {
    if (!keep && !focusKey) focusPrev = { size: goal.size, tx: goal.tx, tz: goal.tz };
    focusKey = k;
    const c = centers[k](),
      narrow = W <= 720;
    const size = clamp(
      narrow ? Math.max(13, c[1] * 2.6, (8.5 * H) / W) : Math.max(13.5, c[1] * 2.1),
      minS,
      maxS,
    );
    if (!keep) goal.size = size;
    const u = (2 * goal.size) / H;
    const ox = narrow ? 0 : -Math.min(442, W * 0.5) / 2,
      oy = narrow ? -(H * 0.64) / 2 + 20 : 0;
    const a = -ox * u,
      b = (oy * u + c[1] * CE) / SE;
    const ca = Math.cos(goal.az),
      sa = Math.sin(goal.az);
    goal.tx = c[0] + a * ca + b * -sa;
    goal.tz = c[2] + a * -sa + b * -ca;
  }
  function unfocus() {
    focusKey = null;
    if (focusPrev) {
      goal.size = focusPrev.size;
      goal.tx = focusPrev.tx;
      goal.tz = focusPrev.tz;
      focusPrev = null;
    }
    goal.tx = clamp(goal.tx, -LIM, LIM);
    goal.tz = clamp(goal.tz, -LIM, LIM);
  }
  const userMoved = () => {
    pristine = false;
    focusPrev = null;
    // La main a repris la caméra : l'entrée en scène s'efface devant elle.
    intro = false;
  };

  const hit = {};
  const hitMat = new T.MeshBasicMaterial({ visible: false });
  function hitBox(k, x, y, z, w, h, d) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), hitMat);
    m.position.set(x, y, z);
    m.userData.k = k;
    scene.add(m);
    (hit[k] = hit[k] || []).push(m);
    return m;
  }
  /* un quartier encore bas se touche sur tout son îlot, à hauteur de cabane */
  const hb = (k, x, y, z, w, h, d, X, Z) =>
    NQ[k] >= 3
      ? hitBox(k, x, y, z, w, h, d)
      : hitBox(k, X, hautBas(NQ[k]) / 2, Z, 9.4, hautBas(NQ[k]), 9.4);
  const bankHit = hb("bank", BKX, 4, BKZ, 9, 8, 9, BKX, BKZ);
  hb("uni", UNX, 2.6, UNZ, 9.4, 5.2, 9.4, UNX, UNZ);
  hb("plaza", PLX, 0.5, PLZ, 10, 1, 10, PLX, PLZ);
  if (NQ.plaza >= 3) hitBox("plaza", PLX, 5.2, PLZ, 3.2, 10.4, 3.2);
  hb("shop", RSX, 2.2, RSZ, 9.4, 4.4, 9.4, RSX, RSZ);
  hb("park", PKX, 1.1, PKZ, 9.2, 2.2, 9.2, PKX, PKZ);
  hb("home", HMX, 1.7, HMZ, 9.2, 3.4, 9.2, HMX, HMZ);
  hb("library", LBX, 2.4, LBZ, 9.2, 4.8, 9.2, LBX, LBZ);
  const towerHit = hb("tower", TWX, 5, TWZ, 8.4, 10, 8.4, TWX, TWZ);
  const hitList = [].concat(
    hit.bank,
    hit.uni,
    hit.plaza,
    hit.shop,
    hit.tower,
    hit.park,
    hit.home,
    hit.library,
  );

  /*
    ---- le contour des quartiers qui se touchent

    Rien ne distinguait un quartier actif d'un îlot de décor : il fallait
    lire les étiquettes, ou cliquer au hasard. Un filet doré court autour de
    chaque quartier, discret au repos, franc au survol et à l'ouverture.
  */
  const anneaux = {};
  const cadreQuartier = new T.RingGeometry(6.55, 6.95, 4, 1)
    .rotateZ(Math.PI / 4)
    .rotateX(-Math.PI / 2);
  [
    ["bank", BKX, BKZ],
    ["tower", TWX, TWZ],
    ["uni", UNX, UNZ],
    ["plaza", PLX, PLZ],
    ["shop", RSX, RSZ],
    ["park", PKX, PKZ],
    ["home", HMX, HMZ],
    ["library", LBX, LBZ],
  ].forEach((q, i) => {
    const mat = new T.MeshBasicMaterial({
      color: 0xf2c037,
      transparent: true,
      depthWrite: false,
      opacity: 0.18,
    });
    const m = new T.Mesh(cadreQuartier, mat);
    m.position.set(q[1], CURB + 0.045, q[2]);
    scene.add(m);
    anneaux[q[0]] = { mat, phase: i * 0.9 };
  });
  const ray = new T.Raycaster(),
    ndc = new T.Vector2();
  function pickAt(cx, cy) {
    const r = host.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
    ray.setFromCamera(ndc, cam);
    const h = ray.intersectObjects(hitList, false);
    return h.length ? h[0].object.userData.k : null;
  }

  const el = renderer.domElement,
    ptrs = new Map();
  let moved = false,
    downAt = 0,
    downX = 0,
    downY = 0,
    rotating = false,
    pinch = null,
    hot = null;
  function pinchState() {
    const p = Array.from(ptrs.values());
    const dx = p[1].x - p[0].x,
      dy = p[1].y - p[0].y;
    return {
      dist: Math.hypot(dx, dy),
      ang: Math.atan2(dy, dx),
      cx: (p[0].x + p[1].x) / 2,
      cy: (p[0].y + p[1].y) / 2,
    };
  }
  el.addEventListener("pointerdown", (e) => {
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // un pointeur déjà relâché ne se capture pas : sans conséquence
    }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      moved = false;
      downAt = performance.now();
      downX = e.clientX;
      downY = e.clientY;
      rotating = e.button === 2 || e.shiftKey;
    } else if (ptrs.size === 2) {
      pinch = pinchState();
      moved = true;
    }
    host.classList.add("is-drag");
  });
  el.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === "mouse") {
        const k = pickAt(e.clientX, e.clientY);
        if (k !== hot) {
          hot = k;
          host.classList.toggle("is-hot", !!k);
          for (const n in pinEls) pinEls[n].classList.toggle("is-hover", n === k);
        }
      }
      return;
    }
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    if (ptrs.size === 1) {
      if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) < 6) return;
      moved = true;
      userMoved();
      p.x = e.clientX;
      p.y = e.clientY;
      if (rotating) {
        goal.az -= dx * 0.006;
        view.az = goal.az;
      } else panBy(dx, dy);
    } else if (ptrs.size === 2 && pinch) {
      p.x = e.clientX;
      p.y = e.clientY;
      userMoved();
      const s = pinchState();
      goal.size = view.size = clamp((goal.size * pinch.dist) / Math.max(1, s.dist), minS, maxS);
      let da = s.ang - pinch.ang;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      goal.az += da;
      view.az = goal.az;
      panBy(s.cx - pinch.cx, s.cy - pinch.cy);
      pinch = s;
    }
  });
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    const single = ptrs.size === 1;
    ptrs.delete(e.pointerId);
    pinch = null;
    if (!ptrs.size) host.classList.remove("is-drag");
    if (single && !moved && e.type === "pointerup" && performance.now() - downAt < 700) {
      const k = pickAt(e.clientX, e.clientY);
      if (k) onPick(k);
    }
  }
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      userMoved();
      goal.size = clamp(goal.size * Math.exp(e.deltaY * 0.0012), minS, maxS);
    },
    { passive: false },
  );
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  /* ---- boucle de rendu */
  let playing = true,
    last = performance.now(),
    time = 0;
  const _pv = new T.Vector3(),
    pinW = {};
  let pinDirty = true;
  function updatePins() {
    if (pinDirty) {
      for (const k in pinEls) pinW[k] = pinEls[k].offsetWidth;
      pinDirty = false;
    }
    if (NQ.bank >= 3) anchors.bank.y = bank.top * bank.group.scale.y + 3.2;
    if (NQ.tower >= 3) anchors.tower.y = tower.top * tower.group.scale.y + 0.9;
    for (const k in pinEls) {
      if (!anchors[k]) continue;
      _pv.copy(anchors[k]).project(cam);
      const hw = (pinW[k] || 0) / 2 + 8,
        y = Math.max(40, (-_pv.y * 0.5 + 0.5) * H);
      const x = W > hw * 2 ? clamp((_pv.x * 0.5 + 0.5) * W, hw, W - hw) : (_pv.x * 0.5 + 0.5) * W;
      pinEls[k].style.transform =
        "translate3d(" + x.toFixed(1) + "px," + (y - 8).toFixed(1) + "px,0) translate(-50%,-100%)";
    }
  }
  function simulate(dt) {
    time += dt;
    for (const c of cars) stepCar(c, dt);
    stepPeds(dt, time);
    for (const g of clouds) {
      g.position.x += g.userData.v * dt;
      if (g.position.x > 56) g.position.x = -56;
    }
    coin.rotation.y += dt * 1.3;
    {
      const bk = nightK * (Math.sin(time * 3.2) > 0 ? 1 : 0.2);
      matBeacon.emissive.setRGB(feu[0] * bk, feu[1] * bk, feu[2] * bk);
    }
    flag.rotation.y = Math.sin(time * 3.1) * 0.35 + 0.2;
    flammes.forEach((f, i) => {
      f.scale.y =
        (i ? 0.6 : 0.95) * (1 + 0.16 * Math.sin(time * 11 + i * 2) + 0.08 * Math.sin(time * 23));
    });
    if (PV.feux) {
      const ph = time % CYCLE;
      matFeuA.color.set(ph < 6 ? 0x27a97f : ph < 7 ? 0xf2c037 : 0xe5484d);
      matFeuB.color.set(ph >= 7 && ph < 13 ? 0x27a97f : ph >= 13 ? 0xf2c037 : 0xe5484d);
    }
    if (ballon.children.length) {
      const a = time * 0.025;
      // au-dessus de la plus haute tour : à 17, sa course la faisait passer au travers
      ballon.position.set(Math.cos(a) * 24, 25 + Math.sin(time * 0.4) * 0.6, Math.sin(a) * 18 - 4);
    }
    voiliers.forEach((v, i) => {
      v.position.y = -0.75 + Math.sin(time * 1.3 + i) * 0.06;
      v.rotation.z = Math.sin(time * 0.9 + i * 2) * 0.05;
    });
    stepFete(dt);
    if (jet.visible) {
      for (let i = 0; i < NJET; i++) {
        const th = i * 2.4,
          p = (time * 0.7 + i / NJET) % 1,
          r = 0.12 + 0.55 * p;
        _im.compose(
          _ip.set(
            PKX + 0.9 + Math.cos(th) * r,
            CURB + 0.1 + 2.2 * p * (1.6 - p),
            PKZ + 0.5 + Math.sin(th) * r,
          ),
          _iq,
          _is.set(0.16, 0.16, 0.16),
        );
        jet.setMatrixAt(i, _im);
      }
      jet.instanceMatrix.needsUpdate = true;
    }
    if (balloons.visible) balloons.position.y = balloonY + Math.sin(time * 1.6) * 0.12;
    ducks.forEach((d) => {
      if (!d.m.visible) return;
      d.a += dt * 0.35;
      d.m.position.set(
        PKX + 0.9 + Math.cos(d.a) * 1.5,
        CURB + 0.14,
        PKZ + 0.5 + Math.sin(d.a) * 0.95,
      );
      d.m.rotation.y = -d.a;
    });
    if (drops.visible) {
      /*
        Au pied de la tour de l'horloge, les jets partent de son socle ; au
        deuxième âge, sans tour, ils partent de la vasque centrale. Partir du
        même rayon dans les deux cas les faisait jaillir de nulle part.
      */
      const r0 = NQ.plaza >= 3 ? 1.4 : 0.32,
        dr = NQ.plaza >= 3 ? 0.55 : 1.3,
        y0 = CURB + (NQ.plaza >= 3 ? 0.5 : 0.66),
        hj = NQ.plaza >= 3 ? 3.4 : 2.6;
      for (let i = 0; i < NDROP; i++) {
        const th = ((i % 8) * Math.PI) / 4 + 0.39,
          p = (time * 0.85 + (i < 8 ? 0 : 0.5)) % 1,
          r = r0 + dr * p;
        _im.compose(
          _ip.set(PLX + Math.cos(th) * r, y0 + hj * p * (1 - p), PLZ + Math.sin(th) * r),
          _iq,
          _is.set(0.18, 0.18, 0.18),
        );
        drops.setMatrixAt(i, _im);
      }
      drops.instanceMatrix.needsUpdate = true;
    }
    if (storm.visible) {
      for (let i = 0; i < NR; i++) {
        const s = rainSeed[i],
          y = -0.6 - ((time * 6 + s[2] * 8) % 8),
          o = i * 6;
        rainPos[o] = s[0];
        rainPos[o + 1] = y;
        rainPos[o + 2] = s[1];
        rainPos[o + 3] = s[0];
        rainPos[o + 4] = y - 0.4;
        rainPos[o + 5] = s[1];
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
  }
  let rafId = 0,
    arrete = false,
    intro = false,
    debut = 0;
  /*
    Qualité adaptative. Un appareil qui peine rend la ville par paliers moins
    coûteux : moins de pixels, puis des ombres figées (recalculées seulement
    avec le soleil), puis une résolution réduite, puis plus d'ombres du tout.
    Une ville un peu moins fine vaut mieux qu'une ville qui saccade : à deux
    images par seconde, on ne peut plus rien viser. On ne remonte jamais : une
    qualité qui oscille se voit davantage qu'une qualité un peu basse.

    La mesure prend la médiane des images, pas la moyenne : la première image,
    qui compile les shaders, peut durer une seconde sur un appareil rapide, et
    ne doit pas le faire passer pour lent.
  */
  const paliers = [
    () => {
      if (renderer.getPixelRatio() <= 1) return false;
      renderer.setPixelRatio(1);
      return true;
    },
    () => {
      renderer.shadowMap.autoUpdate = false;
      shadowDirty = true;
      // ce qui bouge ne doit plus porter d'ombre : figée, elle resterait derrière l'objet
      for (const o of [pedBody, pedHead, ballon, ...clouds, ...voiliers, ...cars.map((c) => c.g)])
        o.traverse((x) => (x.castShadow = false));
      return true;
    },
    () => {
      renderer.setPixelRatio(Math.min(renderer.getPixelRatio(), 0.75));
      return true;
    },
    () => {
      sun.castShadow = false;
      renderer.setPixelRatio(Math.min(renderer.getPixelRatio(), 0.6));
      return true;
    },
  ];
  let qNiveau = 0,
    qPause = 2,
    qTemps = 0;
  const qImages = [];
  function adapterQualite(brut) {
    if (qNiveau >= paliers.length || document.hidden) return;
    // les images qui suivent un changement recompilent ou réallouent : on ne les compte pas
    if (qPause > 0) {
      qPause--;
      return;
    }
    qImages.push(brut);
    qTemps += brut;
    const franchementLent = qImages.length >= 3 && Math.min(...qImages) > 0.15;
    if (qTemps < 1.5 && !franchementLent) return;
    const tri = qImages.slice().sort((x, y) => x - y),
      mediane = tri[tri.length >> 1];
    qImages.length = 0;
    qTemps = 0;
    if (mediane < 0.04) {
      qNiveau = paliers.length; // assez rapide : on n'y touche plus
      return;
    }
    while (qNiveau < paliers.length && !paliers[qNiveau++]());
    resize();
    qPause = 2;
  }
  function frame(now) {
    if (arrete) return;
    rafId = requestAnimationFrame(frame);
    const brut = Math.max(0, (now - last) / 1000);
    last = now;
    // La simulation avance à petits pas : une voiture ne doit pas sauter un carrefour sur une image lente.
    const dt = Math.min(0.05, brut);
    /*
      La caméra et les animations, elles, suivent l'horloge et non le nombre
      d'images. Au pas fixe, un appareil à deux images par seconde mettait une
      demi-minute à poser la caméra, et les étiquettes glissaient pendant tout
      ce temps : impossibles à viser.
    */
    const dtCam = Math.min(1, brut);
    if (intro && now - debut > 1900) intro = false;
    adapterQualite(brut);
    // L'entrée en scène se pose doucement ; ensuite la caméra répond vite.
    const k = 1 - Math.exp(-dtCam * (intro ? 2.6 : 7));
    view.az += (goal.az - view.az) * k;
    view.size += (goal.size - view.size) * k;
    view.tx += (goal.tx - view.tx) * k;
    view.tz += (goal.tz - view.tz) * k;
    // Arrivée à un millième près : on pose, plutôt que de glisser d'un dixième de pixel sans fin.
    if (
      Math.abs(goal.size - view.size) < 1e-3 &&
      Math.abs(goal.tx - view.tx) < 1e-3 &&
      Math.abs(goal.tz - view.tz) < 1e-3 &&
      Math.abs(goal.az - view.az) < 1e-4
    ) {
      view.size = goal.size;
      view.tx = goal.tx;
      view.tz = goal.tz;
      view.az = goal.az;
    }
    applyCam();
    if (now >= sunNext) {
      applySun();
      sunNext = now + 5000;
    }
    if (playing) simulate(dt);
    if (bank.anim) {
      bank.anim.t = Math.min(1, bank.anim.t + dtCam / 0.9);
      const t = bank.anim.t,
        e = 1 - Math.pow(1 - t, 3);
      bank.group.scale.y = bank.anim.from + (1 - bank.anim.from) * e;
      coin.position.y = bank.top * bank.group.scale.y + 1.3;
      shadowDirty = true;
      if (t >= 1) bank.anim = null;
    }
    if (tower.anim) {
      tower.anim.t = Math.min(1, tower.anim.t + dtCam / 0.9);
      const t2 = tower.anim.t,
        e2 = 1 - Math.pow(1 - t2, 3);
      tower.group.scale.y = tower.anim.from + (1 - tower.anim.from) * e2;
      beacon.position.y = tower.top * tower.group.scale.y;
      shadowDirty = true;
      if (t2 >= 1) tower.anim = null;
    }
    const d = new Date(),
      mn = d.getMinutes() + d.getSeconds() / 60,
      hr = (d.getHours() % 12) + mn / 60;
    for (const f of clockFaces) {
      f.mm.rotation.z = (-mn / 60) * Math.PI * 2;
      f.hh.rotation.z = (-hr / 12) * Math.PI * 2;
    }
    if (shadowDirty) {
      renderer.shadowMap.needsUpdate = true;
      shadowDirty = false;
    }
    for (const cle in anneaux) {
      const an = anneaux[cle];
      const cible =
        cle === focusKey ? 0.95 : cle === hot ? 0.8 : 0.17 + 0.07 * Math.sin(time * 1.6 + an.phase);
      an.mat.opacity += (cible - an.mat.opacity) * Math.min(1, dt * 8);
    }
    refletTex.rotation = time * 0.04;
    refletTex.offset.x = time * 0.012;
    if (scintillement) {
      scintillement.offset.x = time * 0.006;
      scintillement.offset.y = Math.sin(time * 0.2) * 0.02;
      // la nuit, l'eau ne renvoie plus qu'un peu de lune : des éclats blancs y faisaient des étoiles
      surfaceMer.material.opacity = 0.35 * (1 - 0.75 * nightK);
    }
    matReflet.opacity = (0.4 + 0.12 * Math.sin(time * 1.3)) * (1 - 0.55 * nightK);
    renderer.render(scene, cam);
    updatePins();
  }

  /*
    Les règles (combien d'étages pour quel patrimoine, à partir de combien de
    retards l'orage grossit) vivent dans `etat.ts`, où elles sont vérifiées.
    Ici, on ne fait que montrer ce qui est demandé.
  */
  function update(d) {
    fete = !!d.fete;
    const floors = clamp(Math.round(d.etagesBanque), 5, 18);
    if (NQ.bank >= 3 && floors !== bank.floors) {
      const old = bank.top;
      buildBank(floors);
      bankHit.scale.y = bank.top / 8;
      bankHit.position.y = bank.top / 2;
      bank.group.scale.y = 1;
      if (old) bank.anim = { from: old / bank.top, t: 0 };
      shadowDirty = true;
      if (focusKey === "bank") focus("bank", true);
    }
    const tf = clamp(Math.round(d.etagesTour), 10, 20);
    if (NQ.tower >= 3 && tf !== tower.floors) {
      const oldT = tower.top;
      buildTower(tf);
      towerHit.scale.y = tower.top / 10;
      towerHit.position.y = tower.top / 2;
      tower.group.scale.y = 1;
      if (oldT) tower.anim = { from: oldT / tower.top, t: 0 };
      shadowDirty = true;
      if (focusKey === "tower") focus("tower", true);
    }
    pinDirty = true;
    feu =
      d.ton === "profit"
        ? [0.15, 0.85, 0.5]
        : d.ton === "loss"
          ? [0.95, 0.12, 0.12]
          : [0.95, 0.75, 0.2];
    matBeacon.color.set(d.ton === "profit" ? 0x27a97f : d.ton === "loss" ? 0xe5484d : 0xf2c037);
    /* chacun son décor : pas d'élèves sans école, pas de joggeurs sans étang */
    live.students = NQ.uni >= 2 ? clamp(d.etudiants, 0, 10) : 0;
    live.strollers = NQ.plaza >= 1 ? clamp(d.promeneurs, 0, 16) : 0;
    live.joggers = NQ.park >= 2 ? clamp(d.joggeurs, 0, 6) : 0;
    storm.visible = d.orage > 0;
    storm.scale.setScalar(d.orage >= 2 ? 1.35 : 1);
    anchors.uni.y =
      d.orage > 0 ? (d.orage >= 2 ? 11.6 : 10.9) : NQ.uni >= 3 ? 5.9 : ancreBasse(NQ.uni); // l'étiquette reste au-dessus du nuage
    balloons.visible = !!d.ballons;
    matFlag.color.set(d.orage > 0 ? 0xe5484d : C.yellow);
    const nt = clamp(d.presentoirs, 0, 8);
    tables.forEach((m, i) => {
      const v = i < nt;
      if (m.visible !== v) {
        m.visible = v;
        shadowDirty = true;
      }
    });
    live.diners = nt * 2;
    const np = clamp(d.piles, 0, 8);
    piles.forEach((m, i) => {
      const v = i < np;
      if (m.visible !== v) {
        m.visible = v;
        shadowDirty = true;
      }
    });
    live.readers = clamp(d.lecteurs, 0, 6);
    stalls.forEach((s, i) => {
      const v = i < clamp(d.etals, 0, 4);
      if (s.visible !== v) {
        s.visible = v;
        shadowDirty = true;
      }
    });
  }

  if (NQ.bank >= 3) buildBank(5);
  if (NQ.tower >= 3) buildTower(10);
  applySun();
  resize();
  /*
    L'entrée en scène : la ville arrive d'un peu plus loin, d'un quart de
    tour, et se pose. Pas pour qui a demandé moins de mouvement.
  */
  if (!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    intro = true;
    debut = performance.now();
    view.size = goal.size * 1.5;
    view.az = goal.az - 0.75;
  }
  applyCam();
  stepPeds(0, 0);
  simulate(0);
  window.addEventListener("resize", resize);
  const guetteur = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (guetteur) guetteur.observe(host);
  rafId = requestAnimationFrame(frame);

  /*
    Sans cet arrêt, quitter la ville laisserait tourner la boucle de rendu et
    garderait le contexte WebGL : les navigateurs n'en accordent qu'une
    poignée par page, et la quatrième visite afficherait un cadre vide.
  */
  function dispose() {
    arrete = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resize);
    if (guetteur) guetteur.disconnect();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else if (m) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    });
    cielTex.dispose();
    // le ciel reflété n'est attaché à aucun objet de la scène : le parcours ci-dessus ne le voit pas
    if (envTex) envTex.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  return {
    update,
    focus: (k) => focus(k),
    unfocus,
    setClock: (fn) => {
      clockFn = fn || (() => new Date());
      sunNext = 0;
    },
    rotate: (dir) => {
      userMoved();
      goal.az += (dir * Math.PI) / 2;
      if (focusKey) focus(focusKey, true);
    },
    setPlaying: (p) => {
      playing = !!p;
    },
    /* ce que coûte une image : de quoi vérifier qu'un ajout ne fait pas exploser le rendu */
    stats: () => ({
      ...renderer.info.render,
      ...renderer.info.memory,
      qualite: qNiveau,
      legere: legere ? 1 : 0,
    }),
    /* où sont les véhicules : de quoi vérifier, de l'extérieur, qu'aucun ne traverse un autre */
    diagnostic: () =>
      cars.map((c) => ({
        x: c.x,
        z: c.z,
        len: c.len,
        fx: c.fx,
        fz: c.fz,
        v: c.v,
        ghost: c.ghost > 0,
      })),
    dispose,
  };
}

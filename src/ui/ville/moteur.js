import * as T from "three";
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
    Les couleurs sont écrites telles qu'elles doivent sortir à l'écran. La
    gestion des couleurs de three les convertirait deux fois : à la lecture,
    puis à l'affichage, et toute la palette pâlirait.
  */
  T.ColorManagement.enabled = false;
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.outputColorSpace = T.LinearSRGBColorSpace;
  const small =
    Math.min(window.innerWidth, window.innerHeight) < 720 || (navigator.maxTouchPoints || 0) > 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  if (small) renderer.shadowMap.autoUpdate = false;
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
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
    lawn: 0xd2ebd7,
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
    leaf: [0x7ed6a5, 0x6ccb98, 0x93dfb6, 0x5fc48e],
    pine: [0x55bf8c, 0x49b381],
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
  };

  /* ---- fusion : des milliers de petites formes deviennent une poignée d'appels de dessin */
  const _v = new T.Vector3(),
    _nm = new T.Matrix3(),
    _col = new T.Color();
  class Batch {
    constructor() {
      this.p = [];
      this.n = [];
      this.c = [];
    }
    add(geo, m, color) {
      const pos = geo.attributes.position,
        nor = geo.attributes.normal;
      _nm.getNormalMatrix(m);
      _col.set(color);
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(m);
        this.p.push(_v.x, _v.y, _v.z);
        _v.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
        this.n.push(_v.x, _v.y, _v.z);
        this.c.push(_col.r, _col.g, _col.b);
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
  function put(b, geo, P, x, y, z, sx, sy, sz, color, ry, rx, rz) {
    _e.set(rx || 0, ry || 0, rz || 0, "YXZ");
    _l.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
    _w.multiplyMatrices(P, _l);
    b.add(geo, _w, color);
  }
  const bx = (b, P, x, y0, z, w, h, d, col, ry) =>
    put(b, G.box, P, x, y0 + h / 2, z, w, h, d, col, ry || 0);
  const cy = (b, P, x, y0, z, r, h, col, geo) =>
    put(b, geo || G.cyl, P, x, y0 + h / 2, z, r * 2, h, r * 2, col);
  const sp = (b, P, x, y, z, r, col, geo) =>
    put(b, geo || G.sph, P, x, y, z, r * 2, r * 2, r * 2, col);

  /* ---- matières */
  const matStatic = new T.MeshLambertMaterial({ vertexColors: true });
  /* terre battue, puis pavés, puis goudron : la chaussée dit l'âge de la ville */
  const matSlab = new T.MeshLambertMaterial({
    color: PV.routes >= 2 ? C.road : PV.routes === 1 ? 0xcfc9be : 0xd9c8a6,
  });
  const matFlamme = new T.MeshLambertMaterial({ color: 0xf6a23a, emissive: 0x7a3a08 });
  const matFeuA = new T.MeshBasicMaterial({ color: 0x27a97f });
  const matFeuB = new T.MeshBasicMaterial({ color: 0xe5484d });
  const matWinA = new T.MeshLambertMaterial({ color: 0xeef4fc });
  const matWinB = new T.MeshLambertMaterial({ color: 0xd3dff3 });
  const matGlass = new T.MeshLambertMaterial({ color: 0x86b4e0 });
  const matLamp = new T.MeshLambertMaterial({ color: 0xf4f4ee });
  const matHead = new T.MeshLambertMaterial({ color: 0xf7f7f0 });
  const matGold = new T.MeshLambertMaterial({ color: C.gold });
  const matCloud = new T.MeshLambertMaterial({ color: 0xffffff });
  const matStorm = new T.MeshLambertMaterial({ color: 0x9aa2bc });
  const matClock = new T.MeshLambertMaterial({ color: 0xffffff });
  const matDark = new T.MeshLambertMaterial({ color: C.dark });
  const matDrop = new T.MeshLambertMaterial({ color: 0xbfe6fb });
  const matFlag = new T.MeshLambertMaterial({ color: C.yellow, side: T.DoubleSide });
  const matPed = new T.MeshLambertMaterial({ color: 0xffffff });
  const matSkin = new T.MeshLambertMaterial({ color: 0xffffff });

  const B = {
    main: new Batch(),
    ground: new Batch(),
    winA: new Batch(),
    winB: new Batch(),
    lamp: new Batch(),
    glass: new Batch(),
  };

  /* ---- pièces réutilisables */
  function windowsOn(wb, P, w, d, y0, floors, fh, rand, opt) {
    const faces = (opt && opt.faces) || [0, 1, 2, 3];
    for (const f of faces) {
      const span = f < 2 ? w : d,
        n = Math.max(1, Math.floor((span - 0.35) / 0.85)),
        step = span / n;
      for (let fl = 0; fl < floors; fl++) {
        if (opt && opt.skip && opt.skip(f, fl)) continue;
        const y = y0 + fl * fh + fh * 0.55;
        for (let i = 0; i < n; i++) {
          const t = -span / 2 + step * (i + 0.5),
            b = rand() < 0.6 ? wb.A : wb.B;
          if (f === 0) put(b, G.quad, P, t, y, d / 2 + 0.015, 0.44, 0.46, 1, 0xffffff, 0);
          else if (f === 1)
            put(b, G.quad, P, t, y, -d / 2 - 0.015, 0.44, 0.46, 1, 0xffffff, Math.PI);
          else if (f === 2)
            put(b, G.quad, P, w / 2 + 0.015, y, t, 0.44, 0.46, 1, 0xffffff, Math.PI / 2);
          else put(b, G.quad, P, -w / 2 - 0.015, y, t, 0.44, 0.46, 1, 0xffffff, -Math.PI / 2);
        }
      }
    }
  }
  const WIN = { A: B.winA, B: B.winB };
  function tree(x, z, y0, s, pine) {
    s = s || 1;
    cy(B.main, I4, x, y0, z, 0.07 * s, 0.6 * s, C.trunk, G.cyl8);
    if (pine) {
      put(B.main, G.cone, I4, x, y0 + 0.4 * s, z, 1.05 * s, 1.1 * s, 1.05 * s, pick(C.pine));
      put(B.main, G.cone, I4, x, y0 + 0.98 * s, z, 0.76 * s, 0.95 * s, 0.76 * s, pick(C.pine));
    } else sp(B.main, I4, x, y0 + 0.95 * s, z, 0.52 * s, pick(C.leaf));
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
  const lampes = [];
  function lamp(x, z, y0) {
    if (PV.eclairage < 1) return;
    lampes.push([x, y0, z]);
    cy(B.main, I4, x, y0, z, 0.045, 1.7, C.metal, G.cyl8);
    sp(B.lamp, I4, x, y0 + 1.8, z, 0.15, 0xffffff);
  }
  function house(x, z, ry, roofCol, y0) {
    const P = place(x, z, ry, y0);
    bx(B.main, P, 0, 0, 0, 2.0, 1.15, 1.6, C.wall);
    put(B.main, G.prism, P, 0, 1.15, 0, 1.9, 0.82, 2.3, roofCol, Math.PI / 2);
    bx(B.main, P, 0.55, 1.3, -0.3, 0.22, 0.62, 0.22, C.wall);
    bx(B.main, P, -0.5, 0, 0.8, 0.34, 0.62, 0.05, roofCol);
    put(B.winA, G.quad, P, 0.32, 0.68, 0.815, 0.56, 0.42, 1, 0xffffff, 0);
    put(B.winB, G.quad, P, -0.4, 0.68, -0.815, 0.46, 0.42, 1, 0xffffff, Math.PI);
    put(B.winB, G.quad, P, 0.4, 0.68, -0.815, 0.46, 0.42, 1, 0xffffff, Math.PI);
    put(B.winA, G.quad, P, 1.015, 0.68, 0, 0.5, 0.42, 1, 0xffffff, Math.PI / 2);
    put(B.winB, G.quad, P, -1.015, 0.68, 0, 0.5, 0.42, 1, 0xffffff, -Math.PI / 2);
  }
  function apartment(x, z, ry, w, d, floors, col, y0, band) {
    const P = place(x, z, ry, y0),
      fh = 0.78,
      h = floors * fh + 0.25;
    bx(B.main, P, 0, 0, 0, w, h, d, col);
    bx(B.main, P, 0, h, 0, w + 0.14, 0.12, d + 0.14, C.roof);
    bx(B.main, P, w * 0.18, h + 0.12, -d * 0.15, 0.7, 0.34, 0.6, 0xdadee6);
    if (floors > 8) cy(B.main, P, -w * 0.2, h + 0.12, d * 0.16, 0.3, 0.42, 0xdadee6);
    if (band)
      bx(B.main, P, 0, Math.floor(floors / 2) * fh + 0.02, 0, w + 0.1, 0.16, d + 0.1, C.white);
    bx(B.main, P, 0, 0, d / 2 + 0.02, 0.55, 0.72, 0.05, 0xffffff);
    windowsOn(WIN, P, w, d, 0.12, floors, fh, R);
  }
  function shop(x, z, ry, w, col, y0) {
    const P = place(x, z, ry, y0);
    bx(B.main, P, 0, 0, 0, w, 1.5, 2.4, C.wall);
    bx(B.main, P, 0, 1.5, 0, w + 0.1, 0.12, 2.5, C.roof);
    bx(B.main, P, w * 0.15, 1.62, -0.5, 0.6, 0.3, 0.5, 0xdadee6);
    put(B.main, G.box, P, 0, 1.12, 1.48, w - 0.08, 0.08, 0.72, col, 0, 0.36);
    bx(B.main, P, 0, 1.3, 1.2, w * 0.62, 0.28, 0.08, col);
    bx(B.main, P, -w / 2 + 0.42, 0, 1.2, 0.42, 0.86, 0.05, col);
    put(B.winA, G.quad, P, 0.28, 0.58, 1.216, w * 0.5, 0.76, 1, 0xffffff, 0);
  }
  function vehicle(b, lights, P, kind, col) {
    const wheel = (x, z, r) =>
      put(b, G.cyl8, P, x, r, z, r * 2, 0.12, r * 2, C.tire, 0, 0, Math.PI / 2);
    let L = 1.55;
    if (kind === "velo") {
      /* un cadre, deux roues fines, un cycliste */
      L = 0.9;
      put(b, G.cyl8, P, 0, 0.2, 0.32, 0.4, 0.04, 0.4, C.tire, 0, 0, Math.PI / 2);
      put(b, G.cyl8, P, 0, 0.2, -0.32, 0.4, 0.04, 0.4, C.tire, 0, 0, Math.PI / 2);
      bx(b, P, 0, 0.2, 0, 0.04, 0.05, 0.66, col);
      bx(b, P, 0, 0.22, -0.08, 0.04, 0.28, 0.04, col);
      cy(b, P, 0, 0.42, -0.04, 0.09, 0.34, col, G.cyl8);
      sp(b, P, 0, 0.86, -0.02, 0.09, 0xf3d3b5);
      return 0;
    } else if (kind === "deudeuche") {
      /* la 2 CV : caisse basse, toit bombé, ailes rondes */
      bx(b, P, 0, 0.13, 0, 0.72, 0.3, 1.5, col);
      put(b, G.cyl, P, 0, 0.43, -0.12, 0.68, 0.62, 0.95, col, 0, Math.PI / 2);
      bx(b, P, 0, 0.36, 0.2, 0.7, 0.18, 0.04, C.glass);
      for (const s of [-1, 1]) for (const z of [0.5, -0.5]) sp(b, P, s * 0.34, 0.2, z, 0.17, col);
      bx(b, P, 0, 0.14, 0.76, 0.5, 0.12, 0.04, C.metal);
      wheel(0.34, 0.5, 0.13);
      wheel(-0.34, 0.5, 0.13);
      wheel(0.34, -0.5, 0.13);
      wheel(-0.34, -0.5, 0.13);
    } else if (kind === "taxi" || kind === "sport") {
      const bas = kind === "sport";
      bx(b, P, 0, 0.12, 0, 0.78, bas ? 0.24 : 0.3, bas ? 1.7 : 1.55, col);
      bx(b, P, 0, bas ? 0.36 : 0.42, -0.12, 0.64, bas ? 0.2 : 0.26, bas ? 0.7 : 0.8, C.glass);
      bx(b, P, 0, bas ? 0.56 : 0.68, -0.12, 0.66, 0.05, bas ? 0.72 : 0.82, col);
      if (bas) {
        L = 1.7;
        bx(b, P, 0, 0.42, -0.8, 0.78, 0.04, 0.16, C.dark);
        bx(b, P, 0.3, 0.3, -0.8, 0.04, 0.12, 0.08, C.dark);
        bx(b, P, -0.3, 0.3, -0.8, 0.04, 0.12, 0.08, C.dark);
      } else {
        bx(b, P, 0, 0.73, -0.12, 0.34, 0.12, 0.18, C.white);
        bx(b, P, 0, 0.3, 0, 0.8, 0.06, 1.2, C.dark);
      }
      wheel(0.37, 0.52, 0.14);
      wheel(-0.37, 0.52, 0.14);
      wheel(0.37, -0.52, 0.14);
      wheel(-0.37, -0.52, 0.14);
    } else if (kind === "camion") {
      L = 2.7;
      bx(b, P, 0, 0.2, 0.95, 0.9, 0.85, 0.75, col);
      bx(b, P, 0, 0.62, 1.33, 0.82, 0.3, 0.04, C.glass);
      bx(b, P, 0, 0.26, -0.38, 0.96, 1.15, 1.9, C.white);
      bx(b, P, 0, 0.9, -0.38, 0.98, 0.18, 1.92, col);
      wheel(0.44, 0.95, 0.18);
      wheel(-0.44, 0.95, 0.18);
      wheel(0.44, -0.6, 0.18);
      wheel(-0.44, -0.6, 0.18);
      wheel(0.44, -1.05, 0.18);
      wheel(-0.44, -1.05, 0.18);
    } else if (kind === "tram") {
      /* deux voitures articulées et un pantographe : il ne roule que sur goudron */
      L = 4.4;
      for (const z of [-1.1, 1.1]) {
        bx(b, P, 0, 0.2, z, 0.92, 0.95, 2.1, C.white);
        bx(b, P, 0, 0.6, z, 0.95, 0.32, 1.9, C.glass);
        bx(b, P, 0, 0.26, z, 0.95, 0.1, 2.1, col);
        bx(b, P, 0, 1.15, z, 0.84, 0.06, 2.0, C.metal);
      }
      bx(b, P, 0, 0.25, 0, 0.8, 0.85, 0.2, C.dark);
      put(b, G.box, P, 0, 1.5, 0.6, 0.04, 0.7, 0.04, C.dark, 0, 0.5);
      bx(b, P, 0, 1.78, 0.42, 0.5, 0.03, 0.06, C.dark);
      for (const z of [1.75, 0.45, -0.45, -1.75]) {
        wheel(0.44, z, 0.15);
        wheel(-0.44, z, 0.15);
      }
    } else if (kind === "van") {
      L = 2.1;
      bx(b, P, 0, 0.16, -0.2, 0.86, 0.8, 1.5, C.white);
      bx(b, P, 0, 0.16, 0.78, 0.84, 0.56, 0.5, C.white);
      bx(b, P, 0, 0.44, 1.0, 0.78, 0.24, 0.08, C.glass);
      bx(b, P, 0, 0.44, -0.2, 0.89, 0.16, 1.3, col);
      wheel(0.42, 0.62, 0.16);
      wheel(-0.42, 0.62, 0.16);
      wheel(0.42, -0.62, 0.16);
      wheel(-0.42, -0.62, 0.16);
    } else if (kind === "bus") {
      L = 3.0;
      bx(b, P, 0, 0.18, 0, 0.9, 0.85, 3.0, col);
      bx(b, P, 0, 0.6, 0, 0.93, 0.28, 2.7, C.glass);
      bx(b, P, 0, 1.03, 0, 0.84, 0.05, 2.86, C.white);
      wheel(0.44, 0.95, 0.17);
      wheel(-0.44, 0.95, 0.17);
      wheel(0.44, -0.95, 0.17);
      wheel(-0.44, -0.95, 0.17);
    } else {
      bx(b, P, 0, 0.13, 0, 0.74, 0.3, 1.55, col);
      bx(b, P, 0, 0.43, -0.1, 0.66, 0.26, 0.8, C.glass);
      bx(b, P, 0, 0.69, -0.1, 0.68, 0.05, 0.82, col);
      wheel(0.36, 0.5, 0.14);
      wheel(-0.36, 0.5, 0.14);
      wheel(0.36, -0.5, 0.14);
      wheel(-0.36, -0.5, 0.14);
    }
    const lb = lights || b;
    bx(lb, P, 0.25, 0.26, L / 2 - (kind === "van" ? 0.04 : 0) + 0.005, 0.15, 0.1, 0.04, 0xfff6d8);
    bx(lb, P, -0.25, 0.26, L / 2 - (kind === "van" ? 0.04 : 0) + 0.005, 0.15, 0.1, 0.04, 0xfff6d8);
  }

  /*
    ---- les premiers âges d'un quartier

    Un quartier ne naît pas en immeuble : cabane (niveau 1), puis maison
    (niveau 2), puis le bâtiment de la ville (3), puis sa version de prestige
    (4). Les deux premiers âges partagent ces pièces ; chaque quartier y
    accroche le petit signe qui dit ce qu'il deviendra.
  */
  const YQ = CURB + 0.03;
  function pre(cx, cz) {
    bx(B.ground, I4, cx, CURB, cz, 8.6, 0.03, 8.6, C.lawn);
  }
  function cabane(cx, cz, ry, accent) {
    const P = place(cx, cz, ry, YQ);
    bx(B.main, P, 0, 0, 0, 2.2, 1.15, 1.8, C.wood);
    for (const y of [0.36, 0.76]) bx(B.main, P, 0, y, 0, 2.24, 0.05, 1.84, 0xb08a62);
    put(B.main, G.prism, P, 0, 1.15, 0, 2.15, 0.75, 2.6, 0x8a6a4a, Math.PI / 2);
    bx(B.main, P, -0.45, 0, 0.91, 0.5, 0.82, 0.05, accent);
    put(B.winA, G.quad, P, 0.5, 0.64, 0.915, 0.44, 0.36, 1, 0xffffff, 0);
    bx(B.ground, P, 0, -0.02, 1.6, 0.7, 0.03, 1.4, 0xe0cfae);
    return P;
  }
  function maisonnette(cx, cz, ry, w, mur, toit, accent) {
    const P = place(cx, cz, ry, YQ);
    bx(B.main, P, 0, 0, -0.6, w, 1.7, 2.8, mur);
    put(B.main, G.prism, P, 0, 1.7, -0.6, 3.1, 1.05, w + 0.3, toit, Math.PI / 2);
    bx(B.main, P, w * 0.28, 1.9, -1.1, 0.3, 0.8, 0.3, mur);
    bx(B.main, P, 0, 0, 0.81, 0.6, 1.05, 0.05, accent);
    for (const x of [-w * 0.3, w * 0.3])
      put(B.winA, G.quad, P, x, 0.95, 0.815, 0.62, 0.5, 1, 0xffffff, 0);
    for (const x of [-w * 0.25, w * 0.25])
      put(B.winB, G.quad, P, x, 0.95, -2.015, 0.62, 0.5, 1, 0xffffff, Math.PI);
    put(B.winA, G.quad, P, w / 2 + 0.015, 0.95, -0.6, 0.6, 0.5, 1, 0xffffff, Math.PI / 2);
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
  /* le prestige : des massifs fleuris aux quatre coins et un liseré doré */
  function fleurs(cx, cz) {
    const tons = [C.pink, C.yellow, C.violet, 0xffffff, C.orange];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = cx + sx * 3.9,
          z = cz + sz * 3.9;
        cy(B.main, I4, x, CURB, z, 0.62, 0.2, C.white);
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          sp(
            B.main,
            I4,
            x + Math.cos(a) * 0.36,
            CURB + 0.28,
            z + Math.sin(a) * 0.36,
            0.13,
            tons[(k + (sx + 2) * (sz + 3)) % 5],
          );
        }
        sp(B.main, I4, x, CURB + 0.32, z, 0.16, C.lawn);
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
    const g = new T.ExtrudeGeometry(sh, { depth: 1.8, bevelEnabled: false, curveSegments: 8 });
    g.rotateX(Math.PI / 2);
    const slab = new T.Mesh(g, matSlab);
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
          for (let t = a + 0.4; t < b; t += 1.45) {
            bx(B.ground, I4, RX[k], 0.002, t, 0.12, 0.012, 0.75, 0xffffff);
            bx(B.ground, I4, t, 0.002, RX[k], 0.75, 0.012, 0.12, 0xffffff);
          }
        }
    for (let i = 0; i < NN; i++)
      for (let j = 0; j < NN; j++) {
        const x = RX[i],
          z = RX[j];
        for (let k = -2; k <= 2 && PV.feux; k++) {
          if (i > 0) bx(B.ground, I4, x - 2.0, 0.002, z + k * 0.54, 0.72, 0.012, 0.3, 0xffffff);
          if (i < NN - 1)
            bx(B.ground, I4, x + 2.0, 0.002, z + k * 0.54, 0.72, 0.012, 0.3, 0xffffff);
          if (j > 0) bx(B.ground, I4, x + k * 0.54, 0.002, z - 2.0, 0.3, 0.012, 0.72, 0xffffff);
          if (j < NN - 1)
            bx(B.ground, I4, x + k * 0.54, 0.002, z + 2.0, 0.3, 0.012, 0.72, 0xffffff);
        }
        lamp(x + 1.72, z + 1.72, CURB);
      }
  })();

  /*
    ---- feux tricolores et guirlandes

    Tous les carrefours suivent le même cycle : deux matières, l'une pour l'axe
    nord-sud, l'autre pour l'axe est-ouest, suffisent à les animer tous.
  */
  const feuxA = new Batch(),
    feuxB = new Batch();
  if (PV.feux)
    for (let i = 1; i < NN - 1; i++)
      for (let j = 1; j < NN - 1; j++)
        for (const [sx, sz] of [
          [-1, 1],
          [1, -1],
        ]) {
          const x = RX[i] + sx * 1.72,
            z = RX[j] + sz * 1.72;
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
        const a = RX[j] + 1.72,
          b = RX[j + 1] + 1.72,
          o = RX[k] + 1.72;
        for (let t = 0.04; t < 0.97; t += 0.06) {
          const s = 1.9 - Math.sin(t * Math.PI) * 0.55;
          sp(B.lamp, I4, o, CURB + s, a + (b - a) * t, 0.06, 0xffffff);
          sp(B.lamp, I4, a + (b - a) * t, CURB + s, o, 0.06, 0xffffff);
        }
      }

  /* ---- le reste de la ville : le décor entre les quartiers actifs */
  (function civil() {
    const Y = CURB,
      YL = CURB + 0.03;
    const roofs = [C.orange, C.blue2, C.teal, C.violet, C.yellow, C.pink];
    let ri = 0;
    const roof = () => roofs[ri++ % roofs.length];
    const walls = [C.violet, C.blue2, C.orange, C.yellow, C.blue, C.pink, C.violet2];
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
      for (let k = 0; k < 3; k++) {
        house(cx - 3 + k * 3, cz - 2.1, Math.PI, roof(), YL);
        house(cx - 3 + k * 3, cz + 2.1, 0, roof(), YL);
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
          bx(B.main, P, 0, 0.18, 0, 0.3, 0.06, 0.95, C.wood);
          bx(B.main, P, -0.14, 0.24, 0, 0.05, 0.28, 0.95, C.wood);
          for (const z of [-0.38, 0.38]) bx(B.main, P, 0, 0, z, 0.26, 0.18, 0.05, C.dark);
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
        bx(B.main, I4, X - 0.6, YL, Z - 0.5, 0.5, 0.9, 0.5, C.yellow);
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
        bx(B.main, I4, X + 0.6, YL + 0.98, Z, 0.05, 0.05, 1.0, C.blue2);
        bx(B.main, I4, X + 0.6, YL + 0.28, Z, 0.26, 0.04, 0.2, C.orange);
        cy(B.main, I4, X - 0.3, YL, Z + 0.75, 0.32, 0.08, C.teal);
      }
      if (statue) {
        const X = cx - 1.1,
          Z = cz - 2.2;
        bx(B.main, I4, X, YL, Z, 0.7, 0.7, 0.7, C.white);
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
          bx(B.main, I4, cx, YL, cz + 4.05, 8.5, 0.45, 0.35, 0x5fc48e);
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
      bx(B.main, P, -1.0, 0, -1.6, 5.4, 1.3, 3.2, W);
      bx(B.main, P, -1.0, 1.3, -1.6, 5.6, 0.1, 3.4, C.roof);
      bx(B.main, P, -1.9, 1.4, -1.2, 3.6, 1.2, 3.4, 0xcda47a);
      bx(B.main, P, -1.9, 2.6, -1.2, 3.9, 0.12, 3.7, C.roof);
      bx(B.main, P, 0.9, 0, -2.2, 1.3, 2.9, 1.6, DK);
      bx(B.main, P, 1.2, 0, 0.02, 0.7, 1.1, 0.05, DK);
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
      bx(B.main, P, -2.7, 0.08, 1.25, 0.5, 0.14, 1.2, W);
      bx(B.main, P, -2.0, 0.08, 1.25, 0.5, 0.14, 1.2, W);
      cy(B.main, P, -0.7, 0.08, 1.25, 0.035, 1.5, C.metal, G.cyl8);
      put(B.main, G.cone, P, -0.7, 1.4, 1.25, 1.7, 0.45, 1.7, 0xe5672e);
      bx(B.ground, P, 3.0, 0, 0.9, 1.9, 0.015, 6.8, C.pave);
      bx(B.main, P, 3.0, 1.25, -2.2, 2.3, 0.1, 3.2, C.roof);
      cy(B.main, P, 3.95, 0, -0.8, 0.05, 1.25, DK, G.cyl8);
      cy(B.main, P, 3.95, 0, -3.6, 0.05, 1.25, DK, G.cyl8);
      vehicle(
        B.main,
        null,
        place(cx + 3.0, cz - 2.3, 0, YL + 0.015),
        NQ.home >= 4 && aVehicule("sport") ? "sport" : "car",
        NQ.home >= 4 && aVehicule("sport") ? 0xe5484d : C.blue2,
      );
      bx(B.main, P, -4.05, 0, 0, 0.4, 0.5, 8.5, HEDGE);
      bx(B.main, P, 0, 0, -4.05, 8.5, 0.5, 0.4, HEDGE);
      tree(cx - 3.4, cz + 3.3, YL, 0.85);
      tree(cx + 1.55, cz + 3.5, YL, 0.7, true);
    }

    /* haut derrière, bas devant : rien ne cache les quartiers actifs */
    /* le coin du fond reçoit la tour de la salle de marché, bâtie plus bas */
    /*
      Le décor vient par âges : des voisins (maisons), des commerces, puis des
      immeubles bas qui montent à leur hauteur au dernier âge.
    */
    /* un îlot pas encore bâti reste un pré, avec ses arbres quand ils sont plantés */
    const friche = (cx, cz) => {
      pre(cx, cz);
      arbre(cx - 2.2, cz - 1.6, YL, 0.9);
      arbre(cx + 1.9, cz + 2.1, YL, 0.85, true);
      arbre(cx + 2.4, cz - 2.5, YL, 0.8);
    };
    const immeubles = (cx, cz, fl) => (PV.decor >= 3 ? towers(cx, cz, fl) : friche(cx, cz));
    immeubles(BC[1], BC[0], [6, 9, 4, 5]);
    immeubles(BC[2], BC[0], [10, 7, 6, 4]);
    immeubles(BC[3], BC[0], [5, 7, 3, 4]);
    immeubles(BC[0], BC[1], [8, 5, 6, 4]);
    immeubles(BC[0], BC[3], [4, 6, 3, 5]);
    maison(BC[0], BC[2]);
    if (PV.decor >= 2) {
      shops(BC[2], BC[1], false);
      shops(BC[1], BC[2], true);
    } else {
      friche(BC[2], BC[1]);
      friche(BC[1], BC[2]);
    }
    if (PV.decor >= 1) houses(BC[3], BC[2]);
    else friche(BC[3], BC[2]);
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
    for (let i = 0; i < 16; i++) {
      const x = -27 + i * 3.6;
      if (i % 4 === 3) ringTrees.push([x, -E + 0.2]);
      else if (voisin()) house(x, -E, 0, roof(), YL);
      ringTrees.push([x + 1.8, -E - 0.75]);
      if (Math.abs(x) < 6) ringTrees.push([x, E + 0.1]);
      else if (voisin()) house(x, E, Math.PI, roof(), YL);
      ringTrees.push([x + 1.8, E + 0.75]);
    }
    for (let i = 0; i < 14; i++) {
      const z = -23.4 + i * 3.6;
      if (i % 4 === 2) ringTrees.push([-E, z]);
      else if (voisin()) house(-E, z, Math.PI / 2, roof(), YL);
      ringTrees.push([-E - 0.8, z + 1.8]);
      if (Math.abs(z) > 7.3) {
        if (voisin()) house(E, z, -Math.PI / 2, roof(), YL);
        ringTrees.push([E + 0.8, z + 1.8]);
      }
    }
    ringTrees.forEach((p, i) => arbre(p[0], p[1], YL, rr(0.75, 1.05), i % 3 === 0));
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
          B.main,
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
    bx(B.main, I4, X, Y + 0.62, Z, 1.5, 5.6, 1.5, C.white);
    bx(B.main, I4, X, Y + 2.3, Z, 1.62, 0.16, 1.62, C.violet);
    bx(B.main, I4, X, Y + 4.4, Z, 1.62, 0.16, 1.62, C.violet);
    bx(B.main, I4, X, Y + 6.22, Z, 2.0, 1.9, 2.0, C.violet);
    bx(B.main, I4, X, Y + 8.12, Z, 2.2, 0.14, 2.2, C.white);
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
        bx(B.main, P, 1.6, 1.65, 0.9, 0.5, 0.06, 0.08, C.wood);
        put(B.main, G.cone, P, 1.6, 1.25, 0.9, 0.3, 0.32, 0.3, C.gold);
        bx(B.main, P, -1.6, 0, 1.2, 1.1, 1.0, 0.08, C.wood);
        bx(B.main, P, -1.6, 0.35, 1.25, 0.95, 0.6, 0.02, 0x2f4a3a);
      } else {
        const P = maisonnette(UNX, UNZ, Math.PI / 2, 4.4, C.white, C.blue2, C.blue);
        /* le clocheton dit déjà « école » */
        bx(B.main, P, -1.2, 2.3, -0.6, 0.7, 0.8, 0.7, C.white);
        put(B.main, G.pyr, P, -1.2, 3.1, -0.6, 0.85, 0.7, 0.85, C.blue2);
        put(B.main, G.cone, P, -1.2, 2.45, -0.6, 0.32, 0.3, 0.32, C.gold);
      }
      tree(uniPt(3.9, 0, 3.7).x, uniPt(3.9, 0, 3.7).z, CURB, 0.9);
      return;
    }
    if (n >= 4) fleurs(UNX, UNZ);
    bx(B.main, PU, 0, 0, -2.5, 8.2, 2.5, 3.0, C.blue);
    bx(B.main, PU, 0, 2.5, -2.5, 8.4, 0.14, 3.2, C.roof);
    for (const x of [-3.3, -2.3, 2.3, 3.3])
      for (const z of [-3.1, -1.9]) put(B.main, G.box, PU, x, 2.67, z, 0.8, 0.04, 0.9, C.panel);
    for (const s of [-1, 1]) {
      bx(B.main, PU, s * 3.0, 0, 0.7, 2.2, 2.0, 3.4, C.blue);
      bx(B.main, PU, s * 3.0, 2.0, 0.7, 2.4, 0.14, 3.6, C.roof);
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
    bx(B.main, PU, 0, 0, -0.1, 3.8, 0.14, 1.9, C.white);
    bx(B.main, PU, 0, 0.14, -0.35, 3.4, 0.12, 1.3, C.white);
    for (const x of [-1.2, -0.4, 0.4, 1.2]) cy(B.main, PU, x, 0.26, -0.3, 0.15, 2.0, C.white);
    bx(B.main, PU, 0, 2.26, -0.55, 3.2, 0.26, 1.1, C.white);
    put(B.main, G.prism, PU, 0, 2.52, -0.55, 3.2, 0.8, 1.1, C.white);
    bx(B.main, PU, 0, 0.26, -0.98, 1.0, 1.5, 0.06, 0xffffff);
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
      bx(B.main, Q, bx0, 0.9, 1.4, 0.8, 0.6, 0.5, C.blue2);
      put(B.main, G.prism, Q, bx0, 1.5, 1.4, 0.6, 0.25, 0.9, C.blue, Math.PI / 2);
      [C.orange, C.yellow, C.pink, C.teal].forEach((c, i) =>
        bx(B.main, Q, bx0 - 0.27 + i * 0.18, 0.98, 1.66, 0.14, 0.36, 0.02, c),
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
    bx(B.main, P, 0, 0, -1.9, 7.6, 0.4, 4.6, C.white);
    bx(B.main, P, 0, 0.4, -1.9, 7.0, 2.6, 4.0, PIERRE);
    bx(B.main, P, 0, 3.0, -1.9, 7.3, 0.16, 4.3, C.white);
    put(B.main, G.prism, P, 0, 3.16, -1.9, 7.3, 1.1, 4.3, TOIT);
    /* le porche : quatre colonnes, un fronton */
    bx(B.main, P, 0, 0, 0.55, 4.6, 0.14, 0.5, C.white);
    bx(B.main, P, 0, 0.14, 0.3, 4.6, 0.14, 0.5, C.white);
    for (const x of [-1.65, -0.55, 0.55, 1.65]) cy(B.main, P, x, 0.4, 0.35, 0.17, 2.1, C.white);
    bx(B.main, P, 0, 2.5, 0.2, 4.4, 0.26, 0.9, C.white);
    put(B.main, G.prism, P, 0, 2.76, 0.2, 4.4, 0.8, 0.9, C.white);
    bx(B.main, P, 0, 0.4, 0.12, 1.1, 1.6, 0.06, TOIT);
    /* l'enseigne : un livre ouvert sur le faîte */
    put(B.main, G.box, P, -0.52, 4.75, -1.9, 1.05, 0.1, 1.5, 0xffffff, 0, 0, 0.42);
    put(B.main, G.box, P, 0.52, 4.75, -1.9, 1.05, 0.1, 1.5, 0xffffff, 0, 0, -0.42);
    const reliure = n >= 4 ? C.gold : C.blue2;
    put(B.main, G.box, P, -0.54, 4.69, -1.9, 1.15, 0.08, 1.62, reliure, 0, 0, 0.42);
    put(B.main, G.box, P, 0.54, 4.69, -1.9, 1.15, 0.08, 1.62, reliure, 0, 0, -0.42);
    bx(B.main, P, 0, 4.3, -1.9, 0.14, 0.3, 1.62, reliure);
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
      bx(B.main, Q, 0, 0, 0.5, 2.6, 0.8, 0.5, C.wood);
      put(B.main, G.prism, Q, 0, 1.6, 0, 1.6, 0.5, 2.8, C.orange, Math.PI / 2);
      [C.yellow, C.pink, C.teal, C.blue2].forEach((c, i) =>
        bx(B.main, Q, -0.9 + i * 0.6, 0.8, 0.5, 0.36, 0.14, 0.3, c),
      );
      for (const [x, z] of [
        [1.9, 1.0],
        [2.3, 0.4],
        [1.95, 0.4],
      ])
        bx(B.main, Q, x, z === 1.0 ? 0 : 0.4, z, 0.4, 0.4, 0.4, 0xb08a62);
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
    bx(B.main, P, 0, 0, -2.5, 7.0, 2.7, 3.2, C.orange);
    bx(B.main, P, 0, 2.7, -2.5, 7.2, 0.14, 3.4, C.roof);
    /* enseigne : trois cartes dressées sur le toit, en éventail */
    bx(B.main, P, 1.2, 2.84, -2.5, 3.0, 0.16, 0.7, C.white);
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
    bx(B.main, P, 0, 0, -0.87, 1.0, 1.6, 0.06, 0xffffff);
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
        bx(B.main, P, 2.6, 0, 1.0, 1.3, 0.7, 0.85, 0x9b7650);
        for (const x of [-0.45, 0.45]) bx(B.main, P, 2.6 + x, 0, 1.0, 0.08, 0.72, 0.88, C.gold);
        bx(B.main, P, 2.6, 0.32, 1.44, 0.2, 0.22, 0.04, C.gold);
      } else {
        const P = maisonnette(BKX, BKZ, 0, 4.4, C.white, C.teal, C.teal2);
        for (const x of [-0.7, 0.7]) cy(B.main, P, x, 0, 1.2, 0.12, 1.7, C.white);
        bx(B.main, P, 0, 1.7, 1.0, 2.0, 0.16, 0.7, C.white);
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
      bx(B.main, P, 0, 0.9 + yb, zb + 0.05, 2.1, 0.8, 0.06, C.dark);
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

  /* ---- maillages fixes */
  const mMain = B.main.mesh(matStatic, true);
  scene.add(mMain);
  const mGround = B.ground.mesh(matStatic, false);
  scene.add(mGround);
  scene.add(
    B.winA.mesh(matWinA, false),
    B.winB.mesh(matWinB, false),
    B.lamp.mesh(matLamp, false, false),
    B.glass.mesh(matGlass, false),
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
    const b = new Batch(),
      wa = new Batch(),
      wb = new Batch(),
      rnd = rng(77);
    const P = place(BKX, BKZ, 0, CURB),
      fh = 0.8,
      H = floors * fh,
      y0 = 0.4;
    bx(b, P, 0, 0, 0, 7.6, y0, 7.2, C.white);
    bx(b, P, 0, 0, 3.8, 4.6, 0.27, 0.5, C.white);
    bx(b, P, 0, 0, 4.15, 4.6, 0.13, 0.4, C.white);
    bx(b, P, 0, y0, -0.6, 5.2, H, 4.4, C.teal);
    for (let f = 4; f < floors; f += 4)
      bx(b, P, 0, y0 + f * fh - 0.07, -0.6, 5.32, 0.14, 4.52, C.white);
    bx(b, P, 0, y0 + H, -0.6, 5.4, 0.16, 4.6, C.white);
    bx(b, P, 1.4, y0 + H + 0.16, -1.4, 0.9, 0.4, 0.8, 0xdadee6);
    for (const x of [-1.65, -0.55, 0.55, 1.65]) cy(b, P, x, y0, 2.7, 0.2, 1.9, C.white);
    bx(b, P, 0, y0 + 1.9, 2.35, 4.2, 0.28, 1.5, C.white);
    put(b, G.prism, P, 0, y0 + 2.18, 2.35, 4.2, 0.85, 1.5, C.white);
    put(b, G.cyl, P, 0, y0 + 2.52, 3.105, 0.52, 0.06, 0.52, C.gold, 0, Math.PI / 2);
    bx(b, P, 0, y0, 1.62, 1.1, 1.5, 0.06, C.teal2);
    bx(b, P, 0, y0 + H + 0.16, -0.6, 0.5, 0.3, 0.5, C.white);
    if (NQ.bank >= 4) {
      /* le prestige : une couronne dorée et un dôme au sommet */
      bx(b, P, 0, y0 + H - 0.5, -0.6, 5.36, 0.22, 4.56, C.gold);
      cy(b, P, -1.2, y0 + H + 0.16, -0.6, 0.9, 0.3, C.white);
      put(b, G.sph2, P, -1.2, y0 + H + 0.46, -0.6, 1.5, 1.1, 1.5, C.gold);
    }
    const Pt = new T.Matrix4().copy(P).multiply(new T.Matrix4().makeTranslation(0, y0, -0.6));
    windowsOn({ A: wa, B: wb }, Pt, 5.2, 4.4, 0.05, floors, fh, rnd, {
      skip: (f, fl) => f === 0 && fl < 4,
    });
    bank.group.add(b.mesh(matStatic, true), wa.mesh(matWinA, false), wb.mesh(matWinB, false));
    bank.floors = floors;
    bank.top = CURB + y0 + H + 0.16;
    coin.position.set(BKX, bank.top + 1.3, BKZ - 0.6);
  }

  /* ---- Salle de marché : la tour grandit avec les trades du mois */
  const tower = { group: new T.Group(), floors: 0, top: 0, anim: null };
  scene.add(tower.group);
  const matBeacon = new T.MeshLambertMaterial({ color: 0xf2c037 });
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
    const b = new Batch(),
      gl = new Batch(),
      P = place(TWX, TWZ, 0, CURB),
      fh = 0.8,
      NAVY = 0x27306b,
      y0 = 0.5;
    bx(b, P, 0, 0, 0, 8.2, y0, 8.2, C.white);
    bx(b, P, 0, y0, 0, 6.6, 1.6, 6.6, NAVY);
    put(gl, G.quad, P, 0, y0 + 0.8, 3.315, 5.6, 1.1, 1, 0xffffff, 0);
    put(gl, G.quad, P, 3.315, y0 + 0.8, 0, 5.6, 1.1, 1, 0xffffff, Math.PI / 2);
    bx(b, P, 0, y0 + 1.6, 0, 6.9, 0.14, 6.9, C.white);
    const n1 = Math.ceil(floors * 0.6),
      n2 = floors - n1,
      yA = y0 + 1.74,
      hA = n1 * fh,
      yB = yA + hA + 0.14,
      hB = n2 * fh;
    bx(b, P, 0, yA, 0, 5.4, hA, 5.4, NAVY);
    bx(b, P, 0, yA + hA, 0, 5.6, 0.14, 5.6, C.white);
    bx(b, P, 0, yB, 0, 4.0, hB, 4.0, NAVY);
    bx(b, P, 0, yB + hB, 0, 4.2, 0.16, 4.2, C.white);
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
    bx(b, P, 0, yT, 0, 1.6, 0.7, 1.6, C.white);
    cy(b, P, 0, yT + 0.7, 0, 0.06, 2.4, NQ.tower >= 4 ? C.gold : C.metal, G.cyl8);
    if (NQ.tower >= 4) {
      bx(b, P, 0, yB + hB - 0.3, 0, 4.12, 0.2, 4.12, C.gold);
      bx(b, P, 0, yA + hA - 0.3, 0, 5.52, 0.2, 5.52, C.gold);
      put(b, G.pyr, P, 0, yT + 0.7, 0, 1.5, 1.2, 1.5, C.gold);
    }
    tower.group.add(b.mesh(matStatic, true), gl.mesh(matGlass, false));
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
    const m = new T.Mesh(G.sph2, new T.MeshLambertMaterial({ color: bn[3] }));
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
      const m = new T.Mesh(G.sph2, matCloud);
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
    ballon.add(b.mesh(matStatic, true));
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
  if (aAmbiance("port")) {
    /* un bassin taillé à la largeur de la dalle : la ville s'avance sur l'eau, elle ne flotte pas dessus */
    const eau = new T.Mesh(
      new T.BoxGeometry(2 * SLAB - 1, 1.4, 12),
      new T.MeshLambertMaterial({ color: C.water }),
    );
    eau.position.set(0, -1.6, SLAB + 6);
    eau.receiveShadow = true;
    scene.add(eau);
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
      g.add(vb.mesh(matStatic, true));
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
      if (i >= 0 && i < NN && j >= 0 && j < NN) n.nb.push(nodeAt(i, j));
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
        lb = new Batch();
      vehicle(b, lb, I4, kind, col);
      const g = new T.Group(),
        body = b.mesh(matStatic, !small),
        li = lb.mesh(matHead, false, false);
      g.add(body, li);
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
        len: { bus: 3, van: 2.1, camion: 2.7, tram: 4.4, velo: 0.9, sport: 1.7 }[kind] || 1.55,
      });
    }
  })();
  /* un cycle de quatorze secondes : nord-sud passe, puis est-ouest */
  const CYCLE = 14;
  const vert = (estOuest) => {
    const ph = time % CYCLE;
    return estOuest ? ph >= 7 && ph < 13 : ph < 6;
  };
  function stepCar(c, dt) {
    let v = c.vmax,
      auFeu = false;
    if (c.ghost > 0) c.ghost -= dt;
    else
      for (const o of cars) {
        if (o === c) continue;
        const ex = o.x - c.x,
          ez = o.z - c.z,
          f = ex * c.fx + ez * c.fz,
          gap = 2.2 + (c.len + o.len) / 2;
        if (f > 0 && f < gap && Math.abs(ex * c.fz - ez * c.fx) < 0.6) {
          v = Math.min(v, f < gap - 1.3 ? 0 : o.v * 0.9);
          // la file derrière un feu rouge attend le vert, elle ne double pas
          if (o.auFeu) auFeu = true;
        }
      }
    if (PV.feux && c.mode === "s" && c.b.i > 0 && c.b.i < NN - 1 && c.b.j > 0 && c.b.j < NN - 1) {
      const reste = c.seg.len - c.s;
      if (reste < 1.3 && reste > 0.05 && !vert(c.seg.dx !== 0)) {
        v = 0;
        auFeu = true;
      }
    }
    c.v += (v - c.v) * Math.min(1, dt * 3.5);
    // Arrêté au rouge, on attend sans s'impatienter : la traversée « fantôme » est pour les bouchons.
    c.auFeu = auFeu;
    if (c.v < 0.08 && !auFeu) {
      c.wait += dt;
      if (c.wait > 4) {
        c.ghost = 2.5;
        c.wait = 0;
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
      if (k % 5 === 4) {
        const o = RING + 0.08 + R() * 0.24;
        r = { x0: -o, x1: o, z0: -o, z1: o };
      } // trottoir de la couronne
      else {
        const i = Math.floor(R() * 4),
          j = Math.floor(R() * 4),
          o = rr(0.28, 0.62);
        r = { x0: CELLS[i][0] + o, x1: CELLS[i][1] - o, z0: CELLS[j][0] + o, z1: CELLS[j][1] - o };
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
  const pedBody = new T.InstancedMesh(
    new T.CylinderGeometry(0.11, 0.15, 0.42, 8),
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
  const hemi = new T.HemisphereLight(0xffffff, 0xe6e2d2, 0.78 * LUM);
  const sun = new T.DirectionalLight(0xffffff, 0.3 * LUM);
  sun.position.set(-30, 75, 60);
  sun.castShadow = true;
  // Un bord d'ombre fondu : net, il découpait chaque immeuble au cutter.
  sun.shadow.radius = 3;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  sun.shadow.camera.left = -52;
  sun.shadow.camera.right = 52;
  sun.shadow.camera.top = 52;
  sun.shadow.camera.bottom = -52;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
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
    map: new T.CanvasTexture(haloToile),
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
  lampes.forEach((l, i) => {
    _im.makeTranslation(l[0], l[1] + 0.03, l[2]);
    halos.setMatrixAt(i, _im);
  });
  halos.frustumCulled = false;
  halos.visible = false;
  scene.add(halos);

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
  refletTex.wrapS = refletTex.wrapT = T.RepeatWrapping;
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
    grad(SKY_HAUT, a, hautCol);
    peindreCiel(lit);
    matHalo.opacity = 0.62 * lit;
    halos.visible = lit > 0.02;
    grad(HSKY, a, hemi.color);
    grad(HGND, a, hemi.groundColor);
    hemi.intensity = (0.5 + 0.28 * day) * LUM;
    if (a > 0) {
      const el = clamp(22 + 0.85 * a, 22, 72) * RAD,
        ce = Math.cos(el); // un peu plus haut que le vrai soleil : des ombres plus courtes, plus douces
      sun.position.set(
        ce * Math.sin(sp0.az) * 125,
        Math.sin(el) * 125,
        -ce * Math.cos(sp0.az) * 125,
      ); // est = +x, nord = -z
      grad(SUNC, a, sun.color);
      sun.intensity = 0.34 * step(-1, 5, a) * LUM;
    } else {
      sun.position.set(-37, 94, 75);
      sun.color.set(0x9fb0ff);
      sun.intensity = 0.2 * step(-5, -11, a) * LUM; // clair de lune
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
      ballon.position.set(Math.cos(a) * 24, 17 + Math.sin(time * 0.4) * 0.6, Math.sin(a) * 18 - 4);
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
    for (let i = 0; i < NDROP; i++) {
      const th = ((i % 8) * Math.PI) / 4 + 0.39,
        p = (time * 0.85 + (i < 8 ? 0 : 0.5)) % 1,
        r = 1.4 + 0.55 * p;
      _im.compose(
        _ip.set(PLX + Math.cos(th) * r, CURB + 0.5 + 3.4 * p * (1 - p), PLZ + Math.sin(th) * r),
        _iq,
        _is.set(0.2, 0.2, 0.2),
      );
      drops.setMatrixAt(i, _im);
    }
    drops.instanceMatrix.needsUpdate = true;
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
  function frame(now) {
    if (arrete) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (intro && now - debut > 1900) intro = false;
    // L'entrée en scène se pose doucement ; ensuite la caméra répond vite.
    const k = 1 - Math.exp(-dt * (intro ? 2.6 : 7));
    view.az += (goal.az - view.az) * k;
    view.size += (goal.size - view.size) * k;
    view.tx += (goal.tx - view.tx) * k;
    view.tz += (goal.tz - view.tz) * k;
    applyCam();
    if (now >= sunNext) {
      applySun();
      sunNext = now + 5000;
    }
    if (playing) simulate(dt);
    if (bank.anim) {
      bank.anim.t = Math.min(1, bank.anim.t + dt / 0.9);
      const t = bank.anim.t,
        e = 1 - Math.pow(1 - t, 3);
      bank.group.scale.y = bank.anim.from + (1 - bank.anim.from) * e;
      coin.position.y = bank.top * bank.group.scale.y + 1.3;
      shadowDirty = true;
      if (t >= 1) bank.anim = null;
    }
    if (tower.anim) {
      tower.anim.t = Math.min(1, tower.anim.t + dt / 0.9);
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
    dispose,
  };
}

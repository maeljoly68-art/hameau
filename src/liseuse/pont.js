// Le pont entre la liseuse de Hameau et la page du cours. Injecté EN TÊTE de la page, avant tout script du cours.
//
// La page tourne dans un cadre isolé (iframe sans « allow-same-origin ») : elle ne peut lire ni la connexion de
// Hameau ni ses données, et ne lui parle que par messages. Ce pont y fait trois choses :
//   1. le stockage : ce que la page range « dans le navigateur » (cases cochées, meilleur score…) part en fait dans
//      le compte, pour être retrouvé sur l'autre appareil ;
//   2. l'encre : stylo, surligneur, gomme, dans un calque par planche, dans le repère de la planche (la page est
//      toujours affichée à la même largeur, puis agrandie ou réduite : un trait reste sur le mot qu'il souligne) ;
//   3. la lecture : quelles planches sont à l'écran, et quelle part de chacune, pour que Hameau compte les pages lues.
(() => {
  'use strict';

  const SVG = 'http://www.w3.org/2000/svg';
  const RAYON_GOMME = 9;
  const depart = window.__HAMEAU__ || {};
  const envoyer = (m) => window.parent.postMessage(Object.assign({ hameau: 1 }, m), '*');

  // ── 1. Le stockage ──

  function stockage(synchronise, valeurs) {
    const d = new Map(Object.entries(valeurs || {}));
    const s = {
      get length() {
        return d.size;
      },
      key: (i) => Array.from(d.keys())[i] ?? null,
      getItem: (k) => (d.has(String(k)) ? d.get(String(k)) : null),
      setItem: (k, v) => {
        const cle = String(k);
        const valeur = String(v);
        if (d.get(cle) === valeur) return;
        d.set(cle, valeur);
        if (synchronise) envoyer({ type: 'etat', cle, valeur });
      },
      removeItem: (k) => {
        const cle = String(k);
        if (!d.has(cle)) return;
        d.delete(cle);
        if (synchronise) envoyer({ type: 'etat', cle, valeur: null });
      },
      clear: () => {
        for (const cle of Array.from(d.keys())) s.removeItem(cle);
      },
    };
    // Une valeur reçue de l'autre appareil : posée sans être renvoyée (sinon les deux appareils se la renverraient).
    s.recevoir = (cle, valeur) => (valeur === null ? d.delete(cle) : d.set(cle, valeur));
    return s;
  }
  const local = stockage(true, depart.etats);
  for (const [nom, s] of [
    ['localStorage', local],
    ['sessionStorage', stockage(false, {})],
  ]) {
    try {
      Object.defineProperty(window, nom, { configurable: true, enumerable: true, get: () => s });
    } catch (e) {
      envoyer({ type: 'erreur', message: `${nom} : ${e}` });
    }
  }

  // ── Les planches ──

  const planches = () => Array.from(document.querySelectorAll('section.planche'));
  const planche = (id) => planches().find((s) => s.id === id) || null;

  const style = document.createElement('style');
  style.textContent = [
    '.hameau-encre{position:absolute;left:0;top:0;pointer-events:none;z-index:2147483000;mix-blend-mode:multiply;overflow:visible}',
    '.hameau-encre path{fill:none;stroke-linecap:round;stroke-linejoin:round}',
    '.hameau-encre .surligneur{opacity:.4}',
    'html.hameau-masque .hameau-encre{display:none}',
    'html.hameau-dessin,html.hameau-dessin body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
    'html.hameau-dessin.hameau-doigt{touch-action:none}',
    'html.hameau-dessin .planche{cursor:crosshair}',
    'html.hameau-gomme .planche{cursor:cell}',
    '[data-hameau-case]{display:flex!important;align-items:center;justify-content:center;font:700 15px/1 system-ui,sans-serif}',
  ].join('\n');
  document.head.appendChild(style);

  // ── 2. L'encre ──

  let outil = 'lire';
  let couleur = '#1F2430';
  let epaisseur = 2.5;
  let doigt = false;
  const traits = new Map();
  const calques = new Map();

  function calque(section) {
    let c = calques.get(section.id);
    if (c && c.svg.isConnected) return c;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'hameau-encre');
    svg.setAttribute('aria-hidden', 'true');
    const surligneur = document.createElementNS(SVG, 'g');
    surligneur.setAttribute('class', 'surligneur');
    const stylo = document.createElementNS(SVG, 'g');
    stylo.setAttribute('class', 'stylo');
    svg.append(surligneur, stylo);
    section.appendChild(svg);
    c = { svg, surligneur, stylo };
    calques.set(section.id, c);
    retailler(section);
    return c;
  }

  function retailler(section) {
    const c = calques.get(section.id);
    if (!c) return;
    const l = section.offsetWidth;
    const h = section.offsetHeight;
    c.svg.setAttribute('width', String(l));
    c.svg.setAttribute('height', String(h));
    c.svg.setAttribute('viewBox', `0 0 ${l} ${h}`);
  }

  // Un tracé lissé : des courbes qui passent par le milieu de chaque segment (pas de petits angles de souris).
  function chemin(p) {
    const n = p.length / 2;
    if (n === 1) return `M${p[0]} ${p[1]}l0.01 0`;
    let d = `M${p[0]} ${p[1]}`;
    for (let i = 1; i < n - 1; i++) d += `Q${p[2 * i]} ${p[2 * i + 1]} ${(p[2 * i] + p[2 * i + 2]) / 2} ${(p[2 * i + 1] + p[2 * i + 3]) / 2}`;
    return `${d}L${p[2 * n - 2]} ${p[2 * n - 1]}`;
  }

  function trace(t) {
    const el = document.createElementNS(SVG, 'path');
    el.setAttribute('d', chemin(t.points));
    el.setAttribute('stroke', t.couleur);
    el.setAttribute('stroke-width', String(t.epaisseur));
    return el;
  }

  function cadre(points) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
      x0 = Math.min(x0, points[i]);
      x1 = Math.max(x1, points[i]);
      y0 = Math.min(y0, points[i + 1]);
      y1 = Math.max(y1, points[i + 1]);
    }
    return [x0, y0, x1, y1];
  }

  function poser(t) {
    const section = planche(t.page);
    if (!section) return;
    retirer(t.id);
    const c = calque(section);
    const el = trace(t);
    (t.outil === 'surligneur' ? c.surligneur : c.stylo).appendChild(el);
    traits.set(t.id, { t, el, cadre: cadre(t.points) });
  }

  function retirer(id) {
    const o = traits.get(id);
    if (!o) return;
    o.el.remove();
    traits.delete(id);
  }

  // Moins de points, même dessin : on retire ceux qui ne s'écartent pas de plus d'un tiers de pixel du trait.
  function simplifier(p, tolerance) {
    const n = p.length / 2;
    if (n <= 2) return p.slice();
    const garder = new Uint8Array(n);
    garder[0] = 1;
    garder[n - 1] = 1;
    const pile = [[0, n - 1]];
    while (pile.length > 0) {
      const [a, b] = pile.pop();
      const ax = p[2 * a];
      const ay = p[2 * a + 1];
      const dx = p[2 * b] - ax;
      const dy = p[2 * b + 1] - ay;
      const l2 = dx * dx + dy * dy;
      let max = 0;
      let indice = -1;
      for (let i = a + 1; i < b; i++) {
        const px = p[2 * i];
        const py = p[2 * i + 1];
        const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        const d = Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
        if (d > max) {
          max = d;
          indice = i;
        }
      }
      if (max > tolerance && indice > 0) {
        garder[indice] = 1;
        pile.push([a, indice], [indice, b]);
      }
    }
    const r = [];
    for (let i = 0; i < n; i++) if (garder[i]) r.push(p[2 * i], p[2 * i + 1]);
    return r;
  }

  // Un identifiant de trait tiré au sort ici (crypto.randomUUID n'existe pas dans un cadre isolé).
  function identifiant() {
    const o = crypto.getRandomValues(new Uint8Array(16));
    o[6] = (o[6] & 0x0f) | 0x40;
    o[8] = (o[8] & 0x3f) | 0x80;
    const h = Array.from(o, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function touche(points, x, y, marge) {
    const n = points.length / 2;
    if (n === 1) return Math.hypot(points[0] - x, points[1] - y) <= marge;
    for (let i = 0; i < n - 1; i++) {
      const ax = points[2 * i];
      const ay = points[2 * i + 1];
      const dx = points[2 * i + 2] - ax;
      const dy = points[2 * i + 3] - ay;
      const l2 = dx * dx + dy * dy;
      const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      if (Math.hypot(x - (ax + u * dx), y - (ay + u * dy)) <= marge) return true;
    }
    return false;
  }

  let enCours = null;
  let gommage = null;
  let avalerClic = false;

  const dansLaPlanche = (e, section) => {
    const r = section.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10];
  };

  function dessine(e) {
    if (outil === 'lire' || document.documentElement.classList.contains('hameau-masque')) return false;
    if (e.pointerType === 'touch' && !doigt) return false;
    if (e.pointerType === 'mouse' && e.button !== 0) return false;
    return true;
  }

  function gommer(e) {
    const section = gommage.section;
    const [x, y] = dansLaPlanche(e, section);
    for (const [id, o] of Array.from(traits)) {
      if (o.t.page !== section.id) continue;
      const marge = RAYON_GOMME + o.t.epaisseur / 2;
      const [x0, y0, x1, y1] = o.cadre;
      if (x < x0 - marge || x > x1 + marge || y < y0 - marge || y > y1 + marge) continue;
      if (!touche(o.t.points, x, y, marge)) continue;
      gommage.effaces.push(o.t);
      retirer(id);
    }
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      activite();
      if (!dessine(e)) return;
      const section = e.target instanceof Element ? e.target.closest('section.planche') : null;
      if (!section) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        section.setPointerCapture(e.pointerId);
      } catch {
        // Sans capture, le trait s'arrête au bord de la planche : rien de grave.
      }
      avalerClic = true;
      if (outil === 'gomme') {
        gommage = { id: e.pointerId, section, effaces: [] };
        gommer(e);
        return;
      }
      const c = calque(section);
      const t = { id: identifiant(), page: section.id, outil: outil === 'surligneur' ? 'surligneur' : 'stylo', couleur, epaisseur, points: dansLaPlanche(e, section) };
      const el = trace(t);
      (t.outil === 'surligneur' ? c.surligneur : c.stylo).appendChild(el);
      enCours = { pointeur: e.pointerId, section, t, el };
    },
    { capture: true, passive: false },
  );

  document.addEventListener(
    'pointermove',
    (e) => {
      if (gommage && e.pointerId === gommage.id) {
        e.preventDefault();
        gommer(e);
        return;
      }
      if (!enCours || e.pointerId !== enCours.pointeur) return;
      e.preventDefault();
      const fins = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const ev of fins.length > 0 ? fins : [e]) {
        const [x, y] = dansLaPlanche(ev, enCours.section);
        const p = enCours.t.points;
        if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) >= 0.6) p.push(x, y);
      }
      enCours.el.setAttribute('d', chemin(enCours.t.points));
    },
    { capture: true, passive: false },
  );

  function lacher(e) {
    if (gommage && e.pointerId === gommage.id) {
      if (gommage.effaces.length > 0) envoyer({ type: 'gomme', traits: gommage.effaces });
      gommage = null;
      return;
    }
    if (!enCours || e.pointerId !== enCours.pointeur) return;
    const { t, el } = enCours;
    enCours = null;
    el.remove();
    t.points = simplifier(t.points, 0.35);
    if (t.points.length > 12000) t.points = t.points.slice(0, 12000);
    poser(t);
    envoyer({ type: 'trait', trait: t });
  }
  document.addEventListener('pointerup', lacher, { capture: true });
  document.addEventListener('pointercancel', lacher, { capture: true });

  // Un trait tracé sur un bouton ne doit pas l'appuyer.
  document.addEventListener(
    'click',
    (e) => {
      if (!avalerClic) return;
      avalerClic = false;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );

  // L'Apple Pencil fait défiler la page comme un doigt, sauf si on l'en empêche dès qu'il touche l'écran.
  const crayonSurLaPage = (e) => {
    if (outil !== 'lire' && Array.from(e.touches || []).some((t) => t.touchType === 'stylus')) e.preventDefault();
  };
  document.addEventListener('touchstart', crayonSurLaPage, { passive: false });
  document.addEventListener('touchmove', crayonSurLaPage, { passive: false });

  function regler(m) {
    outil = ['stylo', 'surligneur', 'gomme'].includes(m.outil) ? m.outil : 'lire';
    if (typeof m.couleur === 'string') couleur = m.couleur;
    if (typeof m.epaisseur === 'number') epaisseur = m.epaisseur;
    doigt = m.doigt === true;
    const racine = document.documentElement.classList;
    racine.toggle('hameau-dessin', outil !== 'lire');
    racine.toggle('hameau-gomme', outil === 'gomme');
    racine.toggle('hameau-doigt', doigt);
    racine.toggle('hameau-masque', m.masque === true);
  }

  // ── « Mes passages » : les cases des planches se cochent avec les jours où la page a été vue ──

  function marquerPassages(pages) {
    for (const section of planches()) {
      const jours = (pages && pages[section.id]) || [];
      const etiquettes = Array.from(section.querySelectorAll('span, b, div, p')).filter((el) => el.children.length === 0 && /^mes passages$/i.test(el.textContent.trim()));
      for (const etiquette of etiquettes) {
        const boite = etiquette.parentElement;
        if (!boite) continue;
        let cases = Array.from(boite.querySelectorAll('[data-hameau-case]'));
        if (cases.length === 0) {
          cases = Array.from(boite.querySelectorAll('span > span:first-child')).filter((c) => c.children.length === 0 && c.textContent.trim() === '');
          for (const c of cases) c.setAttribute('data-hameau-case', c.getAttribute('style') || '');
        }
        cases.forEach((c, i) => {
          c.setAttribute('style', c.getAttribute('data-hameau-case'));
          c.textContent = '';
          c.removeAttribute('title');
          if (!jours[i]) return;
          c.style.background = '#1E7243';
          c.style.borderColor = '#1E7243';
          c.style.color = '#FFFFFF';
          c.textContent = '✓';
          c.title = `Vue le ${jours[i]}`;
        });
      }
    }
  }

  // ── 3. La lecture : ce qui est à l'écran ──

  let mesurePrevue = false;
  function mesurer() {
    mesurePrevue = false;
    const haut = window.innerHeight;
    const pages = [];
    for (const s of planches()) {
      const r = s.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= haut) continue;
      pages.push({ id: s.id, de: Math.max(0, -r.top), a: Math.min(r.height, haut - r.top), h: r.height });
    }
    envoyer({ type: 'vue', pages, haut });
  }
  function planifierMesure() {
    if (mesurePrevue) return;
    mesurePrevue = true;
    requestAnimationFrame(mesurer);
  }
  window.addEventListener('scroll', planifierMesure, { passive: true });
  window.addEventListener('resize', planifierMesure);

  let derniereActivite = 0;
  function activite() {
    const t = Date.now();
    if (t - derniereActivite < 3000) return;
    derniereActivite = t;
    envoyer({ type: 'activite' });
  }
  for (const type of ['scroll', 'wheel', 'keydown', 'touchstart']) window.addEventListener(type, activite, { passive: true });

  function aller(id, decalage) {
    const s = planche(id);
    if (!s) return;
    window.scrollTo({ top: Math.max(0, s.getBoundingClientRect().top + window.scrollY + (decalage || 0) - 12), behavior: 'auto' });
    planifierMesure();
  }

  // Les liens d'une planche à l'autre (« Fiche 2 → ») : la page défile jusqu'à elle, et Hameau le sait.
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
    if (!a || e.defaultPrevented) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    if (!planche(id)) return;
    e.preventDefault();
    aller(id, 0);
  });

  // Annuler / rétablir au clavier, même quand le curseur est dans la page.
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    const cible = e.target;
    if (cible instanceof Element && cible.closest('input, textarea, [contenteditable]')) return;
    e.preventDefault();
    envoyer({ type: 'raccourci', action: e.shiftKey ? 'retablir' : 'annuler' });
  });

  // ── Les messages de Hameau ──

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !e.data || e.data.hameau !== 1) return;
    const m = e.data;
    if (m.type === 'outil') regler(m);
    else if (m.type === 'traits') {
      for (const id of Array.from(traits.keys())) retirer(id);
      for (const t of m.traits || []) poser(t);
    } else if (m.type === 'trait+') for (const t of m.traits || []) poser(t);
    else if (m.type === 'trait-') for (const id of m.ids || []) retirer(id);
    else if (m.type === 'etat') {
      local.recevoir(m.cle, m.valeur);
      // Une page qui affiche ce qu'elle a rangé (« leçon faite ✓ ») peut se remettre à jour sans recharger ; une page
      // qui ignore l'événement relira la valeur à son prochain affichage.
      document.dispatchEvent(new CustomEvent('hameau-etat', { detail: { cle: m.cle } }));
    }
    else if (m.type === 'passages') marquerPassages(m.pages);
    else if (m.type === 'aller') aller(m.page, m.decalage);
    else if (m.type === 'mesurer') mesurer();
  });

  // ── Prêt ──

  function decrire() {
    const meta = document.querySelector('meta[name="hameau-largeur"]');
    const largeur = Number(meta && meta.getAttribute('content')) || document.documentElement.scrollWidth;
    return planches().map((s) => ({ id: s.id, titre: s.getAttribute('data-titre') || s.id, hauteur: s.offsetHeight, largeur }));
  }
  const tailles = new ResizeObserver((entrees) => {
    for (const e of entrees) retailler(e.target);
    planifierMesure();
  });
  let pret = false;
  function annoncer() {
    for (const s of planches()) tailles.observe(s);
    envoyer({ type: 'pret', pages: decrire() });
    pret = true;
    mesurer();
  }
  document.addEventListener('hameau-planches-pretes', annoncer);
  document.addEventListener('hameau-planche-rendue', planifierMesure);
  window.addEventListener('load', () => {
    if (!pret) annoncer();
  });
  // Les polices changent la hauteur des planches : on remesure une fois qu'elles sont là.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => pret && envoyer({ type: 'pret', pages: decrire() }));
})();

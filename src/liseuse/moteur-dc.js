// Le moteur des planches interactives, dans la liseuse de Hameau.
//
// Les cours faits avec Claude sont des canevas « Design » : chaque planche est un gabarit (trous {{ … }}, boucles
// <sc-for>, conditions <sc-if>, gestionnaires onClick) piloté par une classe `Component extends DCLogic`. Sur
// claude.ai, c'est l'éditeur du canevas qui les fait tourner ; ici, la page convertie (scripts/cours/convertir.mjs)
// ne contient plus que les gabarits et le code de chaque planche, et ce moteur les fait vivre. Il est injecté par
// Hameau au moment d'afficher la page, pas gravé dans le cours : une correction ici vaut pour tous les cours déjà
// convertis, sans les reconvertir ni les rechiffrer.
//
// Il n'implémente que ce que le format autorise : un trou est un chemin pointé (jamais une expression), un
// gestionnaire est une fonction rendue par renderVals(). Un nouveau rendu ne remplace pas la planche : il la met à
// jour nœud par nœud, sinon une case qu'on coche ou un champ qu'on remplit perdrait le focus à chaque frappe.
(() => {
  'use strict';

  const BOOLEENS = new Set(['checked', 'disabled', 'selected', 'readonly', 'required', 'hidden', 'open', 'multiple', 'autofocus']);
  const LITTERAUX = { true: true, false: false, null: null, undefined: undefined };
  // onChange de React se déclenche à chaque frappe ou bascule : c'est l'événement « input » du navigateur.
  const EVENEMENTS = { change: 'input', doubleclick: 'dblclick', focus: 'focusin', blur: 'focusout' };
  const TROU = /\{\{\s*([^}]*?)\s*\}\}/g;

  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }

    setState(maj, apres) {
      const suite = typeof maj === 'function' ? maj(this.state, this.props) : maj;
      if (suite !== null && suite !== undefined) this.state = Object.assign({}, this.state, suite);
      planifier(this, apres);
    }

    forceUpdate(apres) {
      planifier(this, apres);
    }
  }
  window.DCLogic = DCLogic;

  // ── Les trous ──

  /** « r.open », « $index », « true » : un chemin pointé, cherché de la boucle la plus proche vers renderVals(). */
  function chercher(expr, portees) {
    const e = expr.trim();
    if (Object.prototype.hasOwnProperty.call(LITTERAUX, e)) return LITTERAUX[e];
    if (/^-?\d+(\.\d+)?$/.test(e)) return Number(e);
    const cite = /^(['"])(.*)\1$/.exec(e);
    if (cite) return cite[2];
    const morceaux = e.split('.');
    let valeur;
    let trouve = false;
    for (let i = portees.length - 1; i >= 0 && !trouve; i--) {
      const p = portees[i];
      if (p !== null && typeof p === 'object' && morceaux[0] in p) {
        valeur = p[morceaux[0]];
        trouve = true;
      }
    }
    for (let i = 1; trouve && i < morceaux.length; i++) {
      if (valeur === null || valeur === undefined) return undefined;
      valeur = valeur[morceaux[i]];
    }
    return trouve ? valeur : undefined;
  }

  // Un booléen ou une fonction ne s'écrivent pas dans le texte (comme dans React) ; absent, c'est vide.
  const enTexte = (v) => (v === null || v === undefined || typeof v === 'boolean' || typeof v === 'function' ? '' : String(v));
  const interpoler = (texte, portees) => texte.replace(TROU, (_, expr) => enTexte(chercher(expr, portees)));
  const seul = (texte) => {
    const m = /^\s*\{\{\s*([^}]*?)\s*\}\}\s*$/.exec(texte);
    return m ? m[1] : null;
  };
  const valeurDe = (attr, portees) => {
    const expr = seul(attr);
    return expr === null ? interpoler(attr, portees) : chercher(expr, portees);
  };

  /** Un lien vers une autre planche (« F02-SAS.dc.html ») devient une ancre de la même page (« #F02-SAS »). */
  function lienInterne(href) {
    const m = /(?:^|\/)([A-Za-z0-9_][A-Za-z0-9_.-]*)\.dc\.html(?:#.*)?$/.exec(href.trim());
    return m ? `#${m[1]}` : href;
  }
  window.hameauLienInterne = lienInterne;

  function poserAttribut(el, attr, portees) {
    const nom = attr.name;
    const brut = attr.value;
    if (/^on[a-z]/.test(nom)) {
      const expr = seul(brut);
      const f = expr === null ? undefined : chercher(expr, portees);
      if (typeof f === 'function') {
        const type = EVENEMENTS[nom.slice(2)] || nom.slice(2);
        (el.__dc || (el.__dc = {}))[type] = f;
      }
      return;
    }
    if (nom === 'ref' || nom.startsWith('hint-')) return;
    const v = brut.indexOf('{{') < 0 ? brut : valeurDe(brut, portees);
    if (BOOLEENS.has(nom)) {
      if (v && v !== 'false') el.setAttribute(nom, '');
      return;
    }
    if (v === null || v === undefined || v === false || typeof v === 'function' || typeof v === 'object') return;
    let texte = String(v);
    if (nom === 'href' || nom === 'xlink:href') texte = lienInterne(texte);
    if (attr.namespaceURI) el.setAttributeNS(attr.namespaceURI, nom, texte);
    else el.setAttribute(nom, texte);
  }

  /** Le gabarit, rempli : de vrais nœuds, avec leurs gestionnaires rangés dans `__dc` (voir `distribuer`). */
  function construire(noeuds, portees, parent) {
    for (const n of noeuds) {
      if (n.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(n.data.indexOf('{{') < 0 ? n.data : interpoler(n.data, portees)));
        continue;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const nom = n.localName;
      if (nom === 'sc-for') {
        const liste = valeurDe(n.getAttribute('list') || '', portees);
        const comme = n.getAttribute('as') || 'item';
        if (Array.isArray(liste)) liste.forEach((element, i) => construire(n.childNodes, portees.concat([{ [comme]: element, $index: i }]), parent));
        continue;
      }
      if (nom === 'sc-if') {
        if (valeurDe(n.getAttribute('value') || '', portees)) construire(n.childNodes, portees, parent);
        continue;
      }
      if (nom === 'dc-import' || nom === 'helmet') continue;
      const el = document.createElementNS(n.namespaceURI, nom);
      for (const a of Array.from(n.attributes)) poserAttribut(el, a, portees);
      construire(n.childNodes, portees, el);
      parent.appendChild(el);
    }
  }

  // ── Mise à jour sans tout remplacer ──

  function majAttributs(ancien, nouveau) {
    for (const a of Array.from(ancien.attributes)) if (!nouveau.hasAttribute(a.name)) ancien.removeAttribute(a.name);
    for (const a of Array.from(nouveau.attributes)) if (ancien.getAttribute(a.name) !== a.value) ancien.setAttribute(a.name, a.value);
  }

  // Les propriétés vivantes d'un champ : l'attribut ne dit que la valeur de départ. Un champ en cours de saisie
  // garde ce qu'on y tape (sinon le curseur sauterait à chaque lettre).
  function majChamp(ancien, nouveau) {
    if (ancien.localName !== 'input' && ancien.localName !== 'textarea' && ancien.localName !== 'select') return;
    if (ancien.type === 'checkbox' || ancien.type === 'radio') ancien.checked = nouveau.hasAttribute('checked');
    else if (nouveau.hasAttribute('value') && ancien !== document.activeElement && ancien.value !== nouveau.getAttribute('value')) ancien.value = nouveau.getAttribute('value');
  }

  function fusionner(ancien, nouveau) {
    const avant = Array.from(ancien.childNodes);
    const apres = Array.from(nouveau.childNodes);
    for (let i = 0; i < apres.length; i++) {
      const n = apres[i];
      const o = avant[i];
      if (!o) {
        ancien.appendChild(n);
        continue;
      }
      if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName || o.namespaceURI !== n.namespaceURI) {
        ancien.replaceChild(n, o);
        continue;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) {
        if (o.data !== n.data) o.data = n.data;
        continue;
      }
      majAttributs(o, n);
      o.__dc = n.__dc;
      fusionner(o, n);
      majChamp(o, n);
    }
    for (let i = apres.length; i < avant.length; i++) ancien.removeChild(avant[i]);
  }

  // ── Rendus ──

  function rendre(inst) {
    let vals;
    try {
      vals = inst.renderVals() || {};
    } catch (e) {
      console.error('[planche]', inst.__id, e);
      return;
    }
    const morceau = document.createDocumentFragment();
    try {
      construire(inst.__modele.content.childNodes, [vals], morceau);
    } catch (e) {
      console.error('[planche]', inst.__id, e);
      return;
    }
    fusionner(inst.__racine, morceau);
    inst.__dernierEtat = inst.state;
  }

  // Plusieurs setState du même geste ne font qu'un rendu, juste après lui.
  const enAttente = new Map();
  let prevu = false;
  function planifier(inst, apres) {
    if (!inst.__monte) return;
    const rappels = enAttente.get(inst) || [];
    if (typeof apres === 'function') rappels.push(apres);
    enAttente.set(inst, rappels);
    if (!prevu) {
      prevu = true;
      Promise.resolve().then(vider);
    }
  }
  function vider() {
    prevu = false;
    const lot = Array.from(enAttente.entries());
    enAttente.clear();
    for (const [inst, rappels] of lot) {
      const avant = inst.__dernierEtat;
      rendre(inst);
      try {
        if (typeof inst.componentDidUpdate === 'function') inst.componentDidUpdate(inst.props, avant);
      } catch (e) {
        console.error('[planche]', inst.__id, e);
      }
      for (const r of rappels) {
        try {
          r();
        } catch (e) {
          console.error('[planche]', inst.__id, e);
        }
      }
    }
    document.dispatchEvent(new CustomEvent('hameau-planche-rendue'));
  }

  function monter(section) {
    const modele = section.querySelector(':scope > template[data-dc]');
    if (!modele) return;
    const code = section.querySelector(':scope > script[type="text/x-dc-logic"]');
    let Classe = DCLogic;
    if (code) {
      try {
        Classe = new Function('DCLogic', `${code.textContent}\n;return typeof Component === 'function' ? Component : null;`)(DCLogic) || DCLogic;
      } catch (e) {
        console.error('[planche]', section.id, e);
      }
    }
    let inst;
    try {
      inst = new Classe({});
    } catch (e) {
      console.error('[planche]', section.id, e);
      inst = new DCLogic({});
    }
    if (typeof inst.renderVals !== 'function') inst.renderVals = () => ({});
    const racine = document.createElement('div');
    racine.className = 'dc-racine';
    section.insertBefore(racine, modele);
    inst.__racine = racine;
    inst.__modele = modele;
    inst.__id = section.id;
    rendre(inst);
    inst.__monte = true;
    try {
      if (typeof inst.componentDidMount === 'function') inst.componentDidMount();
    } catch (e) {
      console.error('[planche]', section.id, e);
    }
  }

  // ── Événements : un seul écouteur par type, qui remonte du nœud touché jusqu'à la page ──

  function distribuer(e) {
    for (let n = e.target; n && n !== document; n = n.parentNode) {
      const f = n.__dc && n.__dc[e.type];
      if (!f) continue;
      try {
        f(e);
      } catch (err) {
        console.error('[planche]', err);
      }
      if (e.cancelBubble) break;
    }
  }
  for (const type of ['click', 'dblclick', 'input', 'submit', 'keydown', 'keyup', 'focusin', 'focusout', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'touchstart', 'touchend']) {
    document.addEventListener(type, distribuer);
  }

  for (const section of Array.from(document.querySelectorAll('section.planche'))) monter(section);
  document.dispatchEvent(new CustomEvent('hameau-planches-pretes'));
})();

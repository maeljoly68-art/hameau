// La page de leçons (« Leçons TOEIC de Maël ») telle que la liseuse de Hameau l'affiche. Copiée dans le document par
// scripts/cours/lecons.mjs ; elle tourne dans l'iframe isolée de la liseuse, avec les données du document.
//
// Sur claude.ai, la page montre UNE leçon à la fois (un menu à gauche, la leçon à droite). Dans Hameau, chaque leçon a
// sa planche, l'une sous l'autre : c'est ce qui permet d'écrire dessus, de compter les leçons lues pendant une séance
// et de les relier aux pages du cours. Le contenu, les quiz et le « fait / score » restent ceux de la page d'origine.
//
// Deux règles tiennent l'encre en place :
// - on n'écrit jamais dans la <section> elle-même, seulement dans sa « .contenu » : la liseuse pose son calque
//   d'encre dans la section, le remplacer effacerait les traits ;
// - une leçon n'est dessinée qu'une fois ; « fait » et le score se mettent à jour à leur place, sans redessiner la
//   leçon (sinon les réponses du quiz et la hauteur de la planche bougeraient sous les traits).
(function () {
  'use strict';
  const source = document.getElementById('lecons-donnees');
  if (!source) return;
  const donnees = JSON.parse(source.textContent || '{}');
  const TESTS = Array.isArray(donnees.tests) ? donnees.tests : [];
  const LESSONS = Array.isArray(donnees.lecons) ? donnees.lecons : [];
  const EXAM_DATE = typeof donnees.examen === 'string' ? donnees.examen : null;
  const TARGET = donnees.cible;
  const KEY = donnees.cle;
  if (LESSONS.length === 0) return;

  // ── Ce qui est fait : le même enregistrement que la page d'origine, que Hameau partage entre appareils ──
  let store = { done: {}, scores: {} };
  function charger() {
    store = { done: {}, scores: {} };
    try {
      const brut = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (brut && typeof brut === 'object') {
        if (brut.done && typeof brut.done === 'object') store.done = brut.done;
        if (brut.scores && typeof brut.scores === 'object') store.scores = brut.scores;
      }
    } catch {
      // Un enregistrement illisible : on repart de zéro plutôt que de ne rien afficher.
    }
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      // Sans stockage, la page marche quand même : rien n'est retenu.
    }
  };
  charger();

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (iso) => {
    const [, m, d] = String(iso).split('-');
    return d + '/' + m;
  };
  const today = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const daysLeft = () => (EXAM_DATE ? Math.max(0, Math.round((new Date(EXAM_DATE + 'T00:00:00') - today()) / 86400000)) : null);
  const nextLesson = () => LESSONS.find((l) => !store.done[l.id]) || LESSONS[LESSONS.length - 1];
  const shuffle = (a) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  // Les questions qui tiennent seules : celles dont le texte renvoie à « (même annonce) » n'ont pas de sens hors de leur leçon.
  const autonomes = (l) => (Array.isArray(l.quiz) ? l.quiz : []).filter((q) => !q.p || !String(q.p).startsWith('(')).map((q) => Object.assign({ from: l.id }, q));
  const contenu = (id) => {
    const s = document.getElementById(id);
    return s ? s.querySelector(':scope > .contenu') : null;
  };
  const scoreDe = (l) => (store.scores[l.id] != null ? ' · quiz ' + store.scores[l.id] + '/' + l.quiz.length : '');

  // ── Les quiz ──

  function quizHTML(items) {
    return (
      '<div class="qz">' +
      items
        .map(
          (q, i) => `
    <div class="qi" data-i="${i}">
      ${q.p ? `<div class="passage">${esc(q.p)}</div>` : ''}
      ${q.from ? `<div class="eyebrow" style="margin-bottom:6px"><span class="pill y">Rappel leçon ${esc(q.from)}</span></div>` : ''}
      <div class="s">${i + 1}. ${esc(q.s)}</div>
      <div class="opts">${q.o.map((o, k) => `<button type="button" class="opt" data-k="${k}"><b>${'ABCD'[k]}</b>${esc(o)}</button>`).join('')}</div>
      <div class="why" hidden></div>
    </div>`,
        )
        .join('') +
      '</div>'
    );
  }

  function wireQuiz(racine, items, onAnswer) {
    if (!racine) return;
    racine.querySelectorAll('.qi').forEach((box) => {
      const q = items[Number(box.dataset.i)];
      box.querySelectorAll('.opt').forEach((btn) => {
        btn.onclick = () => {
          const k = Number(btn.dataset.k);
          box.querySelectorAll('.opt').forEach((b, j) => {
            b.disabled = true;
            if (j === q.a) b.classList.add('ok');
          });
          const ok = k === q.a;
          if (!ok) btn.classList.add('ko');
          const why = box.querySelector('.why');
          why.hidden = false;
          why.innerHTML = `<strong>${ok ? 'Juste.' : 'Raté, la bonne : ' + 'ABCD'[q.a] + '.'}</strong> ${esc(q.w)}`;
          if (onAnswer) onAnswer(ok);
          // La planche a grandi : la liseuse remesure ce qui est à l'écran.
          document.dispatchEvent(new CustomEvent('hameau-planche-rendue'));
        };
      });
    });
  }

  // ── Le sommaire ──

  function renderSommaire() {
    const c = contenu('Sommaire');
    if (!c) return;
    const last = TESTS[TESTS.length - 1];
    const done = LESSONS.filter((l) => store.done[l.id]).length;
    const prochaine = nextLesson();
    const j = daysLeft();
    c.innerHTML = `
    <header class="bandeau">
      <div class="wrap">
        <div class="top">
          <div>
            <h1>Leçons TOEIC</h1>
            <p>Une leçon par jour, tirée de tes vraies erreurs. 5 à 10 minutes.</p>
          </div>
          <div class="stats">
            ${j !== null ? `<div class="stat hl"><b>J-${j}</b><span>TOEIC le ${fmt(EXAM_DATE)}</span></div>` : ''}
            ${last ? `<div class="stat"><b>${esc(last.total)}</b><span>dernier blanc /990</span></div>` : ''}
            ${TARGET != null ? `<div class="stat"><b>${esc(TARGET)}</b><span>objectif</span></div>` : ''}
            <div class="stat"><b>${done}/${LESSONS.length}</b><span>leçons faites</span></div>
          </div>
        </div>
        <nav class="tabs">
          <a class="jour" href="#L${prochaine.id}">Leçon du jour · ${prochaine.id}</a>
          <a href="#Revision">Révision mélangée</a>
          <a href="#Tests">Mes tests et pièges</a>
        </nav>
      </div>
    </header>
    <div class="corps">
      <div class="aside-h">Tes leçons</div>
      <div class="liste">${LESSONS.map(
        (l) => `
        <a class="li ${store.done[l.id] ? 'done' : ''}" href="#L${l.id}" ${l.id === prochaine.id ? 'aria-current="true"' : ''}>
          <span class="num">${store.done[l.id] ? '✓' : l.id}</span>
          <span><strong>${esc(l.title)}</strong><small>${esc(l.part)} · ${esc(l.minutes)} min${scoreDe(l)}</small></span>
        </a>`,
      ).join('')}</div>
    </div>`;
  }

  // ── Une leçon ──

  function actionsLecon(l) {
    const i = LESSONS.indexOf(l);
    const suivante = LESSONS[i + 1];
    return `
      <button type="button" class="btn ${store.done[l.id] ? 'done' : ''}" data-fait>${store.done[l.id] ? 'Leçon faite ✓' : 'Marquer la leçon comme faite'}</button>
      ${suivante ? `<a class="btn ghost" href="#L${suivante.id}">Leçon suivante</a>` : ''}
      <a class="btn ghost" href="#Sommaire">Sommaire</a>`;
  }

  function brancherActions(l) {
    const c = contenu('L' + l.id);
    const barre = c && c.querySelector('[data-actions]');
    if (!barre) return;
    barre.innerHTML = actionsLecon(l);
    barre.querySelector('[data-fait]').onclick = () => {
      if (store.done[l.id]) return;
      store.done[l.id] = new Date().toISOString().slice(0, 10);
      save();
      rafraichir();
    };
  }

  function renderLecon(l) {
    const c = contenu('L' + l.id);
    if (!c) return;
    const prev = LESSONS.slice(0, LESSONS.indexOf(l));
    const recall = shuffle(prev.flatMap(autonomes)).slice(0, 2);
    const errs = (l.errors || [])
      .map(
        (e) => `
    <div class="err">
      ${e.q ? `<div class="q">Question ${esc(e.q)} du test du ${fmt(l.test)}</div>` : ''}
      <div class="ph en">${esc(e.ph)}</div>
      <div class="ans">${e.mine ? `<span class="m">${esc(e.mine)}</span>` : ''}<span class="g">${esc(e.good)}</span></div>
    </div>`,
      )
      .join('');
    // racine, règle, mémo et exemples sont du HTML écrit pour la page (gras, tableaux, surligné) : posés tels quels.
    c.innerHTML = `
    <div>
      <div class="eyebrow"><span class="pill">Leçon ${esc(l.id)}</span><span class="pill y">${esc(l.cat)}</span><span>${esc(l.part)} · ${esc(l.minutes)} min</span></div>
      <h2>${esc(l.title)}</h2>
    </div>
    <div class="sec"><h3>Ton erreur <span class="k">ta réponse barrée, la bonne en vert</span></h3><div class="stack" style="gap:8px">${errs}</div></div>
    <div class="sec"><h3>Racine de l'erreur</h3><p style="margin:0;max-width:68ch">${l.racine}</p></div>
    <div class="sec rule"><h3>La règle</h3>${l.regle}</div>
    <div class="sec"><h3>Mémo</h3><div class="memo">${l.memo}</div></div>
    <div class="sec"><h3>Exemples</h3><ul class="ex en">${(l.exemples || []).map((x) => `<li>${x}</li>`).join('')}</ul></div>
    <div class="sec" data-quiz><h3>Entraîne-toi <span class="k" data-score></span></h3>${quizHTML(l.quiz)}</div>
    ${recall.length ? `<div class="sec" data-rappel><h3>Rappel express <span class="k">répétition des leçons d'avant</span></h3>${quizHTML(recall)}</div>` : ''}
    <div class="actions" data-actions></div>`;
    let good = 0;
    let answered = 0;
    wireQuiz(c.querySelector('[data-quiz]'), l.quiz, (ok) => {
      answered++;
      if (ok) good++;
      c.querySelector('[data-score]').textContent = good + '/' + l.quiz.length;
      if (answered === l.quiz.length) {
        store.scores[l.id] = good;
        save();
        renderSommaire();
      }
    });
    wireQuiz(c.querySelector('[data-rappel]'), recall);
    brancherActions(l);
  }

  // ── Révision mélangée ──

  function renderRevision() {
    const c = contenu('Revision');
    if (!c) return;
    const pool = LESSONS.filter((l) => store.done[l.id]);
    const items = shuffle((pool.length ? pool : LESSONS).flatMap(autonomes)).slice(0, 10);
    c.innerHTML = `
    <div><div class="eyebrow"><span class="pill">Révision</span><span>${pool.length ? 'tirée des leçons que tu as faites' : 'tirée de toutes les leçons'}</span></div>
    <h2 style="font-size:28px;margin-top:8px">${items.length} questions mélangées</h2></div>
    <div class="sec" data-quiz><h3>Score <span class="score" data-score>0/0</span></h3>${quizHTML(items)}</div>
    <div class="actions"><button type="button" class="btn" data-tirage>Nouveau tirage</button><a class="btn ghost" href="#Sommaire">Sommaire</a></div>`;
    let g = 0;
    let n = 0;
    wireQuiz(c.querySelector('[data-quiz]'), items, (ok) => {
      n++;
      if (ok) g++;
      c.querySelector('[data-score]').textContent = g + '/' + n;
    });
    c.querySelector('[data-tirage]').onclick = () => {
      renderRevision();
      document.dispatchEvent(new CustomEvent('hameau-planche-rendue'));
    };
  }

  // ── Tests et pièges ──

  function renderTests() {
    const c = contenu('Tests');
    if (!c) return;
    const traps = {};
    TESTS.forEach((t) => Object.entries(t.traps || {}).forEach(([k, v]) => (traps[k] = (traps[k] || 0) + v)));
    const sorted = Object.entries(traps).sort((a, b) => b[1] - a[1]);
    // Le plan part du lendemain du premier examen blanc (le jour où les leçons ont commencé).
    const premier = TESTS.map((t) => t.date).sort()[0];
    const days = [];
    if (premier && EXAM_DATE) {
      const start = new Date(premier + 'T00:00:00');
      start.setDate(start.getDate() + 1);
      const exam = new Date(EXAM_DATE + 'T00:00:00');
      for (let d = new Date(start); d < exam && days.length < 120; d.setDate(d.getDate() + 1)) days.push(new Date(d));
    }
    const t0 = today().getTime();
    const deux = (n) => String(n).padStart(2, '0');
    c.innerHTML = `
    ${TESTS.slice()
      .reverse()
      .map(
        (t) => `
    <div class="bloc stack">
      <div><div class="eyebrow"><span class="pill">${fmt(t.date)}</span><span>${esc(t.name)} · ${esc(t.duration)} · niveau ${esc(t.level)}</span></div>
      <h2 style="font-size:28px;margin-top:8px">${esc(t.total)}/990 <span style="font-size:18px;color:var(--muted);font-weight:600">· Écoute ${esc(t.L)} · Lecture ${esc(t.R)}</span></h2></div>
      <div>${(t.parts || [])
        .map(([n, ok, tot]) => {
          const p = Math.round((ok / tot) * 100);
          return `<div class="bar"><span>${esc(n)}</span><span class="t"><span class="f ${p < 50 ? 'low' : p < 70 ? 'mid' : ''}" style="width:${p}%;display:block"></span></span><em>${ok}/${tot}</em></div>`;
        })
        .join('')}</div>
    </div>`,
      )
      .join('')}
    <div class="bloc">
      <h2 style="font-size:24px;margin-bottom:6px">Mes pièges récurrents</h2>
      <p class="note" style="margin:0 0 8px">Nombre d'erreurs par type, tous tests confondus. Le haut de la liste est ta priorité.</p>
      ${sorted.map(([k, v]) => `<div class="trap"><span>${esc(k)}</span><b>${v}</b></div>`).join('')}
    </div>
    ${
      days.length
        ? `<div class="bloc">
      <h2 style="font-size:24px;margin-bottom:6px">Plan jusqu'au ${fmt(EXAM_DATE)}</h2>
      <p class="note" style="margin:0 0 10px">Une leçon par jour, puis des jours de révision mélangée.</p>
      <div class="plan">${days
        .map((d, i) => {
          const l = LESSONS[i];
          return `<div class="day ${l ? '' : 'rev'} ${d.getTime() === t0 ? 'today' : ''}"><b>${deux(d.getDate())}/${deux(d.getMonth() + 1)}</b>${l ? 'Leçon ' + l.id + (store.done[l.id] ? ' ✓' : '') : 'Révision'}</div>`;
        })
        .join('')}</div>
    </div>`
        : ''
    }
    <div class="actions"><a class="btn ghost" href="#Sommaire">Sommaire</a></div>`;
  }

  // « Fait » ou un score a changé (ici ou sur l'autre appareil) : le sommaire, les boutons et le plan suivent.
  function rafraichir() {
    renderSommaire();
    for (const l of LESSONS) brancherActions(l);
    renderTests();
    document.dispatchEvent(new CustomEvent('hameau-planche-rendue'));
  }

  renderSommaire();
  for (const l of LESSONS) renderLecon(l);
  renderRevision();
  renderTests();

  document.addEventListener('hameau-etat', (e) => {
    if (!e.detail || e.detail.cle !== KEY) return;
    charger();
    rafraichir();
  });
})();

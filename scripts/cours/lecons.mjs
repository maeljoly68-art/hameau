#!/usr/bin/env node
// Convertit une page de leçons publiée sur claude.ai (« Leçons TOEIC de Maël ») en UNE page que la liseuse de
// Hameau sait afficher.
//
//   node scripts/cours/lecons.mjs <page.html> <sortie.html>
//
// La page d'origine est une petite application : ses données (TESTS, LESSONS) en tête du script, puis le code qui
// affiche une leçon à la fois. On ne garde que les DONNÉES, relues dans un bac à sable sans rien d'accessible, puis
// réécrites en JSON dans le document : rien du code d'origine n'est recopié. Le code qui les affiche est celui de
// scripts/cours/lecons-page.js : une planche par leçon (l'ancre « L1 », « L2 »… que Hameau relie à une page du
// cours), plus le sommaire, la révision mélangée et les tests.
//
// Quand la page gagne des leçons (après un nouvel examen blanc), on relance la conversion puis le chiffrement :
// les leçons existantes gardent leur ancre, les nouvelles s'ajoutent à la suite.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const FORMAT = 1;
const LARGEUR_PLANCHE = 820;
const MARGE = 24;
const MARQUE_FIN = '/* ==== FIN LESSONS ==== */';

const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Le CSS de la page sans son thème sombre. Dans la liseuse, l'encre se pose en « multiply » : sur un fond sombre,
 * un trait noir disparaît. Les autres cours de Hameau sont clairs, celui-ci aussi.
 */
export function sansThemeSombre(css) {
  const propre = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let sortie = '';
  let i = 0;
  while (i < propre.length) {
    const ouvre = propre.indexOf('{', i);
    if (ouvre < 0) break;
    const tete = propre.slice(i, ouvre).trim();
    let profondeur = 1;
    let j = ouvre + 1;
    while (j < propre.length && profondeur > 0) {
      if (propre[j] === '{') profondeur++;
      else if (propre[j] === '}') profondeur--;
      j++;
    }
    const sombre = /prefers-color-scheme\s*:\s*dark/.test(tete) || /\[data-theme=["']?dark/.test(tete);
    if (!sombre) sortie += `${tete}{${propre.slice(ouvre + 1, j - 1)}}\n`;
    i = j;
  }
  return sortie;
}

const estTexte = (v) => typeof v === 'string' && v.trim().length > 0;

function verifierLecon(l, vus) {
  const nom = `leçon ${JSON.stringify(l?.id)}`;
  if (!l || typeof l !== 'object') throw new Error('une leçon n’est pas un objet');
  if (!Number.isInteger(l.id) || l.id < 1 || l.id > 9999) throw new Error(`${nom} : identifiant invalide`);
  if (vus.has(l.id)) throw new Error(`${nom} : identifiant en double`);
  vus.add(l.id);
  if (!estTexte(l.title)) throw new Error(`${nom} : pas de titre`);
  if (!Number.isInteger(l.minutes) || l.minutes < 1 || l.minutes > 120) throw new Error(`${nom} : durée invalide`);
  for (const champ of ['racine', 'regle', 'memo']) if (typeof l[champ] !== 'string') throw new Error(`${nom} : « ${champ} » manque`);
  if (!Array.isArray(l.errors) || !Array.isArray(l.exemples)) throw new Error(`${nom} : erreurs ou exemples manquants`);
  if (!Array.isArray(l.quiz) || l.quiz.length === 0) throw new Error(`${nom} : pas de quiz`);
  for (const q of l.quiz) {
    if (!q || !estTexte(q.s) || !Array.isArray(q.o) || q.o.length < 2 || q.o.length > 4 || !Number.isInteger(q.a) || q.a < 0 || q.a >= q.o.length) {
      throw new Error(`${nom} : une question du quiz est incomplète`);
    }
  }
}

/** Les données de la page : ses tests, ses leçons, la date d'examen, l'objectif et la clé où elle range ce qui est fait. */
export function lireDonnees(source) {
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const script = scripts.find((s) => s.includes(MARQUE_FIN));
  if (!script) throw new Error(`pas de « ${MARQUE_FIN} » : ce n'est pas une page de leçons`);
  const fin = script.indexOf('];', script.indexOf(MARQUE_FIN));
  if (fin < 0) throw new Error('la liste des leçons ne se ferme pas');
  const code = script.slice(0, fin + 2);
  // Un contexte vide (ni require, ni process, ni réseau) et une seconde de calcul au plus : ce sont des données.
  const brut = vm.runInNewContext(
    `${code}\n;({ tests: typeof TESTS === 'undefined' ? [] : TESTS, lecons: LESSONS, examen: typeof EXAM_DATE === 'undefined' ? null : EXAM_DATE, cible: typeof TARGET === 'undefined' ? null : TARGET })`,
    Object.create(null),
    { timeout: 1000 },
  );
  // Le passage par JSON sort les données du bac à sable et laisse les fonctions derrière.
  const d = JSON.parse(JSON.stringify(brut));
  if (!Array.isArray(d.lecons) || d.lecons.length === 0) throw new Error('aucune leçon');
  const vus = new Set();
  for (const l of d.lecons) verifierLecon(l, vus);
  if (!Array.isArray(d.tests)) d.tests = [];
  if (d.examen !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(d.examen))) d.examen = null;
  // La clé de la page d'origine (« toeic-lecons-mael-v1 ») : celle sous laquelle Hameau partage « fait » et les scores.
  const cle = /\bconst\s+KEY\s*=\s*["']([A-Za-z0-9_.:-]{1,100})["']/.exec(source)?.[1] ?? 'lecons';
  return { tests: d.tests, lecons: d.lecons, examen: d.examen, cible: d.cible ?? null, cle };
}

/** Du JSON qui peut vivre dans une balise <script> sans la fermer. */
const jsonDansHtml = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');

const PAGE = readFileSync(new URL('./lecons-page.js', import.meta.url), 'utf8');

export function convertirLecons(source) {
  const donnees = lireDonnees(source);
  const css = sansThemeSombre(/<style\b[^>]*>([\s\S]*?)<\/style>/i.exec(source)?.[1] ?? '');
  const polices = [...source.matchAll(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"[^>]*>/g)].map((m) => m[0]);
  const titre = /<title>([\s\S]*?)<\/title>/i.exec(source)?.[1]?.trim() || 'Leçons';
  const largeur = LARGEUR_PLANCHE + 2 * MARGE;

  const planches = [
    { id: 'Sommaire', titre: 'Sommaire', classe: 'sommaire' },
    ...donnees.lecons.map((l) => ({ id: `L${l.id}`, titre: `Leçon ${l.id} · ${l.title}`, classe: 'lesson stack' })),
    { id: 'Revision', titre: 'Révision mélangée', classe: 'stack' },
    { id: 'Tests', titre: 'Mes tests et pièges', classe: 'stack' },
  ];
  const sections = planches
    .map((p) => `<section class="planche" id="${echapper(p.id)}" data-page="${echapper(p.id)}" data-titre="${echapper(p.titre)}"><div class="contenu ${p.classe}"></div></section>`)
    .join('\n');

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="hameau-format" content="${FORMAT}">
<meta name="hameau-largeur" content="${largeur}">
<title>${echapper(titre.replace(/<[^>]*>/g, ''))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${polices.join('\n')}
<style>
${css}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:#D7DBE2}
#document{box-sizing:border-box;width:${largeur}px;margin:0 auto;padding:${MARGE}px ${MARGE}px 200px;display:flex;flex-direction:column;align-items:center;gap:40px}
.planche{position:relative;flex:none;width:${LARGEUR_PLANCHE}px;overflow:hidden;border-radius:14px;background:var(--card);box-shadow:0 1px 3px rgba(20,24,32,.12),0 12px 32px rgba(20,24,32,.12);scroll-margin-top:16px}
.planche>.contenu{padding:26px 32px 30px}
.planche>.contenu.sommaire{padding:0}
.sommaire .bandeau{padding:24px 0 20px}
.sommaire .wrap{padding:0 32px}
.sommaire .corps{padding:22px 32px 30px;display:flex;flex-direction:column;gap:8px}
.sommaire .liste{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
a.li{color:inherit;text-decoration:none}
a.li[aria-current="true"]{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
nav.tabs a{border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:6px 14px;font-size:15px;color:inherit;text-decoration:none}
nav.tabs a.jour{background:var(--hl);color:#16213a;border-color:var(--hl);font-weight:700}
a.btn{display:inline-block;text-decoration:none}
.bloc{border:1px solid var(--line);border-radius:12px;padding:18px 20px}
</style>
</head>
<body>
<main id="document">
${sections}
</main>
<script type="application/json" id="lecons-donnees">${jsonDansHtml(donnees)}</script>
<script>
${PAGE.replace(/<\/script/gi, '<\\/script')}
</script>
</body>
</html>
`;
  return {
    html,
    largeur,
    planches: planches.map(({ id, titre }) => ({ id, titre })),
    lecons: donnees.lecons.map((l) => ({ ancre: `L${l.id}`, titre: l.title, minutes: l.minutes })),
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [entree, sortie] = process.argv.slice(2);
  if (!entree || !sortie) {
    console.error('Usage : node scripts/cours/lecons.mjs <page.html> <sortie.html>');
    process.exit(1);
  }
  const r = convertirLecons(readFileSync(entree, 'utf8'));
  writeFileSync(sortie, r.html);
  console.log(`${sortie} : ${r.planches.length} planches, ${Math.round(r.html.length / 1024)} Ko, largeur ${r.largeur}px`);
  for (const l of r.lecons) console.log(`  ${l.ancre} — ${l.titre} (${l.minutes} min)`);
}

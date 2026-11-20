// Le convertisseur des pages de leçons (TOEIC) : une planche par leçon, les données seules recopiées, rien qui casse
// la page ou s'exécute en route.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertirLecons, lireDonnees, sansThemeSombre } from '../scripts/cours/lecons.mjs';

const lecon = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  test: '2026-11-19',
  part: 'Lecture P5',
  cat: 'Grammaire',
  minutes: 5 + id,
  title: `Leçon numéro ${id}`,
  errors: [{ q: 40 + id, ph: 'phrase', mine: 'a', good: 'b' }],
  racine: 'racine',
  regle: '<p>règle</p>',
  memo: 'mémo',
  exemples: ['exemple'],
  quiz: [{ s: 'question', o: ['a', 'b', 'c', 'd'], a: 1, w: 'pourquoi' }],
  ...extra,
});

function page(lecons: unknown[], { avant = '', css = '' } = {}) {
  return `<!DOCTYPE html><html><head><title>Leçons TOEIC de Maël</title>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3&display=swap" rel="stylesheet">
<style>${css}</style></head><body><main></main>
<script>
${avant}
const EXAM_DATE = "2026-12-05";
const TARGET = 850;
const TESTS = [ { date:"2026-11-19", name:"Blanc 1", total:525, L:330, R:195, parts:[], traps:{} } /* ==== FIN TESTS ==== */ ];
const LESSONS = [
${lecons.map((l) => JSON.stringify(l).replace(/<\//g, '<\\/')).join(',\n')}
/* ==== FIN LESSONS ==== */
];
const KEY = "toeic-lecons-mael-v1";
function route(){ document.body.dataset.codeDeLApplication = "oui"; }
route();
</script></body></html>`;
}

test('une planche par leçon, entre le sommaire et la révision, avec l’ancre que Hameau relie à une page', () => {
  const r = convertirLecons(page([lecon(1), lecon(2)]));
  assert.deepEqual(
    r.planches.map((p) => p.id),
    ['Sommaire', 'L1', 'L2', 'Revision', 'Tests'],
  );
  assert.deepEqual(r.lecons, [
    { ancre: 'L1', titre: 'Leçon numéro 1', minutes: 6 },
    { ancre: 'L2', titre: 'Leçon numéro 2', minutes: 7 },
  ]);
  assert.match(r.html, /<section class="planche" id="L2" data-page="L2" data-titre="Leçon 2 · Leçon numéro 2">/);
  assert.match(r.html, /<meta name="hameau-largeur" content="868">/);
  assert.match(r.html, /fonts\.googleapis\.com\/css2\?family=Source\+Sans\+3/);
});

test('seules les données passent : le code de la page d’origine n’est pas recopié', () => {
  const r = convertirLecons(page([lecon(1)]));
  assert.ok(!r.html.includes('codeDeLApplication'));
  const d = lireDonnees(page([lecon(1)]));
  assert.equal(d.examen, '2026-12-05');
  assert.equal(d.cible, 850);
  // La clé de la page d'origine : « fait » et les scores restent rangés sous le même nom.
  assert.equal(d.cle, 'toeic-lecons-mael-v1');
});

test('les données se lisent dans un bac à sable : ni process, ni require', () => {
  assert.throws(() => lireDonnees(page([lecon(1)], { avant: 'const fuite = process.env;' })), /process is not defined/);
  assert.throws(() => lireDonnees(page([lecon(1)], { avant: 'const m = require("node:fs");' })), /require is not defined/);
});

// Dans la page d'origine, il est écrit « <\/script> » (sinon il fermerait déjà son propre script) ; relu, c'est « </script> ».
test('un « </script> » dans une leçon ne ferme pas la balise des données', () => {
  const piege = 'avant </script><script>window.pirate = 1</script> après';
  const r = convertirLecons(page([lecon(1, { memo: piege })]));
  const m = /<script type="application\/json" id="lecons-donnees">([\s\S]*?)<\/script>/.exec(r.html);
  assert.ok(m);
  const relu = JSON.parse(m[1]);
  assert.equal(relu.lecons[0].memo, piege);
});

test('le thème sombre est retiré (l’encre « multiply » disparaîtrait), le reste est gardé', () => {
  const css = `:root{--ink:#16213a}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ --ink:#e8ecf6 } }
:root[data-theme="dark"]{ --ink:#e8ecf6 }
:root[data-theme="dark"] header{ background:#0a0f1c }
@media (prefers-reduced-motion: no-preference){ .opt{ transition:border-color .15s } }
.memo{ background:var(--hl-soft) }`;
  const propre = sansThemeSombre(css);
  assert.ok(!propre.includes('e8ecf6'));
  assert.ok(!propre.includes('0a0f1c'));
  assert.match(propre, /--ink:#16213a/);
  assert.match(propre, /prefers-reduced-motion/);
  assert.match(propre, /\.memo\{ background:var\(--hl-soft\) \}/);
  assert.ok(!convertirLecons(page([lecon(1)], { css })).html.includes('e8ecf6'));
});

test('une page abîmée est refusée plutôt que publiée à moitié', () => {
  assert.throws(() => convertirLecons(page([lecon(1, { quiz: [{ s: 'q', o: ['a', 'b'], a: 2, w: '' }] })])), /quiz est incomplète/);
  assert.throws(() => convertirLecons(page([lecon(1), lecon(1)])), /en double/);
  assert.throws(() => convertirLecons(page([lecon(1, { minutes: 0 })])), /durée invalide/);
  assert.throws(() => convertirLecons('<html><script>const LESSONS = [];</script></html>'), /FIN LESSONS/);
});

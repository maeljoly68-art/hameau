import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chapitre } from '../src/core/cours.ts';
import { COUVERTURE_MIN, SECONDES_MAX, SECONDES_MIN, ajouterIntervalle, couverture, cumulParPage, fois, ordinal, pagesVues, phraseLecture, planValidation, rangDuPassage, resumeLecture, secondesPourVoir, totauxParChapitre, type Lecture } from '../src/core/lecture.ts';

const AUJ = '2026-11-20';
const page = (id: string, ordre: number, extra: Partial<Chapitre> = {}): Chapitre => ({ id, coursId: 'eco', titre: id, ordre, dureeMin: 20, niveau: 0, derniere: null, prochaine: null, lien: null, parCoeur: false, ...extra });
const lu = (chapitreId: string, secondes: number, couv: number, appareil = 'ipad'): Lecture => ({ chapitreId, appareil, secondes, couverture: couv });

// ── Couverture ──

test('les zones vues se fusionnent : relire le même passage ne fait pas monter la couverture', () => {
  let vus = ajouterIntervalle([], 0, 500);
  vus = ajouterIntervalle(vus, 300, 800);
  vus = ajouterIntervalle(vus, 0, 500);
  assert.deepEqual(vus, [[0, 800]]);
  assert.equal(couverture(vus, 1000), 80);
  vus = ajouterIntervalle(vus, 900, 1000);
  assert.deepEqual(vus, [[0, 800], [900, 1000]]);
  assert.equal(couverture(vus, 1000), 90);
});

test('couverture : ce qui dépasse la page ne compte pas, une page sans hauteur vaut 0', () => {
  assert.equal(couverture([[-200, 300]], 1000), 30);
  assert.equal(couverture([[800, 5000]], 1000), 20);
  assert.equal(couverture([[0, 1000]], 0), 0);
  assert.equal(couverture([[0, 1000]], Number.NaN), 0);
  assert.deepEqual(ajouterIntervalle([[0, 10]], 50, 40), [[0, 10]], 'un intervalle à l’envers est ignoré');
  assert.deepEqual(ajouterIntervalle([[0, 10]], Number.NaN, 40), [[0, 10]]);
});

// ── Vue ou pas ──

test('le temps exigé : un cinquième de la durée de la page, entre 45 s et 3 min', () => {
  assert.equal(secondesPourVoir(10), 120);
  assert.equal(secondesPourVoir(20), SECONDES_MAX);
  assert.equal(secondesPourVoir(2), SECONDES_MIN);
  assert.equal(secondesPourVoir(Number.NaN), SECONDES_MIN);
});

test('une page vue, c’est assez longtemps ET en grande partie', () => {
  const pages = [page('a', 0), page('b', 1), page('c', 2), page('d', 3, { dureeMin: 5 })];
  const vues = pagesVues([lu('a', 200, 90), lu('b', 600, 30), lu('c', 60, 100), lu('d', 60, COUVERTURE_MIN)], pages);
  assert.deepEqual(vues, ['a', 'd'], 'b : à peine un tiers de la page ; c : survolée en une minute');
});

test('deux appareils sur la même séance : les temps s’ajoutent, la meilleure couverture compte', () => {
  const cumul = cumulParPage([lu('a', 100, 40, 'ipad'), lu('a', 100, 90, 'pc'), lu('a', -5, 100, 'x')]);
  assert.deepEqual(cumul.get('a'), { secondes: 200, couverture: 90 });
  assert.deepEqual(pagesVues([lu('a', 100, 40, 'ipad'), lu('a', 100, 90, 'pc')], [page('a', 0)]), ['a'], 'ni l’un ni l’autre seul ne suffisait');
  assert.deepEqual(pagesVues([lu('zz', 900, 100)], [page('a', 0)]), [], 'une page inconnue (supprimée) est ignorée');
});

// ── La combientième fois ──

test('le rang du passage : un jour = une fois, ce jour compris', () => {
  const passages = [
    { chapitreId: 'a', jour: '2026-11-10' },
    { chapitreId: 'a', jour: '2026-11-10' },
    { chapitreId: 'a', jour: '2026-11-12' },
    { chapitreId: 'b', jour: '2026-11-12' },
  ];
  assert.equal(rangDuPassage(passages, 'a', AUJ), 3, 'deux jours avant, et aujourd’hui');
  assert.equal(rangDuPassage([...passages, { chapitreId: 'a', jour: AUJ }], 'a', AUJ), 3, 'déjà vue aujourd’hui : pas de double compte');
  assert.equal(rangDuPassage(passages, 'c', AUJ), 1);
  assert.equal(rangDuPassage([{ chapitreId: 'a', jour: '2026-12-01' }], 'a', AUJ), 1, 'un jour à venir ne compte pas');
  assert.equal(ordinal(1), '1er');
  assert.equal(ordinal(3), '3e');
  assert.equal(fois(1), '1re fois');
  assert.equal(fois(3), '3e fois');
});

test('le résumé : les pages regroupées par rang, dans l’ordre du cours', () => {
  const pages = [page('p1', 0), page('p2', 1), page('p3', 2), page('p4', 3), page('p5', 4)];
  const passages = [
    { chapitreId: 'p1', jour: '2026-11-10' },
    { chapitreId: 'p1', jour: '2026-11-15' },
    { chapitreId: 'p2', jour: '2026-11-10' },
    { chapitreId: 'p2', jour: '2026-11-15' },
    { chapitreId: 'p3', jour: '2026-11-10' },
    { chapitreId: 'p3', jour: '2026-11-15' },
  ];
  const r = resumeLecture(['p5', 'p1', 'p3', 'p2', 'p4'], pages, passages, AUJ);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].groupes, [
    { rang: 3, pages: [1, 2, 3] },
    { rang: 1, pages: [4, 5] },
  ]);
  assert.equal(phraseLecture(r[0].groupes), 'pages 1 à 3 (3e fois), pages 4 et 5 (1re fois)');
  assert.deepEqual(r[0].chapitreIds, ['p1', 'p2', 'p3', 'p4', 'p5']);
});

test('le résumé suit l’ordre des cours donné, et ignore les doublons', () => {
  const pages = [page('a1', 0, { coursId: 'droit' }), page('e1', 0, { coursId: 'eco' })];
  const r = resumeLecture(['e1', 'a1', 'a1'], pages, [], AUJ, ['eco', 'droit']);
  assert.deepEqual(r.map((c) => c.coursId), ['eco', 'droit']);
  assert.deepEqual(r[1].chapitreIds, ['a1']);
});

// ── Ce que la fin de séance valide ──

test('la fin de séance : nouvelles lues, révisions dues à noter, les autres relues, rien deux fois', () => {
  const pages = [
    page('neuve', 0),
    page('due', 1, { niveau: 3, derniere: '2026-11-10', prochaine: '2026-11-18' }),
    page('du-jour', 2, { niveau: 2, derniere: '2026-11-17', prochaine: AUJ }),
    page('pas-due', 3, { niveau: 2, derniere: '2026-11-18', prochaine: '2026-11-25' }),
    page('faite', 4, { niveau: 2, derniere: AUJ, prochaine: '2026-11-27' }),
    page('a-apprendre', 5, { niveau: 1, derniere: '2026-11-19', prochaine: AUJ }),
  ];
  const plan = planValidation(['neuve', 'due', 'du-jour', 'pas-due', 'faite', 'a-apprendre', 'neuve', 'inconnue'], pages, AUJ);
  assert.deepEqual(plan.nouvelles, ['neuve']);
  assert.deepEqual(plan.aNoter, ['due', 'du-jour', 'a-apprendre']);
  assert.deepEqual(plan.aApprendre, ['a-apprendre'], 'au premier retour, on écrit de mémoire avant de se noter');
  assert.deepEqual(plan.relues, ['pas-due'], 'pas encore due : relue, sans avancer le cycle');
  assert.deepEqual(plan.dejaFaites, ['faite'], 'déjà validée aujourd’hui : rien à refaire');
});

test('« mot pour mot » : on apprend un retour de plus avant de simplement réviser', () => {
  const pages = [page('m', 0, { niveau: 2, derniere: '2026-11-19', prochaine: AUJ, parCoeur: true }), page('n', 1, { niveau: 2, derniere: '2026-11-19', prochaine: AUJ })];
  const plan = planValidation(['m', 'n'], pages, AUJ);
  assert.deepEqual(plan.aApprendre, ['m']);
  assert.deepEqual(plan.aNoter, ['m', 'n']);
});

test('les totaux d’une page faite de plusieurs planches : secondes additionnées, couverture pesée par la hauteur', () => {
  const totaux = totauxParChapitre([
    { chapitreId: 'p1', secondes: 120, vus: [[0, 1000]], hauteur: 1000 },
    { chapitreId: 'p1', secondes: 30, vus: [[0, 1000]], hauteur: 3000 },
    { chapitreId: 'p2', secondes: 50, vus: [[0, 500]], hauteur: 1000 },
    { chapitreId: 'p3', secondes: Number.NaN, vus: [], hauteur: 0 },
  ]);
  assert.deepEqual(totaux, [
    { chapitreId: 'p1', secondes: 150, couverture: 50 },
    { chapitreId: 'p2', secondes: 50, couverture: 50 },
    { chapitreId: 'p3', secondes: 0, couverture: 0 },
  ]);
});

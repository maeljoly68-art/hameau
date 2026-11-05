import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECART_JOURS, ETAT_INITIAL, NIVEAU_MAX, apresDecouverte, apresRevision, maitrise, niveauValide, statut, type EtatRevision } from '../src/core/revision.ts';

const J = '2026-11-05';
const a = (niveau: number): EtatRevision => ({ niveau, derniere: '2026-11-01', prochaine: '2026-11-04' });

test('l’échelle grandit : chaque écart dépasse le précédent', () => {
  for (let i = 2; i <= NIVEAU_MAX; i++) assert.ok(ECART_JOURS[i] > ECART_JOURS[i - 1], `écart ${i}`);
  assert.equal(ECART_JOURS.length, NIVEAU_MAX + 1);
});

test('première lecture : niveau 1, révision dès le lendemain', () => {
  assert.deepEqual(apresDecouverte(J), { niveau: 1, derniere: J, prochaine: '2026-11-06' });
});

test('noter un chapitre pas encore vu, c’est le découvrir (la note n’y change rien)', () => {
  for (const n of ['a-revoir', 'difficile', 'bien', 'facile'] as const) assert.deepEqual(apresRevision(ETAT_INITIAL, n, J), apresDecouverte(J), n);
});

test('« bien » : un cran de plus, et l’écart de ce cran', () => {
  const r = apresRevision(a(2), 'bien', J);
  assert.equal(r.niveau, 3);
  assert.equal(r.prochaine, '2026-11-12', '7 jours');
  assert.equal(r.derniere, J);
});

test('« facile » : deux crans, bornés au sommet de l’échelle', () => {
  assert.equal(apresRevision(a(2), 'facile', J).niveau, 4);
  assert.equal(apresRevision(a(NIVEAU_MAX), 'facile', J).niveau, NIVEAU_MAX);
  assert.equal(apresRevision(a(NIVEAU_MAX - 1), 'bien', J).niveau, NIVEAU_MAX);
});

test('« difficile » : même cran, mais on revient deux fois plus tôt', () => {
  const r = apresRevision(a(4), 'difficile', J); // 14 jours → 7
  assert.equal(r.niveau, 4);
  assert.equal(r.prochaine, '2026-11-12');
  // Jamais « 0 jour » : au pire, demain.
  assert.equal(apresRevision(a(1), 'difficile', J).prochaine, '2026-11-06');
});

test('« à revoir » : on redescend de deux crans (pas sous 1) et on réessaie demain', () => {
  const r = apresRevision(a(4), 'a-revoir', J);
  assert.equal(r.niveau, 2);
  assert.equal(r.prochaine, '2026-11-06');
  assert.equal(apresRevision(a(1), 'a-revoir', J).niveau, 1, 'un chapitre vu ne redevient jamais « à découvrir »');
});

test('maîtrise et statut', () => {
  assert.equal(maitrise(0), 0);
  assert.equal(maitrise(NIVEAU_MAX), 100);
  assert.equal(maitrise(3), 50);
  assert.equal(statut(0), 'a-decouvrir');
  assert.equal(statut(1), 'en-cours');
  assert.equal(statut(4), 'en-cours');
  assert.equal(statut(5), 'maitrise');
});

test('un niveau absurde (donnée abîmée) vaut 0, jamais NaN ni hors échelle', () => {
  for (const v of [-1, 7, 2.5, NaN, '3', null, undefined]) assert.equal(niveauValide(v), 0, String(v));
  assert.equal(niveauValide(3), 3);
  assert.equal(maitrise(99), 0);
});

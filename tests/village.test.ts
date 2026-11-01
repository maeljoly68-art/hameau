import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE, FEU, refusConstruction, solde, tailleTerrain } from '../src/core/village.ts';
import { construction, session } from './aide.ts';

test('le solde = points gagnés − coûts PAYÉS, pas les prix du catalogue', () => {
  const s = [session('2026-11-01T10:00:00+01:00', 60)]; // 70 points
  // Le chêne coûte 15 aujourd'hui ; celui-ci a été payé 12.
  assert.equal(solde(s, [construction('arbre', 0, 0, 12)]), 58);
});

test('une session en cours ne crédite rien', () => {
  assert.equal(solde([session('2026-11-01T10:00:00+01:00', null)], []), 0);
});

test('le terrain grandit avec le niveau, sans dépasser 11', () => {
  assert.equal(tailleTerrain(1), 5);
  assert.equal(tailleTerrain(3), 6);
  assert.equal(tailleTerrain(99), 11);
});

test('le feu de camp est dans le terrain de départ', () => {
  assert.ok(FEU.x < tailleTerrain(1) && FEU.y < tailleTerrain(1));
});

test('refus de construction', () => {
  const etat = { niveau: 1, solde: 100, constructions: [construction('arbre', 0, 0, 15)] };
  assert.equal(refusConstruction('arbre', 1, 0, etat), null);
  assert.equal(refusConstruction('licorne', 1, 0, etat), 'inconnu');
  assert.equal(refusConstruction('moulin', 1, 0, etat), 'niveau');
  assert.equal(refusConstruction('arbre', 0, 0, etat), 'occupee');
  assert.equal(refusConstruction('arbre', FEU.x, FEU.y, etat), 'occupee');
  assert.equal(refusConstruction('arbre', 5, 0, etat), 'hors-terrain');
  assert.equal(refusConstruction('arbre', 1.5, 0, etat), 'hors-terrain');
  assert.equal(refusConstruction('cabane', 1, 0, { ...etat, solde: 39 }), 'solde');
});

test('catalogue : identifiants uniques, chaque bâtiment est atteignable', () => {
  const ids = CATALOGUE.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(CATALOGUE.some((b) => b.niveauRequis === 1), 'il faut pouvoir construire dès le début');
});

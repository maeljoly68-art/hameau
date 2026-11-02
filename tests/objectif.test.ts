import { test } from 'node:test';
import assert from 'node:assert/strict';
import { objectifValide, prochainBonus, progression } from '../src/core/objectif.ts';

test('une session libre n’a pas de progression', () => {
  assert.equal(progression(30, null), null);
  assert.equal(progression(30, 0), null);
});

test('progression vers l’objectif, puis au-delà', () => {
  assert.deepEqual(progression(10, 50), { ratio: 0.2, atteint: false, reste: 40, auDela: 0 });
  assert.deepEqual(progression(50, 50), { ratio: 1, atteint: true, reste: 0, auDela: 0 });
  assert.deepEqual(progression(65, 50), { ratio: 1, atteint: true, reste: 0, auDela: 15 });
});

test('prochain bonus de bloc', () => {
  assert.equal(prochainBonus(0), 25);
  assert.equal(prochainBonus(24), 1);
  assert.equal(prochainBonus(25), 25);
  assert.equal(prochainBonus(230), null, 'pas de bonus promis au-delà du plafond de 4 h');
});

test('objectif saisi : vide = pas d’objectif, jamais zéro minute', () => {
  assert.equal(objectifValide(null), null);
  assert.equal(objectifValide(''), null);
  assert.equal(objectifValide(undefined), null);
  assert.equal(objectifValide('abc'), null);
  assert.equal(objectifValide(0), null);
  assert.equal(objectifValide(9999), null);
  assert.equal(objectifValide('50'), 50);
  assert.equal(objectifValide(49.6), 50);
});

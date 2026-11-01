import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niveauPour, pointsSession, seuilNiveau } from '../src/core/points.ts';

test('une session en cours ne rapporte rien', () => {
  assert.equal(pointsSession(null), 0);
  assert.equal(pointsSession(Number.NaN), 0);
});

test('les sessions trop courtes ne rapportent rien', () => {
  assert.equal(pointsSession(4.9), 0);
  assert.equal(pointsSession(5), 5);
});

test('une minute = un point, plus un bonus par bloc de 25 minutes', () => {
  assert.equal(pointsSession(24), 24);
  assert.equal(pointsSession(25), 30);
  assert.equal(pointsSession(60), 70);
});

test('un chrono oublié est plafonné à 4 h', () => {
  assert.equal(pointsSession(240), pointsSession(14 * 60));
  assert.equal(pointsSession(240), 240 + 9 * 5);
});

test('niveaux', () => {
  assert.equal(seuilNiveau(1), 0);
  assert.equal(seuilNiveau(2), 60);
  assert.deepEqual(niveauPour(0), { niveau: 1, dansNiveau: 0, tailleNiveau: 60 });
  assert.deepEqual(niveauPour(59), { niveau: 1, dansNiveau: 59, tailleNiveau: 60 });
  assert.deepEqual(niveauPour(60), { niveau: 2, dansNiveau: 0, tailleNiveau: 120 });
  assert.equal(niveauPour(-10).niveau, 1);
});

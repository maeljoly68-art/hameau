import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saisonPour } from '../src/core/saison.ts';

test('saisons par mois local', () => {
  assert.equal(saisonPour(new Date('2026-03-01T12:00:00+01:00')), 'printemps');
  assert.equal(saisonPour(new Date('2026-05-31T12:00:00+02:00')), 'printemps');
  assert.equal(saisonPour(new Date('2026-06-01T12:00:00+02:00')), 'ete');
  assert.equal(saisonPour(new Date('2026-09-01T12:00:00+02:00')), 'automne');
  assert.equal(saisonPour(new Date('2026-11-30T12:00:00+01:00')), 'automne');
  assert.equal(saisonPour(new Date('2026-12-01T12:00:00+01:00')), 'hiver');
  assert.equal(saisonPour(new Date('2027-02-28T12:00:00+01:00')), 'hiver');
});

test('le mois est celui de l’heure locale, pas d’UTC', () => {
  // 23 h 30 UTC le 30 novembre = 0 h 30 le 1er décembre à Paris : déjà l'hiver.
  assert.equal(saisonPour(new Date('2026-11-30T23:30:00Z')), 'hiver');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleJour, decalerJours, dureeMinutes, formatChrono, formatDuree, lundi } from '../src/core/temps.ts';

test('une session sans fin n’a pas de durée (et pas « 0 »)', () => {
  assert.equal(dureeMinutes('2026-11-01T10:00:00Z', null), null);
});

test('durée en minutes', () => {
  assert.equal(dureeMinutes('2026-11-01T10:00:00Z', '2026-11-01T10:45:00Z'), 45);
  assert.equal(dureeMinutes('pas une date', '2026-11-01T10:45:00Z'), null);
  // Fin avant début (horloges d'appareils décalées) : jamais négatif.
  assert.equal(dureeMinutes('2026-11-01T10:00:00Z', '2026-11-01T09:59:00Z'), 0);
});

test('le jour est le jour LOCAL, pas le jour UTC', () => {
  // 23 h 30 UTC le 31 octobre = 0 h 30 le 1er novembre à Paris.
  assert.equal(cleJour(new Date('2026-10-31T23:30:00Z')), '2026-11-01');
});

test('décaler d’un jour traverse le changement d’heure sans sauter de date', () => {
  // Passage à l'heure d'hiver le 25 octobre 2026 : ce jour-là dure 25 h.
  assert.equal(cleJour(decalerJours(new Date('2026-10-25T23:30:00+01:00'), -1)), '2026-10-24');
  assert.equal(cleJour(decalerJours(new Date('2026-10-24T00:10:00+02:00'), 1)), '2026-10-25');
  assert.equal(cleJour(decalerJours(new Date('2026-03-29T00:30:00+01:00'), 1)), '2026-03-30');
});

test('lundi de la semaine', () => {
  assert.equal(cleJour(lundi(new Date('2026-11-01T12:00:00+01:00'))), '2026-10-26'); // dimanche
  assert.equal(cleJour(lundi(new Date('2026-10-26T08:00:00+01:00'))), '2026-10-26'); // lundi
});

test('formats', () => {
  assert.equal(formatChrono(0), '0:00');
  assert.equal(formatChrono(65_000), '1:05');
  assert.equal(formatChrono(3_723_000), '1:02:03');
  assert.equal(formatDuree(45), '45 min');
  assert.equal(formatDuree(65), '1 h 05');
  assert.equal(formatDuree(120), '2 h');
});

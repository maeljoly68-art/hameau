import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJours, debutDuMois, ecartJours, estJour, grilleDuMois, jourSemaine, moisSuivant } from '../src/core/jours.ts';

test('un jour valide : la forme ET le calendrier', () => {
  assert.ok(estJour('2026-12-04'));
  assert.ok(estJour('2028-02-29'), 'année bissextile');
  assert.ok(!estJour('2026-02-30'));
  assert.ok(!estJour('2026-13-01'));
  assert.ok(!estJour('2026-1-5'));
  assert.ok(!estJour(20261204));
  assert.ok(!estJour(null));
});

test('ajouter des jours à travers les changements d’heure (Paris : 25 octobre et 29 mars)', () => {
  // La nuit du 25 octobre dure 25 h : 24 h × 3 depuis le 24 à minuit n'arrive pas au 27.
  assert.equal(ajouterJours('2026-10-24', 3), '2026-10-27');
  assert.equal(ajouterJours('2026-03-28', 2), '2026-03-30');
  assert.equal(ajouterJours('2026-12-31', 1), '2027-01-01');
  assert.equal(ajouterJours('2026-03-01', -1), '2026-02-28');
  assert.equal(ajouterJours('2026-11-05', 0), '2026-11-05');
});

test('l’écart de deux jours est entier, même autour d’un changement d’heure', () => {
  assert.equal(ecartJours('2026-10-24', '2026-10-27'), 3);
  assert.equal(ecartJours('2026-03-28', '2026-03-30'), 2);
  assert.equal(ecartJours('2026-12-04', '2026-11-05'), -29);
  assert.equal(ecartJours('2026-11-05', '2026-11-05'), 0);
  assert.equal(ecartJours('2026-11-05', '2026-12-04'), 29);
});

test('jour de la semaine : lundi = 0', () => {
  assert.equal(jourSemaine('2026-11-05'), 3, 'jeudi');
  assert.equal(jourSemaine('2026-11-02'), 0, 'lundi');
  assert.equal(jourSemaine('2026-11-08'), 6, 'dimanche');
});

test('la grille d’un mois : des semaines entières, du lundi au dimanche', () => {
  const g = grilleDuMois('2026-11-01');
  assert.equal(g[0], '2026-10-26', 'le 1er novembre 2026 est un dimanche : la grille commence au lundi d’avant');
  assert.equal(g.at(-1), '2026-12-06');
  assert.equal(g.length % 7, 0);
  assert.equal(g.length, 42);
  const f = grilleDuMois('2026-02-01'); // février 2026 : du dimanche 1er au samedi 28
  assert.equal(f[0], '2026-01-26');
  assert.equal(f.at(-1), '2026-03-01');
  assert.equal(f.length, 35);
});

test('mois suivant et précédent, début de mois', () => {
  assert.equal(moisSuivant('2026-11-17'), '2026-12-01');
  assert.equal(moisSuivant('2026-12-17'), '2027-01-01');
  assert.equal(moisSuivant('2026-03-31', -1), '2026-02-01');
  assert.equal(debutDuMois('2026-11-17'), '2026-11-01');
});

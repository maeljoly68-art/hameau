import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nouveauxSucces, succes } from '../src/core/succes.ts';
import { construction, session } from './aide.ts';

const un = (liste: ReturnType<typeof succes>, id: string) => liste.find((s) => s.id === id)!;

test('aucun succès au départ, et une session en cours n’en donne aucun', () => {
  const l = succes([session('2026-11-01T10:00:00+01:00', null)], [], 120);
  assert.ok(l.every((s) => !s.obtenu));
});

test('première flamme et marathon', () => {
  const l = succes([session('2026-11-01T10:00:00+01:00', 130)], [], 120);
  assert.ok(un(l, 'premiere').obtenu);
  assert.ok(un(l, 'marathon').obtenu);
  assert.ok(un(l, 'objectif').obtenu);
  assert.ok(!un(l, 'dix-heures').obtenu);
  assert.equal(un(l, 'dix-heures').actuel, 130);
});

test('la progression affichée ne dépasse pas la cible', () => {
  const l = succes([session('2026-11-01T10:00:00+01:00', 200)], [], 120);
  assert.equal(un(l, 'heure').actuel, 60);
});

test('lève-tôt et oiseau de nuit, à l’heure locale', () => {
  // 5 h 30 UTC = 6 h 30 à Paris : avant 7 h en heure locale.
  const l = succes([session('2026-11-01T05:30:00Z', 30), session('2026-11-01T22:15:00+01:00', 30)], [], 120);
  assert.ok(un(l, 'aube').obtenu);
  assert.ok(un(l, 'nuit').obtenu);
  // Trop courte : ne compte pas.
  assert.ok(!un(succes([session('2026-11-01T06:00:00+01:00', 10)], [], 120), 'aube').obtenu);
});

test('séries : c’est le record qui compte, même interrompu depuis', () => {
  const s = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10'].map((j) => session(`${j}T10:00:00+02:00`, 30));
  assert.ok(un(succes(s, [], 120), 'serie-3').obtenu);
});

test('bâtisseur', () => {
  const c = [0, 1, 3, 4].flatMap((x) => [construction('arbre', x, 0, 15)]);
  assert.ok(!un(succes([], c, 120), 'batisseur').obtenu);
  assert.ok(un(succes([], [...c, construction('arbre', 0, 1, 15)], 120), 'batisseur').obtenu);
});

test('nouveaux succès : seulement ceux qui viennent de tomber', () => {
  const avant = succes([], [], 120);
  const apres = succes([session('2026-11-01T10:00:00+01:00', 70)], [], 120);
  assert.deepEqual(nouveauxSucces(avant, apres).map((s) => s.id), ['premiere', 'heure']);
  assert.deepEqual(nouveauxSucces(apres, apres), []);
});

test('identifiants uniques', () => {
  const ids = succes([], [], 120).map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('rénovateur et chef-d’œuvre suivent les niveaux des bâtiments', () => {
  const base = [construction('maison', 0, 0, 90)];
  assert.ok(!un(succes([], base, 120), 'renovateur').obtenu);
  assert.ok(un(succes([], [construction('maison', 0, 0, 162, 2)], 120), 'renovateur').obtenu);
  assert.ok(!un(succes([], [construction('maison', 0, 0, 162, 2)], 120), 'chef-oeuvre').obtenu);
  assert.ok(un(succes([], [construction('maison', 0, 0, 306, 3)], 120), 'chef-oeuvre').obtenu);
});

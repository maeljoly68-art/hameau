import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellule, versCsv } from '../src/core/export.ts';
import { session } from './aide.ts';

test('cellules : séparateurs, guillemets et retours à la ligne protégés', () => {
  assert.equal(cellule('simple'), 'simple');
  assert.equal(cellule('a;b'), '"a;b"');
  assert.equal(cellule('il a dit "ok"'), '"il a dit ""ok"""');
  assert.equal(cellule('deux\nlignes'), '"deux\nlignes"');
});

test('cellules : pas de formule exécutée par le tableur', () => {
  assert.equal(cellule('=SOMME(A1:A9)'), "'=SOMME(A1:A9)");
  assert.equal(cellule('-relu le chapitre'), "'-relu le chapitre");
  assert.equal(cellule('@moi'), "'@moi");
});

test('CSV : en-tête, ordre chronologique, pauses déduites', () => {
  const a = { ...session('2026-11-02T10:00:00+01:00', 60, 'Code'), description: 'refonte; v2', pauseSecondes: 600, objectif: 50 };
  const b = { ...session('2026-11-01T09:00:00+01:00', 30, 'Lecture'), description: 'Deep Work' };
  const lignes = versCsv([a, b]).trimEnd().split('\r\n');
  assert.equal(lignes[0], 'Date;Début;Fin;Durée (min);Pause (min);Catégorie;Description;Objectif (min);Appareil;Points');
  assert.equal(lignes[1], '2026-11-01;09:00;09:30;30;0;Lecture;Deep Work;;test;35');
  assert.equal(lignes[2], '2026-11-02;10:00;11:00;50;10;Code;"refonte; v2";50;test;60');
});

test('CSV : une session en cours a une durée VIDE, pas zéro', () => {
  const lignes = versCsv([session('2026-11-02T10:00:00+01:00', null)]).trimEnd().split('\r\n');
  assert.equal(lignes[1], '2026-11-02;10:00;;;0;Travail;;;test;');
});

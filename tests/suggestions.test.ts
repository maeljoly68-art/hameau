import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correspond, suggestionsDescription } from '../src/core/suggestions.ts';
import { session } from './aide.ts';

const s = (jour: string, cat: string, description: string) => ({ ...session(`2026-11-${jour}T10:00:00+01:00`, 30, cat), description });

test('suggestions : les plus récentes, sans doublon, la même catégorie d’abord', () => {
  const l = [s('01', 'Code', 'Refonte'), s('02', 'Lecture', 'Deep Work'), s('03', 'Code', 'refonte '), s('04', 'Code', 'Tests'), s('05', 'Sport', '')];
  assert.deepEqual(suggestionsDescription(l, 'code', 3), ['Tests', 'refonte', 'Deep Work']);
  assert.deepEqual(suggestionsDescription(l, '', 2), ['Tests', 'refonte']);
});

test('suggestions : une session en cours ne propose rien', () => {
  assert.deepEqual(suggestionsDescription([{ ...session('2026-11-02T10:00:00+01:00', null), description: 'en cours' }], ''), []);
});

test('recherche sans accents ni majuscules, tous les mots requis', () => {
  const x = { categorie: 'Études', description: 'Révision du chapitre 4' };
  assert.ok(correspond(x, 'etudes'));
  assert.ok(correspond(x, 'REVISION chapitre'));
  assert.ok(!correspond(x, 'revision maths'));
  assert.ok(correspond(x, '   '));
});

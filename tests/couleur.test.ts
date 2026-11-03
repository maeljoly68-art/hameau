import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eclaircir, eclairer, ecart, melanger, versHex, versRgb } from '../src/core/couleur.ts';

test('lecture et écriture des couleurs', () => {
  assert.deepEqual(versRgb('#ff8000'), [255, 128, 0]);
  assert.deepEqual(versRgb('#f80'), [255, 136, 0]);
  assert.equal(versHex([255, 128, 0]), '#ff8000');
  assert.equal(versHex([300, -4, 12.6]), '#ff000d');
});

test('mélange : extrémités, milieu, et alpha conservé', () => {
  assert.equal(melanger('#000000', '#ffffff', 0), '#000000');
  assert.equal(melanger('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(melanger('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(melanger('#ffffff66', '#000000', 0.5), '#80808066');
  assert.equal(melanger('#000000', '#ffffff', 7), '#ffffff', 'borné');
});

test('éclairer : sans force ou en lumière blanche, la couleur ne change pas', () => {
  assert.equal(eclairer('#a0703f', '#34428a', 0), '#a0703f');
  assert.equal(eclairer('#a0703f', '#ffffff', 1), '#a0703f');
  assert.equal(eclairer('#a0703f', '#000000', 1), '#000000');
});

test('éclairer : la nuit bleue assombrit le rouge plus que le bleu', () => {
  const [r, , b] = versRgb(eclairer('#c0c0c0', '#34428a', 0.62));
  const [r0, , b0] = versRgb('#c0c0c0');
  assert.ok(r < r0 && b < b0);
  assert.ok(r0 - r > b0 - b);
});

test('une couleur illisible passe telle quelle au lieu de virer au noir', () => {
  assert.equal(eclairer('rgba(20,30,10,.18)', '#34428a', 0.6), 'rgba(20,30,10,.18)');
  assert.equal(eclairer('url(#halo)', '#34428a', 0.6), 'url(#halo)');
});

test('éclaircir et écart', () => {
  assert.equal(eclaircir('#000000', 1), '#ffffff');
  assert.equal(eclaircir('#ffffff', -1), '#000000');
  assert.equal(ecart('#000000', '#000000'), 0);
  assert.ok(ecart('#000000', '#ffffff') > 440);
});

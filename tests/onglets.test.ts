import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ONGLETS, ongletDansAdresse, ongletValide, sansOnglet } from '../src/core/onglets.ts';

test('seuls les onglets de la liste s’ouvrent', () => {
  for (const o of ONGLETS) assert.equal(ongletValide(o), o);
  for (const mauvais of ['', 'COURS', 'cours ', 'admin', '__proto__', 'constructor', 'toString', null, undefined, 3, {}]) assert.equal(ongletValide(mauvais), null, String(mauvais));
});

test('l’onglet demandé se lit dans l’adresse, parmi d’autres paramètres', () => {
  assert.equal(ongletDansAdresse('?onglet=cours'), 'cours');
  assert.equal(ongletDansAdresse('?a=1&onglet=reglages&b=2'), 'reglages');
  assert.equal(ongletDansAdresse('?onglet=autre'), null);
  assert.equal(ongletDansAdresse('?onglet='), null);
  assert.equal(ongletDansAdresse(''), null);
  assert.equal(ongletDansAdresse('?a=1'), null);
});

test('le paramètre onglet s’enlève de l’adresse, les autres restent', () => {
  assert.equal(sansOnglet('?onglet=cours'), '');
  assert.equal(sansOnglet('?a=1&onglet=cours&b=2'), '?a=1&b=2');
  assert.equal(sansOnglet('?a=1'), '?a=1');
  assert.equal(sansOnglet(''), '');
});

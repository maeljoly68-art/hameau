import { test } from 'node:test';
import assert from 'node:assert/strict';
import { premiersPas } from '../src/core/premiersPas.ts';
import { PROFIL_DEFAUT } from '../src/core/types.ts';
import { construction, session } from './aide.ts';

const vide = { sessions: [], constructions: [], profil: PROFIL_DEFAUT };

test('au départ, rien n’est fait', () => {
  const e = premiersPas(vide, { installee: false, synchronise: true });
  assert.deepEqual(e.map((x) => x.id), ['session', 'construction', 'nom', 'installation', 'raccourci']);
  assert.ok(e.every((x) => !x.fait));
});

test('sans compte, pas d’étape raccourci', () => {
  assert.ok(!premiersPas(vide, { installee: false, synchronise: false }).some((x) => x.id === 'raccourci'));
});

test('chaque étape se coche d’après les données', () => {
  const d = {
    sessions: [session('2026-11-02T10:00:00+01:00', 30), { ...session('2026-11-02T12:00:00+01:00', 30), appareil: 'Raccourci' }],
    constructions: [construction('arbre', 0, 0, 15)],
    profil: { ...PROFIL_DEFAUT, nomHameau: 'Bourg' },
  };
  assert.ok(premiersPas(d, { installee: true, synchronise: true }).every((x) => x.fait));
});

test('une session en cours ne compte pas comme terminée', () => {
  const e = premiersPas({ ...vide, sessions: [session('2026-11-02T10:00:00+01:00', null)] }, { installee: false, synchronise: false });
  assert.ok(!e.find((x) => x.id === 'session')!.fait);
});

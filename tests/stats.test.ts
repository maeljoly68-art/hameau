import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derniersJours, minutesAujourdhui, minutesSemaine, parCategorie, serie } from '../src/core/stats.ts';
import { session } from './aide.ts';

const maintenant = new Date('2026-11-01T09:00:00+01:00'); // dimanche matin

test('la série d’hier tient tant qu’aujourd’hui n’est pas fini', () => {
  const s = [session('2026-10-30T10:00:00+01:00', 30), session('2026-10-31T10:00:00+01:00', 30)];
  assert.equal(serie(s, maintenant), 2);
});

test('la série compte aujourd’hui quand il est validé', () => {
  const s = [session('2026-10-31T10:00:00+01:00', 30), session('2026-11-01T08:00:00+01:00', 25)];
  assert.equal(serie(s, maintenant), 2);
});

test('un jour sous le seuil casse la série', () => {
  const s = [session('2026-10-29T10:00:00+01:00', 30), session('2026-10-30T10:00:00+01:00', 10), session('2026-10-31T10:00:00+01:00', 30)];
  assert.equal(serie(s, maintenant), 1);
});

test('une session en cours ne valide pas une journée', () => {
  const s = [session('2026-11-01T08:00:00+01:00', null)];
  assert.equal(serie(s, maintenant), 0);
  assert.equal(minutesAujourdhui(s, maintenant), 0);
});

test('aujourd’hui et la semaine (du lundi)', () => {
  const s = [
    session('2026-10-25T10:00:00+01:00', 60), // dimanche précédent : hors semaine
    session('2026-10-26T10:00:00+01:00', 30),
    session('2026-11-01T08:00:00+01:00', 20),
  ];
  assert.equal(minutesAujourdhui(s, maintenant), 20);
  assert.equal(minutesSemaine(s, maintenant), 50);
});

test('derniers jours, du plus ancien à aujourd’hui, jours vides compris', () => {
  const s = [session('2026-10-31T10:00:00+01:00', 40)];
  assert.deepEqual(derniersJours(s, maintenant, 3), [
    { jour: '2026-10-30', minutes: 0 },
    { jour: '2026-10-31', minutes: 40 },
    { jour: '2026-11-01', minutes: 0 },
  ]);
});

test('par catégorie, sur la fenêtre demandée seulement', () => {
  const s = [
    session('2026-10-01T10:00:00+01:00', 500, 'Vieux'),
    session('2026-10-31T10:00:00+01:00', 30, 'Code'),
    session('2026-11-01T08:00:00+01:00', 45, 'Lecture'),
    session('2026-11-01T08:50:00+01:00', 20, ' '),
  ];
  assert.deepEqual(parCategorie(s, maintenant, 7), [
    { categorie: 'Lecture', minutes: 45 },
    { categorie: 'Code', minutes: 30 },
    { categorie: 'Sans catégorie', minutes: 20 },
  ]);
});

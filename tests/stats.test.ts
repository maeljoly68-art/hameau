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

import { bilan, calendrier, intensite, meilleureSerie, minutesSemainePrecedenteAuMemeJour } from '../src/core/stats.ts';

test('meilleure série : le record, pas la série en cours', () => {
  const s = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06'].map((j) => session(`${j}T10:00:00+02:00`, 30));
  assert.equal(meilleureSerie(s), 3);
  assert.equal(meilleureSerie([]), 0);
});

test('meilleure série : traverse le changement d’heure', () => {
  const s = ['2026-10-24', '2026-10-25', '2026-10-26'].map((j) => session(`${j}T10:00:00+01:00`, 30));
  assert.equal(meilleureSerie(s), 3);
});

test('intensité relative à l’objectif, pas au plus gros jour', () => {
  assert.equal(intensite(0, 120), 0);
  assert.equal(intensite(10, 120), 1);
  assert.equal(intensite(30, 120), 2);
  assert.equal(intensite(60, 120), 3);
  assert.equal(intensite(120, 120), 4);
  // Un marathon de 10 h ne change rien à la teinte d'une journée ordinaire.
  assert.equal(intensite(60, 120), 3);
});

test('calendrier : semaines du lundi, aujourd’hui dans la dernière, futur marqué', () => {
  const c = calendrier([session('2026-11-01T08:00:00+01:00', 40)], maintenant, 2);
  assert.equal(c.length, 2);
  assert.equal(c[0][0].jour, '2026-10-19');
  assert.equal(c[1][6].jour, '2026-11-01');
  assert.equal(c[1][6].minutes, 40);
  assert.ok(c.flat().every((j) => !j.futur));
  const mardi = calendrier([], new Date('2026-10-27T10:00:00+01:00'), 1);
  assert.deepEqual(mardi[0].map((j) => j.futur), [false, false, true, true, true, true, true]);
});

test('semaine précédente comparée au même jour, pas en entier', () => {
  const s = [
    session('2026-10-19T10:00:00+02:00', 30), // lundi précédent
    session('2026-10-22T10:00:00+02:00', 60), // jeudi précédent : hors comparaison un mardi
  ];
  assert.equal(minutesSemainePrecedenteAuMemeJour(s, new Date('2026-10-27T10:00:00+01:00')), 30);
  assert.equal(minutesSemainePrecedenteAuMemeJour(s, new Date('2026-11-01T10:00:00+01:00')), 90);
});

test('bilan : moyenne absente sans session, jamais 0', () => {
  assert.deepEqual(bilan([]), { sessions: 0, totalMinutes: 0, moyenne: null, plusLongue: null });
  const b = bilan([session('2026-11-01T08:00:00+01:00', 30), session('2026-11-01T09:00:00+01:00', 60), session('2026-11-01T11:00:00+01:00', null)]);
  assert.deepEqual(b, { sessions: 2, totalMinutes: 90, moyenne: 45, plusLongue: 60 });
});

import { concentrationParMoment, momentPour } from '../src/core/stats.ts';

test('moments de la journée', () => {
  assert.equal(momentPour(4), 'nuit');
  assert.equal(momentPour(5), 'matin');
  assert.equal(momentPour(12), 'apres-midi');
  assert.equal(momentPour(18), 'soir');
  assert.equal(momentPour(22), 'nuit');
});

test('meilleur moment : la durée MOYENNE, pas le total', () => {
  const s = [
    // Après-midi : beaucoup de sessions courtes (plus gros total).
    ...['01', '02', '03', '04', '05', '06'].map((j) => session(`2026-10-${j}T14:00:00+02:00`, 20)),
    // Matin : moins de sessions, mais longues.
    ...['01', '02', '03'].map((j) => session(`2026-10-${j}T08:00:00+02:00`, 35)),
  ];
  const r = concentrationParMoment(s);
  assert.equal(r.meilleur, 'matin');
  assert.equal(r.lignes.find((l) => l.moment === 'apres-midi')!.moyenne, 20);
});

test('meilleur moment : pas de moyenne sur un échantillon trop petit', () => {
  const s = [session('2026-10-01T23:00:00+02:00', 200), ...['01', '02', '03'].map((j) => session(`2026-10-${j}T09:00:00+02:00`, 30))];
  const r = concentrationParMoment(s);
  assert.equal(r.lignes.find((l) => l.moment === 'nuit')!.moyenne, null, 'un marathon isolé ne fait pas une moyenne');
  assert.equal(r.meilleur, 'matin');
});

test('meilleur moment : faux départs et sessions en cours exclus', () => {
  const s = [...['01', '02', '03'].map((j) => session(`2026-10-${j}T09:00:00+02:00`, 30)), session('2026-10-04T09:00:00+02:00', 2), session('2026-10-05T09:00:00+02:00', null)];
  const m = concentrationParMoment(s).lignes.find((l) => l.moment === 'matin')!;
  assert.equal(m.sessions, 3);
  assert.equal(m.moyenne, 30);
});

test('pauses déduites dans les statistiques', () => {
  const s = [{ ...session('2026-11-01T08:00:00+01:00', 60), pauseSecondes: 1800 }];
  assert.equal(minutesAujourdhui(s, maintenant), 30);
});

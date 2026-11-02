import { test } from 'node:test';
import assert from 'node:assert/strict';
import { differences, echeanceTexte, habitudesDuJour, jourDeSemaine, joursAvant, lundiDe, trierTaches, versSeances, type HabitudeSillage, type TacheSillage } from '../src/core/sillage.ts';
import { session } from './aide.ts';

const habitude = (id: string, extra: Partial<HabitudeSillage> = {}): HabitudeSillage => ({
  id,
  title: id,
  kind: 'scheduled',
  weekdays: null,
  times_per_week: null,
  started_on: null,
  archived_at: null,
  position: 0,
  ...extra,
});

// Le lundi 2 novembre 2026.
const LUNDI = '2026-11-02';

test('jours de la semaine et lundi, sans dépendre du fuseau', () => {
  assert.equal(jourDeSemaine(LUNDI), 1);
  assert.equal(jourDeSemaine('2026-11-01'), 0);
  assert.equal(lundiDe('2026-11-08'), LUNDI);
  assert.equal(lundiDe(LUNDI), LUNDI);
});

test('habitudes du jour : jours prévus, tous les jours, archivées, pas encore commencées', () => {
  const h = [
    habitude('tous-les-jours'),
    habitude('lundi-jeudi', { weekdays: [1, 4] }),
    habitude('mardi', { weekdays: [2] }),
    habitude('archivee', { archived_at: '2026-10-01T00:00:00Z' }),
    habitude('future', { started_on: '2026-12-01' }),
  ];
  assert.deepEqual(habitudesDuJour(h, [], LUNDI).map((x) => x.id), ['tous-les-jours', 'lundi-jeudi']);
});

test('une habitude cochée reste visible même un jour non prévu (pour pouvoir la décocher)', () => {
  const r = habitudesDuJour([habitude('mardi', { weekdays: [2] })], [{ habit_id: 'mardi', day: LUNDI }], LUNDI);
  assert.deepEqual(r, [{ id: 'mardi', titre: 'mardi', faite: true, semaine: null }]);
});

test('habitude flexible : attendue tant que la semaine n’est pas remplie', () => {
  const h = [habitude('sport', { kind: 'flexible', times_per_week: 2 })];
  const jeudi = '2026-11-05';
  const une = [{ habit_id: 'sport', day: '2026-11-03' }];
  assert.deepEqual(habitudesDuJour(h, une, jeudi), [{ id: 'sport', titre: 'sport', faite: false, semaine: { faites: 1, cible: 2 } }]);
  const deux = [...une, { habit_id: 'sport', day: '2026-11-04' }];
  assert.deepEqual(habitudesDuJour(h, deux, jeudi), [], 'semaine remplie : plus rien à faire');
  // La semaine précédente ne compte pas.
  const avant = [{ habit_id: 'sport', day: '2026-11-01' }, { habit_id: 'sport', day: '2026-10-31' }];
  assert.equal(habitudesDuJour(h, avant, jeudi)[0].semaine!.faites, 0);
});

test('ordre des habitudes : celui de Sillage', () => {
  const r = habitudesDuJour([habitude('b', { position: 2 }), habitude('a', { position: 1 })], [], LUNDI);
  assert.deepEqual(r.map((x) => x.id), ['a', 'b']);
});

const tache = (id: string, extra: Partial<TacheSillage> = {}): TacheSillage => ({ id, title: id, notes: null, importance: 2, due_on: null, done_at: null, estimate_min: null, ...extra });

test('tri des tâches : faites en dernier, échéance la plus proche, sans date après, puis importance', () => {
  const t = [
    tache('sans-date-haute', { importance: 3 }),
    tache('faite', { due_on: '2026-10-01', done_at: '2026-11-01T10:00:00Z' }),
    tache('demain', { due_on: '2026-11-03' }),
    tache('en-retard', { due_on: '2026-10-30' }),
    tache('sans-date-basse', { importance: 1 }),
    tache('sans-date-sans-niveau', { importance: null }),
  ];
  assert.deepEqual(trierTaches(t, LUNDI).map((x) => x.id), ['en-retard', 'demain', 'sans-date-haute', 'sans-date-sans-niveau', 'sans-date-basse', 'faite']);
});

test('échéances lisibles', () => {
  assert.equal(joursAvant(null, LUNDI), null);
  assert.equal(joursAvant('pas une date', LUNDI), null);
  assert.equal(echeanceTexte('2026-10-30', LUNDI), 'en retard de 3 j');
  assert.equal(echeanceTexte('2026-11-01', LUNDI), 'en retard d’un jour');
  assert.equal(echeanceTexte(LUNDI, LUNDI), 'aujourd’hui');
  assert.equal(echeanceTexte('2026-11-03', LUNDI), 'demain');
  assert.equal(echeanceTexte('2026-11-07', LUNDI), 'dans 5 j');
  assert.equal(echeanceTexte('2026-11-20', LUNDI), '20 nov.');
});

test('séances envoyées : closes seulement, pauses déduites, catégorie en objet', () => {
  const s = [
    { ...session('2026-11-02T09:00:00+01:00', 60, 'Code'), description: 'Refonte', pauseSecondes: 600, objectif: 50 },
    session('2026-11-02T11:00:00+01:00', null),
    { ...session('2026-11-02T12:00:00+01:00', 30, ' '), objectif: 45 },
  ];
  const r = versSeances(s);
  assert.equal(r.length, 2, 'la session en cours n’est pas envoyée');
  assert.deepEqual(r[0], { external_id: s[0].id, started_at: '2026-11-02T08:00:00.000Z', ended_at: '2026-11-02T09:00:00.000Z', minutes: 50, objet: 'Code', note: 'Refonte', fin_raison: 'objectif atteint', xp: 60 });
  assert.equal(r[1].objet, null, 'catégorie vide = pas d’objet, pas une chaîne blanche');
  assert.equal(r[1].fin_raison, 'avant l’objectif');
});

test('séances envoyées : un chrono oublié plus de 24 h est écarté, pas tronqué', () => {
  assert.deepEqual(versSeances([session('2026-11-01T09:00:00+01:00', 1500)]), []);
});

test('différences : nouvelles, modifiées, inchangées, supprimées', () => {
  const base = versSeances([session('2026-11-02T09:00:00+01:00', 30), session('2026-11-02T10:00:00+01:00', 40)]);
  const [a, b] = base;
  const distantes = [
    // a identique, au format renvoyé par la base (fuseau explicite).
    { ...a, started_at: a.started_at.replace('.000Z', '+00:00'), ended_at: a.ended_at.replace('.000Z', '+00:00') },
    // b modifiée chez Hameau depuis le dernier envoi.
    { ...b, note: 'ancienne description' },
    // c supprimée de Hameau.
    { ...a, external_id: 'c' },
  ];
  const d = differences(base, distantes);
  assert.deepEqual(d.aEcrire.map((x) => x.external_id), [b.external_id]);
  assert.deepEqual(d.aSupprimer, ['c']);
  assert.deepEqual(differences(base, []).aEcrire.length, 2);
});

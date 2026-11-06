import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chapitre } from '../src/core/cours.ts';
import { arrondi5, libellePages, numerosDePages, regrouper, sansCoupure } from '../src/core/pages.ts';
import type { Seance } from '../src/core/planning.ts';

const chap = (coursId: string, ordre: number, extra: Partial<Chapitre> = {}): Chapitre => ({ id: `${coursId}-${ordre}`, coursId, titre: `Ch ${ordre}`, ordre, dureeMin: 30, niveau: 0, derniere: null, prochaine: null, lien: null, ...extra });
const sea = (coursId: string, ordre: number, extra: Partial<Seance> = {}): Seance => ({ jour: '2026-11-05', coursId, chapitreId: `${coursId}-${ordre}`, type: 'decouverte', minutes: 30, raison: 'À découvrir', suite: false, complete: true, retard: 0, fragile: false, ...extra });

test('le numéro d’une page est son rang dans le cours, en partant de 1, quel que soit l’ordre reçu', () => {
  const n = numerosDePages([chap('B', 5), chap('A', 7), chap('A', 2), chap('B', 1), chap('A', 4)]);
  assert.equal(n.get('A-2'), 1);
  assert.equal(n.get('A-4'), 2);
  assert.equal(n.get('A-7'), 3);
  assert.equal(n.get('B-1'), 1, 'chaque cours recommence à 1');
  assert.equal(n.get('B-5'), 2);
  // C'est l'ordre du cours qui fait le numéro, pas l'identifiant.
  const inverse = numerosDePages([{ ...chap('D', 0), id: 'z' }, { ...chap('D', 1), id: 'a' }]);
  assert.equal(inverse.get('z'), 1);
  assert.equal(inverse.get('a'), 2);
  // À ordre égal : l'identifiant tranche, comme dans le calendrier.
  const egal = numerosDePages([{ ...chap('C', 0), id: 'z' }, { ...chap('C', 0), id: 'a' }]);
  assert.equal(egal.get('a'), 1);
  assert.equal(egal.get('z'), 2);
});

test('« pages 1 à 7 » : les suites de trois pages ou plus se résument, le reste se liste', () => {
  assert.equal(libellePages([3]), 'Page 3');
  assert.equal(libellePages([1, 2]), 'Pages 1 et 2');
  assert.equal(libellePages([2, 5]), 'Pages 2 et 5');
  assert.equal(libellePages([1, 2, 3]), 'Pages 1 à 3');
  assert.equal(libellePages([1, 2, 3, 4, 5, 6, 7]), 'Pages 1 à 7');
  assert.equal(libellePages([1, 2, 3, 6]), 'Pages 1 à 3 et 6');
  assert.equal(libellePages([1, 2, 5]), 'Pages 1, 2 et 5');
  assert.equal(libellePages([1, 2, 3, 6, 9, 10, 11]), 'Pages 1 à 3, 6 et 9 à 11');
  assert.equal(libellePages([7, 3, 1, 2, 3]), 'Pages 1 à 3 et 7', 'désordre et doublons');
  assert.equal(libellePages([]), '');
});

test('une durée annoncée à 5 minutes près, jamais sous 5', () => {
  assert.equal(arrondi5(52), 50);
  assert.equal(arrondi5(53), 55);
  assert.equal(arrondi5(2), 5);
  assert.equal(arrondi5(0), 5);
  assert.equal(arrondi5(60), 60);
});

test('les lectures qui se suivent forment un bloc : pages, minutes, chapitres dans l’ordre du cours', () => {
  const chapitres = Array.from({ length: 9 }, (_, i) => chap('A', i));
  const seances = [sea('A', 0), sea('A', 1, { minutes: 20 }), sea('A', 2, { minutes: 25 })];
  const [bloc, ...autres] = regrouper(seances, chapitres);
  assert.deepEqual(autres, []);
  assert.deepEqual(bloc.chapitreIds, ['A-0', 'A-1', 'A-2']);
  assert.deepEqual(bloc.pages, [1, 2, 3]);
  assert.equal(bloc.minutes, 75);
  assert.equal(bloc.type, 'decouverte');
  assert.equal(bloc.coursId, 'A');
  assert.equal(bloc.jour, '2026-11-05');
  assert.equal(bloc.raison, 'À découvrir');
  assert.equal(libellePages(bloc.pages), 'Pages 1 à 3');
});

test('l’ordre reçu ne change pas les pages d’un bloc', () => {
  const chapitres = Array.from({ length: 4 }, (_, i) => chap('A', i));
  const [bloc] = regrouper([sea('A', 3), sea('A', 0), sea('A', 2)], chapitres);
  assert.deepEqual(bloc.pages, [1, 3, 4]);
  assert.deepEqual(bloc.chapitreIds, ['A-0', 'A-2', 'A-3']);
});

test('lire, revoir, relire et le dernier passage ne se mélangent pas, ni deux cours', () => {
  const chapitres = [...Array.from({ length: 4 }, (_, i) => chap('A', i)), ...Array.from({ length: 2 }, (_, i) => chap('B', i))];
  const blocs = regrouper(
    [sea('A', 0), sea('A', 1, { type: 'revision', raison: 'Révision espacée (niveau 2)' }), sea('B', 0), sea('A', 2, { type: 'relecture', raison: 'Relecture' }), sea('A', 3, { type: 'consolidation', raison: 'Dernier passage avant le partiel' })],
    chapitres,
  );
  assert.deepEqual(blocs.map((b) => `${b.coursId}:${b.type}`), ['A:decouverte', 'A:revision', 'B:decouverte', 'A:relecture', 'A:consolidation'], 'dans l’ordre où le calendrier les a placés');
});

test('seules les pages dont la séance est finie comptent pour lues quand on valide le bloc', () => {
  const chapitres = Array.from({ length: 3 }, (_, i) => chap('A', i));
  const [bloc] = regrouper([sea('A', 0), sea('A', 1), sea('A', 2, { minutes: 15, complete: false, suite: false })], chapitres);
  assert.deepEqual(bloc.chapitreIds, ['A-0', 'A-1', 'A-2']);
  assert.deepEqual(bloc.termines, ['A-0', 'A-1'], 'la page 3 est coupée : elle se finit un autre jour');
  assert.equal(bloc.minutes, 75);
  const [suite] = regrouper([sea('A', 0, { suite: true, raison: 'Suite de la lecture' })], chapitres);
  assert.equal(suite.suite, true);
  assert.equal(suite.raison, 'Suite de la lecture');
});

test('un bloc de lecture garde la raison d’une lecture neuve plutôt que celle d’une suite', () => {
  const chapitres = Array.from({ length: 3 }, (_, i) => chap('A', i));
  const [bloc] = regrouper([sea('A', 0, { suite: true, raison: 'Suite de la lecture' }), sea('A', 1, { raison: 'À découvrir avant le partiel (dans 12 j)' })], chapitres);
  assert.equal(bloc.raison, 'À découvrir avant le partiel (dans 12 j)');
  assert.equal(bloc.suite, true, 'mais le bloc sait qu’il contient une suite');
});

test('plusieurs révisions : le plus gros retard parle, sinon « révision espacée » sans niveau', () => {
  const chapitres = Array.from({ length: 3 }, (_, i) => chap('A', i));
  const rev = (ordre: number, retard: number, niveau: number) => sea('A', ordre, { type: 'revision', minutes: 10, retard, raison: retard > 0 ? `En retard de ${retard} j` : `Révision espacée (niveau ${niveau})` });
  const [retarde] = regrouper([rev(0, 0, 2), rev(1, 3, 3), rev(2, 1, 4)], chapitres);
  assert.equal(retarde.retard, 3);
  assert.equal(retarde.raison, 'En retard de 3 j');
  const [aTemps] = regrouper([rev(0, 0, 2), rev(1, 0, 3)], chapitres);
  assert.equal(aTemps.retard, 0);
  assert.equal(aTemps.raison, 'Révision espacée');
  const [seule] = regrouper([rev(0, 0, 2)], chapitres);
  assert.equal(seule.raison, 'Révision espacée (niveau 2)', 'une seule page : sa raison exacte');
  const [seuleRetard] = regrouper([rev(1, 2, 2)], chapitres);
  assert.equal(seuleRetard.raison, 'En retard de 2 j');
});

test('sans séance, rien', () => {
  assert.deepEqual(regrouper([], [chap('A', 0)]), []);
});

test('un nombre et son unité ne se séparent pas à la ligne ; « 3 jours » reste intact', () => {
  assert.equal(sansCoupure('En retard de 3 j'), 'En retard de 3\u00a0j');
  assert.equal(sansCoupure('À découvrir avant le partiel (dans 28 j)'), 'À découvrir avant le partiel (dans 28\u00a0j)');
  assert.equal(sansCoupure('Lecture · ≈ 40 min · '), 'Lecture · ≈ 40\u00a0min · ');
  assert.equal(sansCoupure('≈ 1 h 20'), '≈ 1\u00a0h 20');
  assert.equal(sansCoupure('dans 3 jours, 2 heures, 5 minutes'), 'dans 3 jours, 2 heures, 5 minutes');
  assert.equal(sansCoupure('Pages 1 à 3'), 'Pages 1 à 3');
  assert.equal(sansCoupure('42 jj'), '42 jj', 'une lettre de plus : pas une unité');
});

test('un bloc est fragile dès qu’une de ses pages l’est', () => {
  const chapitres = Array.from({ length: 3 }, (_, i) => chap('A', i));
  assert.equal(regrouper([sea('A', 0), sea('A', 1), sea('A', 2)], chapitres)[0].fragile, false);
  assert.equal(regrouper([sea('A', 0), sea('A', 1, { fragile: true }), sea('A', 2)], chapitres)[0].fragile, true);
  assert.equal(regrouper([sea('A', 0, { fragile: true })], chapitres)[0].fragile, true);
});

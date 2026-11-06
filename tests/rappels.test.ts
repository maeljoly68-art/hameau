import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOUR_MOIS_MAX, JOUR_MOIS_MIN, TITRE_RAPPEL_MAX, echeanceDuMois, estDu, rappelValide, rappelsDus, type RappelMensuel } from '../src/core/rappels.ts';

const r = (jourDuMois: number, faitLe: string | null, extra: Partial<RappelMensuel> = {}): RappelMensuel => ({ id: `r${jourDuMois}${faitLe ?? ''}`, titre: 'Remplir mon rapport du mois sur Studea', jourDuMois, faitLe, lien: null, ...extra });

test('un rappel mensuel est dû à partir de son jour du mois, et chaque jour ensuite tant qu’il n’est pas fait', () => {
  const rapport = r(1, null);
  assert.equal(estDu(rapport, '2026-11-01'), true, 'le jour dit');
  assert.equal(estDu(rapport, '2026-11-02'), true, 'le lendemain');
  assert.equal(estDu(rapport, '2026-11-17'), true, 'au milieu du mois');
  assert.equal(estDu(rapport, '2026-11-30'), true, 'le dernier jour');
  const le15 = r(15, null);
  assert.equal(estDu(le15, '2026-11-14'), false, 'la veille du jour dit');
  assert.equal(estDu(le15, '2026-11-15'), true);
  assert.equal(estDu(le15, '2026-11-16'), true);
});

test('fait ce mois-ci, il n’est plus dû jusqu’au mois suivant, où il revient', () => {
  const fait = r(1, '2026-11-03');
  for (const j of ['2026-11-03', '2026-11-04', '2026-11-30']) assert.equal(estDu(fait, j), false, j);
  assert.equal(estDu(fait, '2026-12-01'), true, 'le 1er décembre, il revient');
  assert.equal(estDu(fait, '2026-12-02'), true);
  assert.equal(estDu(r(1, '2026-12-01'), '2026-12-05'), false, 'fait le jour même');
  assert.equal(estDu(r(1, '2026-11-01'), '2026-11-01'), false, 'fait le jour dit, le jour dit');
});

test('fait le mois dernier : encore dû ce mois-ci ; fait avant son jour du mois : dû à son jour', () => {
  assert.equal(estDu(r(1, '2026-10-30'), '2026-11-01'), true, 'le 30 octobre ne vaut pas pour novembre');
  assert.equal(estDu(r(1, '2026-10-31'), '2026-11-01'), true);
  assert.equal(estDu(r(10, '2026-11-05'), '2026-11-10'), true, 'fait le 5 : avant le 10, il n’était pas encore dû, il l’est le 10');
  assert.equal(estDu(r(10, '2026-11-10'), '2026-11-10'), false);
});

test('une année qui change : le rappel du 1er janvier revient bien', () => {
  assert.equal(estDu(r(1, '2026-12-20'), '2027-01-01'), true);
  assert.equal(estDu(r(1, '2027-01-02'), '2027-01-31'), false);
  assert.equal(estDu(r(28, null), '2027-02-28'), true, 'le 28 existe tous les mois, février compris');
  assert.equal(estDu(r(28, null), '2027-02-27'), false);
});

test('l’échéance du mois : toujours dans le mois en cours, sur deux chiffres', () => {
  assert.equal(echeanceDuMois(1, '2026-11-17'), '2026-11-01');
  assert.equal(echeanceDuMois(28, '2026-02-03'), '2026-02-28');
  assert.equal(echeanceDuMois(9, '2027-01-31'), '2027-01-09');
  assert.equal(JOUR_MOIS_MIN, 1);
  assert.equal(JOUR_MOIS_MAX, 28);
});

test('les rappels dus : le plus ancien d’abord, à jour égal par titre, avec le jour depuis lequel ils sont dus', () => {
  const liste = [r(10, null, { id: 'c', titre: 'Zèbre' }), r(1, null, { id: 'b', titre: 'Beta' }), r(1, null, { id: 'a', titre: 'Alpha' }), r(20, null, { id: 'd' }), r(5, '2026-11-06', { id: 'e' })];
  const dus = rappelsDus(liste, '2026-11-12');
  assert.deepEqual(dus.map((d) => [d.rappel.id, d.depuis]), [['a', '2026-11-01'], ['b', '2026-11-01'], ['c', '2026-11-10']], 'pas le 20 (pas encore), pas le 5 (fait)');
  assert.deepEqual(rappelsDus([], '2026-11-12'), []);
  assert.deepEqual(rappelsDus(liste, '2026-11-12'), rappelsDus([...liste].reverse(), '2026-11-12'), 'l’ordre reçu ne change rien');
});

test('un rappel lu : chaque champ est vérifié, une ligne illisible est écartée', () => {
  const ok = { id: 'x', titre: 'Rapport Studea', jourDuMois: 1, faitLe: '2026-11-03', lien: 'https://exemple.fr/rapport' };
  assert.deepEqual(rappelValide(ok), ok);
  for (const casse of [null, undefined, 'x', 3, [], { ...ok, id: 4 }, { ...ok, titre: 3 }, { ...ok, titre: '   ' }, { ...ok, jourDuMois: 0 }, { ...ok, jourDuMois: 29 }, { ...ok, jourDuMois: 1.5 }, { ...ok, jourDuMois: '1' }, { ...ok, jourDuMois: undefined }]) assert.equal(rappelValide(casse), null, JSON.stringify(casse));
  assert.equal(rappelValide({ ...ok, jourDuMois: 28 })!.jourDuMois, 28);
  assert.equal(rappelValide({ ...ok, jourDuMois: 1 })!.jourDuMois, 1);
  assert.equal(rappelValide({ ...ok, titre: '  Rapport  ' })!.titre, 'Rapport', 'espaces retirés');
  assert.equal(TITRE_RAPPEL_MAX, 120);
  assert.equal(rappelValide({ ...ok, titre: 'x'.repeat(200) })!.titre.length, 120, 'comme la base : 120 caractères au plus');
  assert.equal(rappelValide({ ...ok, faitLe: '2026-02-30' })!.faitLe, null, 'date impossible : jamais fait');
  assert.equal(rappelValide({ ...ok, faitLe: null })!.faitLe, null);
  assert.equal(rappelValide({ ...ok, lien: 'http://exemple.fr' })!.lien, null, 'https seulement');
  assert.equal(rappelValide({ ...ok, lien: 'javascript:alert(1)' })!.lien, null);
  assert.equal(rappelValide({ ...ok, lien: 'https://exemple.fr/un lien' })!.lien, null, 'pas d’espace');
  assert.equal(rappelValide({ ...ok, lien: 'https://exemple.fr/' + 'x'.repeat(500) })!.lien, null, 'plus de 500 caractères');
  assert.equal(rappelValide({ ...ok, lien: undefined })!.lien, null);
});

test('le lien d’un rappel : 500 caractères au plus, https seulement', () => {
  const base = { id: 'x', titre: 'Rapport', jourDuMois: 1, faitLe: null };
  assert.equal(rappelValide({ ...base, lien: 'https://' + 'x'.repeat(492) })!.lien!.length, 500, '500 caractères : accepté');
  assert.equal(rappelValide({ ...base, lien: 'https://' + 'x'.repeat(493) })!.lien, null, '501 caractères : refusé');
});

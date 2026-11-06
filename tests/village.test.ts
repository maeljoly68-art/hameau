import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE, FEU, casesDeplacement, refusConstruction, refusDeplacement, solde, tailleTerrain } from '../src/core/village.ts';
import { construction, session } from './aide.ts';

test('le solde = points gagnés − coûts PAYÉS, pas les prix du catalogue', () => {
  const s = [session('2026-11-01T10:00:00+01:00', 60)]; // 70 points
  // Le chêne coûte 15 aujourd'hui ; celui-ci a été payé 12.
  assert.equal(solde(s, [construction('arbre', 0, 0, 12)]), 58);
});

test('une session en cours ne crédite rien', () => {
  assert.equal(solde([session('2026-11-01T10:00:00+01:00', null)], []), 0);
});

test('le terrain grandit avec le niveau, sans dépasser 11', () => {
  assert.equal(tailleTerrain(1), 5);
  assert.equal(tailleTerrain(3), 6);
  assert.equal(tailleTerrain(99), 11);
});

test('le feu de camp est dans le terrain de départ', () => {
  assert.ok(FEU.x < tailleTerrain(1) && FEU.y < tailleTerrain(1));
});

test('refus de construction', () => {
  const etat = { niveau: 1, solde: 100, constructions: [construction('arbre', 0, 0, 15)] };
  assert.equal(refusConstruction('arbre', 1, 0, etat), null);
  assert.equal(refusConstruction('licorne', 1, 0, etat), 'inconnu');
  assert.equal(refusConstruction('moulin', 1, 0, etat), 'niveau');
  assert.equal(refusConstruction('arbre', 0, 0, etat), 'occupee');
  assert.equal(refusConstruction('arbre', FEU.x, FEU.y, etat), 'occupee');
  assert.equal(refusConstruction('arbre', 5, 0, etat), 'hors-terrain');
  assert.equal(refusConstruction('arbre', 1.5, 0, etat), 'hors-terrain');
  assert.equal(refusConstruction('cabane', 1, 0, { ...etat, solde: 39 }), 'solde');
});

test('catalogue : identifiants uniques, chaque bâtiment est atteignable', () => {
  const ids = CATALOGUE.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(CATALOGUE.some((b) => b.niveauRequis === 1), 'il faut pouvoir construire dès le début');
});

import { population } from '../src/core/village.ts';

test('population : seuls les toits logent des habitants', () => {
  assert.equal(population([]), 1);
  assert.equal(population([construction('arbre', 0, 0, 15), construction('fleurs', 1, 0, 10)]), 1);
  assert.equal(population([construction('cabane', 0, 0, 40), construction('maison', 1, 0, 90)]), 4);
});

import { coutAmelioration, habitants, niveauRequisAmelioration, niveauValide, refusAmelioration, batiment, NIVEAU_MAX } from '../src/core/village.ts';

test('améliorer : un prix par palier, aucun au-delà du niveau 3', () => {
  const maison = batiment('maison')!;
  assert.equal(coutAmelioration(maison, 1), 72);
  assert.equal(coutAmelioration(maison, 2), 144);
  assert.equal(coutAmelioration(maison, NIVEAU_MAX), null);
});

test('améliorer : le village doit avoir grandi, et le solde suffire', () => {
  const maison = batiment('maison')!; // niveau requis 3
  assert.equal(niveauRequisAmelioration(maison, 2), 4);
  assert.equal(niveauRequisAmelioration(maison, 3), 6);
  const c = construction('maison', 0, 0, 90);
  assert.equal(refusAmelioration(c, { niveau: 4, solde: 72 }), null);
  assert.equal(refusAmelioration(c, { niveau: 3, solde: 500 }), 'niveau');
  assert.equal(refusAmelioration(c, { niveau: 4, solde: 71 }), 'solde');
  assert.equal(refusAmelioration(construction('maison', 0, 0, 306, 3), { niveau: 99, solde: 9999 }), 'max');
  assert.equal(refusAmelioration(construction('licorne', 0, 0, 1), { niveau: 99, solde: 9999 }), 'inconnu');
  // Au niveau 2, la marche suivante demande plus de village et plus de points.
  assert.equal(refusAmelioration(construction('maison', 0, 0, 162, 2), { niveau: 5, solde: 9999 }), 'niveau');
  assert.equal(refusAmelioration(construction('maison', 0, 0, 162, 2), { niveau: 6, solde: 143 }), 'solde');
});

test('les points d’une amélioration restent dépensés : le coût du bâtiment les cumule', () => {
  const s = [session('2026-11-01T10:00:00+01:00', 240)]; // 240 + 9 × 5 = 285 points
  // Maison construite 90, améliorée pour 72 : 162 investis.
  assert.equal(solde(s, [construction('maison', 0, 0, 162, 2)]), 285 - 162);
});

test('chaque amélioration loge un habitant de plus, sous un toit seulement', () => {
  assert.equal(habitants('maison', 1), 2);
  assert.equal(habitants('maison', 3), 4);
  assert.equal(habitants('arbre', 3), 0);
  assert.equal(population([construction('cabane', 0, 0, 40, 2), construction('fleurs', 1, 0, 26, 3)]), 3);
});

test('un niveau absent ou abîmé (données d’avant les améliorations) vaut 1', () => {
  assert.equal(niveauValide(undefined), 1);
  assert.equal(niveauValide(null), 1);
  assert.equal(niveauValide(2), 2);
  assert.equal(niveauValide(7), 1);
  assert.equal(niveauValide(2.5), 1);
  assert.equal(habitants('maison', Number.NaN), 2);
});

test('chaque bâtiment décrit ses deux améliorations', () => {
  for (const b of CATALOGUE) assert.ok(b.ameliorations.every((t) => t.length > 3), b.id);
});

import { accord } from '../src/core/village.ts';

test('les messages s’accordent avec le nom du bâtiment', () => {
  assert.equal(accord(batiment('maison'), 'démoli'), 'démolie');
  assert.equal(accord(batiment('moulin'), 'démoli'), 'démoli');
  assert.equal(accord(batiment('tour'), 'amélioré'), 'améliorée');
  assert.equal(accord(undefined, 'construit'), 'construit');
});

test('déplacer : seule compte la case — libre, dans le terrain, ni le feu ni un autre bâtiment ni la sienne', () => {
  const a = construction('arbre', 0, 0, 15);
  const b = construction('cabane', 1, 0, 40);
  const etat = { niveau: 1, constructions: [a, b] };
  assert.equal(refusDeplacement(a, 0, 1, etat), null, 'case libre');
  assert.equal(refusDeplacement(a, 4, 4, etat), null, 'dernière case du terrain de départ');
  assert.equal(refusDeplacement(a, 1, 0, etat), 'occupee', 'un autre bâtiment');
  assert.equal(refusDeplacement(a, 0, 0, etat), 'occupee', 'sa propre case n’est pas une destination');
  assert.equal(refusDeplacement(a, FEU.x, FEU.y, etat), 'occupee', 'le feu de camp');
  assert.equal(refusDeplacement(a, 5, 0, etat), 'hors-terrain');
  assert.equal(refusDeplacement(a, 0, 5, etat), 'hors-terrain');
  assert.equal(refusDeplacement(a, -1, 0, etat), 'hors-terrain');
  assert.equal(refusDeplacement(a, 0, -1, etat), 'hors-terrain');
  assert.equal(refusDeplacement(a, 1.5, 0, etat), 'hors-terrain');
  assert.equal(refusDeplacement(a, Number.NaN, 0, etat), 'hors-terrain');
  // Le terrain grandit avec le niveau : la case (5, 0) n'existe qu'à partir du niveau 3.
  assert.equal(refusDeplacement(a, 5, 0, { ...etat, niveau: 3 }), null);
  // Libérer une case la rend disponible : sans b, (1, 0) est libre.
  assert.equal(refusDeplacement(a, 1, 0, { niveau: 1, constructions: [a] }), null);
  // Son bâtiment n'est plus dans la liste (supprimé ailleurs) : sa case reste refusée, ce n'est pas un déplacement.
  assert.equal(refusDeplacement(a, 0, 0, { niveau: 1, constructions: [] }), 'occupee');
});

test('déplacer ne coûte rien ni ne demande de niveau : le village le plus petit suffit, même à court de points', () => {
  const moulin = construction('moulin', 0, 1, 200, 3);
  assert.equal(refusDeplacement(moulin, 1, 1, { niveau: 1, constructions: [moulin] }), null);
});

test('les cases proposées pour un déplacement : exactement les libres, ni la sienne ni le feu', () => {
  const a = construction('arbre', 0, 0, 15);
  const etat = { niveau: 1, constructions: [a, construction('cabane', 1, 0, 40), construction('fleurs', 3, 3, 10)] };
  const cases = casesDeplacement(a, etat);
  const t = tailleTerrain(1);
  assert.equal(cases.size, t * t - 1 /* feu */ - 3 /* les trois bâtiments, le sien compris */);
  for (const interdite of ['0,0', '1,0', '3,3', `${FEU.x},${FEU.y}`, '5,0', '-1,0']) assert.ok(!cases.has(interdite), interdite);
  for (const libre of ['0,1', '4,4', '2,3']) assert.ok(cases.has(libre), libre);
  assert.equal(casesDeplacement(a, { ...etat, niveau: 3 }).size, 6 * 6 - 1 - 3);
});

test('« déplacé » s’accorde avec le nom du bâtiment', () => {
  assert.equal(accord(CATALOGUE.find((b) => b.id === 'cabane'), 'déplacé'), 'déplacée');
  assert.equal(accord(CATALOGUE.find((b) => b.id === 'arbre'), 'déplacé'), 'déplacé');
});

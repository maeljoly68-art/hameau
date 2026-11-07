import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISPONIBILITES_DEFAUT, DUREE_DEFAUT_MIN, REDUCTION_DEFAUT, REDUCTION_MAX, RELECTURE_MAX, VITESSE_MAX, VITESSE_MIN, disponibilitesValides, dureeValide, joursAvantPartiel, lienValide, lignesVersChapitres, maitriseCours, type Chapitre } from '../src/core/cours.ts';

const ch = (niveau: number): Chapitre => ({ id: String(niveau), coursId: 'c', titre: 't', ordre: 0, dureeMin: 20, niveau, derniere: null, prochaine: null, lien: null, parCoeur: false });

test('liste de chapitres collée : une ligne, un chapitre', () => {
  const r = lignesVersChapitres('Fiche 1 · Bases\n\nFiche 2 · SAS\r\n  Fiche 3  \n');
  assert.deepEqual(r.map((x) => x.titre), ['Fiche 1 · Bases', 'Fiche 2 · SAS', 'Fiche 3']);
  assert.ok(r.every((x) => x.dureeMin === DUREE_DEFAUT_MIN));
});

test('la durée se donne après « | » ou « ; », jamais en fin de ligne nue', () => {
  const r = lignesVersChapitres('Fiche 3 | 45\nTD 2 ; 30 min\nFiche 4');
  assert.deepEqual(r.map((x) => [x.titre, x.dureeMin]), [['Fiche 3', 45], ['TD 2', 30], ['Fiche 4', DUREE_DEFAUT_MIN]]);
  // « Fiche 3 » finit par un nombre : c'est son nom, pas une durée de 3 minutes.
  assert.equal(lignesVersChapitres('Fiche 3')[0].titre, 'Fiche 3');
});

test('les puces sont retirées, les numéros du titre non', () => {
  const r = lignesVersChapitres('- 1.1 Définition\n• 1.2 Missions\n* Résumé');
  assert.deepEqual(r.map((x) => x.titre), ['1.1 Définition', '1.2 Missions', 'Résumé']);
});

test('durées bornées, titres tronqués, nombre de lignes plafonné', () => {
  assert.equal(lignesVersChapitres('A | 2')[0].dureeMin, 5);
  assert.equal(lignesVersChapitres('A | 999')[0].dureeMin, 240);
  assert.equal(lignesVersChapitres('x'.repeat(300))[0].titre.length, 120);
  assert.equal(lignesVersChapitres(Array.from({ length: 150 }, (_, i) => `Ch ${i}`).join('\n')).length, 100);
  assert.deepEqual(lignesVersChapitres('| 30\n   \n'), [], 'une ligne sans titre ne crée rien');
});

test('durée lue : absurde → valeur par défaut, sinon bornée', () => {
  assert.equal(dureeValide(NaN), DUREE_DEFAUT_MIN);
  assert.equal(dureeValide('30'), DUREE_DEFAUT_MIN);
  assert.equal(dureeValide(1), 5);
  assert.equal(dureeValide(60.4), 60);
});

test('disponibilités : un jour absurde revient à son défaut, les autres sont gardés', () => {
  const d = disponibilitesValides({ semaine: [30, -5, 9000, 'x', 45, null, 120], libres: ['2026-12-24', 'pas un jour', '2026-12-24', '2026-02-30', '2026-12-25'] });
  assert.deepEqual(d.semaine, [30, DISPONIBILITES_DEFAUT.semaine[1], DISPONIBILITES_DEFAUT.semaine[2], DISPONIBILITES_DEFAUT.semaine[3], 45, DISPONIBILITES_DEFAUT.semaine[5], 120]);
  assert.deepEqual(d.libres, ['2026-12-24', '2026-12-25'], 'sans doublon, sans date impossible, triés');
  assert.deepEqual(disponibilitesValides(null), DISPONIBILITES_DEFAUT);
  assert.deepEqual(disponibilitesValides({ semaine: 'oups' }), DISPONIBILITES_DEFAUT);
});

test('maîtrise d’un cours : moyenne des chapitres, 0 sans chapitre', () => {
  assert.equal(maitriseCours([]), 0);
  assert.equal(maitriseCours([ch(0), ch(6)]), 50);
  assert.equal(maitriseCours([ch(3), ch(3), ch(3)]), 50);
});

test('jours avant le partiel', () => {
  assert.equal(joursAvantPartiel({ partiel: '2026-12-04' }, '2026-11-05'), 29);
  assert.equal(joursAvantPartiel({ partiel: null }, '2026-11-05'), null);
  assert.equal(joursAvantPartiel({ partiel: '2026-11-01' }, '2026-11-05'), -4);
});

test('adresse d’artefact : https seulement', () => {
  assert.equal(lienValide(' https://claude.ai/artifact/abc '), 'https://claude.ai/artifact/abc');
  assert.equal(lienValide('http://claude.ai/x'), null);
  assert.equal(lienValide('javascript:alert(1)'), null);
  assert.equal(lienValide('https://a b'), null);
  assert.equal(lienValide(''), null);
});

test('la réduction les jours de cours : celle qui est enregistrée si elle est valable, sinon la valeur par défaut', () => {
  assert.equal(disponibilitesValides({ reduction: 30 }).reduction, 30);
  assert.equal(disponibilitesValides({ reduction: 0 }).reduction, 0, '0 % est un vrai choix');
  assert.equal(disponibilitesValides({ reduction: REDUCTION_MAX }).reduction, REDUCTION_MAX);
  assert.equal(disponibilitesValides({ reduction: 33.4 }).reduction, 33);
  for (const v of [REDUCTION_MAX + 1, -1, Number.NaN, Infinity, 'beaucoup', null, undefined]) assert.equal(disponibilitesValides({ reduction: v }).reduction, REDUCTION_DEFAUT, String(v));
  assert.equal(disponibilitesValides({ semaine: [1, 2, 3, 4, 5, 6, 7] }).reduction, REDUCTION_DEFAUT, 'réglages d’avant l’emploi du temps');
});

test('la relecture des jours de cours : en minutes entières, de 0 au plafond, sinon 0 (pas de relecture)', () => {
  assert.equal(disponibilitesValides({ relecture: 30 }).relecture, 30);
  assert.equal(disponibilitesValides({ relecture: 0 }).relecture, 0);
  assert.equal(disponibilitesValides({ relecture: RELECTURE_MAX }).relecture, RELECTURE_MAX);
  assert.equal(disponibilitesValides({ relecture: 29.6 }).relecture, 30);
  for (const v of [RELECTURE_MAX + 1, -1, Number.NaN, Infinity, 'trente', null, undefined]) assert.equal(disponibilitesValides({ relecture: v }).relecture, 0, String(v));
  assert.equal(disponibilitesValides({ semaine: [1, 2, 3, 4, 5, 6, 7] }).relecture, 0, 'réglages d’avant la relecture');
});

test('la vitesse d’apprentissage : bornée, arrondie au centième, 1 si elle n’a pas de sens', () => {
  assert.equal(disponibilitesValides({ vitesse: 1.3 }).vitesse, 1.3);
  assert.equal(disponibilitesValides({ vitesse: 0.754 }).vitesse, 0.75);
  assert.equal(disponibilitesValides({ vitesse: 99 }).vitesse, VITESSE_MAX);
  assert.equal(disponibilitesValides({ vitesse: 0.01 }).vitesse, VITESSE_MIN);
  assert.equal(disponibilitesValides({ vitesse: VITESSE_MIN }).vitesse, VITESSE_MIN);
  for (const v of [Number.NaN, Infinity, -Infinity, 'vite', null, undefined]) assert.equal(disponibilitesValides({ vitesse: v }).vitesse, 1, String(v));
  assert.equal(disponibilitesValides({ semaine: [1, 2, 3, 4, 5, 6, 7] }).vitesse, 1, 'réglages d’avant la vitesse');
  assert.equal(DISPONIBILITES_DEFAUT.vitesse, 1);
  assert.equal(DISPONIBILITES_DEFAUT.relecture, 0, 'par défaut : pas de relecture imposée');
});

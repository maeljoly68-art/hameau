import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLES_QUARTIERS, PALIERS, cleProgression, heuresDe, jourDeFete, nouveautes, paliersFranchis, prochaineNouveaute, progressionVille } from '../src/core/ville.ts';

test('à 0 h : une cabane et un feu de camp, rien d’autre', () => {
  const p = progressionVille(0);
  assert.equal(p.quartiers.home, 1);
  assert.equal(p.quartiers.plaza, 1);
  for (const c of CLES_QUARTIERS) if (c !== 'home' && c !== 'plaza') assert.equal(p.quartiers[c], 0, c);
  assert.deepEqual([p.routes, p.eclairage, p.feux, p.arbres, p.decor], [0, 0, false, 0, 0]);
  assert.deepEqual([p.vehicules, p.parc, p.ambiance], [[], [], []]);
  assert.equal(p.franchis, 2);
});

test('les paliers sont rangés par heures croissantes, et le barème finit tout à 280 h', () => {
  for (let i = 1; i < PALIERS.length; i++) assert.ok(PALIERS[i].heures >= PALIERS[i - 1].heures, `${PALIERS[i].libelle}`);
  const fin = progressionVille(280);
  for (const c of CLES_QUARTIERS) assert.equal(fin.quartiers[c], 4, c);
  assert.deepEqual([fin.routes, fin.eclairage, fin.feux, fin.arbres, fin.decor], [2, 2, true, 6, 4]);
  assert.equal(fin.vehicules.length, 8);
  assert.equal(fin.parc.length, 7);
  assert.equal(fin.ambiance.length, 3);
  assert.equal(fin.franchis, fin.total);
  assert.equal(progressionVille(279.99).quartiers.tower, 3, 'un palier ne compte qu’une fois atteint');
});

test('chaque quartier monte d’un niveau à la fois : jamais de niveau sauté dans le barème', () => {
  for (const c of CLES_QUARTIERS) {
    const niveaux = PALIERS.filter((p) => p.deblocage.genre === 'quartier' && p.deblocage.cle === c).map((p) => (p.deblocage as { niveau: number }).niveau);
    assert.deepEqual(niveaux, [1, 2, 3, 4], c);
  }
});

test('ni trop facile, ni trop dur : rapproché au début, espacé ensuite', () => {
  const heures = [...new Set(PALIERS.map((p) => p.heures))];
  const ecarts = heures.slice(1).map((h, i) => h - heures[i]);
  assert.ok(ecarts.slice(0, 12).every((e) => e <= 2), 'les douze premiers à moins de 2 h l’un de l’autre');
  assert.ok(ecarts.every((e) => e <= 14), 'jamais plus de 14 h sans nouveauté');
  assert.ok(paliersFranchis(10).length >= 12, 'au moins douze nouveautés dans les dix premières heures');
});

test('les dépendances du barème sont respectées : on ne roule pas en tram sur la terre, les canards ont un étang', () => {
  const quand = (pred: (d: (typeof PALIERS)[number]['deblocage']) => boolean) => PALIERS.find((p) => pred(p.deblocage))!.heures;
  assert.ok(quand((d) => d.genre === 'vehicule' && d.cle === 'tram') > quand((d) => d.genre === 'routes' && d.niveau === 2));
  assert.ok(quand((d) => d.genre === 'parc' && d.cle === 'canards') > quand((d) => d.genre === 'quartier' && d.cle === 'park' && d.niveau === 2));
  assert.ok(quand((d) => d.genre === 'parc' && d.cle === 'fontaine') > quand((d) => d.genre === 'quartier' && d.cle === 'park' && d.niveau === 2));
  for (const objet of ['bancs', 'pommiers', 'kiosque', 'jeux', 'statue'])
    assert.ok(quand((d) => d.genre === 'parc' && d.cle === objet) > quand((d) => d.genre === 'quartier' && d.cle === 'park' && d.niveau === 1), objet);
  assert.ok(quand((d) => d.genre === 'eclairage' && d.niveau === 2) > quand((d) => d.genre === 'eclairage' && d.niveau === 1));
});

test('27,5 h (le total de novembre) : la ville a déjà ses quartiers de village', () => {
  const p = progressionVille(27.5);
  assert.deepEqual(p.quartiers, { tower: 1, bank: 1, shop: 1, uni: 2, plaza: 2, library: 1, park: 2, home: 2 });
  assert.deepEqual(p.vehicules, ['velo', 'deudeuche']);
  assert.deepEqual(p.parc, ['bancs', 'canards']);
  assert.deepEqual([p.routes, p.eclairage, p.arbres, p.decor], [1, 1, 3, 1]);
});

test('heuresDe : des minutes vers des heures ; absent, négatif ou illisible ne fait rien grandir', () => {
  assert.equal(heuresDe(90), 1.5);
  for (const v of [null, undefined, -30, Number.NaN, Infinity]) assert.equal(heuresDe(v as number), 0, String(v));
  assert.deepEqual(progressionVille(Number.NaN), progressionVille(0));
  assert.deepEqual(progressionVille(-5), progressionVille(0));
});

test('nouveautes : ce qui apparaît entre deux totaux, bornes d’avant exclues et d’après comprises', () => {
  assert.deepEqual(nouveautes(2.5, 4).map((p) => p.heures), [3, 4]);
  assert.deepEqual(nouveautes(3, 3.9), [], 'le palier de 3 h était déjà franchi');
  assert.deepEqual(nouveautes(5, 5), []);
  assert.equal(nouveautes(-1, 0).length, 0, 'les paliers de départ ne s’annoncent pas');
  assert.equal(nouveautes(0, 280).length, PALIERS.length - 2);
});

test('la clé ne change qu’à un palier franchi', () => {
  assert.equal(cleProgression(progressionVille(3.1)), cleProgression(progressionVille(3.9)));
  assert.notEqual(cleProgression(progressionVille(3.9)), cleProgression(progressionVille(4)));
});

test('le feu d’artifice : débloqué ET une journée de grand travail', () => {
  assert.equal(jourDeFete(progressionVille(300), 130), true);
  assert.equal(jourDeFete(progressionVille(300), 119), false);
  assert.equal(jourDeFete(progressionVille(100), 500), false, 'pas encore débloqué');
  assert.equal(jourDeFete(progressionVille(300), null), false, 'une journée inconnue ne se fête pas');
  assert.equal(jourDeFete(progressionVille(300), 60, 60), true, 'le seuil se règle');
});

test('prochaineNouveaute : le palier suivant et les minutes qui manquent', () => {
  const debut = prochaineNouveaute(0)!;
  assert.equal(debut.heures, 1);
  assert.deepEqual(debut.paliers.map((p) => p.libelle), ['Les premiers arbres']);
  assert.equal(debut.minutesRestantes, 60);
  const novembre = prochaineNouveaute(27.5 * 60)!;
  assert.equal(novembre.heures, 28);
  assert.equal(novembre.minutesRestantes, 30);
});

test('prochaineNouveaute : un palier atteint pile est déjà acquis, on vise le suivant', () => {
  const p = prochaineNouveaute(60)!;
  assert.equal(p.heures, 2, 'à 1 h tout rond, les arbres sont là : la suite, c’est le pré');
  assert.equal(p.minutesRestantes, 60);
});

test('prochaineNouveaute : la séance en cours fait avancer le compte, pas le palier visé', () => {
  const p = prochaineNouveaute(27.5 * 60, 20)!;
  assert.equal(p.heures, 28);
  assert.equal(p.minutesRestantes, 10);
  const depasse = prochaineNouveaute(27.5 * 60, 45)!;
  assert.equal(depasse.heures, 28, 'la nouveauté n’est là qu’à la clôture de la séance');
  assert.ok(depasse.minutesRestantes <= 0);
});

test('prochaineNouveaute : ville complète, valeurs illisibles', () => {
  assert.equal(prochaineNouveaute(280 * 60), null);
  assert.deepEqual(prochaineNouveaute(Number.NaN), prochaineNouveaute(0));
  assert.deepEqual(prochaineNouveaute(-30), prochaineNouveaute(0));
  assert.equal(prochaineNouveaute(0, -15)!.minutesRestantes, 60, 'une durée en cours négative ne rajoute rien');
  assert.equal(prochaineNouveaute(0, Number.NaN)!.minutesRestantes, 60);
});

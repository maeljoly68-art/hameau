import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VITESSE_MAX, VITESSE_MIN } from '../src/core/cours.ts';
import { POIDS_CHRONO, POIDS_COCHE, RAPPORT_RESSENTI, libelleVitesse, vitesseApresChrono, vitesseApresCoche } from '../src/core/vitesse.ts';

test('« comme prévu » ne bouge pas la vitesse, « plus lent » la monte, « plus vite » la baisse', () => {
  assert.equal(vitesseApresCoche(1, 'prevu'), 1);
  assert.equal(vitesseApresCoche(1.4, 'prevu'), 1.4);
  assert.ok(vitesseApresCoche(1, 'plus-lent') > 1);
  assert.ok(vitesseApresCoche(1, 'plus-vite') < 1);
  // Un ressenti ne pèse que 30 % : 1 → 1 + 0,3 × 0,35 = 1,105 → 1,11 (au centième).
  assert.equal(vitesseApresCoche(1, 'plus-lent'), 1.11);
  assert.equal(vitesseApresCoche(1, 'plus-vite'), 0.93);
  assert.equal(POIDS_COCHE, 0.3);
  assert.deepEqual(RAPPORT_RESSENTI, { 'plus-vite': 0.75, prevu: 1, 'plus-lent': 1.35 });
});

test('la vitesse se précise au fil des coches : elle converge vers le ressenti répété, sans sortir de ses bornes', () => {
  let v = 1;
  for (let i = 0; i < 40; i++) v = vitesseApresCoche(v, 'plus-lent');
  assert.ok(v > 1.3 && v <= VITESSE_MAX, `après 40 « plus lent » : ${v}`);
  for (let i = 0; i < 400; i++) v = vitesseApresCoche(v, 'plus-lent');
  assert.equal(v, VITESSE_MAX, 'jamais au-delà du plafond');
  let w = 1;
  for (let i = 0; i < 400; i++) w = vitesseApresCoche(w, 'plus-vite');
  assert.equal(w, VITESSE_MIN, 'ni sous le plancher');
});

test('un chrono mesure : le rapport réel / prévu rapproche la vitesse, deux fois plus fort qu’une coche', () => {
  assert.equal(POIDS_CHRONO, 0.5);
  assert.equal(vitesseApresChrono(1, 60, 60), 1, 'pile le temps prévu');
  assert.equal(vitesseApresChrono(1, 90, 60), 1.25, '50 % de plus que prévu : 1 + 0,5 × 0,5');
  assert.equal(vitesseApresChrono(1, 30, 60), 0.75, 'moitié moins : 1 − 0,5 × 0,5');
  assert.equal(vitesseApresChrono(1.5, 90, 60), 1.88, 'la vitesse du moment se multiplie : 1,5 × (1 + 0,5 × 0,5)');
  assert.ok(vitesseApresChrono(1, 90, 60) > vitesseApresCoche(1, 'plus-lent'));
});

test('un chrono oublié ou accidentel est ignoré ; un chrono extrême ne pèse pas plus qu’un facteur 2', () => {
  assert.equal(vitesseApresChrono(1, 600, 60), 1, '10 h pour 1 h prévue : minuteur oublié, rien appris');
  assert.equal(vitesseApresChrono(1, 6, 60), 1, '6 min pour 1 h : appui par mégarde');
  assert.equal(vitesseApresChrono(1, 300, 60), 1.5, 'pile 5 fois : encore gardé, mais compté pour 2 fois');
  assert.equal(vitesseApresChrono(1, 301, 60), 1, 'juste au-delà : ignoré');
  assert.equal(vitesseApresChrono(1, 12, 60), 0.75, 'pile 0,2 : gardé, compté pour 0,5');
  assert.equal(vitesseApresChrono(1, 11, 60), 1, 'juste en deçà : ignoré');
  assert.equal(vitesseApresChrono(1, 240, 60), 1.5, '4 fois plus long : compté pour 2 fois');
  assert.equal(vitesseApresChrono(2.4, 120, 60), VITESSE_MAX, 'et la vitesse reste dans ses bornes');
});

test('une durée absente ou nulle n’apprend rien : une session sans durée n’est pas une session instantanée', () => {
  assert.equal(vitesseApresChrono(1.2, null, 60), 1.2);
  assert.equal(vitesseApresChrono(1.2, 0, 60), 1.2);
  assert.equal(vitesseApresChrono(1.2, -5, 60), 1.2);
  assert.equal(vitesseApresChrono(1.2, Number.NaN, 60), 1.2);
  assert.equal(vitesseApresChrono(1.2, 30, 0), 1.2, 'rien de prévu : rien à comparer');
  assert.equal(vitesseApresChrono(1.2, 30, Number.NaN), 1.2);
});

test('une vitesse enregistrée absurde repart de 1 ou de ses bornes avant d’être précisée', () => {
  assert.equal(vitesseApresCoche(Number.NaN, 'prevu'), 1);
  assert.equal(vitesseApresCoche(50, 'prevu'), VITESSE_MAX);
  assert.equal(vitesseApresChrono(Number.NaN, 60, 60), 1);
});

test('la vitesse se dit en mots', () => {
  assert.equal(libelleVitesse(1), 'comme l’estimation');
  assert.equal(libelleVitesse(1.02), 'comme l’estimation', 'moins de 3 % d’écart : pareil');
  assert.equal(libelleVitesse(1.3), '30 % plus lent que l’estimation');
  assert.equal(libelleVitesse(0.8), '20 % plus rapide que l’estimation');
  assert.equal(libelleVitesse(Number.NaN), 'comme l’estimation');
});

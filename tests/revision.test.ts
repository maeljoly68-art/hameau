import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECART_JOURS, ECART_JOURS_PAR_COEUR, ETAT_INITIAL, ecartsPour, NIVEAU_MAX, apresDecouverte, apresRappelAnticipe, apresRevision, maitrise, niveauValide, statut, type EtatRevision } from '../src/core/revision.ts';

const J = '2026-11-05';
const a = (niveau: number): EtatRevision => ({ niveau, derniere: '2026-11-01', prochaine: '2026-11-04' });

test('l’échelle grandit : chaque écart dépasse le précédent', () => {
  for (let i = 2; i <= NIVEAU_MAX; i++) assert.ok(ECART_JOURS[i] > ECART_JOURS[i - 1], `écart ${i}`);
  assert.equal(ECART_JOURS.length, NIVEAU_MAX + 1);
});

test('première lecture : niveau 1, révision dès le lendemain', () => {
  assert.deepEqual(apresDecouverte(J), { niveau: 1, derniere: J, prochaine: '2026-11-06' });
});

test('noter un chapitre pas encore vu, c’est le découvrir (la note n’y change rien)', () => {
  for (const n of ['a-revoir', 'difficile', 'bien', 'facile'] as const) assert.deepEqual(apresRevision(ETAT_INITIAL, n, J), apresDecouverte(J), n);
});

test('« bien » : un cran de plus, et l’écart de ce cran', () => {
  const r = apresRevision(a(2), 'bien', J);
  assert.equal(r.niveau, 3);
  assert.equal(r.prochaine, '2026-11-12', '7 jours');
  assert.equal(r.derniere, J);
});

test('« facile » : deux crans, bornés au sommet de l’échelle', () => {
  assert.equal(apresRevision(a(2), 'facile', J).niveau, 4);
  assert.equal(apresRevision(a(NIVEAU_MAX), 'facile', J).niveau, NIVEAU_MAX);
  assert.equal(apresRevision(a(NIVEAU_MAX - 1), 'bien', J).niveau, NIVEAU_MAX);
});

test('« difficile » : même cran, mais on revient deux fois plus tôt', () => {
  const r = apresRevision(a(4), 'difficile', J); // 14 jours → 7
  assert.equal(r.niveau, 4);
  assert.equal(r.prochaine, '2026-11-12');
  // Jamais « 0 jour » : au pire, demain.
  assert.equal(apresRevision(a(1), 'difficile', J).prochaine, '2026-11-06');
});

test('« à revoir » : on redescend de deux crans (pas sous 1) et on réessaie demain', () => {
  const r = apresRevision(a(4), 'a-revoir', J);
  assert.equal(r.niveau, 2);
  assert.equal(r.prochaine, '2026-11-06');
  assert.equal(apresRevision(a(1), 'a-revoir', J).niveau, 1, 'un chapitre vu ne redevient jamais « à découvrir »');
});

test('maîtrise et statut', () => {
  assert.equal(maitrise(0), 0);
  assert.equal(maitrise(NIVEAU_MAX), 100);
  assert.equal(maitrise(3), 50);
  assert.equal(statut(0), 'a-decouvrir');
  assert.equal(statut(1), 'en-cours');
  assert.equal(statut(4), 'en-cours');
  assert.equal(statut(5), 'maitrise');
});

test('un niveau absurde (donnée abîmée) vaut 0, jamais NaN ni hors échelle', () => {
  for (const v of [-1, 7, 2.5, NaN, '3', null, undefined]) assert.equal(niveauValide(v), 0, String(v));
  assert.equal(niveauValide(3), 3);
  assert.equal(maitrise(99), 0);
});

test('un rappel avant l’échéance : réussi, il ne fait pas monter le cran ; il est seulement retenu comme dernier passage', () => {
  const etat = { niveau: 3, derniere: '2026-11-01', prochaine: '2026-11-12' };
  for (const note of ['bien', 'facile'] as const) assert.deepEqual(apresRappelAnticipe(etat, note, '2026-11-07'), { niveau: 3, derniere: '2026-11-07', prochaine: '2026-11-12' }, note);
});

test('un rappel raté avant l’échéance compte pour de vrai, sans jamais reculer l’échéance prévue', () => {
  // « À revoir » : deux crans en moins et demain, même si l'échéance prévue était plus loin.
  assert.deepEqual(apresRappelAnticipe({ niveau: 4, derniere: '2026-11-01', prochaine: '2026-11-20' }, 'a-revoir', '2026-11-07'), { niveau: 2, derniere: '2026-11-07', prochaine: '2026-11-08' });
  // « Difficile » : même cran, l'écart divisé par deux (7 / 2 → 4 jours), s'il est plus tôt que l'échéance prévue…
  assert.deepEqual(apresRappelAnticipe({ niveau: 3, derniere: '2026-11-01', prochaine: '2026-11-12' }, 'difficile', '2026-11-07'), { niveau: 3, derniere: '2026-11-07', prochaine: '2026-11-11' });
  // … mais jamais plus tard : l'échéance déjà prévue plus tôt est gardée.
  assert.deepEqual(apresRappelAnticipe({ niveau: 3, derniere: '2026-11-01', prochaine: '2026-11-09' }, 'difficile', '2026-11-07'), { niveau: 3, derniere: '2026-11-07', prochaine: '2026-11-09' });
  assert.deepEqual(apresRappelAnticipe({ niveau: 3, derniere: '2026-11-01', prochaine: '2026-11-08' }, 'a-revoir', '2026-11-07'), { niveau: 1, derniere: '2026-11-07', prochaine: '2026-11-08' }, 'échéance égale : la même');
});

test('un rappel sur une page jamais lue, ou sans échéance connue, retombe sur le cycle ordinaire', () => {
  assert.deepEqual(apresRappelAnticipe({ niveau: 0, derniere: null, prochaine: null }, 'facile', '2026-11-07'), apresDecouverte('2026-11-07'));
  assert.deepEqual(apresRappelAnticipe({ niveau: 2, derniere: '2026-11-01', prochaine: null }, 'a-revoir', '2026-11-07'), apresRevision({ niveau: 2, derniere: '2026-11-01', prochaine: null }, 'a-revoir', '2026-11-07'));
});

test('un rappel anticipé ne modifie pas l’état reçu', () => {
  const etat = Object.freeze({ niveau: 3, derniere: '2026-11-01', prochaine: '2026-11-12' });
  assert.doesNotThrow(() => apresRappelAnticipe(etat, 'bien', '2026-11-07'));
  assert.doesNotThrow(() => apresRappelAnticipe(etat, 'a-revoir', '2026-11-07'));
});

test('l’échelle « mot pour mot » : plus serrée à chaque cran, toujours croissante, même premier retour', () => {
  assert.deepEqual([...ECART_JOURS_PAR_COEUR], [0, 1, 2, 4, 7, 14, 30]);
  assert.equal(ECART_JOURS_PAR_COEUR.length, NIVEAU_MAX + 1);
  for (let i = 2; i <= NIVEAU_MAX; i++) {
    assert.ok(ECART_JOURS_PAR_COEUR[i] > ECART_JOURS_PAR_COEUR[i - 1], `écart ${i} croissant`);
    assert.ok(ECART_JOURS_PAR_COEUR[i] < ECART_JOURS[i], `écart ${i} plus court que l’échelle ordinaire`);
  }
  assert.equal(ECART_JOURS_PAR_COEUR[1], ECART_JOURS[1], 'le premier retour reste demain');
  assert.equal(ecartsPour(true), ECART_JOURS_PAR_COEUR);
  assert.equal(ecartsPour(false), ECART_JOURS);
});

test('une page à savoir mot pour mot revient plus tôt après une bonne note, sans changer de cran', () => {
  const etat = { niveau: 2, derniere: '2026-11-01', prochaine: '2026-11-05' };
  assert.deepEqual(apresRevision(etat, 'bien', J), { niveau: 3, derniere: J, prochaine: '2026-11-12' }, 'ordinaire : 7 jours');
  assert.deepEqual(apresRevision(etat, 'bien', J, true), { niveau: 3, derniere: J, prochaine: '2026-11-09' }, 'mot pour mot : 4 jours');
  assert.deepEqual(apresRevision(etat, 'facile', J, true), { niveau: 4, derniere: J, prochaine: '2026-11-12' }, 'facile : cran 4, 7 jours');
  assert.deepEqual(apresRevision(etat, 'difficile', J, true), { niveau: 2, derniere: J, prochaine: '2026-11-06' }, 'difficile : moitié de 2 jours');
  assert.deepEqual(apresRevision(etat, 'a-revoir', J, true), { niveau: 1, derniere: J, prochaine: '2026-11-06' }, 'à revoir : demain, comme les autres');
  assert.deepEqual(apresRevision({ niveau: 6, derniere: '2026-11-01', prochaine: '2026-11-05' }, 'bien', J, true), { niveau: 6, derniere: J, prochaine: '2026-12-05' }, 'cran maximal : 30 jours');
  assert.deepEqual(apresRevision({ niveau: 0, derniere: null, prochaine: null }, 'bien', J, true), apresDecouverte(J), 'première lecture : pareil');
});

test('un rappel anticipé suit la même échelle', () => {
  const etat = { niveau: 3, derniere: '2026-11-01', prochaine: '2026-11-20' };
  assert.deepEqual(apresRappelAnticipe(etat, 'difficile', J, true), { niveau: 3, derniere: J, prochaine: '2026-11-07' }, 'mot pour mot : moitié de 4 jours');
  assert.deepEqual(apresRappelAnticipe(etat, 'difficile', J, false), { niveau: 3, derniere: J, prochaine: '2026-11-09' }, 'ordinaire : moitié de 7 jours (4)');
});

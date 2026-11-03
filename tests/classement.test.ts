import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bornesPeriode, classer, codeDansLien, ecartAuSuivant, formaterCode, joursDePeriode, lienInvitation, normaliserCode, type Membre } from '../src/core/classement.ts';
import { APPARENCE_DEFAUT } from '../src/core/types.ts';

const membre = (id: string, minutes: number, pseudo: string | null = id, moi = false): Membre => ({
  id, moi, pseudo, nomHameau: 'H', apparence: APPARENCE_DEFAUT, niveau: 1, secondes: minutes * 60, sessions: 1, parJour: [], ouverte: null, batiments: 0,
});

test('classement : du plus concentré au moins, ex æquo au même rang', () => {
  const r = classer([membre('lea', 90), membre('moi', 120, 'Moi', true), membre('tom', 90), membre('zoe', 10)]);
  assert.deepEqual(r.map((x) => [x.membre.id, x.rang]), [['moi', 1], ['lea', 2], ['tom', 2], ['zoe', 4]]);
});

test('classement à la minute affichée : 61 et 119 secondes sont à égalité (« 1 min » chacun)', () => {
  const a = { ...membre('a', 0), secondes: 61 };
  const b = { ...membre('b', 0), secondes: 119 };
  const r = classer([b, a]);
  assert.equal(r[0].rang, r[1].rang);
});

test('écart au suivant : de quoi le dépasser, pas seulement l’égaler', () => {
  const r = classer([membre('lea', 90, 'Léa'), membre('moi', 60, 'Moi', true), membre('tom', 75, 'Tom')]);
  const e = ecartAuSuivant(r)!;
  assert.equal(e.devant.id, 'tom', 'le plus proche devant, pas le premier');
  assert.equal(e.minutes, 16);
  assert.equal(ecartAuSuivant(classer([membre('moi', 60, 'Moi', true), membre('lea', 20)])), null, 'on mène');
  // Ex æquo avec celui de devant : il faut une minute de plus.
  assert.equal(ecartAuSuivant(classer([membre('lea', 60, 'Aaa'), membre('moi', 60, 'Zzz', true)]))?.minutes ?? null, null);
});

test('périodes : jour, semaine du lundi, mois entier', () => {
  const jeudi = new Date('2026-11-05T15:00:00+01:00');
  assert.deepEqual(bornesPeriode(jeudi, 'jour'), { depuis: '2026-11-05', jours: 1 });
  assert.deepEqual(bornesPeriode(jeudi, 'semaine'), { depuis: '2026-11-02', jours: 7 });
  assert.deepEqual(bornesPeriode(jeudi, 'mois'), { depuis: '2026-11-01', jours: 30 });
  assert.deepEqual(bornesPeriode(new Date('2028-02-10T12:00:00+01:00'), 'mois'), { depuis: '2028-02-01', jours: 29 });
  // Le dimanche appartient à la semaine commencée le lundi d'avant.
  assert.equal(bornesPeriode(new Date('2026-11-08T23:30:00+01:00'), 'semaine').depuis, '2026-11-02');
});

test('jours de la période, y compris à travers un changement d’heure', () => {
  assert.deepEqual(joursDePeriode('2026-10-24', 3), ['2026-10-24', '2026-10-25', '2026-10-26']);
  assert.equal(joursDePeriode('2026-03-01', 31).at(-1), '2026-03-31');
});

test('codes ami : tolérants à la saisie, stricts sur l’alphabet', () => {
  assert.equal(normaliserCode('abcd-2345'), 'ABCD2345');
  assert.equal(normaliserCode(' AB CD 23 45 '), 'ABCD2345');
  assert.equal(normaliserCode('ABCD234'), null);
  assert.equal(normaliserCode('ABCD2340'), null, 'le 0 se confond avec le O');
  assert.equal(normaliserCode('ABCDI234'), null, 'le I se confond avec le 1');
  assert.equal(formaterCode('ABCD2345'), 'ABCD-2345');
});

test('lien d’invitation : aller-retour, dans le fragment', () => {
  const l = lienInvitation('https://exemple.fr/hameau/#ancien', 'ABCD2345');
  assert.equal(l, 'https://exemple.fr/hameau/#ami=ABCD2345');
  assert.equal(codeDansLien(new URL(l).hash), 'ABCD2345');
  assert.equal(codeDansLien('#ami=abcd-2345'), 'ABCD2345');
  assert.equal(codeDansLien('#x=1&ami=ABCD2345'), 'ABCD2345');
  assert.equal(codeDansLien('#ami=MAUVAIS'), null);
  assert.equal(codeDansLien(''), null);
});

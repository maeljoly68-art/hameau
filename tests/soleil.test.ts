import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hauteurSoleil, jourDeLAnnee, phaseLune, soleil } from '../src/core/soleil.ts';

/** Heures locales où le haut du disque passe l'horizon (réfraction comprise), à la minute. */
function leverCoucher(jour: string, decalage: string): string[] {
  const r: string[] = [];
  let avant: number | null = null;
  for (let m = 0; m < 24 * 60; m++) {
    const hm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const h = soleil(new Date(`${jour}T${hm}:00${decalage}`)).hauteur;
    if (avant !== null && avant < -0.833 !== h < -0.833) r.push(hm);
    avant = h;
  }
  return r;
}

const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
function proche(obtenu: string, attendu: string, tolerance: number) {
  assert.ok(Math.abs(minutes(obtenu) - minutes(attendu)) <= tolerance, `${obtenu} au lieu de ${attendu} (± ${tolerance} min)`);
}

test('lever et coucher à Paris, aux solstices', () => {
  // Éphémérides de Paris : 5 h 47 / 21 h 58 (heure d'été), 8 h 41 / 16 h 56.
  // Une heure d'été oubliée décalerait de 60 min, le méridien oublié de 50.
  const [leverJuin, coucherJuin] = leverCoucher('2026-06-21', '+02:00');
  proche(leverJuin, '05:47', 4);
  proche(coucherJuin, '21:58', 4);
  const [leverDec, coucherDec] = leverCoucher('2026-12-21', '+01:00');
  proche(leverDec, '08:41', 4);
  proche(coucherDec, '16:56', 4);
});

test('le jour du passage à l’heure d’été, le soleil ne saute pas d’une heure', () => {
  // 29 mars 2026 : lever vers 7 h 37 (déjà à l'heure d'été), coucher vers 20 h 16.
  const [lever, coucher] = leverCoucher('2026-03-29', '+02:00');
  proche(lever, '07:37', 5);
  proche(coucher, '20:16', 5);
});

test('hauteur à midi solaire : 90° − latitude ± déclinaison', () => {
  assert.ok(Math.abs(hauteurSoleil(172, 12) - 64.6) < 0.5);
  assert.ok(Math.abs(hauteurSoleil(355, 12) - 17.7) < 0.5);
  assert.ok(hauteurSoleil(355, 0) < -55);
});

test('le soleil traverse le ciel de gauche à droite', () => {
  const x = (h: string) => soleil(new Date(`2026-11-03T${h}:00+01:00`)).x;
  assert.ok(x('08:00') < x('12:00') && x('12:00') < x('16:00'));
  assert.ok(Math.abs(x('12:34') - 0.5) < 0.02, 'midi solaire au milieu');
  // Au lever, près du bord gauche ; la nuit, rangé contre un bord, jamais hors du ciel.
  assert.ok(Math.abs(x('07:41') - 0.08) < 0.02);
  assert.equal(x('23:00'), 1);
  assert.equal(x('03:00'), 0);
});

test('matin et soir se mêlent sans à-coup, y compris à midi et à minuit', () => {
  let avant = soleil(new Date('2026-06-21T00:00:00+02:00')).poidsMatin;
  for (let m = 1; m < 24 * 60; m++) {
    const p = soleil(new Date(Date.parse('2026-06-21T00:00:00+02:00') + m * 60_000)).poidsMatin;
    assert.ok(Math.abs(p - avant) < 0.01, `saut de ${avant} à ${p} à la minute ${m}`);
    avant = p;
  }
  assert.ok(soleil(new Date('2026-11-03T07:41:00+01:00')).poidsMatin > 0.9, 'le lever est du matin');
  assert.ok(soleil(new Date('2026-11-03T17:28:00+01:00')).poidsMatin < 0.1, 'le coucher est du soir');
});

test('rang du jour dans l’année', () => {
  assert.equal(jourDeLAnnee(new Date('2026-01-01T00:30:00+01:00')), 1);
  assert.equal(jourDeLAnnee(new Date('2026-03-31T12:00:00+02:00')), 90);
  assert.equal(jourDeLAnnee(new Date('2024-12-31T23:30:00+01:00')), 366);
});

test('phase de la lune : nouvelles et pleines lunes connues', () => {
  const ecartCyclique = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
  assert.ok(ecartCyclique(phaseLune(new Date('2000-01-21T04:40:00Z')), 0.5) < 0.03);
  assert.ok(ecartCyclique(phaseLune(new Date('2024-01-11T11:57:00Z')), 0) < 0.03);
  assert.ok(ecartCyclique(phaseLune(new Date('2024-01-25T17:54:00Z')), 0.5) < 0.03);
  const p = phaseLune(new Date('1990-01-01T00:00:00Z'));
  assert.ok(p >= 0 && p < 1, 'avant la référence, toujours entre 0 et 1');
});

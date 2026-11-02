import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clore, dureeSession, ecouleEffectif, enPause, mettreEnPause, pauseValide, reprendre } from '../src/core/session.ts';
import { pointsSession } from '../src/core/points.ts';
import { session } from './aide.ts';

const T = (hhmm: string) => `2026-11-02T${hhmm}:00+01:00`;
const ms = (hhmm: string) => Date.parse(T(hhmm));

test('une session en cours n’a pas de durée, même après une pause', () => {
  const s = { ...session(T('09:00'), null), pauseSecondes: 600 };
  assert.equal(dureeSession(s), null);
});

test('les pauses sont déduites de la durée et donc des points', () => {
  const s = { ...session(T('09:00'), 60), pauseSecondes: 10 * 60 };
  assert.equal(dureeSession(s), 50);
  // 50 min effectives : deux blocs de 25, pas deux blocs « grâce » à la pause.
  assert.equal(pointsSession(dureeSession(s)), 60);
});

test('écoulé : figé pendant une pause, reprend après', () => {
  const ouverte = session(T('09:00'), null);
  const enCours = mettreEnPause(ouverte, T('09:20'));
  assert.ok(enPause(enCours));
  assert.equal(ecouleEffectif(enCours, ms('09:20')), 20);
  assert.equal(ecouleEffectif(enCours, ms('09:45')), 20, 'le chrono ne bouge pas en pause');
  const repris = reprendre(enCours, T('09:30'));
  assert.equal(repris.pauseSecondes, 600);
  assert.equal(repris.pauseDepuis, null);
  assert.equal(ecouleEffectif(repris, ms('09:40')), 30);
});

test('pause et reprise sans effet quand elles n’ont pas de sens', () => {
  const close = session(T('09:00'), 30);
  assert.equal(mettreEnPause(close, T('10:00')), close);
  const ouverte = session(T('09:00'), null);
  assert.equal(reprendre(ouverte, T('09:30')), ouverte, 'reprendre sans pause ne change rien');
  const enPauseDeja = mettreEnPause(ouverte, T('09:10'));
  assert.equal(mettreEnPause(enPauseDeja, T('09:20')).pauseDepuis, T('09:10'), 'une deuxième pause ne repousse pas la première');
});

test('terminer pendant une pause : la pause s’arrête à la fin', () => {
  const s = mettreEnPause(session(T('09:00'), null), T('09:40'));
  const c = clore(s, T('10:00'));
  assert.equal(c.pauseDepuis, null);
  assert.equal(c.pauseSecondes, 20 * 60);
  assert.equal(dureeSession(c), 40);
});

test('le cumul de pause ne dépasse jamais la durée totale', () => {
  const s = { ...session(T('09:00'), null), pauseSecondes: 5 * 3600 };
  const c = clore(s, T('10:00'));
  assert.equal(c.pauseSecondes, 3600);
  assert.equal(dureeSession(c), 0);
});

test('pause absente ou absurde = pas de pause (anciennes données)', () => {
  assert.equal(pauseValide(undefined), 0);
  assert.equal(pauseValide(null), 0);
  assert.equal(pauseValide(-30), 0);
  assert.equal(pauseValide('120'), 120);
});

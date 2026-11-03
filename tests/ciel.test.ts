import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambiance, cielPour, momentDuCiel } from '../src/core/ciel.ts';
import { ecart, versRgb } from '../src/core/couleur.ts';

test('le ciel change par nuances, jamais d’un coup, sur toute la course du soleil', () => {
  for (const poids of [1, 0.5, 0]) {
    let avant = ambiance(-30, poids);
    for (let h = -29.9; h <= 70; h += 0.1) {
      const a = ambiance(h, poids);
      for (let i = 0; i < 3; i++) assert.ok(ecart(a.ciel[i], avant.ciel[i]) < 6, `saut du ciel à ${h.toFixed(1)}°`);
      assert.ok(ecart(a.lumiere.teinte, avant.lumiere.teinte) < 8, `saut de lumière à ${h.toFixed(1)}°`);
      assert.ok(Math.abs(a.lumiere.force - avant.lumiere.force) < 0.02);
      avant = a;
    }
  }
});

test('heure par heure, une journée entière sans saut de couleur (midi et minuit compris)', () => {
  for (const jour of ['2026-06-21T00:00:00+02:00', '2026-12-21T00:00:00+01:00']) {
    let avant = cielPour(new Date(jour));
    for (let m = 1; m < 24 * 60; m++) {
      const c = cielPour(new Date(Date.parse(jour) + m * 60_000));
      for (let i = 0; i < 3; i++) assert.ok(ecart(c.ambiance.ciel[i], avant.ambiance.ciel[i]) < 8, `${jour} minute ${m}`);
      avant = c;
    }
  }
});

test('les étoiles et les fenêtres arrivent progressivement', () => {
  assert.equal(ambiance(-20, 0).etoiles, 1);
  assert.equal(ambiance(10, 0).etoiles, 0);
  const crepuscule = ambiance(-8, 0).etoiles;
  assert.ok(crepuscule > 0 && crepuscule < 1, 'à −8°, les premières étoiles seulement');
  assert.equal(ambiance(-10, 0).fenetres, 1);
  assert.equal(ambiance(20, 0).fenetres, 0);
  const auCoucher = ambiance(0, 0).fenetres;
  assert.ok(auCoucher > 0 && auCoucher < 1, 'au coucher, on commence à allumer');
});

test('la lueur de l’horizon culmine au lever et au coucher', () => {
  const lueur = (h: number) => ambiance(h, 0).lueur.force;
  assert.ok(lueur(0) > lueur(15));
  assert.ok(lueur(0) > lueur(-15));
  assert.equal(lueur(40), 0);
});

test('le couchant est plus chaud que l’aube, à hauteur égale', () => {
  const chaleur = (c: string) => versRgb(c)[0] - versRgb(c)[2];
  assert.ok(chaleur(ambiance(0, 0).ciel[2]) > chaleur(ambiance(0, 1).ciel[2]));
  assert.ok(chaleur(ambiance(-2, 0).lueur.couleur) > chaleur(ambiance(-2, 1).lueur.couleur));
});

test('la nuit assombrit la scène, le plein jour la laisse telle quelle', () => {
  assert.ok(ambiance(-20, 0).lumiere.force > 0.5);
  assert.equal(ambiance(40, 0.5).lumiere.force, 0);
  assert.ok(ambiance(-4, 0).lumiere.force > ambiance(4, 0).lumiere.force);
  assert.ok(ambiance(-20, 0).nuit && !ambiance(-3, 0).nuit, 'les habitants veillent au crépuscule');
});

test('le moment de la journée, en mots', () => {
  const m = (h: string) => momentDuCiel(cielPour(new Date(`2026-11-03T${h}:00+01:00`)));
  assert.equal(m('05:00'), 'nuit');
  assert.equal(m('07:20'), 'aube');
  assert.equal(m('08:00'), 'lever');
  assert.equal(m('12:00'), 'jour');
  assert.equal(m('17:10'), 'coucher');
  assert.equal(m('17:45'), 'crepuscule');
  assert.equal(m('21:00'), 'nuit');
});

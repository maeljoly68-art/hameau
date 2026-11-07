import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Disponibilites } from '../src/core/cours.ts';
import { ajouterJours, ecartJours } from '../src/core/jours.ts';
import { planifier } from '../src/core/planning.ts';
import {
  DECALAGE_MAX,
  ECARTS_AVANT_PARTIEL,
  REVISION_LIBRE_DEFAUT,
  REVISION_LIBRE_MAX,
  REVISION_LIBRE_MIN,
  fusionnerLibres,
  minutesLibresParJour,
  revisionLibreMinValide,
  seancesLibres,
  type CoursLibre,
} from '../src/core/revisionLibre.ts';

const AUJ = '2026-11-09'; // lundi
const PARTIEL = '2026-12-11';
const dispo = (m: number, libres: string[] = []): Disponibilites => ({ semaine: [m, m, m, m, m, m, m], libres });
const cours = (id: string, partiel: string | null, extra: Partial<CoursLibre> = {}): CoursLibre => ({ id, partiel, enPause: false, revisionLibreMin: 45, ordre: 0, ...extra });
const jours = (s: readonly { jour: string }[]) => s.map((x) => x.jour);
const avant = (n: number) => ajouterJours(PARTIEL, -n);

test('les minutes d’une séance libre : un entier de 10 à 180, sinon pas de séances libres', () => {
  assert.equal(REVISION_LIBRE_DEFAUT, 45);
  assert.equal(revisionLibreMinValide(45), 45);
  assert.equal(revisionLibreMinValide(REVISION_LIBRE_MIN), REVISION_LIBRE_MIN);
  assert.equal(revisionLibreMinValide(REVISION_LIBRE_MAX), REVISION_LIBRE_MAX);
  for (const v of [9, 181, 0, -5, 30.5, NaN, null, undefined, '45']) assert.equal(revisionLibreMinValide(v), null, String(v));
});

test('les séances se placent à rebours du partiel : la veille, J−3, J−6, J−10, J−15…', () => {
  const s = seancesLibres({ cours: [cours('A', PARTIEL)], disponibilites: dispo(120), aujourdhui: AUJ });
  assert.deepEqual(jours(s), [avant(28), avant(21), avant(15), avant(10), avant(6), avant(3), avant(1)].sort(), 'J−36 est avant aujourd’hui : abandonné');
  assert.ok(s.every((x) => x.coursId === 'A' && x.minutes === 45));
});

test('elles se resserrent à l’approche de l’épreuve', () => {
  const s = jours(seancesLibres({ cours: [cours('A', PARTIEL)], disponibilites: dispo(120), aujourdhui: AUJ }));
  const ecarts = s.slice(1).map((j, i) => ecartJours(s[i], j));
  for (let i = 1; i < ecarts.length; i++) assert.ok(ecarts[i] <= ecarts[i - 1], `écarts ${ecarts.join(', ')}`);
});

test('elles ne glissent pas d’un jour à l’autre : accrochées au partiel, pas à aujourd’hui', () => {
  const lundi = seancesLibres({ cours: [cours('A', PARTIEL)], disponibilites: dispo(120), aujourdhui: AUJ });
  const mardi = seancesLibres({ cours: [cours('A', PARTIEL)], disponibilites: dispo(120), aujourdhui: ajouterJours(AUJ, 1) });
  assert.deepEqual(jours(mardi), jours(lundi).filter((j) => j >= ajouterJours(AUJ, 1)));
});

test('aucune séance aujourd’hui ou après : jamais avant aujourd’hui, jamais le jour du partiel ni après', () => {
  const s = seancesLibres({ cours: [cours('A', PARTIEL)], disponibilites: dispo(120), aujourdhui: AUJ });
  assert.ok(s.every((x) => ecartJours(AUJ, x.jour) >= 0 && ecartJours(x.jour, PARTIEL) >= 1));
  const proche = seancesLibres({ cours: [cours('A', ajouterJours(AUJ, 2))], disponibilites: dispo(120), aujourdhui: AUJ });
  assert.deepEqual(jours(proche), [ajouterJours(AUJ, 1)], 'à deux jours du partiel : la veille seulement (J−3 est passé)');
});

test('pas de séances pour un cours sans partiel, en pause, au partiel passé ou sans minutes', () => {
  const base = { disponibilites: dispo(120), aujourdhui: AUJ };
  assert.deepEqual(seancesLibres({ ...base, cours: [cours('A', null)] }), []);
  assert.deepEqual(seancesLibres({ ...base, cours: [cours('A', PARTIEL, { enPause: true })] }), []);
  assert.deepEqual(seancesLibres({ ...base, cours: [cours('A', AUJ)] }), [], 'le jour du partiel');
  assert.deepEqual(seancesLibres({ ...base, cours: [cours('A', ajouterJours(AUJ, -3))] }), [], 'partiel passé');
  assert.deepEqual(seancesLibres({ ...base, cours: [cours('A', PARTIEL, { revisionLibreMin: null })] }), []);
});

test('un jour libre : la séance recule d’un ou deux jours, pas davantage', () => {
  const veille = avant(1);
  const s = seancesLibres({ cours: [cours('A', PARTIEL)], disponibilites: dispo(120, [veille]), aujourdhui: AUJ });
  assert.ok(!jours(s).includes(veille));
  assert.ok(jours(s).includes(avant(2)), 'la séance de la veille a reculé à J−2');
  const bloque = seancesLibres({ cours: [cours('A', PARTIEL)], disponibilites: dispo(120, [avant(1), avant(2), avant(3)]), aujourdhui: AUJ });
  assert.ok(![avant(1), avant(2), avant(3)].some((j) => jours(bloque).includes(j)));
  assert.equal(DECALAGE_MAX, 2);
});

test('une journée trop courte pour la séance ne la reçoit pas', () => {
  const s = seancesLibres({ cours: [cours('A', PARTIEL, { revisionLibreMin: 90 })], disponibilites: dispo(60), aujourdhui: AUJ });
  assert.deepEqual(s, [], '60 minutes par jour : une séance de 90 ne tient nulle part');
  const juste = seancesLibres({ cours: [cours('A', PARTIEL, { revisionLibreMin: 60 })], disponibilites: dispo(60), aujourdhui: AUJ });
  assert.ok(juste.length > 0, '60 sur 60 tient');
});

test('la pratique quotidienne est prise sur la journée avant de poser la séance', () => {
  const sans = seancesLibres({ cours: [cours('A', PARTIEL, { revisionLibreMin: 60 })], disponibilites: dispo(60), aujourdhui: AUJ });
  const avec = seancesLibres({ cours: [cours('A', PARTIEL, { revisionLibreMin: 60 })], disponibilites: dispo(60), aujourdhui: AUJ, reserves: [{ minutes: 5, jusquau: null }] });
  assert.ok(sans.length > 0);
  assert.deepEqual(avec, [], '60 − 5 = 55 : la séance de 60 ne tient plus');
});

test('deux cours ne se partagent pas une journée trop courte : le partiel le plus proche choisit d’abord', () => {
  // Les écarts de l'un (veille du proche) et de l'autre (J−3 du lointain) tombent le même jour : un seul des deux l'aura.
  const proche = ajouterJours(AUJ, 8);
  const loin = ajouterJours(AUJ, 10);
  const s = seancesLibres({ cours: [cours('loin', loin, { revisionLibreMin: 60 }), cours('proche', proche, { revisionLibreMin: 60 })], disponibilites: dispo(60), aujourdhui: AUJ });
  const parJour = new Map<string, string[]>();
  for (const x of s) parJour.set(x.jour, [...(parJour.get(x.jour) ?? []), x.coursId]);
  for (const [j, ids] of parJour) assert.equal(ids.length, 1, `${j} : ${ids.join(' + ')} pour 60 minutes`);
  assert.deepEqual(parJour.get(ajouterJours(proche, -1)), ['proche'], 'la veille du partiel le plus proche lui revient, même si l’autre cours est donné en premier');
  assert.ok(s.some((x) => x.coursId === 'loin' && x.jour === ajouterJours(proche, -2)), 'le cours lointain recule d’un jour');
});

test('deux cours le même jour de partiel se répartissent sur des jours différents quand la journée est courte', () => {
  const s = seancesLibres({ cours: [cours('A', PARTIEL, { revisionLibreMin: 60 }), cours('B', PARTIEL, { revisionLibreMin: 60, ordre: 1 })], disponibilites: dispo(60), aujourdhui: AUJ });
  const parJour = new Map<string, string[]>();
  for (const x of s) parJour.set(x.jour, [...(parJour.get(x.jour) ?? []), x.coursId]);
  for (const [j, ids] of parJour) assert.equal(ids.length, 1, `${j} : ${ids.join(' + ')}`);
  assert.deepEqual(parJour.get(avant(1)), ['A'], 'à partiel égal, l’ordre des cours départage');
  const large = seancesLibres({ cours: [cours('A', PARTIEL), cours('B', PARTIEL, { ordre: 1 })], disponibilites: dispo(200), aujourdhui: AUJ });
  assert.equal(large.filter((x) => x.jour === avant(1)).length, 2, 'une journée assez longue reçoit les deux');
});

test('huit séances au plus, une par jour et par cours — J−36 comprise quand le partiel est assez loin', () => {
  const loin = ajouterJours(AUJ, 90);
  const s = seancesLibres({ cours: [cours('A', loin)], disponibilites: dispo(120), aujourdhui: AUJ });
  assert.deepEqual(jours(s), ECARTS_AVANT_PARTIEL.map((e) => ajouterJours(loin, -e)).sort(), 'les huit écarts, J−36 compris');
  assert.equal(s.length, 8);
});

test('une séance qui recule sur un jour déjà pris par la même matière ne le prend pas deux fois', () => {
  // La veille et J−2 sont libres : l'écart 1 recule jusqu'à J−3, qui est aussi l'écart 3 — une seule séance ce jour-là.
  const s = seancesLibres({ cours: [cours('A', PARTIEL)], disponibilites: dispo(200, [avant(1), avant(2)]), aujourdhui: AUJ });
  assert.equal(s.filter((x) => x.jour === avant(3)).length, 1);
  assert.equal(new Set(jours(s)).size, s.length, 'jamais deux séances du même cours le même jour');
});

test('les minutes libres de chaque jour se somment', () => {
  const m = minutesLibresParJour([
    { jour: '2026-12-01', coursId: 'A', minutes: 45 },
    { jour: '2026-12-01', coursId: 'B', minutes: 30 },
    { jour: '2026-12-02', coursId: 'A', minutes: 45 },
  ]);
  assert.equal(m.get('2026-12-01'), 75);
  assert.equal(m.get('2026-12-02'), 45);
  assert.equal(m.get('2026-12-03'), undefined);
});

// ── Le planificateur met ce temps de côté avant les pages ──
const unCours = { id: 'A', titre: 'A', couleur: '#888', partiel: '2026-12-04', lien: null, ordre: 0, motifs: '', enPause: false, pratiqueMin: null, revisionLibreMin: null };
const pages = Array.from({ length: 12 }, (_, i) => ({ id: `A-${i}`, coursId: 'A', titre: `Ch ${i}`, ordre: i, dureeMin: 30, niveau: 0, derniere: null, prochaine: null, lien: null, parCoeur: false }));
const parJour = (p: ReturnType<typeof planifier>, j: string) => p.seances.filter((s) => s.jour === j).reduce((t, s) => t + s.minutes, 0);

test('le planificateur retire les séances libres du temps des jours concernés, et seulement ceux-là', () => {
  const jour = ajouterJours(AUJ, 3);
  const autre = ajouterJours(AUJ, 4);
  const base = { cours: [unCours], chapitres: pages, disponibilites: dispo(60), aujourdhui: AUJ, partRappel: 0 };
  const sans = planifier(base);
  const avecReserve = planifier({ ...base, reservesJours: new Map([[jour, 45]]) });
  assert.ok(parJour(sans, jour) > 15, 'sans réserve, le jour reçoit plus de 15 minutes de pages');
  assert.ok(parJour(avecReserve, jour) <= 15, `${jour} : 60 − 45 = 15 minutes pour les pages`);
  assert.equal(parJour(avecReserve, autre), parJour(sans, autre), 'un autre jour n’est pas touché');
});

test('le résumé du calendrier ajoute les séances libres sans toucher à l’original', () => {
  const resume = new Map([['2026-12-01', { minutes: 60, cours: ['A'] }]]);
  const m = fusionnerLibres(resume, [
    { jour: '2026-12-01', coursId: 'B', minutes: 45 },
    { jour: '2026-12-01', coursId: 'A', minutes: 30 },
    { jour: '2026-12-02', coursId: 'B', minutes: 45 },
  ]);
  assert.deepEqual(m.get('2026-12-01'), { minutes: 135, cours: ['A', 'B'] }, 'minutes additionnées, matières sans doublon');
  assert.deepEqual(m.get('2026-12-02'), { minutes: 45, cours: ['B'] }, 'un jour sans pages apparaît');
  assert.deepEqual(resume.get('2026-12-01'), { minutes: 60, cours: ['A'] }, 'le résumé d’origine reste intact');
});

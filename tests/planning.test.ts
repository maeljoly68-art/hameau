import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISPONIBILITES_DEFAUT, type Chapitre, type Cours, type Disponibilites } from '../src/core/cours.ts';
import { ajouterJours, ecartJours, jourSemaine } from '../src/core/jours.ts';
import { FENETRE_FINALE, JOURS_SANS_NOUVEAU, dureeRevision, planifier, resumeParJour, seancesDuJour, type EntreePlan, type Seance } from '../src/core/planning.ts';

const AUJ = '2026-11-05'; // jeudi
const PARTIEL = '2026-12-04'; // vendredi, 29 jours plus tard : celui du plan de révision de Droit des sociétés

const dispo = (m: number, libres: string[] = []): Disponibilites => ({ semaine: [m, m, m, m, m, m, m], libres });
const cours = (id: string, partiel: string | null, ordre = 0): Cours => ({ id, titre: id, couleur: '#6b8afd', partiel, lien: null, ordre });
const chap = (coursId: string, ordre: number, extra: Partial<Chapitre> = {}): Chapitre => ({ id: `${coursId}-${ordre}`, coursId, titre: `Ch ${ordre}`, ordre, dureeMin: 30, niveau: 0, derniere: null, prochaine: null, lien: null, ...extra });
const chapitres = (coursId: string, n: number, extra: Partial<Chapitre> = {}) => Array.from({ length: n }, (_, i) => chap(coursId, i, extra));
const plan = (e: Partial<EntreePlan> & Pick<EntreePlan, 'cours' | 'chapitres'>) => planifier({ disponibilites: dispo(60), aujourdhui: AUJ, ...e });
const minutesDe = (s: readonly Seance[], jour: string) => s.filter((x) => x.jour === jour).reduce((t, x) => t + x.minutes, 0);

test('un cours sans rien à faire ne produit aucune séance', () => {
  assert.deepEqual(plan({ cours: [cours('A', PARTIEL)], chapitres: [] }).seances, []);
  assert.deepEqual(plan({ cours: [], chapitres: [] }), { seances: [], alertes: [] });
});

test('le temps d’un jour n’est jamais dépassé, et rien les jours sans disponibilité', () => {
  const d: Disponibilites = { semaine: [45, 30, 60, 0, 90, 0, 120], libres: ['2026-11-12', '2026-11-20'] };
  const p = plan({ cours: [cours('A', PARTIEL), cours('B', '2026-11-27', 1)], chapitres: [...chapitres('A', 12), ...chapitres('B', 8)], disponibilites: d });
  assert.ok(p.seances.length > 10);
  for (const j of new Set(p.seances.map((s) => s.jour))) {
    const cap = d.libres.includes(j) ? 0 : d.semaine[jourSemaine(j)];
    assert.ok(minutesDe(p.seances, j) <= cap, `${j} : ${minutesDe(p.seances, j)} min pour ${cap} possibles`);
  }
  assert.ok(!p.seances.some((s) => s.jour === '2026-11-12' || s.jour === '2026-11-20'), 'jours libres');
  assert.ok(!p.seances.some((s) => jourSemaine(s.jour) === 3 || jourSemaine(s.jour) === 5), 'jeudis et samedis à zéro');
});

test('rien le jour du partiel ni après, et aucune lecture neuve dans les derniers jours', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 10) });
  assert.ok(p.seances.every((s) => ecartJours(s.jour, PARTIEL) >= 1), 'le dernier jour travaillé est la veille');
  const limite = ajouterJours(PARTIEL, -JOURS_SANS_NOUVEAU);
  assert.ok(p.seances.filter((s) => s.type === 'decouverte').every((s) => ecartJours(s.jour, limite) > 0), 'aucune découverte à moins de 4 jours');
});

test('quand le temps suffit : tout est lu avant le partiel, et chaque chapitre a un dernier passage dans la fenêtre finale', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 8), disponibilites: dispo(90) });
  assert.deepEqual(p.alertes, []);
  const debutFenetre = ajouterJours(PARTIEL, -FENETRE_FINALE);
  for (let i = 0; i < 8; i++) {
    const id = `A-${i}`;
    assert.ok(p.seances.some((s) => s.chapitreId === id && s.type === 'decouverte'), `${id} lu`);
    const dernier = p.seances.filter((s) => s.chapitreId === id).at(-1)!;
    assert.ok(ecartJours(debutFenetre, dernier.jour) >= 0, `${id} : dernier passage le ${dernier.jour}, après le ${debutFenetre}`);
  }
});

test('le partiel le plus proche passe en premier', () => {
  const p = plan({ cours: [cours('loin', '2026-12-20', 0), cours('proche', '2026-11-12', 1)], chapitres: [...chapitres('loin', 4), ...chapitres('proche', 4)], disponibilites: dispo(30) });
  assert.equal(p.seances[0].coursId, 'proche', 'même avec « loin » en premier dans la liste');
});

test('une révision en retard passe avant la lecture d’un chapitre neuf', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { niveau: 2, derniere: '2026-11-01', prochaine: '2026-11-02' }), chap('A', 1)], disponibilites: dispo(30) });
  assert.equal(seancesDuJour(p, AUJ)[0].type, 'revision');
  assert.match(seancesDuJour(p, AUJ)[0].raison, /retard de 3 j/);
});

test('une lecture est revue dès le lendemain, puis à intervalles croissants', () => {
  const p = plan({ cours: [cours('A', '2027-02-05')], chapitres: [chap('A', 0)] });
  const jours = p.seances.filter((s) => s.chapitreId === 'A-0').map((s) => s.jour);
  assert.equal(jours[0], AUJ);
  const ecarts = jours.slice(1).map((j, i) => ecartJours(jours[i], j));
  assert.deepEqual(ecarts.slice(0, 4), [1, 3, 7, 14]);
  for (let i = 1; i < ecarts.length - 1; i++) assert.ok(ecarts[i] >= ecarts[i - 1] - 0, 'les écarts ne rétrécissent pas');
});

test('un chapitre déjà bien su n’est pas proposé avant son heure', () => {
  const p = plan({ cours: [cours('A', '2027-02-05')], chapitres: [chap('A', 0, { niveau: 4, derniere: AUJ, prochaine: '2026-11-19' })] });
  assert.ok(p.seances.length > 0);
  assert.equal(p.seances[0].jour, '2026-11-19');
});

test('un chapitre travaillé aujourd’hui n’est pas reproposé aujourd’hui', () => {
  // Dans la fenêtre finale, l'échéance est ramenée au premier jour de la fenêtre : sans garde, il reviendrait le jour même.
  const p = plan({ cours: [cours('A', '2026-11-08')], chapitres: [chap('A', 0, { niveau: 3, derniere: AUJ, prochaine: '2026-11-12' })] });
  assert.ok(!p.seances.some((s) => s.jour === AUJ));
});

test('un chapitre trop long pour une journée se lit sur plusieurs jours, sans dépasser', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { dureeMin: 90 })], disponibilites: dispo(45) });
  const lecture = p.seances.filter((s) => s.type === 'decouverte');
  assert.deepEqual(lecture.map((s) => s.minutes), [45, 45]);
  assert.deepEqual(lecture.map((s) => s.suite), [false, true]);
  assert.equal(lecture[1].jour, ajouterJours(AUJ, 1));
});

test('les chapitres neufs se lisent dans l’ordre', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 5), disponibilites: dispo(120) });
  const ordre = p.seances.filter((s) => s.type === 'decouverte').map((s) => s.chapitreId);
  assert.deepEqual(ordre, ['A-0', 'A-1', 'A-2', 'A-3', 'A-4']);
});

test('quand le temps manque : une alerte chiffrée ; quand il suffit : aucune', () => {
  const trop = plan({ cours: [cours('A', '2026-11-12')], chapitres: chapitres('A', 12), disponibilites: dispo(30) });
  const a = trop.alertes.find((x) => x.type === 'surcharge');
  assert.ok(a && a.type === 'surcharge' && a.minutes > 60, JSON.stringify(trop.alertes));
  assert.deepEqual(plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 3), disponibilites: dispo(120) }).alertes, []);
});

test('une alerte de surcharge compte ce qui n’est pas lu, et ce qui n’a pas son dernier passage', () => {
  // Une seule demi-heure en tout avant le partiel (le jeudi, et le prochain est après) : le chapitre est lu, mais pas revu.
  const p = plan({ cours: [cours('A', '2026-11-10')], chapitres: [chap('A', 0, { dureeMin: 30 })], disponibilites: { semaine: [0, 0, 0, 30, 0, 0, 0], libres: [] } });
  assert.equal(p.seances.length, 1);
  const a = p.alertes.find((x) => x.type === 'surcharge');
  assert.ok(a && a.type === 'surcharge' && a.minutes === dureeRevision({ dureeMin: 30 }));
});

test('sans date de partiel : une alerte, et jamais de « dernier passage »', () => {
  const p = plan({ cours: [cours('A', null)], chapitres: chapitres('A', 3) });
  assert.deepEqual(p.alertes, [{ type: 'sans-date', coursId: 'A' }]);
  assert.ok(p.seances.length > 0);
  assert.ok(!p.seances.some((s) => s.type === 'consolidation'));
});

test('un cours à date passe devant un cours sans date', () => {
  const p = plan({ cours: [cours('sans', null, 0), cours('date', PARTIEL, 1)], chapitres: [...chapitres('sans', 3), ...chapitres('date', 3)], disponibilites: dispo(30) });
  assert.equal(p.seances[0].coursId, 'date');
});

test('un partiel passé est signalé et ne produit rien ; celui d’aujourd’hui ne produit rien non plus', () => {
  const p = plan({ cours: [cours('vieux', '2026-11-01'), cours('jour', AUJ)], chapitres: [...chapitres('vieux', 2), ...chapitres('jour', 2)] });
  assert.deepEqual(p.seances, []);
  assert.deepEqual(p.alertes, [{ type: 'partiel-passe', coursId: 'vieux' }]);
});

test('déterminisme : mêmes données, même plan', () => {
  const e = { cours: [cours('A', PARTIEL), cours('B', '2026-11-20', 1)], chapitres: [...chapitres('A', 9), ...chapitres('B', 6)] };
  assert.deepEqual(plan(e), plan(e));
});

test('le plan ne dépend pas de l’ordre des listes reçues', () => {
  const c = [cours('A', PARTIEL), cours('B', '2026-11-20', 1)];
  const ch = [...chapitres('A', 6), ...chapitres('B', 4)];
  assert.deepEqual(plan({ cours: c, chapitres: ch }), plan({ cours: [...c].reverse(), chapitres: [...ch].reverse() }));
});

test('un chapitre déjà revu pour de bon dans la fenêtre finale n’est pas à refaire', () => {
  const debut = ajouterJours(PARTIEL, -FENETRE_FINALE);
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { niveau: 3, derniere: debut, prochaine: ajouterJours(debut, 7) })], aujourdhui: debut });
  assert.deepEqual(p.alertes, []);
  assert.deepEqual(p.seances, []);
});

test('la durée d’une révision : 40 % de la lecture, jamais sous 10 minutes, par pas de 5', () => {
  assert.equal(dureeRevision({ dureeMin: 30 }), 10);
  assert.equal(dureeRevision({ dureeMin: 60 }), 25);
  assert.equal(dureeRevision({ dureeMin: 5 }), 10);
  assert.equal(dureeRevision({ dureeMin: 240 }), 95);
});

test('résumé par jour : minutes et cours, dans l’ordre d’apparition', () => {
  const p = plan({ cours: [cours('A', PARTIEL), cours('B', '2026-11-20', 1)], chapitres: [...chapitres('A', 3), ...chapitres('B', 3)], disponibilites: dispo(120) });
  const r = resumeParJour(p);
  assert.equal(r.get(AUJ)!.minutes, minutesDe(p.seances, AUJ));
  assert.ok(r.get(AUJ)!.cours.length >= 1);
  assert.equal(new Set(r.get(AUJ)!.cours).size, r.get(AUJ)!.cours.length);
});

test('les disponibilités par défaut donnent un plan', () => {
  const p = planifier({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 6), disponibilites: DISPONIBILITES_DEFAUT, aujourdhui: AUJ });
  assert.ok(p.seances.length > 6);
});

test('même sans assez de temps, on ne lit rien de neuf dans les 3 derniers jours', () => {
  const P = '2026-11-17';
  const p = plan({ cours: [cours('A', P)], chapitres: chapitres('A', 20), disponibilites: dispo(30) });
  const limite = ajouterJours(P, -JOURS_SANS_NOUVEAU);
  const lectures = p.seances.filter((s) => s.type === 'decouverte');
  assert.ok(lectures.length > 5);
  assert.ok(lectures.every((s) => ecartJours(s.jour, limite) > 0), 'aucune lecture à moins de 4 jours du partiel');
  // Sans séances dans ces derniers jours, ce test ne prouverait rien : les révisions y sont bien.
  assert.ok(p.seances.some((s) => ecartJours(limite, s.jour) > 0));
});

test('l’urgence d’un partiel proche l’emporte sur une révision peu pressée d’un cours lointain', () => {
  // Une seule séance possible aujourd'hui : la lecture du cours dont le partiel est dans 8 jours,
  // pas la révision (en retard d'un jour) du cours dont le partiel est dans 40.
  const p = plan({
    cours: [cours('loin', '2026-12-15', 0), cours('proche', '2026-11-13', 1)],
    chapitres: [chap('loin', 0, { niveau: 2, derniere: '2026-11-01', prochaine: '2026-11-04' }), chap('proche', 0)],
    disponibilites: dispo(30),
  });
  assert.deepEqual([p.seances[0].coursId, p.seances[0].type], ['proche', 'decouverte']);
});

test('un dernier passage est ajouté dans la fenêtre finale même si le cycle dirait « bien plus tard »', () => {
  // Chapitre su (niveau 5), revue prévue dans 30 jours : après le partiel. Il doit quand même être revu avant.
  const p = plan({ cours: [cours('A', '2026-11-15')], chapitres: [chap('A', 0, { niveau: 5, derniere: AUJ, prochaine: '2026-12-05' })] });
  assert.equal(p.seances.length, 1);
  assert.equal(p.seances[0].type, 'consolidation');
  assert.equal(p.seances[0].jour, ajouterJours('2026-11-15', -FENETRE_FINALE));
  assert.deepEqual(p.alertes, []);
});

test('jamais deux séances le même jour sur un même chapitre', () => {
  // Partiel dans 4 jours : on lit aujourd'hui, et la fenêtre finale commence AUJOURD'HUI. Sans garde, le dernier passage suivrait aussitôt.
  for (const [partiel, m] of [['2026-11-09', 120], ['2026-11-12', 240], ['2026-11-20', 90]] as const) {
    const p = plan({ cours: [cours('A', partiel)], chapitres: chapitres('A', 3), disponibilites: dispo(m) });
    const paires = p.seances.map((s) => `${s.jour}/${s.chapitreId}`);
    assert.equal(new Set(paires).size, paires.length, `partiel ${partiel}`);
  }
  const p = plan({ cours: [cours('A', '2026-11-09')], chapitres: [chap('A', 0)], disponibilites: dispo(120) });
  assert.deepEqual(p.seances.map((s) => [s.jour, s.type]), [[AUJ, 'decouverte'], [ajouterJours(AUJ, 1), 'consolidation']]);
});

test('avec beaucoup de temps, une révision en retard passe avant la lecture ; avec peu, c’est la lecture', () => {
  const lire = chapitres('A', 10).map((c) => ({ ...c, ordre: c.ordre + 1, id: `A-n${c.ordre}` }));
  const revoir = chap('A', 0, { niveau: 2, derniere: '2026-11-01', prochaine: '2026-11-04' });
  const large = plan({ cours: [cours('A', '2026-11-15')], chapitres: [revoir, ...lire], disponibilites: dispo(240) });
  assert.equal(large.seances[0].type, 'revision', 'le temps ne presse pas : on revoit d’abord');
  const serre = plan({ cours: [cours('A', '2026-11-15')], chapitres: [revoir, ...lire], disponibilites: dispo(20) });
  assert.equal(serre.seances[0].type, 'decouverte', 'le temps presse : on lit d’abord');
});

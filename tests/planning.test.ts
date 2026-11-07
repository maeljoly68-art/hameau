import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISPONIBILITES_DEFAUT, type Chapitre, type Cours, type Disponibilites } from '../src/core/cours.ts';
import { ajouterJours, ecartJours, jourSemaine } from '../src/core/jours.ts';
import { EXAMEN_DUREE_DEFAUT, EXAMEN_FENETRE_DEBUT, EXAMEN_FENETRE_FIN, EXAMEN_MIN, FENETRE_FINALE, FRAGILE_COEF, JOURS_AVANT_DEBUT, JOURS_SANS_NOUVEAU, PART_RAPPEL_PREMIERE, PLEIN_COURS, SEUIL_COURS, capaciteDuJour, estPageExamen, dureeLecture, dureeRevision, planifier, resumeParJour, seancesDuJour, type EntreePlan, type Seance } from '../src/core/planning.ts';

const AUJ = '2026-11-05'; // jeudi
const PARTIEL = '2026-12-04'; // vendredi, 29 jours plus tard : celui du plan de révision de Droit des sociétés

const dispo = (m: number, libres: string[] = []): Disponibilites => ({ semaine: [m, m, m, m, m, m, m], libres });
const cours = (id: string, partiel: string | null, ordre = 0): Cours => ({ id, titre: id, couleur: '#6b8afd', partiel, lien: null, ordre, motifs: '', enPause: false, pratiqueMin: null, revisionLibreMin: null });
const chap = (coursId: string, ordre: number, extra: Partial<Chapitre> = {}): Chapitre => ({ id: `${coursId}-${ordre}`, coursId, titre: `Ch ${ordre}`, ordre, dureeMin: 30, niveau: 0, derniere: null, prochaine: null, lien: null, parCoeur: false, ...extra });
const chapitres = (coursId: string, n: number, extra: Partial<Chapitre> = {}) => Array.from({ length: n }, (_, i) => chap(coursId, i, extra));
// Sauf mention contraire, ces tests parlent de lecture pure (sans le rappel écrit qui suit une première séance) : le rappel
// a ses propres tests plus bas, et ses minutes ne doivent pas brouiller les autres règles (découpe, relecture, temps fait…).
const plan = (e: Partial<EntreePlan> & Pick<EntreePlan, 'cours' | 'chapitres'>) => planifier({ disponibilites: dispo(60), aujourdhui: AUJ, partRappel: 0, ...e });
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

test('un chapitre qui tiendrait entier un autre jour n’est pas coupé en deux', () => {
  // 30 min par jour, des chapitres de 20 : il resterait 10 min après le premier. On ne lit pas la moitié du suivant.
  const p = plan({ cours: [cours('A', '2027-02-05')], chapitres: chapitres('A', 6, { dureeMin: 20 }), disponibilites: dispo(30) });
  const lectures = p.seances.filter((s) => s.type === 'decouverte');
  assert.equal(lectures.length, 6);
  assert.ok(lectures.every((s) => s.minutes === 20 && !s.suite), JSON.stringify(lectures.map((s) => [s.jour, s.minutes, s.suite])));
});

test('mais quand le temps presse, on coupe plutôt que de perdre un jour', () => {
  // Partiel dans 7 jours, beaucoup à lire : mieux vaut lire une moitié de fiche aujourd'hui que rien.
  const p = plan({ cours: [cours('A', '2026-11-12')], chapitres: chapitres('A', 12, { dureeMin: 20 }), disponibilites: dispo(30) });
  assert.ok(p.seances.some((s) => s.type === 'decouverte' && s.suite), 'au moins une lecture reprise le lendemain');
});

// ── Emploi du temps : les jours de cours et les cours qui n'ont pas commencé ──

test('le temps d’un jour baisse avec les heures de cours : progressivement, jusqu’à la réduction réglée', () => {
  const d = (reduction?: number): Disponibilites => ({ semaine: [60, 60, 60, 60, 60, 90, 90], libres: ['2026-11-11'], ...(reduction === undefined ? {} : { reduction }) });
  const cap = (jour: string, minutesDeCours: number, reduction?: number) => capaciteDuJour(d(reduction), jour, minutesDeCours);
  const VENDREDI = '2026-11-06';
  assert.equal(cap(VENDREDI, 0, 50), 60);
  assert.equal(cap(VENDREDI, SEUIL_COURS, 50), 60, 'jusqu’à 4 h de cours, rien ne change');
  assert.equal(cap(VENDREDI, (SEUIL_COURS + PLEIN_COURS) / 2, 50), 45, 'à mi-chemin, la moitié de la réduction');
  assert.equal(cap(VENDREDI, SEUIL_COURS + 30, 50), 55, 'une demi-heure de plus ne fait pas tomber la journée : 60 − 60 × 50 % × 30/240 = 56,25 → 55');
  assert.equal(cap(VENDREDI, PLEIN_COURS, 50), 30);
  // En minutes réelles, pour que le réglage annoncé (4 h → 8 h) ne dérive pas avec les constantes.
  assert.deepEqual([240, 300, 360, 420, 480].map((m) => cap(VENDREDI, m, 50)), [60, 55, 45, 40, 30]);
  assert.equal(cap(VENDREDI, 700, 50), 30, 'au-delà de 8 h, la réduction ne grandit plus');
  assert.equal(cap(VENDREDI, PLEIN_COURS, 0), 60, 'à 0 %, le réglage de la semaine est respecté');
  assert.equal(cap(VENDREDI, PLEIN_COURS, 90), 5, '90 % de 60 min : 6 min, arrondis aux 5 min');
  assert.equal(cap(VENDREDI, PLEIN_COURS), 30, 'sans réglage enregistré : la valeur par défaut');
  assert.equal(cap('2026-11-08', PLEIN_COURS, 50), 45, 'le dimanche, 90 → 45');
  assert.equal(cap('2026-11-11', PLEIN_COURS, 50), 0, 'un jour sans étude reste sans étude');
  // Réglage non multiple de 5 : rendu tel quel sans cours, arrondi aux 5 min avec.
  const bizarre: Disponibilites = { semaine: [47, 47, 47, 47, 47, 47, 47], libres: [], reduction: 50 };
  assert.equal(capaciteDuJour(bizarre, VENDREDI, 0), 47);
  assert.equal(capaciteDuJour(bizarre, VENDREDI, SEUIL_COURS), 47);
  assert.equal(capaciteDuJour(bizarre, VENDREDI, PLEIN_COURS), 25);
});

test('le calendrier ne dépasse jamais le temps d’un jour de cours, et en met moins qu’un jour libre', () => {
  const charge = new Map([['2026-11-06', 480], ['2026-11-12', 360], ['2026-11-13', 480]]);
  const d: Disponibilites = { ...dispo(60), reduction: 50 };
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 14), disponibilites: d, charge });
  for (const [jour, minutesDeCours] of charge) {
    const cap = capaciteDuJour(d, jour, minutesDeCours);
    assert.ok(minutesDe(p.seances, jour) <= cap, `${jour} : ${minutesDe(p.seances, jour)} min pour ${cap} possibles`);
    assert.ok(minutesDe(p.seances, jour) > 0, `${jour} : de quoi travailler quand même`);
  }
  assert.equal(minutesDe(p.seances, '2026-11-07'), 60, 'le samedi sans cours est plein');
  const sans = plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 14), disponibilites: d });
  const avant = (ps: Seance[]) => ps.filter((x) => x.jour < '2026-11-16').reduce((t, x) => t + x.minutes, 0);
  assert.ok(avant(p.seances) < avant(sans.seances), 'moins de temps planifié ces deux premières semaines');
});

test('un jour trop chargé pour un créneau utile reste vide', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 6), disponibilites: { ...dispo(60), reduction: 90 }, charge: new Map([['2026-11-06', 480]]) });
  assert.equal(minutesDe(p.seances, '2026-11-06'), 0, '5 minutes ne valent pas qu’on s’y installe');
  assert.ok(minutesDe(p.seances, '2026-11-07') > 0);
});

test('sans emploi du temps, ou avec des jours de moins de 4 h, le calendrier est celui d’avant', () => {
  const base = { cours: [cours('A', PARTIEL), cours('B', '2026-11-20', 1)], chapitres: [...chapitres('A', 8), ...chapitres('B', 5)] };
  const sansRien = plan(base);
  assert.deepEqual(plan({ ...base, charge: new Map() }), sansRien);
  const legers = new Map<string, number>();
  for (let j = AUJ; ecartJours(j, PARTIEL) >= 0; j = ajouterJours(j, 1)) legers.set(j, SEUIL_COURS);
  assert.deepEqual(plan({ ...base, charge: legers }), sansRien);
  assert.deepEqual(plan({ ...base, debuts: new Map() }), sansRien);
});

test('un cours sans partiel qui n’a pas commencé n’est pas planifié, et ne réclame pas de date', () => {
  const debut = ajouterJours(AUJ, 60);
  const p = plan({ cours: [cours('A', PARTIEL), cours('B', null, 1)], chapitres: [...chapitres('A', 6), ...chapitres('B', 6)], debuts: new Map([['B', debut]]) });
  assert.ok(p.seances.length > 0 && p.seances.every((s) => s.coursId === 'A'));
  assert.deepEqual(p.alertes.filter((a) => a.coursId === 'B'), [{ type: 'pas-commence', coursId: 'B', debut }]);
});

test('un mois avant son premier cours, il entre dans le calendrier', () => {
  const avec = (n: number) => plan({ cours: [cours('B', null)], chapitres: chapitres('B', 4), debuts: new Map([['B', ajouterJours(AUJ, n)]]) });
  assert.ok(avec(JOURS_AVANT_DEBUT).seances.length > 0, 'à 28 jours : on commence à le préparer');
  assert.deepEqual(avec(JOURS_AVANT_DEBUT).alertes, [{ type: 'sans-date', coursId: 'B' }]);
  assert.equal(avec(JOURS_AVANT_DEBUT + 1).seances.length, 0, 'à 29 jours : pas encore');
  assert.ok(avec(0).seances.length > 0, 'un cours qui commence aujourd’hui');
  assert.ok(avec(-100).seances.length > 0, 'un cours commencé depuis longtemps');
});

test('lire un chapitre en avance, ou avoir une date de partiel, fait entrer un cours pas commencé', () => {
  const debuts = new Map([['B', ajouterJours(AUJ, 90)]]);
  const enAvance = plan({ cours: [cours('B', null)], chapitres: [chap('B', 0, { niveau: 1, derniere: AUJ, prochaine: ajouterJours(AUJ, 1) }), chap('B', 1)], debuts });
  assert.ok(enAvance.seances.some((s) => s.coursId === 'B'), 'déjà un chapitre lu');
  assert.ok(!enAvance.alertes.some((a) => a.type === 'pas-commence'));
  const datee = plan({ cours: [cours('B', PARTIEL)], chapitres: chapitres('B', 4), debuts });
  assert.ok(datee.seances.length > 0 && !datee.alertes.some((a) => a.type === 'pas-commence'), 'avec un partiel, le cours compte');
});

// ---- Vitesse d'apprentissage ----

test('ta vitesse allonge (ou raccourcit) toutes les durées : lecture, révision, et ce qui manque', () => {
  // 3 chapitres de 30 min : à la vitesse 1 on en lit deux par jour de 60 min, à la vitesse 2 un seul.
  const base = { cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 3), disponibilites: dispo(60) };
  const normal = seancesDuJour(plan(base), AUJ);
  assert.deepEqual(normal.map((s) => s.minutes), [30, 30]);
  const lent = seancesDuJour(plan({ ...base, disponibilites: { ...dispo(60), vitesse: 2 } }), AUJ);
  assert.deepEqual(lent.map((s) => s.minutes), [60], 'un chapitre de 30 min en prend 60');
  const vite = seancesDuJour(plan({ ...base, disponibilites: { ...dispo(60), vitesse: 0.5 } }), AUJ);
  assert.deepEqual(vite.map((s) => s.minutes), [15, 15, 15, 15].slice(0, vite.length), 'et 15 si tu vas deux fois plus vite');
  assert.ok(vite.length >= 3);
  assert.ok(vite.every((s) => !s.suite && s.complete && s.raison.startsWith('À découvrir')), 'à 0,5 un chapitre neuf n’est pas déjà « commencé »');
  // Coupé par manque de temps à la vitesse 2 (60 min pour 40 par jour) : la suite est une suite.
  const coupe = plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 1), disponibilites: { ...dispo(40), vitesse: 2 } }).seances.filter((x) => x.type === 'decouverte');
  assert.deepEqual(coupe.map((s) => [s.minutes, s.suite, s.complete]), [[40, false, false], [20, true, true]]);
  // Une révision aussi : 30 min × 2 × 40 % = 24 → 25 ; à la vitesse 1 : 12 → 10.
  assert.equal(dureeRevision({ dureeMin: 30 }, 2), 25);
  assert.equal(dureeRevision({ dureeMin: 30 }), 10);
  const rev = (v: number) => seancesDuJour(plan({ cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { niveau: 2, derniere: '2026-11-01', prochaine: AUJ })], disponibilites: { ...dispo(60), vitesse: v } }), AUJ)[0];
  assert.equal(rev(2).minutes, 25);
  assert.equal(rev(1).minutes, 10);
  // Ce qui manque avant le partiel est chiffré à ta vitesse.
  const manque = (v: number) => plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 2), disponibilites: { ...dispo(0), vitesse: v } }).alertes.find((a) => a.type === 'surcharge');
  assert.deepEqual(manque(1), { type: 'surcharge', coursId: 'A', minutes: 60 });
  assert.deepEqual(manque(2), { type: 'surcharge', coursId: 'A', minutes: 120 });
  // Idem pour un dernier passage qui manque : 40 % de 30 min = 10 min, 25 min à la vitesse 2.
  const dernierPassage = (v: number) => plan({ cours: [cours('A', '2026-11-12')], chapitres: [chap('A', 0, { niveau: 2, derniere: '2026-11-01', prochaine: '2026-11-08' })], disponibilites: { ...dispo(0), vitesse: v } }).alertes.find((a) => a.type === 'surcharge');
  assert.deepEqual(dernierPassage(1), { type: 'surcharge', coursId: 'A', minutes: 10 });
  assert.deepEqual(dernierPassage(2), { type: 'surcharge', coursId: 'A', minutes: 25 });
});

test('la vitesse 1 ne change rien : 47 min restent 47 min, une vitesse absurde revient dans ses bornes', () => {
  assert.equal(dureeLecture({ dureeMin: 47 }, 1, 0), 47);
  assert.equal(dureeLecture({ dureeMin: 40 }, 2.5, 0), 100);
  assert.equal(dureeLecture({ dureeMin: 40 }, 99, 0), 100, 'plafonnée à 2,5');
  assert.equal(dureeLecture({ dureeMin: 40 }, Number.NaN, 0), 40, 'illisible : 1');
  assert.equal(dureeLecture({ dureeMin: 5 }, 0.01, 0), 5, 'jamais sous 5 min');
  assert.equal(dureeLecture({ dureeMin: 40 }, 0.5, 0), 20);
});

// ---- Cours en pause ----

test('un cours en pause n’a ni séance ni alerte, et ne change rien au reste du calendrier', () => {
  const sansPause = plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 6), disponibilites: dispo(60) });
  const pause = { ...cours('P', null, 1), enPause: true };
  const avec = plan({ cours: [cours('A', PARTIEL), pause], chapitres: [...chapitres('A', 6), ...chapitres('P', 5)], disponibilites: dispo(60) });
  assert.deepEqual(avec, sansPause, 'comme si le cours en pause n’existait pas');
  assert.ok(!avec.seances.some((s) => s.coursId === 'P'));
  assert.ok(!avec.alertes.some((a) => a.coursId === 'P'), 'pas même « sans date »');
  // Remis en route, il revient (la pause est bien ce qui l’écartait).
  const repris = plan({ cours: [cours('A', PARTIEL), { ...pause, enPause: false }], chapitres: [...chapitres('A', 6), ...chapitres('P', 5)], disponibilites: dispo(60) });
  assert.ok(repris.seances.some((s) => s.coursId === 'P'));
  assert.ok(repris.alertes.some((a) => a.type === 'sans-date' && a.coursId === 'P'));
});

// ---- Séance finie ou coupée, retard ----

test('une lecture coupée sur plusieurs jours n’est « finie » que le dernier jour', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { dureeMin: 100 })], disponibilites: dispo(60) });
  const lectures = p.seances.filter((s) => s.type === 'decouverte');
  assert.deepEqual(lectures.map((s) => [s.minutes, s.complete]), [[60, false], [40, true]]);
  const revision = plan({ cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { niveau: 2, derniere: '2026-11-01', prochaine: AUJ })] }).seances[0];
  assert.equal(revision.complete, true, 'une révision tient toujours dans sa séance');
});

test('une séance dit de combien de jours elle est en retard', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { niveau: 2, derniere: '2026-10-30', prochaine: '2026-11-02' }), chap('A', 1, { niveau: 2, derniere: '2026-11-02', prochaine: AUJ })], disponibilites: dispo(60) });
  const du = seancesDuJour(p, AUJ);
  const enRetard = du.find((s) => s.chapitreId === 'A-0')!;
  const alHeure = du.find((s) => s.chapitreId === 'A-1')!;
  assert.equal(enRetard.retard, 3);
  assert.equal(enRetard.raison, 'En retard de 3 j');
  assert.equal(alHeure.retard, 0);
  assert.ok(p.seances.filter((s) => s.type === 'decouverte').every((s) => s.retard === 0));
});

// ---- Relecture les jours de cours ----

const COURS_2H = new Map<string, number>([[AUJ, 120]]); // 2 h de cours : pas de réduction de temps
const tousLesJours = (n: number) => new Map<string, number>(Array.from({ length: n }, (_, i): [string, number] => [ajouterJours(AUJ, i), 120]));
const dispoRel = (m = 90, relecture = 30): Disponibilites => ({ ...dispo(m), relecture });
/** Des chapitres déjà vus, pas dus avant la fenêtre finale : ni découverte ni révision ne les concernent. */
const lus = (coursId: string, derniers: string[]) => derniers.map((d, i) => chap(coursId, i, { niveau: 3, derniere: d, prochaine: '2026-12-30' }));
const relectures = (p: { seances: Seance[] }, jour?: string) => p.seances.filter((s) => s.type === 'relecture' && (jour === undefined || s.jour === jour));

test('un jour de cours, 30 min de relecture : les pages les moins récemment vues, jamais plus que le bloc', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: lus('A', ['2026-10-26', '2026-10-20', '2026-10-24', '2026-10-22', '2026-10-28', '2026-10-21']), disponibilites: dispoRel(), charge: COURS_2H });
  const du = seancesDuJour(p, AUJ);
  assert.deepEqual(du.map((s) => s.type), ['relecture', 'relecture', 'relecture']);
  assert.deepEqual(du.map((s) => s.chapitreId), ['A-1', 'A-5', 'A-3'], 'les plus anciennes d’abord : 20, 21 et 22 octobre');
  assert.equal(minutesDe(p.seances, AUJ), 30);
  assert.ok(du.every((s) => s.complete && s.retard === 0 && !s.suite));
  assert.match(du[0].raison, /^Relecture avant le partiel \(dans 29 j\)$/);
});

test('sans cours ce jour-là, ou sans emploi du temps, ou sans minutes de relecture : aucune relecture', () => {
  const base = { cours: [cours('A', PARTIEL)], chapitres: lus('A', ['2026-10-20', '2026-10-21', '2026-10-22']) };
  assert.equal(relectures(plan({ ...base, disponibilites: dispoRel() })).length, 0, 'emploi du temps inconnu');
  assert.equal(relectures(plan({ ...base, disponibilites: dispoRel(), charge: new Map([[AUJ, 0]]) })).length, 0, 'zéro minute de cours');
  assert.equal(relectures(plan({ ...base, disponibilites: dispoRel(90, 0), charge: COURS_2H })).length, 0, 'bloc à 0');
  assert.equal(relectures(plan({ ...base, disponibilites: dispo(90), charge: COURS_2H })).length, 0, 'réglage absent');
  const unJour = relectures(plan({ ...base, disponibilites: dispoRel(), charge: COURS_2H }));
  assert.ok(unJour.length > 0 && unJour.every((s) => s.jour === AUJ), 'seulement le jour de cours');
});

test('la relecture passe avant toute lecture neuve, et ce qu’elle ne remplit pas retourne à la journée', () => {
  const premier = plan({ cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { niveau: 3, derniere: '2026-10-25', prochaine: '2026-12-30' }), ...chapitres('A', 4, { dureeMin: 40 }).map((c) => ({ ...c, id: `N-${c.ordre}`, ordre: c.ordre + 1 }))], disponibilites: dispoRel(), charge: COURS_2H });
  const du = seancesDuJour(premier, AUJ);
  assert.equal(du[0].type, 'relecture');
  assert.equal(du[0].chapitreId, 'A-0');
  assert.ok(du.slice(1).every((s) => s.type === 'decouverte'));
  assert.equal(minutesDe(premier.seances, AUJ), 90, 'la relecture prend 10 min, les 80 autres vont à la lecture');
  // Rien à relire : le bloc de 30 min n'est pas perdu.
  const neuf = plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 6), disponibilites: dispoRel(), charge: COURS_2H });
  assert.equal(relectures(neuf).length, 0);
  assert.equal(minutesDe(neuf.seances, AUJ), 90);
});

test('la relecture ne dépasse ni son bloc ni le temps du jour', () => {
  const chs = lus('A', ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  const sur = (m: number, rel: number) => plan({ cours: [cours('A', PARTIEL)], chapitres: chs, disponibilites: dispoRel(m, rel), charge: COURS_2H });
  assert.equal(minutesDe(relectures(sur(90, 30)).filter((s) => s.jour === AUJ), AUJ), 30);
  assert.equal(minutesDe(relectures(sur(90, 20)).filter((s) => s.jour === AUJ), AUJ), 20, 'bloc réglé à 20');
  assert.equal(minutesDe(relectures(sur(20, 30)).filter((s) => s.jour === AUJ), AUJ), 20, 'le temps du jour borne le bloc');
  assert.equal(relectures(sur(5, 30)).length, 0, 'moins de 10 min : pas la peine');
  const libre = plan({ cours: [cours('A', PARTIEL)], chapitres: chs, disponibilites: { ...dispoRel(), libres: [AUJ] }, charge: COURS_2H });
  assert.equal(relectures(libre).length, 0, 'un jour sans étude reste sans étude');
});

test('on ne relit pas ce que le cycle demande ce jour-là (c’est la révision, notée), ni ce qu’on a touché hier', () => {
  const du = (derniere: string, prochaine: string) => seancesDuJour(plan({ cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { niveau: 3, derniere, prochaine })], disponibilites: dispoRel(), charge: COURS_2H }), AUJ);
  assert.deepEqual(du('2026-10-20', AUJ).map((s) => s.type), ['revision'], 'dû aujourd’hui : révision');
  assert.deepEqual(du('2026-10-20', '2026-11-02').map((s) => s.type), ['revision'], 'en retard : révision');
  assert.deepEqual(du('2026-10-20', '2026-11-09').map((s) => s.type), ['relecture'], 'pas dû : relecture');
  assert.deepEqual(du('2026-11-04', '2026-11-09').map((s) => s.type), [], 'touché hier : pas relu');
  assert.deepEqual(du('2026-11-03', '2026-11-09').map((s) => s.type), ['relecture'], 'touché avant-hier : relu');
  assert.deepEqual(du(AUJ, '2026-11-09').map((s) => s.type), [], 'touché aujourd’hui : pas relu');
});

test('le cours dont le partiel est le plus proche est relu en premier', () => {
  const p = plan({
    cours: [cours('loin', '2026-12-20', 0), cours('proche', '2026-11-16', 1)],
    chapitres: [...lus('loin', ['2026-10-01', '2026-10-02', '2026-10-03']), ...lus('proche', ['2026-10-25', '2026-10-26', '2026-10-27'])],
    disponibilites: dispoRel(),
    charge: COURS_2H,
  });
  assert.deepEqual(seancesDuJour(p, AUJ).map((s) => s.coursId), ['proche', 'proche', 'proche'], 'même si « loin » est bien plus ancien');
  for (const [ordreSans, ordreDate] of [[0, 1], [1, 0]]) {
    const sansDate = plan({ cours: [cours('sans', null, ordreSans), cours('date', '2026-12-20', ordreDate), cours('tard', '2027-01-20', 2)], chapitres: [...lus('sans', ['2026-10-01']), ...lus('date', ['2026-10-25']), ...lus('tard', ['2026-10-02'])], disponibilites: dispoRel(), charge: COURS_2H });
    assert.deepEqual(seancesDuJour(sansDate, AUJ).map((s) => s.coursId), ['date', 'tard', 'sans'], `un cours sans date passe après tous les autres (ordres ${ordreSans}/${ordreDate})`);
  }
});

test('la relecture fait le tour des pages au lieu de reprendre toujours les mêmes', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: lus('A', ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']), disponibilites: dispoRel(), charge: tousLesJours(7) });
  const par = (j: number) => relectures(p, ajouterJours(AUJ, j)).map((s) => s.chapitreId);
  assert.deepEqual(par(0), ['A-0', 'A-1', 'A-2']);
  assert.deepEqual(par(1), ['A-3', 'A-4'], 'les trois d’hier sont écartées, il en reste deux');
  assert.deepEqual(par(2), ['A-0', 'A-1', 'A-2'], 'et on recommence');
  for (let j = 0; j < 6; j++) assert.ok(!par(j).some((id) => par(j + 1).includes(id)), `jamais la même page deux jours de suite (jour ${j})`);
});

test('relire ne fait pas avancer le cycle : la révision reste à sa date', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { niveau: 2, derniere: '2026-11-01', prochaine: '2026-11-08' })], disponibilites: dispoRel(), charge: COURS_2H });
  assert.deepEqual(seancesDuJour(p, AUJ).map((s) => s.type), ['relecture']);
  const rev = p.seances.find((s) => s.type === 'revision')!;
  assert.equal(rev.jour, '2026-11-08');
  assert.equal(rev.raison, 'Révision espacée (niveau 2)', 'toujours le niveau 2 : la relecture ne l’a pas monté');
});

test('un cours en pause n’est pas relu, ni un partiel passé', () => {
  const p = plan({ cours: [{ ...cours('P', PARTIEL), enPause: true }, cours('Z', '2026-11-01', 1)], chapitres: [...lus('P', ['2026-10-20']), ...lus('Z', ['2026-10-20'])], disponibilites: dispoRel(), charge: COURS_2H });
  assert.deepEqual(p.seances, []);
});

test('pas de relecture d’un cours après son partiel, même si un autre cours prolonge le calendrier', () => {
  const p = plan({ cours: [cours('A', '2026-11-10'), cours('B', '2026-11-30', 1)], chapitres: [...lus('A', ['2026-10-20', '2026-10-21', '2026-10-22']), ...lus('B', ['2026-10-23'])], disponibilites: dispoRel(), charge: tousLesJours(30) });
  const deA = relectures(p).filter((s) => s.coursId === 'A');
  assert.ok(deA.length > 0, 'A est relu avant son partiel');
  assert.ok(deA.every((s) => ecartJours(s.jour, '2026-11-10') >= 1), 'jamais le jour du partiel ni après');
});

test('la relecture suit ta vitesse : une page plus longue à relire en laisse moins dans le bloc', () => {
  const chs = lus('A', ['2026-10-20', '2026-10-21', '2026-10-22']);
  const du = (v: number) => seancesDuJour(plan({ cours: [cours('A', PARTIEL)], chapitres: chs, disponibilites: { ...dispoRel(), vitesse: v }, charge: COURS_2H }), AUJ).map((s) => s.minutes);
  assert.deepEqual(du(1), [10, 10, 10]);
  assert.deepEqual(du(2), [25], '30 × 2 × 40 % = 24 → 25 min ; les 5 min restantes ne valent pas une page');
});

test('une page dont on ne sait pas quand elle a été vue passe pour la plus ancienne, où qu’elle soit dans le cours', () => {
  for (const nul of [0, 2]) {
    const chs = [0, 1, 2].map((i) => chap('A', i, { niveau: 3, derniere: i === nul ? null : `2026-10-2${i}`, prochaine: '2026-12-30' }));
    const p = plan({ cours: [cours('A', PARTIEL)], chapitres: chs, disponibilites: dispoRel(10), charge: COURS_2H });
    assert.deepEqual(seancesDuJour(p, AUJ).map((s) => s.chapitreId), [`A-${nul}`], `page ${nul} sans date, 10 min : une seule page, celle-là`);
  }
});

test('la relecture est prise sur le temps du jour : la lecture neuve n’a que le reste', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: [...lus('A', ['2026-10-20', '2026-10-21', '2026-10-22']), ...chapitres('A', 4).map((c) => ({ ...c, id: `N-${c.ordre}`, ordre: c.ordre + 3 }))], disponibilites: dispoRel(), charge: COURS_2H });
  const du = seancesDuJour(p, AUJ);
  assert.deepEqual(du.map((s) => s.type), ['relecture', 'relecture', 'relecture', 'decouverte', 'decouverte']);
  assert.equal(minutesDe(p.seances, AUJ), 90, '30 de relecture + 2 chapitres de 30, pas 3 : le jour ne dépasse pas ses 90 min');
});

test('à ancienneté égale, la page la moins sue est relue d’abord', () => {
  const vue = { derniere: '2026-10-20', prochaine: '2026-12-30' };
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { niveau: 4, ...vue }), chap('A', 1, { niveau: 2, ...vue }), chap('A', 2, { niveau: 3, ...vue })], disponibilites: dispoRel(), charge: COURS_2H });
  assert.deepEqual(seancesDuJour(p, AUJ).map((s) => s.chapitreId), ['A-1', 'A-2', 'A-0']);
});

// ---- Ce qui est déjà fait aujourd'hui ----

test('ce qui est déjà fait aujourd’hui compte sur le temps d’aujourd’hui : valider ne fait pas apparaître une autre séance à la place', () => {
  // 60 min par jour, 30 déjà lues aujourd'hui (cran 1, dernier passage aujourd'hui) : il en reste 30.
  const fait = chap('A', 0, { niveau: 1, derniere: AUJ, prochaine: '2026-11-06' });
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: [fait, ...chapitres('A', 6).slice(1).map((c) => ({ ...c, ordre: c.ordre }))], disponibilites: dispo(60) });
  assert.equal(minutesDe(p.seances, AUJ), 30, 'une seule lecture de plus aujourd’hui');
  const sansFait = plan({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 6), disponibilites: dispo(60) });
  assert.equal(minutesDe(sansFait.seances, AUJ), 60, 'sans rien de fait : deux lectures');
  assert.ok(minutesDe(p.seances, '2026-11-06') >= 40, 'demain, la journée n’est pas rognée');
  // Tout le temps est déjà pris : plus rien aujourd'hui, mais le calendrier continue.
  const deux = [fait, chap('A', 1, { niveau: 1, derniere: AUJ, prochaine: '2026-11-06' }), ...chapitres('A', 6).slice(2)];
  const plein = plan({ cours: [cours('A', PARTIEL)], chapitres: deux, disponibilites: dispo(60) });
  assert.deepEqual(seancesDuJour(plein, AUJ), []);
  assert.ok(plein.seances.length > 0 && plein.seances.every((s) => s.jour > AUJ));
});

test('un passage de révision déjà fait aujourd’hui coûte une durée de révision, pas de lecture', () => {
  const revu = chap('A', 0, { dureeMin: 30, niveau: 3, derniere: AUJ, prochaine: '2026-11-12' }); // 10 min de révision
  // Des pages neuves de 20 min : il reste 60 − 10 = 50 min, donc deux lectures (40 min), pas une seule (30 min restants si la
  // révision était comptée comme une lecture de 30 min).
  const neuves = (n: number, dureeMin: number) => chapitres('A', n + 1, { dureeMin }).slice(1);
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: [revu, ...neuves(6, 20)], disponibilites: dispo(60) });
  assert.equal(minutesDe(p.seances, AUJ), 40);
  // À la vitesse 2, la révision dure 25 min (pas 10) et une page de 10 min en demande 20 : il reste 35 min, soit une seule lecture.
  const lent = plan({ cours: [cours('A', PARTIEL)], chapitres: [revu, ...neuves(6, 10)], disponibilites: { ...dispo(60), vitesse: 2 } });
  assert.equal(minutesDe(lent.seances, AUJ), 20);
  // Et une première lecture faite aujourd'hui à la vitesse 2 compte à cette vitesse : 30 min d'estimation = 60 min passées.
  const lue = chap('A', 0, { dureeMin: 30, niveau: 1, derniere: AUJ, prochaine: '2026-11-06' });
  const lente = plan({ cours: [cours('A', PARTIEL)], chapitres: [lue, ...neuves(6, 15)], disponibilites: { ...dispo(90), vitesse: 2 } });
  assert.equal(minutesDe(lente.seances, AUJ), 30, '90 − 60 = 30 min : une seule page de 30 min (15 × 2)');
});

test('la journée commencée, la relecture ne revient pas après chaque validation', () => {
  const lus3 = lus('A', ['2026-10-20', '2026-10-21', '2026-10-22']);
  const sans = plan({ cours: [cours('A', PARTIEL)], chapitres: lus3, disponibilites: dispoRel(), charge: tousLesJours(3) });
  assert.equal(relectures(sans, AUJ).length, 3);
  // Une page déjà relue aujourd'hui (dernier passage aujourd'hui) : le bloc d'aujourd'hui est fait, demain il reviendra.
  const apres = plan({ cours: [cours('A', PARTIEL)], chapitres: [{ ...lus3[0], derniere: AUJ }, lus3[1], lus3[2]], disponibilites: dispoRel(), charge: tousLesJours(3) });
  assert.equal(relectures(apres, AUJ).length, 0);
  assert.ok(relectures(apres, ajouterJours(AUJ, 2)).length > 0, 'les jours suivants, la relecture continue');
});

test('le temps déjà fait ne compte que pour aujourd’hui, et pas ce qui a été fait un autre jour', () => {
  const hier = chap('A', 0, { niveau: 3, derniere: '2026-11-04', prochaine: '2026-11-20' });
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: [hier, ...chapitres('A', 4).slice(1)], disponibilites: dispo(60) });
  assert.equal(minutesDe(p.seances, AUJ), 60, 'un travail d’hier ne mange pas la journée d’aujourd’hui');
});

// ---- Pages fragiles ----

test('une page fragile passe devant une page de même urgence ; sans elle, c’est l’ordre du cours', () => {
  const p0 = chap('A', 0, { niveau: 2, derniere: '2026-11-01', prochaine: AUJ });
  const p1 = chap('A', 1, { niveau: 2, derniere: '2026-11-01', prochaine: AUJ });
  const unCreneau = (fragiles?: string[]) => plan({ cours: [cours('A', PARTIEL)], chapitres: [p0, p1], disponibilites: dispo(10), fragiles: fragiles ? new Set(fragiles) : undefined }).seances[0];
  assert.equal(unCreneau().chapitreId, 'A-0');
  assert.equal(unCreneau().fragile, false);
  assert.equal(unCreneau(['A-1']).chapitreId, 'A-1', 'la page fragile prend l’unique créneau');
  assert.equal(unCreneau(['A-1']).fragile, true);
  assert.equal(unCreneau(['A-0']).chapitreId, 'A-0');
  assert.equal(unCreneau([]).chapitreId, 'A-0', 'un ensemble vide ne change rien');
});

test('la priorité d’une page fragile est un coup de pouce, pas un passe-droit', () => {
  assert.equal(FRAGILE_COEF, 1.5);
  const base = (retard1: number, fragile: boolean) => {
    const autre = chap('A', 0, { niveau: 2, derniere: '2026-10-20', prochaine: ajouterJours(AUJ, -retard1) });
    const page = chap('A', 1, { niveau: 2, derniere: '2026-11-01', prochaine: AUJ });
    return plan({ cours: [cours('A', PARTIEL)], chapitres: [autre, page], disponibilites: dispo(10), fragiles: fragile ? new Set(['A-1']) : undefined }).seances[0].chapitreId;
  };
  assert.equal(base(2, true), 'A-0', 'deux jours de retard : 4 contre 2 × 1,5 = 3');
  assert.equal(base(0, true), 'A-1', 'à l’heure : la fragile devant (3 contre 2)');
  assert.equal(base(0, false), 'A-0', 'sans le coup de pouce, l’ordre du cours');
});

test('le dernier passage avant le partiel : la page fragile d’abord', () => {
  const pages = [chap('A', 0, { niveau: 3, derniere: '2026-10-25', prochaine: '2026-12-20' }), chap('A', 1, { niveau: 3, derniere: '2026-10-25', prochaine: '2026-12-20' })];
  const du = (fragiles?: string[]) => plan({ cours: [cours('A', '2026-11-08')], chapitres: pages, disponibilites: dispo(10), fragiles: fragiles ? new Set(fragiles) : undefined }).seances[0];
  assert.equal(du().type, 'consolidation');
  assert.equal(du().chapitreId, 'A-0');
  assert.equal(du(['A-1']).chapitreId, 'A-1');
  assert.equal(du(['A-1']).type, 'consolidation');
});

test('toute séance dit si sa page est fragile : relecture comprise', () => {
  const p = plan({ cours: [cours('A', PARTIEL)], chapitres: lus('A', ['2026-10-20', '2026-10-21']), disponibilites: dispoRel(), charge: COURS_2H, fragiles: new Set(['A-1']) });
  const du = seancesDuJour(p, AUJ);
  assert.deepEqual(du.map((s) => [s.type, s.chapitreId, s.fragile]), [['relecture', 'A-0', false], ['relecture', 'A-1', true]]);
  assert.ok(p.seances.every((s) => typeof s.fragile === 'boolean'));
});

// ---- Examen blanc ----

const SEM = (m = 90, we = 180): Disponibilites => ({ semaine: [m, m, m, m, m, we, we], libres: [] });
const avecTd = (id: string, n = 3) => [...chapitres(id, n), chap(id, n, { titre: 'TD1 corrigé · SAS' })];
const examens = (p: { seances: Seance[] }) => p.seances.filter((s) => s.type === 'examen');

test('quelles pages servent d’examen blanc : sujets, TD, exercices — pas les fiches', () => {
  for (const t of ['TD1 corrigé · SAS', 'TD2 corrigé · SA', 'td', 'E1 · La Ferrière', 'E3 · Diagnostic d’équipe', 'Exercices corrigés', 'Sujets d’examen corrigés', 'Sujet 2', 'Examen blanc', 'Révision · Sujets d’examen']) assert.equal(estPageExamen(t), true, t);
  for (const t of ['Fiche 1 · Bases', 'Flashcards', 'Quiz', 'Fiche formules', 'Fiche 12 · Les pièges', 'Fiche 2 · Les statuts', 'Partie 7', 'Calcul', 'Fiche mémo', 'ATD', 'E · sans numéro', '1.1 · Définition & grands auteurs']) assert.equal(estPageExamen(t), false, t);
});

test('un examen blanc : le jour le plus libre de la fenêtre, le plus tard possible, sur un sujet, à la durée de l’épreuve', () => {
  // Partiel mercredi 25 novembre : fenêtre du 11 au 21. Les jours libres de 3 h sont les 14, 15 et 21 : le dernier l'emporte.
  const p = plan({ cours: [cours('A', '2026-11-25')], chapitres: avecTd('A'), disponibilites: SEM() });
  const [ex, ...autres] = examens(p);
  assert.deepEqual(autres, [], 'un seul');
  assert.equal(ex.jour, '2026-11-21');
  assert.equal(ex.chapitreId, 'A-3', 'le TD');
  assert.equal(ex.minutes, EXAMEN_DUREE_DEFAUT);
  assert.equal(ex.raison, 'Examen blanc · partiel dans 4 j');
  assert.deepEqual([ex.suite, ex.complete, ex.retard, ex.fragile], [false, true, 0, false]);
});

test('la durée d’un examen blanc est celle de l’épreuve, plafonnée au temps du jour', () => {
  const duree = (m: number | undefined) => examens(plan({ cours: [cours('A', '2026-11-25')], chapitres: avecTd('A'), disponibilites: SEM(), examens: m === undefined ? undefined : new Map([['A', m]]) }))[0].minutes;
  assert.equal(duree(undefined), 90);
  assert.equal(duree(120), 120);
  assert.equal(duree(60), 60);
  assert.equal(duree(300), 180, 'plafonnée aux 3 h du jour');
});

test('l’examen blanc reste dans la fenêtre : de 14 à 4 jours avant le partiel', () => {
  assert.equal(EXAMEN_FENETRE_DEBUT, 14);
  assert.equal(EXAMEN_FENETRE_FIN, 4);
  for (const partiel of ['2026-11-25', '2026-12-04', '2026-12-20', '2027-01-15']) {
    const ex = examens(plan({ cours: [cours('A', partiel)], chapitres: avecTd('A'), disponibilites: SEM() }));
    assert.equal(ex.length, 1, partiel);
    assert.ok(ecartJours(ex[0].jour, partiel) >= EXAMEN_FENETRE_FIN && ecartJours(ex[0].jour, partiel) <= EXAMEN_FENETRE_DEBUT, `${partiel} : examen le ${ex[0].jour}`);
  }
  // Tous les jours se valent : le plus tard de la fenêtre (4 jours avant), et pas avant le 14e jour même.
  assert.equal(examens(plan({ cours: [cours('A', '2026-12-04')], chapitres: avecTd('A'), disponibilites: SEM(60, 60) }))[0].jour, '2026-11-30');
});

test('le partiel proche : la fenêtre commence aujourd’hui, et trop proche, il n’y en a plus', () => {
  // Partiel le 11 : la fenêtre va du 5 (aujourd'hui) au 7 — vendredi 6 et samedi 7 sont possibles, le samedi est le plus libre.
  const ex = examens(plan({ cours: [cours('A', '2026-11-11')], chapitres: avecTd('A'), disponibilites: SEM() }));
  assert.deepEqual(ex.map((s) => s.jour), ['2026-11-07']);
  assert.deepEqual(examens(plan({ cours: [cours('A', '2026-11-08')], chapitres: avecTd('A'), disponibilites: SEM() })).map((s) => s.jour), ['2026-11-05'.replace('05', '05')].filter((j) => ecartJours(j, '2026-11-08') >= EXAMEN_FENETRE_FIN), 'partiel dans 3 jours : fenêtre vide');
  assert.deepEqual(examens(plan({ cours: [cours('A', '2026-11-09')], chapitres: avecTd('A'), disponibilites: SEM() })).map((s) => s.jour), ['2026-11-05'], 'partiel dans 4 jours : seul aujourd’hui reste');
});

test('pas d’examen blanc sans sujet, sans partiel, en pause, déjà fait, ou le partiel passé', () => {
  const sans = (extra: Partial<EntreePlan> & Pick<EntreePlan, 'cours' | 'chapitres'>) => examens(plan({ disponibilites: SEM(), ...extra })).length;
  assert.equal(sans({ cours: [cours('A', '2026-11-25')], chapitres: chapitres('A', 4) }), 0, 'que des fiches');
  assert.equal(sans({ cours: [cours('A', null)], chapitres: avecTd('A') }), 0, 'sans date');
  assert.equal(sans({ cours: [{ ...cours('A', '2026-11-25'), enPause: true }], chapitres: avecTd('A') }), 0, 'en pause');
  assert.equal(sans({ cours: [cours('A', '2026-11-25')], chapitres: avecTd('A'), examensFaits: new Set(['A']) }), 0, 'déjà passé récemment');
  assert.equal(sans({ cours: [cours('A', '2026-11-01')], chapitres: avecTd('A') }), 0, 'partiel passé');
  assert.equal(sans({ cours: [cours('A', AUJ)], chapitres: avecTd('A') }), 0, 'partiel aujourd’hui');
  assert.equal(sans({ cours: [cours('A', '2026-11-25')], chapitres: avecTd('A'), examensFaits: new Set(['B']) }), 1, 'l’examen d’une autre matière ne dispense pas');
});

test('il faut au moins 45 minutes libres pour un examen blanc', () => {
  assert.equal(EXAMEN_MIN, 45);
  const exam = (m: number) => examens(plan({ cours: [cours('A', '2026-11-25')], chapitres: avecTd('A'), disponibilites: SEM(m, m) }));
  assert.equal(exam(44).length, 0);
  const ex = exam(45);
  assert.equal(ex.length, 1);
  assert.equal(ex[0].minutes, 45, 'la durée tient dans le temps du jour');
  // Un jour libre n'est pas candidat.
  const libres = Array.from({ length: 11 }, (_, i) => ajouterJours('2026-11-11', i));
  assert.equal(examens(plan({ cours: [cours('A', '2026-11-25')], chapitres: avecTd('A'), disponibilites: { ...SEM(), libres } })).length, 0);
});

test('deux matières qui ont leur partiel le même jour n’ont pas leur examen blanc le même jour', () => {
  const p = plan({ cours: [cours('A', '2026-11-25', 0), cours('B', '2026-11-25', 1)], chapitres: [...avecTd('A'), ...avecTd('B')], disponibilites: SEM() });
  const ex = examens(p);
  assert.equal(ex.length, 2);
  assert.deepEqual(Object.fromEntries(ex.map((s) => [s.coursId, s.jour])), { A: '2026-11-21', B: '2026-11-15' }, 'la première matière prend le meilleur jour, l’autre le suivant');
});

test('l’examen blanc prend la page la moins vue, la première dans l’ordre à égalité', () => {
  const pages = [...chapitres('A', 2), chap('A', 2, { titre: 'TD1 corrigé', derniere: '2026-11-03', niveau: 2, prochaine: '2026-12-30' }), chap('A', 3, { titre: 'TD2 corrigé', derniere: '2026-10-20', niveau: 2, prochaine: '2026-12-30' }), chap('A', 4, { titre: 'Exercices', niveau: 0 })];
  assert.equal(examens(plan({ cours: [cours('A', '2026-11-25')], chapitres: pages, disponibilites: SEM() }))[0].chapitreId, 'A-4', 'jamais vue : la meilleure');
  assert.equal(examens(plan({ cours: [cours('A', '2026-11-25')], chapitres: pages.slice(0, 4), disponibilites: SEM() }))[0].chapitreId, 'A-3', 'la plus ancienne');
  const egales = [chap('A', 0, { titre: 'TD2' }), chap('A', 1, { titre: 'TD1' })];
  assert.equal(examens(plan({ cours: [cours('A', '2026-11-25')], chapitres: egales, disponibilites: SEM() }))[0].chapitreId, 'A-0', 'à égalité, l’ordre du cours');
});

test('un examen blanc ne fait jamais dépasser le temps du jour, et sa page n’est pas proposée deux fois ce jour-là', () => {
  const d = SEM();
  const p = plan({ cours: [cours('A', '2026-11-25'), cours('B', '2026-12-10', 1)], chapitres: [...avecTd('A', 6), ...avecTd('B', 6)], disponibilites: d });
  for (const j of new Set(p.seances.map((s) => s.jour))) assert.ok(minutesDe(p.seances, j) <= d.semaine[jourSemaine(j)], `${j} : ${minutesDe(p.seances, j)} min`);
  const ex = examens(p)[0];
  assert.equal(p.seances.filter((s) => s.jour === ex.jour && s.chapitreId === ex.chapitreId).length, 1);
  // Le reste de la journée d'examen sert à autre chose si l'épreuve est courte.
  const court = plan({ cours: [cours('A', '2026-11-25')], chapitres: avecTd('A', 6), disponibilites: SEM(), examens: new Map([['A', 60]]) });
  assert.ok(minutesDe(court.seances, examens(court)[0].jour) > 60, 'les 2 h restantes sont utilisées');
});

test('un jour presque entièrement pris n’est plus candidat à l’examen blanc', () => {
  // 150 min déjà faites sur 180 : il en reste 30, moins que le minimum — et la fenêtre ne contient que ce jour-là.
  const faits = [chap('A', 0, { niveau: 3, derniere: '2026-11-14', prochaine: '2026-12-20', dureeMin: 375 })];
  const p = planifier({ cours: [cours('A', '2026-11-18')], chapitres: [...faits, chap('A', 1, { titre: 'TD1' })], disponibilites: SEM(), aujourdhui: '2026-11-14' });
  assert.deepEqual(examens(p), []);
});

test('ce qui est déjà fait aujourd’hui est retiré de l’examen blanc d’aujourd’hui', () => {
  // Samedi 14 novembre, partiel le 18 : la fenêtre se réduit à aujourd'hui. 100 min déjà faites sur 180 : il reste 80 min.
  const faits = [chap('A', 0, { niveau: 3, derniere: '2026-11-14', prochaine: '2026-12-20', dureeMin: 240 })]; // une révision de 96 → 95 min
  const p = planifier({ cours: [cours('A', '2026-11-18')], chapitres: [...faits, chap('A', 1, { titre: 'TD1' })], disponibilites: SEM(), aujourdhui: '2026-11-14' });
  assert.deepEqual(examens(p).map((s) => [s.jour, s.minutes]), [['2026-11-14', 85]]);
});

// ── Pages à savoir mot pour mot : un cycle resserré ──

const joursDe = (p: { seances: Seance[] }, id: string) => p.seances.filter((s) => s.chapitreId === id && s.type === 'revision').map((s) => s.jour);

test('une page mot pour mot revient plus tôt qu’une page ordinaire (cycle 1, 2, 4… au lieu de 1, 3, 7…)', () => {
  const lue = (parCoeur: boolean) => [chap('A', 0, { niveau: 1, derniere: ajouterJours(AUJ, -1), prochaine: AUJ, parCoeur })];
  const ordinaire = joursDe(plan({ cours: [cours('A', '2027-03-01')], chapitres: lue(false) }), 'A-0').slice(0, 3);
  const parCoeur = joursDe(plan({ cours: [cours('A', '2027-03-01')], chapitres: lue(true) }), 'A-0').slice(0, 3);
  assert.deepEqual(ordinaire, [AUJ, ajouterJours(AUJ, 3), ajouterJours(AUJ, 10)]);
  assert.deepEqual(parCoeur, [AUJ, ajouterJours(AUJ, 2), ajouterJours(AUJ, 6)]);
});

test('les séances d’une page mot pour mot portent le réglage et le cran, pour choisir l’étape', () => {
  const p = plan({ cours: [cours('A', '2027-03-01')], chapitres: [chap('A', 0, { niveau: 1, derniere: ajouterJours(AUJ, -1), prochaine: AUJ, parCoeur: true })] });
  const premiere = p.seances.find((s) => s.chapitreId === 'A-0');
  assert.equal(premiere?.parCoeur, true);
  assert.equal(premiere?.niveau, 1);
});

// ── Première séance = lire PUIS écrire de mémoire : le rappel est dans la durée ──

test('une première séance dure la lecture plus 30 % de rappel écrit, à ta vitesse', () => {
  assert.equal(PART_RAPPEL_PREMIERE, 0.3);
  assert.equal(dureeLecture({ dureeMin: 40 }), 52);
  assert.equal(dureeLecture({ dureeMin: 40 }, 1), 52);
  assert.equal(dureeLecture({ dureeMin: 40 }, 1.5), 78, 'le rappel suit ta vitesse comme la lecture');
  assert.equal(dureeLecture({ dureeMin: 40 }, 1, 0), 40, 'sans rappel : la lecture seule');
  assert.equal(dureeLecture({ dureeMin: 5 }, 0.01), 5, 'jamais sous 5 min');
});

test('le calendrier compte ce rappel : une page de 30 min se planifie à 39 min, pas 30', () => {
  const entree = { cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { dureeMin: 30 })], disponibilites: dispo(120) };
  const avec = planifier({ ...entree, aujourdhui: AUJ }).seances.find((s) => s.type === 'decouverte');
  const sans = planifier({ ...entree, aujourdhui: AUJ, partRappel: 0 }).seances.find((s) => s.type === 'decouverte');
  assert.equal(avec?.minutes, 39);
  assert.equal(sans?.minutes, 30);
});

test('une part de rappel illisible ou négative retombe sur la valeur par défaut, ou zéro', () => {
  const entree = { cours: [cours('A', PARTIEL)], chapitres: [chap('A', 0, { dureeMin: 30 })], disponibilites: dispo(120), aujourdhui: AUJ };
  assert.equal(planifier({ ...entree, partRappel: Number.NaN }).seances.find((s) => s.type === 'decouverte')?.minutes, 39);
  assert.equal(planifier({ ...entree, partRappel: -1 }).seances.find((s) => s.type === 'decouverte')?.minutes, 30);
});

test('une page apprise aujourd’hui compte sa durée avec le rappel sur le temps du jour', () => {
  // 60 min par jour, une page de 30 min apprise aujourd'hui = 39 min avec le rappel : il reste 21 min (et non 30).
  // Des pages neuves de 10 min = 13 min avec le rappel : une seule tient dans les 21 min.
  const fait = chap('A', 0, { niveau: 1, derniere: AUJ, prochaine: '2026-11-06', dureeMin: 30 });
  const p = planifier({ cours: [cours('A', PARTIEL)], chapitres: [fait, ...chapitres('A', 8, { dureeMin: 10 }).slice(1)], disponibilites: dispo(60), aujourdhui: AUJ });
  assert.equal(minutesDe(p.seances, AUJ), 13);
  const sans = planifier({ cours: [cours('A', PARTIEL)], chapitres: chapitres('A', 8, { dureeMin: 10 }), disponibilites: dispo(60), aujourdhui: AUJ });
  assert.equal(minutesDe(sans.seances, AUJ), 52, 'sans rien de fait : quatre pages de 13 min');
});

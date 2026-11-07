import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Disponibilites } from '../src/core/cours.ts';
import { ajouterJours } from '../src/core/jours.ts';
import { capaciteDuJour, planifier } from '../src/core/planning.ts';
import {
  JOURS_SEMAINE,
  PRATIQUE_DECLAREE_MAX,
  PRATIQUE_DEFAUT,
  PRATIQUE_MAX,
  SERIE_HORIZON,
  apresPratique,
  categoriePratique,
  estSessionPratique,
  etatPratique,
  minutesParJour,
  minutesReservees,
  pratiqueDue,
  pratiqueMinValide,
  pratiqueValide,
  reservesPratique,
  type Pratique,
} from '../src/core/pratique.ts';
import type { Session } from '../src/core/types.ts';

const AUJ = '2026-11-10';
const jour = (n: number) => ajouterJours(AUJ, -n);
const session = (categorie: string, debut: string, fin: string | null, extra: Partial<Session> = {}): Session => ({ id: `${categorie}${debut}`, debut, fin, description: '', categorie, appareil: 'PC', objectif: null, pauseSecondes: 0, pauseDepuis: null, ...extra });
const pratique = (coursId: string, j: string, minutes: number): Pratique => ({ id: `${coursId}${j}${minutes}`, coursId, jour: j, minutes });
// Midi local : le jour de l'appareil est sans ambiguïté, quel que soit le fuseau des tests.
const midi = (j: string, h = 12, m = 0) => new Date(`${j}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();

test('le minimum par jour est un entier de 1 à 120, sinon pas de pratique', () => {
  assert.equal(PRATIQUE_DEFAUT, 5);
  assert.equal(pratiqueMinValide(5), 5);
  assert.equal(pratiqueMinValide(1), 1);
  assert.equal(pratiqueMinValide(PRATIQUE_MAX), PRATIQUE_MAX);
  for (const v of [0, -3, PRATIQUE_MAX + 1, 2.5, NaN, null, undefined, '5']) assert.equal(pratiqueMinValide(v), null, String(v));
});

test('une pratique déclarée est refusée si elle est mal formée', () => {
  const ok = { id: 'a', coursId: 'c', jour: AUJ, minutes: 5 };
  assert.deepEqual(pratiqueValide(ok), ok);
  assert.deepEqual(pratiqueValide({ ...ok, minutes: PRATIQUE_DECLAREE_MAX }), { ...ok, minutes: PRATIQUE_DECLAREE_MAX });
  for (const m of [0, -1, PRATIQUE_DECLAREE_MAX + 1, 1.5, '5', null]) assert.equal(pratiqueValide({ ...ok, minutes: m }), null, String(m));
  assert.equal(pratiqueValide({ ...ok, jour: '2026-13-01' }), null);
  assert.equal(pratiqueValide({ ...ok, jour: 'hier' }), null);
  assert.equal(pratiqueValide({ ...ok, id: 3 }), null);
  assert.equal(pratiqueValide({ ...ok, coursId: undefined }), null);
  assert.equal(pratiqueValide(null), null);
  assert.equal(pratiqueValide('x'), null);
});

test('le chrono de la pratique a sa catégorie, que les majuscules et les espaces ne changent pas', () => {
  assert.equal(categoriePratique('TOEIC'), 'TOEIC · erreurs');
  assert.equal(categoriePratique('  TOEIC '), 'TOEIC · erreurs');
  assert.ok(estSessionPratique({ categorie: 'TOEIC · erreurs' }, 'TOEIC'));
  assert.ok(estSessionPratique({ categorie: 'toeic  ·  ERREURS ' }, 'TOEIC'));
  assert.ok(!estSessionPratique({ categorie: 'TOEIC' }, 'TOEIC'), 'le travail des pages n’est pas la pratique');
  assert.ok(!estSessionPratique({ categorie: 'TAGE MAGE · erreurs' }, 'TOEIC'));
  assert.ok(!estSessionPratique({ categorie: 'TOEIC · erreurs de grammaire' }, 'TOEIC'));
});

test('la pratique est due jusqu’au partiel compris, sauf cours en pause ou sans minimum', () => {
  const c = { pratiqueMin: 5, enPause: false, partiel: '2026-12-05' };
  assert.ok(pratiqueDue(c, AUJ));
  assert.ok(pratiqueDue(c, '2026-12-05'), 'le jour du partiel');
  assert.ok(!pratiqueDue(c, '2026-12-06'), 'le lendemain, plus rien à préparer');
  assert.ok(pratiqueDue({ ...c, partiel: null }, AUJ), 'sans date, elle reste due');
  assert.ok(!pratiqueDue({ ...c, enPause: true }, AUJ));
  assert.ok(!pratiqueDue({ ...c, pratiqueMin: null }, AUJ));
});

test('les minutes d’un jour sont la somme des sessions du chrono et des minutes déclarées', () => {
  const m = minutesParJour(
    'toeic',
    'TOEIC',
    [pratique('toeic', AUJ, 3), pratique('autre', AUJ, 50)],
    [session('TOEIC · erreurs', midi(AUJ), midi(AUJ, 12, 10)), session('TOEIC', midi(AUJ, 14), midi(AUJ, 15)), session('TAGE MAGE · erreurs', midi(AUJ, 16), midi(AUJ, 17))],
  );
  assert.equal(m.get(AUJ), 13, '10 min de chrono + 3 déclarées ; ni les pages du TOEIC ni un autre cours');
  assert.equal(m.size, 1);
});

test('une session qui tourne encore ne compte pas, et une pause se déduit', () => {
  const enCours = minutesParJour('c', 'TOEIC', [], [session('TOEIC · erreurs', midi(AUJ), null)]);
  assert.equal(enCours.size, 0, 'sans durée : ni zéro, ni tout d’un coup');
  const avecPause = minutesParJour('c', 'TOEIC', [], [session('TOEIC · erreurs', midi(AUJ), midi(AUJ, 12, 10), { pauseSecondes: 300 })]);
  assert.equal(avecPause.get(AUJ), 5);
  const illisible = minutesParJour('c', 'TOEIC', [], [session('TOEIC · erreurs', 'pas une date', midi(AUJ))]);
  assert.equal(illisible.size, 0);
});

test('une session compte le jour de l’appareil où elle a commencé', () => {
  const m = minutesParJour('c', 'TOEIC', [], [session('TOEIC · erreurs', midi(jour(1), 23, 55), midi(AUJ, 0, 10))]);
  assert.equal(m.get(jour(1)), 15);
  assert.equal(m.get(AUJ), undefined);
});

test('fait quand le minimum est atteint à la minute près', () => {
  const avec = (secondes: number) => etatPratique({ cible: 5, minutes: new Map([[AUJ, secondes / 60]]), aujourdhui: AUJ });
  assert.equal(avec(4 * 60 + 29).fait, false, '4 min 29 : 4 minutes');
  assert.equal(avec(4 * 60 + 29).faites, 4);
  assert.equal(avec(4 * 60 + 29).restantes, 1);
  assert.equal(avec(4 * 60 + 31).fait, true, '4 min 31 : 5 minutes');
  assert.equal(avec(4 * 60 + 31).restantes, 0);
  assert.equal(avec(12 * 60).faites, 12);
  assert.equal(avec(12 * 60).restantes, 0);
  assert.equal(etatPratique({ cible: 5, minutes: new Map(), aujourdhui: AUJ }).restantes, 5);
});

test('la série compte les jours de suite, aujourd’hui compris s’il est fait', () => {
  const minutes = new Map([
    [AUJ, 5],
    [jour(1), 7],
    [jour(2), 5],
    [jour(4), 9],
  ]);
  const e = etatPratique({ cible: 5, minutes, aujourdhui: AUJ });
  assert.equal(e.serie, 3, 'aujourd’hui, hier, avant-hier ; le trou d’il y a 3 jours la coupe');
});

test('aujourd’hui pas encore fait ne casse pas la série, hier non fait la casse', () => {
  const hier = new Map([
    [jour(1), 5],
    [jour(2), 5],
  ]);
  assert.equal(etatPratique({ cible: 5, minutes: hier, aujourdhui: AUJ }).serie, 2, 'la journée n’est pas finie');
  const avantHier = new Map([[jour(2), 5]]);
  assert.equal(etatPratique({ cible: 5, minutes: avantHier, aujourdhui: AUJ }).serie, 0, 'hier manqué');
  assert.equal(etatPratique({ cible: 5, minutes: new Map(), aujourdhui: AUJ }).serie, 0);
});

test('un jour sous le minimum casse la série, pile le minimum la tient', () => {
  const pile = new Map([
    [AUJ, 5],
    [jour(1), 5],
  ]);
  assert.equal(etatPratique({ cible: 5, minutes: pile, aujourdhui: AUJ }).serie, 2);
  const sous = new Map([
    [AUJ, 5],
    [jour(1), 4],
    [jour(2), 5],
  ]);
  assert.equal(etatPratique({ cible: 5, minutes: sous, aujourdhui: AUJ }).serie, 1);
});

test('un jour libre n’est ni compté ni cassant', () => {
  const minutes = new Map([
    [AUJ, 5],
    [jour(2), 5],
    [jour(3), 5],
  ]);
  const libres = new Set([jour(1)]);
  assert.equal(etatPratique({ cible: 5, minutes, aujourdhui: AUJ, libres }).serie, 3, 'hier est libre : la série passe par-dessus sans le compter');
  assert.equal(etatPratique({ cible: 5, minutes, aujourdhui: AUJ }).serie, 1, 'sans le jour libre, hier casserait la série');
  const fait = new Map([[jour(1), 6]]);
  assert.equal(etatPratique({ cible: 5, minutes: fait, aujourdhui: AUJ, libres }).serie, 1, 'un jour libre où l’on a quand même pratiqué compte');
  const aujLibre = new Map([[jour(1), 5]]);
  assert.equal(etatPratique({ cible: 5, minutes: aujLibre, aujourdhui: AUJ, libres: new Set([AUJ]) }).serie, 1);
});

test('la série ne cherche pas au-delà de l’horizon', () => {
  const minutes = new Map<string, number>();
  for (let i = 0; i < SERIE_HORIZON + 30; i++) minutes.set(jour(i), 5);
  assert.equal(etatPratique({ cible: 5, minutes, aujourdhui: AUJ }).serie, SERIE_HORIZON);
});

test('la petite semaine montre sept jours, du plus ancien à aujourd’hui', () => {
  const minutes = new Map([
    [AUJ, 6],
    [jour(1), 2],
    [jour(6), 5],
  ]);
  const libres = new Set([jour(3)]);
  const s = etatPratique({ cible: 5, minutes, aujourdhui: AUJ, libres }).semaine;
  assert.equal(s.length, JOURS_SEMAINE);
  assert.equal(s[0].jour, jour(6));
  assert.equal(s[6].jour, AUJ);
  assert.deepEqual(s[6], { jour: AUJ, minutes: 6, fait: true, libre: false });
  assert.deepEqual(s[5], { jour: jour(1), minutes: 2, fait: false, libre: false });
  assert.deepEqual(s[0], { jour: jour(6), minutes: 5, fait: true, libre: false });
  assert.equal(s[3].libre, true);
  assert.equal(s[4].libre, false);
});

test('les réserves ne gardent que les pratiques dues, et durent jusqu’au partiel compris', () => {
  const cours = [
    { pratiqueMin: 5, enPause: false, partiel: '2026-12-05' },
    { pratiqueMin: 10, enPause: false, partiel: null },
    { pratiqueMin: 7, enPause: true, partiel: null },
    { pratiqueMin: null, enPause: false, partiel: null },
    { pratiqueMin: 20, enPause: false, partiel: '2026-11-01' },
  ];
  const r = reservesPratique(cours, AUJ);
  assert.deepEqual(r, [
    { minutes: 5, jusquau: '2026-12-05' },
    { minutes: 10, jusquau: null },
  ]);
  assert.equal(minutesReservees(r, AUJ), 15);
  assert.equal(minutesReservees(r, '2026-12-05'), 15, 'le jour du partiel');
  assert.equal(minutesReservees(r, '2026-12-06'), 10, 'après, seule la pratique sans fin reste');
  assert.equal(minutesReservees([], AUJ), 0);
});

// ── Le planificateur déduit la pratique de chaque journée ──
const dispo = (m: number, libres: string[] = []): Disponibilites => ({ semaine: [m, m, m, m, m, m, m], libres });
const unCours = { id: 'A', titre: 'A', couleur: '#888', partiel: '2026-12-04', lien: null, ordre: 0, motifs: '', enPause: false, pratiqueMin: null };
const pages = Array.from({ length: 12 }, (_, i) => ({ id: `A-${i}`, coursId: 'A', titre: `Ch ${i}`, ordre: i, dureeMin: 30, niveau: 0, derniere: null, prochaine: null, lien: null, parCoeur: false }));
const parJour = (p: ReturnType<typeof planifier>, j: string) => p.seances.filter((s) => s.jour === j).reduce((t, s) => t + s.minutes, 0);

test('le planificateur retire la pratique du temps de chaque jour', () => {
  const base = { cours: [unCours], chapitres: pages, disponibilites: dispo(60), aujourdhui: AUJ, partRappel: 0 };
  const sans = planifier(base);
  const avec = planifier({ ...base, reserves: [{ minutes: 10, jusquau: null }] });
  for (const j of new Set(avec.seances.map((s) => s.jour))) assert.ok(parJour(avec, j) <= 50, `${j} : ${parJour(avec, j)} min pour 50 possibles`);
  assert.ok(sans.seances.some((s) => parJour(sans, s.jour) > 50), 'sans réserve, les journées utilisent les 60 minutes');
});

test('la pratique ne rend pas de temps à un jour libre, ni ne passe sous zéro', () => {
  const libre = ajouterJours(AUJ, 1);
  const d = dispo(8, [libre]);
  assert.equal(capaciteDuJour(d, libre), 0);
  const p = planifier({ cours: [unCours], chapitres: pages, disponibilites: d, aujourdhui: AUJ, partRappel: 0, reserves: [{ minutes: 10, jusquau: null }] });
  assert.equal(parJour(p, libre), 0, 'jour libre');
  assert.equal(p.seances.length, 0, '8 minutes disponibles, 10 réservées : aucune journée n’a de temps, et rien n’est placé en négatif');
});

test('la pratique se retire du temps du jour sans jamais passer sous zéro', () => {
  assert.equal(apresPratique(60, 10), 50);
  assert.equal(apresPratique(60, 0), 60);
  assert.equal(apresPratique(10, 10), 0);
  assert.equal(apresPratique(5, 10), 0, 'une dette n’est pas du temps négatif');
  assert.equal(apresPratique(0, 10), 0, 'un jour libre le reste');
});

test('une journée plus courte que la pratique est comme un jour sans temps, pas une dette', () => {
  const base = { cours: [unCours], chapitres: pages, aujourdhui: AUJ, partRappel: 0 };
  const court = planifier({ ...base, disponibilites: dispo(5), reserves: [{ minutes: 10, jusquau: null }] });
  const zero = planifier({ ...base, disponibilites: dispo(0) });
  assert.ok(zero.alertes.length > 0, 'sans aucun temps, le calendrier signale la surcharge');
  assert.deepEqual(court, zero, 'les minutes qui manquent sont les mêmes : une journée de 5 min moins 10 de pratique vaut 0, pas −5');
});

test('après le partiel de la pratique, le temps revient entier', () => {
  const base = { cours: [{ ...unCours, partiel: '2027-01-20' }], chapitres: pages, disponibilites: dispo(60), aujourdhui: AUJ, partRappel: 0 };
  const avec = planifier({ ...base, reserves: [{ minutes: 10, jusquau: ajouterJours(AUJ, 2) }] });
  const jours = [...new Set(avec.seances.map((s) => s.jour))];
  assert.ok(jours.filter((j) => j <= ajouterJours(AUJ, 2)).every((j) => parJour(avec, j) <= 50));
  assert.ok(jours.filter((j) => j > ajouterJours(AUJ, 2)).some((j) => parJour(avec, j) > 50), 'au-delà de la date, les 60 minutes reviennent');
});

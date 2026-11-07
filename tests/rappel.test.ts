import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chapitre, Cours } from '../src/core/cours.ts';
import { SEUIL_COURS, type Seance, type TypeSeance } from '../src/core/planning.ts';
import { BONUS_MINUTES, RAPPEL_DEFAUT, RAPPEL_MAX, construireRappel, type EntreeRappel } from '../src/core/rappel.ts';

const AUJ = '2026-11-20';
const cours = (id: string, ordre: number, extra: Partial<Cours> = {}): Cours => ({ id, titre: id, couleur: '#888', partiel: '2026-12-20', lien: null, ordre, motifs: '', enPause: false, pratiqueMin: null, ...extra });
const page = (coursId: string, ordre: number, extra: Partial<Chapitre> = {}): Chapitre => ({ id: `${coursId}${ordre}`, coursId, titre: `P${ordre}`, ordre, dureeMin: 20, niveau: 2, derniere: '2026-11-10', prochaine: AUJ, lien: null, parCoeur: false, ...extra });
const sea = (coursId: string, ordre: number, type: TypeSeance = 'revision', extra: Partial<Seance> = {}): Seance => ({ jour: AUJ, coursId, chapitreId: `${coursId}${ordre}`, type, minutes: 10, raison: 'Révision espacée', suite: false, complete: true, retard: 0, fragile: false, niveau: 2, parCoeur: false, ...extra });
const COURS = [cours('A', 0), cours('B', 1), cours('C', 2)];
const rappel = (seances: Seance[], chapitres: Chapitre[], extra: Partial<EntreeRappel> = {}) => construireRappel({ seances, chapitres, cours: COURS, fragiles: new Set(), aujourdhui: AUJ, max: 3, dejaFaits: 0, chargeJour: 0, ...extra });
const ids = (r: { items: { chapitreId: string }[] }) => r.items.map((i) => i.chapitreId);
const TOUT = [page('A', 0), page('A', 1), page('A', 2), page('B', 0), page('B', 1), page('C', 0)];
const REVISIONS = [sea('A', 0), sea('A', 1), sea('A', 2), sea('B', 0), sea('B', 1), sea('C', 0)];

test('trois pages par défaut, jusqu’à dix, et zéro pour ne pas en avoir', () => {
  assert.equal(RAPPEL_DEFAUT, 3);
  assert.equal(RAPPEL_MAX, 10);
  assert.equal(ids(rappel(REVISIONS, TOUT)).length, 3);
  for (const max of [0, -2, Number.NaN, Infinity]) {
    const r = rappel(REVISIONS, TOUT, { max });
    assert.deepEqual(r.items, [], String(max));
    assert.deepEqual(r.restantes, REVISIONS, 'tout reste au calendrier');
    assert.equal(r.minutes, 0);
  }
  const beaucoup = Array.from({ length: 12 }, (_, i) => sea('A', i));
  assert.equal(rappel(beaucoup, Array.from({ length: 12 }, (_, i) => page('A', i)), { max: 99 }).items.length, RAPPEL_MAX);
  assert.equal(rappel(REVISIONS, TOUT, { max: 2.7 }).items.length, 2, 'la partie entière');
});

test('les cours se mélangent : une page de chacun avant la deuxième de l’un', () => {
  const r = rappel(REVISIONS, TOUT, { max: 4 });
  assert.deepEqual(ids(r), ['A0', 'B0', 'C0', 'A1']);
  assert.deepEqual(r.restantes.map((s) => s.chapitreId), ['A2', 'B1'], 'le reste du calendrier, dans son ordre');
  // Un seul cours : on prend ses pages à la suite.
  assert.deepEqual(ids(rappel([sea('A', 0), sea('A', 1), sea('A', 2)], TOUT, { max: 2 })), ['A0', 'A1']);
});

test('à tout égal, l’ordre des cours — pas l’ordre alphabétique de leurs identifiants', () => {
  const cs = [cours('Z', 0), cours('A', 1)];
  const pages = [page('Z', 0), page('A', 0)];
  assert.deepEqual(ids(construireRappel({ seances: [sea('A', 0), sea('Z', 0)], chapitres: pages, cours: cs, fragiles: new Set(), aujourdhui: AUJ, max: 2, dejaFaits: 0, chargeJour: 0 })), ['Z0', 'A0']);
});

test('une page fragile d’abord, même d’un cours qui vient en dernier', () => {
  assert.deepEqual(ids(rappel(REVISIONS, TOUT, { fragiles: new Set(['C0']) })), ['C0', 'A0', 'B0']);
  const r = rappel(REVISIONS, TOUT, { fragiles: new Set(['C0']), max: 1 });
  assert.equal(r.items[0].fragile, true);
  assert.equal(rappel(REVISIONS, TOUT, { max: 1 }).items[0].fragile, false);
});

test('le dernier passage avant le partiel passe devant une révision, mais pas devant une page fragile', () => {
  const s = [sea('A', 0), sea('B', 0, 'consolidation', { raison: 'Dernier passage avant le partiel' })];
  assert.deepEqual(ids(rappel(s, TOUT, { max: 1 })), ['B0']);
  assert.equal(rappel(s, TOUT, { max: 1 }).items[0].consolidation, true);
  assert.deepEqual(ids(rappel(s, TOUT, { max: 1, fragiles: new Set(['A0']) })), ['A0']);
});

test('à égalité, la page la plus en retard, puis la moins sue', () => {
  const retards = [sea('A', 0), sea('B', 0, 'revision', { retard: 3, raison: 'En retard de 3 j' }), sea('C', 0, 'revision', { retard: 1, raison: 'En retard de 1 j' })];
  assert.deepEqual(ids(rappel(retards, TOUT)), ['B0', 'C0', 'A0']);
  assert.deepEqual(rappel(retards, TOUT, { max: 1 }).items.map((i) => [i.chapitreId, i.retard, i.raison]), [['B0', 3, 'En retard de 3 j']]);
  const niveaux = [page('A', 0, { niveau: 4 }), page('B', 0, { niveau: 1 }), page('C', 0, { niveau: 3 })];
  assert.deepEqual(ids(rappel([sea('A', 0), sea('B', 0), sea('C', 0)], niveaux)), ['B0', 'C0', 'A0'], 'le moins su d’abord');
});

test('seules les révisions se rappellent : lecture, relecture et examen restent des blocs', () => {
  const s = [sea('A', 0, 'decouverte'), sea('A', 1, 'relecture'), sea('B', 0, 'examen'), sea('B', 1), sea('C', 0, 'consolidation')];
  const r = rappel(s, TOUT);
  assert.deepEqual(ids(r), ['C0', 'B1']);
  assert.deepEqual(r.restantes.map((x) => x.type), ['decouverte', 'relecture', 'examen']);
  assert.deepEqual(rappel([sea('A', 0, 'decouverte'), sea('A', 1, 'relecture')], TOUT).items, [], 'rien à rappeler');
});

test('chaque page du rappel porte sa durée, son cours et sa raison ; le total est la somme', () => {
  const r = rappel([sea('A', 0, 'revision', { minutes: 15, raison: 'En retard de 2 j', retard: 2 }), sea('B', 0, 'revision', { minutes: 10 })], TOUT);
  assert.deepEqual(r.items, [
    { coursId: 'A', chapitreId: 'A0', bonus: false, fragile: false, consolidation: false, obligatoire: false, retard: 2, minutes: 15, raison: 'En retard de 2 j' },
    { coursId: 'B', chapitreId: 'B0', bonus: false, fragile: false, consolidation: false, obligatoire: false, retard: 0, minutes: 10, raison: 'Révision espacée' },
  ]);
  assert.equal(r.minutes, 25);
});

// ── Micro-révision des jours chargés ──

const fragiles = ['A5', 'B0', 'C0'];
const AVEC_FRAGILES = [page('A', 0), page('A', 5, { niveau: 1, derniere: '2026-11-12', prochaine: '2026-12-30' }), page('B', 0, { niveau: 2, derniere: '2026-11-10', prochaine: '2026-12-30' }), page('C', 0, { niveau: 3, derniere: '2026-11-05', prochaine: '2026-12-30' })];

test('un jour chargé et peu de révisions : des pages fragiles, 3 minutes chacune, pour ne pas rester sans rien', () => {
  const r = rappel([sea('A', 0)], AVEC_FRAGILES, { chargeJour: SEUIL_COURS, fragiles: new Set(fragiles) });
  // Les deux places libres vont aux pages fragiles les moins sues, de cours différents.
  assert.deepEqual(ids(r), ['A0', 'A5', 'B0']);
  assert.deepEqual(r.items.map((i) => i.bonus), [false, true, true]);
  assert.deepEqual(r.items[1], { coursId: 'A', chapitreId: 'A5', bonus: true, fragile: true, consolidation: false, obligatoire: false, retard: 0, minutes: BONUS_MINUTES, raison: 'Micro-révision d’une page fragile' });
  assert.equal(r.minutes, 10 + 2 * BONUS_MINUTES);
  assert.equal(BONUS_MINUTES, 3);
  // Les pages fragiles déjà au calendrier du jour ne sont pas ajoutées deux fois.
  assert.deepEqual(r.restantes, []);
});

test('micro-révision : à niveau égal, la page vue il y a le plus longtemps d’abord', () => {
  const pages = [page('A', 0, { niveau: 2, derniere: '2026-11-12', prochaine: '2026-12-30' }), page('A', 1, { niveau: 2, derniere: '2026-11-05', prochaine: '2026-12-30' }), page('A', 2, { niveau: 2, derniere: null, prochaine: '2026-12-30' })];
  const r = rappel([], pages, { chargeJour: 480, fragiles: new Set(['A0', 'A1', 'A2']), max: 3 });
  assert.deepEqual(ids(r), ['A2', 'A1', 'A0'], 'jamais datée, puis la plus ancienne, puis la plus récente');
});

test('sans jour chargé, pas de micro-révision : les journées normales ont assez de temps', () => {
  assert.deepEqual(ids(rappel([sea('A', 0)], AVEC_FRAGILES, { chargeJour: SEUIL_COURS - 1, fragiles: new Set(fragiles) })), ['A0'], 'à 3 h 59 de cours');
  assert.deepEqual(ids(rappel([sea('A', 0)], AVEC_FRAGILES, { chargeJour: SEUIL_COURS, fragiles: new Set(fragiles) })).length, 3, 'à 4 h de cours');
  assert.deepEqual(rappel([], AVEC_FRAGILES, { chargeJour: 0, fragiles: new Set(fragiles) }).items, [], 'et rien du tout au calendrier : rien');
  assert.equal(rappel([], AVEC_FRAGILES, { chargeJour: 480, fragiles: new Set(fragiles) }).items.length, 3, 'un jour de 8 h sans révision : trois pages fragiles');
});

test('la micro-révision ne remplace pas les révisions : elle complète, jusqu’au nombre voulu', () => {
  assert.deepEqual(ids(rappel(REVISIONS, AVEC_FRAGILES.concat(TOUT), { chargeJour: 480, fragiles: new Set(fragiles) })).length, 3, 'assez de révisions : pas de bonus');
  assert.ok(rappel(REVISIONS, TOUT.concat(AVEC_FRAGILES.slice(1)), { chargeJour: 480, fragiles: new Set(fragiles) }).items.every((i) => !i.bonus));
  assert.equal(rappel([sea('A', 0), sea('B', 0)], AVEC_FRAGILES, { chargeJour: 480, fragiles: new Set(fragiles), max: 2 }).items.length, 2, 'le nombre voulu est atteint : pas de bonus');
});

test('seules les pages fragiles, vues, de cours en cours, pas travaillées aujourd’hui ni déjà au calendrier font la micro-révision', () => {
  const pages = [
    page('A', 0, { niveau: 2 }), // fragile : retenue
    page('A', 1, { niveau: 2 }), // pas fragile
    page('A', 2, { niveau: 0, derniere: null, prochaine: null }), // jamais lue
    page('A', 3, { niveau: 2, derniere: AUJ }), // travaillée aujourd'hui
    page('A', 4, { niveau: 2 }), // déjà au calendrier du jour (relecture)
    page('P', 0, { niveau: 2 }), // cours en pause
    page('F', 0, { niveau: 2 }), // partiel passé
    page('J', 0, { niveau: 2 }), // partiel aujourd'hui
    page('Z', 0, { niveau: 2 }), // cours inconnu
  ];
  const cs = [cours('A', 0), cours('P', 1, { enPause: true }), cours('F', 2, { partiel: '2026-11-19' }), cours('J', 3, { partiel: AUJ }), cours('S', 4, { partiel: null })];
  const tous = new Set(['A0', 'A2', 'A3', 'A4', 'P0', 'F0', 'J0', 'Z0']);
  const r = construireRappel({ seances: [sea('A', 4, 'relecture')], chapitres: pages, cours: cs, fragiles: tous, aujourdhui: AUJ, max: 10, dejaFaits: 0, chargeJour: 480 });
  assert.deepEqual(ids(r), ['A0']);
  // Un cours sans partiel est un cours en cours.
  const sans = construireRappel({ seances: [], chapitres: [page('S', 0)], cours: cs, fragiles: new Set(['S0']), aujourdhui: AUJ, max: 3, dejaFaits: 0, chargeJour: 480 });
  assert.deepEqual(ids(sans), ['S0']);
});

test('l’ordre reçu ne change pas le rappel', () => {
  const a = rappel(REVISIONS, TOUT, { fragiles: new Set(['B1']) });
  const b = rappel([...REVISIONS].reverse(), [...TOUT].reverse(), { fragiles: new Set(['B1']) });
  assert.deepEqual(ids(a), ids(b));
  assert.deepEqual(a.restantes.map((s) => s.chapitreId).sort(), b.restantes.map((s) => s.chapitreId).sort());
});

test('les rappels déjà faits aujourd’hui comptent dans la dose : en finir un n’en fait pas apparaître un autre', () => {
  assert.equal(ids(rappel(REVISIONS, TOUT, { max: 3, dejaFaits: 0 })).length, 3);
  assert.equal(ids(rappel(REVISIONS, TOUT, { max: 3, dejaFaits: 1 })).length, 2);
  assert.equal(ids(rappel(REVISIONS, TOUT, { max: 3, dejaFaits: 2 })).length, 1);
  const fini = rappel(REVISIONS, TOUT, { max: 3, dejaFaits: 3 });
  assert.deepEqual(fini.items, []);
  assert.deepEqual(fini.restantes, REVISIONS, 'tout le reste reste au calendrier, en blocs');
  assert.deepEqual(rappel(REVISIONS, TOUT, { max: 3, dejaFaits: 7 }).items, [], 'plus que la dose : rien');
  assert.equal(ids(rappel(REVISIONS, TOUT, { max: 3, dejaFaits: -2 })).length, 3, 'un compte négatif ne rallonge pas la dose');
  assert.equal(ids(rappel(REVISIONS, TOUT, { max: 3, dejaFaits: Number.NaN })).length, 3, 'illisible : comme zéro');
  assert.equal(ids(rappel(REVISIONS, TOUT, { max: 3, dejaFaits: 1.9 })).length, 2, 'la partie entière');
  // La micro-révision d'un jour chargé aussi : la dose est la même.
  assert.equal(rappel([], AVEC_FRAGILES, { chargeJour: 480, fragiles: new Set(fragiles), max: 3, dejaFaits: 2 }).items.length, 1);
});

test('apprendre par cœur : les pages du premier retour passent toutes, même au-delà de la dose du jour', () => {
  const seances = [sea('A', 0, 'revision', { niveau: 1 }), sea('A', 1, 'revision', { niveau: 1 }), sea('B', 0, 'revision', { niveau: 1 }), sea('B', 1, 'revision', { niveau: 1 }), sea('C', 0, 'revision', { niveau: 1 })];
  const chapitres = [page('A', 0, { niveau: 1 }), page('A', 1, { niveau: 1 }), page('B', 0, { niveau: 1 }), page('B', 1, { niveau: 1 }), page('C', 0, { niveau: 1 })];
  const r = rappel(seances, chapitres, { max: 2 });
  assert.equal(r.items.length, 5);
  assert.ok(r.items.every((i) => i.obligatoire));
  assert.deepEqual(r.restantes, []);
});

test('apprendre par cœur : les pages à apprendre passent avant, la dose ne sert qu’à compléter', () => {
  const seances = [sea('A', 0, 'revision', { niveau: 3 }), sea('B', 0, 'revision', { niveau: 3 }), sea('C', 0, 'revision', { niveau: 1 })];
  const chapitres = [page('A', 0, { niveau: 3 }), page('B', 0, { niveau: 3 }), page('C', 0, { niveau: 1 })];
  const r = rappel(seances, chapitres, { max: 2 });
  assert.deepEqual(ids(r), ['C0', 'A0']);
  assert.deepEqual(r.items.map((i) => i.obligatoire), [true, false]);
  assert.deepEqual(r.restantes.map((s) => s.chapitreId), ['B0']);
});

test('apprendre par cœur : une page mot pour mot est obligatoire au cran 2, pas au cran 3', () => {
  const seances = [sea('A', 0, 'revision', { niveau: 2, parCoeur: true }), sea('B', 0, 'revision', { niveau: 3, parCoeur: true })];
  const chapitres = [page('A', 0, { niveau: 2, parCoeur: true }), page('B', 0, { niveau: 3, parCoeur: true })];
  const r = rappel(seances, chapitres, { max: 1 });
  assert.deepEqual(r.items.map((i) => [i.chapitreId, i.obligatoire]), [['A0', true]]);
});

test('apprendre par cœur : en finir une ne fait pas apparaître une page de plus (pas de tapis roulant)', () => {
  const tout = [sea('A', 0, 'revision', { niveau: 1 }), sea('B', 0, 'revision', { niveau: 3 }), sea('C', 0, 'revision', { niveau: 3 })];
  const chapitres = [page('A', 0, { niveau: 1 }), page('B', 0, { niveau: 3 }), page('C', 0, { niveau: 3 })];
  const avant = rappel(tout, chapitres, { max: 2 });
  assert.equal(avant.items.length, 2);
  // A0 est faite (rappel noté) : elle sort des séances, et le rappel faite compte dans la dose.
  const apres = rappel(tout.slice(1), chapitres, { max: 2, dejaFaits: 1 });
  assert.equal(apres.items.length, 1);
  assert.equal(apres.items.length + 1, avant.items.length);
});

test('apprendre par cœur : dose à zéro, le rappel est coupé et les blocs prennent tout', () => {
  const seances = [sea('A', 0, 'revision', { niveau: 1 })];
  const r = rappel(seances, [page('A', 0, { niveau: 1 })], { max: 0 });
  assert.deepEqual(r.items, []);
  assert.equal(r.restantes.length, 1);
});

test('apprendre par cœur : la dose du jour est faite, mais les pages à apprendre restent à faire', () => {
  const seances = [sea('A', 0, 'revision', { niveau: 1 }), sea('B', 0, 'revision', { niveau: 3 })];
  const chapitres = [page('A', 0, { niveau: 1 }), page('B', 0, { niveau: 3 })];
  const r = rappel(seances, chapitres, { max: 3, dejaFaits: 3 });
  assert.deepEqual(ids(r), ['A0']);
  assert.deepEqual(r.restantes.map((s) => s.chapitreId), ['B0']);
});

test('une micro-révision n’est jamais obligatoire', () => {
  const chapitres = [page('A', 0, { niveau: 3, prochaine: '2026-12-30', derniere: '2026-11-10' })];
  const r = rappel([], chapitres, { max: 2, chargeJour: SEUIL_COURS, fragiles: new Set(['A0']) });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].bonus, true);
  assert.equal(r.items[0].obligatoire, false);
});

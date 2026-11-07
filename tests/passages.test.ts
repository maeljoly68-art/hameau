import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chapitre, Cours } from '../src/core/cours.ts';
import { ajouterJours } from '../src/core/jours.ts';
import { BILAN_JOURS, EXAMEN_VALIDITE_JOURS, FRAGILE_FENETRE_JOURS, RYTHME_JOURS, bilanSemaine, examensFaits, noteDepuisPct, pagesFragiles, passageValide, scorePct, type Passage, type SortePassage } from '../src/core/passages.ts';
import type { Note } from '../src/core/revision.ts';

const AUJ = '2026-11-20';
let n = 0;
const passage = (chapitreId: string, jour: string, sorte: SortePassage, note: Note | null = null, extra: Partial<Passage> = {}): Passage => ({ id: `p${++n}`, chapitreId, jour, sorte, note, minutes: null, scorePct: null, vitesse: null, rappel: null, confiance: null, creeLe: `${jour}T10:${String(n % 60).padStart(2, '0')}:00Z`, ...extra });
const il = (jours: number) => ajouterJours(AUJ, -jours);

// ── Lecture d'un passage ──

test('un passage lu : chaque champ est vérifié, une ligne illisible est écartée', () => {
  const ok = { id: 'x', chapitreId: 'c', jour: '2026-11-05', sorte: 'revision', note: 'bien', minutes: 12, scorePct: 85.5, vitesse: 1.1, rappel: 'les trois points', confiance: 2, creeLe: '2026-11-05T10:00:00Z' };
  assert.deepEqual(passageValide(ok), ok);
  for (const casse of [null, undefined, 'x', 3, [], { ...ok, id: 4 }, { ...ok, chapitreId: undefined }, { ...ok, jour: '2026-02-30' }, { ...ok, jour: 'demain' }, { ...ok, jour: 20261105 }, { ...ok, sorte: 'devinette' }, { ...ok, sorte: undefined }]) assert.equal(passageValide(casse), null, JSON.stringify(casse));
  assert.equal(passageValide({ ...ok, note: 'moyen' })!.note, null, 'note inconnue : sans note, le passage reste lisible');
  assert.equal(passageValide({ ...ok, note: 3 })!.note, null);
  for (const sorte of ['lecture', 'revision', 'relecture', 'rappel', 'examen']) assert.equal(passageValide({ ...ok, sorte })!.sorte, sorte);
  for (const note of ['a-revoir', 'difficile', 'bien', 'facile']) assert.equal(passageValide({ ...ok, note })!.note, note);
});

test('durée, score, vitesse : dans leurs bornes ou absents — jamais 0 par défaut', () => {
  const base = { id: 'x', chapitreId: 'c', jour: '2026-11-05', sorte: 'lecture' };
  const v = (extra: object) => passageValide({ ...base, ...extra })!;
  assert.equal(v({}).minutes, null);
  assert.equal(v({ minutes: 0 }).minutes, 0, '0 minute est une vraie valeur');
  assert.equal(v({ minutes: 1440 }).minutes, 1440);
  assert.equal(v({ minutes: 1441 }).minutes, null);
  assert.equal(v({ minutes: -1 }).minutes, null);
  assert.equal(v({ minutes: Number.NaN }).minutes, null);
  assert.equal(v({ minutes: '12' }).minutes, null, 'un texte n’est pas une durée');
  assert.equal(v({ scorePct: 0 }).scorePct, 0);
  assert.equal(v({ scorePct: 100 }).scorePct, 100);
  assert.equal(v({ scorePct: 100.01 }).scorePct, null);
  assert.equal(v({ scorePct: -0.01 }).scorePct, null);
  assert.equal(v({ vitesse: 0.5 }).vitesse, 0.5);
  assert.equal(v({ vitesse: 2.5 }).vitesse, 2.5);
  assert.equal(v({ vitesse: 0.49 }).vitesse, null);
  assert.equal(v({ vitesse: 2.51 }).vitesse, null);
  assert.equal(v({ rappel: '' }).rappel, null, 'rien d’écrit : pas de rappel');
  assert.equal(v({ rappel: 'x'.repeat(2500) }).rappel!.length, 2000);
  assert.equal(v({ rappel: 7 }).rappel, null);
  assert.equal(v({}).creeLe, '');
});

// ── Score → note ──

test('un score se calcule au centième et se refuse quand il n’a pas de sens', () => {
  assert.equal(scorePct(14, 20), 70);
  assert.equal(scorePct(1, 3), 33.33);
  assert.equal(scorePct(2, 3), 66.67);
  assert.equal(scorePct(0, 10), 0);
  assert.equal(scorePct(10, 10), 100);
  assert.equal(scorePct(7.5, 10), 75, 'les demi-points comptent');
  for (const [points, sur] of [[1, 0], [0, 0], [1, -5], [-1, 10], [11, 10], [Number.NaN, 10], [5, Number.NaN], [Infinity, 10], [5, Infinity]]) assert.equal(scorePct(points, sur), null, `${points}/${sur}`);
});

test('le score donne la note : 90 % facile, 70 % bien, 50 % difficile, en dessous à revoir', () => {
  assert.equal(noteDepuisPct(100), 'facile');
  assert.equal(noteDepuisPct(90), 'facile');
  assert.equal(noteDepuisPct(89.99), 'bien');
  assert.equal(noteDepuisPct(70), 'bien');
  assert.equal(noteDepuisPct(69.99), 'difficile');
  assert.equal(noteDepuisPct(50), 'difficile');
  assert.equal(noteDepuisPct(49.99), 'a-revoir');
  assert.equal(noteDepuisPct(0), 'a-revoir');
  assert.equal(noteDepuisPct(scorePct(18, 20)!), 'facile', '18 sur 20');
  assert.equal(noteDepuisPct(scorePct(14, 20)!), 'bien', '14 sur 20');
  assert.equal(noteDepuisPct(scorePct(10, 20)!), 'difficile', '10 sur 20');
  assert.equal(noteDepuisPct(scorePct(9, 20)!), 'a-revoir', '9 sur 20');
});

// ── Pages fragiles ──

const fragiles = (ps: Passage[]) => [...pagesFragiles(ps, AUJ)].sort();

test('une page est fragile après deux notes basses parmi ses quatre derniers passages', () => {
  assert.deepEqual(fragiles([passage('a', il(5), 'revision', 'a-revoir')]), [], 'une seule note basse : pas encore');
  assert.deepEqual(fragiles([passage('a', il(9), 'revision', 'a-revoir'), passage('a', il(5), 'revision', 'difficile')]), ['a']);
  assert.deepEqual(fragiles([passage('a', il(9), 'revision', 'difficile'), passage('a', il(5), 'rappel', 'difficile')]), ['a'], 'difficile deux fois');
  assert.deepEqual(fragiles([passage('a', il(9), 'revision', 'bien'), passage('a', il(5), 'revision', 'facile')]), [], 'que du bon');
});

test('deux bons passages de suite à la fin libèrent la page ; un seul ne suffit pas', () => {
  const base = [passage('a', il(12), 'revision', 'a-revoir'), passage('a', il(10), 'revision', 'difficile')];
  assert.deepEqual(fragiles([...base, passage('a', il(7), 'revision', 'bien')]), ['a'], 'un seul bon passage');
  assert.deepEqual(fragiles([...base, passage('a', il(7), 'revision', 'bien'), passage('a', il(3), 'revision', 'facile')]), [], 'remontée');
  assert.deepEqual(fragiles([...base, passage('a', il(7), 'revision', 'bien'), passage('a', il(3), 'revision', 'difficile')]), ['a'], 'rechute');
});

test('seuls les quatre derniers passages notés comptent', () => {
  const vieux = [passage('a', il(20), 'revision', 'a-revoir'), passage('a', il(19), 'revision', 'a-revoir')];
  const recents = [passage('a', il(8), 'revision', 'bien'), passage('a', il(6), 'revision', 'bien'), passage('a', il(4), 'revision', 'bien'), passage('a', il(2), 'revision', 'bien')];
  assert.deepEqual(fragiles([...vieux, ...recents]), [], 'les deux échecs sont hors des quatre derniers');
  assert.deepEqual(fragiles([...vieux, recents[2], recents[3]]), [], 'et ici, remontée');
  const quatre = [passage('a', il(9), 'revision', 'a-revoir'), passage('a', il(8), 'revision', 'bien'), passage('a', il(7), 'revision', 'difficile'), passage('a', il(6), 'revision', 'bien')];
  assert.deepEqual(fragiles(quatre), ['a'], 'deux basses sur quatre, la dernière bonne seule');
  // Un échec encore dans la fenêtre compte ; un cinquième passage le pousse dehors (la dernière note, basse, ne suffit pas seule).
  assert.deepEqual(fragiles([passage('a', il(9), 'revision', 'a-revoir'), passage('a', il(8), 'revision', 'bien'), passage('a', il(7), 'revision', 'bien'), passage('a', il(6), 'revision', 'difficile')]), ['a'], 'l’échec est dans les quatre derniers');
  assert.deepEqual(fragiles([passage('a', il(10), 'revision', 'a-revoir'), passage('a', il(9), 'revision', 'bien'), passage('a', il(8), 'revision', 'bien'), passage('a', il(7), 'revision', 'bien'), passage('a', il(6), 'revision', 'difficile')]), [], 'l’échec est sorti de la fenêtre : il ne reste qu’une note basse');
});

test('les passages sans note, trop anciens ou à venir ne comptent pas', () => {
  assert.deepEqual(fragiles([passage('a', il(9), 'lecture'), passage('a', il(8), 'relecture'), passage('a', il(7), 'revision', 'a-revoir')]), [], 'lecture et relecture n’ont pas de note');
  assert.equal(FRAGILE_FENETRE_JOURS, 45);
  assert.deepEqual(fragiles([passage('a', il(45), 'revision', 'a-revoir'), passage('a', il(44), 'revision', 'a-revoir')]), ['a'], 'à 45 jours : encore compté');
  assert.deepEqual(fragiles([passage('a', il(46), 'revision', 'a-revoir'), passage('a', il(44), 'revision', 'a-revoir')]), [], 'à 46 jours : hors fenêtre');
  assert.deepEqual(fragiles([passage('a', il(3), 'revision', 'a-revoir'), passage('a', ajouterJours(AUJ, 1), 'revision', 'a-revoir')]), [], 'un passage de demain (horloge déréglée) est ignoré');
  assert.deepEqual(fragiles([passage('a', AUJ, 'revision', 'a-revoir'), passage('a', il(2), 'revision', 'difficile')]), ['a'], 'aujourd’hui compte');
});

test('chaque page a son compte, et l’ordre reçu ne change rien', () => {
  const ps = [passage('a', il(9), 'revision', 'a-revoir'), passage('b', il(9), 'revision', 'a-revoir'), passage('a', il(5), 'revision', 'difficile'), passage('b', il(5), 'revision', 'bien')];
  assert.deepEqual(fragiles(ps), ['a']);
  assert.deepEqual(fragiles([...ps].reverse()), ['a']);
  // Même jour : c'est l'ordre d'écriture qui tranche (mauvais puis bon : remontée ; bon puis mauvais : rechute).
  const memeJour = (premier: Note, second: Note) => [passage('c', il(9), 'revision', 'a-revoir'), passage('c', il(5), 'revision', 'difficile'), passage('c', il(3), 'revision', premier, { creeLe: `${il(3)}T09:00:00Z` }), passage('c', il(3), 'revision', second, { creeLe: `${il(3)}T15:00:00Z` })];
  assert.deepEqual(fragiles(memeJour('difficile', 'bien')), ['c'], 'le dernier est bon seul');
  assert.deepEqual(fragiles(memeJour('bien', 'facile')), [], 'deux bons à la fin');
  assert.deepEqual(fragiles(memeJour('facile', 'a-revoir')).length, 1, 'rechute');
  assert.deepEqual(fragiles(memeJour('bien', 'facile').reverse()), [], 'même résultat si on reçoit les lignes à l’envers');
});

test('les lectures et relectures, sans note, ne repoussent pas les notes basses hors de la fenêtre', () => {
  const ps = [passage('a', il(9), 'revision', 'a-revoir'), passage('a', il(8), 'revision', 'difficile'), passage('a', il(7), 'lecture'), passage('a', il(6), 'relecture'), passage('a', il(5), 'lecture'), passage('a', il(4), 'relecture')];
  assert.deepEqual(fragiles(ps), ['a'], 'seuls les passages notés comptent pour la fenêtre de quatre');
});

test('trois passages le même jour : c’est l’ordre où ils ont été écrits qui compte, pas celui où on les reçoit', () => {
  const lundi = (note: Note, heure: string) => passage('a', il(3), 'revision', note, { creeLe: `${il(3)}T${heure}:00:00Z` });
  const base = [passage('a', il(9), 'revision', 'difficile'), passage('a', il(8), 'revision', 'a-revoir')];
  const jour = [lundi('a-revoir', '09'), lundi('bien', '10'), lundi('facile', '11')];
  assert.deepEqual(fragiles([...base, ...jour]), [], 'rechute le matin, puis deux bons de suite : remontée');
  assert.deepEqual(fragiles([...base, ...[...jour].reverse()]), [], 'même résultat reçus à l’envers');
  assert.deepEqual(fragiles([...base, ...jour].reverse()), [], 'tout à l’envers');
});

// ── Examens blancs faits ──

test('un examen blanc récent dispense d’un autre pour ce cours', () => {
  const pages = [{ id: 'a', coursId: 'A' }, { id: 'b', coursId: 'B' }];
  const faits = (ps: Passage[]) => [...examensFaits(ps, pages, AUJ)].sort();
  assert.deepEqual(faits([passage('a', il(3), 'examen')]), ['A']);
  assert.deepEqual(faits([passage('a', il(EXAMEN_VALIDITE_JOURS), 'examen')]), ['A'], 'à 21 jours : encore valable');
  assert.deepEqual(faits([passage('a', il(EXAMEN_VALIDITE_JOURS + 1), 'examen')]), [], 'à 22 jours : on peut en refaire un');
  assert.deepEqual(faits([passage('a', il(3), 'revision', 'bien'), passage('b', il(3), 'rappel', 'bien')]), [], 'seuls les examens comptent');
  assert.deepEqual(faits([passage('zzz', il(3), 'examen')]), [], 'page inconnue');
  assert.deepEqual(faits([passage('a', ajouterJours(AUJ, 1), 'examen')]), [], 'à venir');
  assert.deepEqual(faits([passage('a', AUJ, 'examen'), passage('b', il(5), 'examen')]), ['A', 'B']);
});

// ── Bilan de la semaine ──

const cours = (id: string, ordre: number, extra: Partial<Cours> = {}): Cours => ({ id, titre: id, couleur: '#888', partiel: null, lien: null, ordre, motifs: '', enPause: false, pratiqueMin: null, ...extra });
const page = (coursId: string, ordre: number, extra: Partial<Chapitre> = {}): Chapitre => ({ id: `${coursId}${ordre}`, coursId, titre: `P${ordre}`, ordre, dureeMin: 20, niveau: 0, derniere: null, prochaine: null, lien: null, parCoeur: false, ...extra });
const bilan = (e: { passages?: Passage[]; chapitres?: Chapitre[]; cours?: Cours[]; fragiles?: string[] }) => bilanSemaine({ passages: e.passages ?? [], chapitres: e.chapitres ?? [], cours: e.cours ?? [], aujourdhui: AUJ, fragiles: new Set(e.fragiles ?? []) });

test('la semaine : les sept derniers jours, aujourd’hui compris', () => {
  const b = bilan({
    passages: [
      passage('a0', il(BILAN_JOURS), 'lecture'), // 7 jours avant : hors semaine
      passage('a0', il(BILAN_JOURS - 1), 'lecture'), // 6 jours avant : dedans
      passage('a1', il(3), 'lecture'),
      passage('a1', il(3), 'revision', 'bien'),
      passage('a2', il(1), 'relecture'),
      passage('a2', AUJ, 'rappel', 'difficile'),
      passage('a2', AUJ, 'examen', 'facile'),
      passage('a2', ajouterJours(AUJ, 1), 'lecture'), // demain : hors semaine
    ],
  });
  assert.equal(b.du, il(BILAN_JOURS - 1));
  assert.equal(b.au, AUJ);
  assert.deepEqual(b.passages, { lecture: 2, revision: 1, relecture: 1, rappel: 1, examen: 1 });
  assert.deepEqual(b.notes, { 'a-revoir': 0, difficile: 1, bien: 1, facile: 1 });
  assert.equal(b.joursActifs, 4, 'il y a six jours, il y a trois jours, hier, aujourd’hui');
});

test('une semaine sans rien : des zéros, pas de vitesse', () => {
  const b = bilan({});
  assert.deepEqual(b.passages, { lecture: 0, revision: 0, relecture: 0, rappel: 0, examen: 0 });
  assert.deepEqual(b.notes, { 'a-revoir': 0, difficile: 0, bien: 0, facile: 0 });
  assert.equal(b.joursActifs, 0);
  assert.equal(b.vitesse, null);
  assert.equal(b.enRetard, 0);
  assert.deepEqual(b.fragiles, []);
  assert.deepEqual(b.cours, []);
});

test('la vitesse de la semaine : la première et la dernière notées, dans l’ordre où elles ont été écrites', () => {
  const b = bilan({ passages: [passage('a0', il(1), 'lecture', null, { vitesse: 1.2 }), passage('a0', il(5), 'lecture', null, { vitesse: 1 }), passage('a0', il(2), 'lecture', null, { vitesse: 1.1 }), passage('a0', il(1), 'lecture'), passage('a0', il(30), 'lecture', null, { vitesse: 2 })] });
  assert.deepEqual(b.vitesse, { debut: 1, fin: 1.2 });
  assert.deepEqual(bilan({ passages: [passage('a0', il(1), 'lecture', null, { vitesse: 1.3 })] }).vitesse, { debut: 1.3, fin: 1.3 }, 'une seule mesure');
  assert.equal(bilan({ passages: [passage('a0', il(1), 'lecture')] }).vitesse, null, 'aucune mesure');
});

test('en retard : les pages vues dont l’échéance est passée, des cours en cours seulement', () => {
  const b = bilan({
    cours: [cours('A', 0), cours('P', 1, { enPause: true }), cours('F', 2, { partiel: il(1) })],
    chapitres: [
      page('A', 0, { niveau: 2, prochaine: il(1) }), // en retard
      page('A', 1, { niveau: 2, prochaine: AUJ }), // dû aujourd'hui : pas en retard
      page('A', 2, { niveau: 2, prochaine: ajouterJours(AUJ, 3) }),
      page('A', 3, { niveau: 0, prochaine: il(5) }), // jamais lue : pas une révision
      page('A', 4, { niveau: 3, prochaine: null }),
      page('P', 0, { niveau: 2, prochaine: il(4) }), // en pause
      page('F', 0, { niveau: 2, prochaine: il(4) }), // partiel passé
    ],
  });
  assert.equal(b.enRetard, 1);
});

test('les pages fragiles du bilan : des cours en cours, dans l’ordre des cours puis des pages, huit au plus', () => {
  const chapitres = [...Array.from({ length: 6 }, (_, i) => page('B', i, { niveau: 2 })), ...Array.from({ length: 6 }, (_, i) => page('A', i, { niveau: 2 })), page('P', 0, { niveau: 2 })];
  const b = bilan({ cours: [cours('A', 0), cours('B', 1), cours('P', 2, { enPause: true })], chapitres, fragiles: chapitres.map((c) => c.id) });
  assert.equal(b.fragiles.length, 8);
  assert.deepEqual(b.fragiles, ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'B0', 'B1']);
  assert.ok(!b.fragiles.includes('P0'));
  assert.deepEqual(bilan({ cours: [cours('A', 0)], chapitres: [page('A', 0, { niveau: 2 })], fragiles: ['zzz'] }).fragiles, [], 'une page inconnue n’est pas listée');
});

test('à ce rythme : combien de pages restent, à quelle vitesse on lit, quand tout serait lu', () => {
  const partiel = '2026-12-04'; // les pages neuves s'arrêtent le 30 novembre (partiel − 4 jours)
  const chapitres = (restantes: number) => [...Array.from({ length: 4 }, (_, i) => page('A', i, { niveau: 1 })), ...Array.from({ length: restantes }, (_, i) => page('A', 10 + i))];
  const lectures = (k: number) => Array.from({ length: k }, (_, i) => passage('A0', il(i % RYTHME_JOURS), 'lecture'));
  const projeter = (restantes: number, k: number, p: string | null = partiel) => bilan({ cours: [cours('A', 0, { partiel: p })], chapitres: chapitres(restantes), passages: lectures(k) }).cours[0];
  // 14 pages lues en 14 jours : une par jour. 10 restantes → fini le 30 novembre, pile à la limite.
  assert.deepEqual(projeter(10, 14), { coursId: 'A', pagesRestantes: 10, rythme: 1, fin: '2026-11-30', avantPartiel: true });
  assert.deepEqual(projeter(11, 14), { coursId: 'A', pagesRestantes: 11, rythme: 1, fin: '2026-12-01', avantPartiel: false });
  // Sept pages en quatorze jours : une demi-page par jour, deux fois plus long.
  assert.deepEqual(projeter(5, 7), { coursId: 'A', pagesRestantes: 5, rythme: 0.5, fin: '2026-11-30', avantPartiel: true });
  // L'arrondi est vers le haut : 7 pages à 3 par jour (42 en 14 j) → 3 jours, pas 2,33.
  assert.equal(projeter(7, 42).fin, '2026-11-23');
  // Pas de rythme (rien lu depuis deux semaines) : pas de date, pas de verdict.
  assert.deepEqual(projeter(5, 0), { coursId: 'A', pagesRestantes: 5, rythme: 0, fin: null, avantPartiel: null });
  // Tout est lu : rien à projeter.
  assert.deepEqual(projeter(0, 14), { coursId: 'A', pagesRestantes: 0, rythme: 1, fin: null, avantPartiel: null });
  // Sans partiel : une date de fin, mais pas de verdict.
  assert.deepEqual(projeter(10, 14, null), { coursId: 'A', pagesRestantes: 10, rythme: 1, fin: '2026-11-30', avantPartiel: null });
});

test('le rythme ne compte que les lectures des deux dernières semaines, de ce cours', () => {
  const chapitres = [page('A', 0, { niveau: 1 }), page('A', 1), page('B', 0, { niveau: 1 }), page('B', 1)];
  const b = bilan({
    cours: [cours('A', 0), cours('B', 1)],
    chapitres,
    passages: [
      passage('A0', il(RYTHME_JOURS - 1), 'lecture'), // dernier jour de la fenêtre
      passage('A0', il(RYTHME_JOURS), 'lecture'), // un jour de trop
      passage('A0', il(3), 'revision', 'bien'), // pas une lecture
      passage('A0', ajouterJours(AUJ, 2), 'lecture'), // à venir
      passage('B0', il(2), 'lecture'),
      passage('B0', il(4), 'lecture'),
    ],
  });
  assert.equal(b.cours[0].rythme, 1 / RYTHME_JOURS);
  assert.equal(b.cours[1].rythme, 2 / RYTHME_JOURS);
});

test('les cours en pause ou au partiel passé ou du jour n’ont pas de projection', () => {
  const b = bilan({ cours: [cours('A', 0), cours('P', 1, { enPause: true }), cours('F', 2, { partiel: il(1) }), cours('J', 3, { partiel: AUJ }), cours('D', 4, { partiel: ajouterJours(AUJ, 1) })], chapitres: [] });
  assert.deepEqual(b.cours.map((c) => c.coursId), ['A', 'D'], 'dans l’ordre des cours');
});

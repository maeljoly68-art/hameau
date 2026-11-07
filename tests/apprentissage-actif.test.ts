import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARTES_PAR_PAGE_MAX, CARTE_QUESTION_MAX, CARTE_REPONSE_MAX, analyserCartes, carteValide, cartesParPage, type Carte } from '../src/core/cartes.ts';
import { CALIBRAGE_JOURS, CALIBRAGE_MIN, CONFIANCES, calibrage, rangNote } from '../src/core/confiance.ts';
import type { Chapitre, Cours, NoteChapitre } from '../src/core/cours.ts';
import { ERREURS_PAR_JOUR, ERREUR_PREMIER_RETOUR, ERREUR_RETOUR_SUIVANT, ERREUR_TEXTE_MAX, erreurValide, erreursDuJour, estDue, estOuverte, texteErreur, type Erreur } from '../src/core/erreurs.ts';
import { FICHE_VEILLE_JOURS, construireFiche, estVeille, ficheEnTexte } from '../src/core/fiche.ts';
import { HEURES_ECART_MIN, HEURES_MIN, MOMENTS, heuresProductives, momentDe } from '../src/core/heures.ts';
import { ajouterJours } from '../src/core/jours.ts';
import { passageValide, type Passage, type SortePassage } from '../src/core/passages.ts';
import { PLAFOND_JOUR, POINTS_PASSAGE, PRIME_REUSSITE, PRIME_SERIE_MAX, pointsApprentissage, type PassageLeger } from '../src/core/pointsApprentissage.ts';
import type { Note } from '../src/core/revision.ts';

const AUJ = '2026-11-20';
const il = (jours: number) => ajouterJours(AUJ, -jours);
let n = 0;
const passage = (jour: string, sorte: SortePassage, note: Note | null, confiance: number | null, extra: Partial<Passage> = {}): Passage => ({ id: `p${++n}`, chapitreId: 'c1', jour, sorte, note, minutes: null, scorePct: null, vitesse: null, rappel: null, confiance, creeLe: `${jour}T10:00:00Z`, ...extra });

// ── Confiance ──

test('une confiance est lue entre 0 et 3, entière ; sinon absente', () => {
  const base = { id: 'x', chapitreId: 'c', jour: '2026-11-05', sorte: 'rappel', note: 'bien', creeLe: '' };
  assert.equal(passageValide({ ...base, confiance: 2 })?.confiance, 2);
  assert.equal(passageValide({ ...base, confiance: 0 })?.confiance, 0);
  assert.equal(passageValide({ ...base, confiance: 3 })?.confiance, 3);
  assert.equal(passageValide({ ...base, confiance: 4 })?.confiance, null);
  assert.equal(passageValide({ ...base, confiance: -1 })?.confiance, null);
  assert.equal(passageValide({ ...base, confiance: 1.5 })?.confiance, null);
  assert.equal(passageValide({ ...base, confiance: '2' })?.confiance, null);
  assert.equal(passageValide(base)?.confiance, null);
});

test('l’échelle de confiance et celle des notes ont les mêmes quatre crans', () => {
  assert.deepEqual(CONFIANCES.map((c) => c.id), [0, 1, 2, 3]);
  assert.deepEqual((['a-revoir', 'difficile', 'bien', 'facile'] as Note[]).map(rangNote), [0, 1, 2, 3]);
});

test('calibrage : sûr de soi puis « à revoir » = surestimation, et chaque illusion est comptée', () => {
  const ps = Array.from({ length: CALIBRAGE_MIN }, (_, i) => passage(il(i), 'rappel', i % 2 === 0 ? 'a-revoir' : 'difficile', 3));
  const c = calibrage(ps, AUJ);
  assert.equal(c.verdict, 'surestime');
  assert.equal(c.n, CALIBRAGE_MIN);
  assert.equal(c.illusions, CALIBRAGE_MIN);
  assert.equal(c.ecart, (3 - 0 + 3 - 1) / 2);
});

test('calibrage : peu sûr puis « facile » = sous-estimation', () => {
  const ps = Array.from({ length: CALIBRAGE_MIN }, (_, i) => passage(il(i), 'rappel', 'facile', 1));
  const c = calibrage(ps, AUJ);
  assert.equal(c.verdict, 'sous-estime');
  assert.equal(c.ecart, -2);
  assert.equal(c.illusions, 0);
});

test('calibrage : confiance et note à peu près d’accord = juste', () => {
  const ps = [2, 3, 1, 2, 2, 0].map((k, i) => passage(il(i), 'rappel', (['a-revoir', 'difficile', 'bien', 'facile'] as Note[])[k], k));
  assert.equal(calibrage(ps, AUJ).verdict, 'juste');
  assert.equal(calibrage(ps, AUJ).ecart, 0);
});

test('calibrage : un demi-cran d’écart suffit pour parler de biais, un peu moins non', () => {
  const six = (confs: number[]) => confs.map((k, i) => passage(il(i), 'rappel', 'bien', k));
  assert.equal(calibrage(six([3, 3, 3, 2, 2, 2]), AUJ).verdict, 'surestime', 'écart +0,5');
  assert.equal(calibrage(six([3, 2, 2, 2, 2, 2]), AUJ).verdict, 'juste', 'écart +0,17');
  assert.equal(calibrage(six([1, 1, 1, 2, 2, 2]), AUJ).verdict, 'sous-estime', 'écart −0,5');
});

test('calibrage : trop peu de passages mesurés, pas de verdict', () => {
  const ps = Array.from({ length: CALIBRAGE_MIN - 1 }, (_, i) => passage(il(i), 'rappel', 'a-revoir', 3));
  assert.equal(calibrage(ps, AUJ).verdict, 'insuffisant');
  assert.equal(calibrage([], AUJ).verdict, 'insuffisant');
  assert.equal(calibrage([], AUJ).n, 0);
});

test('calibrage : un passage sans confiance ou sans note, ou hors des 30 jours, ne compte pas', () => {
  const ok = Array.from({ length: CALIBRAGE_MIN }, (_, i) => passage(il(i), 'rappel', 'bien', 2));
  const bruit = [passage(il(1), 'rappel', 'bien', null), passage(il(1), 'lecture', null, 3), passage(il(CALIBRAGE_JOURS), 'rappel', 'a-revoir', 3), passage(ajouterJours(AUJ, 1), 'rappel', 'a-revoir', 3)];
  const c = calibrage([...ok, ...bruit], AUJ);
  assert.equal(c.n, CALIBRAGE_MIN);
  assert.equal(c.verdict, 'juste');
  assert.equal(calibrage([...ok, passage(il(CALIBRAGE_JOURS - 1), 'rappel', 'bien', 2)], AUJ).n, CALIBRAGE_MIN + 1, 'le 29e jour compte encore');
});

// ── Carnet d'erreurs ──

const erreur = (id: string, jour: string, extra: Partial<Erreur> = {}): Erreur => ({ id, chapitreId: 'c1', texte: 'confond SA et SAS', jour, regleeLe: null, revueLe: null, ...extra });

test('une erreur revient 6 jours après, jamais avant', () => {
  assert.equal(ERREUR_PREMIER_RETOUR, 6);
  assert.equal(estDue(erreur('a', il(5)), AUJ), false);
  assert.equal(estDue(erreur('a', il(6)), AUJ), true);
  assert.equal(estDue(erreur('a', il(40)), AUJ), true);
  assert.equal(estDue(erreur('a', AUJ), AUJ), false);
});

test('« encore flou » : elle revient 3 jours plus tard ; « je sais » : plus jamais', () => {
  assert.equal(ERREUR_RETOUR_SUIVANT, 3);
  assert.equal(estDue(erreur('a', il(20), { revueLe: il(2) }), AUJ), false);
  assert.equal(estDue(erreur('a', il(20), { revueLe: il(3) }), AUJ), true);
  assert.equal(estDue(erreur('a', il(20), { regleeLe: il(1) }), AUJ), false);
  assert.equal(estOuverte(erreur('a', il(20), { regleeLe: il(1) })), false);
  assert.equal(estOuverte(erreur('a', il(20))), true);
});

test('le carnet du jour : les plus anciennes d’abord, deux au plus', () => {
  assert.equal(ERREURS_PAR_JOUR, 2);
  const e = [erreur('c', il(8)), erreur('a', il(30)), erreur('b', il(10)), erreur('d', il(2))];
  assert.deepEqual(erreursDuJour(e, AUJ).map((x) => x.id), ['a', 'b']);
});

test('le carnet du jour : celles déjà revues aujourd’hui comptent dans les deux, sans tapis roulant', () => {
  const e = [erreur('a', il(30)), erreur('b', il(10)), erreur('c', il(8))];
  assert.deepEqual(erreursDuJour(e, AUJ, 1).map((x) => x.id), ['a']);
  assert.deepEqual(erreursDuJour(e, AUJ, 2), []);
  assert.deepEqual(erreursDuJour(e, AUJ, 99), []);
  assert.equal(erreursDuJour(e, AUJ, -5).length, 2);
  // « Encore flou » aujourd'hui : elle ne revient pas dans la foulée.
  assert.deepEqual(erreursDuJour([erreur('a', il(30), { revueLe: AUJ })], AUJ), []);
});

test('le texte d’une erreur est nettoyé et borné, ou refusé s’il est vide', () => {
  assert.equal(texteErreur('  confond   SA \n et SAS  '), 'confond SA et SAS');
  assert.equal(texteErreur('   '), null);
  assert.equal(texteErreur('x'.repeat(ERREUR_TEXTE_MAX + 50))?.length, ERREUR_TEXTE_MAX);
});

test('une erreur lue en base : refusée si elle est incomplète ou sans jour valable', () => {
  const ok = { id: 'e', chapitreId: 'c', texte: 'oubli du quorum', jour: '2026-11-05', regleeLe: null, revueLe: '2026-11-08' };
  assert.deepEqual(erreurValide(ok), { id: 'e', chapitreId: 'c', texte: 'oubli du quorum', jour: '2026-11-05', regleeLe: null, revueLe: '2026-11-08' });
  assert.equal(erreurValide({ ...ok, jour: 'demain' }), null);
  assert.equal(erreurValide({ ...ok, texte: '  ' }), null);
  assert.equal(erreurValide({ ...ok, id: 3 }), null);
  assert.equal(erreurValide(null), null);
  assert.equal(erreurValide({ ...ok, regleeLe: 'x' })?.regleeLe, null);
});

// ── Cartes ──

test('« question :: réponse », une carte par ligne ; les lignes bancales sont écartées et comptées', () => {
  const r = analyserCartes('Capital minimum d’une SA ? :: 37 000 €\n\nQuorum :: 1/4 sur première convocation :: 1/5 sur la seconde\nsans séparateur\n:: réponse seule\nquestion seule ::   \r\nSAS ? :: liberté statutaire');
  assert.deepEqual(r.cartes, [
    { question: 'Capital minimum d’une SA ?', reponse: '37 000 €' },
    { question: 'Quorum', reponse: '1/4 sur première convocation :: 1/5 sur la seconde' },
    { question: 'SAS ?', reponse: 'liberté statutaire' },
  ]);
  assert.equal(r.ecartees, 3);
  assert.deepEqual(analyserCartes(''), { cartes: [], ecartees: 0 });
});

test('les cartes sont bornées en longueur à la lecture', () => {
  const longue = analyserCartes(`${'q'.repeat(CARTE_QUESTION_MAX + 20)} :: ${'r'.repeat(CARTE_REPONSE_MAX + 20)}`).cartes[0];
  assert.equal(longue.question.length, CARTE_QUESTION_MAX);
  assert.equal(longue.reponse.length, CARTE_REPONSE_MAX);
  assert.ok(CARTES_PAR_PAGE_MAX >= 10);
});

test('une carte lue en base : refusée si un côté est vide', () => {
  const ok = { id: 'k', chapitreId: 'c', question: ' Q ? ', reponse: ' R ', ordre: 2 };
  assert.deepEqual(carteValide(ok), { id: 'k', chapitreId: 'c', question: 'Q ?', reponse: 'R', ordre: 2 });
  assert.equal(carteValide({ ...ok, question: '  ' }), null);
  assert.equal(carteValide({ ...ok, reponse: '' }), null);
  assert.equal(carteValide({ ...ok, id: 1 }), null);
  assert.equal(carteValide({ ...ok, ordre: 'x' })?.ordre, 0);
});

test('les cartes d’une page restent dans l’ordre où elles ont été écrites', () => {
  const k = (id: string, chapitreId: string, ordre: number): Carte => ({ id, chapitreId, question: id, reponse: id, ordre });
  const m = cartesParPage([k('c', 'p1', 2), k('a', 'p1', 0), k('z', 'p2', 0), k('b', 'p1', 1)]);
  assert.deepEqual(m.get('p1')!.map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(m.get('p2')!.map((x) => x.id), ['z']);
  assert.equal(m.get('p3'), undefined);
});

// ── Fiche de la veille ──

const cours = (id: string, partiel: string | null): Cours => ({ id, titre: id, couleur: '#888', partiel, lien: null, ordre: 0, motifs: '', enPause: false, pratiqueMin: null });
const chap = (coursId: string, ordre: number, extra: Partial<Chapitre> = {}): Chapitre => ({ id: `${coursId}${ordre}`, coursId, titre: `Page ${ordre + 1}`, ordre, dureeMin: 20, niveau: 2, derniere: null, prochaine: null, lien: null, parCoeur: false, ...extra });
const note = (chapitreId: string, texte: string): NoteChapitre => ({ id: `n-${chapitreId}-${texte}`, chapitreId, texte, citation: null, creeLe: '' });
const fiche = (chs: Chapitre[], extra: Partial<Parameters<typeof construireFiche>[0]> = {}) => construireFiche({ cours: cours('A', ajouterJours(AUJ, 1)), chapitres: chs, notes: [], cartes: [], erreurs: [], fragiles: new Set(), aujourdhui: AUJ, ...extra });

test('la fiche range chaque page à sa place : mot pour mot, fragile, ou avec des notes', () => {
  const f = fiche([chap('A', 0, { parCoeur: true }), chap('A', 1), chap('A', 2), chap('A', 3), chap('A', 4, { parCoeur: true })], { fragiles: new Set(['A1', 'A4']), notes: [note('A2', 'à relire'), note('A0', 'doublon')] });
  assert.deepEqual(f.motPourMot.map((p) => p.numero), [1, 5]);
  assert.deepEqual(f.fragiles.map((p) => p.numero), [2], 'une page mot pour mot et fragile n’est listée qu’une fois');
  assert.deepEqual(f.notes.map((p) => p.numero), [3], 'les pages déjà listées ne reviennent pas dans les notes');
  assert.equal(f.motPourMot[1].fragile, true);
});

test('la fiche liste les erreurs pas encore sues, par page, et pas celles des autres cours', () => {
  const e = [erreur('x', il(9), { chapitreId: 'A2' }), erreur('y', il(9), { chapitreId: 'A0' }), erreur('z', il(9), { chapitreId: 'A1', regleeLe: il(1) }), erreur('w', il(9), { chapitreId: 'B0' })];
  const f = fiche([chap('A', 0), chap('A', 1), chap('A', 2), chap('B', 0)], { erreurs: e });
  assert.deepEqual(f.erreurs.map((x) => [x.erreur.id, x.numero]), [['y', 1], ['x', 3]]);
  assert.equal(f.erreurs[0].titre, 'Page 1');
});

test('la fiche dit combien de pages sont apprises et lesquelles ne le sont pas', () => {
  const f = fiche([chap('A', 0, { niveau: 0 }), chap('A', 1), chap('A', 2, { niveau: 0 }), chap('B', 0, { niveau: 0 })]);
  assert.deepEqual(f.pasApprises.map((p) => p.numero), [1, 3]);
  assert.equal(f.apprises, 1);
  assert.equal(f.total, 3);
});

test('les cartes et les notes d’une page suivent la page, dans l’ordre', () => {
  const k = (id: string, ordre: number): Carte => ({ id, chapitreId: 'A0', question: id, reponse: id, ordre });
  const f = fiche([chap('A', 0, { parCoeur: true })], { cartes: [k('b', 1), k('a', 0)], notes: [note('A0', 'x')] });
  assert.deepEqual(f.motPourMot[0].cartes.map((c) => c.id), ['a', 'b']);
  assert.equal(f.motPourMot[0].notes.length, 1);
});

test('jours avant le partiel : positif, nul le jour même, négatif une fois passé, null sans date', () => {
  assert.equal(fiche([], { cours: cours('A', ajouterJours(AUJ, 2)) }).joursAvant, 2);
  assert.equal(fiche([], { cours: cours('A', AUJ) }).joursAvant, 0);
  assert.equal(fiche([], { cours: cours('A', il(1)) }).joursAvant, -1);
  assert.equal(fiche([], { cours: cours('A', null) }).joursAvant, null);
});

test('la fiche de la veille se propose 2 jours avant, 1 jour avant — pas le jour même, pas sans date', () => {
  assert.equal(FICHE_VEILLE_JOURS, 2);
  assert.deepEqual([null, -1, 0, 1, 2, 3].map(estVeille), [false, false, false, true, true, false]);
});

// ── Points d'apprentissage ──

const pl = (jour: string, sorte: string, note: Note | null = null): PassageLeger => ({ jour, sorte, note });

test('chaque sorte de passage rapporte ses points, et la réussite une prime', () => {
  assert.deepEqual(POINTS_PASSAGE, { lecture: 4, rappel: 3, revision: 3, relecture: 1, examen: 10 });
  assert.equal(PRIME_REUSSITE, 2);
  const un = (p: PassageLeger) => pointsApprentissage([p], AUJ).total - 1; // moins la prime de série du premier jour (1)
  assert.equal(un(pl(AUJ, 'lecture')), 4);
  assert.equal(un(pl(AUJ, 'rappel', 'a-revoir')), 3);
  assert.equal(un(pl(AUJ, 'rappel', 'difficile')), 3);
  assert.equal(un(pl(AUJ, 'rappel', 'bien')), 5);
  assert.equal(un(pl(AUJ, 'revision', 'facile')), 5);
  assert.equal(un(pl(AUJ, 'examen', 'bien')), 12);
  assert.equal(un(pl(AUJ, 'lecture', 'facile')), 4, 'la lecture n’a pas de prime');
  assert.equal(pointsApprentissage([pl(AUJ, 'relecture', 'bien')], AUJ).total, 1, 'la relecture seule : 1 point, pas de série');
  assert.equal(pointsApprentissage([pl(AUJ, 'inconnu')], AUJ).total, 0);
});

test('plafond par jour : valider cent fois la même page ne fait pas un village', () => {
  assert.equal(PLAFOND_JOUR, 60);
  const cent = Array.from({ length: 100 }, () => pl(AUJ, 'rappel', 'facile'));
  assert.equal(pointsApprentissage(cent, AUJ).total, PLAFOND_JOUR + 1);
  assert.equal(pointsApprentissage(cent, AUJ).parJour.get(AUJ), PLAFOND_JOUR + 1);
});

test('la série : chaque jour d’affilée ajoute 1 point de plus, jusqu’à 7', () => {
  assert.equal(PRIME_SERIE_MAX, 7);
  const dix = Array.from({ length: 10 }, (_, i) => pl(il(9 - i), 'lecture'));
  const r = pointsApprentissage(dix, AUJ);
  assert.deepEqual([...r.parJour.values()], [5, 6, 7, 8, 9, 10, 11, 11, 11, 11]);
  assert.equal(r.total, 4 * 10 + 1 + 2 + 3 + 4 + 5 + 6 + 7 * 4);
  assert.equal(r.serie, 10);
});

test('la série repart à 1 après un jour sans apprendre', () => {
  const r = pointsApprentissage([pl(il(4), 'lecture'), pl(il(3), 'lecture'), pl(il(1), 'lecture'), pl(AUJ, 'lecture')], AUJ);
  assert.deepEqual([...r.parJour.values()], [5, 6, 5, 6]);
  assert.equal(r.serie, 2);
});

test('la série ne tombe qu’à la fin du jour suivant : hier compte tant qu’aujourd’hui est vide', () => {
  assert.equal(pointsApprentissage([pl(il(2), 'lecture'), pl(il(1), 'lecture')], AUJ).serie, 2);
  assert.equal(pointsApprentissage([pl(il(3), 'lecture'), pl(il(2), 'lecture')], AUJ).serie, 0, 'rien hier ni aujourd’hui');
  assert.equal(pointsApprentissage([], AUJ).serie, 0);
});

test('la relecture seule n’entretient pas la série', () => {
  const r = pointsApprentissage([pl(il(1), 'lecture'), pl(AUJ, 'relecture')], AUJ);
  assert.equal(r.serie, 1);
  assert.equal(r.parJour.get(AUJ), 1, 'un point de relecture, sans prime de série');
});

test('un passage daté dans le futur (horloge décalée) ne rapporte rien', () => {
  assert.equal(pointsApprentissage([pl(ajouterJours(AUJ, 3), 'examen', 'facile')], AUJ).total, 0);
});

// ── Meilleures heures ──

test('les moments de la journée couvrent les 24 heures, sans trou ni doublon', () => {
  const vus = Array.from({ length: 24 }, (_, h) => momentDe(h).id);
  assert.deepEqual([vus[5], vus[6], vus[10], vus[11], vus[13], vus[14], vus[17], vus[18], vus[21], vus[22], vus[23], vus[0], vus[5]], ['nuit', 'matin', 'matin', 'midi', 'midi', 'apres-midi', 'apres-midi', 'soir', 'soir', 'nuit', 'nuit', 'nuit', 'nuit']);
  assert.equal(MOMENTS.length, 5);
  assert.equal(momentDe(30).id, momentDe(6).id, 'une heure hors de 0–23 est ramenée dans la journée');
  assert.equal(momentDe(-1).id, 'nuit');
});

const aHeure = (h: number) => (creeLe: string) => (creeLe.startsWith('H') ? Number(creeLe.slice(1)) : h);
const avec = (heure: number, note: Note, sorte: SortePassage = 'rappel') => passage(AUJ, sorte, note, null, { creeLe: `H${heure}` });
const lot = (heure: number, note: Note, k: number) => Array.from({ length: k }, () => avec(heure, note));

test('le meilleur moment est celui où les notes sont les meilleures, avec assez de passages', () => {
  const h = heuresProductives([...lot(9, 'facile', HEURES_MIN), ...lot(23, 'a-revoir', HEURES_MIN), ...lot(15, 'bien', HEURES_MIN)], aHeure(0));
  assert.equal(h.meilleur?.id, 'matin');
  assert.equal(h.pire?.id, 'nuit');
  assert.equal(h.moments.find((m) => m.moment.id === 'matin')?.moyenne, 3);
  assert.equal(h.moments.find((m) => m.moment.id === 'nuit')?.moyenne, 0);
  assert.equal(h.moments.find((m) => m.moment.id === 'soir')?.moyenne, null);
});

test('trop peu de passages dans un moment : il ne peut être ni meilleur ni pire', () => {
  const h = heuresProductives([...lot(9, 'facile', HEURES_MIN - 1), ...lot(23, 'a-revoir', HEURES_MIN), ...lot(15, 'bien', HEURES_MIN)], aHeure(0));
  assert.equal(h.meilleur?.id, 'apres-midi');
  assert.equal(h.pire?.id, 'nuit');
  assert.equal(h.moments.find((m) => m.moment.id === 'matin')?.n, HEURES_MIN - 1);
});

test('un seul moment fiable, ou des moments trop proches : pas de conseil', () => {
  assert.equal(heuresProductives(lot(9, 'bien', 20), aHeure(0)).meilleur, null);
  assert.equal(HEURES_ECART_MIN, 0.25);
  const proches = [...lot(9, 'bien', 8), ...lot(15, 'bien', 7), ...lot(15, 'difficile', 0)];
  assert.equal(heuresProductives(proches, aHeure(0)).meilleur, null);
  const un_cran_ecart = [...lot(9, 'bien', 4), ...lot(9, 'facile', 4), ...lot(15, 'bien', 8)]; // 2,5 contre 2,0
  assert.equal(heuresProductives(un_cran_ecart, aHeure(0)).meilleur?.id, 'matin');
});

test('les passages sans note ne comptent pas, ni une heure illisible ; une première séance notée compte', () => {
  const bruit = [passage(AUJ, 'lecture', null, null, { creeLe: 'H9' }), passage(AUJ, 'rappel', null, null, { creeLe: 'H9' }), passage(AUJ, 'lecture', 'bien', null, { creeLe: 'H9' })];
  const h = heuresProductives([...bruit, ...lot(15, 'bien', 5)], (c) => (c === 'H9' ? null : 15));
  assert.equal(h.moments.reduce((t, m) => t + m.n, 0), 5, 'heure illisible : écartée');
  const comptes = heuresProductives([passage(AUJ, 'lecture', 'bien', null, { creeLe: 'H9' }), passage(AUJ, 'lecture', null, null, { creeLe: 'H9' })], aHeure(0));
  assert.equal(comptes.moments.find((m) => m.moment.id === 'matin')?.n, 1, 'la lecture notée compte, la non notée non');
});

test('la fiche en texte : titre, partiel, erreurs, mot pour mot avec cartes, fragiles, notes, pages pas apprises', () => {
  const k = (id: string, q: string, r: string): Carte => ({ id, chapitreId: 'A0', question: q, reponse: r, ordre: 0 });
  const f = fiche([chap('A', 0, { parCoeur: true }), chap('A', 1), chap('A', 2, { niveau: 0 }), chap('A', 3)], {
    cours: cours('A', ajouterJours(AUJ, 1)),
    fragiles: new Set(['A1']),
    cartes: [k('k1', 'Capital minimum ?', '37 000 €')],
    notes: [{ ...note('A3', 'penser au quorum'), citation: 'art. 225' }],
    erreurs: [erreur('e1', il(9), { chapitreId: 'A1' })],
  });
  const t = ficheEnTexte(f, (j) => `le ${j}`);
  assert.match(t, /^FICHE DE LA VEILLE — A \(partiel le 2026-11-21, dans 1 j\)\n3 pages apprises sur 4\./);
  assert.match(t, /ERREURS À NE PAS REFAIRE\n- page 2 · Page 2 : confond SA et SAS/);
  assert.match(t, /À SAVOIR MOT POUR MOT\n\nPage 1 · Page 1\n {2}Q : Capital minimum \?\n {2}R : 37 000 €/);
  assert.match(t, /PAGES FRAGILES\n\nPage 2 · Page 2\n {2}Erreur : confond SA et SAS/);
  assert.match(t, /MES NOTES\n\nPage 4 · Page 4\n {2}Note : penser au quorum \(« art\. 225 »\)/);
  assert.match(t, /PAS ENCORE APPRISES : page 3$/);
});

test('la fiche en texte : sans section vide, au singulier pour une page, sans date de partiel', () => {
  const f = fiche([chap('A', 0)], { cours: cours('A', null) });
  const t = ficheEnTexte(f);
  assert.equal(t, 'FICHE DE LA VEILLE — A\n1 page apprise sur 1.');
  assert.ok(!/ERREURS|MOT POUR MOT|FRAGILES|MES NOTES|PAS ENCORE/.test(t));
  assert.match(ficheEnTexte(fiche([chap('A', 0)], { cours: cours('A', il(2)) })), /\(partiel 2026-11-18\)/, 'un partiel passé ne dit pas « dans N j »');
});

test('l’illusion de savoir : « sûr de moi » (3) puis « à revoir » ou « difficile » seulement', () => {
  const ps = [
    passage(il(1), 'rappel', 'a-revoir', 3), // illusion
    passage(il(2), 'rappel', 'difficile', 3), // illusion
    passage(il(3), 'rappel', 'bien', 3), // sûr, et c'est vrai
    passage(il(4), 'rappel', 'facile', 3),
    passage(il(5), 'rappel', 'a-revoir', 2), // plutôt sûr : pas « sûr de moi »
    passage(il(6), 'rappel', 'difficile', 1),
  ];
  assert.equal(calibrage(ps, AUJ).illusions, 2);
});

test('la fiche : une page au cran 1 (apprise une fois) n’est pas « pas encore apprise »', () => {
  const f = fiche([chap('A', 0, { niveau: 0 }), chap('A', 1, { niveau: 1 }), chap('A', 2, { niveau: 2 })]);
  assert.deepEqual(f.pasApprises.map((p) => p.numero), [1]);
  assert.equal(f.apprises, 2);
});

test('meilleurs moments : un écart d’exactement un quart de cran suffit', () => {
  const matin = [...lot(9, 'bien', 6), ...lot(9, 'facile', 2)]; // 18 / 8 = 2,25
  const apresMidi = lot(15, 'bien', 8); // 2,00
  const h = heuresProductives([...matin, ...apresMidi], aHeure(0));
  assert.equal(h.meilleur?.id, 'matin');
  assert.equal(h.pire?.id, 'apres-midi');
  const presque = heuresProductives([...lot(9, 'bien', 7), ...lot(9, 'facile', 1), ...lot(15, 'bien', 8)], aHeure(0)); // 2,125 contre 2
  assert.equal(presque.meilleur, null);
});

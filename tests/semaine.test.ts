import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISPONIBILITES_DEFAUT, type Chapitre, type Cours, type Disponibilites } from '../src/core/cours.ts';
import { ajouterJours } from '../src/core/jours.ts';
import { dureeLecture, planifier, type Plan, type Seance } from '../src/core/planning.ts';
import type { Bloc } from '../src/core/pages.ts';
import type { Passage } from '../src/core/passages.ts';
import {
  debutDeSemaine,
  joursDeSemaine,
  libelleDeclaration,
  libelleSemaine,
  minutesDAvance,
  objectifsDeSemaine,
  pagesAjoutables,
  pagesEntre,
  pagesPasEncoreDues,
  peutFaireDAvance,
  semaine,
  type JourSemaine,
} from '../src/core/semaine.ts';

const AUJ = '2026-11-11'; // mercredi
const LUNDI = '2026-11-09';
const PARTIEL = '2026-12-04';

const cours = (id: string, partiel: string | null = PARTIEL, ordre = 0): Cours => ({ id, titre: id, couleur: '#6b8afd', partiel, lien: null, ordre, motifs: '', enPause: false, pratiqueMin: null, revisionLibreMin: null });
const chap = (coursId: string, ordre: number, extra: Partial<Chapitre> = {}): Chapitre => ({ id: `${coursId}-${ordre}`, coursId, titre: `Page ${ordre + 1}`, ordre, dureeMin: 30, niveau: 0, derniere: null, prochaine: null, lien: null, parCoeur: false, ...extra });
const pages = (coursId: string, n: number, extra: Partial<Chapitre> = {}) => Array.from({ length: n }, (_, i) => chap(coursId, i, extra));
const dispo = (m: number): Disponibilites => ({ ...DISPONIBILITES_DEFAUT, semaine: [m, m, m, m, m, m, m], libres: [], relecture: 0 });
const calendrier = (chapitres: readonly Chapitre[], extra: Partial<Parameters<typeof planifier>[0]> = {}): Plan => planifier({ cours: [cours('A')], chapitres, disponibilites: dispo(90), aujourdhui: AUJ, partRappel: 0, ...extra });
const sea = (jour: string, ordre: number, extra: Partial<Seance> = {}): Seance => ({ jour, coursId: 'A', chapitreId: `A-${ordre}`, type: 'decouverte', minutes: 30, raison: 'À découvrir', suite: false, complete: true, retard: 0, fragile: false, niveau: 0, parCoeur: false, ...extra });
const passage = (jour: string, chapitreId: string, extra: Partial<Passage> = {}): Passage => ({ id: `${jour}-${chapitreId}-${extra.sorte ?? 'lecture'}`, chapitreId, jour, sorte: 'lecture', note: null, minutes: null, scorePct: null, vitesse: null, rappel: null, confiance: null, creeLe: '', ...extra });
const entree = (e: Partial<Parameters<typeof semaine>[0]> & Pick<Parameters<typeof semaine>[0], 'plan' | 'chapitres'>) => ({ lundi: LUNDI, aujourdhui: AUJ, cours: [cours('A')], passages: [] as Passage[], libres: [], ...e });

test('la semaine commence le lundi et compte sept jours', () => {
  assert.equal(debutDeSemaine('2026-11-11'), '2026-11-09', 'mercredi → lundi');
  assert.equal(debutDeSemaine('2026-11-09'), '2026-11-09', 'le lundi est son propre début');
  assert.equal(debutDeSemaine('2026-11-15'), '2026-11-09', 'dimanche → lundi d’avant');
  assert.equal(debutDeSemaine('2026-11-16'), '2026-11-16');
  assert.deepEqual(joursDeSemaine('2026-11-09'), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  assert.equal(debutDeSemaine('2026-11-01'), '2026-10-26', 'à cheval sur deux mois');
});

test('« 9 – 15 nov. », et les deux mois quand la semaine en change', () => {
  assert.equal(libelleSemaine('2026-11-09'), '9 – 15 nov.');
  assert.equal(libelleSemaine('2026-10-26'), '26 oct. – 1 nov.');
  assert.equal(libelleSemaine('2026-12-28'), '28 déc. – 3 janv.');
});

test('les jours passés montrent ce qui a été fait, aujourd’hui le fait et le reste, la suite le calendrier', () => {
  const chapitres = pages('A', 10, { niveau: 0 }).map((c, i) => (i < 3 ? { ...c, niveau: 1, derniere: '2026-11-10', prochaine: '2026-11-11' } : c));
  const passages = [passage('2026-11-09', 'A-0'), passage('2026-11-10', 'A-1'), passage('2026-11-10', 'A-2', { minutes: 20 }), passage('2026-11-10', 'A-1', { sorte: 'revision', note: 'bien', minutes: 10 })];
  const s = semaine(entree({ plan: calendrier(chapitres), chapitres, passages }));
  assert.equal(s.length, 7);
  assert.deepEqual(s.map((j) => j.quand), ['passe', 'passe', 'aujourdhui', 'futur', 'futur', 'futur', 'futur']);
  assert.deepEqual(s[0].faits, [{ coursId: 'A', sorte: 'lecture', pages: [1], minutes: null }]);
  assert.deepEqual(s[1].faits, [
    { coursId: 'A', sorte: 'lecture', pages: [2, 3], minutes: 20 },
    { coursId: 'A', sorte: 'revision', pages: [2], minutes: 10 },
  ], 'lecture avant révision, pages en ordre, minutes connues additionnées');
  assert.deepEqual(s[0].blocs, [], 'un jour passé n’a plus rien « à faire »');
  assert.equal(s[0].minutes, 0);
  assert.ok(s[2].blocs.length > 0, 'aujourd’hui : le reste à faire');
  assert.ok(s[3].blocs.length > 0 && s[3].faits.length === 0, 'un jour à venir n’a pas de passé');
  assert.equal(s[3].minutes, s[3].blocs.reduce((t, b) => t + b.minutes, 0));
});

test('un passage d’une page disparue du cours est écarté, pas fatal', () => {
  const chapitres = pages('A', 3);
  const s = semaine(entree({ plan: { seances: [], alertes: [] }, chapitres, passages: [passage('2026-11-09', 'fantome'), passage('2026-11-09', 'A-0')] }));
  assert.deepEqual(s[0].faits.map((f) => f.pages), [[1]]);
});

test('les séances d’étude libre et les partiels de la semaine sont signalés', () => {
  const libres = [{ jour: '2026-11-13', coursId: 'A', minutes: 45 }, { jour: '2026-11-08', coursId: 'A', minutes: 45 }];
  const s = semaine(entree({ plan: { seances: [], alertes: [] }, chapitres: pages('A', 2), libres, cours: [cours('A', '2026-11-14'), { ...cours('B', '2026-11-14'), enPause: true }, cours('C', null)] }));
  assert.deepEqual(s[4].libres, [{ jour: '2026-11-13', coursId: 'A', minutes: 45 }]);
  assert.equal(s[4].minutes, 45, 'l’étude libre compte dans les minutes du jour');
  assert.deepEqual(s[5].partiels, ['A'], 'le cours en pause et le cours sans date ne sont pas des partiels');
});

test('le bilan de la semaine : par cours, ce qu’on lit, apprend et révise, sur les jours qui restent', () => {
  const plan: Plan = {
    alertes: [],
    seances: [
      sea('2026-11-10', 0), // passé : ne compte plus
      sea('2026-11-11', 1, { minutes: 20 }),
      sea('2026-11-11', 2, { minutes: 25 }),
      sea('2026-11-12', 3, { minutes: 30 }),
      sea('2026-11-12', 0, { type: 'revision', niveau: 1, minutes: 15, raison: 'Révision' }),
      sea('2026-11-13', 4, { minutes: 30 }),
      sea('2026-11-13', 1, { type: 'revision', niveau: 2, minutes: 10, raison: 'Révision' }),
    ],
  };
  const chapitres = pages('A', 6);
  const o = objectifsDeSemaine(semaine(entree({ plan, chapitres })));
  assert.equal(o.length, 1);
  const A = o[0];
  assert.equal(A.coursId, 'A');
  assert.deepEqual(A.lignes.map((l) => l.etape), ['lire', 'apprendre', 'reviser'], 'dans l’ordre du travail');
  assert.deepEqual(A.lignes[0].pages, [2, 3, 4, 5], 'lire : les pages 2 à 5 (page 1 déjà passée)');
  assert.equal(A.lignes[0].minutes, 20 + 25 + 30 + 30);
  assert.deepEqual(A.lignes[0].jours, ['2026-11-11', '2026-11-12', '2026-11-13']);
  assert.deepEqual(A.lignes[1].pages, [1], 'apprendre : page 1 (niveau 1)');
  assert.deepEqual(A.lignes[2].pages, [2], 'réviser : page 2 (niveau 2)');
  assert.equal(A.minutes, 105 + 15 + 10);
});

test('le bilan compte aussi l’étude libre, et plusieurs cours restent séparés', () => {
  const plan: Plan = { alertes: [], seances: [sea('2026-11-11', 0), { ...sea('2026-11-11', 0), coursId: 'B', chapitreId: 'B-0' }] };
  const o = objectifsDeSemaine(semaine(entree({ plan, chapitres: [...pages('A', 2), ...pages('B', 2)], libres: [{ jour: '2026-11-12', coursId: 'A', minutes: 45 }, { jour: '2026-11-14', coursId: 'A', minutes: 30 }, { jour: '2026-11-14', coursId: 'C', minutes: 30 }] })));
  assert.deepEqual(o.map((x) => x.coursId).sort(), ['A', 'B', 'C']);
  const A = o.find((x) => x.coursId === 'A')!;
  assert.deepEqual(A.libre, { seances: 2, minutes: 75 });
  assert.equal(A.minutes, 30 + 75);
  assert.deepEqual(o.find((x) => x.coursId === 'C')!.lignes, [], 'un cours qui n’a que de l’étude libre n’a pas de pages');
});

test('une semaine sans rien à faire n’a aucun objectif', () => {
  assert.deepEqual(objectifsDeSemaine(semaine(entree({ plan: { seances: [], alertes: [] }, chapitres: [] }))), []);
});

// ── S'avancer ──

test('lire d’avance : seulement des pages jamais lues, et pas une lecture qui se finit un autre jour', () => {
  const chapitres = [chap('A', 0, { niveau: 0 }), chap('A', 1, { niveau: 0 }), chap('A', 2, { niveau: 1 })];
  const bloc = (ids: string[], termines: string[]) => ({ etape: 'lire' as const, chapitreIds: ids, termines });
  assert.deepEqual(peutFaireDAvance(bloc(['A-0', 'A-1'], ['A-0', 'A-1']), chapitres), { ok: true });
  assert.equal(peutFaireDAvance(bloc(['A-0', 'A-2'], ['A-0', 'A-2']), chapitres).ok, false, 'une page déjà lue');
  assert.equal(peutFaireDAvance(bloc(['A-0'], []), chapitres).ok, false, 'lecture coupée : rien ne se termine');
  assert.match((peutFaireDAvance(bloc(['A-0'], []), chapitres) as { raison: string }).raison, /autre jour/);
});

test('apprendre ou réviser d’avance : seulement des pages déjà lues ; un examen blanc se passe quand on veut', () => {
  const chapitres = [chap('A', 0, { niveau: 1 }), chap('A', 1, { niveau: 0 })];
  assert.deepEqual(peutFaireDAvance({ etape: 'reviser', chapitreIds: ['A-0'], termines: ['A-0'] }, chapitres), { ok: true });
  const non = peutFaireDAvance({ etape: 'apprendre', chapitreIds: ['A-0', 'A-1'], termines: ['A-0', 'A-1'] }, chapitres);
  assert.equal(non.ok, false);
  assert.match((non as { raison: string }).raison, /lire ces pages/);
  assert.equal(peutFaireDAvance({ etape: 'dernier', chapitreIds: ['A-1'], termines: ['A-1'] }, chapitres).ok, false);
  assert.equal(peutFaireDAvance({ etape: 'relire', chapitreIds: ['A-1'], termines: ['A-1'] }, chapitres).ok, false);
  assert.deepEqual(peutFaireDAvance({ etape: 'examen', chapitreIds: ['A-1'], termines: ['A-1'] }, chapitres), { ok: true });
  assert.equal(peutFaireDAvance({ etape: 'reviser', chapitreIds: ['inconnue'], termines: [] }, chapitres).ok, false, 'une page inconnue vaut « pas lue »');
});

test('faite avant l’échéance, une page compte comme un rappel en plus ; due ou en retard, elle compte pour de vrai', () => {
  const chapitres = [chap('A', 0, { niveau: 2, prochaine: '2026-11-14' }), chap('A', 1, { niveau: 2, prochaine: AUJ }), chap('A', 2, { niveau: 2, prochaine: '2026-11-01' }), chap('A', 3, { niveau: 1, prochaine: null })];
  const ids = ['A-0', 'A-1', 'A-2', 'A-3'];
  assert.deepEqual(pagesPasEncoreDues({ etape: 'reviser', chapitreIds: ids }, chapitres, AUJ), ['A-0'], 'seule la page dont l’échéance est dans le futur');
  assert.deepEqual(pagesPasEncoreDues({ etape: 'apprendre', chapitreIds: ids }, chapitres, AUJ), ['A-0']);
  assert.deepEqual(pagesPasEncoreDues({ etape: 'dernier', chapitreIds: ids }, chapitres, AUJ), ['A-0']);
  for (const etape of ['lire', 'relire', 'examen'] as const) assert.deepEqual(pagesPasEncoreDues({ etape, chapitreIds: ids }, chapitres, AUJ), [], `${etape} : pas d’échéance`);
});

// ── Aller plus loin ──

test('les pages qu’on peut déclarer lues : celles jamais lues du cours, dans l’ordre, avec leur numéro', () => {
  const chapitres = [...pages('A', 10).map((c, i) => (i < 7 ? { ...c, niveau: 1 } : c)), ...pages('B', 3)];
  const a = pagesAjoutables('A', chapitres);
  assert.deepEqual(a.map((p) => p.page), [8, 9, 10]);
  assert.deepEqual(a.map((p) => p.id), ['A-7', 'A-8', 'A-9']);
  assert.deepEqual(pagesAjoutables('B', chapitres).map((p) => p.page), [1, 2, 3], 'chaque cours recommence à 1');
  assert.deepEqual(pagesAjoutables('inconnu', chapitres), []);
  assert.deepEqual(pagesAjoutables('A', pages('A', 4, { niveau: 3 })), [], 'tout est déjà lu');
});

test('un numéro de page reste le sien même quand des pages avant lui sont lues', () => {
  const chapitres = pages('A', 6).map((c, i) => (i === 1 || i === 3 ? { ...c, niveau: 2 } : c));
  assert.deepEqual(pagesAjoutables('A', chapitres).map((p) => p.page), [1, 3, 5, 6]);
});

test('déclarer « de la page 8 à la 10 » : les pages jamais lues entre les deux, bornes comprises, dans n’importe quel ordre', () => {
  const a = pagesAjoutables('A', pages('A', 12).map((c, i) => (i < 7 ? { ...c, niveau: 1 } : c)));
  assert.deepEqual(pagesEntre(a, 8, 10).map((p) => p.page), [8, 9, 10]);
  assert.deepEqual(pagesEntre(a, 10, 8).map((p) => p.page), [8, 9, 10], 'bornes à l’envers');
  assert.deepEqual(pagesEntre(a, 9, 9).map((p) => p.page), [9]);
  assert.deepEqual(pagesEntre(a, 1, 9).map((p) => p.page), [8, 9], 'les pages déjà lues ne sont pas reprises');
  assert.deepEqual(pagesEntre(a, 1, 3), []);
  assert.equal(libelleDeclaration(pagesEntre(a, 8, 10)), 'Pages 8 à 10');
  assert.equal(libelleDeclaration(pagesEntre(a, 9, 9)), 'Page 9');
});

test('l’avance prise : le temps de première lecture que ces pages auraient demandé, à ta vitesse', () => {
  const p = [{ dureeMin: 30 }, { dureeMin: 20 }];
  assert.equal(minutesDAvance(p, 1, 0), dureeLecture({ dureeMin: 30 }, 1, 0) + dureeLecture({ dureeMin: 20 }, 1, 0));
  assert.ok(minutesDAvance(p, 1.5, 0) > minutesDAvance(p, 1, 0), 'plus lent : plus d’avance');
  assert.ok(minutesDAvance(p, 1) > minutesDAvance(p, 1, 0), 'le rappel écrit de la première séance compte aussi');
  assert.equal(minutesDAvance([], 1), 0);
});

test('de bout en bout : déclarer des pages lues en plus allège les semaines suivantes', () => {
  // 30 pages de 30 min : la lecture s'étale sur plusieurs semaines (90 min par jour, révisions comprises).
  const avant = pages('A', 30);
  const plan0 = calendrier(avant);
  const lectures = (p: Plan) => p.seances.filter((s) => s.type === 'decouverte');
  const pagesLues = (p: Plan) => new Set(lectures(p).map((s) => s.chapitreId)).size;
  const dernierJour = (p: Plan) => lectures(p).reduce((m, s) => (s.jour > m ? s.jour : m), '');
  assert.equal(pagesLues(plan0), 30, 'le calendrier lit les 30 pages');
  // « Je suis allé plus loin » : les pages 8 à 10 sont lues aujourd'hui (même état que `marquerLues`).
  const ajout = pagesEntre(pagesAjoutables('A', avant), 8, 10);
  assert.equal(ajout.length, 3);
  const apres = avant.map((c) => (ajout.some((p) => p.id === c.id) ? { ...c, niveau: 1, derniere: AUJ, prochaine: ajouterJours(AUJ, 1) } : c));
  const plan1 = calendrier(apres);
  assert.equal(pagesLues(plan1), 27, '3 pages de moins à lire au calendrier');
  assert.ok(lectures(plan1).every((s) => !ajout.some((p) => p.id === s.chapitreId)), 'les pages déclarées ne sont plus à lire');
  assert.ok(dernierJour(plan1) <= dernierJour(plan0), 'la dernière lecture n’arrive pas plus tard');
  // Et les semaines qui suivent le montrent : moins de minutes de lecture au total.
  const minutesLecture = (p: Plan, chapitres: readonly Chapitre[]) =>
    ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']
      .flatMap((lundi) => objectifsDeSemaine(semaine({ lundi, aujourdhui: AUJ, plan: p, chapitres, cours: [cours('A')], passages: [], libres: [] })))
      .flatMap((o) => o.lignes.filter((l) => l.etape === 'lire'))
      .reduce((t, l) => t + l.minutes, 0);
  assert.ok(minutesLecture(plan1, apres) < minutesLecture(plan0, avant), 'moins de lecture dans les semaines à venir');
  assert.equal(minutesLecture(plan0, avant) - minutesLecture(plan1, apres), 90, 'trois pages de 30 min d’avance');
  // Les pages déclarées reviennent pour être apprises (le lendemain), comme toute page qu'on vient de lire.
  assert.ok(plan1.seances.some((s) => s.type === 'revision' && ajout.some((p) => p.id === s.chapitreId)), 'elles reviennent au cycle de révision');
});

test('de bout en bout : faire d’avance une lecture du jeudi décale la suite d’un cran', () => {
  const chapitres = pages('A', 10);
  const plan0 = calendrier(chapitres);
  const jeudi = '2026-11-12';
  const duJeudi = plan0.seances.filter((s) => s.jour === jeudi && s.type === 'decouverte');
  assert.ok(duJeudi.length > 0, 'une lecture est prévue jeudi');
  const bloc = semaine(entree({ plan: plan0, chapitres }))[3].blocs.find((b) => b.etape === 'lire')!;
  assert.deepEqual(peutFaireDAvance(bloc, chapitres), { ok: true });
  const faites = chapitres.map((c) => (bloc.termines.includes(c.id) ? { ...c, niveau: 1, derniere: AUJ, prochaine: ajouterJours(AUJ, 1) } : c));
  const plan1 = calendrier(faites);
  assert.ok(plan1.seances.filter((s) => s.type === 'decouverte').every((s) => !bloc.termines.includes(s.chapitreId)), 'ce qui est lu n’est plus à lire');
  const j = semaine(entree({ plan: plan1, chapitres: faites }))[3];
  assert.ok(j.blocs.every((b) => b.etape !== 'lire' || !b.pages.some((p) => bloc.pages.includes(p))), 'jeudi ne reprend pas les pages déjà lues');
});

test('un jour passé n’a ni séance ni étude à faire, un jour à venir n’a pas de passé (même si les données disent autrement)', () => {
  // Une horloge décalée, un cache d'avant : le calendrier ou le journal peuvent contenir un jour du « mauvais » côté.
  const plan: Plan = { alertes: [], seances: [sea('2026-11-10', 0), sea('2026-11-13', 1)] };
  const chapitres = pages('A', 3);
  const s = semaine(entree({ plan, chapitres, passages: [passage('2026-11-13', 'A-2')], libres: [{ jour: '2026-11-10', coursId: 'A', minutes: 45 }] }));
  assert.deepEqual(s[1].blocs, [], 'mardi, passé : plus rien à faire');
  assert.deepEqual(s[1].libres, [], 'et pas d’étude libre');
  assert.equal(s[1].minutes, 0);
  assert.equal(s[4].blocs.length, 1, 'vendredi : sa séance');
  assert.deepEqual(s[4].faits, [], 'vendredi, à venir : rien de fait');
});

test('les passages d’un même jour sont rangés par cours puis dans l’ordre du travail, quel que soit l’ordre où ils arrivent', () => {
  const chapitres = [...pages('A', 3), ...pages('B', 3)];
  const passages = [passage('2026-11-10', 'B-0', { sorte: 'examen' }), passage('2026-11-10', 'A-1', { sorte: 'relecture' }), passage('2026-11-10', 'A-0', { sorte: 'revision' }), passage('2026-11-10', 'B-1', { sorte: 'lecture' }), passage('2026-11-10', 'A-2', { sorte: 'lecture' }), passage('2026-11-10', 'A-0', { sorte: 'rappel' })];
  const s = semaine(entree({ plan: { seances: [], alertes: [] }, chapitres, passages, cours: [cours('A'), cours('B', PARTIEL, 1)] }));
  assert.deepEqual(s[1].faits.map((f) => `${f.coursId}:${f.sorte}`), ['A:lecture', 'A:revision', 'A:rappel', 'A:relecture', 'B:lecture', 'B:examen']);
  // Les pages d'une ligne sont dans l'ordre du cours, pas dans celui où les passages ont été écrits.
  const desordre = semaine(entree({ plan: { seances: [], alertes: [] }, chapitres, passages: [passage('2026-11-10', 'A-2'), passage('2026-11-10', 'A-0')] }));
  assert.deepEqual(desordre[1].faits[0].pages, [1, 3]);
});

test('le bilan ignore les jours passés et ne compte un jour qu’une fois par étape, même si on le lui donne tel quel', () => {
  const bloc = (jour: string, ordre: number, minutes: number): Bloc => ({ jour, coursId: 'A', type: 'decouverte', etape: 'lire', parCoeur: false, chapitreIds: [`A-${ordre}`], pages: [ordre + 1], termines: [`A-${ordre}`], minutes, suite: false, retard: 0, fragile: false, raison: '' });
  const j = (jour: string, quand: JourSemaine['quand'], blocs: Bloc[]): JourSemaine => ({ jour, quand, faits: [], blocs, libres: [], minutes: 0, partiels: [] });
  const o = objectifsDeSemaine([j('2026-11-10', 'passe', [bloc('2026-11-10', 0, 99)]), j('2026-11-11', 'aujourdhui', [bloc('2026-11-11', 1, 20), bloc('2026-11-11', 2, 30)]), j('2026-11-12', 'futur', [bloc('2026-11-12', 3, 40)])]);
  assert.deepEqual(o[0].lignes[0].pages, [2, 3, 4], 'le jour passé ne compte pas');
  assert.equal(o[0].lignes[0].minutes, 90);
  assert.deepEqual(o[0].lignes[0].jours, ['2026-11-11', '2026-11-12'], 'un jour listé une seule fois');
});

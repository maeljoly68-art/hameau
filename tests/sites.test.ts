import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SITE_MIN_S, TITRES_MAX, dureeSite, libelleSites, ligneSiteValide, regrouperSites, sitesDeLaPeriode, sitesParSession, type LigneSite } from '../src/core/sites.ts';

const l = (sessionId: string, site: string, secondes: number, titre = ''): LigneSite => ({ sessionId, site, titre, secondes });
// Des heures « midi » : le jour local ne change pas avec le fuseau.
const session = (id: string, jour: string) => ({ id, debut: `${jour}T12:00:00` });

test('ligneSiteValide : une ligne de la base bien formée passe, le reste est refusé', () => {
  assert.deepEqual(ligneSiteValide({ sessionId: 's', site: 'claude.ai', titre: 'Cours', secondes: 12 }), { sessionId: 's', site: 'claude.ai', titre: 'Cours', secondes: 12 });
  assert.equal(ligneSiteValide({ sessionId: 's', site: 'claude.ai', secondes: 12 })?.titre, '', 'titre absent = vide');
  for (const mauvaise of [null, 'x', {}, { sessionId: '', site: 'claude.ai', secondes: 1 }, { sessionId: 's', site: 'ab', secondes: 1 }, { sessionId: 's', site: 'a'.repeat(254), secondes: 1 }, { sessionId: 's', site: 'claude.ai', secondes: -1 }, { sessionId: 's', site: 'claude.ai', secondes: 86_401 }, { sessionId: 's', site: 'claude.ai', secondes: Number.NaN }, { sessionId: 's', site: 'claude.ai', secondes: '5' }, { sessionId: 's', site: 'claude.ai', titre: 4, secondes: 1 }])
    assert.equal(ligneSiteValide(mauvaise), null, JSON.stringify(mauvaise));
  assert.notEqual(ligneSiteValide({ sessionId: 's', site: 'claude.ai', secondes: 0 }), null, '0 s est une durée valide');
  assert.notEqual(ligneSiteValide({ sessionId: 's', site: 'claude.ai', secondes: 86_400 }), null, 'une journée entière est la borne');
});

test('regrouperSites : les navigateurs et les titres d’un même site s’additionnent, du plus long au plus court', () => {
  const r = regrouperSites([l('s', 'docs.exemple.org', 100), l('s', 'claude.ai', 60, 'A'), l('s', 'claude.ai', 90, 'B'), l('s', 'claude.ai', 30)]);
  assert.deepEqual(
    r.map((x) => [x.site, x.secondes]),
    [
      ['claude.ai', 180],
      ['docs.exemple.org', 100],
    ],
  );
  assert.deepEqual(r[0]!.titres, [
    { titre: 'B', secondes: 90 },
    { titre: 'A', secondes: 60 },
  ]);
  assert.deepEqual(r[1]!.titres, [], 'sans titre, aucune page listée');
});

test('regrouperSites : à égalité, l’ordre est alphabétique (stable)', () => {
  assert.deepEqual(
    regrouperSites([l('s', 'b.fr', 50), l('s', 'a.fr', 50), l('s', 'c.fr', 50)]).map((x) => x.site),
    ['a.fr', 'b.fr', 'c.fr'],
  );
});

test('regrouperSites : au plus trois pages par site, les plus longues', () => {
  const lignes = ['a', 'b', 'c', 'd', 'e'].map((t, i) => l('s', 'claude.ai', 10 * (i + 1), t));
  const r = regrouperSites(lignes);
  assert.equal(r[0]!.titres.length, TITRES_MAX);
  assert.deepEqual(
    r[0]!.titres.map((t) => t.titre),
    ['e', 'd', 'c'],
  );
  assert.equal(r[0]!.secondes, 150, 'le total compte toutes les pages, pas seulement les trois montrées');
});

test('regrouperSites : rien en entrée, rien en sortie', () => {
  assert.deepEqual(regrouperSites([]), []);
});

test('sitesParSession : séparées par session, et les sites vus moins de trente secondes sont écartés', () => {
  const m = sitesParSession([l('a', 'claude.ai', 600), l('a', 'youtube.com', SITE_MIN_S - 1), l('a', 'docs.exemple.org', SITE_MIN_S), l('b', 'claude.ai', 10), l('c', 'mail.exemple.org', 120)]);
  assert.deepEqual(
    m.get('a')!.map((x) => x.site),
    ['claude.ai', 'docs.exemple.org'],
  );
  assert.equal(m.has('b'), false, 'une session sans site assez long n’a pas d’entrée');
  assert.deepEqual(m.get('c')!.map((x) => x.secondes), [120]);
});

test('sitesParSession : le seuil s’applique au total du site, pas à chaque ligne', () => {
  const m = sitesParSession([l('a', 'claude.ai', 20, 'A'), l('a', 'claude.ai', 20, 'B')]);
  assert.equal(m.get('a')![0]!.secondes, 40, 'deux lignes de 20 s font 40 s : assez long');
});

test('sitesDeLaPeriode : les sept derniers jours, aujourd’hui compris ; la session compte le jour où elle a commencé', () => {
  const sessions = [session('hier', '2026-11-07'), session('auj', '2026-11-08'), session('limite', '2026-11-02'), session('trop-vieille', '2026-11-01'), session('future', '2026-11-09')];
  const lignes = [l('hier', 'a.fr', 100), l('auj', 'a.fr', 50), l('limite', 'b.fr', 40), l('trop-vieille', 'c.fr', 999), l('future', 'd.fr', 999)];
  const r = sitesDeLaPeriode(lignes, sessions, '2026-11-08');
  assert.deepEqual(
    r.map((x) => [x.site, x.secondes]),
    [
      ['a.fr', 150],
      ['b.fr', 40],
    ],
  );
});

test('sitesDeLaPeriode : une ligne dont la session a été supprimée ne compte pas, ni une date illisible', () => {
  const r = sitesDeLaPeriode([l('disparue', 'a.fr', 500), l('mauvaise', 'b.fr', 500), l('ok', 'c.fr', 90)], [{ id: 'mauvaise', debut: 'pas une date' }, session('ok', '2026-11-08')], '2026-11-08');
  assert.deepEqual(
    r.map((x) => x.site),
    ['c.fr'],
  );
});

test('sitesDeLaPeriode : le seuil de trente secondes se juge sur le total de la période', () => {
  const sessions = [session('a', '2026-11-08'), session('b', '2026-11-07')];
  const r = sitesDeLaPeriode([l('a', 'x.fr', 20), l('b', 'x.fr', 20)], sessions, '2026-11-08');
  assert.deepEqual(r.map((x) => x.secondes), [40]);
  assert.deepEqual(sitesDeLaPeriode([l('a', 'x.fr', 20)], sessions, '2026-11-08'), []);
});

test('sitesDeLaPeriode : le nombre de jours se règle (1 = aujourd’hui seulement)', () => {
  const sessions = [session('hier', '2026-11-07'), session('auj', '2026-11-08')];
  const lignes = [l('hier', 'a.fr', 100), l('auj', 'b.fr', 100)];
  assert.deepEqual(
    sitesDeLaPeriode(lignes, sessions, '2026-11-08', 1).map((x) => x.site),
    ['b.fr'],
  );
});

test('sitesDeLaPeriode : le jour d’une session est son jour LOCAL (0 h 30 à Paris n’est pas la veille)', () => {
  // `npm test` fixe TZ=Europe/Paris : 0 h 30 le 2 novembre y est encore le 1er novembre en UTC, hors de la période.
  const r = sitesDeLaPeriode([l('nuit', 'a.fr', 90)], [{ id: 'nuit', debut: '2026-11-02T00:30:00' }], '2026-11-08');
  assert.deepEqual(r.map((x) => x.site), ['a.fr']);
});

test('dureeSite : sous la minute en secondes, sinon en minutes puis en heures', () => {
  assert.equal(dureeSite(45), '45 s');
  assert.equal(dureeSite(59.6), '1 min', '59,6 s arrondi à 60 s se lit « 1 min », pas « 60 s »');
  assert.equal(dureeSite(60), '1 min');
  assert.equal(dureeSite(38 * 60), '38 min');
  assert.equal(dureeSite(65 * 60), '1 h 05');
  assert.equal(dureeSite(2 * 3600), '2 h');
});

test('libelleSites : trois sites au plus, puis « +N autres »', () => {
  const s = (site: string, secondes: number) => ({ site, secondes, titres: [] });
  assert.equal(libelleSites([s('claude.ai', 38 * 60), s('docs.exemple.org', 12 * 60)]), 'claude.ai 38 min · docs.exemple.org 12 min');
  assert.equal(libelleSites([s('a.fr', 600), s('b.fr', 500), s('c.fr', 400), s('d.fr', 300)]), 'a.fr 10 min · b.fr 8 min · c.fr 7 min · +1 autre');
  assert.equal(libelleSites([s('a.fr', 600), s('b.fr', 500), s('c.fr', 400), s('d.fr', 300), s('e.fr', 300)]), 'a.fr 10 min · b.fr 8 min · c.fr 7 min · +2 autres');
  assert.equal(libelleSites([s('a.fr', 600), s('b.fr', 500)], 1), 'a.fr 10 min · +1 autre');
  assert.equal(libelleSites([s('a.fr', 600), s('b.fr', 500), s('c.fr', 400)]), 'a.fr 10 min · b.fr 8 min · c.fr 7 min', 'trois sites pile : rien à ajouter');
  assert.equal(libelleSites([]), '');
});

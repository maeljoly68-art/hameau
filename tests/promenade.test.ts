import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARRETS_MAX, ARRETS_MIN, DISTANCE_MIN, aleatoire, cle, graine, longueurTour, tracerTour, type Case, type EntreeTour } from '../src/core/promenade.ts';

const FEU = { x: 2, y: 2 };
const MAISONS: Case[] = [{ x: 0, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 3 }, { x: 3, y: 7 }];
const PRISES = new Set([...MAISONS.map(cle), cle(FEU)]);
const entree = (i: number, extra: Partial<EntreeTour> = {}): EntreeTour => ({ graine: graine(i, MAISONS[i].x, MAISONS[i].y), maison: MAISONS[i], voisins: MAISONS.filter((_, k) => k !== i), feu: FEU, taille: 9, occupees: PRISES, ...extra });
const tours = MAISONS.map((_, i) => tracerTour(entree(i)));

test('le hasard est reproductible : la même graine donne toujours les mêmes tirages', () => {
  const a = aleatoire(42);
  const b = aleatoire(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(aleatoire(42)(), aleatoire(43)());
});

test('le hasard reste entre 0 (compris) et 1 (exclu)', () => {
  const r = aleatoire(7);
  for (let i = 0; i < 2000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});

test('une graine tient compte de chacun de ses nombres et de leur ordre', () => {
  assert.notEqual(graine(1, 2, 3), graine(1, 2, 4));
  assert.notEqual(graine(1, 2, 3), graine(3, 2, 1));
  assert.equal(graine(1, 2, 3), graine(1, 2, 3));
});

test('un tour est reproductible : redessiner le village ne fait pas repartir les habitants', () => {
  assert.deepEqual(tracerTour(entree(0)), tracerTour(entree(0)));
});

test('un tour part de la maison et y revient', () => {
  for (const [i, t] of tours.entries()) {
    assert.deepEqual(t[0], MAISONS[i]);
    assert.deepEqual(t[t.length - 1], MAISONS[i]);
  }
});

test('un tour compte de 3 à 5 arrêts', () => {
  for (const t of tours) assert.ok(t.length - 2 >= ARRETS_MIN && t.length - 2 <= ARRETS_MAX, `${t.length - 2} arrêts`);
});

test('on ne marche pas dans un bâtiment ni sur le feu, et on reste dans le terrain', () => {
  for (let essai = 0; essai < 200; essai++) {
    const i = essai % MAISONS.length;
    const t = tracerTour(entree(i, { graine: graine(essai, 99) }));
    for (const c of t.slice(1, -1)) {
      assert.ok(!PRISES.has(cle(c)), `arrêt dans une case prise : ${cle(c)}`);
      assert.ok(c.x >= 0 && c.y >= 0 && c.x < 9 && c.y < 9, `arrêt hors du terrain : ${cle(c)}`);
    }
  }
});

test('deux arrêts de suite ne sont jamais à moins de 2 cases l’un de l’autre', () => {
  for (let essai = 0; essai < 200; essai++) {
    const t = tracerTour(entree(essai % MAISONS.length, { graine: graine(essai, 5) }));
    for (let k = 1; k < t.length - 1; k++) assert.ok(Math.hypot(t[k].x - t[k - 1].x, t[k].y - t[k - 1].y) >= DISTANCE_MIN, `arrêts ${k - 1} et ${k} trop proches`);
  }
});

test('les habitants ne font pas tous le même tour : chacun a le sien', () => {
  const uniques = new Set(tours.map((t) => t.map(cle).join('>')));
  assert.equal(uniques.size, MAISONS.length);
});

test('le premier pas ne va pas toujours dans le même sens : toutes les directions se rencontrent', () => {
  // Ce que l'on corrige : tous partaient vers le feu. Sur 400 habitants tirés, les quatre quarts de cercle sont visités,
  // chacun par une part honnête (au moins 15 %) — pas par un hasard de passage.
  const quarts = [0, 0, 0, 0];
  for (let essai = 0; essai < 400; essai++) {
    const depart = { x: 4, y: 4 };
    const t = tracerTour({ ...entree(0), maison: depart, voisins: [], occupees: new Set([cle(FEU), cle(depart)]), graine: graine(essai, 11) });
    const angle = Math.atan2(t[1].y - depart.y, t[1].x - depart.x);
    quarts[Math.min(3, Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 4))]++;
  }
  for (const n of quarts) assert.ok(n >= 400 * 0.15, `quarts de cercle visités : ${quarts.join(', ')}`);
});

test('le feu et les voisins font partie des arrêts, mais pas tous les arrêts', () => {
  let feu = 0;
  let voisin = 0;
  let libre = 0;
  const pres = (a: Case, b: Case) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
  for (let essai = 0; essai < 300; essai++) {
    const t = tracerTour(entree(0, { graine: graine(essai, 3) }));
    for (const c of t.slice(1, -1)) {
      if (pres(c, FEU)) feu++;
      else if (MAISONS.slice(1).some((m) => pres(c, m))) voisin++;
      else libre++;
    }
  }
  assert.ok(feu > 0 && voisin > 0 && libre > feu, `feu ${feu}, voisins ${voisin}, libres ${libre}`);
});

test('un terrain plein : l’habitant reste chez lui', () => {
  const toutes: Case[] = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (x !== 1 || y !== 1) toutes.push({ x, y });
  const maison = toutes[0];
  const pleines = new Set(toutes.map(cle));
  pleines.add(cle({ x: 1, y: 1 }));
  const t = tracerTour({ graine: 1, maison, voisins: toutes.slice(1), feu: { x: 1, y: 1 }, taille: 3, occupees: pleines });
  assert.deepEqual(t, [maison, maison]);
});

test('un terrain presque plein ne bloque pas le tour', () => {
  const maison = { x: 0, y: 0 };
  const t = tracerTour({ graine: 5, maison, voisins: [], feu: { x: 2, y: 2 }, taille: 5, occupees: new Set([cle(maison), cle({ x: 2, y: 2 })]) });
  assert.ok(t.length >= 2);
  assert.deepEqual(t[t.length - 1], maison);
});

test('la longueur d’un tour est la somme de ses pas', () => {
  assert.equal(longueurTour([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 0 }]), 9);
  assert.equal(longueurTour([]), 0);
  assert.equal(longueurTour([{ x: 1, y: 1 }]), 0);
});

test('aucun arrêt assez loin : l’habitant va au moins jusqu’à une case libre près du feu', () => {
  // Terrain de 2 × 2 : les deux cases libres sont à 1 case de la maison, donc trop proches pour un arrêt ordinaire.
  // Le repli ne doit pas laisser un tour vide quand le feu a une case libre à côté.
  const maison = { x: 0, y: 0 };
  const occupees = new Set([cle(maison), cle({ x: 1, y: 1 })]);
  for (let essai = 0; essai < 20; essai++) {
    const t = tracerTour({ graine: graine(essai), maison, voisins: [], feu: { x: 1, y: 1 }, taille: 2, occupees });
    assert.equal(t.length, 3, `tour : ${t.map(cle).join('>')}`);
    assert.ok(!occupees.has(cle(t[1])));
  }
});

test('le nombre d’arrêts varie : 3, 4 et 5 se rencontrent tous', () => {
  const vus = new Set<number>();
  for (let essai = 0; essai < 200; essai++) vus.add(tracerTour(entree(0, { graine: graine(essai, 8) })).length - 2);
  assert.deepEqual([...vus].sort(), [3, 4, 5]);
});

test('le feu attire : sur un grand terrain, une part honnête des arrêts est à côté de lui', () => {
  // Sur 25 × 25, le hasard seul ne mettrait qu'environ 1 % des arrêts près du feu.
  const grand = { x: 12, y: 12 };
  const maison = { x: 20, y: 3 };
  let pres = 0;
  let total = 0;
  for (let essai = 0; essai < 300; essai++) {
    const t = tracerTour({ graine: graine(essai, 21), maison, voisins: [], feu: grand, taille: 25, occupees: new Set([cle(maison), cle(grand)]) });
    for (const c of t.slice(1, -1)) {
      total++;
      if (Math.abs(c.x - grand.x) <= 1 && Math.abs(c.y - grand.y) <= 1) pres++;
    }
  }
  assert.ok(pres / total >= 0.12, `${pres} arrêts sur ${total} près du feu`);
});

test('un voisin attire aussi : sur un grand terrain, une part honnête des arrêts est chez lui', () => {
  const voisin = { x: 3, y: 20 };
  const maison = { x: 20, y: 3 };
  const feu = { x: 12, y: 12 };
  let pres = 0;
  let total = 0;
  for (let essai = 0; essai < 300; essai++) {
    const t = tracerTour({ graine: graine(essai, 22), maison, voisins: [voisin], feu, taille: 25, occupees: new Set([cle(maison), cle(feu), cle(voisin)]) });
    for (const c of t.slice(1, -1)) {
      total++;
      if (Math.abs(c.x - voisin.x) <= 1 && Math.abs(c.y - voisin.y) <= 1) pres++;
    }
  }
  assert.ok(pres / total >= 0.12, `${pres} arrêts sur ${total} chez le voisin`);
});

test('un feu dans un coin du terrain : jamais d’arrêt hors du terrain', () => {
  const feu = { x: 0, y: 0 };
  const maison = { x: 5, y: 5 };
  for (let essai = 0; essai < 200; essai++) {
    const t = tracerTour({ graine: graine(essai, 31), maison, voisins: [{ x: 8, y: 8 }], feu, taille: 9, occupees: new Set([cle(maison), cle(feu), cle({ x: 8, y: 8 })]) });
    for (const c of t) assert.ok(c.x >= 0 && c.y >= 0 && c.x < 9 && c.y < 9, `hors terrain : ${cle(c)}`);
  }
});

test('un feu dans un coin, entouré de bâtiments : les cases hors du terrain ne sont pas des voisines libres', () => {
  const feu = { x: 0, y: 0 };
  const maison = { x: 5, y: 5 };
  const murs = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
  for (let essai = 0; essai < 200; essai++) {
    const t = tracerTour({ graine: graine(essai, 41), maison, voisins: [], feu, taille: 9, occupees: new Set([cle(maison), cle(feu), ...murs.map(cle)]) });
    for (const c of t) assert.ok(c.x >= 0 && c.y >= 0 && c.x < 9 && c.y < 9, `hors terrain : ${cle(c)}`);
  }
});

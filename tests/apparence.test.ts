import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COSMETIQUES, EMPLACEMENTS, apparenceValide, avancement, cosmetique, couleurDe, debloque, nouveauxCosmetiques, texteCondition, type Progression } from '../src/core/apparence.ts';
import { APPARENCE_DEFAUT } from '../src/core/types.ts';
import { succes } from '../src/core/succes.ts';

const debut: Progression = { niveau: 1, minutes: 0, sessions: 0, meilleureSerie: 0, batiments: 0, succes: new Set() };

test('l’apparence par défaut existe dans le catalogue, et tout y est libre', () => {
  for (const e of EMPLACEMENTS) {
    const c = cosmetique(e.id, APPARENCE_DEFAUT[e.id]);
    assert.ok(c, e.id);
    assert.ok(debloque(c!, debut), `${e.id} par défaut verrouillé`);
  }
});

test('identifiants uniques par emplacement, chaque emplacement a de quoi choisir', () => {
  for (const e of EMPLACEMENTS) {
    const ids = COSMETIQUES.filter((c) => c.emplacement === e.id).map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, e.id);
    assert.ok(ids.length >= 3, e.id);
  }
});

test('on ne débloque pas qui l’on est : peau, cheveux naturels et coiffures sont libres', () => {
  for (const c of COSMETIQUES.filter((x) => x.emplacement === 'peau' || x.emplacement === 'coiffure')) assert.equal(c.condition, null, c.id);
});

test('chaque succès demandé par la garde-robe existe', () => {
  const ids = new Set(succes([], [], 120).map((s) => s.id));
  for (const c of COSMETIQUES) if (c.condition?.type === 'succes') assert.ok(ids.has(c.condition.id), `${c.id} → ${c.condition.id}`);
});

test('déblocage par niveau, heures, sessions, série, bâtiments et succès', () => {
  const paille = cosmetique('chapeau', 'paille')!;
  assert.ok(!debloque(paille, debut));
  assert.ok(debloque(paille, { ...debut, niveau: 2 }));
  const lin = cosmetique('tenue', 'blanc')!; // 25 h
  assert.ok(!debloque(lin, { ...debut, minutes: 25 * 60 - 1 }), '24 h 59 ne font pas 25 h');
  assert.ok(debloque(lin, { ...debut, minutes: 25 * 60 }));
  assert.ok(debloque(cosmetique('accessoire', 'livre')!, { ...debut, sessions: 5 }));
  assert.ok(!debloque(cosmetique('compagnon', 'renard')!, { ...debut, meilleureSerie: 13 }));
  assert.ok(debloque(cosmetique('compagnon', 'renard')!, { ...debut, meilleureSerie: 14 }));
  assert.ok(debloque(cosmetique('compagnon', 'lapin')!, { ...debut, batiments: 8 }));
  const bonnet = cosmetique('chapeau', 'bonnet')!;
  assert.ok(!debloque(bonnet, debut));
  assert.ok(debloque(bonnet, { ...debut, succes: new Set(['serie-3']) }));
});

test('avancement borné à la cible, et texte de la condition', () => {
  assert.deepEqual(avancement({ type: 'niveau', valeur: 5 }, { ...debut, niveau: 9 }), { actuel: 5, cible: 5 });
  assert.deepEqual(avancement({ type: 'heures', valeur: 25 }, { ...debut, minutes: 125 }), { actuel: 2, cible: 25 });
  assert.equal(texteCondition({ type: 'succes', id: 'aube' }, () => 'Lève-tôt'), 'Succès « Lève-tôt »');
  assert.equal(texteCondition({ type: 'heures', valeur: 25 }, String), 'Cumuler 25 h de concentration');
});

test('une apparence abîmée ou inconnue revient aux valeurs par défaut, champ par champ', () => {
  assert.deepEqual(apparenceValide(null), APPARENCE_DEFAUT);
  assert.deepEqual(apparenceValide('n’importe quoi'), APPARENCE_DEFAUT);
  const a = apparenceValide({ chapeau: 'paille', tenue: 'licorne', cape: 42, compagnon: 'chat' });
  assert.equal(a.chapeau, 'paille');
  assert.equal(a.tenue, APPARENCE_DEFAUT.tenue);
  assert.equal(a.cape, APPARENCE_DEFAUT.cape);
  assert.equal(a.compagnon, 'chat');
  // Un identifiant valide ailleurs ne l'est pas à un autre emplacement.
  assert.equal(apparenceValide({ chapeau: 'chat' }).chapeau, APPARENCE_DEFAUT.chapeau);
});

test('couleurs portées', () => {
  assert.equal(couleurDe({ ...APPARENCE_DEFAUT, tenue: 'rouge' }, 'tenue'), '#c4453a');
  assert.match(couleurDe(APPARENCE_DEFAUT, 'peau'), /^#[0-9a-f]{6}$/);
});

test('les objets nouvellement débloqués, une fois chacun', () => {
  const n = nouveauxCosmetiques(debut, { ...debut, niveau: 2 });
  assert.deepEqual(n.map((c) => c.id), ['paille']);
  assert.deepEqual(nouveauxCosmetiques({ ...debut, niveau: 2 }, { ...debut, niveau: 2 }), []);
});

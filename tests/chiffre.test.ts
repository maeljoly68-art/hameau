import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ErreurDechiffrement, dechiffrerCours } from '../src/liseuse/chiffre.ts';
import { chiffrer } from '../scripts/cours/chiffrer.mjs';

const PAGE = '<!doctype html><title>Croissance</title><section class="planche" id="C1-2-Modeles">gₙ = s / k — « Harrod-Domar »</section>';

test('ce que le script chiffre, la liseuse le rouvre à l’identique (accents et symboles compris)', async () => {
  const cle = randomBytes(32);
  const fichier: Buffer = chiffrer(PAGE, cle);
  assert.equal(fichier.subarray(0, 4).toString('ascii'), 'HMC1');
  assert.equal(await dechiffrerCours(new Uint8Array(fichier), cle.toString('base64')), PAGE);
});

test('deux chiffrements du même cours ne se ressemblent pas (vecteur tiré au sort)', () => {
  const cle = randomBytes(32);
  assert.notDeepEqual(chiffrer(PAGE, cle), chiffrer(PAGE, cle));
});

test('mauvaise clé, fichier abîmé ou étranger : une erreur claire, jamais une page à moitié lisible', async () => {
  const cle = randomBytes(32);
  const fichier: Buffer = chiffrer(PAGE, cle);
  await assert.rejects(dechiffrerCours(new Uint8Array(fichier), randomBytes(32).toString('base64')), ErreurDechiffrement);
  const abime = new Uint8Array(fichier);
  abime[40] ^= 0xff;
  await assert.rejects(dechiffrerCours(abime, cle.toString('base64')), ErreurDechiffrement);
  await assert.rejects(dechiffrerCours(new TextEncoder().encode('<!doctype html><p>pas chiffré</p>'), cle.toString('base64')), ErreurDechiffrement);
  await assert.rejects(dechiffrerCours(new Uint8Array(fichier), 'courte'), ErreurDechiffrement);
});

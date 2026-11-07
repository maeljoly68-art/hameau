import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { RACINE_ZIP, construireZip, crc32, fichiersDe } from '../scripts/zipper-extension.mjs';

/** Relit un zip comme le ferait un dézippeur : fin d'archive, répertoire central, puis chaque fichier décompressé. */
function lireZip(zip: Buffer): { nom: string; donnees: Buffer; crc: number }[] {
  const fin = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(fin >= 0, 'fin d’archive');
  const n = zip.readUInt16LE(fin + 10);
  let p = zip.readUInt32LE(fin + 16);
  const sortie = [];
  for (let i = 0; i < n; i++) {
    assert.equal(zip.readUInt32LE(p), 0x02014b50, 'entrée du répertoire central');
    const crc = zip.readUInt32LE(p + 16);
    const taille = zip.readUInt32LE(p + 20);
    const tailleBrute = zip.readUInt32LE(p + 24);
    const lNom = zip.readUInt16LE(p + 28);
    const local = zip.readUInt32LE(p + 42);
    const nom = zip.subarray(p + 46, p + 46 + lNom).toString('utf8');
    assert.equal(zip.readUInt32LE(local), 0x04034b50, 'en-tête local');
    const debut = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const donnees = inflateRawSync(zip.subarray(debut, debut + taille));
    assert.equal(donnees.length, tailleBrute);
    sortie.push({ nom, donnees, crc });
    p += 46 + lNom + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return sortie;
}

test('la somme de contrôle est celle du format zip', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926, 'valeur de référence de CRC-32');
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('le zip de l’extension se relit tel quel, sous un dossier, sans les fichiers de types', () => {
  const fichiers = fichiersDe(new URL('../extension', import.meta.url).pathname);
  const zip = construireZip(fichiers, RACINE_ZIP);
  const lus = lireZip(zip);
  assert.equal(lus.length, fichiers.length);
  assert.ok(lus.every((f) => f.nom.startsWith(`${RACINE_ZIP}/`)), 'tout est rangé sous un dossier');
  const noms = lus.map((f) => f.nom.slice(RACINE_ZIP.length + 1));
  for (const attendu of ['manifest.json', 'background.js', 'popup.html', 'bloque.html', 'relais.js', 'icones/icone-128.png']) assert.ok(noms.includes(attendu), attendu);
  assert.ok(!noms.some((n) => n.endsWith('.d.ts')), 'pas de déclarations de types');
  for (const f of lus) {
    const original = readFileSync(new URL(`../extension/${f.nom.slice(RACINE_ZIP.length + 1)}`, import.meta.url));
    assert.ok(original.equals(f.donnees), `${f.nom} identique à l’original`);
    assert.equal(crc32(f.donnees), f.crc, `${f.nom} : somme de contrôle`);
  }
});

test('même contenu, même zip : pas de date du jour dedans', () => {
  const fichiers = fichiersDe(new URL('../extension', import.meta.url).pathname);
  assert.ok(construireZip(fichiers, RACINE_ZIP).equals(construireZip(fichiers, RACINE_ZIP)));
});

test('un nom accentué reste lisible', () => {
  const lus = lireZip(construireZip([{ nom: 'été.txt', donnees: Buffer.from('é') }], 'dossier'));
  assert.equal(lus[0].nom, 'dossier/été.txt');
  assert.equal(lus[0].donnees.toString('utf8'), 'é');
});

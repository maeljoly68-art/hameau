// Range l'extension Chrome (extension/) dans un fichier .zip, servi par l'application (Réglages → « Télécharger ») :
// pas de boutique, on la charge « non empaquetée » dans Chrome depuis le dossier dézippé. Aucune dépendance : le format
// zip est écrit ici (méthode « deflate », noms en UTF-8). La date des fichiers est fixe : même contenu, même fichier.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(donnees) {
  let c = 0xffffffff;
  for (const octet of donnees) c = TABLE[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Les fichiers à ranger : tout le dossier, sauf les déclarations de types (utiles aux tests, pas à Chrome). */
export function fichiersDe(dossier, prefixe = '') {
  const sortie = [];
  for (const nom of readdirSync(dossier).sort()) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersDe(chemin, `${prefixe}${nom}/`));
    else if (!nom.endsWith('.d.ts')) sortie.push({ nom: `${prefixe}${nom}`, donnees: readFileSync(chemin) });
  }
  return sortie;
}

// 2026-01-01 00:00:00, au format DOS (date et heure sur 16 bits chacune).
const DATE_DOS = ((2026 - 1980) << 9) | (1 << 5) | 1;
const HEURE_DOS = 0;

/** Un zip depuis [{ nom, donnees }]. Chaque nom est rangé sous `racine/` pour qu'en dézippant on obtienne un dossier. */
export function construireZip(fichiers, racine) {
  const locaux = [];
  const centraux = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = Buffer.from(`${racine}/${f.nom}`, 'utf8');
    const compresse = deflateRawSync(f.donnees, { level: 9 });
    const crc = crc32(f.donnees);
    const entete = Buffer.alloc(30);
    entete.writeUInt32LE(0x04034b50, 0);
    entete.writeUInt16LE(20, 4);
    entete.writeUInt16LE(0x0800, 6);
    entete.writeUInt16LE(8, 8);
    entete.writeUInt16LE(HEURE_DOS, 10);
    entete.writeUInt16LE(DATE_DOS, 12);
    entete.writeUInt32LE(crc, 14);
    entete.writeUInt32LE(compresse.length, 18);
    entete.writeUInt32LE(f.donnees.length, 22);
    entete.writeUInt16LE(nom.length, 26);
    locaux.push(entete, nom, compresse);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(HEURE_DOS, 12);
    central.writeUInt16LE(DATE_DOS, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compresse.length, 20);
    central.writeUInt32LE(f.donnees.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    centraux.push(central, nom);
    decalage += entete.length + nom.length + compresse.length;
  }
  const tailleCentral = centraux.reduce((t, b) => t + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, ...centraux, fin]);
}

export const RACINE_ZIP = 'hameau-bloqueur';
export const SORTIE_ZIP = 'public/hameau-bloqueur.zip';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = fileURLToPath(new URL('..', import.meta.url));
  const zip = construireZip(fichiersDe(join(racine, 'extension')), RACINE_ZIP);
  mkdirSync(posix.dirname(join(racine, SORTIE_ZIP)), { recursive: true });
  writeFileSync(join(racine, SORTIE_ZIP), zip);
  console.log(`Extension rangée : ${SORTIE_ZIP} (${zip.length} octets)`);
}

#!/usr/bin/env node
// Chiffre une page de cours pour la publier avec le site, sans la rendre publique.
//
//   node scripts/cours/chiffrer.mjs <page.html> <document> [clé en base64]
//
// Le site est servi publiquement (GitHub Pages) : un cours posé tel quel dans public/ serait lisible par n'importe
// qui. On publie donc public/cours/<document>-<empreinte>.bin, chiffré (AES-256-GCM, après compression gzip), et
// la clé va en base, dans cles_documents, que seule la personne à qui elle est donnée peut lire (RLS).
//
// Sans clé donnée, une clé neuve est tirée au sort. Pour publier une nouvelle version d'un cours, on peut garder la
// même clé ; le nom du fichier change avec son contenu (l'ancien est retiré), et la ligne de cles_documents doit
// recevoir le nouveau nom EN MÊME TEMPS que la clé. Le script affiche la requête SQL à jouer.
//
// Format du fichier : « HMC1 » (4 octets), vecteur d'initialisation (12 octets), puis le chiffré suivi de son
// étiquette d'authentification (16 octets) — l'ordre qu'attend crypto.subtle.decrypt.
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const MAGIE = Buffer.from('HMC1', 'ascii');

export function chiffrer(html, cle) {
  if (cle.length !== 32) throw new Error('la clé doit faire 32 octets');
  const iv = randomBytes(12);
  const chiffreur = createCipheriv('aes-256-gcm', cle, iv);
  const compresse = gzipSync(Buffer.from(html, 'utf8'), { level: 9 });
  const corps = Buffer.concat([chiffreur.update(compresse), chiffreur.final(), chiffreur.getAuthTag()]);
  return Buffer.concat([MAGIE, iv, corps]);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [page, document, cleTexte] = process.argv.slice(2);
  if (!page || !document || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(document)) {
    console.error('Usage : node scripts/cours/chiffrer.mjs <page.html> <document en minuscules> [clé base64]');
    process.exit(1);
  }
  const cle = cleTexte ? Buffer.from(cleTexte, 'base64') : randomBytes(32);
  const contenu = chiffrer(readFileSync(page, 'utf8'), cle);
  const empreinte = createHash('sha256').update(contenu).digest('hex').slice(0, 12);
  const dossier = join(import.meta.dirname, '..', '..', 'public', 'cours');
  mkdirSync(dossier, { recursive: true });
  for (const f of readdirSync(dossier)) if (f.startsWith(`${document}-`) && f.endsWith('.bin')) rmSync(join(dossier, f));
  const fichier = `${document}-${empreinte}.bin`;
  writeFileSync(join(dossier, fichier), contenu);
  console.log(JSON.stringify({ document, fichier, cle: cle.toString('base64'), octets: contenu.length }));
}

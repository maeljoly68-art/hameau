// Ouvrir une page de cours chiffrée (voir scripts/cours/chiffrer.mjs) : « HMC1 », vecteur d'initialisation (12 octets),
// puis le chiffré AES-256-GCM d'un HTML compressé en gzip, étiquette d'authentification à la fin.
//
// Sans réseau ni React : le même code tourne dans le navigateur et dans les tests (Node a crypto.subtle et
// DecompressionStream). Un fichier abîmé ou une mauvaise clé échouent à l'authentification : on le dit, plutôt que
// d'afficher une page à moitié lisible.

const MAGIE = [0x48, 0x4d, 0x43, 0x31]; // « HMC1 »

function depuisBase64(texte: string): Uint8Array {
  const brut = atob(texte);
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}

export class ErreurDechiffrement extends Error {}

export async function dechiffrerCours(fichier: Uint8Array, cleBase64: string): Promise<string> {
  if (fichier.length < 4 + 12 + 16 || MAGIE.some((o, i) => fichier[i] !== o)) throw new ErreurDechiffrement('Ce fichier n’est pas un cours de Hameau.');
  let cle: Uint8Array;
  try {
    cle = depuisBase64(cleBase64);
  } catch {
    throw new ErreurDechiffrement('La clé de ce cours est illisible.');
  }
  if (cle.length !== 32) throw new ErreurDechiffrement('La clé de ce cours est illisible.');
  const cleCrypto = await crypto.subtle.importKey('raw', cle as BufferSource, 'AES-GCM', false, ['decrypt']);
  let clair: ArrayBuffer;
  try {
    clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fichier.slice(4, 16) as BufferSource }, cleCrypto, fichier.slice(16) as BufferSource);
  } catch {
    throw new ErreurDechiffrement('Ce cours ne s’ouvre pas avec la clé de ton compte (fichier abîmé ou clé changée).');
  }
  const flux = new Blob([clair]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(flux).text();
}

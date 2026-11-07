export function crc32(donnees: Uint8Array): number;
export function fichiersDe(dossier: string, prefixe?: string): { nom: string; donnees: Buffer }[];
export function construireZip(fichiers: { nom: string; donnees: Uint8Array }[], racine: string): Buffer;
export const RACINE_ZIP: string;
export const SORTIE_ZIP: string;

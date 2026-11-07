export const SITES_PAR_DEFAUT: string[];
export const SITES_MAX: number;
export const FRAICHEUR_MAX_MS: number;
export const DOMAINES_PROTEGES: string[];
export function domaineDe(saisie: unknown): string | null;
export function estProtege(domaine: string): boolean;
export function lireSites(texte: unknown): { sites: string[]; ecartes: { saisie: string; raison: string }[] };
export interface EtatBlocage {
  enCours: boolean;
  bloque: boolean;
  enPause: boolean;
  categorie: string;
  debut: string | null;
  sessionId: string | null;
}
export function etatDepuisSession(ligne: { id?: unknown; debut?: unknown; fin?: unknown; categorie?: unknown; pause_depuis?: unknown } | null, options?: { debloquerEnPause?: boolean }): EtatBlocage;
export function garderBlocage(precedent: { bloque?: boolean; dernierSucces?: unknown } | null | undefined, maintenantMs: number): boolean;
export function reglesBlocage(sites: string[], racineExtension: string): { id: number; priority: number; action: { type: string; redirect: { regexSubstitution: string } }; condition: { regexFilter: string; requestDomains: string[]; resourceTypes: string[] } }[];
export function hoteBloque(hote: unknown, sites: string[]): boolean;
export function urlOriginale(search: unknown, hash?: unknown): string | null;
export function minutesDepuis(debutIso: unknown, maintenantMs: number): number | null;
export function phraseEtat(etat: EtatBlocage | null, sites: string[], maintenantMs: number): { titre: string; detail: string };
export function originesAAutoriser(sites: string[]): string[];

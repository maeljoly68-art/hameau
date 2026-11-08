export const SITES_PAR_DEFAUT: string[];
export const SITES_MAX: number;
export const FRAICHEUR_MAX_MS: number;
export const DOMAINES_PROTEGES: string[];
export function domaineDe(saisie: unknown): string | null;
export function estProtege(domaine: string): boolean;
export function entreeDe(saisie: unknown): string | null;
export function partiesDe(entree: string): { hote: string; chemin: string };
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
export function reglesBlocage(sites: string[], racineExtension: string): { id: number; priority: number; action: { type: string; redirect: { regexSubstitution: string } }; condition: { regexFilter: string; requestDomains?: string[]; resourceTypes: string[] } }[];
export function urlBloquee(adresse: unknown, sites: string[]): boolean;
export function hoteBloque(hote: unknown, sites: string[]): boolean;
export function urlOriginale(search: unknown, hash?: unknown): string | null;
export function minutesDepuis(debutIso: unknown, maintenantMs: number): number | null;
export function phraseEtat(etat: EtatBlocage | null, sites: string[], maintenantMs: number): { titre: string; detail: string };
export function originesAAutoriser(sites: string[]): string[];

export interface Confirmation { active: boolean; delaiS: number; passeMin: number }
export const CONFIRMATION_DEFAUT: Confirmation;
export const SITES_DE_TRAVAIL_DEFAUT: string[];
export const DELAIS_S: number[];
export const PASSES_MIN: number[];
export function confirmationValide(brut: unknown): Confirmation;
export function siteDe(hote: unknown): string;
export function passeValide(passes: Record<string, number> | undefined, site: string, maintenantMs: number): boolean;
export function ajouterPasse(passes: Record<string, number> | undefined, site: string, dureeMin: number, maintenantMs: number): Record<string, number>;
export function doitConfirmer(entree: { etat: { enCours: boolean; enPause: boolean } | null; destination: unknown; actuelle: unknown; autorises?: string[]; bloques?: string[]; passes?: Record<string, number>; maintenantMs: number }): boolean;
export function compter(compteurs: Record<string, { resistes: number; continues: number }> | undefined, jour: string, genre: 'rester' | 'continuer'): Record<string, { resistes: number; continues: number }>;

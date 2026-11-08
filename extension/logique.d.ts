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
  /** Secondes de pause déjà cumulées, et le début de la pause en cours (null hors pause). */
  pauseSecondes: number;
  pauseDepuis: string | null;
}
export function etatDepuisSession(ligne: { id?: unknown; debut?: unknown; fin?: unknown; categorie?: unknown; pause_depuis?: unknown; pause_secondes?: unknown } | null, options?: { debloquerEnPause?: boolean }): EtatBlocage;
export function garderBlocage(precedent: { bloque?: boolean; dernierSucces?: unknown } | null | undefined, maintenantMs: number): boolean;
export function reglesBlocage(sites: string[], racineExtension: string): { id: number; priority: number; action: { type: string; redirect: { regexSubstitution: string } }; condition: { regexFilter: string; requestDomains?: string[]; resourceTypes: string[] } }[];
export function urlBloquee(adresse: unknown, sites: string[]): boolean;
export function hoteBloque(hote: unknown, sites: string[]): boolean;
export function urlOriginale(search: unknown, hash?: unknown): string | null;
export function secondesDeTravail(etat: Pick<EtatBlocage, 'debut' | 'pauseSecondes' | 'pauseDepuis'> | null | undefined, maintenantMs: number): number | null;
export function formatChronoCourt(secondes: number): string;
export function situation(etat: EtatBlocage | null | undefined): { cle: 'libre' | 'pause-libre' | 'pause' | 'bloque'; puce: string };
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

export interface ReglagesSuivi { active: boolean; titres: boolean; exclusions: string[] }
export interface Suivi { sessionId: string | null; totaux: Record<string, number>; envoye: Record<string, number>; courant: { cle: string; depuis: number } | null }
export const SUIVI_DEFAUT: ReglagesSuivi;
export const SECONDES_SEGMENT_MAX: number;
export const TITRE_MAX: number;
export const CLES_MAX: number;
export const SEUIL_INACTIVITE_S: number;
export const SECONDES_JOUR: number;
export const SUIVI_VIDE: Suivi;
export function suiviValide(brut: unknown): ReglagesSuivi;
export function siteEnregistre(adresse: unknown, exclusions?: string[]): string | null;
export function titreEnregistre(titre: unknown): string;
export function cleActivite(site: string, titre: string): string;
export function partiesCle(cle: string): { site: string; titre: string };
export function secondesEntre(depuisMs: number, maintenantMs: number, max?: number): number;
export function cloturer(suivi: Suivi, maintenantMs: number): Suivi;
export function avancer(suivi: Suivi, entree: { maintenantMs: number; travaille: boolean; actif: boolean; onglet: { site: string; titre: string } | null }): Suivi;
export function lignesAEnvoyer(suivi: Suivi, appareil: string, maintenantIso: string): { appareil: string; site: string; titre: string; secondes: number; maj_le: string }[];
export function apresEnvoi(suivi: Suivi, lignes: { site: string; titre: string; secondes: number }[]): Suivi;
export function parSite(suivi: Suivi, n?: number): { site: string; secondes: number }[];

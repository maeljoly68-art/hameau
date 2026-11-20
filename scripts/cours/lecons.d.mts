// Types du convertisseur des pages de leçons, pour les tests (le script lui-même est en JavaScript, lancé par Node).
export interface DonneesLecons {
  tests: unknown[];
  lecons: { id: number; title: string; minutes: number; [champ: string]: unknown }[];
  examen: string | null;
  cible: unknown;
  cle: string;
}
export function sansThemeSombre(css: string): string;
export function lireDonnees(source: string): DonneesLecons;
export function convertirLecons(source: string): {
  html: string;
  largeur: number;
  planches: { id: string; titre: string }[];
  lecons: { ancre: string; titre: string; minutes: number }[];
};

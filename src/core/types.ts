export interface Session {
  id: string;
  /** Instant ISO du début. */
  debut: string;
  /** Instant ISO de fin ; null tant que la session tourne. */
  fin: string | null;
  description: string;
  categorie: string;
  /** Appareil qui a lancé la session (« iPhone », « PC »…), pour mémoire. */
  appareil: string;
}

export interface Construction {
  id: string;
  batiment: string;
  x: number;
  y: number;
  /**
   * Coût payé AU MOMENT de la construction. Le recalculer depuis le catalogue
   * changerait le solde de tout le monde à chaque rééquilibrage des prix.
   */
  cout: number;
  construitLe: string;
}

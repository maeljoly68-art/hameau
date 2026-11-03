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
  /** Durée visée en minutes (25, 50…), ou null pour une session libre. */
  objectif: number | null;
  /** Secondes de pause déjà terminées, à déduire de la durée. */
  pauseSecondes: number;
  /** Début de la pause en cours, ou null quand la session avance. */
  pauseDepuis: string | null;
}

export interface Profil {
  nomHameau: string;
  /** Minutes de concentration visées par jour. */
  objectifJour: number;
  /** Nom montré aux amis dans le classement ; vide tant qu'il n'est pas choisi. */
  pseudo: string;
  /** Tenue du personnage principal (identifiants de la garde-robe). */
  apparence: Apparence;
  /**
   * Niveau montré aux amis. Le niveau se calcule depuis les sessions, que les
   * amis ne voient pas : chaque appareil recopie ici celui qu'il calcule.
   */
  niveauPublie: number;
}

export interface Apparence {
  peau: string;
  cheveux: string;
  coiffure: string;
  tenue: string;
  chapeau: string;
  cape: string;
  accessoire: string;
  compagnon: string;
}

export const APPARENCE_DEFAUT: Apparence = {
  peau: 'peau-2',
  cheveux: 'brun',
  coiffure: 'courte',
  tenue: 'bleu',
  chapeau: 'aucun',
  cape: 'aucune',
  accessoire: 'aucun',
  compagnon: 'aucun',
};

export const PROFIL_DEFAUT: Profil = { nomHameau: 'Mon hameau', objectifJour: 120, pseudo: '', apparence: APPARENCE_DEFAUT, niveauPublie: 1 };

export interface Construction {
  id: string;
  batiment: string;
  x: number;
  y: number;
  /**
   * Points dépensés sur ce bâtiment, construction ET améliorations, au prix
   * du moment. Les recalculer depuis le catalogue changerait le solde de
   * tout le monde à chaque rééquilibrage des prix.
   */
  cout: number;
  /** 1 à la construction, jusqu'à 3 à force d'améliorations. */
  niveau: number;
  construitLe: string;
}

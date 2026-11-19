// Ouvrir la liseuse depuis n'importe quel écran (la séance du jour, le détail d'un cours, une page) : un événement
// plutôt qu'une fonction passée de composant en composant à travers tout l'onglet Cours.
export const EVENEMENT_LIRE = 'hameau-lire';

export interface DemandeLecture {
  coursId: string;
  /** La page où ouvrir ; null : là où on s'était arrêté. */
  chapitreId: string | null;
}

export function ouvrirLiseuse(coursId: string, chapitreId: string | null = null): void {
  window.dispatchEvent(new CustomEvent<DemandeLecture>(EVENEMENT_LIRE, { detail: { coursId, chapitreId } }));
}

/** Un cours se lit dans Hameau s'il a son document ; sinon, seul son lien (l'artefact) l'ouvre. */
export const lisibleDansHameau = (cours: { document?: string | null } | null | undefined): boolean => typeof cours?.document === 'string' && cours.document.length > 0;

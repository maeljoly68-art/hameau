// Les onglets de l'application qu'une adresse ou une notification peut ouvrir. Pur.

export const ONGLETS = ['village', 'cours', 'taches', 'amis', 'historique', 'stats', 'reglages'] as const;
export type Onglet = (typeof ONGLETS)[number];

/** Un nom d'onglet connu, ou null : une adresse ou un message ne choisit jamais autre chose qu'un onglet de la liste. */
export function ongletValide(v: unknown): Onglet | null {
  return typeof v === 'string' && (ONGLETS as readonly string[]).includes(v) ? (v as Onglet) : null;
}

/** L'onglet demandé par « ?onglet=cours » dans l'adresse (le rappel du jour y ramène), ou null. */
export function ongletDansAdresse(recherche: string): Onglet | null {
  return ongletValide(new URLSearchParams(recherche).get('onglet'));
}

/** L'adresse sans le paramètre « onglet » : une fois l'onglet ouvert, un rechargement ne doit pas y ramener. */
export function sansOnglet(recherche: string): string {
  const p = new URLSearchParams(recherche);
  p.delete('onglet');
  const reste = p.toString();
  return reste === '' ? '' : `?${reste}`;
}

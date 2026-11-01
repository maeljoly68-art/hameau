import type { Construction, Session } from '../core/types.ts';

export interface Donnees {
  sessions: Session[];
  constructions: Construction[];
}

/** Ce que l'interface attend d'un stockage, qu'il soit local ou synchronisé. */
export interface Depot {
  readonly synchronise: boolean;
  charger(): Promise<Donnees>;
  /** Démarre une session, ou rend celle qui tourne déjà (lancée ailleurs, peut-être). */
  demarrer(categorie: string): Promise<Session>;
  terminer(id: string, champs: { fin: string; description: string; categorie: string }): Promise<void>;
  ajouterSession(s: Omit<Session, 'id'>): Promise<void>;
  modifierSession(id: string, champs: Partial<Omit<Session, 'id'>>): Promise<void>;
  supprimerSession(id: string): Promise<void>;
  construire(c: Omit<Construction, 'id' | 'construitLe'>): Promise<void>;
  demolir(id: string): Promise<void>;
  /** Prévient quand les données ont changé ailleurs (autre onglet, autre appareil). */
  ecouter(rappel: () => void): () => void;
}

export function nomAppareil(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  // iPadOS se déclare « Macintosh » : seul l'écran tactile le trahit.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'PC';
  if (/Macintosh/.test(ua)) return 'Mac';
  return 'Navigateur';
}

export function nouvelId(): string {
  return crypto.randomUUID();
}

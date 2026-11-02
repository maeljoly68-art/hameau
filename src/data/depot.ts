import type { Construction, Profil, Session } from '../core/types.ts';

export interface Donnees {
  sessions: Session[];
  constructions: Construction[];
  profil: Profil;
}

/** Ce que l'interface attend d'un stockage, qu'il soit local ou synchronisé. */
export interface Depot {
  readonly synchronise: boolean;
  /** Clé du cache d'affichage instantané (par compte). */
  readonly cleCache: string;
  charger(): Promise<Donnees>;
  /** Démarre une session, ou rend celle qui tourne déjà (lancée ailleurs, peut-être). */
  demarrer(categorie: string, objectif: number | null): Promise<Session>;
  terminer(id: string, champs: { fin: string; description: string; categorie: string }): Promise<void>;
  ajouterSession(s: Omit<Session, 'id'>): Promise<void>;
  modifierSession(id: string, champs: Partial<Omit<Session, 'id'>>): Promise<void>;
  supprimerSession(id: string): Promise<void>;
  construire(c: Omit<Construction, 'id' | 'construitLe'>): Promise<void>;
  demolir(id: string): Promise<void>;
  enregistrerProfil(p: Profil): Promise<void>;
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

/* ── Cache d'affichage ──
   Le dernier état connu, affiché à l'ouverture pendant que le réseau répond :
   sur un téléphone, attendre Supabase avant de peindre quoi que ce soit, c'est
   une à deux secondes d'écran vide à chaque lancement. Il n'est JAMAIS une
   source de vérité : on ne l'écrit qu'avec ce que le dépôt vient de rendre. */

export function lireCache(cle: string): Donnees | null {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as Donnees) : null;
  } catch {
    return null;
  }
}

export function ecrireCache(cle: string, d: Donnees): void {
  try {
    localStorage.setItem(cle, JSON.stringify(d));
  } catch {
    // Stockage plein ou bloqué : l'app marche sans cache, juste moins vite.
  }
}

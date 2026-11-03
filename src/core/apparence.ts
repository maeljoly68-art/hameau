// Garde-robe du personnage principal : catalogue et conditions de déblocage.
// Pur. Rien n'est stocké comme « débloqué » : comme les succès, un objet se
// déduit de la progression, et reste juste si une session est supprimée.
import { APPARENCE_DEFAUT, type Apparence } from './types.ts';

export type Emplacement = keyof Apparence;

export type Condition =
  | { type: 'niveau'; valeur: number }
  | { type: 'heures'; valeur: number }
  | { type: 'sessions'; valeur: number }
  | { type: 'serie'; valeur: number }
  | { type: 'batiments'; valeur: number }
  | { type: 'succes'; id: string };

export interface Cosmetique {
  id: string;
  emplacement: Emplacement;
  nom: string;
  /** Couleur portée (peau, cheveux, tenue, cape) ; les objets dessinés n'en ont pas. */
  couleur?: string;
  /** null : disponible d'emblée. */
  condition: Condition | null;
}

const libre = (emplacement: Emplacement, id: string, nom: string, couleur?: string): Cosmetique => ({ id, emplacement, nom, couleur, condition: null });
const gagne = (emplacement: Emplacement, id: string, nom: string, condition: Condition, couleur?: string): Cosmetique => ({ id, emplacement, nom, couleur, condition });

export const COSMETIQUES: readonly Cosmetique[] = [
  // Ce qu'on est ne se mérite pas : peau, cheveux et coiffures sont libres.
  libre('peau', 'peau-1', 'Très claire', '#f7dcc0'),
  libre('peau', 'peau-2', 'Claire', '#eec39a'),
  libre('peau', 'peau-3', 'Mate', '#d6a072'),
  libre('peau', 'peau-4', 'Brune', '#a8704a'),
  libre('peau', 'peau-5', 'Foncée', '#6e4630'),
  libre('cheveux', 'brun', 'Bruns', '#5a3d22'),
  libre('cheveux', 'noir', 'Noirs', '#2a1f1a'),
  libre('cheveux', 'chatain', 'Châtains', '#8a5a32'),
  libre('cheveux', 'blond', 'Blonds', '#e0b864'),
  libre('cheveux', 'roux', 'Roux', '#b8562e'),
  libre('cheveux', 'gris', 'Gris', '#aaa8a4'),
  gagne('cheveux', 'bleu', 'Bleu nuit', { type: 'niveau', valeur: 6 }, '#4a6fd6'),
  gagne('cheveux', 'rose', 'Rose bonbon', { type: 'serie', valeur: 7 }, '#e07aa8'),
  libre('coiffure', 'courte', 'Courte'),
  libre('coiffure', 'longue', 'Longue'),
  libre('coiffure', 'chignon', 'Chignon'),
  libre('coiffure', 'boucles', 'Bouclée'),
  libre('tenue', 'bleu', 'Tunique bleue', '#3d6fd1'),
  libre('tenue', 'vert', 'Tunique verte', '#2f9e7a'),
  libre('tenue', 'rouge', 'Tunique rouge', '#c4453a'),
  libre('tenue', 'ocre', 'Tunique ocre', '#c98f34'),
  gagne('tenue', 'violet', 'Tunique violette', { type: 'niveau', valeur: 4 }, '#7a4fc4'),
  gagne('tenue', 'nuit', 'Tunique d’encre', { type: 'niveau', valeur: 8 }, '#2b2f45'),
  gagne('tenue', 'blanc', 'Tunique de lin', { type: 'heures', valeur: 25 }, '#ecebe4'),
  gagne('tenue', 'or', 'Tunique d’or', { type: 'succes', id: 'cent-heures' }, '#e0b440'),
  libre('chapeau', 'aucun', 'Tête nue'),
  gagne('chapeau', 'paille', 'Chapeau de paille', { type: 'niveau', valeur: 2 }),
  gagne('chapeau', 'bonnet', 'Bonnet de laine', { type: 'succes', id: 'serie-3' }),
  gagne('chapeau', 'fleurs', 'Couronne de fleurs', { type: 'succes', id: 'objectif' }),
  gagne('chapeau', 'beret', 'Béret d’artiste', { type: 'succes', id: 'dix-heures' }),
  gagne('chapeau', 'casque', 'Casque à plume', { type: 'succes', id: 'marathon' }),
  gagne('chapeau', 'mage', 'Chapeau de mage', { type: 'niveau', valeur: 10 }),
  gagne('chapeau', 'couronne', 'Couronne d’or', { type: 'niveau', valeur: 15 }),
  libre('cape', 'aucune', 'Sans cape'),
  gagne('cape', 'rouge', 'Cape écarlate', { type: 'succes', id: 'serie-7' }, '#b8322e'),
  gagne('cape', 'aurore', 'Cape d’aurore', { type: 'succes', id: 'aube' }, '#f08a6a'),
  gagne('cape', 'minuit', 'Cape de minuit', { type: 'succes', id: 'nuit' }, '#2c3570'),
  gagne('cape', 'royale', 'Manteau royal', { type: 'niveau', valeur: 12 }, '#6a2f8f'),
  libre('accessoire', 'aucun', 'Mains libres'),
  gagne('accessoire', 'livre', 'Livre', { type: 'sessions', valeur: 5 }),
  gagne('accessoire', 'lanterne', 'Lanterne', { type: 'niveau', valeur: 3 }),
  gagne('accessoire', 'tasse', 'Tasse fumante', { type: 'sessions', valeur: 20 }),
  gagne('accessoire', 'marteau', 'Marteau', { type: 'succes', id: 'batisseur' }),
  gagne('accessoire', 'plume', 'Plume d’oie', { type: 'succes', id: 'objectif-10' }),
  gagne('accessoire', 'baton', 'Bâton de pèlerin', { type: 'niveau', valeur: 7 }),
  libre('compagnon', 'aucun', 'Seul au coin du feu'),
  gagne('compagnon', 'chat', 'Chat roux', { type: 'sessions', valeur: 10 }),
  gagne('compagnon', 'chien', 'Chien fidèle', { type: 'niveau', valeur: 5 }),
  gagne('compagnon', 'lapin', 'Lapin', { type: 'batiments', valeur: 8 }),
  gagne('compagnon', 'hibou', 'Hibou', { type: 'heures', valeur: 50 }),
  gagne('compagnon', 'renard', 'Renard', { type: 'serie', valeur: 14 }),
];

export const EMPLACEMENTS: readonly { id: Emplacement; nom: string }[] = [
  { id: 'chapeau', nom: 'Chapeau' },
  { id: 'tenue', nom: 'Tenue' },
  { id: 'cape', nom: 'Cape' },
  { id: 'accessoire', nom: 'Objet' },
  { id: 'compagnon', nom: 'Compagnon' },
  { id: 'coiffure', nom: 'Coiffure' },
  { id: 'cheveux', nom: 'Cheveux' },
  { id: 'peau', nom: 'Peau' },
];

export function cosmetique(emplacement: Emplacement, id: string): Cosmetique | undefined {
  return COSMETIQUES.find((c) => c.emplacement === emplacement && c.id === id);
}

/** Couleur portée à cet emplacement (peau, cheveux, tenue, cape), ou celle par défaut. */
export function couleurDe(a: Apparence, emplacement: 'peau' | 'cheveux' | 'tenue' | 'cape'): string {
  return cosmetique(emplacement, a[emplacement])?.couleur ?? cosmetique(emplacement, APPARENCE_DEFAUT[emplacement])?.couleur ?? '#888888';
}

/**
 * Apparence lue en base ou sur l'appareil : un identifiant inconnu (objet
 * retiré du catalogue, donnée abîmée) revient à sa valeur par défaut, plutôt
 * que de dessiner un personnage sans tête.
 */
export function apparenceValide(brut: unknown): Apparence {
  const o = brut && typeof brut === 'object' ? (brut as Record<string, unknown>) : {};
  const a = { ...APPARENCE_DEFAUT };
  for (const e of Object.keys(APPARENCE_DEFAUT) as Emplacement[]) {
    const v = o[e];
    if (typeof v === 'string' && cosmetique(e, v)) a[e] = v;
  }
  return a;
}

export interface Progression {
  niveau: number;
  /** Minutes de concentration cumulées. */
  minutes: number;
  /** Sessions closes d'au moins 5 minutes. */
  sessions: number;
  meilleureSerie: number;
  batiments: number;
  /** Succès obtenus, par identifiant. */
  succes: ReadonlySet<string>;
}

/** Où en est-on de la condition : de quoi dessiner une jauge. */
export function avancement(c: Condition, p: Progression): { actuel: number; cible: number } {
  switch (c.type) {
    case 'niveau':
      return { actuel: Math.min(p.niveau, c.valeur), cible: c.valeur };
    case 'heures':
      return { actuel: Math.min(Math.floor(p.minutes / 60), c.valeur), cible: c.valeur };
    case 'sessions':
      return { actuel: Math.min(p.sessions, c.valeur), cible: c.valeur };
    case 'serie':
      return { actuel: Math.min(p.meilleureSerie, c.valeur), cible: c.valeur };
    case 'batiments':
      return { actuel: Math.min(p.batiments, c.valeur), cible: c.valeur };
    case 'succes':
      return { actuel: p.succes.has(c.id) ? 1 : 0, cible: 1 };
  }
}

export function debloque(c: Cosmetique, p: Progression): boolean {
  if (!c.condition) return true;
  // Les heures se comptent en minutes : 24 h 59 ne sont pas 25 heures.
  if (c.condition.type === 'heures') return p.minutes >= c.condition.valeur * 60;
  const { actuel, cible } = avancement(c.condition, p);
  return actuel >= cible;
}

/** La condition, en mots. `nomSucces` donne le nom affiché d'un succès. */
export function texteCondition(c: Condition, nomSucces: (id: string) => string): string {
  switch (c.type) {
    case 'niveau':
      return `Atteindre le niveau ${c.valeur}`;
    case 'heures':
      return `Cumuler ${c.valeur} h de concentration`;
    case 'sessions':
      return `Terminer ${c.valeur} sessions`;
    case 'serie':
      return `Tenir une série de ${c.valeur} jours`;
    case 'batiments':
      return `Avoir ${c.valeur} bâtiments`;
    case 'succes':
      return `Succès « ${nomSucces(c.id)} »`;
  }
}

/** Objets débloqués dans `apres` qui ne l'étaient pas dans `avant` : de quoi les annoncer une fois. */
export function nouveauxCosmetiques(avant: Progression, apres: Progression): Cosmetique[] {
  return COSMETIQUES.filter((c) => c.condition && debloque(c, apres) && !debloque(c, avant));
}

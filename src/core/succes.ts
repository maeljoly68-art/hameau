// Succès : tous déduits des sessions et des constructions, rien n'est stocké.
// Un succès stocké pourrait rester acquis après la suppression de la session
// qui l'a donné ; déduit, il reste toujours vrai.
import { meilleureSerie, minutesParJour } from './stats.ts';
import { dureeSession } from './session.ts';
import type { Construction, Session } from './types.ts';

export interface Succes {
  id: string;
  nom: string;
  description: string;
  /** Où on en est, et ce qu'il faut atteindre. */
  actuel: number;
  cible: number;
  obtenu: boolean;
}

/** Minutes à atteindre pour qu'une session « compte » pour un succès d'horaire. */
const SESSION_SERIEUSE = 25;

export function succes(sessions: readonly Session[], constructions: readonly Construction[], objectifJour: number): Succes[] {
  let total = 0;
  let closes = 0;
  let plusLongue = 0;
  let matin = 0;
  let soir = 0;
  for (const s of sessions) {
    const d = dureeSession(s);
    if (d === null) continue;
    closes += d >= 5 ? 1 : 0;
    total += d;
    plusLongue = Math.max(plusLongue, d);
    if (d >= SESSION_SERIEUSE) {
      // Heure LOCALE de début : c'est l'heure que la personne a vécue.
      const h = new Date(s.debut).getHours();
      if (h < 7) matin++;
      if (h >= 22) soir++;
    }
  }
  const record = meilleureSerie(sessions);
  let joursObjectif = 0;
  for (const m of minutesParJour(sessions).values()) if (m >= objectifJour) joursObjectif++;

  const regle = (id: string, nom: string, description: string, actuel: number, cible: number): Succes => ({
    id,
    nom,
    description,
    actuel: Math.min(actuel, cible),
    cible,
    obtenu: actuel >= cible,
  });

  return [
    regle('premiere', 'Première flamme', 'Terminer une session d’au moins 5 minutes.', closes, 1),
    regle('heure', 'Une heure pleine', 'Cumuler 1 heure de concentration.', Math.floor(total), 60),
    regle('dix-heures', 'Artisan', 'Cumuler 10 heures.', Math.floor(total), 600),
    regle('cent-heures', 'Maître d’œuvre', 'Cumuler 100 heures.', Math.floor(total), 6000),
    regle('marathon', 'Marathon', 'Une session de 2 heures d’affilée.', Math.floor(plusLongue), 120),
    regle('serie-3', 'Trois jours', 'Une série de 3 jours.', record, 3),
    regle('serie-7', 'Semaine parfaite', 'Une série de 7 jours.', record, 7),
    regle('serie-30', 'Un mois de feu', 'Une série de 30 jours.', record, 30),
    regle('objectif', 'Mission du jour', 'Atteindre son objectif quotidien.', joursObjectif, 1),
    regle('objectif-10', 'Constance', 'Atteindre son objectif quotidien 10 jours.', joursObjectif, 10),
    regle('aube', 'Lève-tôt', 'Une session de 25 min commencée avant 7 h.', matin, 1),
    regle('nuit', 'Oiseau de nuit', 'Une session de 25 min commencée après 22 h.', soir, 1),
    regle('batisseur', 'Bâtisseur', 'Construire 5 bâtiments.', constructions.length, 5),
    regle('urbaniste', 'Urbaniste', 'Construire 15 bâtiments.', constructions.length, 15),
    regle('renovateur', 'Rénovateur', 'Améliorer un bâtiment.', constructions.filter((c) => c.niveau >= 2).length, 1),
    regle('chef-oeuvre', 'Chef-d’œuvre', 'Porter un bâtiment au niveau 3.', constructions.filter((c) => c.niveau >= 3).length, 1),
  ];
}

/** Succès obtenus dans `apres` qui ne l'étaient pas dans `avant`. */
export function nouveauxSucces(avant: readonly Succes[], apres: readonly Succes[]): Succes[] {
  const deja = new Set(avant.filter((s) => s.obtenu).map((s) => s.id));
  return apres.filter((s) => s.obtenu && !deja.has(s.id));
}

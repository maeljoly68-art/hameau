// Amis et classement : appels aux fonctions de la base. Les sessions des amis
// ne quittent jamais la base : on n'en reçoit que des totaux, calculés là-bas
// par une fonction qui vérifie l'amitié avant de répondre.
import { apparenceValide } from '../core/apparence.ts';
import type { Membre } from '../core/classement.ts';
import { PLAFOND_MINUTES } from '../core/points.ts';
import { client } from './config.ts';
import { MESSAGE_MIGRATION } from './distant.ts';

interface Erreur {
  code?: string;
  message: string;
}

/** Erreur de la base → phrase pour l'écran. */
function traduire(e: Erreur): Error {
  // Fonction inconnue : la migration des amis n'est pas encore passée.
  if (e.code === 'PGRST202' || e.code === '42883') return new Error(MESSAGE_MIGRATION);
  if (e.code === 'P0002') return new Error('Aucun hameau n’a ce code. Vérifie-le auprès de ton ami.');
  if (e.code === '22023') return new Error(e.message);
  if (e.code === '54000') return new Error('Tu as déjà 50 amis : retires-en un pour en ajouter un autre.');
  if (e.code === '28000') return new Error('Connecte-toi à ton compte pour jouer avec tes amis.');
  return new Error(e.message);
}

async function appeler<T>(fonction: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = await client();
  const r = await sb.rpc(fonction, args);
  if (r.error) throw traduire(r.error);
  return r.data as T;
}

/** Ton code ami : créé au premier appel, puis toujours le même. */
export const monCode = () => appeler<string>('hameau_mon_code');

/** Un nouveau code : l'ancien cesse de marcher (tes amis actuels le restent). */
export const nouveauCode = () => appeler<string>('hameau_nouveau_code');

export async function ajouterAmi(code: string): Promise<{ id: string; pseudo: string }> {
  const r = await appeler<{ ami: string; pseudo: string | null }>('hameau_ajouter_ami', { p_code: code });
  return { id: r.ami, pseudo: r.pseudo ?? 'Ton ami' };
}

export const retirerAmi = (id: string) => appeler<null>('hameau_retirer_ami', { p_ami: id });

interface LigneClassement {
  id: string;
  moi: boolean;
  pseudo: string | null;
  nom_hameau: string;
  apparence: unknown;
  niveau: number | null;
  secondes: number | string;
  sessions: number;
  par_jour: number[] | null;
  ouverte_debut: string | null;
  ouverte_pause_secondes: number | null;
  ouverte_pause_depuis: string | null;
  batiments: number;
}

/**
 * Toi et tes amis sur la période. Les jours sont découpés dans TON fuseau,
 * et chaque session plafonnée comme le sont les points : un chrono oublié
 * toute la nuit ne gagne pas la semaine.
 */
export async function chargerClassement(depuis: string, jours: number): Promise<Membre[]> {
  const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
  const lignes = await appeler<LigneClassement[]>('hameau_classement', { p_depuis: depuis, p_jours: jours, p_fuseau: fuseau, p_plafond_minutes: PLAFOND_MINUTES });
  return (lignes ?? []).map((l) => ({
    id: l.id,
    moi: l.moi,
    pseudo: l.pseudo,
    nomHameau: l.nom_hameau,
    apparence: apparenceValide(l.apparence),
    niveau: l.niveau ?? 1,
    // bigint arrive en texte selon la configuration de PostgREST.
    secondes: Number(l.secondes) || 0,
    sessions: l.sessions,
    parJour: l.par_jour ?? [],
    ouverte: l.ouverte_debut ? { debut: l.ouverte_debut, pauseSecondes: l.ouverte_pause_secondes ?? 0, pauseDepuis: l.ouverte_pause_depuis } : null,
    batiments: l.batiments,
  }));
}

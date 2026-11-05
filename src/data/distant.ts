import type { SupabaseClient } from '@supabase/supabase-js';
import { apparenceValide } from '../core/apparence.ts';
import { objectifValide } from '../core/objectif.ts';
import { pauseValide } from '../core/session.ts';
import { PROFIL_DEFAUT, type Construction, type Profil, type Session } from '../core/types.ts';
import { niveauValide } from '../core/village.ts';
import { nomAppareil, type Depot } from './depot.ts';
import { profilValide } from './local.ts';

interface LigneSession {
  id: string;
  debut: string;
  fin: string | null;
  description: string;
  categorie: string;
  appareil: string;
  objectif_minutes: number | null;
  pause_secondes: number;
  pause_depuis: string | null;
}
interface LigneConstruction {
  id: string;
  batiment: string;
  x: number;
  y: number;
  cout: number;
  /** Absente tant que la migration des améliorations n'est pas passée. */
  niveau?: number;
  construit_le: string;
}
interface LigneProfil {
  nom_hameau: string;
  objectif_jour: number;
  // Colonnes de la migration « amis » : absentes avant elle.
  pseudo?: string | null;
  apparence?: unknown;
  niveau?: number | null;
}

/**
 * Une colonne inconnue de la base (migration pas encore collée) : PostgREST
 * répond « PGRST204 », Postgres « 42703 ». On le reconnaît pour retomber sur
 * les colonnes d'avant au lieu de bloquer tout l'enregistrement.
 */
function colonneManquante(e: { code?: string } | null): boolean {
  return !!e && (e.code === 'PGRST204' || e.code === '42703');
}

export const MESSAGE_MIGRATION = 'La base Supabase n’est pas encore à jour : colle le fichier supabase/A-COLLER-DANS-SUPABASE.sql dans l’éditeur SQL du projet.';

const versSession = (l: LigneSession): Session => ({
  id: l.id,
  debut: l.debut,
  fin: l.fin,
  description: l.description,
  categorie: l.categorie,
  appareil: l.appareil,
  objectif: objectifValide(l.objectif_minutes),
  // Colonnes absentes tant que la migration des pauses n'est pas passée :
  // « pas de pause », pas une erreur.
  pauseSecondes: pauseValide(l.pause_secondes),
  pauseDepuis: l.pause_depuis ?? null,
});

/**
 * Champs d'une session → colonnes. On liste ce qu'on ENVOIE : un champ de
 * l'interface ajouté plus tard ne part pas en base sous un nom qui n'y existe
 * pas (PostgREST refuserait toute l'écriture).
 */
function versLigne(champs: Partial<Omit<Session, 'id'>>): Partial<Omit<LigneSession, 'id'>> {
  const l: Partial<Omit<LigneSession, 'id'>> = {};
  if (champs.debut !== undefined) l.debut = champs.debut;
  if (champs.fin !== undefined) l.fin = champs.fin;
  if (champs.description !== undefined) l.description = champs.description;
  if (champs.categorie !== undefined) l.categorie = champs.categorie;
  if (champs.appareil !== undefined) l.appareil = champs.appareil;
  if (champs.objectif !== undefined) l.objectif_minutes = objectifValide(champs.objectif);
  if (champs.pauseSecondes !== undefined) l.pause_secondes = pauseValide(champs.pauseSecondes);
  // pause_depuis n'est jamais écrit par le client : seules les fonctions de
  // pause et de reprise, à l'heure du serveur, y touchent.
  return l;
}

const versConstruction = (l: LigneConstruction): Construction => ({
  id: l.id,
  batiment: l.batiment,
  x: l.x,
  y: l.y,
  cout: l.cout,
  niveau: niveauValide(l.niveau),
  construitLe: l.construit_le,
});

const versProfil = (l: LigneProfil | null): Profil =>
  l
    ? profilValide({ nomHameau: l.nom_hameau, objectifJour: l.objectif_jour, pseudo: l.pseudo ?? '', apparence: apparenceValide(l.apparence), niveauPublie: l.niveau ?? 1 })
    : PROFIL_DEFAUT;

function echec(r: { error: { message: string } | null }): void {
  if (r.error) throw new Error(r.error.message);
}

/** Stockage Supabase : le même compte sur le téléphone, l'iPad et le PC. */
export function depotDistant(obtenir: () => Promise<SupabaseClient>, userId: string): Depot {
  const ouverte = async (sb: SupabaseClient): Promise<LigneSession | null> => {
    const r = await sb.from('sessions').select('*').is('fin', null).maybeSingle<LigneSession>();
    echec(r);
    return r.data;
  };

  return {
    synchronise: true,
    userId,
    cleCache: `hameau.cache.${userId}`,
    async charger() {
      const sb = await obtenir();
      const [s, c, p] = await Promise.all([
        sb.from('sessions').select('*').order('debut', { ascending: false }).limit(5000),
        sb.from('constructions').select('*'),
        // « * » plutôt qu'une liste : avant la migration des amis, demander
        // « pseudo » ferait échouer tout le chargement.
        sb.from('profils').select('*').maybeSingle<LigneProfil>(),
      ]);
      echec(s);
      echec(c);
      echec(p);
      return {
        sessions: (s.data ?? []).map((l) => versSession(l as LigneSession)),
        constructions: (c.data ?? []).map((l) => versConstruction(l as LigneConstruction)),
        // Pas encore de profil = réglages par défaut, pas une erreur.
        profil: versProfil(p.data),
      };
    },
    async demarrer(categorie, objectif) {
      const sb = await obtenir();
      const deja = await ouverte(sb);
      if (deja) return versSession(deja);
      // Pas de « debut » envoyé : la base pose son heure à elle, la même pour
      // tous les appareils.
      const r = await sb
        .from('sessions')
        .insert({ categorie, appareil: nomAppareil(), objectif_minutes: objectifValide(objectif) })
        .select()
        .single<LigneSession>();
      if (r.error?.code === '23505') {
        // Un autre appareil a démarré entre-temps : on rejoint sa session.
        const autre = await ouverte(sb);
        if (autre) return versSession(autre);
      }
      echec(r);
      return versSession(r.data!);
    },
    async terminer(id, champs) {
      const sb = await obtenir();
      echec(await sb.from('sessions').update(versLigne(champs)).eq('id', id));
    },
    async pause(id) {
      const sb = await obtenir();
      echec(await sb.rpc('hameau_pause', { p_session: id }));
    },
    async reprendre(id) {
      const sb = await obtenir();
      echec(await sb.rpc('hameau_reprise', { p_session: id }));
    },
    async ajouterSession(s) {
      const sb = await obtenir();
      echec(await sb.from('sessions').insert(versLigne(s)));
    },
    async modifierSession(id, champs) {
      const sb = await obtenir();
      echec(await sb.from('sessions').update(versLigne(champs)).eq('id', id));
    },
    async supprimerSession(id) {
      const sb = await obtenir();
      echec(await sb.from('sessions').delete().eq('id', id));
    },
    async construire(c) {
      const sb = await obtenir();
      const niveau = niveauValide(c.niveau);
      // Le niveau n'est envoyé que s'il dépasse 1 : une construction ordinaire
      // marche encore sur une base qui n'a pas la colonne.
      const r = await sb.from('constructions').insert({ batiment: c.batiment, x: c.x, y: c.y, cout: c.cout, ...(niveau > 1 ? { niveau } : {}) });
      if (r.error?.code === '23505') throw new Error('Cette case vient d’être occupée depuis un autre appareil.');
      if (colonneManquante(r.error)) throw new Error(MESSAGE_MIGRATION);
      echec(r);
    },
    async ameliorer(c, cout) {
      const sb = await obtenir();
      // « niveau = celui qu'on a vu » : si un autre appareil vient d'améliorer,
      // aucune ligne ne correspond, et l'on ne paie pas deux fois le palier.
      const r = await sb
        .from('constructions')
        .update({ niveau: c.niveau + 1, cout: c.cout + cout })
        .eq('id', c.id)
        .eq('niveau', c.niveau)
        .select('id');
      if (colonneManquante(r.error)) throw new Error(MESSAGE_MIGRATION);
      echec(r);
      if (!r.data?.length) throw new Error('Ce bâtiment vient d’être amélioré depuis un autre appareil.');
    },
    async demolir(id) {
      const sb = await obtenir();
      echec(await sb.from('constructions').delete().eq('id', id));
    },
    async enregistrerProfil(p: Profil) {
      const sb = await obtenir();
      const base = { user_id: userId, nom_hameau: p.nomHameau, objectif_jour: p.objectifJour, maj_le: new Date().toISOString() };
      const r = await sb.from('profils').upsert({ ...base, pseudo: p.pseudo.trim() || null, apparence: p.apparence, niveau: p.niveauPublie });
      if (!colonneManquante(r.error)) return echec(r);
      // Base pas encore migrée : le nom et l'objectif s'enregistrent quand
      // même ; le reste attend la mise à jour, et on le dit.
      echec(await sb.from('profils').upsert(base));
      throw new Error(MESSAGE_MIGRATION);
    },
    ecouter(rappel) {
      let fini = false;
      let retirer: (() => void) | null = null;
      void obtenir().then((sb) => {
        if (fini) return;
        const canal = sb
          .channel(`hameau-${userId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, rappel)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'constructions' }, rappel)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profils' }, rappel)
          .subscribe();
        retirer = () => void sb.removeChannel(canal);
      });
      // iOS coupe les connexions temps réel d'une app en arrière-plan : au
      // retour au premier plan, on recharge plutôt que de croire le canal.
      const auRetour = () => {
        if (document.visibilityState === 'visible') rappel();
      };
      document.addEventListener('visibilitychange', auRetour);
      window.addEventListener('focus', auRetour);
      const filet = window.setInterval(auRetour, 60_000);
      return () => {
        fini = true;
        retirer?.();
        document.removeEventListener('visibilitychange', auRetour);
        window.removeEventListener('focus', auRetour);
        window.clearInterval(filet);
      };
    },
  };
}

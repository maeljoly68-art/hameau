import type { SupabaseClient } from '@supabase/supabase-js';
import { objectifValide } from '../core/objectif.ts';
import { PROFIL_DEFAUT, type Construction, type Profil, type Session } from '../core/types.ts';
import { nomAppareil, type Depot } from './depot.ts';

interface LigneSession {
  id: string;
  debut: string;
  fin: string | null;
  description: string;
  categorie: string;
  appareil: string;
  objectif_minutes: number | null;
}
interface LigneConstruction {
  id: string;
  batiment: string;
  x: number;
  y: number;
  cout: number;
  construit_le: string;
}
interface LigneProfil {
  nom_hameau: string;
  objectif_jour: number;
}

const versSession = (l: LigneSession): Session => ({
  id: l.id,
  debut: l.debut,
  fin: l.fin,
  description: l.description,
  categorie: l.categorie,
  appareil: l.appareil,
  objectif: objectifValide(l.objectif_minutes),
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
  return l;
}

const versConstruction = (l: LigneConstruction): Construction => ({
  id: l.id,
  batiment: l.batiment,
  x: l.x,
  y: l.y,
  cout: l.cout,
  construitLe: l.construit_le,
});

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
    cleCache: `hameau.cache.${userId}`,
    async charger() {
      const sb = await obtenir();
      const [s, c, p] = await Promise.all([
        sb.from('sessions').select('*').order('debut', { ascending: false }).limit(5000),
        sb.from('constructions').select('*'),
        sb.from('profils').select('nom_hameau, objectif_jour').maybeSingle<LigneProfil>(),
      ]);
      echec(s);
      echec(c);
      echec(p);
      return {
        sessions: (s.data ?? []).map((l) => versSession(l as LigneSession)),
        constructions: (c.data ?? []).map((l) => versConstruction(l as LigneConstruction)),
        // Pas encore de profil = réglages par défaut, pas une erreur.
        profil: p.data ? { nomHameau: p.data.nom_hameau, objectifJour: p.data.objectif_jour } : PROFIL_DEFAUT,
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
      const r = await sb.from('constructions').insert({ batiment: c.batiment, x: c.x, y: c.y, cout: c.cout });
      if (r.error?.code === '23505') throw new Error('Cette case vient d’être occupée depuis un autre appareil.');
      echec(r);
    },
    async demolir(id) {
      const sb = await obtenir();
      echec(await sb.from('constructions').delete().eq('id', id));
    },
    async enregistrerProfil(p: Profil) {
      const sb = await obtenir();
      echec(await sb.from('profils').upsert({ user_id: userId, nom_hameau: p.nomHameau, objectif_jour: p.objectifJour, maj_le: new Date().toISOString() }));
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

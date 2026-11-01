import type { SupabaseClient } from '@supabase/supabase-js';
import type { Construction, Session } from '../core/types.ts';
import { nomAppareil, type Depot } from './depot.ts';

interface LigneSession {
  id: string;
  debut: string;
  fin: string | null;
  description: string;
  categorie: string;
  appareil: string;
}
interface LigneConstruction {
  id: string;
  batiment: string;
  x: number;
  y: number;
  cout: number;
  construit_le: string;
}

const versSession = (l: LigneSession): Session => ({ ...l });
const versConstruction = (l: LigneConstruction): Construction => ({
  id: l.id,
  batiment: l.batiment,
  x: l.x,
  y: l.y,
  cout: l.cout,
  construitLe: l.construit_le,
});

function verifier<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  // data vaut null sans erreur quand rien n'est renvoyé : ce n'est pas une
  // liste vide qu'on peut croire, c'est une réponse à refuser.
  if (r.data === null) throw new Error('Réponse vide du serveur');
  return r.data;
}

function verifierEcriture(r: { error: { message: string } | null }): void {
  if (r.error) throw new Error(r.error.message);
}

/** Stockage Supabase : le même compte sur le téléphone, l'iPad et le PC. */
export function depotDistant(sb: SupabaseClient): Depot {
  const ouverte = async (): Promise<LigneSession | null> => {
    const r = await sb.from('sessions').select('*').is('fin', null).maybeSingle<LigneSession>();
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };

  return {
    synchronise: true,
    async charger() {
      const [s, c] = await Promise.all([
        sb.from('sessions').select('*').order('debut', { ascending: false }).limit(5000),
        sb.from('constructions').select('*'),
      ]);
      return {
        sessions: verifier(s).map((l) => versSession(l as LigneSession)),
        constructions: verifier(c).map((l) => versConstruction(l as LigneConstruction)),
      };
    },
    async demarrer(categorie) {
      const deja = await ouverte();
      if (deja) return versSession(deja);
      // Pas de « debut » envoyé : la base pose son heure à elle, la même pour
      // tous les appareils.
      const r = await sb.from('sessions').insert({ categorie, appareil: nomAppareil() }).select().single<LigneSession>();
      if (r.error?.code === '23505') {
        // Un autre appareil a démarré entre-temps : on rejoint sa session.
        const autre = await ouverte();
        if (autre) return versSession(autre);
      }
      return versSession(verifier(r));
    },
    async terminer(id, champs) {
      verifierEcriture(await sb.from('sessions').update(champs).eq('id', id));
    },
    async ajouterSession(s) {
      verifierEcriture(await sb.from('sessions').insert(s));
    },
    async modifierSession(id, champs) {
      verifierEcriture(await sb.from('sessions').update(champs).eq('id', id));
    },
    async supprimerSession(id) {
      verifierEcriture(await sb.from('sessions').delete().eq('id', id));
    },
    async construire(c) {
      const r = await sb.from('constructions').insert({ batiment: c.batiment, x: c.x, y: c.y, cout: c.cout });
      if (r.error?.code === '23505') throw new Error('Cette case vient d’être occupée depuis un autre appareil.');
      verifierEcriture(r);
    },
    async demolir(id) {
      verifierEcriture(await sb.from('constructions').delete().eq('id', id));
    },
    ecouter(rappel) {
      const canal = sb
        .channel('hameau')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, rappel)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'constructions' }, rappel)
        .subscribe();
      // iOS coupe les connexions temps réel d'une app en arrière-plan : au
      // retour au premier plan, on recharge plutôt que de croire le canal.
      const auRetour = () => {
        if (document.visibilityState === 'visible') rappel();
      };
      document.addEventListener('visibilitychange', auRetour);
      window.addEventListener('focus', auRetour);
      const filet = window.setInterval(auRetour, 60_000);
      return () => {
        void sb.removeChannel(canal);
        document.removeEventListener('visibilitychange', auRetour);
        window.removeEventListener('focus', auRetour);
        window.clearInterval(filet);
      };
    },
  };
}

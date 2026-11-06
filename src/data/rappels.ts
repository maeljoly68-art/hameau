// Rappels mensuels : lecture et écriture dans Supabase. Réservé au compte (un rappel doit suivre sur tous les appareils).
import { rappelValide, type RappelMensuel } from '../core/rappels.ts';
import { client } from './config.ts';

interface LigneRappel {
  id: string;
  titre: string;
  jour_du_mois: number;
  fait_le: string | null;
  lien: string | null;
}

/** Les rappels du compte. La table n'existe qu'après sa migration : sans elle, il n'y a simplement aucun rappel. */
export async function chargerRappels(): Promise<RappelMensuel[]> {
  const sb = await client();
  const r = await sb.from('rappels').select('*').order('cree_le').order('id');
  if (r.error) {
    if (r.error.code === 'PGRST205' || r.error.code === '42P01') return [];
    throw new Error(r.error.message);
  }
  return ((r.data ?? []) as LigneRappel[]).map((l) => rappelValide({ id: l.id, titre: l.titre, jourDuMois: l.jour_du_mois, faitLe: l.fait_le, lien: l.lien })).filter((x): x is RappelMensuel => x !== null);
}

/** « Fait » aujourd'hui : il ne revient qu'au jour dit du mois suivant. */
export async function faireRappel(id: string, jour: string): Promise<void> {
  const sb = await client();
  const r = await sb.from('rappels').update({ fait_le: jour }).eq('id', id).select('id');
  if (r.error) throw new Error(r.error.message);
  if (!r.data?.length) throw new Error('Ce rappel n’existe plus : recharge la page.');
}

/** Prévient quand un rappel change ailleurs (fait sur un autre appareil, par exemple). */
export function ecouterRappels(userId: string, rappel: () => void): () => void {
  let fini = false;
  let retirer: (() => void) | null = null;
  void client().then((sb) => {
    if (fini) return;
    const canal = sb.channel(`hameau-rappels-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'rappels' }, rappel).subscribe();
    retirer = () => void sb.removeChannel(canal);
  });
  // iOS coupe le temps réel d'une app en arrière-plan : au retour, on recharge plutôt que de croire le canal.
  const auRetour = () => {
    if (document.visibilityState === 'visible') rappel();
  };
  document.addEventListener('visibilitychange', auRetour);
  return () => {
    fini = true;
    retirer?.();
    document.removeEventListener('visibilitychange', auRetour);
  };
}

const cleCache = (userId: string) => `hameau.rappels.${userId}`;

/** Dernier état connu, pour peindre le bandeau avant que le réseau réponde. Jamais une source de vérité. */
export function lireCacheRappels(userId: string): RappelMensuel[] {
  try {
    const brut = localStorage.getItem(cleCache(userId));
    const liste = brut ? (JSON.parse(brut) as unknown) : null;
    return Array.isArray(liste) ? liste.map(rappelValide).filter((x): x is RappelMensuel => x !== null) : [];
  } catch {
    return [];
  }
}

export function ecrireCacheRappels(userId: string, rappels: readonly RappelMensuel[]): void {
  try {
    localStorage.setItem(cleCache(userId), JSON.stringify(rappels));
  } catch {
    // Stockage plein ou bloqué : le bandeau marche sans cache, juste un peu moins vite.
  }
}

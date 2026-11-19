// La liseuse, côté données : la page d'un cours (chiffrée avec le site, la clé en base), l'encre, l'état des planches
// et les pages lues pendant une séance. Tout passe par Supabase : c'est ce qui fait qu'un trait tracé sur l'iPad se
// retrouve sur le PC, et qu'une page lue sur l'un compte dans la séance arrêtée sur l'autre.
import type { Lecture } from '../core/lecture.ts';
import { dechiffrerCours } from '../liseuse/chiffre.ts';
import { client } from './config.ts';
import { nomAppareil } from './depot.ts';

interface ErreurBase {
  message: string;
  code?: string;
}
const TABLE_ABSENTE = new Set(['42P01', 'PGRST205', '42703', 'PGRST204']);
function echec(r: { error: ErreurBase | null }): void {
  if (!r.error) return;
  if (r.error.code && TABLE_ABSENTE.has(r.error.code)) throw new Error('La base n’est pas encore prête pour la liseuse : colle le fichier supabase/A-COLLER-DANS-SUPABASE.sql dans l’éditeur SQL du projet.');
  throw new Error(r.error.message);
}

// ── Les pages ──

const pages = new Map<string, Promise<string>>();

/** La page du cours, déchiffrée. Gardée en mémoire le temps de la visite : rouvrir le cours ne la retélécharge pas. */
export function chargerDocument(document: string): Promise<string> {
  let p = pages.get(document);
  if (!p) {
    p = (async () => {
      const sb = await client();
      const r = await sb.from('cles_documents').select('fichier, cle').eq('document', document).maybeSingle<{ fichier: string; cle: string }>();
      echec(r);
      if (!r.data) throw new Error('Ce cours n’est pas encore lisible dans Hameau avec ce compte.');
      const adresse = new URL(`cours/${r.data.fichier}`, new URL(import.meta.env.BASE_URL, location.origin)).href;
      const rep = await fetch(adresse);
      if (!rep.ok) throw new Error(`Le cours n’a pas pu être téléchargé (erreur ${rep.status}). Réessaie dans un instant.`);
      return dechiffrerCours(new Uint8Array(await rep.arrayBuffer()), r.data.cle);
    })();
    pages.set(document, p);
    p.catch(() => pages.delete(document));
  }
  return p;
}

// ── L'encre ──

export type Outil = 'stylo' | 'surligneur';
export interface Trait {
  id: string;
  page: string;
  outil: Outil;
  couleur: string;
  epaisseur: number;
  /** [x0, y0, x1, y1, …] dans le repère de la planche. */
  points: number[];
}

/** Un trait lu en base ou reçu d'un autre appareil : illisible, il est écarté plutôt que de casser le dessin. */
export function traitValide(brut: unknown): Trait | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.page !== 'string' || (o.outil !== 'stylo' && o.outil !== 'surligneur')) return null;
  if (typeof o.couleur !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(o.couleur)) return null;
  const epaisseur = Number(o.epaisseur);
  if (!Number.isFinite(epaisseur) || epaisseur <= 0 || epaisseur > 64) return null;
  if (!Array.isArray(o.points) || o.points.length < 2 || o.points.length % 2 !== 0 || !o.points.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return { id: o.id, page: o.page, outil: o.outil, couleur: o.couleur, epaisseur, points: o.points as number[] };
}

export async function chargerTraits(document: string): Promise<Trait[]> {
  const sb = await client();
  const r = await sb.from('traits').select('id, page, outil, couleur, epaisseur, points').eq('document', document).order('cree_le').limit(20000);
  echec(r);
  return (r.data ?? []).map(traitValide).filter((t): t is Trait => t !== null);
}

/** Ajoute des traits ; un trait déjà là (même identifiant : un envoi rejoué) n'est pas recopié. */
export async function ajouterTraits(document: string, traits: readonly Trait[]): Promise<void> {
  if (traits.length === 0) return;
  const sb = await client();
  echec(await sb.from('traits').upsert(traits.map((t) => ({ id: t.id, document, page: t.page, outil: t.outil, couleur: t.couleur, epaisseur: t.epaisseur, points: t.points })), { onConflict: 'id', ignoreDuplicates: true }));
}

export async function supprimerTraits(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const sb = await client();
  echec(await sb.from('traits').delete().in('id', [...ids]));
}

/**
 * Les traits ajoutés ou gommés ailleurs, en direct. Une suppression n'arrive qu'avec l'identifiant du trait, et
 * pour toutes les tables du compte : celui qui ne connaît pas l'identifiant l'ignore simplement.
 */
export function ecouterTraits(document: string, surAjout: (t: Trait) => void, surRetrait: (id: string) => void): () => void {
  let fini = false;
  let retirer: (() => void) | null = null;
  void client().then((sb) => {
    if (fini) return;
    const canal = sb
      .channel(`hameau-traits-${document}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'traits', filter: `document=eq.${document}` }, (p: { new: unknown }) => {
        const t = traitValide(p.new);
        if (t) surAjout(t);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'traits' }, (p: { old: { id?: unknown } }) => {
        if (typeof p.old?.id === 'string') surRetrait(p.old.id);
      })
      .subscribe();
    retirer = () => void sb.removeChannel(canal);
  });
  return () => {
    fini = true;
    retirer?.();
  };
}

// ── L'état des planches ──

export async function chargerEtats(document: string): Promise<Record<string, string>> {
  const sb = await client();
  const r = await sb.from('etats_documents').select('cle, valeur').eq('document', document).not('valeur', 'is', null);
  echec(r);
  const etats: Record<string, string> = {};
  for (const l of (r.data ?? []) as { cle: string; valeur: string }[]) etats[l.cle] = l.valeur;
  return etats;
}

/** Écrit des clés (null : retirée — la ligne reste, vide, voir la migration de la liseuse). */
export async function ecrireEtats(document: string, changements: Record<string, string | null>): Promise<void> {
  const lignes = Object.entries(changements).map(([cle, valeur]) => ({ document, cle, valeur, maj_le: new Date().toISOString() }));
  if (lignes.length === 0) return;
  const sb = await client();
  echec(await sb.from('etats_documents').upsert(lignes, { onConflict: 'user_id,document,cle' }));
}

export function ecouterEtats(document: string, surChangement: (cle: string, valeur: string | null) => void): () => void {
  let fini = false;
  let retirer: (() => void) | null = null;
  void client().then((sb) => {
    if (fini) return;
    const canal = sb
      .channel(`hameau-etats-${document}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etats_documents', filter: `document=eq.${document}` }, (p: { new: { cle?: unknown; valeur?: unknown } }) => {
        if (typeof p.new?.cle === 'string') surChangement(p.new.cle, typeof p.new.valeur === 'string' ? p.new.valeur : null);
      })
      .subscribe();
    retirer = () => void sb.removeChannel(canal);
  });
  return () => {
    fini = true;
    retirer?.();
  };
}

// ── Les pages lues pendant une séance ──

/** Un identifiant propre à cet appareil (« iPad-k3x9f2 ») : deux appareils sur la même séance ne s'écrasent pas. */
export function idAppareil(): string {
  const cle = 'hameau.appareil-id';
  try {
    const lu = localStorage.getItem(cle);
    if (lu && lu.length <= 64) return lu;
    const neuf = `${nomAppareil()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(cle, neuf);
    return neuf;
  } catch {
    return nomAppareil();
  }
}

/** Le total de la séance pour chaque page, sur cet appareil : réécrit à chaque envoi, jamais ajouté. */
export async function enregistrerLectures(sessionId: string, lignes: readonly { chapitreId: string; secondes: number; couverture: number }[]): Promise<void> {
  if (lignes.length === 0) return;
  const appareil = idAppareil();
  const sb = await client();
  echec(
    await sb.from('lectures').upsert(
      lignes.map((l) => ({ session_id: sessionId, chapitre_id: l.chapitreId, appareil, secondes: Math.min(86400, Math.max(0, Math.round(l.secondes))), couverture: Math.min(100, Math.max(0, Math.round(l.couverture))), maj_le: new Date().toISOString() })),
      { onConflict: 'session_id,chapitre_id,appareil' },
    ),
  );
}

export async function lireLectures(sessionId: string): Promise<Lecture[]> {
  const sb = await client();
  const r = await sb.from('lectures').select('chapitre_id, appareil, secondes, couverture').eq('session_id', sessionId);
  echec(r);
  return ((r.data ?? []) as { chapitre_id: string; appareil: string; secondes: number; couverture: number }[]).map((l) => ({ chapitreId: l.chapitre_id, appareil: l.appareil, secondes: l.secondes, couverture: l.couverture }));
}

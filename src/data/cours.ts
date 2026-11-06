// Cours, chapitres, notes, temps disponible : lecture et écriture dans Supabase.
// Réservé au compte : le calendrier doit être le même sur le téléphone, l'iPad
// et le PC, ce qu'un stockage sur l'appareil ne ferait pas.
import { disponibilitesValides, dureeValide, lienValide, type Chapitre, type Cours, type Disponibilites, type DonneesCours, type NoteChapitre } from '../core/cours.ts';
import { estJour } from '../core/jours.ts';
import { apresRevision, niveauValide, type Note } from '../core/revision.ts';
import { client } from './config.ts';
import { MESSAGE_MIGRATION } from './distant.ts';

interface LigneCours {
  id: string;
  titre: string;
  couleur: string;
  partiel: string | null;
  lien: string | null;
  ordre: number;
  /** Absente tant que la migration de l'emploi du temps n'est pas passée. */
  motifs?: string | null;
}
interface LigneChapitre {
  id: string;
  cours_id: string;
  titre: string;
  ordre: number;
  duree_min: number;
  niveau: number;
  derniere_revision: string | null;
  prochaine_revision: string | null;
  lien: string | null;
}
interface LigneNote {
  id: string;
  chapitre_id: string;
  texte: string;
  citation: string | null;
  cree_le: string;
}

const versCours = (l: LigneCours): Cours => ({ id: l.id, titre: l.titre, couleur: l.couleur, partiel: l.partiel && estJour(l.partiel) ? l.partiel : null, lien: l.lien, ordre: l.ordre, motifs: typeof l.motifs === 'string' ? l.motifs : '' });
const versChapitre = (l: LigneChapitre): Chapitre => ({
  id: l.id,
  coursId: l.cours_id,
  titre: l.titre,
  ordre: l.ordre,
  dureeMin: dureeValide(l.duree_min),
  niveau: niveauValide(l.niveau),
  derniere: l.derniere_revision && estJour(l.derniere_revision) ? l.derniere_revision : null,
  prochaine: l.prochaine_revision && estJour(l.prochaine_revision) ? l.prochaine_revision : null,
  lien: l.lien,
});
const versNote = (l: LigneNote): NoteChapitre => ({ id: l.id, chapitreId: l.chapitre_id, texte: l.texte, citation: l.citation, creeLe: l.cree_le });

interface ErreurBase {
  message: string;
  code?: string;
}

/** Erreur de la base → phrase pour l'écran. */
function erreur(e: ErreurBase): Error {
  // Table inconnue : la migration des cours n'est pas encore passée.
  if (e.code === 'PGRST205' || e.code === '42P01') return new Error(MESSAGE_MIGRATION);
  // Colonne inconnue : la migration de l'emploi du temps n'est pas encore passée.
  if (e.code === 'PGRST204' || e.code === '42703') return new Error(MESSAGE_MIGRATION);
  if (e.code === '23514') return new Error('Une valeur n’est pas acceptée (titre vide, durée hors limites, adresse qui ne commence pas par https…).');
  return new Error(e.message);
}

function echec(r: { error: ErreurBase | null }): void {
  if (r.error) throw erreur(r.error);
}

/** Lit toutes les lignes d'une table : l'API plafonne une réponse à 1 000 lignes, et une lecture tronquée perdrait des notes sans rien dire. */
async function toutLire<T>(page: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: ErreurBase | null }>): Promise<T[]> {
  const lignes: T[] = [];
  for (let de = 0; ; de += 1000) {
    const r = await page(de, de + 999);
    if (r.error) throw erreur(r.error);
    lignes.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 1000) return lignes;
  }
}

export async function chargerCours(): Promise<DonneesCours> {
  const sb = await client();
  const [c, h, n, r] = await Promise.all([
    toutLire<LigneCours>((de, a) => sb.from('cours').select('*').order('ordre').order('cree_le').order('id').range(de, a)),
    toutLire<LigneChapitre>((de, a) => sb.from('chapitres').select('*').order('cours_id').order('ordre').order('id').range(de, a)),
    toutLire<LigneNote>((de, a) => sb.from('notes_chapitres').select('*').order('cree_le').order('id').range(de, a)),
    // « * » : la colonne de l'adresse du flux n'existe qu'après la migration de l'emploi du temps, et son absence ne doit rien casser.
    sb.from('reglages_cours').select('*').maybeSingle<{ disponibilites: unknown; agenda_url?: string | null }>(),
  ]);
  echec(r);
  return { cours: c.map(versCours), chapitres: h.map(versChapitre), notes: n.map(versNote), disponibilites: disponibilitesValides(r.data?.disponibilites), agendaLien: lienValide(r.data?.agenda_url ?? '') };
}

export interface ChampsCours {
  titre: string;
  couleur: string;
  partiel: string | null;
  lien: string | null;
  ordre: number;
  /** Les mots qui rattachent les créneaux de l'emploi du temps à ce cours. */
  motifs?: string;
}

export async function ajouterCours(c: Omit<ChampsCours, 'ordre'> & { ordre: number }, chapitres: { titre: string; dureeMin: number }[]): Promise<void> {
  const sb = await client();
  const r = await sb.from('cours').insert({ titre: c.titre, couleur: c.couleur, partiel: c.partiel, lien: c.lien, ordre: c.ordre }).select('id').single<{ id: string }>();
  echec(r);
  if (chapitres.length === 0) return;
  try {
    await ajouterChapitres(r.data!.id, chapitres, 0);
  } catch (e) {
    // Un cours sans ses chapitres n'est pas ce qu'on a demandé : on le retire plutôt que de le laisser vide.
    await sb.from('cours').delete().eq('id', r.data!.id);
    throw e;
  }
}

export async function modifierCours(id: string, champs: Partial<ChampsCours>): Promise<void> {
  const sb = await client();
  echec(await sb.from('cours').update(champs).eq('id', id));
}

export async function supprimerCours(id: string): Promise<void> {
  const sb = await client();
  echec(await sb.from('cours').delete().eq('id', id));
}

export async function ajouterChapitres(coursId: string, lignes: { titre: string; dureeMin: number }[], ordreDepart: number): Promise<void> {
  const sb = await client();
  echec(await sb.from('chapitres').insert(lignes.map((l, i) => ({ cours_id: coursId, titre: l.titre, duree_min: dureeValide(l.dureeMin), ordre: ordreDepart + i }))));
}

export async function modifierChapitre(id: string, champs: { titre?: string; dureeMin?: number; lien?: string | null }): Promise<void> {
  const sb = await client();
  const l: Record<string, unknown> = {};
  if (champs.titre !== undefined) l.titre = champs.titre;
  if (champs.dureeMin !== undefined) l.duree_min = dureeValide(champs.dureeMin);
  if (champs.lien !== undefined) l.lien = champs.lien;
  echec(await sb.from('chapitres').update(l).eq('id', id));
}

export async function supprimerChapitre(id: string): Promise<void> {
  const sb = await client();
  echec(await sb.from('chapitres').delete().eq('id', id));
}

/**
 * Note un passage sur un chapitre et recalcule où il en est dans le cycle.
 * L'écriture est gardée par le niveau LU : si l'autre appareil vient de noter
 * le même chapitre, rien n'est écrit — sans cela, deux appuis simultanés
 * feraient monter le chapitre de deux crans pour une seule révision.
 */
export async function noterChapitre(id: string, note: Note, jour: string): Promise<void> {
  const sb = await client();
  const lu = await sb.from('chapitres').select('niveau, derniere_revision, prochaine_revision').eq('id', id).maybeSingle<{ niveau: number; derniere_revision: string | null; prochaine_revision: string | null }>();
  echec(lu);
  if (!lu.data) throw new Error('Ce chapitre n’existe plus.');
  const avant = niveauValide(lu.data.niveau);
  const apres = apresRevision({ niveau: avant, derniere: lu.data.derniere_revision, prochaine: lu.data.prochaine_revision }, note, jour);
  const r = await sb
    .from('chapitres')
    .update({ niveau: apres.niveau, derniere_revision: apres.derniere, prochaine_revision: apres.prochaine })
    .eq('id', id)
    .eq('niveau', avant)
    .select('id');
  echec(r);
  if (!r.data?.length) throw new Error('Ce chapitre vient d’être noté depuis un autre appareil : recharge pour voir où il en est.');
}

/** Remet un chapitre « à découvrir » : on s'est trompé de touche, ou on repart de zéro avant un rattrapage. */
export async function remettreAZero(id: string): Promise<void> {
  const sb = await client();
  echec(await sb.from('chapitres').update({ niveau: 0, derniere_revision: null, prochaine_revision: null }).eq('id', id));
}

export async function ajouterNote(chapitreId: string, texte: string, citation: string | null): Promise<void> {
  const sb = await client();
  echec(await sb.from('notes_chapitres').insert({ chapitre_id: chapitreId, texte, citation }));
}

export async function modifierNote(id: string, texte: string): Promise<void> {
  const sb = await client();
  echec(await sb.from('notes_chapitres').update({ texte }).eq('id', id));
}

export async function supprimerNote(id: string): Promise<void> {
  const sb = await client();
  echec(await sb.from('notes_chapitres').delete().eq('id', id));
}

export async function enregistrerDisponibilites(userId: string, d: Disponibilites): Promise<void> {
  const sb = await client();
  echec(await sb.from('reglages_cours').upsert({ user_id: userId, disponibilites: d, maj_le: new Date().toISOString() }));
}

/** L'adresse du flux d'emploi du temps (null pour la retirer). Un upsert qui ne touche qu'à cette colonne : le temps disponible reste. */
export async function enregistrerAgendaLien(userId: string, lien: string | null): Promise<void> {
  const sb = await client();
  echec(await sb.from('reglages_cours').upsert({ user_id: userId, agenda_url: lien, maj_le: new Date().toISOString() }));
}

/** Prévient quand un cours, un chapitre ou une note change ailleurs (autre appareil, autre onglet). */
export function ecouterCours(userId: string, rappel: () => void): () => void {
  let fini = false;
  let retirer: (() => void) | null = null;
  void client().then((sb) => {
    if (fini) return;
    const canal = sb
      .channel(`hameau-cours-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cours' }, rappel)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chapitres' }, rappel)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes_chapitres' }, rappel)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reglages_cours' }, rappel)
      .subscribe();
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

const cleCache = (userId: string) => `hameau.cours.${userId}`;

/** Dernier état connu, pour peindre l'onglet avant que le réseau réponde. Jamais une source de vérité. */
export function lireCacheCours(userId: string): DonneesCours | null {
  try {
    const brut = localStorage.getItem(cleCache(userId));
    if (!brut) return null;
    const d = JSON.parse(brut) as Partial<DonneesCours>;
    if (!Array.isArray(d.cours) || !Array.isArray(d.chapitres) || !Array.isArray(d.notes)) return null;
    // Un cache écrit avant l'emploi du temps n'a ni mots de cours ni adresse du flux : on les complète.
    return {
      cours: d.cours.map((c) => ({ ...c, motifs: typeof c.motifs === 'string' ? c.motifs : '' })),
      chapitres: d.chapitres,
      notes: d.notes,
      disponibilites: disponibilitesValides(d.disponibilites),
      agendaLien: lienValide(typeof d.agendaLien === 'string' ? d.agendaLien : ''),
    };
  } catch {
    return null;
  }
}

export function ecrireCacheCours(userId: string, d: DonneesCours): void {
  try {
    localStorage.setItem(cleCache(userId), JSON.stringify(d));
  } catch {
    // Stockage plein ou bloqué : l'onglet marche sans cache, juste moins vite.
  }
}

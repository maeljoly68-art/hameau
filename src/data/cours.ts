// Cours, chapitres, notes, temps disponible : lecture et écriture dans Supabase.
// Réservé au compte : le calendrier doit être le même sur le téléphone, l'iPad
// et le PC, ce qu'un stockage sur l'appareil ne ferait pas.
import { carteValide, type Carte } from '../core/cartes.ts';
import { disponibilitesValides, dureeValide, lienValide, vitesseValide, type Chapitre, type Cours, type Disponibilites, type DonneesCours, type NoteChapitre } from '../core/cours.ts';
import { erreurValide, texteErreur, type Erreur } from '../core/erreurs.ts';
import { estJour } from '../core/jours.ts';
import type { PassageLeger } from '../core/pointsApprentissage.ts';
import { noteDepuisPct, passageValide, type Passage, type SortePassage } from '../core/passages.ts';
import { PRATIQUE_DECLAREE_MAX, pratiqueMinValide, pratiqueValide, type Pratique, type SortePratique } from '../core/pratique.ts';
import { revisionLibreMinValide } from '../core/revisionLibre.ts';
import { apresDecouverte, apresRappelAnticipe, apresRevision, niveauValide, type Note } from '../core/revision.ts';
import { cleJour, decalerJours } from '../core/temps.ts';
import { vitesseApresChrono, vitesseApresCoche, type Ressenti } from '../core/vitesse.ts';
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
  /** Absente tant que la migration de la pause n'est pas passée. */
  en_pause?: boolean | null;
  /** Absente tant que la migration de la pratique quotidienne n'est pas passée. */
  pratique_min?: number | null;
  /** Absente tant que la migration de la révision libre n'est pas passée. */
  revision_libre_min?: number | null;
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
  /** Absente tant que la migration « mot pour mot » n'est pas passée. */
  par_coeur?: boolean | null;
}
interface LignePassage {
  id: string;
  chapitre_id: string;
  jour: string;
  sorte: string;
  note: string | null;
  minutes: number | null;
  score_pct: number | string | null;
  vitesse: number | string | null;
  rappel: string | null;
  /** Absente tant que la migration « apprentissage actif » n'est pas passée. */
  confiance?: number | null;
  cree_le: string;
}
interface LigneErreur {
  id: string;
  chapitre_id: string;
  texte: string;
  jour: string;
  reglee_le: string | null;
  revue_le: string | null;
}
interface LigneCarte {
  id: string;
  chapitre_id: string;
  question: string;
  reponse: string;
  ordre: number;
}
interface LignePratique {
  id: string;
  cours_id: string;
  jour: string;
  minutes: number;
  /** Absente tant que la migration de la révision libre n'est pas passée : c'étaient des minutes d'erreurs. */
  sorte?: string | null;
}
interface LigneNote {
  id: string;
  chapitre_id: string;
  texte: string;
  citation: string | null;
  cree_le: string;
}

const versCours = (l: LigneCours): Cours => ({ id: l.id, titre: l.titre, couleur: l.couleur, partiel: l.partiel && estJour(l.partiel) ? l.partiel : null, lien: l.lien, ordre: l.ordre, motifs: typeof l.motifs === 'string' ? l.motifs : '', enPause: l.en_pause === true, pratiqueMin: pratiqueMinValide(l.pratique_min), revisionLibreMin: revisionLibreMinValide(l.revision_libre_min) });
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
  parCoeur: l.par_coeur === true,
});
// Les colonnes « numeric » reviennent parfois en texte selon la couche : on les relit comme des nombres.
const nombreOuNull = (v: number | string | null): number | null => (v === null ? null : Number(v));
const versPassage = (l: LignePassage): Passage | null => passageValide({ id: l.id, chapitreId: l.chapitre_id, jour: l.jour, sorte: l.sorte, note: l.note, minutes: l.minutes, scorePct: nombreOuNull(l.score_pct), vitesse: nombreOuNull(l.vitesse), rappel: l.rappel, confiance: l.confiance ?? null, creeLe: l.cree_le });
const versErreur = (l: LigneErreur): Erreur | null => erreurValide({ id: l.id, chapitreId: l.chapitre_id, texte: l.texte, jour: l.jour, regleeLe: l.reglee_le, revueLe: l.revue_le });
const versCarte = (l: LigneCarte): Carte | null => carteValide({ id: l.id, chapitreId: l.chapitre_id, question: l.question, reponse: l.reponse, ordre: l.ordre });
const versPratique = (l: LignePratique): Pratique | null => pratiqueValide({ id: l.id, coursId: l.cours_id, jour: l.jour, minutes: l.minutes, sorte: l.sorte });
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

/** Les passages des quatre derniers mois. La table n'existe qu'après sa migration : sans elle, `journal` est faux et rien d'autre ne change. */
async function lirePassages(sb: Awaited<ReturnType<typeof client>>): Promise<{ passages: Passage[]; journal: boolean }> {
  const depuis = cleJour(decalerJours(new Date(), -120));
  try {
    const lignes = await toutLire<LignePassage>((de, a) => sb.from('passages').select('*').gte('jour', depuis).order('jour').order('cree_le').order('id').range(de, a));
    return { passages: lignes.map(versPassage).filter((p): p is Passage => p !== null), journal: true };
  } catch (e) {
    if (e instanceof Error && e.message === MESSAGE_MIGRATION) return { passages: [], journal: false };
    throw e;
  }
}

/** Le carnet d'erreurs et les cartes. Leurs tables n'existent qu'après leur migration : sans elles, `carnet` est faux et rien d'autre ne change. */
async function lireCarnet(sb: Awaited<ReturnType<typeof client>>): Promise<{ erreurs: Erreur[]; cartes: Carte[]; carnet: boolean }> {
  try {
    const [e, k] = await Promise.all([
      toutLire<LigneErreur>((de, a) => sb.from('erreurs').select('*').order('jour').order('cree_le').order('id').range(de, a)),
      toutLire<LigneCarte>((de, a) => sb.from('cartes').select('*').order('chapitre_id').order('ordre').order('id').range(de, a)),
    ]);
    return { erreurs: e.map(versErreur).filter((x): x is Erreur => x !== null), cartes: k.map(versCarte).filter((x): x is Carte => x !== null), carnet: true };
  } catch (e) {
    if (e instanceof Error && e.message === MESSAGE_MIGRATION) return { erreurs: [], cartes: [], carnet: false };
    throw e;
  }
}

/** Les pratiques déclarées. Leur table n'existe qu'après sa migration : sans elle, `pratique` est faux et rien d'autre ne change. */
async function lirePratiques(sb: Awaited<ReturnType<typeof client>>): Promise<{ pratiques: Pratique[]; pratique: boolean }> {
  // Le chiffre qui compte est celui des derniers mois (la série se lit sur 400 jours au plus).
  const depuis = cleJour(decalerJours(new Date(), -400));
  try {
    const lignes = await toutLire<LignePratique>((de, a) => sb.from('pratiques').select('*').gte('jour', depuis).order('jour').order('cree_le').order('id').range(de, a));
    return { pratiques: lignes.map(versPratique).filter((x): x is Pratique => x !== null), pratique: true };
  } catch (e) {
    if (e instanceof Error && e.message === MESSAGE_MIGRATION) return { pratiques: [], pratique: false };
    throw e;
  }
}

/** Un passage vient d'être écrit sur cet appareil : le village recalcule ses points d'apprentissage sans attendre le temps réel. */
export const EVENEMENT_PASSAGE = 'hameau-passage';

/**
 * Laisse une ligne dans le journal. Le journal est un plus : un passage qui ne s'écrit pas (table pas encore migrée,
 * réseau coupé) ne doit JAMAIS empêcher de valider une page, ni s'afficher comme une erreur.
 */
async function journaliser(lignes: readonly NouveauPassage[]): Promise<void> {
  if (lignes.length === 0) return;
  try {
    const sb = await client();
    await sb.from('passages').insert(
      // La confiance n'est écrite que si on l'a dite : une base sans sa colonne continue d'accepter tout le reste.
      lignes.map((l) => ({ chapitre_id: l.chapitreId, jour: l.jour, sorte: l.sorte, note: l.note, minutes: l.minutes, score_pct: l.scorePct, vitesse: l.vitesse, rappel: l.rappel === null ? null : l.rappel.trim().slice(0, 2000) || null, ...(l.confiance === null || l.confiance === undefined ? {} : { confiance: l.confiance }) })),
    );
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENEMENT_PASSAGE));
  } catch {
    // Voir plus haut : rien à signaler.
  }
}

export interface NouveauPassage {
  chapitreId: string;
  jour: string;
  sorte: SortePassage;
  note: Note | null;
  minutes: number | null;
  scorePct: number | null;
  vitesse: number | null;
  rappel: string | null;
  /** « Je pense savoir… », dit avant de comparer : 0 à 3. */
  confiance?: number | null;
}

export async function chargerCours(): Promise<DonneesCours> {
  const sb = await client();
  const [c, h, n, r, j, k, q] = await Promise.all([
    toutLire<LigneCours>((de, a) => sb.from('cours').select('*').order('ordre').order('cree_le').order('id').range(de, a)),
    toutLire<LigneChapitre>((de, a) => sb.from('chapitres').select('*').order('cours_id').order('ordre').order('id').range(de, a)),
    toutLire<LigneNote>((de, a) => sb.from('notes_chapitres').select('*').order('cree_le').order('id').range(de, a)),
    // « * » : la colonne de l'adresse du flux n'existe qu'après la migration de l'emploi du temps, et son absence ne doit rien casser.
    sb.from('reglages_cours').select('*').maybeSingle<{ disponibilites: unknown; agenda_url?: string | null }>(),
    lirePassages(sb),
    lireCarnet(sb),
    lirePratiques(sb),
  ]);
  echec(r);
  return { cours: c.map(versCours), chapitres: h.map(versChapitre), notes: n.map(versNote), disponibilites: disponibilitesValides(r.data?.disponibilites), agendaLien: lienValide(r.data?.agenda_url ?? ''), passages: j.passages, journal: j.journal, erreurs: k.erreurs, cartes: k.cartes, carnet: k.carnet, pratiques: q.pratiques, pratique: q.pratique };
}

export interface ChampsCours {
  titre: string;
  couleur: string;
  partiel: string | null;
  lien: string | null;
  ordre: number;
  /** Les mots qui rattachent les créneaux de l'emploi du temps à ce cours. */
  motifs?: string;
  /** Un cours en pause n'est plus au calendrier ; il reste dans la liste. */
  enPause?: boolean;
  /** Minutes minimum par jour sur l'artefact d'erreurs ; null pour retirer la pratique quotidienne. */
  pratiqueMin?: number | null;
  /** Minutes d'une séance de révision libre ; null pour les retirer. */
  revisionLibreMin?: number | null;
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
  const { enPause, pratiqueMin, revisionLibreMin, ...autres } = champs;
  // Les colonnes s'écrivent en_pause et pratique_min : on ne laisse pas passer le nom de l'objet tel quel.
  const ligne: Record<string, unknown> = { ...autres };
  if (enPause !== undefined) ligne.en_pause = enPause;
  if (pratiqueMin !== undefined) ligne.pratique_min = pratiqueMin === null ? null : pratiqueMinValide(pratiqueMin);
  if (revisionLibreMin !== undefined) ligne.revision_libre_min = revisionLibreMin === null ? null : revisionLibreMinValide(revisionLibreMin);
  echec(await sb.from('cours').update(ligne).eq('id', id));
}

export async function supprimerCours(id: string): Promise<void> {
  const sb = await client();
  echec(await sb.from('cours').delete().eq('id', id));
}

export async function ajouterChapitres(coursId: string, lignes: { titre: string; dureeMin: number }[], ordreDepart: number): Promise<void> {
  const sb = await client();
  echec(await sb.from('chapitres').insert(lignes.map((l, i) => ({ cours_id: coursId, titre: l.titre, duree_min: dureeValide(l.dureeMin), ordre: ordreDepart + i }))));
}

export async function modifierChapitre(id: string, champs: { titre?: string; dureeMin?: number; lien?: string | null; parCoeur?: boolean }): Promise<void> {
  const sb = await client();
  const l: Record<string, unknown> = {};
  if (champs.parCoeur !== undefined) l.par_coeur = champs.parCoeur;
  if (champs.titre !== undefined) l.titre = champs.titre;
  if (champs.dureeMin !== undefined) l.duree_min = dureeValide(champs.dureeMin);
  if (champs.lien !== undefined) l.lien = champs.lien;
  echec(await sb.from('chapitres').update(l).eq('id', id));
}

/** Toutes les pages d'un cours à savoir mot pour mot (ou plus aucune) : un dialogue, un cours de formules. */
export async function marquerParCoeurCours(coursId: string, parCoeur: boolean): Promise<void> {
  const sb = await client();
  echec(await sb.from('chapitres').update({ par_coeur: parCoeur }).eq('cours_id', coursId));
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
export interface OptionsNote {
  /** Ce qu'on a fait : une révision (par défaut), ou un rappel, ou un examen blanc. */
  sorte?: SortePassage;
  /** Avant l'échéance : réussi, le passage ne fait pas monter le cran (voir `apresRappelAnticipe`). */
  anticipe?: boolean;
  scorePct?: number | null;
  /** Ce qu'on a écrit de tête avant d'ouvrir la fiche. */
  rappel?: string | null;
  minutes?: number | null;
  /** « Je pense savoir… » dit avant de comparer : 0 à 3. */
  confiance?: number | null;
  /** Une erreur à garder dans le carnet : le texte, et la page (par défaut, celle qu'on note). */
  erreur?: { texte: string; chapitreId?: string } | null;
}

export async function noterChapitre(id: string, note: Note, jour: string, options: OptionsNote = {}): Promise<void> {
  const sb = await client();
  // « * » : la colonne « mot pour mot » n'existe qu'après sa migration, et son absence ne doit pas empêcher de noter.
  const lu = await sb.from('chapitres').select('*').eq('id', id).maybeSingle<{ niveau: number; derniere_revision: string | null; prochaine_revision: string | null; par_coeur?: boolean | null }>();
  echec(lu);
  if (!lu.data) throw new Error('Ce chapitre n’existe plus.');
  const avant = niveauValide(lu.data.niveau);
  const etat = { niveau: avant, derniere: lu.data.derniere_revision, prochaine: lu.data.prochaine_revision };
  const apres = (options.anticipe ? apresRappelAnticipe : apresRevision)(etat, note, jour, lu.data.par_coeur === true);
  const r = await sb
    .from('chapitres')
    .update({ niveau: apres.niveau, derniere_revision: apres.derniere, prochaine_revision: apres.prochaine })
    .eq('id', id)
    .eq('niveau', avant)
    .select('id');
  echec(r);
  if (!r.data?.length) throw new Error('Ce chapitre vient d’être noté depuis un autre appareil : recharge pour voir où il en est.');
  // Une page jamais lue qu'on « note » comme une révision est découverte : la note n'y change rien, et le journal le dit.
  // Un examen blanc ou un rappel garde sa sorte : c'est elle qui empêche d'en proposer un autre le même jour.
  const sorte = options.sorte ?? 'revision';
  const decouverte = avant < 1 && sorte === 'revision';
  await journaliser([{ chapitreId: id, jour, sorte: decouverte ? 'lecture' : sorte, note: decouverte ? null : note, minutes: options.minutes ?? null, scorePct: options.scorePct ?? null, vitesse: null, rappel: options.rappel ?? null, confiance: options.confiance ?? null }]);
}

/**
 * Note d'un coup toutes les pages d'une séance de révision. Chaque page est notée pour elle-même et gardée par
 * son niveau lu (voir `noterChapitre`) : si l'une échoue, les autres sont quand même notées, et le calendrier,
 * recalculé depuis la base, ne repropose que celles qui restent à faire.
 */
export async function noterChapitres(ids: readonly string[], note: Note, jour: string, options: OptionsNote = {}): Promise<void> {
  const { erreur, ...pourLesPages } = options;
  const resultats = await Promise.allSettled(ids.map((id) => noterChapitre(id, note, jour, pourLesPages)));
  const echec = resultats.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (echec) throw echec.reason instanceof Error ? echec.reason : new Error(String(echec.reason));
  // Le carnet est un plus, comme le journal : une erreur qui ne s'écrit pas n'empêche pas d'avoir noté la page.
  const chapitreId = erreur?.chapitreId ?? (ids.length === 1 ? ids[0] : undefined);
  if (erreur && chapitreId) await ajouterErreur(chapitreId, erreur.texte, jour).catch(() => undefined);
}

/**
 * Marque lues les pages d'une séance de lecture. Sans note : on ne juge pas ce qu'on retient avant d'avoir
 * essayé de s'en souvenir (voir `apresDecouverte`). Gardé par « pas encore lu » : une page déjà validée depuis
 * un autre appareil n'est pas remise à son premier cran.
 */
async function marquerLues(ids: readonly string[], jour: string): Promise<string[]> {
  if (ids.length === 0) return [];
  const sb = await client();
  const apres = apresDecouverte(jour);
  const r = await sb
    .from('chapitres')
    .update({ niveau: apres.niveau, derniere_revision: apres.derniere, prochaine_revision: apres.prochaine })
    .in('id', [...ids])
    .eq('niveau', 0)
    .select('id');
  echec(r);
  if (!r.data?.length) throw new Error('Ces pages sont déjà validées (depuis un autre appareil ?) : recharge pour voir où elles en sont.');
  return r.data.map((x: { id: string }) => x.id);
}

export async function validerLecture(ids: readonly string[], jour: string): Promise<void> {
  const faites = await marquerLues(ids, jour);
  await journaliser(faites.map((id) => ({ chapitreId: id, jour, sorte: 'lecture' as const, note: null, minutes: null, scorePct: null, vitesse: null, rappel: null })));
}

/**
 * Une relecture sans note : on retient seulement le jour, pour que la prochaine relecture fasse le tour des
 * autres pages. Le niveau et la prochaine révision ne bougent pas — seul un passage noté fait avancer le cycle.
 */
export async function marquerRelu(ids: readonly string[], jour: string): Promise<void> {
  if (ids.length === 0) return;
  const sb = await client();
  const r = await sb.from('chapitres').update({ derniere_revision: jour }).in('id', [...ids]).gte('niveau', 1).select('id');
  echec(r);
  await journaliser((r.data ?? []).map((x: { id: string }) => ({ chapitreId: x.id, jour, sorte: 'relecture' as const, note: null, minutes: null, scorePct: null, vitesse: null, rappel: null })));
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

/**
 * Change la vitesse enregistrée à partir de celle qui est LUE en base à l'instant, pas de celle de l'écran :
 * deux appareils qui la précisent l'un après l'autre se cumulent au lieu de s'écraser. Les autres réglages
 * (temps par jour, jours sans étude…) sont réécrits tels qu'ils sont en base. Rien n'est écrit si la vitesse ne bouge pas.
 */
export async function ajusterVitesse(userId: string, f: (vitesse: number) => number): Promise<number> {
  const sb = await client();
  const lu = await sb.from('reglages_cours').select('disponibilites').maybeSingle<{ disponibilites: unknown }>();
  echec(lu);
  const d = disponibilitesValides(lu.data?.disponibilites);
  const avant = vitesseValide(d.vitesse);
  const apres = vitesseValide(f(avant));
  if (apres !== avant) echec(await sb.from('reglages_cours').upsert({ user_id: userId, disponibilites: { ...d, vitesse: apres }, maj_le: new Date().toISOString() }));
  return apres;
}

/** Ce qui précise la vitesse : ce que tu en as ressenti, ou ce que le chrono a mesuré (`reelles` null : pas de mesure). */
export type MesureVitesse = { ressenti: Ressenti } | { reelles: number | null; prevues: number };

/**
 * Valide les pages lues ET précise ta vitesse. Les pages d'abord : si elles étaient déjà validées (autre
 * appareil), la vitesse ne bouge pas, une même lecture ne comptant qu'une fois.
 */
export interface RappelPremiere {
  /** Ce qu'on a écrit de tête à la fin de la première séance. */
  rappel: string | null;
  /** La note qu'on s'est donnée en comparant à la fiche. */
  note: Note;
  confiance: number | null;
  erreur?: { texte: string; chapitreId?: string } | null;
}

export async function validerLectureEtVitesse(userId: string, ids: readonly string[], jour: string, mesure: MesureVitesse, rappel: RappelPremiere | null = null): Promise<void> {
  const faites = await marquerLues(ids, jour);
  const vitesse = await ajusterVitesse(userId, (v) => ('ressenti' in mesure ? vitesseApresCoche(v, mesure.ressenti) : vitesseApresChrono(v, mesure.reelles, mesure.prevues)));
  // Le temps d'une seule page est connu quand le chrono a servi à elle seule ; pour un bloc, on ne le répartit pas.
  const minutes = faites.length === 1 && 'reelles' in mesure && mesure.reelles !== null && mesure.reelles > 0 ? Math.min(1440, Math.round(mesure.reelles)) : null;
  await journaliser(faites.map((id) => ({ chapitreId: id, jour, sorte: 'lecture' as const, note: rappel?.note ?? null, minutes, scorePct: null, vitesse, rappel: rappel?.rappel ?? null, confiance: rappel?.confiance ?? null })));
  const chapitreId = rappel?.erreur?.chapitreId ?? (faites.length === 1 ? faites[0] : undefined);
  if (rappel?.erreur && chapitreId) await ajouterErreur(chapitreId, rappel.erreur.texte, jour).catch(() => undefined);
}

/**
 * Valide un examen blanc : le temps passé et, si on le donne, le score. Le score fixe la note de la page (voir
 * `noteDepuisPct`), avec la règle d'un passage avant l'échéance : un bon score ne fait pas monter le cran. Sans
 * score, on retient seulement que la page a été refaite aujourd'hui.
 */
export async function validerExamen(chapitreId: string, jour: string, mesure: { minutes: number | null; scorePct: number | null }): Promise<void> {
  const minutes = mesure.minutes !== null && mesure.minutes > 0 ? Math.min(1440, Math.round(mesure.minutes)) : null;
  if (mesure.scorePct !== null) return noterChapitre(chapitreId, noteDepuisPct(mesure.scorePct), jour, { sorte: 'examen', anticipe: true, scorePct: mesure.scorePct, minutes });
  const sb = await client();
  echec(await sb.from('chapitres').update({ derniere_revision: jour }).eq('id', chapitreId).gte('niveau', 1));
  await journaliser([{ chapitreId, jour, sorte: 'examen', note: null, minutes, scorePct: null, vitesse: null, rappel: null }]);
}

/** Note une erreur dans le carnet. Le texte est nettoyé et borné ; vide, rien n'est écrit. */
export async function ajouterErreur(chapitreId: string, texte: string, jour: string): Promise<void> {
  const t = texteErreur(texte);
  if (t === null) return;
  const sb = await client();
  echec(await sb.from('erreurs').insert({ chapitre_id: chapitreId, texte: t, jour }));
}

/** « Je sais » : l'erreur ne revient plus. */
export async function reglerErreur(id: string, jour: string): Promise<void> {
  const sb = await client();
  echec(await sb.from('erreurs').update({ reglee_le: jour }).eq('id', id));
}

/** « Encore flou » : elle revient dans quelques jours. */
export async function revoirErreur(id: string, jour: string): Promise<void> {
  const sb = await client();
  echec(await sb.from('erreurs').update({ revue_le: jour }).eq('id', id));
}

export async function supprimerErreur(id: string): Promise<void> {
  const sb = await client();
  echec(await sb.from('erreurs').delete().eq('id', id));
}

/** Ajoute des cartes à une page, à la suite de celles qu'elle a déjà. */
export async function ajouterCartes(chapitreId: string, cartes: readonly { question: string; reponse: string }[], ordreDepart: number): Promise<void> {
  if (cartes.length === 0) return;
  const sb = await client();
  echec(await sb.from('cartes').insert(cartes.map((c, i) => ({ chapitre_id: chapitreId, question: c.question, reponse: c.reponse, ordre: ordreDepart + i }))));
}

export async function supprimerCarte(id: string): Promise<void> {
  const sb = await client();
  echec(await sb.from('cartes').delete().eq('id', id));
}

/**
 * Tous les passages, en version légère (jour, sorte, note) : les points d'apprentissage se comptent depuis le premier
 * jour, pas sur les quatre derniers mois du journal — sinon le solde du village baisserait à mesure que le temps passe.
 */
export async function chargerPassagesLegers(): Promise<PassageLeger[]> {
  const sb = await client();
  try {
    const lignes = await toutLire<{ jour: string; sorte: string; note: string | null }>((de, a) => sb.from('passages').select('jour, sorte, note').order('jour').order('id').range(de, a));
    return lignes.filter((l) => estJour(l.jour)).map((l) => ({ jour: l.jour, sorte: l.sorte, note: l.note === 'a-revoir' || l.note === 'difficile' || l.note === 'bien' || l.note === 'facile' ? l.note : null }));
  } catch (e) {
    // Le journal n'existe pas encore : pas de points d'apprentissage, et rien d'autre ne change.
    if (e instanceof Error && e.message === MESSAGE_MIGRATION) return [];
    throw e;
  }
}

/** Déclare des minutes de pratique faites hors chrono (« j'ai fait mes 5 min sur l'artefact »). */
export async function ajouterPratique(coursId: string, minutes: number, jour: string, sorte: SortePratique = 'erreurs'): Promise<void> {
  const sb = await client();
  const m = Math.round(minutes);
  if (!estJour(jour) || !Number.isFinite(m) || m < 1 || m > PRATIQUE_DECLAREE_MAX) throw new Error(`Les minutes déclarées vont de 1 à ${PRATIQUE_DECLAREE_MAX}.`);
  // La sorte n'est écrite que si elle n'est pas celle par défaut : une base sans sa colonne continue d'accepter les minutes d'erreurs.
  echec(await sb.from('pratiques').insert({ cours_id: coursId, jour, minutes: m, ...(sorte === 'erreurs' ? {} : { sorte }) }));
}

/** Retire une déclaration (erreur de saisie). */
export async function supprimerPratique(id: string): Promise<void> {
  const sb = await client();
  echec(await sb.from('pratiques').delete().eq('id', id));
}

/** Prévient quand un passage est écrit ailleurs (autre appareil, autre onglet) : les points d'apprentissage se recalculent. */
export function ecouterPassages(rappel: () => void): () => void {
  let fini = false;
  let retirer: (() => void) | null = null;
  void client().then((sb) => {
    if (fini) return;
    const canal = sb.channel(`hameau-passages-${Math.random().toString(36).slice(2, 8)}`).on('postgres_changes', { event: '*', schema: 'public', table: 'passages' }, rappel).subscribe();
    retirer = () => void sb.removeChannel(canal);
  });
  return () => {
    fini = true;
    retirer?.();
  };
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passages' }, rappel)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'erreurs' }, rappel)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartes' }, rappel)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pratiques' }, rappel)
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
      cours: d.cours.map((c) => ({ ...c, motifs: typeof c.motifs === 'string' ? c.motifs : '', enPause: c.enPause === true, pratiqueMin: pratiqueMinValide(c.pratiqueMin), revisionLibreMin: revisionLibreMinValide(c.revisionLibreMin) })),
      chapitres: d.chapitres.map((c) => ({ ...c, parCoeur: c.parCoeur === true })),
      notes: d.notes,
      disponibilites: disponibilitesValides(d.disponibilites),
      agendaLien: lienValide(typeof d.agendaLien === 'string' ? d.agendaLien : ''),
      // Un cache écrit avant le journal n'en a pas : il se remplira au premier chargement.
      passages: Array.isArray(d.passages) ? d.passages.map(passageValide).filter((p): p is Passage => p !== null) : [],
      journal: d.journal === true,
      erreurs: Array.isArray(d.erreurs) ? d.erreurs.map(erreurValide).filter((x): x is Erreur => x !== null) : [],
      cartes: Array.isArray(d.cartes) ? d.cartes.map(carteValide).filter((x): x is Carte => x !== null) : [],
      carnet: d.carnet === true,
      pratiques: Array.isArray(d.pratiques) ? d.pratiques.map(pratiqueValide).filter((x): x is Pratique => x !== null) : [],
      pratique: d.pratique === true,
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

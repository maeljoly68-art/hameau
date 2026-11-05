import type { SupabaseClient } from '@supabase/supabase-js';
import { traduireErreurAuth } from '../core/recuperation.ts';
import { differences, SOURCE, versSeances, type CocheSillage, type HabitudeSillage, type SeanceSillage, type TacheSillage } from '../core/sillage.ts';
import type { Session } from '../core/types.ts';
import { SILLAGE } from './config.ts';

/*
 * Le lien avec Sillage vit sur l'appareil, comme la connexion qu'il suppose :
 * chaque appareil se connecte une fois à son compte Sillage. Stocker ce lien
 * dans la base de Hameau n'aurait rien partagé — la connexion Sillage, elle,
 * ne peut pas voyager d'un appareil à l'autre.
 */
const CLE_LIEN = 'hameau.sillage.lien';
const CLE_SYNCHRO = 'hameau.sillage.synchro';

export interface LienSillage {
  profilId: string;
  nom: string;
}

export interface EtatSynchro {
  quand: string;
  ecrites: number;
  supprimees: number;
}

function lire<T>(cle: string): T | null {
  try {
    const v = localStorage.getItem(cle);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function ecrire(cle: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, JSON.stringify(v));
  } catch {
    // Stockage bloqué : le lien ne survivra pas au rechargement, rien de plus.
  }
}

export const lienSillage = () => lire<LienSillage>(CLE_LIEN);
export const derniereSynchro = () => lire<EtatSynchro>(CLE_SYNCHRO);

let promesse: Promise<SupabaseClient> | null = null;

/**
 * Client Sillage, chargé à la demande et rangé sous sa propre clé : sans elle,
 * sa connexion et celle de Hameau se partageraient le même tiroir du
 * navigateur, et se déconnecter de l'une déconnecterait l'autre.
 */
function client(): Promise<SupabaseClient> {
  promesse ??= import('@supabase/supabase-js').then(({ createClient }) =>
    // « detectSessionInUrl » coupé : la connexion à Sillage se fait par mot de
    // passe seulement, et ce client ne doit jamais avaler le jeton d'un lien
    // destiné à Hameau (mot de passe oublié) qui se trouverait dans l'adresse.
    createClient(SILLAGE.url, SILLAGE.cle, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'hameau.sillage.auth' } }),
  );
  return promesse;
}

function echec(r: { error: { message: string } | null }): void {
  if (r.error) throw new Error(r.error.message);
}

/** Les messages d'erreur de Supabase arrivent en anglais. */
function traduire(m: string): string {
  if (/invalid login credentials/i.test(m)) return 'Email ou mot de passe Sillage incorrect.';
  if (/email not confirmed/i.test(m)) return 'Adresse pas encore confirmée dans Sillage.';
  if (/jwt|token|session/i.test(m)) return 'La connexion à Sillage a expiré : reconnecte-toi.';
  return m;
}

/** Se connecte à Sillage et rend les profils du compte (souvent un seul). */
export async function connecter(email: string, motDePasse: string): Promise<LienSillage[]> {
  const sb = await client();
  const r = await sb.auth.signInWithPassword({ email, password: motDePasse });
  if (r.error) throw new Error(traduire(r.error.message));
  const p = await sb.from('profiles').select('id, username').order('created_at');
  echec(p);
  const profils = (p.data ?? []).map((x) => ({ profilId: x.id as string, nom: (x.username as string | null) || 'Profil' }));
  if (profils.length === 1) choisirProfil(profils[0]);
  return profils;
}

/**
 * Demande à Sillage d'envoyer un lien pour choisir un mot de passe. Le lien
 * ouvre SILLAGE, pas Hameau : c'est sa page « reset-password » qui reçoit le
 * nouveau mot de passe, avec les règles de Sillage. Utile surtout à qui se
 * connecte à Sillage avec Discord ou Google, et n'y a donc jamais eu de mot
 * de passe : sans lui, Hameau ne peut pas s'y relier.
 */
export async function demanderLienMotDePasse(email: string): Promise<void> {
  const sb = await client();
  const r = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${SILLAGE.app}/reset-password` });
  if (r.error) throw new Error(traduireErreurAuth(r.error.message, r.error.code));
}

export function choisirProfil(l: LienSillage) {
  ecrire(CLE_LIEN, l);
}

export async function delier() {
  ecrire(CLE_LIEN, null);
  ecrire(CLE_SYNCHRO, null);
  await (await client()).auth.signOut();
}

export interface DonneesSillage {
  habitudes: HabitudeSillage[];
  coches: CocheSillage[];
  taches: TacheSillage[];
}

/**
 * Habitudes, coches de la semaine et tâches. Les tâches faites ne sont
 * reprises que depuis la veille : assez pour annuler un « fait » posé par
 * erreur, sans traîner tout l'historique.
 */
export async function charger(profilId: string, lundi: string, hier: string): Promise<DonneesSillage> {
  const sb = await client();
  const [h, c, t] = await Promise.all([
    sb.from('habits').select('id, title, kind, weekdays, times_per_week, started_on, archived_at, position').eq('profile_id', profilId).is('archived_at', null),
    sb.from('habit_checks').select('habit_id, day').eq('profile_id', profilId).gte('day', lundi),
    sb
      .from('tasks')
      .select('id, title, notes, importance, due_on, done_at, estimate_min')
      .eq('profile_id', profilId)
      // La date seule, sans heure : les « : » d'une heure devraient être
      // mis entre guillemets dans un filtre « or », sinon PostgREST le refuse.
      .or(`done_at.is.null,done_at.gte.${hier}`),
  ]);
  for (const r of [h, c, t]) if (r.error) throw new Error(traduire(r.error.message));
  return { habitudes: (h.data ?? []) as HabitudeSillage[], coches: (c.data ?? []) as CocheSillage[], taches: (t.data ?? []) as TacheSillage[] };
}

export async function cocher(profilId: string, habitId: string, jour: string, coche: boolean) {
  const sb = await client();
  if (coche) {
    // La base refuse une deuxième coche le même jour : un double toucher
    // ne doit pas finir en erreur, d'où « ignorer les doublons ».
    echec(await sb.from('habit_checks').upsert({ profile_id: profilId, habit_id: habitId, day: jour }, { onConflict: 'habit_id,day', ignoreDuplicates: true }));
  } else {
    echec(await sb.from('habit_checks').delete().eq('habit_id', habitId).eq('day', jour));
  }
}

export async function ajouterTache(profilId: string, t: { titre: string; importance: number; echeance: string | null; estimation: number | null }) {
  const sb = await client();
  echec(
    await sb.from('tasks').insert({
      profile_id: profilId,
      title: t.titre,
      importance: t.importance,
      // Une chaîne vide n'est pas une date : la base rejetterait la ligne.
      due_on: t.echeance || null,
      estimate_min: t.estimation !== null && t.estimation > 0 ? Math.round(t.estimation) : null,
    }),
  );
}

export async function marquerTache(id: string, faite: boolean) {
  const sb = await client();
  echec(await sb.from('tasks').update({ done_at: faite ? new Date().toISOString() : null }).eq('id', id));
}

/**
 * Envoie le temps de travail à Sillage, dans « focus_externe », source
 * « hameau ». Par DIFFÉRENCES : on lit ce que Sillage a déjà, et on n'écrit
 * que le nouveau ou le modifié, puis on retire ce qui a disparu de Hameau.
 * Un simple « ajouter sans écraser » laisserait dans Sillage une session
 * corrigée ou supprimée ici, et ses stats mentiraient en silence.
 */
export async function synchroniser(profilId: string, sessions: readonly Session[]): Promise<EtatSynchro> {
  const sb = await client();
  // Par pages : Supabase plafonne une réponse à 1 000 lignes, et une lecture
  // tronquée ferait croire absentes — donc à renvoyer — les séances au-delà.
  const distantes: SeanceSillage[] = [];
  for (let page = 0; ; page++) {
    const r = await sb
      .from('focus_externe')
      .select('external_id, started_at, ended_at, minutes, objet, note, fin_raison, xp')
      .eq('profile_id', profilId)
      .eq('source', SOURCE)
      .order('external_id')
      .range(page * 1000, page * 1000 + 999);
    if (r.error) throw new Error(traduire(r.error.message));
    distantes.push(...((r.data ?? []) as SeanceSillage[]));
    if ((r.data ?? []).length < 1000) break;
  }
  const { aEcrire, aSupprimer } = differences(versSeances(sessions), distantes);
  for (let i = 0; i < aEcrire.length; i += 500) {
    const lot = aEcrire.slice(i, i + 500).map((s) => ({ ...s, profile_id: profilId, source: SOURCE }));
    echec(await sb.from('focus_externe').upsert(lot, { onConflict: 'profile_id,source,external_id' }));
  }
  for (let i = 0; i < aSupprimer.length; i += 100) {
    echec(await sb.from('focus_externe').delete().eq('profile_id', profilId).eq('source', SOURCE).in('external_id', aSupprimer.slice(i, i + 100)));
  }
  const etat = { quand: new Date().toISOString(), ecrites: aEcrire.length, supprimees: aSupprimer.length };
  ecrire(CLE_SYNCHRO, etat);
  return etat;
}

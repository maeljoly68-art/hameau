// Le rappel quotidien : envoie les notifications push que la base dit dues (voir notifications_a_envoyer : rappel du jour et relance du soir).
//
// Quatre actions, toutes en POST avec un corps JSON { action } :
//   cle-publique  (ouverte)          la clé publique VAPID, que le navigateur donne pour s'abonner ; créée au premier appel
//   cron          (secret de la base) envoie les rappels et relances dus à cette heure ; appelée tous les quarts d'heure par pg_cron
//   test          (compte connecté)  envoie une notification de test à SES appareils
//   essai         (secret de la base) envoie un message à un abonnement donné : sert à vérifier la chaîne d'envoi de bout en bout
//
// Les clés VAPID et le secret de l'appel vivent dans le coffre de la base (Vault), lus par des fonctions réservées
// au rôle de service : rien de secret n'est dans ce fichier, ni dans les variables du navigateur.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SUJET = 'https://github.com/maeljoly68-art/hameau';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const base64url = (octets: Uint8Array) => btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const depuisBase64url = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

interface Cles { publique: string | null; privee: string | null; cron: string | null }

async function lireCles(): Promise<Cles> {
  const r = await admin.rpc('cles_push');
  if (r.error) throw new Error(`cles_push : ${r.error.message}`);
  const l = (Array.isArray(r.data) ? r.data[0] : r.data) as Cles | null;
  return l ?? { publique: null, privee: null, cron: null };
}

/** Les clés VAPID : lues dans le coffre, ou créées au premier besoin (la clé privée ne quitte jamais la base et cette fonction). */
async function cles(): Promise<{ publique: string; privee: string; cron: string | null }> {
  let c = await lireCles();
  if (!c.publique || !c.privee) {
    const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', paire.privateKey);
    const publique = new Uint8Array(65);
    publique[0] = 4;
    publique.set(depuisBase64url(jwk.x!), 1);
    publique.set(depuisBase64url(jwk.y!), 33);
    const e = await admin.rpc('cles_push_enregistrer', { p_publique: base64url(publique), p_privee: jwk.d! });
    if (e.error) throw new Error(`cles_push_enregistrer : ${e.error.message}`);
    c = await lireCles(); // deux appels en même temps : le premier gagne, les deux relisent la même paire
  }
  if (!c.publique || !c.privee) throw new Error('clés VAPID absentes');
  return { publique: c.publique, privee: c.privee, cron: c.cron };
}

const egal = (a: string, b: string) => {
  // Comparaison à temps constant : le secret ne se devine pas à la durée de la réponse.
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

interface Abonnement { endpoint: string; p256dh: string; auth: string }
/** `url` : où le clic sur la notification ramène dans l'application (voir public/sw.js). */
interface Charge { titre: string; corps: string; url?: string }

async function envoyer(a: Abonnement, charge: Charge, k: { publique: string; privee: string }): Promise<{ ok: true } | { ok: false; statut: number | null; message: string }> {
  try {
    webpush.setVapidDetails(SUJET, k.publique, k.privee);
    await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify({ titre: charge.titre, corps: charge.corps, url: charge.url ?? './' }), { TTL: 6 * 3600, urgency: 'normal' });
    return { ok: true };
  } catch (e) {
    const err = e as { statusCode?: number; message?: string };
    return { ok: false, statut: typeof err.statusCode === 'number' ? err.statusCode : null, message: String(err.message ?? e).slice(0, 200) };
  }
}

/** Un abonnement refusé en 404 ou 410 n'existe plus (appli désinstallée, permission retirée) : on l'oublie. */
async function oublier(endpoint: string) {
  await admin.from('abonnements_push').delete().eq('endpoint', endpoint);
}

async function rappelsDuMoment() {
  const k = await cles();
  const r = await admin.rpc('notifications_a_envoyer');
  if (r.error) throw new Error(`notifications_a_envoyer : ${r.error.message}`);
  const lignes = (r.data ?? []) as { user_id: string; endpoint: string; p256dh: string; auth: string; titre: string; corps: string; jour: string; genre: 'rappel' | 'relance' }[];
  const reussis = new Map<string, { user: string; jour: string; genre: string }>();
  let envoyes = 0;
  let oublies = 0;
  const echecs: { statut: number | null; message: string }[] = [];
  for (const l of lignes) {
    // Un clic sur le rappel ou la relance ouvre l'onglet Cours : c'est là que se trouve ce qui attend.
    const res = await envoyer(l, { titre: l.titre, corps: l.corps, url: './?onglet=cours' }, k);
    if (res.ok) {
      envoyes++;
      reussis.set(`${l.user_id}|${l.genre}`, { user: l.user_id, jour: l.jour, genre: l.genre });
    } else if (res.statut === 404 || res.statut === 410) {
      oublies++;
      await oublier(l.endpoint);
    } else echecs.push({ statut: res.statut, message: res.message });
  }
  // Un seul rappel et une seule relance par jour : marqués seulement s'ils sont partis sur au moins un appareil (sinon, ils seront retentés au quart d'heure suivant).
  for (const { user, jour, genre } of reussis.values()) await admin.rpc('notifications_marquer', { p_user: user, p_jour: jour, p_genre: genre });
  return { dus: lignes.length, envoyes, oublies, echecs };
}

async function testDe(userId: string) {
  const k = await cles();
  const r = await admin.from('abonnements_push').select('endpoint, p256dh, auth').eq('user_id', userId);
  if (r.error) throw new Error(r.error.message);
  const liste = (r.data ?? []) as Abonnement[];
  if (liste.length === 0) return { envoyes: 0, appareils: 0, echecs: [] as { statut: number | null; message: string }[], oublies: 0 };
  let envoyes = 0;
  let oublies = 0;
  const echecs: { statut: number | null; message: string }[] = [];
  for (const a of liste) {
    const res = await envoyer(a, { titre: 'Test du rappel', corps: 'Les rappels fonctionnent : tu recevras ton message du jour à l’heure choisie.', url: './?onglet=cours' }, k);
    if (res.ok) envoyes++;
    else if (res.statut === 404 || res.statut === 410) {
      oublies++;
      await oublier(a.endpoint);
    } else echecs.push({ statut: res.statut, message: res.message });
  }
  return { envoyes, appareils: liste.length, echecs, oublies };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ erreur: 'POST seulement' }, 405);
  let corps: { action?: string; abonnement?: Abonnement } = {};
  try {
    corps = await req.json();
  } catch {
    // corps vide : action inconnue ci-dessous
  }
  try {
    if (corps.action === 'cle-publique') return json({ publique: (await cles()).publique });

    if (corps.action === 'cron' || corps.action === 'essai') {
      const k = await cles();
      const fourni = req.headers.get('x-cron-secret') ?? '';
      if (!k.cron || !egal(fourni, k.cron)) return json({ erreur: 'non autorisé' }, 401);
      if (corps.action === 'cron') return json(await rappelsDuMoment());
      const a = corps.abonnement;
      if (!a?.endpoint || !a.p256dh || !a.auth) return json({ erreur: 'abonnement manquant' }, 400);
      return json(await envoyer(a, { titre: 'Essai', corps: 'Chaîne d’envoi vérifiée.' }, k));
    }

    if (corps.action === 'test') {
      const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const u = jeton ? await admin.auth.getUser(jeton) : null;
      if (!u || u.error || !u.data.user) return json({ erreur: 'connexion requise' }, 401);
      return json(await testDe(u.data.user.id));
    }
    return json({ erreur: 'action inconnue' }, 400);
  } catch (e) {
    return json({ erreur: e instanceof Error ? e.message : String(e) }, 500);
  }
});

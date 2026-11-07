// Le rappel quotidien sur le téléphone : l'abonnement de cet appareil et l'heure choisie. Le serveur fait le reste
// (supabase/functions/rappel-push, appelée par la base tous les quarts d'heure).
import { client } from './config.ts';
import { MESSAGE_MIGRATION } from './distant.ts';

export interface EtatPush {
  /** Ce navigateur sait-il recevoir un rappel poussé ? (iPhone : seulement l'app installée sur l'écran d'accueil.) */
  priseEnCharge: boolean;
  permission: NotificationPermission | 'indisponible';
  /** Cet appareil est-il abonné ? */
  abonne: boolean;
  actif: boolean;
  heure: number;
  /** La migration des notifications n'est pas encore passée sur la base. */
  tableAbsente: boolean;
}

export const HEURE_DEFAUT = 18;

export function priseEnChargePush(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** « AAAA » en base64url → octets, pour `applicationServerKey`. */
function enOctets(b64url: string): Uint8Array<ArrayBuffer> {
  const rempli = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const brut = atob(rempli);
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}

async function enregistrement(): Promise<ServiceWorkerRegistration | null> {
  if (!priseEnChargePush()) return null;
  // En développement le service worker n'est pas enregistré : `ready` n'y répondrait jamais.
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

async function idUtilisateur(): Promise<string> {
  const sb = await client();
  const s = await sb.auth.getSession();
  const id = s.data.session?.user.id;
  if (!id) throw new Error('Connecte-toi pour recevoir un rappel.');
  return id;
}

export async function lireEtatPush(): Promise<EtatPush> {
  const prise = priseEnChargePush();
  const permission = prise ? Notification.permission : 'indisponible';
  const reg = await enregistrement();
  const abonne = reg ? (await reg.pushManager.getSubscription()) !== null : false;
  const sb = await client();
  const r = await sb.from('notifications_reglage').select('actif, heure').maybeSingle<{ actif: boolean; heure: number }>();
  if (r.error) {
    if (r.error.code === 'PGRST205' || r.error.code === '42P01') return { priseEnCharge: prise, permission, abonne, actif: false, heure: HEURE_DEFAUT, tableAbsente: true };
    throw new Error(r.error.message);
  }
  return { priseEnCharge: prise, permission, abonne, actif: r.data?.actif === true, heure: r.data?.heure ?? HEURE_DEFAUT, tableAbsente: false };
}

function fuseauLocal(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
  } catch {
    return 'Europe/Paris';
  }
}

async function ecrireReglage(actif: boolean, heure: number): Promise<void> {
  const sb = await client();
  const r = await sb.from('notifications_reglage').upsert({ user_id: await idUtilisateur(), actif, heure, fuseau: fuseauLocal(), maj_le: new Date().toISOString() });
  if (r.error) throw new Error(r.error.code === 'PGRST205' || r.error.code === '42P01' ? MESSAGE_MIGRATION : r.error.message);
}

/**
 * Active le rappel : demande la permission (à appeler depuis un clic : iOS l'exige), abonne cet appareil auprès du
 * service de notifications du navigateur, et écrit l'abonnement et l'heure dans le compte.
 */
export async function activerPush(heure: number): Promise<void> {
  const reg = await enregistrement();
  if (!reg) throw new Error('Ce navigateur ne sait pas recevoir de rappel. Sur iPhone : ajoute Hameau à l’écran d’accueil et ouvre-le depuis l’icône.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications refusées : autorise-les dans les réglages du navigateur ou de l’app, puis réessaie.');
  const sb = await client();
  const cle = await sb.functions.invoke<{ publique?: string }>('rappel-push', { body: { action: 'cle-publique' } });
  if (cle.error || !cle.data?.publique) throw new Error('Le serveur de rappels ne répond pas : réessaie dans un instant.');
  let abonnement = await reg.pushManager.getSubscription();
  if (!abonnement) abonnement = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: enOctets(cle.data.publique) });
  const j = abonnement.toJSON();
  const p256dh = j.keys?.p256dh;
  const auth = j.keys?.auth;
  if (!j.endpoint || !p256dh || !auth) throw new Error('Abonnement incomplet : réessaie.');
  const e = await sb.from('abonnements_push').upsert({ user_id: await idUtilisateur(), endpoint: j.endpoint, p256dh, auth }, { onConflict: 'user_id,endpoint' });
  if (e.error) throw new Error(e.error.code === 'PGRST205' || e.error.code === '42P01' ? MESSAGE_MIGRATION : e.error.message);
  await ecrireReglage(true, heure);
}

export async function changerHeurePush(heure: number): Promise<void> {
  await ecrireReglage(true, heure);
}

/** Retire cet appareil (et coupe le rappel pour le compte, qui n'a plus qu'à se réactiver). */
export async function desactiverPush(heure: number): Promise<void> {
  const reg = await enregistrement();
  const abonnement = reg ? await reg.pushManager.getSubscription() : null;
  const sb = await client();
  if (abonnement) {
    const r = await sb.from('abonnements_push').delete().eq('endpoint', abonnement.endpoint);
    if (r.error) throw new Error(r.error.message);
    await abonnement.unsubscribe();
  }
  await ecrireReglage(false, heure);
}

export interface ResultatTest {
  envoyes: number;
  appareils: number;
  oublies: number;
  echecs: { statut: number | null; message: string }[];
}

/** Une notification de test, tout de suite, sur tous les appareils abonnés du compte. */
export async function testerPush(): Promise<ResultatTest> {
  const sb = await client();
  const r = await sb.functions.invoke<ResultatTest>('rappel-push', { body: { action: 'test' } });
  if (r.error || !r.data) throw new Error('Le serveur de rappels ne répond pas : réessaie dans un instant.');
  return r.data;
}

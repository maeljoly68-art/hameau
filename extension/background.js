// Le service de l'extension : toutes les 30 secondes (et dès que Hameau le dit), il demande à la base s'il y a une
// session ouverte sur le compte de la personne ; si oui, il redirige les sites de la liste vers la page de blocage ;
// sinon, il retire les règles. Aucun état ne vit en mémoire : le service s'endort et se réveille quand Chrome le décide.
import { CLE_PUBLIQUE, URL_SUPABASE } from './config.js';
import { CONFIRMATION_DEFAUT, SITES_DE_TRAVAIL_DEFAUT, SITES_PAR_DEFAUT, ajouterPasse, compter, confirmationValide, doitConfirmer, etatDepuisSession, garderBlocage, lireSites, reglesBlocage, siteDe, urlBloquee } from './logique.js';

const ALARME = 'hameau-verifier';
/** On renouvelle le jeton un peu avant son expiration plutôt que d'essuyer un refus. */
const MARGE_JETON_S = 60;

const maintenant = () => Date.now();
const etatVide = { enCours: false, bloque: false, enPause: false, categorie: '', debut: null, sessionId: null, connecte: false, dernierSucces: null };

async function reglages() {
  const r = await chrome.storage.sync.get({ sites: SITES_PAR_DEFAUT, debloquerEnPause: false, confirmation: CONFIRMATION_DEFAUT, autorises: SITES_DE_TRAVAIL_DEFAUT });
  // Les listes sont relues à travers le même filtre que la saisie : une liste abîmée ne peut pas bloquer Hameau.
  const liste = (v) => lireSites(Array.isArray(v) ? v.join('\n') : '').sites;
  return { sites: liste(r.sites), debloquerEnPause: r.debloquerEnPause === true, confirmation: confirmationValide(r.confirmation), autorises: liste(r.autorises) };
}

/** Le jour de l'appareil, « AAAA-MM-JJ » : le décompte de la fenêtre se fait par jour. */
function jourLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function enteteBase(jeton) {
  return { apikey: CLE_PUBLIQUE, Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' };
}

/** Se connecte avec l'e-mail et le mot de passe du compte Hameau ; seul le jeton est gardé, jamais le mot de passe. */
async function seConnecter(email, motDePasse) {
  let r;
  try {
    r = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: CLE_PUBLIQUE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: motDePasse }) });
  } catch {
    return { ok: false, message: 'Pas de connexion à Hameau : réessaie.' };
  }
  if (r.status === 400 || r.status === 401) return { ok: false, message: 'E-mail ou mot de passe incorrect.' };
  if (!r.ok) return { ok: false, message: `Hameau a répondu ${r.status} : réessaie dans un moment.` };
  const j = await r.json();
  await chrome.storage.local.set({ compte: jetonDepuisReponse(j, email) });
  return { ok: true };
}

function jetonDepuisReponse(j, email) {
  const duree = Number(j.expires_in);
  return { email: j.user?.email ?? email, access_token: j.access_token, refresh_token: j.refresh_token, expire_le: Math.floor(maintenant() / 1000) + (Number.isFinite(duree) ? duree : 3600) };
}

async function seDeconnecter() {
  await appliquer(false, (await reglages()).sites);
  await chrome.storage.local.remove('compte');
  await chrome.storage.local.set({ etat: etatVide });
}

/** Renouvelle le jeton. null : refusé pour de bon (compte déconnecté ailleurs) ; 'reseau' : pas de réponse. */
async function renouveler(compte) {
  let r;
  try {
    r = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: CLE_PUBLIQUE, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: compte.refresh_token }) });
  } catch {
    return 'reseau';
  }
  if (r.status === 400 || r.status === 401) return null;
  if (!r.ok) return 'reseau';
  const neuf = jetonDepuisReponse(await r.json(), compte.email);
  await chrome.storage.local.set({ compte: neuf });
  return neuf;
}

/** La session ouverte du compte : { ok: true, ligne } (ligne : null s'il n'y en a pas) ou { ok: false, raison }. */
async function sessionOuverte(compte) {
  let c = compte;
  if (c.expire_le - Math.floor(maintenant() / 1000) < MARGE_JETON_S) {
    const n = await renouveler(c);
    if (n === null) return { ok: false, raison: 'deconnecte' };
    if (n === 'reseau') return { ok: false, raison: 'reseau' };
    c = n;
  }
  const demander = async (jeton) => fetch(`${URL_SUPABASE}/rest/v1/sessions?select=id,debut,categorie,pause_depuis,fin&fin=is.null&limit=1`, { headers: await enteteBase(jeton) });
  let r;
  try {
    r = await demander(c.access_token);
    if (r.status === 401) {
      const n = await renouveler(c);
      if (n === null) return { ok: false, raison: 'deconnecte' };
      if (n === 'reseau') return { ok: false, raison: 'reseau' };
      r = await demander(n.access_token);
    }
  } catch {
    return { ok: false, raison: 'reseau' };
  }
  if (!r.ok) return { ok: false, raison: 'reseau' };
  const lignes = await r.json();
  return { ok: true, ligne: Array.isArray(lignes) && lignes.length > 0 ? lignes[0] : null };
}

/** Pose ou retire les règles de redirection, et renvoie vers la page de blocage les onglets déjà ouverts sur ces sites. */
async function appliquer(bloque, sites) {
  const existantes = await chrome.declarativeNetRequest.getDynamicRules();
  const voulues = bloque ? reglesBlocage(sites, chrome.runtime.getURL('')) : [];
  // Chrome peut ajouter des valeurs par défaut aux règles qu'il rend : on compare ce qui les distingue, pas tout l'objet.
  const signature = (r) => `${(r.condition.requestDomains ?? []).join(',')}|${r.condition.regexFilter}|${r.action.redirect.regexSubstitution}`;
  const memes = existantes.length === voulues.length && existantes.every((e, i) => signature(e) === signature(voulues[i]));
  if (!memes) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existantes.map((r) => r.id), addRules: voulues });
  if (!bloque || sites.length === 0) return;
  const page = chrome.runtime.getURL('bloque.html');
  for (const onglet of await chrome.tabs.query({})) {
    if (!onglet.url || onglet.url.startsWith(page)) continue;
    if (urlBloquee(onglet.url, sites)) await chrome.tabs.update(onglet.id, { url: `${page}?u=${onglet.url}` }).catch(() => undefined);
  }
}

let enCours = null;

/** Une vérification à la fois : l'alarme, Hameau et la fenêtre peuvent la demander ensemble. */
export function verifier() {
  if (enCours) return enCours;
  enCours = (async () => {
    const { compte, etat: precedent } = await chrome.storage.local.get(['compte', 'etat']);
    const r = await reglages();
    if (!compte) {
      await appliquer(false, r.sites);
      await chrome.storage.local.set({ etat: etatVide });
      return { connecte: false };
    }
    const s = await sessionOuverte(compte);
    if (!s.ok && s.raison === 'deconnecte') {
      await chrome.storage.local.remove('compte');
      await appliquer(false, r.sites);
      await chrome.storage.local.set({ etat: etatVide });
      return { connecte: false };
    }
    let etat;
    if (s.ok) etat = { ...etatDepuisSession(s.ligne, { debloquerEnPause: r.debloquerEnPause }), connecte: true, dernierSucces: maintenant() };
    else {
      // Base injoignable : on garde l'état d'avant tant qu'il est assez récent (voir garderBlocage).
      const garde = garderBlocage(precedent, maintenant());
      etat = { ...(precedent ?? etatDepuisSession(null)), connecte: true, bloque: garde, dernierSucces: precedent?.dernierSucces ?? null };
    }
    // Les règles d'abord, l'état ensuite : la page de blocage qui voit « débloqué » repart aussitôt vers le site, et si
    // la règle y était encore, elle la renverrait ici en boucle.
    await appliquer(etat.bloque, r.sites);
    await chrome.storage.local.set({ etat });
    // Un laissez-passer vaut pour CE chrono : le suivant redemande.
    if (!etat.enCours) await chrome.storage.local.remove('passes');
    return etat;
  })().finally(() => {
    enCours = null;
  });
  return enCours;
}

/**
 * Un chrono tourne et la page va changer : « tu es sûr ? ». La page d'origine est celle de l'onglet (ou de l'onglet qui l'a
 * ouvert, pour un lien en nouvel onglet) : aller d'un onglet vide vers un site, c'est quitter son travail.
 */
async function surNavigation(tabId, destination) {
  // Tout se lit en même temps : chaque milliseconde compte pour que la question arrive avant que le site ne s'affiche.
  const [{ etat, passes }, r, onglet] = await Promise.all([chrome.storage.local.get(['etat', 'passes']), reglages(), chrome.tabs.get(tabId).catch(() => null)]);
  if (!etat?.enCours || !r.confirmation.active || !onglet) return;
  let actuelle = onglet.url || '';
  if (actuelle === '' && onglet.openerTabId != null) actuelle = (await chrome.tabs.get(onglet.openerTabId).catch(() => null))?.url || '';
  if (!doitConfirmer({ etat, destination, actuelle, autorises: r.autorises, bloques: r.sites, passes: passes ?? {}, maintenantMs: maintenant() })) return;
  await chrome.tabs.update(tabId, { url: `${chrome.runtime.getURL('confirmer.html')}?de=${encodeURIComponent(actuelle)}&u=${destination}` }).catch(() => undefined);
}

chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  if (d.frameId === 0) void surNavigation(d.tabId, d.url);
});

/** Une minute pour revenir à la page d'où l'on venait sans que le retour lui-même redemande « tu es sûr ? ». */
const RETOUR_MIN = 1;

/**
 * « Rester concentré » ou « Continuer quand même » : on le compte. Continuer donne un laissez-passer pour le site demandé ;
 * rester en donne un, très court, pour la page d'origine (`adresse`) : y retourner depuis la page de confirmation est un
 * changement de page comme un autre, et la question reviendrait sinon aussitôt.
 */
async function choisir(choix, adresse) {
  const r = await reglages();
  const stock = await chrome.storage.local.get(['compteurs', 'passes']);
  let hote = '';
  try {
    const u = new URL(adresse);
    if (u.protocol === 'http:' || u.protocol === 'https:') hote = u.hostname;
  } catch {
    // pas d'adresse : rien à autoriser
  }
  const passes = hote === '' ? stock.passes : ajouterPasse(stock.passes, siteDe(hote), choix === 'continuer' ? r.confirmation.passeMin : RETOUR_MIN, maintenant());
  if (choix === 'continuer' && hote === '') return { ok: false };
  await chrome.storage.local.set({ compteurs: compter(stock.compteurs, jourLocal(), choix), ...(passes ? { passes } : {}) });
  return { ok: true };
}

chrome.alarms.get(ALARME).then((a) => {
  if (!a) void chrome.alarms.create(ALARME, { periodInMinutes: 0.5 });
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARME) void verifier();
});
chrome.runtime.onInstalled.addListener(() => void verifier());
chrome.runtime.onStartup.addListener(() => void verifier());
// La liste ou l'option de pause changent : les règles se recalculent aussitôt.
chrome.storage.onChanged.addListener((changes, zone) => {
  if (zone === 'sync') void verifier();
});

chrome.runtime.onMessage.addListener((message, expediteur, repondre) => {
  // Seules les pages de l'extension et le relais sur Hameau écrivent ici ; rien d'autre ne peut ouvrir une session.
  if (expediteur.id !== chrome.runtime.id) return false;
  if (message?.type === 'verifier') void verifier().then(repondre);
  else if (message?.type === 'connexion') void seConnecter(String(message.email ?? '').trim(), String(message.motDePasse ?? '')).then(async (r) => repondre(r.ok ? { ...r, etat: await verifier() } : r));
  else if (message?.type === 'choix' && (message.choix === 'rester' || message.choix === 'continuer')) void choisir(message.choix, String(message.destination ?? '')).then(repondre);
  else if (message?.type === 'deconnexion') void seDeconnecter().then(() => repondre({ ok: true }));
  else return false;
  return true;
});

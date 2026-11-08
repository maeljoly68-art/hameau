import { ADRESSE_HAMEAU } from './config.js';
import { CONFIRMATION_DEFAUT, SITES_PAR_DEFAUT, SUIVI_DEFAUT, confirmationValide, formatChronoCourt, lireSites, parSite, secondesDeTravail, situation, suiviValide } from './logique.js';

const $ = (id) => document.getElementById(id);

/** Ce qu'on a lu en dernier : le chronomètre se met à jour chaque seconde sans relire le stockage. */
let etatCourant = null;

function montrer(vue) {
  const chrono = vue === 'chrono';
  $('v-chrono').hidden = !chrono;
  $('v-reglages').hidden = chrono;
  $('t-chrono').setAttribute('aria-selected', String(chrono));
  $('t-reglages').setAttribute('aria-selected', String(!chrono));
}

function majTemps() {
  const e = etatCourant;
  const enCours = Boolean(e?.enCours);
  const s = enCours ? secondesDeTravail(e, Date.now()) : null;
  $('temps').textContent = !enCours ? 'Aucun chrono' : s === null ? '—' : formatChronoCourt(s);
  $('temps').classList.toggle('repos', !enCours);
}

async function afficher() {
  const { compte, etat, compteurs, diag, suivi } = await chrome.storage.local.get(['compte', 'etat', 'compteurs', 'diag', 'suivi']);
  const reglage = await chrome.storage.sync.get({ sites: SITES_PAR_DEFAUT, confirmation: CONFIRMATION_DEFAUT, suivi: SUIVI_DEFAUT });
  const sites = lireSites(Array.isArray(reglage.sites) ? reglage.sites.join('\n') : '').sites;
  const connecte = Boolean(compte);
  $('connexion').hidden = connecte;
  $('onglets').hidden = !connecte;
  if (!connecte) {
    $('v-chrono').hidden = true;
    $('v-reglages').hidden = true;
    etatCourant = null;
    return;
  }
  if ($('v-chrono').hidden && $('v-reglages').hidden) montrer('chrono');
  etatCourant = etat ?? null;
  const sit = situation(etatCourant);
  $('carte').dataset.etat = sit.cle;
  $('puce').textContent = sit.puce;
  const categorie = etatCourant?.enCours ? String(etatCourant.categorie ?? '').trim() : '';
  $('categorie').hidden = categorie === '';
  $('categorie').textContent = categorie;
  const probleme = diag && (diag.erreur || diag.reussi === false);
  $('alerte').hidden = !probleme;
  $('alerte').textContent = probleme ? 'La base ne répond pas : l’état d’avant est gardé.' : '';
  majTemps();
  afficherSites(suivi, etatCourant, suiviValide(reglage.suivi).active);
  afficherReglages(sites, diag, compteurs, reglage.confirmation);
}

/** Les sites sur lesquels on a travaillé pendant le chrono en cours : le nom du site et le temps, avec une barre. */
function afficherSites(suivi, etat, active) {
  const liste = $('sites-travail');
  liste.replaceChildren();
  const vus = etat?.enCours && active && suivi ? parSite(suivi, 4) : [];
  liste.hidden = vus.length === 0;
  const plusLong = Math.max(1, ...vus.map((v) => v.secondes));
  for (const v of vus) {
    const li = document.createElement('li');
    const nom = document.createElement('span');
    nom.className = 'site-nom';
    nom.textContent = v.site;
    const barre = document.createElement('span');
    barre.className = 'barre';
    const rempli = document.createElement('span');
    rempli.style.width = `${Math.max(4, (v.secondes / plusLong) * 100)}%`;
    barre.append(rempli);
    const duree = document.createElement('strong');
    duree.textContent = v.secondes < 60 ? `${v.secondes} s` : `${Math.round(v.secondes / 60)} min`;
    li.append(nom, barre, duree);
    liste.append(li);
  }
}

/** L'onglet Paramètres : les sites bloqués, la déconnexion, et ce que l'extension a vu à sa dernière vérification. */
function afficherReglages(sites, diag, compteurs, confirmation) {
  const liste = $('liste-bloques');
  liste.replaceChildren();
  for (const s of sites) {
    const li = document.createElement('li');
    li.textContent = s;
    liste.append(li);
  }
  if (sites.length === 0) {
    const li = document.createElement('li');
    li.className = 'aucun';
    li.textContent = 'Aucun site';
    liste.append(li);
  }
  const d = new Date();
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const j = compteurs?.[jour] ?? { resistes: 0, continues: 0 };
  const bilan = confirmationValide(confirmation).active && j.resistes + j.continues > 0 ? ` · aujourd’hui : ${j.resistes} fois resté concentré, ${j.continues} fois continué` : '';
  $('diagnostic').textContent = `${diagnostic(diag)}${bilan}`;
}

/** Ce que l'extension a vu à sa dernière vérification : de quoi comprendre pourquoi elle bloque, ou pas. */
function diagnostic(diag) {
  if (!diag) return 'Pas encore de vérification.';
  const il = Math.max(0, Math.round((Date.now() - diag.verifieLe) / 1000));
  const quand = il < 90 ? `il y a ${il} s` : `il y a ${Math.round(il / 60)} min`;
  if (diag.erreur) return `Vérifié ${quand} : erreur (${diag.erreur}).`;
  if (diag.reussi === false) return `Vérifié ${quand} : la base n’a pas répondu.`;
  const n = diag.nbRegles ?? 0;
  const chrono = diag.session === true ? 'chrono ouvert' : diag.session === false ? 'aucun chrono ouvert' : '';
  return `Vérifié ${quand}${chrono ? ` · ${chrono}` : ''} · ${n} règle${n > 1 ? 's' : ''} active${n > 1 ? 's' : ''}`;
}

// Ouverte dans un onglet (à l'installation), la fenêtre prend toute la place.
if (location.search.includes('page=1')) document.body.classList.add('plein');
$('ouvrir').href = ADRESSE_HAMEAU;
$('t-chrono').addEventListener('click', () => montrer('chrono'));
$('t-reglages').addEventListener('click', () => montrer('reglages'));
$('reglages').addEventListener('click', () => void chrome.runtime.openOptionsPage());
$('verifier').addEventListener('click', async () => {
  $('verifier').disabled = true;
  await chrome.runtime.sendMessage({ type: 'verifier' });
  $('verifier').disabled = false;
  await afficher();
});
$('sortir').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'deconnexion' });
  await afficher();
});
$('connexion').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('erreur').textContent = '';
  $('entrer').disabled = true;
  const r = await chrome.runtime.sendMessage({ type: 'connexion', email: $('email').value, motDePasse: $('mdp').value });
  $('entrer').disabled = false;
  if (!r?.ok) $('erreur').textContent = r?.message ?? 'Connexion impossible.';
  else $('mdp').value = '';
  await afficher();
});
chrome.storage.onChanged.addListener(() => void afficher());
window.setInterval(majTemps, 1000);
void afficher();

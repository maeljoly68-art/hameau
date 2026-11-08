import { ADRESSE_HAMEAU } from './config.js';
import { CONFIRMATION_DEFAUT, SITES_PAR_DEFAUT, SUIVI_DEFAUT, confirmationValide, lireSites, parSite, phraseEtat, suiviValide } from './logique.js';

const $ = (id) => document.getElementById(id);

async function afficher() {
  const { compte, etat, compteurs, diag, suivi } = await chrome.storage.local.get(['compte', 'etat', 'compteurs', 'diag', 'suivi']);
  const reglage = await chrome.storage.sync.get({ sites: SITES_PAR_DEFAUT, confirmation: CONFIRMATION_DEFAUT, suivi: SUIVI_DEFAUT });
  const sites = lireSites(Array.isArray(reglage.sites) ? reglage.sites.join('\n') : '').sites;
  const connecte = Boolean(compte);
  $('connexion').hidden = connecte;
  $('compte').hidden = !connecte;
  if (!connecte) {
    $('titre').textContent = 'Pas connecté : rien n’est bloqué';
    $('detail').textContent = 'Sans compte, l’extension ne peut pas savoir quand ton chrono tourne. Connecte-toi ci-dessous avec le compte que tu utilises dans Hameau.';
    $('diagnostic').textContent = '';
    $('sites-travail').hidden = true;
    return;
  }
  $('adresse').textContent = compte.email;
  const p = phraseEtat(etat ?? null, sites, Date.now());
  $('titre').textContent = p.titre;
  $('detail').textContent = p.detail;
  $('etat').classList.toggle('bloque', Boolean(etat?.bloque));
  $('diagnostic').textContent = diagnostic(diag, etat);
  afficherSites(suivi, etat, suiviValide(reglage.suivi).active);
  // Ce que la confirmation a donné aujourd'hui : de quoi voir qu'elle sert.
  const d = new Date();
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const j = compteurs?.[jour] ?? { resistes: 0, continues: 0 };
  const active = confirmationValide(reglage.confirmation).active;
  $('bilan').textContent = !active ? 'La question « tu es sûr ? » est coupée (réglages).' : j.resistes + j.continues === 0 ? '' : `Aujourd’hui : ${j.resistes} fois resté concentré, ${j.continues} fois continué.`;
}

/** Les sites sur lesquels on a travaillé pendant le chrono en cours (le nom du site, jamais l'adresse). */
function afficherSites(suivi, etat, active) {
  const liste = $('sites-travail');
  liste.replaceChildren();
  const enCours = Boolean(etat?.enCours);
  const vus = enCours && active && suivi ? parSite(suivi, 4) : [];
  liste.hidden = vus.length === 0;
  for (const v of vus) {
    const li = document.createElement('li');
    const nom = document.createElement('span');
    nom.textContent = v.site;
    const duree = document.createElement('strong');
    duree.textContent = v.secondes < 60 ? `${v.secondes} s` : `${Math.round(v.secondes / 60)} min`;
    li.append(nom, duree);
    liste.append(li);
  }
}

/** Ce que l'extension a vu à sa dernière vérification : de quoi comprendre pourquoi elle bloque, ou pas. */
function diagnostic(diag, etat) {
  if (!diag) return 'Pas encore de vérification : clique sur « Vérifier maintenant ».';
  const il = Math.max(0, Math.round((Date.now() - diag.verifieLe) / 1000));
  const quand = il < 90 ? `il y a ${il} s` : `il y a ${Math.round(il / 60)} min`;
  if (diag.erreur) return `Dernière vérification ${quand} : erreur (${diag.erreur}).`;
  if (diag.reussi === false) return `Dernière vérification ${quand} : la base n’a pas répondu${etat?.bloque ? ' (le blocage d’avant est gardé)' : ''}.`;
  const sessions = diag.session === true ? 'un chrono est ouvert sur ce compte' : diag.session === false ? 'aucun chrono ouvert sur ce compte' : '';
  return `Dernière vérification ${quand} : ${sessions}${sessions ? ' · ' : ''}${diag.nbRegles ?? 0} règle${(diag.nbRegles ?? 0) > 1 ? 's' : ''} de blocage active${(diag.nbRegles ?? 0) > 1 ? 's' : ''}.`;
}

// Ouverte dans un onglet (à l'installation), la fenêtre prend toute la place.
if (location.search.includes('page=1')) document.body.classList.add('plein');
$('ouvrir').href = ADRESSE_HAMEAU;
$('reglages').addEventListener('click', (e) => {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
});
$('verifier').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'verifier' });
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
void afficher();

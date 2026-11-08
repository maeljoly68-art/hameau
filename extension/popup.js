import { ADRESSE_HAMEAU } from './config.js';
import { CONFIRMATION_DEFAUT, SITES_PAR_DEFAUT, confirmationValide, lireSites, phraseEtat } from './logique.js';

const $ = (id) => document.getElementById(id);

async function afficher() {
  const { compte, etat, compteurs } = await chrome.storage.local.get(['compte', 'etat', 'compteurs']);
  const reglage = await chrome.storage.sync.get({ sites: SITES_PAR_DEFAUT, confirmation: CONFIRMATION_DEFAUT });
  const sites = lireSites(Array.isArray(reglage.sites) ? reglage.sites.join('\n') : '').sites;
  const connecte = Boolean(compte);
  $('connexion').hidden = connecte;
  $('compte').hidden = !connecte;
  if (!connecte) {
    $('titre').textContent = 'Pas connecté';
    $('detail').textContent = 'Sans compte, l’extension ne peut pas savoir quand ton chrono tourne : rien n’est bloqué.';
    return;
  }
  $('adresse').textContent = compte.email;
  const p = phraseEtat(etat ?? null, sites, Date.now());
  $('titre').textContent = p.titre;
  $('detail').textContent = p.detail;
  $('etat').classList.toggle('bloque', Boolean(etat?.bloque));
  // Ce que la confirmation a donné aujourd'hui : de quoi voir qu'elle sert.
  const d = new Date();
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const j = compteurs?.[jour] ?? { resistes: 0, continues: 0 };
  const active = confirmationValide(reglage.confirmation).active;
  $('bilan').textContent = !active ? 'La question « tu es sûr ? » est coupée (réglages).' : j.resistes + j.continues === 0 ? '' : `Aujourd’hui : ${j.resistes} fois resté concentré, ${j.continues} fois continué.`;
}

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

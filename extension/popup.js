import { ADRESSE_HAMEAU } from './config.js';
import { CONFIRMATION_DEFAUT, SITES_PAR_DEFAUT, confirmationValide, lireSites, phraseEtat } from './logique.js';

const $ = (id) => document.getElementById(id);

async function afficher() {
  const { compte, etat, compteurs, diag } = await chrome.storage.local.get(['compte', 'etat', 'compteurs', 'diag']);
  const reglage = await chrome.storage.sync.get({ sites: SITES_PAR_DEFAUT, confirmation: CONFIRMATION_DEFAUT });
  const sites = lireSites(Array.isArray(reglage.sites) ? reglage.sites.join('\n') : '').sites;
  const connecte = Boolean(compte);
  $('connexion').hidden = connecte;
  $('compte').hidden = !connecte;
  if (!connecte) {
    $('titre').textContent = 'Pas connecté : rien n’est bloqué';
    $('detail').textContent = 'Sans compte, l’extension ne peut pas savoir quand ton chrono tourne. Connecte-toi ci-dessous avec le compte que tu utilises dans Hameau.';
    $('diagnostic').textContent = '';
    return;
  }
  $('adresse').textContent = compte.email;
  const p = phraseEtat(etat ?? null, sites, Date.now());
  $('titre').textContent = p.titre;
  $('detail').textContent = p.detail;
  $('etat').classList.toggle('bloque', Boolean(etat?.bloque));
  $('diagnostic').textContent = diagnostic(diag, etat);
  // Ce que la confirmation a donné aujourd'hui : de quoi voir qu'elle sert.
  const d = new Date();
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const j = compteurs?.[jour] ?? { resistes: 0, continues: 0 };
  const active = confirmationValide(reglage.confirmation).active;
  $('bilan').textContent = !active ? 'La question « tu es sûr ? » est coupée (réglages).' : j.resistes + j.continues === 0 ? '' : `Aujourd’hui : ${j.resistes} fois resté concentré, ${j.continues} fois continué.`;
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

import { ADRESSE_HAMEAU } from './config.js';
import { confirmationValide, urlOriginale } from './logique.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// Le destinataire est tout ce qui suit « &u= » (l'adresse demandée peut contenir ses propres « & ») ; « de » est encodé.
const destination = urlOriginale(location.search.slice(location.search.indexOf('&u=') + 3), location.hash);
const dOrigine = params.get('de') ?? '';
const hote = destination ? new URL(destination).hostname.replace(/^www\./, '') : 'ce site';
$('site').textContent = hote;

const deux = (n) => String(n).padStart(2, '0');
const chrono = (debut) => {
  const d = Date.parse(debut ?? '');
  if (!Number.isFinite(d)) return '';
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  const h = Math.floor(s / 3600);
  return `${h > 0 ? `${h}:` : ''}${deux(Math.floor((s % 3600) / 60))}:${deux(s % 60)}`;
};

let etat = null;
function peindre() {
  $('chrono').textContent = etat?.enCours ? chrono(etat.debut) : '';
  $('sur').textContent = etat?.categorie ? `Sur « ${etat.categorie} »` : '';
}

/** Le chrono s'est arrêté (ou a changé de pause) pendant qu'on hésitait : plus rien à confirmer, on va où l'on allait. */
function repartir() {
  location.replace(destination ?? ADRESSE_HAMEAU);
}

async function lire() {
  const r = await chrome.storage.local.get('etat');
  etat = r.etat ?? null;
  if (!etat || !etat.enCours || etat.enPause) return repartir();
  peindre();
}

// « Continuer » ne s'ouvre qu'après le délai choisi : le temps de se demander si c'est vraiment nécessaire.
async function armer() {
  const { confirmation } = await chrome.storage.sync.get('confirmation');
  const c = confirmationValide(confirmation);
  $('note').textContent = `Si tu continues, ${hote} ne te redemandera rien pendant ${c.passeMin} min.`;
  let reste = c.delaiS;
  const bouton = $('continuer');
  const maj = () => {
    bouton.disabled = reste > 0;
    bouton.textContent = reste > 0 ? `Continuer quand même (${reste})` : 'Continuer quand même';
  };
  maj();
  const t = setInterval(() => {
    reste -= 1;
    maj();
    if (reste <= 0) clearInterval(t);
  }, 1000);
}

$('rester').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'choix', choix: 'rester', destination: dOrigine });
  // Retour DIRECT à la page d'origine, pas « page précédente » : le navigateur a parfois commencé à charger le site
  // demandé avant que cette page ne s'affiche, et revenir en arrière y retomberait (puis redemanderait, en boucle).
  // D'un onglet vide ou d'une page interne : à Hameau.
  location.replace(/^https?:\/\//.test(dOrigine) ? dOrigine : ADRESSE_HAMEAU);
});
$('continuer').addEventListener('click', async () => {
  if (!destination || $('continuer').disabled) return;
  $('continuer').disabled = true;
  await chrome.runtime.sendMessage({ type: 'choix', choix: 'continuer', destination });
  location.replace(destination);
});

chrome.storage.onChanged.addListener((changes, zone) => {
  if (zone === 'local' && changes.etat) void lire();
});
setInterval(peindre, 1000);
setInterval(() => void chrome.runtime.sendMessage({ type: 'verifier' }).catch(() => undefined), 8000);
void armer();
void lire();

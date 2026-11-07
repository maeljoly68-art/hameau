import { ADRESSE_HAMEAU } from './config.js';
import { urlOriginale } from './logique.js';

const $ = (id) => document.getElementById(id);
const origine = urlOriginale(location.search, location.hash);
$('ouvrir').href = ADRESSE_HAMEAU;
$('site').textContent = origine ? new URL(origine).hostname.replace(/^www\./, '') : 'Ce site';

const deux = (n) => String(n).padStart(2, '0');
function chrono(debut) {
  const d = Date.parse(debut ?? '');
  if (!Number.isFinite(d)) return '';
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  const h = Math.floor(s / 3600);
  return `${h > 0 ? `${h}:` : ''}${deux(Math.floor((s % 3600) / 60))}:${deux(s % 60)}`;
}

let etat = null;
function peindre() {
  $('chrono').textContent = etat?.enCours ? chrono(etat.debut) : '';
  $('sur').textContent = etat?.categorie ? `Sur « ${etat.categorie} »` : '';
}

/** Le blocage est levé : on retourne là où l'on allait (ou à Hameau si l'adresse est illisible). */
function repartir() {
  location.replace(origine ?? ADRESSE_HAMEAU);
}

async function lire() {
  const r = await chrome.storage.local.get('etat');
  etat = r.etat ?? null;
  if (!etat || etat.bloque !== true) return repartir();
  peindre();
}

chrome.storage.onChanged.addListener((changes, zone) => {
  if (zone === 'local' && changes.etat) void lire();
});
setInterval(peindre, 1000);
// L'alarme de l'extension ne passe que toutes les 30 secondes : tant que cette page est ouverte, on demande plus souvent.
setInterval(() => void chrome.runtime.sendMessage({ type: 'verifier' }).catch(() => undefined), 8000);
void lire();

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { codeDansLien } from './core/classement.ts';
import { urlSupabase } from './data/config.ts';
import { App } from './ui/App.tsx';
import { appliquerTheme, lireTheme, suivreSysteme } from './ui/theme.ts';
import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/instrument-sans/wght.css';
import './style.css';

appliquerTheme(lireTheme());
suivreSysteme();

// Lien d'invitation (« #ami=CODE ») : retenu jusqu'à ce que la personne soit
// connectée, puis proposé dans l'onglet Amis. Effacé de l'adresse, pour qu'un
// favori ou l'écran d'accueil ne le rejoue pas à chaque ouverture.
const invitation = codeDansLien(location.hash);
if (invitation) {
  try {
    localStorage.setItem('hameau.invitation', JSON.stringify(invitation));
  } catch {
    // Stockage bloqué : l'invitation se perd, le code reste saisissable à la main.
  }
  history.replaceState(null, '', location.pathname + location.search);
}

// Ouvre la connexion vers Supabase pendant que React démarre : sur un
// téléphone, la poignée de main TLS coûte plusieurs centaines de millisecondes
// qu'on économise sur la première requête. L'adresse vient de la config, pas
// d'une copie dans index.html qui finirait par ne plus correspondre.
const lien = document.createElement('link');
lien.rel = 'preconnect';
lien.href = new URL(urlSupabase).origin;
lien.crossOrigin = 'anonymous';
document.head.appendChild(lien);

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Le service worker garde l'app ouvrable hors connexion, et c'est lui qui la
  // rend installable sur Windows. Pas en développement : il servirait du vieux code.
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);

  // Une app laissée ouverte des heures (l'iPad en mode focus) ne verrait
  // jamais les mises à jour : on regarde de temps en temps si la page publiée
  // charge toujours CE fichier de code, et on prévient sinon.
  const moi = new URL(import.meta.url).pathname.split('/').pop() ?? '';
  let prevenu = false;
  const verifier = async () => {
    if (prevenu || document.visibilityState !== 'visible') return;
    try {
      const page = await (await fetch(import.meta.env.BASE_URL, { cache: 'no-store' })).text();
      if (moi && !page.includes(moi)) {
        prevenu = true;
        window.dispatchEvent(new Event('hameau:mise-a-jour'));
      }
    } catch {
      // Hors connexion : on réessaiera plus tard.
    }
  };
  window.setInterval(() => void verifier(), 30 * 60_000);
  document.addEventListener('visibilitychange', () => void verifier());
}

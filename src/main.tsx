import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import './style.css';

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Le service worker garde l'app ouvrable hors connexion, et c'est lui qui la
// rend installable sur Windows. Pas en développement : il servirait du vieux code.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}

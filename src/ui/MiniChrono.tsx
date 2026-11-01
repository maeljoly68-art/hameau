import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// API « Document Picture-in-Picture » : une petite fenêtre toujours au premier
// plan, disponible dans Chrome et Edge sur ordinateur. C'est ce qui permet de
// garder le chrono sous les yeux sur Windows sans rien installer.
interface DocumentPiP {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}

function api(): DocumentPiP | null {
  return (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture ?? null;
}

export const miniChronoDisponible = () => api() !== null;

/** Ouvre la mini-fenêtre et y rend `contenu` tant qu'elle est ouverte. */
export function useMiniChrono() {
  const [fenetre, setFenetre] = useState<Window | null>(null);

  useEffect(() => {
    if (!fenetre) return;
    const fermer = () => setFenetre(null);
    fenetre.addEventListener('pagehide', fermer);
    return () => fenetre.removeEventListener('pagehide', fermer);
  }, [fenetre]);

  const ouvrir = async () => {
    const pip = api();
    if (!pip) return;
    const w = await pip.requestWindow({ width: 280, height: 150 });
    // La fenêtre naît vide : sans recopier les feuilles de style, le chrono
    // s'y afficherait en Times noir sur blanc.
    for (const feuille of Array.from(document.styleSheets)) {
      try {
        const style = w.document.createElement('style');
        style.textContent = Array.from(feuille.cssRules)
          .map((r) => r.cssText)
          .join('\n');
        w.document.head.appendChild(style);
      } catch {
        if (feuille.href) {
          const lien = w.document.createElement('link');
          lien.rel = 'stylesheet';
          lien.href = feuille.href;
          w.document.head.appendChild(lien);
        }
      }
    }
    w.document.body.className = 'mini';
    setFenetre(w);
  };

  const fermer = () => fenetre?.close();

  const portail = (contenu: React.ReactNode) => (fenetre ? createPortal(contenu, fenetre.document.body) : null);

  return { ouverte: fenetre !== null, ouvrir, fermer, portail };
}

import { useEffect } from 'react';
import { formatChrono } from '../core/temps.ts';
import type { Session } from '../core/types.ts';
import { Anneau, etatChrono } from './Chrono.tsx';
import { IconeStop } from './Icones.tsx';
import { useMaintenant } from './useHameau.ts';

interface Verrou {
  release(): Promise<void>;
}

/**
 * Garde l'écran allumé tant que le mode focus est ouvert : un iPad posé sur
 * un support s'éteint sinon au bout de deux minutes, chrono compris.
 */
function useEcranAllume(actif: boolean) {
  useEffect(() => {
    if (!actif) return;
    const api = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Verrou> } }).wakeLock;
    if (!api) return;
    let verrou: Verrou | null = null;
    let fini = false;
    const prendre = () => {
      api.request('screen').then(
        (v) => {
          if (fini) void v.release();
          else verrou = v;
        },
        () => undefined,
      );
    };
    // Le système relâche le verrou quand l'app passe en arrière-plan : il
    // faut le reprendre au retour, sinon il ne sert qu'une fois.
    const auRetour = () => {
      if (document.visibilityState === 'visible') prendre();
    };
    prendre();
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      fini = true;
      document.removeEventListener('visibilitychange', auRetour);
      void verrou?.release();
    };
  }, [actif]);
}

export function ModeFocus({ session, nomHameau, surTerminer, surQuitter }: { session: Session; nomHameau: string; surTerminer: () => void; surQuitter: () => void }) {
  const maintenant = useMaintenant(1000);
  const e = etatChrono(session, maintenant);
  useEcranAllume(true);

  useEffect(() => {
    const touche = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') surQuitter();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [surQuitter]);

  return (
    <div className="mode-focus" role="dialog" aria-modal="true" aria-label="Mode focus">
      <div className="focus-braises" aria-hidden />
      <p className="focus-lieu">{nomHameau}</p>
      <Anneau ratio={e.ratio} taille={Math.min(340, window.innerWidth - 48)} epaisseur={14} atteint={e.atteint}>
        <div className="chrono-temps focus-temps">{formatChrono(e.ecouleMs)}</div>
        <div className="chrono-legende">{e.legende}</div>
      </Anneau>
      <p className="focus-sujet">{session.categorie || 'Session libre'}</p>
      <div className="actions centre">
        <button className="bouton gros arreter" onClick={surTerminer}>
          <IconeStop /> Terminer
        </button>
      </div>
      <button className="lien" onClick={surQuitter}>
        Quitter le mode focus <kbd>Échap</kbd>
      </button>
    </div>
  );
}

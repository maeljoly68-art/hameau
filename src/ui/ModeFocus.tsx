import { useEffect, useRef, useState } from 'react';
import { formatChrono } from '../core/temps.ts';
import type { Session } from '../core/types.ts';
import { demarrerAmbiance, type Ambiance } from './ambiance.ts';
import { Anneau, etatChrono } from './Chrono.tsx';
import { IconeLecture, IconePause, IconeSon, IconeStop } from './Icones.tsx';
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

export function ModeFocus({
  session,
  nomHameau,
  surTerminer,
  surPause,
  surReprendre,
  surQuitter,
}: {
  session: Session;
  nomHameau: string;
  surTerminer: () => void;
  surPause: () => void;
  surReprendre: () => void;
  surQuitter: () => void;
}) {
  const maintenant = useMaintenant(1000);
  const e = etatChrono(session, maintenant);
  const ambiance = useRef<Ambiance | null>(null);
  const [son, setSon] = useState(false);
  useEcranAllume(true);

  useEffect(() => {
    const touche = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') surQuitter();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [surQuitter]);

  // Le son s'arrête avec le mode focus, quelle que soit la façon d'en sortir.
  useEffect(() => () => ambiance.current?.arreter(), []);

  const basculerSon = () => {
    if (ambiance.current) {
      ambiance.current.arreter();
      ambiance.current = null;
      setSon(false);
    } else {
      // Démarré dans le clic lui-même : iOS refuse le son lancé plus tard.
      ambiance.current = demarrerAmbiance();
      setSon(ambiance.current !== null);
    }
  };

  return (
    <div className={e.enPause ? 'mode-focus en-pause' : 'mode-focus'} role="dialog" aria-modal="true" aria-label="Mode focus">
      <div className="focus-braises" aria-hidden />
      <p className="focus-lieu">{nomHameau}</p>
      <Anneau ratio={e.ratio} taille={Math.min(340, window.innerWidth - 48)} epaisseur={14} atteint={e.atteint} enPause={e.enPause}>
        <div className="chrono-temps focus-temps">{formatChrono(e.ecouleMs)}</div>
        <div className="chrono-legende">{e.legende}</div>
      </Anneau>
      <p className="focus-sujet">{session.categorie || 'Session libre'}</p>
      <div className="actions centre actions-chrono">
        {/* Clés distinctes : sans elles, React réutilise le même bouton pour
            « Reprendre » et « Pause », le focus y reste, et Espace remet en
            pause au lieu de terminer. */}
        {e.enPause ? (
          <button key="reprendre" className="bouton gros demarrer" onClick={surReprendre}>
            <IconeLecture /> Reprendre
          </button>
        ) : (
          <button key="pause" className="bouton icone discret" onClick={surPause} aria-label="Mettre en pause" title="Pause (P)">
            <IconePause />
          </button>
        )}
        <button className={e.enPause ? 'bouton gros discret' : 'bouton gros arreter'} onClick={surTerminer}>
          <IconeStop /> Terminer
        </button>
        <button className={son ? 'bouton icone discret actif' : 'bouton icone discret'} onClick={basculerSon} aria-pressed={son} aria-label="Ambiance feu de camp" title="Ambiance feu de camp">
          <IconeSon coupe={!son} />
        </button>
      </div>
      <button className="lien" onClick={surQuitter}>
        Quitter le mode focus <kbd>Échap</kbd>
      </button>
    </div>
  );
}

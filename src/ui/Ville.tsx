import { memo, useEffect, useRef, useState } from 'react';
import { cleProgression, type Progression } from '../core/ville.ts';
import type { SignauxVille, Ville as Moteur } from './ville/moteur.js';

/*
  Hameau n'a ni patrimoine ni trades à montrer : la ville y reçoit des signaux de ville habitée, fixes. Ce qui la
  fait changer ici, ce sont les heures — la progression — et la fête du soir quand l'objectif du jour est atteint.
*/
const SIGNAUX: SignauxVille = { etagesBanque: 8, etagesTour: 12, ton: 'neutre', etudiants: 6, promeneurs: 9, joggeurs: 3, orage: 0, ballons: false, presentoirs: 3, etals: 3, piles: 4, lecteurs: 3 };

/** La ville 3D : la même que dans Sillage, bâtie selon les heures de travail. */
export const Ville = memo(function Ville({ progression, fete, pied }: { progression: Progression; fete: boolean; pied?: React.ReactNode }) {
  const hote = useRef<HTMLDivElement>(null);
  const moteur = useRef<Moteur | null>(null);
  const [etat, setEtat] = useState<'charge' | 'pret' | 'absent'>('charge');
  const feteRef = useRef(fete);
  feteRef.current = fete;
  const progressionRef = useRef(progression);
  progressionRef.current = progression;
  // Reconstruire la ville coûte cher : seulement quand un palier tombe, pas à chaque minute de travail.
  const cle = cleProgression(progression);

  useEffect(() => {
    let annule = false;
    let instance: Moteur | null = null;
    // three pèse plusieurs centaines de kilo-octets : chargé à l'affichage de la ville, jamais avant.
    import('./ville/moteur.js')
      .then(({ creerVille }) => {
        if (annule || !hote.current) return;
        instance = creerVille(hote.current, {}, () => undefined, progressionRef.current, { cadrage: 0.74 });
        if (!instance) return setEtat('absent');
        moteur.current = instance;
        instance.update({ ...SIGNAUX, fete: feteRef.current });
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) instance.setPlaying(false);
        setEtat('pret');
      })
      .catch(() => {
        if (!annule) setEtat('absent');
      });
    return () => {
      annule = true;
      instance?.dispose();
      moteur.current = null;
    };
  }, [cle]);

  useEffect(() => {
    moteur.current?.update({ ...SIGNAUX, fete });
  }, [fete]);

  return (
    <section className="carte-village">
      <div className={`cadre-ville ${etat}`} ref={hote} role="img" aria-label="Ta ville, qui grandit avec tes heures de travail">
        {etat === 'absent' && <p className="aide ville-absente">Ton appareil ne sait pas afficher la ville en 3D.</p>}
      </div>
      <div className="ville-outils">
        <button className="bouton discret icone" onClick={() => moteur.current?.rotate(1)} aria-label="Tourner la ville vers la gauche" title="Tourner">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>
      {pied}
    </section>
  );
});

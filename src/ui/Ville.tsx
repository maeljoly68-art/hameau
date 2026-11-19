import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatDuree } from '../core/temps.ts';
import { cleProgression, prochaineNouveaute, type Progression } from '../core/ville.ts';
import { ecrirePreference, lirePreference } from './Chrono.tsx';
import { IconeLecture, IconePause } from './Icones.tsx';
import type { SignauxVille, Ville as Moteur } from './ville/moteur.js';

/*
  Hameau n'a ni patrimoine ni trades à montrer : la ville y reçoit des signaux de ville habitée, fixes. Ce qui la
  fait changer ici, ce sont les heures — la progression — et la fête du soir quand l'objectif du jour est atteint.
*/
const SIGNAUX: SignauxVille = { etagesBanque: 8, etagesTour: 12, ton: 'neutre', etudiants: 6, promeneurs: 9, joggeurs: 3, orage: 0, ballons: false, presentoirs: 3, etals: 3, piles: 4, lecteurs: 3 };

const CLE_ANIMEE = 'hameau.ville-animee';
const mouvementReduit = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** La ville 3D : la même que dans Sillage, bâtie selon les heures de travail. */
export const Ville = memo(function Ville({ progression, fete, pied }: { progression: Progression; fete: boolean; pied?: React.ReactNode }) {
  const hote = useRef<HTMLDivElement>(null);
  const moteur = useRef<Moteur | null>(null);
  const [etat, setEtat] = useState<'charge' | 'pret' | 'absent'>('charge');
  // Reconstruire la ville coûte cher : seulement quand un palier tombe, pas à chaque minute de travail.
  const cle = cleProgression(progression);
  /*
    Le mouvement suit le réglage du système tant qu'on n'a rien choisi : avec « réduire les animations »,
    la ville restait figée sans moyen de la lancer. Un choix fait au bouton est gardé d'une visite à l'autre.
  */
  const [animee, setAnimee] = useState(() => lirePreference<boolean | null>(CLE_ANIMEE, null) ?? !mouvementReduit());
  // Les valeurs du moment, lues par le moteur une fois chargé (l'import est asynchrone) sans le reconstruire.
  const feteRef = useRef(fete);
  const progressionRef = useRef(progression);
  const animeeRef = useRef(animee);
  useLayoutEffect(() => {
    feteRef.current = fete;
    progressionRef.current = progression;
    animeeRef.current = animee;
  });

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
        instance.setPlaying(animeeRef.current);
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
  useEffect(() => {
    moteur.current?.setPlaying(animee);
  }, [animee]);

  return (
    <section className="carte-village">
      <div className={`cadre-ville ${etat}`} ref={hote} role="img" aria-label="Ta ville, qui grandit avec tes heures de travail">
        {etat === 'absent' && <p className="aide ville-absente">Ton appareil ne sait pas afficher la ville en 3D.</p>}
      </div>
      <div className="ville-outils">
        <button
          className="bouton discret icone"
          onClick={() => {
            const v = !animee;
            setAnimee(v);
            ecrirePreference(CLE_ANIMEE, v);
          }}
          aria-label={animee ? 'Mettre la ville en pause' : 'Mettre la ville en mouvement'}
          title={animee ? 'Mettre en pause' : 'Mettre en mouvement'}
        >
          {animee ? <IconePause /> : <IconeLecture />}
        </button>
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

/**
 * Ce que la ville montrera ensuite, et dans combien de temps. Le compte à rebours retire la séance en cours :
 * il avance pendant qu'on travaille ; une séance assez longue l'amène à « fin de séance », moment où la
 * nouveauté apparaît vraiment.
 */
export function SuiteVille({ minutesCloses, minutesEnCours }: { minutesCloses: number; minutesEnCours: number }) {
  const suite = prochaineNouveaute(minutesCloses, minutesEnCours);
  if (!suite)
    return (
      <p className="ville-suite">
        <span className="ville-suite-titre">Ville complète</span>
        <span className="ville-suite-quoi">Tout est construit.</span>
      </p>
    );
  const quand = suite.minutesRestantes <= 0 ? 'à la fin de cette séance' : `dans ${formatDuree(Math.max(1, Math.ceil(suite.minutesRestantes)))}`;
  return (
    <p className="ville-suite">
      <span className="ville-suite-titre">Prochaine nouveauté</span>
      <span className="ville-suite-ligne">
        <span className="ville-suite-quoi">{suite.paliers.map((p) => p.libelle).join(' · ')}</span>
        <span className="ville-suite-quand">{quand}</span>
      </span>
    </p>
  );
}

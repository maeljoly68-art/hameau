import { useCallback, useEffect, useState } from 'react';
import { pointsApprentissage } from '../core/pointsApprentissage.ts';
import { cleJour } from '../core/temps.ts';
import { chargerPassagesLegers, ecouterPassages, EVENEMENT_PASSAGE } from '../data/cours.ts';
import { ecrirePreference, lirePreference } from './Chrono.tsx';

/**
 * Les points gagnés en apprenant (pages apprises, rappels réussis, examens blancs, série), pour le village : ils
 * s'ajoutent à ceux du temps de travail. Calculés depuis TOUT le journal (pas les quatre derniers mois), et gardés sur
 * l'appareil pour que le solde ne saute pas à l'ouverture. Sans compte, ou sans journal : zéro.
 */
export function usePointsApprentissage(userId: string | null): number {
  const cle = userId ? `hameau.points-apprentissage.${userId}` : null;
  const [points, setPoints] = useState<number>(() => (cle ? lirePreference<number>(cle, 0) : 0));

  const recalculer = useCallback(() => {
    if (!cle) return;
    chargerPassagesLegers().then(
      (liste) => {
        const total = pointsApprentissage(liste, cleJour(new Date())).total;
        setPoints(total);
        ecrirePreference(cle, total);
      },
      () => undefined, // hors ligne : on garde le dernier total connu
    );
  }, [cle]);

  useEffect(() => {
    if (!cle) return;
    const t = window.setTimeout(recalculer, 0);
    const arreter = ecouterPassages(recalculer);
    // Un passage écrit sur CET appareil : pas la peine d'attendre le temps réel (ni de compter sur lui).
    window.addEventListener(EVENEMENT_PASSAGE, recalculer);
    const auRetour = () => {
      if (document.visibilityState === 'visible') recalculer();
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearTimeout(t);
      arreter();
      window.removeEventListener(EVENEMENT_PASSAGE, recalculer);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [cle, recalculer]);

  return cle ? points : 0;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DonneesCours } from '../core/cours.ts';
import { chargerCours, ecouterCours, ecrireCacheCours, lireCacheCours } from '../data/cours.ts';

/** Les cours : peints depuis le cache, puis rechargés à chaque changement (ici ou sur un autre appareil). */
export function useCours(userId: string | null) {
  const [donnees, setDonnees] = useState<DonneesCours | null>(() => (userId ? lireCacheCours(userId) : null));
  const [erreur, setErreur] = useState<string | null>(null);
  const enVol = useRef<Promise<void> | null>(null);
  const encore = useRef(false);

  // Un seul chargement à la fois : le temps réel envoie un événement par ligne touchée.
  const recharger = useCallback((): Promise<void> => {
    if (!userId) return Promise.resolve();
    if (enVol.current) {
      encore.current = true;
      return enVol.current;
    }
    const tour = (async () => {
      do {
        encore.current = false;
        try {
          const d = await chargerCours();
          setDonnees(d);
          setErreur(null);
          ecrireCacheCours(userId, d);
        } catch (e) {
          setErreur(e instanceof Error ? e.message : String(e));
        }
      } while (encore.current);
      enVol.current = null;
    })();
    enVol.current = tour;
    return tour;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const t = window.setTimeout(() => void recharger(), 0);
    const arreter = ecouterCours(userId, () => void recharger());
    return () => {
      window.clearTimeout(t);
      arreter();
    };
  }, [userId, recharger]);

  /** Exécute une écriture puis recharge ; l'erreur s'affiche au lieu de disparaître. */
  const agir = useCallback(
    async (f: () => Promise<unknown>) => {
      let echec: unknown = null;
      try {
        await f();
      } catch (e) {
        echec = e;
      }
      await recharger();
      // Posée APRÈS le rechargement : un rechargement réussi efface l'erreur précédente, action comprise.
      if (echec !== null) {
        setErreur(echec instanceof Error ? echec.message : String(echec));
        throw echec;
      }
      setErreur(null);
    },
    [recharger],
  );

  return { donnees, erreur, setErreur, agir };
}

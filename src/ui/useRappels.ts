import { useCallback, useEffect, useState } from 'react';
import type { RappelMensuel } from '../core/rappels.ts';
import { chargerRappels, ecouterRappels, ecrireCacheRappels, faireRappel, lireCacheRappels } from '../data/rappels.ts';

/** Les rappels mensuels du compte : peints depuis le cache, puis rechargés à chaque changement (ici ou ailleurs). */
export function useRappels(userId: string | null) {
  const [rappels, setRappels] = useState<RappelMensuel[]>(() => (userId ? lireCacheRappels(userId) : []));
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    if (!userId) return;
    try {
      const liste = await chargerRappels();
      setRappels(liste);
      setErreur(null);
      ecrireCacheRappels(userId, liste);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const t = window.setTimeout(() => void recharger(), 0);
    const arreter = ecouterRappels(userId, () => void recharger());
    return () => {
      window.clearTimeout(t);
      arreter();
    };
  }, [userId, recharger]);

  /** Marque un rappel fait ; l'erreur s'affiche après le rechargement, qui ne l'efface pas. */
  const faire = useCallback(
    async (id: string, jour: string) => {
      let echec: string | null = null;
      try {
        await faireRappel(id, jour);
      } catch (e) {
        echec = e instanceof Error ? e.message : String(e);
      }
      await recharger();
      if (echec !== null) setErreur(echec);
    },
    [recharger],
  );

  return { rappels, erreur, faire };
}

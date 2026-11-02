import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { niveauPour } from '../core/points.ts';
import { pointsGagnes, solde } from '../core/village.ts';
import { ecrireCache, lireCache, type Depot, type Donnees } from '../data/depot.ts';

/** État du hameau : peint depuis le cache, puis rechargé à chaque changement. */
export function useHameau(depot: Depot) {
  const [donnees, setDonnees] = useState<Donnees | null>(() => lireCache(depot.cleCache));
  const [frais, setFrais] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const enVol = useRef<Promise<void> | null>(null);
  const encore = useRef(false);

  // Un seul chargement à la fois : le temps réel envoie un événement par ligne
  // touchée, et dix rechargements complets en rafale saturaient le téléphone.
  const recharger = useCallback((): Promise<void> => {
    if (enVol.current) {
      encore.current = true;
      return enVol.current;
    }
    const tour = (async () => {
      do {
        encore.current = false;
        try {
          const d = await depot.charger();
          setDonnees(d);
          setFrais(true);
          setErreur(null);
          ecrireCache(depot.cleCache, d);
        } catch (e) {
          setErreur(e instanceof Error ? e.message : String(e));
        }
      } while (encore.current);
      enVol.current = null;
    })();
    enVol.current = tour;
    return tour;
  }, [depot]);

  useEffect(() => {
    const t = window.setTimeout(() => void recharger(), 0);
    const arreter = depot.ecouter(() => void recharger());
    return () => {
      window.clearTimeout(t);
      arreter();
    };
  }, [depot, recharger]);

  const derive = useMemo(() => {
    if (!donnees) return null;
    const gagnes = pointsGagnes(donnees.sessions);
    return {
      enCours: donnees.sessions.find((s) => s.fin === null) ?? null,
      gagnes,
      solde: solde(donnees.sessions, donnees.constructions),
      niveau: niveauPour(gagnes),
    };
  }, [donnees]);

  /** Exécute une écriture puis recharge ; l'erreur s'affiche au lieu de disparaître. */
  const agir = useCallback(
    async (f: () => Promise<unknown>) => {
      try {
        await f();
        setErreur(null);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        await recharger();
      }
    },
    [recharger],
  );

  return { donnees, frais, derive, erreur, setErreur, agir };
}

/** Heure courante, rafraîchie à l'intervalle demandé. */
export function useMaintenant(intervalleMs: number): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now()), intervalleMs);
    return () => window.clearInterval(id);
  }, [intervalleMs]);
  return t;
}

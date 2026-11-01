import { useCallback, useEffect, useMemo, useState } from 'react';
import { niveauPour } from '../core/points.ts';
import { pointsGagnes, solde } from '../core/village.ts';
import type { Depot, Donnees } from '../data/depot.ts';

/** État du hameau, rechargé à chaque changement venu d'ici ou d'ailleurs. */
export function useHameau(depot: Depot) {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    try {
      setDonnees(await depot.charger());
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }, [depot]);

  useEffect(() => {
    // « vivant » : une réponse arrivée après le changement de compte ne doit
    // pas écraser les données du nouveau.
    let vivant = true;
    const charger = () =>
      depot.charger().then(
        (d) => {
          if (!vivant) return;
          setDonnees(d);
          setErreur(null);
        },
        (e: unknown) => {
          if (vivant) setErreur(e instanceof Error ? e.message : String(e));
        },
      );
    void charger();
    const arreter = depot.ecouter(() => void charger());
    return () => {
      vivant = false;
      arreter();
    };
  }, [depot]);

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

  return { donnees, derive, erreur, setErreur, agir, recharger };
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

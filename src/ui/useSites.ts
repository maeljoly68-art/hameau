import { useCallback, useEffect, useMemo, useState } from 'react';
import { sitesDeLaPeriode, sitesParSession, type LigneSite, type SiteTemps } from '../core/sites.ts';
import type { Session } from '../core/types.ts';
import { chargerSites } from '../data/sites.ts';

/** Pendant un chrono, de nouveaux totaux arrivent toutes les quelques secondes : une lecture par minute suffit. */
const RENOUVELER_MS = 60_000;

/**
 * Les sites sur lesquels on a travaillé, par session et sur les sept derniers jours. Rien sans compte (c'est l'extension,
 * connectée au compte, qui les écrit). Rechargé au retour sur la page, et chaque minute tant qu'un chrono tourne. Une
 * erreur de lecture ne casse rien : on garde ce qu'on avait.
 */
export function useSites(userId: string | null, sessions: readonly Session[], aujourdhui: string): { parSession: ReadonlyMap<string, SiteTemps[]>; periode: SiteTemps[] } {
  const [lignes, setLignes] = useState<LigneSite[]>([]);
  const enCours = sessions.some((s) => s.fin === null);

  const recharger = useCallback(async () => {
    if (!userId) return;
    try {
      setLignes(await chargerSites(Date.now()));
    } catch {
      // réseau coupé ou base indisponible : les sites sont un bonus, on garde les derniers connus
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      const t = window.setTimeout(() => setLignes([]), 0);
      return () => window.clearTimeout(t);
    }
    const premiere = window.setTimeout(() => void recharger(), 0);
    const auRetour = () => {
      if (document.visibilityState === 'visible') void recharger();
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearTimeout(premiere);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [userId, recharger]);

  // Un chrono qui tourne ou qui vient de finir : le dernier total arrive à l'arrêt, d'où la lecture quand `enCours` change.
  useEffect(() => {
    if (!userId) return;
    const t = window.setTimeout(() => void recharger(), 3000);
    const r = enCours ? window.setInterval(() => void recharger(), RENOUVELER_MS) : undefined;
    return () => {
      window.clearTimeout(t);
      if (r !== undefined) window.clearInterval(r);
    };
  }, [userId, enCours, recharger]);

  const parSession = useMemo(() => sitesParSession(lignes), [lignes]);
  const periode = useMemo(() => sitesDeLaPeriode(lignes, sessions, aujourdhui), [lignes, sessions, aujourdhui]);
  return { parSession, periode };
}

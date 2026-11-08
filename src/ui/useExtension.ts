import { useEffect, useState } from 'react';

/**
 * Ce que l'extension de concentration répond à la page (voir extension/relais.js). `connecte`, `bloque` et `enCours`
 * manquent des versions d'avant 1.1.1 : on le sait alors, sans prétendre savoir le reste.
 */
export type EtatExtension = { etat: 'cherche' } | { etat: 'absente' } | { etat: 'presente'; version: string; connecte?: boolean; bloque?: boolean; enCours?: boolean };

/** On attend la réponse de l'extension (si elle est installée) un instant, pas davantage. */
const ATTENTE_MS = 1500;
/** Pendant un chrono, on redemande régulièrement : l'état de l'extension change (connexion, blocage). */
const RENOUVELER_MS = 5000;

/**
 * L'extension répond à un « ping » de la page. Elle ne tourne que dans Chrome sur ordinateur : ailleurs, personne ne
 * répond et on le dit au bout d'un instant. Avec `surveiller`, la question se repose toutes les 5 secondes.
 */
export function useExtension(surveiller = false): EtatExtension {
  const [etat, setEtat] = useState<EtatExtension>({ etat: 'cherche' });
  useEffect(() => {
    const surMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data as { source?: unknown; version?: unknown; connecte?: unknown; bloque?: unknown; enCours?: unknown } | null;
      if (!d || d.source !== 'hameau-extension') return;
      setEtat({
        etat: 'presente',
        version: typeof d.version === 'string' ? d.version : '?',
        connecte: typeof d.connecte === 'boolean' ? d.connecte : undefined,
        bloque: typeof d.bloque === 'boolean' ? d.bloque : undefined,
        enCours: typeof d.enCours === 'boolean' ? d.enCours : undefined,
      });
    };
    const demander = () => window.postMessage({ source: 'hameau-ping' }, window.location.origin);
    window.addEventListener('message', surMessage);
    demander();
    const t = window.setTimeout(() => setEtat((e) => (e.etat === 'cherche' ? { etat: 'absente' } : e)), ATTENTE_MS);
    const r = surveiller ? window.setInterval(demander, RENOUVELER_MS) : undefined;
    return () => {
      window.removeEventListener('message', surMessage);
      window.clearTimeout(t);
      if (r !== undefined) window.clearInterval(r);
    };
  }, [surveiller]);
  return etat;
}

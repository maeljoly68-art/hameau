import { useEffect, useState } from 'react';

export type EtatExtension = { etat: 'cherche' } | { etat: 'absente' } | { etat: 'presente'; version: string };

/** On attend la réponse de l'extension (si elle est installée) un instant, pas davantage. */
const ATTENTE_MS = 1500;

/**
 * L'extension de blocage répond à un « ping » de la page (voir extension/relais.js). Elle ne tourne que dans Chrome sur
 * ordinateur : ailleurs, personne ne répond et on le dit au bout d'un instant.
 */
export function useExtension(): EtatExtension {
  const [etat, setEtat] = useState<EtatExtension>({ etat: 'cherche' });
  useEffect(() => {
    const surMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data as { source?: unknown; version?: unknown } | null;
      if (d && d.source === 'hameau-extension') setEtat({ etat: 'presente', version: typeof d.version === 'string' ? d.version : '?' });
    };
    window.addEventListener('message', surMessage);
    window.postMessage({ source: 'hameau-ping' }, window.location.origin);
    const t = window.setTimeout(() => setEtat((e) => (e.etat === 'cherche' ? { etat: 'absente' } : e)), ATTENTE_MS);
    return () => {
      window.removeEventListener('message', surMessage);
      window.clearTimeout(t);
    };
  }, []);
  return etat;
}

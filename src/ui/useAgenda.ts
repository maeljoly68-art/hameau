import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Creneau } from '../core/agenda.ts';
import { ecrireCacheAgenda, empreinte, lireCacheAgenda, recupererAgenda } from '../data/agenda.ts';

/** Passé ce délai, l'emploi du temps est relu à l'ouverture de l'onglet et au retour dans l'app. */
export const FRAICHEUR_MS = 30 * 60_000;

interface Lecture {
  cle: string;
  creneaux: Creneau[];
  majLe: number;
  ignores: number;
  recurrents: number;
}

/**
 * L'emploi du temps de l'université : peint depuis le cache de l'appareil, puis relu quand il est
 * périmé. Une lecture qui échoue garde le dernier emploi du temps connu et affiche l'erreur à côté.
 */
export function useAgenda(userId: string | null, lien: string | null) {
  // Lien et compte : un autre lien (ou un autre compte) a son propre cache et ses propres erreurs.
  const cle = userId && lien ? `${userId}:${empreinte(lien)}` : null;
  const depuisCache = useMemo(() => (userId && lien ? lireCacheAgenda(userId, lien) : null), [userId, lien]);
  const [lue, setLue] = useState<Lecture | null>(null);
  const [erreur, setErreur] = useState<{ cle: string; message: string } | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const enVol = useRef<{ cle: string; promesse: Promise<void> } | null>(null);
  const majLeRef = useRef<number | null>(null);

  const courante = lue && lue.cle === cle ? lue : null;
  const creneaux = courante ? courante.creneaux : depuisCache ? depuisCache.creneaux : null;
  const majLe = courante ? courante.majLe : depuisCache ? depuisCache.majLe : null;

  useEffect(() => {
    majLeRef.current = majLe;
  }, [majLe]);

  const actualiser = useCallback((): Promise<void> => {
    if (!userId || !lien || !cle) return Promise.resolve();
    if (enVol.current?.cle === cle) return enVol.current.promesse;
    const promesse = (async () => {
      setEnCours(cle);
      try {
        const lu = await recupererAgenda(lien);
        const maintenant = Date.now();
        setLue({ cle, creneaux: lu.creneaux, majLe: maintenant, ignores: lu.ignores, recurrents: lu.recurrents });
        setErreur(null);
        ecrireCacheAgenda(userId, lien, lu.creneaux, maintenant);
      } catch (e) {
        setErreur({ cle, message: e instanceof Error ? e.message : 'Lecture de l’emploi du temps impossible.' });
      } finally {
        setEnCours((c) => (c === cle ? null : c));
        if (enVol.current?.cle === cle) enVol.current = null;
      }
    })();
    enVol.current = { cle, promesse };
    return promesse;
  }, [userId, lien, cle]);

  useEffect(() => {
    if (!cle) return;
    const perime = () => majLeRef.current === null || Date.now() - majLeRef.current > FRAICHEUR_MS;
    // Hors de l'effet lui-même : l'état ne change qu'une fois le rendu fait.
    const t = window.setTimeout(() => {
      if (perime()) void actualiser();
    }, 0);
    // iOS suspend une app en arrière-plan pendant des heures : au retour, on relit si c'est périmé.
    const auRetour = () => {
      if (document.visibilityState === 'visible' && perime()) void actualiser();
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [cle, actualiser]);

  return {
    /** null : pas de lien, ou jamais lu. */
    creneaux,
    majLe,
    erreur: erreur && erreur.cle === cle ? erreur.message : null,
    enCours: enCours !== null && enCours === cle,
    ignores: courante ? courante.ignores : 0,
    recurrents: courante ? courante.recurrents : 0,
    actualiser,
  };
}

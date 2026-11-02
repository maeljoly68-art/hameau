import { useEffect, useMemo, useState } from 'react';
import { client, compteLocal, type CompteLocal } from '../data/config.ts';
import type { Depot } from '../data/depot.ts';
import { depotDistant } from '../data/distant.ts';
import { depotLocal } from '../data/local.ts';
import { Connexion } from './Connexion.tsx';
import { Hameau } from './Hameau.tsx';

const CLE_MODE = 'hameau.mode';

function lireMode(): string | null {
  try {
    return localStorage.getItem(CLE_MODE);
  } catch {
    return null;
  }
}

export function App() {
  // Le compte est d'abord deviné depuis le stockage local, sans attendre la
  // bibliothèque Supabase : le village s'affiche aussitôt, depuis le cache.
  const [compte, setCompte] = useState<CompteLocal | null>(() => compteLocal());
  const [verifie, setVerifie] = useState(false);
  const [local, setLocal] = useState(() => lireMode() === 'local');

  useEffect(() => {
    let annule = false;
    let desabonner: (() => void) | null = null;
    void client().then((sb) => {
      if (annule) return;
      void sb.auth.getSession().then(({ data }) => {
        if (annule) return;
        const u = data.session?.user;
        setCompte(u ? { id: u.id, email: u.email ?? null } : null);
        setVerifie(true);
      });
      const { data } = sb.auth.onAuthStateChange((_e, s) => {
        setCompte(s ? { id: s.user.id, email: s.user.email ?? null } : null);
        setVerifie(true);
      });
      desabonner = () => data.subscription.unsubscribe();
    });
    return () => {
      annule = true;
      desabonner?.();
    };
  }, []);

  const userId = compte?.id ?? null;
  const depot = useMemo<Depot | null>(() => {
    if (userId) return depotDistant(client, userId);
    if (local) return depotLocal();
    return null;
  }, [userId, local]);

  if (!depot) {
    if (!verifie && compteLocal()) return <div className="chargement">Hameau…</div>;
    return (
      <Connexion
        surSansCompte={() => {
          localStorage.setItem(CLE_MODE, 'local');
          setLocal(true);
        }}
      />
    );
  }

  return (
    <Hameau
      key={userId ?? 'local'}
      depot={depot}
      email={compte?.email ?? null}
      surDeconnexion={async () => {
        localStorage.removeItem(CLE_MODE);
        // Un appareil partagé ne doit pas garder le hameau du compte précédent.
        localStorage.removeItem(depot.cleCache);
        setLocal(false);
        if (compte) await (await client()).auth.signOut();
        setCompte(null);
      }}
    />
  );
}

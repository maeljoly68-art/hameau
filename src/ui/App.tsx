import { useEffect, useMemo, useState } from 'react';
import { lireLienAuth } from '../core/recuperation.ts';
import { client, compteLocal, type CompteLocal } from '../data/config.ts';
import type { Depot } from '../data/depot.ts';
import { depotDistant } from '../data/distant.ts';
import { depotLocal } from '../data/local.ts';
import { Connexion } from './Connexion.tsx';
import { Hameau } from './Hameau.tsx';
import { NouveauMotDePasse } from './NouveauMotDePasse.tsx';

const CLE_MODE = 'hameau.mode';
/**
 * Récupération de mot de passe commencée et pas finie. Le lien ouvre une
 * connexion, puis la bibliothèque efface le jeton de l'adresse : sans cette
 * trace, recharger la page ouvrirait l'app, connectée, sans que la personne
 * ait jamais pu choisir son mot de passe.
 */
const CLE_RECUPERATION = 'hameau.recuperation';

function lireMode(): string | null {
  try {
    return localStorage.getItem(CLE_MODE);
  } catch {
    return null;
  }
}

function lireRecuperation(): boolean {
  try {
    return localStorage.getItem(CLE_RECUPERATION) === '1';
  } catch {
    return false;
  }
}

function ecrireRecuperation(enCours: boolean): void {
  try {
    if (enCours) localStorage.setItem(CLE_RECUPERATION, '1');
    else localStorage.removeItem(CLE_RECUPERATION);
  } catch {
    // Stockage bloqué : la reprise après rechargement se perd, rien de plus.
  }
}

export function App() {
  // Le compte est d'abord deviné depuis le stockage local, sans attendre la
  // bibliothèque Supabase : le village s'affiche aussitôt, depuis le cache.
  const [compte, setCompte] = useState<CompteLocal | null>(() => compteLocal());
  const [verifie, setVerifie] = useState(false);
  const [local, setLocal] = useState(() => lireMode() === 'local');
  // Lus dans l'adresse AVANT que la bibliothèque Supabase soit chargée : c'est
  // elle qui efface le jeton du lien, et elle arrive après le premier affichage.
  const [lienPerime, setLienPerime] = useState(() => lireLienAuth(location.hash)?.type === 'erreur');
  const [recuperation, setRecuperation] = useState(() => lireLienAuth(location.hash)?.type === 'recuperation' || lireRecuperation());

  useEffect(() => {
    ecrireRecuperation(recuperation);
  }, [recuperation]);

  useEffect(() => {
    // L'erreur d'un lien périmé se dit une fois : sans ce nettoyage, chaque
    // rechargement la rejouerait. Le jeton d'un lien VALIDE, lui, n'est jamais
    // touché ici : c'est la bibliothèque qui doit le lire.
    if (lienPerime && /error/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }, [lienPerime]);

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
      const { data } = sb.auth.onAuthStateChange((e, s) => {
        // Le lien du mot de passe oublié a ouvert une connexion : l'app ne
        // doit pas s'ouvrir avant que le nouveau mot de passe soit posé.
        if (e === 'PASSWORD_RECOVERY') setRecuperation(true);
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

  if (recuperation)
    return (
      <NouveauMotDePasse
        // « verifie » : tant que la bibliothèque n'a pas lu le lien, on ne sait pas s'il est bon.
        etat={!verifie ? 'verification' : compte ? 'pret' : 'invalide'}
        email={compte?.email ?? null}
        surTermine={() => setRecuperation(false)}
        surLienInvalide={() => {
          setRecuperation(false);
          setLienPerime(true);
        }}
      />
    );

  if (!depot) {
    if (!verifie && compteLocal()) return <div className="chargement">Hameau…</div>;
    return (
      <Connexion
        lienPerime={lienPerime}
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

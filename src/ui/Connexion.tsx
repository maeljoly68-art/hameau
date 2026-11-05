import { useState, type ReactNode } from 'react';
import { cielPour } from '../core/ciel.ts';
import { traduireErreurAuth } from '../core/recuperation.ts';
import { saisonPour } from '../core/saison.ts';
import { APPARENCE_DEFAUT, type Construction } from '../core/types.ts';
import { adresseApp, client } from '../data/config.ts';
import { nomAppareil } from '../data/depot.ts';
import { useMaintenant } from './useHameau.ts';
import { Village } from './Village.tsx';

// Un petit hameau de vitrine, pour montrer d'emblée ce qu'on va faire pousser.
const VITRINE: Construction[] = [
  { id: 'v1', batiment: 'maison', x: 0, y: 1, cout: 0, niveau: 2, construitLe: '' },
  { id: 'v2', batiment: 'arbre', x: 1, y: 0, cout: 0, niveau: 3, construitLe: '' },
  { id: 'v3', batiment: 'moulin', x: 4, y: 1, cout: 0, niveau: 2, construitLe: '' },
  { id: 'v4', batiment: 'fleurs', x: 3, y: 2, cout: 0, niveau: 2, construitLe: '' },
  { id: 'v5', batiment: 'cabane', x: 2, y: 4, cout: 0, niveau: 1, construitLe: '' },
  { id: 'v6', batiment: 'arbre', x: 0, y: 4, cout: 0, niveau: 1, construitLe: '' },
  { id: 'v7', batiment: 'puits', x: 3, y: 4, cout: 0, niveau: 2, construitLe: '' },
];

/** Le gardien de la vitrine, déjà un peu équipé : de quoi donner envie. */
const VITRINE_PERSO = { ...APPARENCE_DEFAUT, chapeau: 'paille', compagnon: 'chat', accessoire: 'livre' };

/**
 * Supabase fait attendre 60 s entre deux e-mails à la même personne : le
 * bouton « renvoyer » ne s'allume qu'après, plutôt que de laisser cliquer
 * pour une erreur certaine.
 */
const ATTENTE_RENVOI_S = 60;

/** La scène de vitrine et le titre, communs à tous les écrans d'avant la connexion. */
export function CadreConnexion({ accroche, children }: { accroche: string; children: ReactNode }) {
  const [ciel] = useState(() => cielPour(new Date()));
  const [saison] = useState(() => saisonPour(new Date()));
  return (
    <main className="connexion">
      <div className="connexion-scene">
        <Village niveau={1} constructions={VITRINE} actif ciel={ciel} saison={saison} apparence={VITRINE_PERSO} />
      </div>
      <div className="connexion-corps">
        <h1>Hameau</h1>
        <p className="accroche">{accroche}</p>
        {children}
      </div>
    </main>
  );
}

/** Après la demande : ce qu'on attend de la personne, et de quoi redemander sans taper dans la limite d'envoi. */
function LienEnvoye({ email, message, occupe, surRenvoyer, surRetour }: { email: string; message: string | null; occupe: boolean; surRenvoyer: () => void; surRetour: () => void }) {
  // Remonté à chaque envoi (clé) : le décompte repart de zéro.
  const [debut] = useState(() => Date.now());
  const maintenant = useMaintenant(1000);
  const reste = Math.max(0, ATTENTE_RENVOI_S - Math.floor((maintenant - debut) / 1000));
  const apple = ['iPhone', 'iPad'].includes(nomAppareil());
  return (
    <section className="carte" aria-live="polite">
      <h2>Regarde ta boîte mail</h2>
      <p>
        Si un compte existe pour <strong>{email}</strong>, un lien vient de lui être envoyé. Il ne sert qu’une fois et expire au bout d’une heure.
      </p>
      <p className="aide">Rien reçu ? Regarde dans les courriers indésirables.</p>
      {apple && <p className="aide">Sur iPhone et iPad, le lien s’ouvre dans Safari : choisis-y ton nouveau mot de passe, puis reconnecte-toi ici avec.</p>}
      {message && <p className="alerte douce">{message}</p>}
      <button type="button" className="bouton discret" disabled={occupe || reste > 0} onClick={surRenvoyer}>
        {occupe ? '…' : reste > 0 ? `Renvoyer le lien (${reste} s)` : 'Renvoyer le lien'}
      </button>
      <button type="button" className="lien" onClick={surRetour}>
        Retour à la connexion
      </button>
    </section>
  );
}

/**
 * Connexion par email + mot de passe. Pas de lien magique : sur iPhone, le
 * lien s'ouvre dans Safari et non dans l'app posée sur l'écran d'accueil, qui
 * a son propre stockage — on resterait déconnecté dans l'app. Le lien du mot
 * de passe oublié a le même défaut, mais il ne sert qu'à CHOISIR un mot de
 * passe : on se connecte ensuite, dans l'app, avec celui-là.
 *
 * `lienPerime` : la personne arrive d'un lien de récupération qui ne marche
 * plus (déjà ouvert, ou plus d'une heure) ; on lui ouvre la demande d'un neuf.
 */
export function Connexion({ surSansCompte, lienPerime = false }: { surSansCompte: () => void; lienPerime?: boolean }) {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [mode, setMode] = useState<'connexion' | 'inscription' | 'oubli'>(lienPerime ? 'oubli' : 'connexion');
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  /** L'adresse à laquelle un lien vient d'être demandé, une fois la demande acceptée. */
  const [lienEnvoye, setLienEnvoye] = useState<string | null>(null);
  const [envois, setEnvois] = useState(0);
  // Dit une fois : revenu à la connexion, on ne la rejoue pas à la prochaine demande.
  const [avertir, setAvertir] = useState(lienPerime);

  const envoyer = async () => {
    setOccupe(true);
    setMessage(null);
    try {
      const sb = await client();
      const r =
        mode === 'connexion'
          ? await sb.auth.signInWithPassword({ email, password: motDePasse })
          : await sb.auth.signUp({
              email,
              password: motDePasse,
              // Le lien de confirmation ramène à l'app, pas à l'adresse par défaut du projet.
              options: { emailRedirectTo: adresseApp() },
            });
      if (r.error) setMessage(traduireErreurAuth(r.error.message, r.error.code));
      else if (mode === 'inscription' && !r.data.session) setMessage('Compte créé. Confirme ton adresse via l’email reçu, puis connecte-toi ici.');
    } catch {
      setMessage('Impossible de joindre le serveur. Vérifie ta connexion.');
    } finally {
      setOccupe(false);
    }
  };

  const demanderLien = async () => {
    setOccupe(true);
    setMessage(null);
    try {
      const sb = await client();
      const adresse = email.trim();
      const r = await sb.auth.resetPasswordForEmail(adresse, { redirectTo: adresseApp() });
      if (r.error) setMessage(traduireErreurAuth(r.error.message, r.error.code));
      else {
        setLienEnvoye(adresse);
        setEnvois((n) => n + 1);
      }
    } catch {
      setMessage('Impossible de joindre le serveur. Vérifie ta connexion.');
    } finally {
      setOccupe(false);
    }
  };

  const retour = () => {
    setMode('connexion');
    setMessage(null);
    setLienEnvoye(null);
    setAvertir(false);
  };

  return (
    <CadreConnexion accroche="Chaque minute de concentration fait grandir ton village.">
      {mode === 'oubli' ? (
        lienEnvoye ? (
          <LienEnvoye key={envois} email={lienEnvoye} message={message} occupe={occupe} surRenvoyer={() => void demanderLien()} surRetour={retour} />
        ) : (
          <form
            className="carte"
            onSubmit={(e) => {
              e.preventDefault();
              void demanderLien();
            }}
          >
            <h2>Mot de passe oublié</h2>
            {avertir && <p className="alerte douce">Ce lien n’est plus valable : il ne sert qu’une fois et expire au bout d’une heure. Demandes-en un nouveau.</p>}
            <p className="aide">Entre l’adresse de ton compte : on t’envoie un lien pour choisir un nouveau mot de passe.</p>
            <label>
              Email
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {message && <p className="alerte douce">{message}</p>}
            <button className="bouton gros" disabled={occupe}>
              {occupe ? '…' : 'Envoyer le lien'}
            </button>
            <button type="button" className="lien" onClick={retour}>
              Retour à la connexion
            </button>
          </form>
        )
      ) : (
        <form
          className="carte"
          onSubmit={(e) => {
            e.preventDefault();
            void envoyer();
          }}
        >
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Mot de passe
            {/* Le minimum ne vaut qu'à la création : à la connexion, il bloquerait quelqu'un dont le mot de passe, plus court, existe déjà. */}
            <input type="password" autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'} required minLength={mode === 'inscription' ? 8 : undefined} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
          </label>
          {mode === 'connexion' && (
            <button
              type="button"
              className="lien lien-a-droite"
              onClick={() => {
                setMessage(null);
                setMode('oubli');
              }}
            >
              Mot de passe oublié ?
            </button>
          )}
          {message && <p className="alerte douce">{message}</p>}
          <button className="bouton gros" disabled={occupe}>
            {occupe ? '…' : mode === 'connexion' ? 'Se connecter' : 'Créer le compte'}
          </button>
          <button
            type="button"
            className="lien"
            onClick={() => {
              setMessage(null);
              setMode(mode === 'connexion' ? 'inscription' : 'connexion');
            }}
          >
            {mode === 'connexion' ? 'Pas encore de compte ? En créer un' : 'Déjà un compte ? Se connecter'}
          </button>
        </form>
      )}
      <button className="lien" onClick={surSansCompte}>
        Essayer sans compte (données sur cet appareil seulement)
      </button>
    </CadreConnexion>
  );
}

import { useState } from 'react';
import { estSessionPerdue, MOT_DE_PASSE_MIN, traduireErreurAuth, validerNouveauMotDePasse } from '../core/recuperation.ts';
import { client } from '../data/config.ts';
import { CadreConnexion } from './Connexion.tsx';

export type EtatRecuperation =
  /** Le lien est en cours de lecture : on ne sait pas encore s'il est bon. */
  | 'verification'
  /** Le lien a ouvert une connexion : on peut choisir le mot de passe. */
  | 'pret'
  /** Lu, mais plus de connexion derrière : périmé, déjà ouvert, ou supprimé ailleurs. */
  | 'invalide';

/**
 * L'écran où l'on choisit son nouveau mot de passe, après le lien reçu par
 * e-mail. Le lien a OUVERT une connexion : sans cet écran, l'app s'ouvrirait
 * directement, et la personne ne pourrait plus jamais poser son mot de passe.
 */
export function NouveauMotDePasse({ etat, email, surTermine, surLienInvalide }: { etat: EtatRecuperation; email: string | null; surTermine: () => void; surLienInvalide: () => void }) {
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [voir, setVoir] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [fait, setFait] = useState(false);

  const enregistrer = async () => {
    const erreur = validerNouveauMotDePasse(motDePasse, confirmation);
    if (erreur) return setMessage(erreur);
    setOccupe(true);
    setMessage(null);
    try {
      const sb = await client();
      const r = await sb.auth.updateUser({ password: motDePasse });
      if (!r.error) setFait(true);
      else if (estSessionPerdue(r.error.message, r.error.code)) {
        // La connexion du lien a disparu entre-temps : il n'y a plus rien à
        // réessayer ici, il faut un lien neuf. L'app, elle, se croit encore
        // connectée : sans cette sortie locale, elle s'ouvrirait sur un compte
        // qui n'a plus de session derrière.
        await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
        surLienInvalide();
      } else setMessage(traduireErreurAuth(r.error.message, r.error.code));
    } catch {
      setMessage('Impossible de joindre le serveur. Vérifie ta connexion.');
    } finally {
      setOccupe(false);
    }
  };

  if (fait)
    return (
      <CadreConnexion accroche="Tout est prêt.">
        <section className="carte" aria-live="polite">
          <h2>Mot de passe modifié</h2>
          <p>Tu peux te connecter avec ce nouveau mot de passe sur tous tes appareils.</p>
          <button className="bouton gros" onClick={surTermine}>
            Ouvrir mon hameau
          </button>
        </section>
      </CadreConnexion>
    );

  if (etat === 'verification')
    return (
      <CadreConnexion accroche="Un instant…">
        <section className="carte" aria-live="polite">
          <p>Vérification du lien…</p>
          {/* Hors connexion, la vérification ne finirait jamais : on ne garde personne enfermé ici. */}
          <button className="lien" onClick={surTermine}>
            Annuler
          </button>
        </section>
      </CadreConnexion>
    );

  if (etat === 'invalide')
    return (
      <CadreConnexion accroche="Ce lien ne marche plus.">
        <section className="carte">
          <h2>Lien expiré</h2>
          <p>Il ne sert qu’une fois et expire au bout d’une heure. On t’en envoie un neuf en une minute.</p>
          <button className="bouton gros" onClick={surLienInvalide}>
            Demander un nouveau lien
          </button>
        </section>
      </CadreConnexion>
    );

  return (
    <CadreConnexion accroche="Choisis ton nouveau mot de passe.">
      <form
        className="carte"
        onSubmit={(e) => {
          e.preventDefault();
          void enregistrer();
        }}
      >
        <h2>Nouveau mot de passe</h2>
        {email && (
          <p className="aide">
            Pour le compte <strong>{email}</strong>.
          </p>
        )}
        <label>
          Nouveau mot de passe
          <input type={voir ? 'text' : 'password'} autoComplete="new-password" required autoFocus value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
        </label>
        <label>
          Confirme le mot de passe
          <input type={voir ? 'text' : 'password'} autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </label>
        <p className="aide petite">{MOT_DE_PASSE_MIN} caractères au moins.</p>
        <button type="button" className="lien lien-a-droite" onClick={() => setVoir(!voir)} aria-pressed={voir}>
          {voir ? 'Masquer' : 'Afficher'} les mots de passe
        </button>
        {message && <p className="alerte douce">{message}</p>}
        <button className="bouton gros" disabled={occupe}>
          {occupe ? '…' : 'Enregistrer le mot de passe'}
        </button>
        <button type="button" className="lien" onClick={surTermine}>
          Plus tard
        </button>
      </form>
    </CadreConnexion>
  );
}

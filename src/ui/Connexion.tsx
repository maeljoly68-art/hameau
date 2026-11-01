import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Connexion par email + mot de passe. Pas de lien magique : sur iPhone, le
 * lien s'ouvre dans Safari et non dans l'app posée sur l'écran d'accueil, qui
 * a son propre stockage — on resterait déconnecté dans l'app.
 */
export function Connexion({ sb, surSansCompte }: { sb: SupabaseClient; surSansCompte: () => void }) {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const envoyer = async () => {
    setOccupe(true);
    setMessage(null);
    const r = mode === 'connexion' ? await sb.auth.signInWithPassword({ email, password: motDePasse }) : await sb.auth.signUp({
            email,
            password: motDePasse,
            // Le lien de confirmation ramène à l'app, pas à l'adresse par défaut du projet.
            options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, location.origin).href },
          });
    setOccupe(false);
    if (r.error) setMessage(r.error.message);
    else if (mode === 'inscription' && !r.data.session) setMessage('Compte créé. Confirme ton adresse via l’email reçu, puis connecte-toi ici.');
  };

  return (
    <main className="connexion">
      <h1>Hameau</h1>
      <p className="accroche">Chaque minute de concentration fait grandir ton village.</p>
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
          <input type="password" autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'} required minLength={8} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
        </label>
        {message && <p className="alerte douce">{message}</p>}
        <button className="bouton" disabled={occupe}>
          {mode === 'connexion' ? 'Se connecter' : 'Créer le compte'}
        </button>
        <button type="button" className="bouton discret" onClick={() => setMode(mode === 'connexion' ? 'inscription' : 'connexion')}>
          {mode === 'connexion' ? 'Pas encore de compte ? En créer un' : 'Déjà un compte ? Se connecter'}
        </button>
      </form>
      <button className="lien" onClick={surSansCompte}>
        Essayer sans compte (données sur cet appareil seulement)
      </button>
    </main>
  );
}

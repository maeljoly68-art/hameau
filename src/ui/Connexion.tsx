import { useState } from 'react';
import { saisonPour } from '../core/saison.ts';
import { APPARENCE_DEFAUT, type Construction } from '../core/types.ts';
import { client } from '../data/config.ts';
import { cielPour } from '../core/ciel.ts';
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
 * Connexion par email + mot de passe. Pas de lien magique : sur iPhone, le
 * lien s'ouvre dans Safari et non dans l'app posée sur l'écran d'accueil, qui
 * a son propre stockage — on resterait déconnecté dans l'app.
 */
export function Connexion({ surSansCompte }: { surSansCompte: () => void }) {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [ciel] = useState(() => cielPour(new Date()));
  const [saison] = useState(() => saisonPour(new Date()));

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
              options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, location.origin).href },
            });
      if (r.error) setMessage(traduire(r.error.message));
      else if (mode === 'inscription' && !r.data.session) setMessage('Compte créé. Confirme ton adresse via l’email reçu, puis connecte-toi ici.');
    } catch {
      setMessage('Impossible de joindre le serveur. Vérifie ta connexion.');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <main className="connexion">
      <div className="connexion-scene">
        <Village niveau={1} constructions={VITRINE} actif ciel={ciel} saison={saison} apparence={VITRINE_PERSO} />
      </div>
      <div className="connexion-corps">
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
          <button className="bouton gros" disabled={occupe}>
            {occupe ? '…' : mode === 'connexion' ? 'Se connecter' : 'Créer le compte'}
          </button>
          <button type="button" className="lien" onClick={() => setMode(mode === 'connexion' ? 'inscription' : 'connexion')}>
            {mode === 'connexion' ? 'Pas encore de compte ? En créer un' : 'Déjà un compte ? Se connecter'}
          </button>
        </form>
        <button className="lien" onClick={surSansCompte}>
          Essayer sans compte (données sur cet appareil seulement)
        </button>
      </div>
    </main>
  );
}

/** Les messages d'erreur de Supabase arrivent en anglais. */
function traduire(m: string): string {
  if (/invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
  if (/email not confirmed/i.test(m)) return 'Adresse pas encore confirmée : clique sur le lien reçu par email.';
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cette adresse.';
  if (/password should be/i.test(m)) return 'Mot de passe trop court (8 caractères minimum).';
  return m;
}

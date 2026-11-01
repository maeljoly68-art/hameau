import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clePublique, urlSupabase } from '../data/config.ts';
import type { Donnees } from '../data/depot.ts';

function Copier({ texte }: { texte: string }) {
  const [fait, setFait] = useState(false);
  return (
    <button
      className="bouton petit discret"
      onClick={() => {
        void navigator.clipboard.writeText(texte).then(() => {
          setFait(true);
          window.setTimeout(() => setFait(false), 1500);
        });
      }}
    >
      {fait ? 'Copié ✓' : 'Copier'}
    </button>
  );
}

function Champ({ nom, valeur }: { nom: string; valeur: string }) {
  return (
    <div className="champ-copie">
      <span className="champ-nom">{nom}</span>
      <code>{valeur}</code>
      <Copier texte={valeur} />
    </div>
  );
}

export function Reglages({
  sb,
  email,
  synchronise,
  donnees,
  surDeconnexion,
  surImporter,
}: {
  sb: SupabaseClient | null;
  email: string | null;
  synchronise: boolean;
  donnees: Donnees;
  surDeconnexion: () => void;
  surImporter?: () => void;
}) {
  const [jeton, setJeton] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const creerJeton = async () => {
    if (!sb) return;
    if (!confirm('Créer un nouveau jeton ? L’ancien (s’il existe) cessera de fonctionner dans tes raccourcis.')) return;
    const r = await sb.rpc('hameau_nouveau_jeton');
    if (r.error) setErreur(r.error.message);
    else setJeton(r.data as string);
  };

  const exporter = () => {
    const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hameau-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const urlRpc = `${urlSupabase}/rest/v1/rpc/hameau_raccourci`;

  return (
    <>
      <section className="carte">
        <h2>Compte</h2>
        {synchronise ? (
          <p>
            Connecté : <strong>{email}</strong>. Tes sessions sont synchronisées entre le téléphone, l’iPad et l’ordinateur.
          </p>
        ) : (
          <p>Mode local : les données restent sur cet appareil uniquement.</p>
        )}
        <div className="actions gauche">
          {synchronise ? (
            <button className="bouton discret" onClick={surDeconnexion}>
              Se déconnecter
            </button>
          ) : (
            sb && (
              <button className="bouton" onClick={surDeconnexion}>
                Créer un compte / se connecter
              </button>
            )
          )}
          {synchronise && surImporter && (
            <button className="bouton discret" onClick={surImporter}>
              Importer les données locales de cet appareil
            </button>
          )}
          <button className="bouton discret" onClick={exporter}>
            Exporter mes données (JSON)
          </button>
        </div>
      </section>

      <section className="carte">
        <h2>Installer l’application</h2>
        <details>
          <summary>iPhone et iPad</summary>
          <ol>
            <li>Ouvre cette page dans <strong>Safari</strong>.</li>
            <li>
              Touche le bouton <strong>Partager</strong> (carré avec une flèche), puis <strong>Sur l’écran d’accueil</strong>.
            </li>
            <li>L’icône Hameau s’ouvre ensuite en plein écran, comme une app. Aucun App Store, aucun compte développeur.</li>
          </ol>
        </details>
        <details>
          <summary>Windows (Edge ou Chrome)</summary>
          <ol>
            <li>
              Dans la barre d’adresse, clique sur l’icône <strong>Installer</strong> (ou menu ⋯ → Applications → Installer ce site en tant qu’application).
            </li>
            <li>Hameau apparaît dans le menu Démarrer ; tu peux l’épingler à la barre des tâches.</li>
            <li>
              Pendant une session, le bouton <strong>Mini-chrono</strong> ouvre une petite fenêtre toujours au premier plan, que tu peux poser dans un coin de l’écran.
            </li>
          </ol>
        </details>
      </section>

      <section className="carte">
        <h2>Raccourcis iPhone / iPad</h2>
        {!synchronise ? (
          <p className="aide">Les raccourcis demandent un compte : ils parlent au serveur, pas à cet appareil.</p>
        ) : (
          <>
            <p>
              Un raccourci lance ou arrête une session sans ouvrir l’app — depuis l’écran d’accueil, un widget, le bouton Action de l’iPhone, ou en disant « Dis Siri, focus ».
            </p>
            {!jeton ? (
              <button className="bouton" onClick={() => void creerJeton()}>
                Créer mon jeton de raccourci
              </button>
            ) : (
              <>
                <p className="alerte douce">Note ce jeton maintenant : il ne sera plus jamais affiché. Il donne accès à tes sessions, ne le partage pas.</p>
                <Champ nom="Jeton" valeur={jeton} />
              </>
            )}
            {erreur && <p className="alerte">{erreur}</p>}
            <details>
              <summary>Construire le raccourci « Focus » (5 minutes, une seule fois)</summary>
              <ol>
                <li>
                  App <strong>Raccourcis</strong> → <strong>+</strong> → nomme-le « Focus ».
                </li>
                <li>
                  Ajoute l’action <strong>Obtenir le contenu de l’URL</strong> avec cette URL :
                  <Champ nom="URL" valeur={urlRpc} />
                </li>
                <li>
                  Déplie l’action : Méthode <strong>POST</strong>. En-têtes : ajoute <code>apikey</code> avec la valeur ci-dessous, et <code>Content-Type</code> = <code>application/json</code>.
                  <Champ nom="apikey" valeur={clePublique} />
                </li>
                <li>
                  Corps de la requête : <strong>JSON</strong>, avec les champs (tous de type Texte) :
                  <ul>
                    <li>
                      <code>p_jeton</code> = ton jeton
                    </li>
                    <li>
                      <code>p_action</code> = <code>basculer</code> (démarre si rien ne tourne, arrête sinon)
                    </li>
                    <li>
                      <code>p_description</code> = la variable « Texte demandé » (voir étape 6), facultatif
                    </li>
                  </ul>
                </li>
                <li>
                  Ajoute <strong>Obtenir la valeur du dictionnaire</strong> → clé <code>message</code>, puis <strong>Afficher la notification</strong> avec ce message.
                </li>
                <li>
                  (Facultatif) Pour écrire ce que tu as fait en arrêtant : mets en tête l’action <strong>Demander une entrée</strong> (« Qu’as-tu fait ? ») et branche sa réponse sur <code>p_description</code>. Au démarrage, laisse vide.
                </li>
              </ol>
              <p className="aide">
                Autres actions possibles pour <code>p_action</code> : <code>demarrer</code>, <code>arreter</code>, <code>etat</code>. Tu peux aussi passer <code>p_categorie</code>.
              </p>
            </details>
            <details>
              <summary>Voir le chrono sur l’écran verrouillé</summary>
              <p>
                Une app web ne peut pas afficher d’« activité en direct » sur l’écran verrouillé : c’est réservé aux apps de l’App Store. L’astuce : dans le raccourci de démarrage, ajoute l’action <strong>Démarrer le minuteur</strong> (app Horloge) réglée sur ta durée habituelle — 25, 50 ou 90 min.
                Le minuteur d’iOS s’affiche alors sur l’écran verrouillé et dans la Dynamic Island, et sonne à la fin du bloc.
              </p>
              <p>
                Encore mieux : ajoute aussi <strong>Activer le mode Concentration</strong> pour couper les notifications pendant la session.
              </p>
            </details>
          </>
        )}
      </section>
    </>
  );
}

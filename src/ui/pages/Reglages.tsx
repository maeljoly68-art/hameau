import { useState } from 'react';
import { versCsv } from '../../core/export.ts';
import { PROFIL_DEFAUT, type Profil } from '../../core/types.ts';
import { client, clePublique, urlSupabase } from '../../data/config.ts';
import type { Donnees } from '../../data/depot.ts';
import { carillon } from '../alertes.ts';
import { appliquerTheme, lireTheme, type Theme } from '../theme.ts';
import { BloquerSites } from './BloquerSites.tsx';
import { RappelPush } from './RappelPush.tsx';
// Le script du widget (app Scriptable), copié tel quel par la personne : la même source que celle que testent les tests.
import scriptWidget from '../../../scriptable/hameau-widget.js?raw';

function telecharger(nom: string, contenu: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenu], { type }));
  a.download = nom;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Apparence() {
  const [theme, setTheme] = useState<Theme>(lireTheme);
  const choix: { id: Theme; nom: string }[] = [
    { id: 'auto', nom: 'Automatique' },
    { id: 'sombre', nom: 'Sombre' },
    { id: 'clair', nom: 'Clair' },
  ];
  return (
    <section className="carte">
      <h2>Apparence</h2>
      <div className="puces" role="group" aria-label="Thème">
        {choix.map((c) => (
          <button
            key={c.id}
            className={theme === c.id ? 'puce choisie' : 'puce'}
            aria-pressed={theme === c.id}
            onClick={() => {
              setTheme(c.id);
              appliquerTheme(c.id, true);
            }}
          >
            {c.nom}
          </button>
        ))}
      </div>
      <p className="aide">« Automatique » suit le réglage clair ou sombre de l’appareil. Le village, lui, suit l’heure et la saison.</p>
    </section>
  );
}

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

const OBJECTIFS_JOUR = [30, 60, 90, 120, 180, 240, 300, 360];

function FormulaireProfil({ profil, surEnregistrer }: { profil: Profil; surEnregistrer: (p: Profil) => void }) {
  const [nom, setNom] = useState(profil.nomHameau);
  const [objectif, setObjectif] = useState(profil.objectifJour);
  const nomPropre = nom.trim().slice(0, 40);
  const modifie = nomPropre !== profil.nomHameau || objectif !== profil.objectifJour;
  return (
    <form
      className="carte"
      onSubmit={(e) => {
        e.preventDefault();
        surEnregistrer({ ...profil, nomHameau: nomPropre || PROFIL_DEFAUT.nomHameau, objectifJour: objectif });
      }}
    >
      <h2>Ton hameau</h2>
      <label>
        Nom du hameau
        <input value={nom} maxLength={40} onChange={(e) => setNom(e.target.value)} placeholder={PROFIL_DEFAUT.nomHameau} />
      </label>
      <label>
        Objectif quotidien
        <div className="puces">
          {OBJECTIFS_JOUR.map((m) => (
            <button type="button" key={m} className={m === objectif ? 'puce choisie' : 'puce'} onClick={() => setObjectif(m)}>
              {m < 60 ? `${m} min` : `${m / 60} h`}
            </button>
          ))}
        </div>
      </label>
      <p className="aide">Il sert d’échelle au calendrier de régularité et à l’anneau « Aujourd’hui ».</p>
      <div className="actions gauche">
        <button className="bouton" disabled={!modifie}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}

function Notifications() {
  const dispo = 'Notification' in window;
  const [etat, setEtat] = useState<NotificationPermission | 'indisponible'>(dispo ? Notification.permission : 'indisponible');
  return (
    <section className="carte">
      <h2>Fin d’objectif</h2>
      <p>Quand une session atteint sa durée visée, Hameau joue un petit carillon et peut t’envoyer une notification.</p>
      <div className="actions gauche">
        <button className="bouton discret" onClick={carillon}>
          Écouter le carillon
        </button>
        {etat === 'default' && (
          <button className="bouton" onClick={() => void Notification.requestPermission().then(setEtat)}>
            Activer les notifications
          </button>
        )}
      </div>
      {etat === 'granted' && <p className="aide">Notifications activées sur cet appareil.</p>}
      {etat === 'denied' && <p className="aide">Notifications refusées : réactive-les dans les réglages du navigateur.</p>}
      {etat === 'indisponible' && <p className="aide">Sur iPhone, les notifications ne marchent que dans l’app installée sur l’écran d’accueil. Le raccourci « Focus » avec un minuteur reste le plus fiable.</p>}
    </section>
  );
}

export default function Reglages({
  email,
  synchronise,
  donnees,
  surProfil,
  surDeconnexion,
  surImporter,
}: {
  email: string | null;
  synchronise: boolean;
  donnees: Donnees;
  surProfil: (p: Profil) => void;
  surDeconnexion: () => void;
  surImporter?: () => void;
}) {
  const [jeton, setJeton] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const creerJeton = async () => {
    if (!confirm('Créer un nouveau jeton ? L’ancien (s’il existe) cessera de fonctionner dans tes raccourcis.')) return;
    const r = await (await client()).rpc('hameau_nouveau_jeton');
    if (r.error) setErreur(r.error.message);
    else setJeton(r.data as string);
  };

  const jour = new Date().toISOString().slice(0, 10);
  const exporterJson = () => telecharger(`hameau-${jour}.json`, JSON.stringify(donnees, null, 2), 'application/json');
  // Le BOM fait reconnaître l'UTF-8 à Excel : sans lui, « Études » s'affiche « Ã‰tudes ».
  const exporterCsv = () => telecharger(`hameau-${jour}.csv`, '\ufeff' + versCsv(donnees.sessions), 'text/csv;charset=utf-8');

  const urlRpc = `${urlSupabase}/rest/v1/rpc/hameau_raccourci`;

  return (
    <div className="pile">
      <FormulaireProfil key={`${donnees.profil.nomHameau}|${donnees.profil.objectifJour}`} profil={donnees.profil} surEnregistrer={surProfil} />
      <Apparence />
      <Notifications />
      {synchronise && <RappelPush />}
      <BloquerSites />

      <section className="carte">
        <h2>Raccourcis iPhone / iPad</h2>
        {!synchronise ? (
          <p className="aide">Les raccourcis demandent un compte : ils parlent au serveur, pas à cet appareil.</p>
        ) : (
          <>
            <p>Lance et arrête une session sans ouvrir l’app : écran d’accueil, bouton Action, ou « Dis Siri, Focus ».</p>
            {!jeton ? (
              <div className="actions gauche">
                <button className="bouton discret" onClick={() => void creerJeton()}>
                  Créer un nouveau jeton
                </button>
              </div>
            ) : (
              <>
                <p className="alerte douce">Note ce jeton maintenant : il ne sera plus jamais affiché. Il donne accès à tes sessions, ne le partage pas.</p>
                <Champ nom="Jeton" valeur={jeton} />
              </>
            )}
            {erreur && <p className="alerte">{erreur}</p>}
            <details>
              <summary>Les réglages communs aux raccourcis</summary>
              <p>
                Action <strong>Obtenir le contenu de l’URL</strong> (<em>Get Contents of URL</em>), méthode <strong>POST</strong> :
              </p>
              <Champ nom="URL" valeur={urlRpc} />
              <p>
                En-têtes : <code>apikey</code> et <code>Content-Type</code> = <code>application/json</code>.
              </p>
              <Champ nom="apikey" valeur={clePublique} />
              <p>
                Corps JSON : <code>p_jeton</code> (ton jeton) et <code>p_action</code>. Ensuite <strong>Obtenir la valeur du dictionnaire</strong> (<em>Get Dictionary Value</em>, clé <code>message</code>) puis <strong>Afficher la notification</strong> (<em>Show Notification</em>).
              </p>
            </details>
            <details>
              <summary>« Focus » — démarrer</summary>
              <ul>
                <li>
                  <code>p_action</code> = <code>demarrer</code>
                </li>
                <li>
                  Facultatif : <code>p_objectif</code> (<strong>Nombre</strong>) = <code>50</code> — l’app affiche alors l’anneau vers l’objectif et le compte à rebours.
                </li>
                <li>
                  Facultatif : <code>p_categorie</code> = <code>Travail</code>, <code>Études</code>…
                </li>
                <li>
                  En dernier, <strong>Démarrer le minuteur</strong> (<em>Start Timer</em>) sur la même durée : c’est lui qui s’affiche sur l’écran verrouillé et dans la Dynamic Island.
                </li>
                <li>
                  Pour « Ne pas déranger » dès le départ : <strong>Définir la concentration</strong> (<em>Set Focus</em>) → <strong>Hameau</strong>, <strong>Activer</strong> (voir « Pendant le chrono » plus bas).
                </li>
              </ul>
            </details>
            <details>
              <summary>« Fin » — arrêter et dire ce que tu as fait</summary>
              <ul>
                <li>
                  En premier, <strong>Demander une entrée</strong> (<em>Ask for Input</em>) : « Qu’as-tu fait ? »
                </li>
                <li>
                  <code>p_action</code> = <code>arreter</code>, et <code>p_description</code> = la variable <em>Provided Input</em>.
                </li>
                <li>
                  En dernier, <strong>Définir la concentration</strong> → <strong>Hameau</strong>, <strong>Désactiver</strong>.
                </li>
              </ul>
            </details>
            <details>
              <summary>Widget : le chrono sur l’écran d’accueil et l’écran verrouillé</summary>
              <p>
                Une app web ne peut pas créer de widget : l’app gratuite <strong>Scriptable</strong> le fait à sa place. Le temps de travail défile à la seconde (pauses déduites), se fige pendant une pause, et le widget dit quand aucun chrono ne tourne.
              </p>
              <ol>
                <li>
                  Installe <strong>Scriptable</strong> (App Store, gratuit).
                </li>
                <li>
                  Copie le script <Copier texte={scriptWidget} />, puis dans Scriptable : <strong>+</strong>, colle, et nomme-le <strong>Hameau</strong> (touche le titre en haut).
                </li>
                <li>
                  <strong>Écran d’accueil</strong> : appui long sur l’écran → <strong>Modifier</strong> (<em>Edit</em>) → <strong>Ajouter un widget</strong> (<em>Add Widget</em>) → Scriptable → petit ou moyen. Puis appui long sur le widget → <strong>Modifier le widget</strong> (<em>Edit Widget</em>) : <em>Script</em> = Hameau, <em>Parameter</em> = ton jeton.
                </li>
                <li>
                  <strong>Écran verrouillé</strong> : appui long → <strong>Personnaliser</strong> (<em>Customize</em>) → écran verrouillé → la zone des widgets → Scriptable (rectangle, rond, ou la ligne au-dessus de l’heure) → touche-le : <em>Script</em> = Hameau, <em>Parameter</em> = ton jeton.
                </li>
              </ol>
              <p className="aide">
                Le temps défile tout seul ; un démarrage, une pause ou un arrêt s’y voient quand iOS rafraîchit le widget, en général en quelques minutes. Toucher le widget ouvre Hameau.
              </p>
            </details>
            <details>
              <summary>Dynamic Island</summary>
              <p>
                Seules les apps de l’App Store peuvent s’y afficher, pas une app web ni un widget Scriptable. Le minuteur de l’Horloge, lui, y va : c’est la dernière action de « Focus — démarrer » (<strong>Démarrer le minuteur</strong>, sur la durée de ton objectif). Il compte à rebours jusqu’à ton objectif, dans la Dynamic Island et sur l’écran verrouillé.
              </p>
            </details>
            <details>
              <summary>Pendant le chrono : « Ne pas déranger », et Snapchat, Vinted, leboncoin, Beebs fermés</summary>
              <p>
                Une automatisation de l’iPhone : chaque fois que tu ouvres une de ces apps, elle demande à Hameau si un chrono tourne — lancé ici, sur l’ordinateur ou par un raccourci. Si oui, elle met « Ne pas déranger » et te renvoie à l’écran d’accueil. Sinon, l’app s’ouvre normalement. En pause, elles restent permises.
              </p>
              <ol>
                <li>
                  <strong>Une concentration pour le chrono.</strong> Réglages de l’iPhone → <strong>Concentration</strong> → <strong>+</strong> → <strong>Personnalisé</strong>, nom <strong>Hameau</strong>. Notifications : aucune personne, aucune app. C’est un « Ne pas déranger » réservé au chrono : l’éteindre à la fin ne coupe jamais celui de ta nuit.
                </li>
                <li>
                  <strong>Le raccourci « Hameau · Garde »</strong> (app Raccourcis → <strong>+</strong>) :
                  <ol>
                    <li>
                      <strong>Obtenir le contenu de l’URL</strong> : les réglages communs ci-dessus, avec <code>p_action</code> = <code>etat</code>.
                    </li>
                    <li>
                      <strong>Obtenir la valeur du dictionnaire</strong>, clé <code>etat</code>.
                    </li>
                    <li>
                      <strong>Si</strong> (<em>If</em>) la valeur <strong>est</strong> <code>en_cours</code> : <strong>Définir la concentration</strong> → <strong>Hameau</strong>, <strong>Activer</strong> (jusqu’à désactivation) ; <strong>Afficher la notification</strong> « Chrono en cours : ce sera après. » ; <strong>Aller à l’écran d’accueil</strong> (<em>Go to Home Screen</em>).
                    </li>
                    <li>
                      <strong>Sinon</strong> : <strong>Définir la concentration</strong> → <strong>Hameau</strong>, <strong>Désactiver</strong>. Un chrono arrêté ailleurs (sur l’ordinateur) range ainsi « Ne pas déranger » à la prochaine ouverture.
                    </li>
                  </ol>
                </li>
                <li>
                  <strong>L’automatisation.</strong> Onglet <strong>Automatisation</strong> → <strong>+</strong> → <strong>App</strong> → <strong>Choisir</strong> : Snapchat, Vinted, leboncoin, Beebs → <strong>Est ouverte</strong> → <strong>Exécuter immédiatement</strong>, et désactive « Avertir lors de l’exécution ». Action : <strong>Exécuter le raccourci</strong> → « Hameau · Garde ».
                </li>
                <li>
                  <strong>Au lancement.</strong> Ajoute la concentration Hameau à « Focus — démarrer » et à « Fin » (ci-dessus). Un chrono lancé dans l’app ou sur l’ordinateur met « Ne pas déranger » en place dès que tu ouvres une de ces apps.
                </li>
              </ol>
              <p className="aide">
                Sans réseau, Hameau ne peut pas répondre : l’app s’ouvre. Un chrono oublié garde les apps fermées : arrête-le dans Hameau. Sur l’ordinateur, l’extension Chrome ferme aussi ces sites pendant le chrono.
              </p>
            </details>
            <details>
              <summary>« Pause » et « Reprise »</summary>
              <p>
                <code>p_action</code> = <code>pause</code> ou <code>reprendre</code>. Le temps de pause est déduit de la session, et donc des points. Arrêter pendant une pause est permis : la pause s’arrête avec la session.
              </p>
            </details>
            <details>
              <summary>« Où j’en suis » — le temps écoulé</summary>
              <p>
                <code>p_action</code> = <code>etat</code>. Réponse : « En session depuis 37 min, encore 13 min avant l’objectif. » Pratique avec Siri ou en widget.
              </p>
            </details>
          </>
        )}
      </section>

      <section className="carte">
        <h2>Installer l’application</h2>
        <details>
          <summary>iPhone et iPad</summary>
          <ol>
            <li>Ouvre cette page dans Safari.</li>
            <li>
              <strong>Partager</strong> → <strong>Sur l’écran d’accueil</strong>.
            </li>
            <li>L’icône Hameau s’ouvre en plein écran, comme une app. Le mode focus garde l’écran allumé : idéal pour un iPad posé sur le bureau.</li>
          </ol>
        </details>
        <details>
          <summary>Windows (Edge ou Chrome)</summary>
          <ol>
            <li>Icône « Installer » dans la barre d’adresse.</li>
            <li>Épingle Hameau à la barre des tâches : le chrono s’affiche dans le titre de la fenêtre.</li>
            <li>
              Le bouton <strong>fenêtre</strong>, sous la ville, ouvre une petite fenêtre toujours au premier plan. <kbd>Espace</kbd> lance ou termine une session, <kbd>F</kbd> passe en mode focus.
            </li>
          </ol>
        </details>
      </section>

      <section className="carte">
        <h2>Compte</h2>
        {synchronise ? (
          <p>
            Connecté : <strong>{email}</strong>. Tout est synchronisé entre tes appareils.
          </p>
        ) : (
          <p>Mode local : les données restent sur cet appareil uniquement.</p>
        )}
        <div className="actions gauche">
          <button className={synchronise ? 'bouton discret' : 'bouton'} onClick={surDeconnexion}>
            {synchronise ? 'Se déconnecter' : 'Créer un compte / se connecter'}
          </button>
          {surImporter && (
            <button className="bouton discret" onClick={surImporter}>
              Importer les données locales de cet appareil
            </button>
          )}
          <button className="bouton discret" onClick={exporterCsv}>
            Exporter pour Excel (CSV)
          </button>
          <button className="bouton discret" onClick={exporterJson}>
            Sauvegarde complète (JSON)
          </button>
        </div>
      </section>
    </div>
  );
}

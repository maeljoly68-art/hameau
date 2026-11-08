// Bloquer des sites (YouTube, LinkedIn, Instagram…) tant qu'un chrono tourne : une extension Chrome pour ordinateur.
import { VERSION_EXTENSION, enRetard } from '../../core/extension.ts';
import { useExtension } from '../useExtension.ts';

export function BloquerSites() {
  const ext = useExtension();
  return (
    <section className="carte blocage-sites">
      <h2>Rester concentré pendant le chrono</h2>
      <p className="aide">
        Une extension Chrome (ordinateur) te demande « tu es sûr ? » quand tu changes de site pendant un chrono, et ferme les sites ou les adresses que tu choisis (YouTube, LinkedIn, Instagram, <code>youtube.com/shorts</code>…) — chrono lancé d’ici, du téléphone ou de l’iPad. Tout se relâche dès que tu l’arrêtes.
      </p>
      <p className={ext.etat === 'presente' && !enRetard(ext.version) ? 'aide extension-ok' : 'aide'} role="status">
        {ext.etat === 'presente' ? `Extension détectée dans ce navigateur (version ${ext.version}) ${enRetard(ext.version) ? '' : '✓'}` : ext.etat === 'cherche' ? 'Recherche de l’extension…' : 'Extension non détectée dans ce navigateur.'}
      </p>
      {ext.etat === 'presente' && enRetard(ext.version) && (
        <p className="alerte douce">
          La version {VERSION_EXTENSION} est disponible (la confirmation avant de changer de page, et les adresses précises). Télécharge-la, remplace le dossier « hameau-bloqueur », puis clique sur ⟳ (recharger) sur la carte de l’extension dans <code>chrome://extensions</code>.
        </p>
      )}
      <a className="bouton" href={`${import.meta.env.BASE_URL}hameau-bloqueur.zip`} download="hameau-bloqueur.zip">
        Télécharger l’extension
      </a>
      <details className="explication">
        <summary>Comment l’installer</summary>
        <ol>
          <li>Dézippe le fichier téléchargé : tu obtiens un dossier « hameau-bloqueur ».</li>
          <li>
            Dans Chrome, ouvre <code>chrome://extensions</code> et active le <strong>Mode développeur</strong> (en haut à droite).
          </li>
          <li>
            Clique <strong>Charger l’extension non empaquetée</strong> et choisis le dossier « hameau-bloqueur ». Garde-le : Chrome le relit à chaque démarrage.
          </li>
          <li>Épingle l’extension (icône puzzle), clique dessus et connecte-toi avec le compte de Hameau.</li>
          <li>Pour régler : clic droit sur l’icône → Options. Tu y choisis la question « tu es sûr ? » (délai avant de pouvoir continuer, sites de travail où l’on ne demande jamais rien comme claude.ai) et les pages bloquées : un site entier (<code>youtube.com</code>) ou une adresse (<code>youtube.com/shorts</code>). YouTube, LinkedIn et Instagram sont déjà dans la liste ; Chrome te demandera l’accès aux sites que tu ajoutes.</li>
        </ol>
        <p className="aide petite">
          Hameau et sa base ne se bloquent jamais, pour que tu puisses toujours arrêter ton chrono. L’extension t’aide à tenir ta parole : elle ne t’empêche pas de la désactiver dans Chrome. Sur iPhone et iPad, Safari ne sait pas faire ça ; utilise le mode « Concentration » d’iOS.
        </p>
      </details>
    </section>
  );
}

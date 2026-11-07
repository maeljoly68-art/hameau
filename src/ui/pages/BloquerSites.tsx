// Bloquer des sites (YouTube, LinkedIn, Instagram…) tant qu'un chrono tourne : une extension Chrome pour ordinateur.
import { useExtension } from '../useExtension.ts';

export function BloquerSites() {
  const ext = useExtension();
  return (
    <section className="carte blocage-sites">
      <h2>Bloquer des sites pendant le chrono</h2>
      <p className="aide">
        Une extension Chrome (ordinateur) remplace YouTube, LinkedIn, Instagram… par une page qui te rappelle ton chrono, tant qu’il tourne — lancé d’ici, du téléphone ou de l’iPad. Tout se débloque dès que tu l’arrêtes.
      </p>
      <p className={ext.etat === 'presente' ? 'aide extension-ok' : 'aide'} role="status">
        {ext.etat === 'presente' ? `Extension détectée dans ce navigateur (version ${ext.version}) ✓` : ext.etat === 'cherche' ? 'Recherche de l’extension…' : 'Extension non détectée dans ce navigateur.'}
      </p>
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
          <li>Pour choisir les sites : clic droit sur l’icône → Options. YouTube, LinkedIn et Instagram sont déjà dans la liste ; Chrome te demandera l’accès aux sites que tu ajoutes.</li>
        </ol>
        <p className="aide petite">
          Hameau et sa base ne se bloquent jamais, pour que tu puisses toujours arrêter ton chrono. L’extension t’aide à tenir ta parole : elle ne t’empêche pas de la désactiver dans Chrome. Sur iPhone et iPad, Safari ne sait pas faire ça ; utilise le mode « Concentration » d’iOS.
        </p>
      </details>
    </section>
  );
}

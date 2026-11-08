// Pendant un chrono : dit si l'extension de concentration bloque vraiment les sites, ou pourquoi elle ne le fait pas.
// On n'en dit rien quand l'extension n'est pas là (téléphone, autre navigateur) : personne n'a rien demandé.
import { VERSION_EXTENSION, enRetard } from '../core/extension.ts';
import { useExtension } from './useExtension.ts';

/** Au-delà de ce délai, une extension qui n'a toujours pas vu le chrono mérite qu'on le dise (elle vérifie toutes les 30 s). */
export const ATTENTE_BLOCAGE_S = 45;

export function EtatBlocage({ depuisS }: { depuisS: number }) {
  const ext = useExtension(true);
  if (ext.etat !== 'presente') return null;
  if (enRetard(ext.version))
    return (
      <p className="alerte douce petite etat-blocage" role="status">
        Ton extension de concentration est en version {ext.version} : mets-la à jour (Réglages → télécharger, version {VERSION_EXTENSION}) pour qu’elle te dise si elle bloque.
      </p>
    );
  if (ext.connecte === false)
    return (
      <p className="alerte douce petite etat-blocage" role="status">
        L’extension n’est pas connectée à ton compte : elle ne bloque rien. Clique sur son icône (puzzle → épingle) et connecte-toi.
      </p>
    );
  if (ext.bloque) return <p className="aide petite etat-blocage etat-blocage-ok" role="status">Sites bloqués par l’extension ✓</p>;
  if (ext.connecte && depuisS > ATTENTE_BLOCAGE_S)
    return (
      <p className="alerte douce petite etat-blocage" role="status">
        L’extension est connectée mais n’a pas bloqué les sites. Clique sur son icône et sur « Vérifier maintenant » : elle dit ce qu’elle voit.
      </p>
    );
  return null;
}

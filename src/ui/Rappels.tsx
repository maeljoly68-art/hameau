import { jourCourt } from '../core/jours.ts';
import { rappelsDus } from '../core/rappels.ts';
import { IconeCoche, IconeLien } from './Icones.tsx';
import { useRappels } from './useRappels.ts';

/**
 * Les rappels mensuels dus, en bandeau sur tous les onglets : « remplir mon rapport du mois sur Studea » revient
 * chaque jour à partir du jour dit, tant qu'on ne l'a pas marqué fait.
 */
export function Rappels({ userId, jour }: { userId: string | null; jour: string }) {
  const { rappels, erreur, faire } = useRappels(userId);
  const dus = rappelsDus(rappels, jour);
  if (dus.length === 0 && !erreur) return null;
  return (
    <section className="rappels" aria-label="Rappels à faire">
      {dus.map(({ rappel, depuis }) => (
        <div key={rappel.id} className="rappel-du">
          <div className="rappel-texte">
            <strong>{rappel.titre}</strong>
            <span className="aide petite">À faire depuis le {jourCourt(depuis)} · ce rappel revient chaque jour tant que ce n’est pas fait.</span>
          </div>
          <div className="rappel-actions">
            {rappel.lien && (
              <a className="bouton petit discret" href={rappel.lien} target="_blank" rel="noopener noreferrer">
                Ouvrir <IconeLien />
              </a>
            )}
            <button className="bouton petit" onClick={() => void faire(rappel.id, jour)}>
              <IconeCoche taille={14} /> Fait
            </button>
          </div>
        </div>
      ))}
      {erreur && <p className="alerte douce">{erreur}</p>}
    </section>
  );
}

import { NOTES, type Note } from '../core/revision.ts';
import { RappelEcrit, type ResultatRappel } from './RappelEcrit.tsx';

/**
 * La fin d'un chrono d'apprentissage (première séance ou premier retour) : on n'a pas le droit de se noter avant d'avoir
 * écrit de mémoire ce qu'on a retenu. Sans cet effort de rappel, la note dirait « j'ai reconnu la fiche », pas « je la sais ».
 * Le texte tapé est gardé dans le journal ; l'écrit sur papier se coche.
 */
export function FinApprentissage({ titre, premiere, parCoeur, erreurPossible, surNote, surPlusTard }: { titre: string; premiere: boolean; parCoeur: boolean; /** Une seule page travaillée : l'erreur notée peut lui être rattachée. */ erreurPossible: boolean; surNote: (note: Note, r: ResultatRappel) => void; surPlusTard: () => void }) {
  return (
    <>
      <h2>Qu’as-tu retenu de « {titre} » ?</h2>
      <p className="aide">
        {parCoeur ? 'À savoir mot pour mot. ' : ''}
        {premiere ? 'Lire ne suffit pas : ' : ''}Sans regarder la fiche, écris tout ce dont tu te souviens (ici ou sur papier). Ensuite seulement, compare et note-toi : « À revoir » demain, « Difficile » plus tôt, « Facile » plus tard.
      </p>
      <RappelEcrit
        obligatoire
        placeholder="Écris de mémoire (ou fais-le sur papier et coche ci-dessous)"
        etiquette="Ce dont tu te souviens, sans regarder la fiche"
        pages={[{ id: 'seance', titre, cartes: [] }]}
        sansErreur={!erreurPossible}
        enfants={(r) => (
          <div className="notation grande" role="group" aria-label="Note de la séance">
            {NOTES.map((n) => (
              <button key={n.id} className={`note note-${n.id}`} onClick={() => surNote(n.id, r)}>
                {n.nom}
              </button>
            ))}
          </div>
        )}
      />
      <div className="actions">
        <button className="bouton discret" onClick={surPlusTard}>
          Plus tard
        </button>
      </div>
    </>
  );
}

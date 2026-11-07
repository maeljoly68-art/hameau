import { useState } from 'react';
import { NOTES, type Note } from '../core/revision.ts';

/**
 * La fin d'un chrono d'« apprendre par cœur » : on n'a pas le droit de se noter avant d'avoir écrit de mémoire ce
 * qu'on a retenu. Sans cet effort de rappel, la note dirait « j'ai reconnu la fiche », pas « je la sais ».
 * Le texte tapé est gardé dans le journal ; l'écrit sur papier se coche.
 */
export function FinApprentissage({ titre, parCoeur, surNote, surPlusTard }: { titre: string; parCoeur: boolean; surNote: (note: Note, rappel: string | null) => void; surPlusTard: () => void }) {
  const [texte, setTexte] = useState('');
  const [surPapier, setSurPapier] = useState(false);
  const [compare, setCompare] = useState(false);
  return (
    <>
      <h2>Qu’as-tu retenu de « {titre} » ?</h2>
      <p className="aide">
        {parCoeur ? 'À savoir mot pour mot. ' : ''}Sans regarder la fiche, écris tout ce dont tu te souviens (ici ou sur papier). Ensuite seulement, compare et note-toi : « À revoir » demain, « Difficile » plus tôt, « Facile » plus tard.
      </p>
      {!compare ? (
        <div className="rappel-saisie">
          <textarea rows={4} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Écris de mémoire (ou fais-le sur papier et coche ci-dessous)" aria-label="Ce dont tu te souviens, sans regarder la fiche" />
          <label className="case-papier">
            <input type="checkbox" checked={surPapier} onChange={(e) => setSurPapier(e.target.checked)} /> Je l’ai écrit sur papier
          </label>
          <button className="bouton" disabled={texte.trim() === '' && !surPapier} onClick={() => setCompare(true)}>
            Comparer avec la fiche
          </button>
        </div>
      ) : (
        <div className="notation grande" role="group" aria-label="Note de la séance">
          {NOTES.map((n) => (
            <button key={n.id} className={`note note-${n.id}`} onClick={() => surNote(n.id, texte.trim() === '' ? null : texte.trim())}>
              {n.nom}
            </button>
          ))}
        </div>
      )}
      <div className="actions">
        <button className="bouton discret" onClick={surPlusTard}>
          Plus tard
        </button>
      </div>
    </>
  );
}

import { useState } from 'react';
import { pointsSession } from '../core/points.ts';
import { dureeMinutes, formatDuree } from '../core/temps.ts';
import type { Session } from '../core/types.ts';

/** Valeur pour <input type="datetime-local">, en heure locale. */
export function versChampLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function depuisChampLocal(v: string): string | null {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Fin de session : ce qui a été fait, et l'heure de fin si on a oublié d'arrêter. */
export function DialogueFin({
  session,
  categories,
  surValider,
  surAnnuler,
}: {
  session: Session;
  categories: string[];
  surValider: (champs: { fin: string; description: string; categorie: string }) => void;
  surAnnuler: () => void;
}) {
  const [description, setDescription] = useState('');
  const [categorie, setCategorie] = useState(session.categorie);
  // L'instant exact du clic est gardé tant que le champ n'est pas touché : le
  // champ s'arrête à la minute, et repartir de lui ferait perdre jusqu'à 59 s
  // — assez pour passer sous un bloc de 25 minutes et perdre son bonus.
  const [instant] = useState(() => new Date().toISOString());
  const [fin, setFin] = useState(() => versChampLocal(instant));
  const [finModifiee, setFinModifiee] = useState(false);

  const finIso = finModifiee ? depuisChampLocal(fin) : instant;
  const minutes = finIso ? dureeMinutes(session.debut, finIso) : null;
  const finAvantDebut = finIso !== null && Date.parse(finIso) < Date.parse(session.debut);

  return (
    <div className="voile" role="dialog" aria-modal="true" aria-labelledby="titre-fin">
      <form
        className="fenetre"
        onKeyDown={(e) => {
          if (e.key === 'Escape') surAnnuler();
          // Ctrl/Cmd + Entrée valide depuis la zone de texte, sans la souris.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.requestSubmit();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!finIso || finAvantDebut) return;
          surValider({ fin: finIso, description: description.trim(), categorie: categorie.trim() });
        }}
      >
        <h2 id="titre-fin">Qu’as-tu fait pendant cette session ?</h2>
        <p className="aide">Une ligne suffit : c’est ce qui rend l’historique utile dans trois semaines.</p>
        <textarea autoFocus rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex. : relu le chapitre 4, corrigé le bug de connexion…" />
        <label>
          Catégorie
          <input list="categories" value={categorie} onChange={(e) => setCategorie(e.target.value)} placeholder="Travail, Études…" />
          <datalist id="categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label>
          Fin de la session <small>(à corriger si tu as oublié d’arrêter le chrono)</small>
          <input type="datetime-local" value={fin} onChange={(e) => {
              setFin(e.target.value);
              setFinModifiee(true);
            }}
          />
        </label>
        {finAvantDebut ? (
          <p className="alerte">La fin ne peut pas précéder le début.</p>
        ) : (
          minutes !== null && (
            <p className="bilan">
              <span className="bilan-duree">{formatDuree(minutes)}</span>
              <strong className="bilan-points">+{pointsSession(minutes)} points</strong>
              {pointsSession(minutes) === 0 && <small>5 minutes minimum pour gagner des points</small>}
              {session.objectif !== null && (
                <small className={minutes >= session.objectif ? 'reussi' : undefined}>
                  {minutes >= session.objectif ? `Objectif de ${session.objectif} min atteint` : `Objectif de ${session.objectif} min non atteint — pas grave, tout compte`}
                </small>
              )}
            </p>
          )
        )}
        <div className="actions">
          <button type="button" className="bouton discret" onClick={surAnnuler}>
            Continuer la session
          </button>
          <button type="submit" className="bouton" disabled={!finIso || finAvantDebut}>
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}

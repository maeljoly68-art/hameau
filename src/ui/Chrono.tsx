import { useState } from 'react';
import { formatChrono } from '../core/temps.ts';
import type { Session } from '../core/types.ts';

export const CATEGORIES_PROPOSEES = ['Travail', 'Études', 'Projet perso', 'Lecture', 'Admin', 'Sport'];

/** Le gros chrono, avec le bouton qui démarre ou arrête. */
export function Chrono({
  enCours,
  maintenant,
  categories,
  surDemarrer,
  surArreter,
}: {
  enCours: Session | null;
  maintenant: number;
  categories: string[];
  surDemarrer: (categorie: string) => void;
  surArreter: () => void;
}) {
  const [categorie, setCategorie] = useState('');
  const ecoule = enCours ? maintenant - Date.parse(enCours.debut) : 0;

  return (
    <section className={enCours ? 'chrono actif' : 'chrono'}>
      <div className="chrono-temps" aria-live="off">
        {formatChrono(ecoule)}
      </div>
      {enCours ? (
        <>
          <p className="chrono-legende">
            {enCours.categorie || 'Session'} · lancée sur {enCours.appareil || 'un appareil'}
          </p>
          <button className="bouton gros arreter" onClick={surArreter}>
            Terminer la session
          </button>
        </>
      ) : (
        <>
          <div className="puces" role="group" aria-label="Catégorie">
            {categories.map((c) => (
              <button key={c} className={c === categorie ? 'puce choisie' : 'puce'} onClick={() => setCategorie(c === categorie ? '' : c)}>
                {c}
              </button>
            ))}
          </div>
          <button className="bouton gros demarrer" onClick={() => surDemarrer(categorie)}>
            Lancer une session
          </button>
        </>
      )}
    </section>
  );
}

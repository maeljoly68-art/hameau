import type { ReactNode } from 'react';

/**
 * Un groupe qu'on masque ou montre d'un geste, avec un petit triangle (▸ fermé, ▾ ouvert) : les questions d'un
 * sous-thème tiennent sur une ligne quand on ne les travaille pas. Le navigateur garde l'état ouvert/fermé tout seul
 * (`<details>`) : au clavier, Entrée ou Espace sur le titre.
 */
export function Repliable({ titre, compte, ouvert = true, className, children }: { titre: ReactNode; compte?: string; ouvert?: boolean; className?: string; children: ReactNode }) {
  return (
    <details className={className ? `repliable ${className}` : 'repliable'} open={ouvert}>
      <summary className="repliable-titre">
        <span className="triangle" aria-hidden />
        <span className="repliable-texte">{titre}</span>
        {compte !== undefined && <span className="repliable-compte">{compte}</span>}
      </summary>
      {children}
    </details>
  );
}

/** « 1 question », « 12 questions » : pour le compte d'un groupe replié. */
export const libelleQuestions = (n: number): string => `${n} question${n > 1 ? 's' : ''}`;

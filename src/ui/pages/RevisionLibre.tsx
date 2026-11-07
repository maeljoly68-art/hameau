// Les séances de révision libre du jour : un cours sans artefact (ou en plus de ses pages) a du TEMPS réservé, pas des
// pages. On étudie à sa façon — relire son cours, refaire des exercices, écrire de mémoire — et on le dit ici.
import type { CSSProperties } from 'react';
import type { DonneesCours } from '../../core/cours.ts';
import { arrondi5 } from '../../core/pages.ts';
import { categorieRevision, minutesParJour } from '../../core/pratique.ts';
import type { SeanceLibre } from '../../core/revisionLibre.ts';
import { formatDuree } from '../../core/temps.ts';
import type { Session } from '../../core/types.ts';
import { ajouterPratique } from '../../data/cours.ts';
import { IconeCoche } from '../Icones.tsx';
import type { Faire } from './CoursDetail.tsx';

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;

export function RevisionLibreDuJour({ seances, donnees, sessions, aujourdhui, faire, surChrono }: { seances: readonly SeanceLibre[]; donnees: DonneesCours; sessions: readonly Session[]; aujourdhui: string; faire: Faire; surChrono: (categorie: string, minutes: number) => void }) {
  if (seances.length === 0) return null;
  return (
    <ul className="seances revision-libre">
      {seances.map((s) => {
        const c = donnees.cours.find((x) => x.id === s.coursId);
        if (!c) return null;
        // Le chrono lancé d'ici (catégorie « <cours> · révision ») et les minutes déclarées se comptent ensemble.
        const faites = Math.round(minutesParJour(c.id, c.titre, donnees.pratiques, sessions, 'revision').get(aujourdhui) ?? 0);
        const fait = faites >= s.minutes;
        const restantes = Math.max(5, s.minutes - faites);
        return (
          <li key={`${s.coursId}-${s.jour}`} className={fait ? 'libre fait' : 'libre'} style={teinte(c.couleur)}>
            <div className="seance-corps">
              <span className="seance-cours">{c.titre}</span>
              <strong>Étude libre</strong>
              <span className="aide">
                {fait ? `Fait : ${faites} min ✓` : `≈ ${formatDuree(arrondi5(s.minutes))} · relis ton cours, refais des exercices, puis écris de mémoire ce que tu retiens`}
              </span>
            </div>
            {!fait && (
              <div className="seance-actions">
                {donnees.pratique && (
                  <button className="bouton petit" onClick={() => faire(() => ajouterPratique(c.id, restantes, aujourdhui, 'revision'), 'Séance d’étude notée.')}>
                    <IconeCoche taille={14} /> Fait
                  </button>
                )}
                <button className="lien" onClick={() => surChrono(categorieRevision(c.titre), restantes)}>
                  Lancer le chrono
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

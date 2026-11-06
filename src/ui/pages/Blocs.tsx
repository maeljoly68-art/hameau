// Les séances du calendrier, lues par blocs de pages : « Pages 1 à 7 · ≈ 55 min », et de quoi les valider.
import { libellePages, type Bloc } from '../../core/pages.ts';
import type { TypeSeance } from '../../core/planning.ts';
import type { Ressenti } from '../../core/vitesse.ts';
import { marquerRelu, noterChapitres, validerLectureEtVitesse } from '../../data/cours.ts';
import { IconeCoche } from '../Icones.tsx';
import { NotesRevision, type Faire } from './CoursDetail.tsx';

export const TYPES: Record<TypeSeance, string> = { decouverte: 'Lecture', revision: 'Révision', consolidation: 'Dernier passage', relecture: 'Relecture' };

const RESSENTIS: { id: Ressenti; nom: string }[] = [
  { id: 'plus-vite', nom: 'Plus vite' },
  { id: 'prevu', nom: 'Comme prévu' },
  { id: 'plus-lent', nom: 'Plus lent' },
];

/** Valider une séance entière : lue (avec ton ressenti sur la vitesse), relue, ou notée. Ce qui n'est pas validé revient dans le calendrier. */
export function ValiderBloc({ bloc, aujourdhui, userId, faire }: { bloc: Bloc; aujourdhui: string; userId: string; faire: Faire }) {
  if (bloc.type === 'decouverte') {
    if (bloc.termines.length === 0) return <span className="aide petite">Cette lecture se termine un autre jour : rien à valider aujourd’hui.</span>;
    const reste = bloc.termines.length < bloc.chapitreIds.length;
    return (
      <div className="valider-bloc">
        <span className="aide petite">
          Valider la séance{reste ? ` (${libellePages(bloc.pages.filter((_, i) => bloc.termines.includes(bloc.chapitreIds[i])))})` : ''} :
        </span>
        <div className="notation" role="group" aria-label="Valider la séance : à quelle vitesse as-tu lu ?">
          {RESSENTIS.map((r) => (
            <button key={r.id} className={`note ressenti-${r.id}`} onClick={() => faire(() => validerLectureEtVitesse(userId, bloc.termines, aujourdhui, { ressenti: r.id }), r.id === 'prevu' ? 'Séance validée : à revoir demain.' : 'Séance validée : à revoir demain, et ta vitesse est ajustée.')}>
              {r.nom}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (bloc.type === 'relecture')
    return (
      <button className="bouton petit" onClick={() => faire(() => marquerRelu(bloc.chapitreIds, aujourdhui), 'Relu : noté pour que la prochaine relecture fasse le tour des autres pages.')}>
        <IconeCoche taille={14} /> Relu
      </button>
    );
  return (
    <div className="valider-bloc">
      <span className="aide petite">Valider la séance, en te notant :</span>
      <NotesRevision surNote={(n) => faire(() => noterChapitres(bloc.chapitreIds, n, aujourdhui), 'Noté : le calendrier est recalculé.')} />
    </div>
  );
}

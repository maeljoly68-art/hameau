// Les séances du calendrier, lues par blocs de pages : « Pages 1 à 7 · ≈ 55 min », et de quoi les valider.
import { useState } from 'react';
import { libellePages, type Bloc } from '../../core/pages.ts';
import { noteDepuisPct, scorePct } from '../../core/passages.ts';
import type { TypeSeance } from '../../core/planning.ts';
import { formatDuree } from '../../core/temps.ts';
import type { Ressenti } from '../../core/vitesse.ts';
import { marquerRelu, noterChapitres, validerExamen, validerLectureEtVitesse } from '../../data/cours.ts';
import { IconeCoche } from '../Icones.tsx';
import { NotesRevision, type Faire } from './CoursDetail.tsx';

/**
 * Apprendre = lire, puis se rappeler : la première passe n'est pas une lecture rapide (le temps annoncé est celui
 * d'un apprentissage, pas d'un survol). Réviser = les retours espacés. Relire = revoir sans se noter.
 */
export const TYPES: Record<TypeSeance, string> = { decouverte: 'Apprendre', revision: 'Révision', consolidation: 'Dernier passage', relecture: 'Relecture', examen: 'Examen blanc' };

const RESSENTIS: { id: Ressenti; nom: string }[] = [
  { id: 'plus-vite', nom: 'Plus vite' },
  { id: 'prevu', nom: 'Comme prévu' },
  { id: 'plus-lent', nom: 'Plus lent' },
];

/**
 * Se noter d'après un score (« 14 sur 20 ») au lieu de « à l'œil » : 90 % et plus, facile ; 70 %, bien ; 50 %,
 * difficile ; en dessous, à revoir. Un quiz, des flashcards ou un sujet corrigé donnent un chiffre : autant s'en servir.
 */
export function SaisieScore({ surScore, libelle = 'Noter d’après mon score' }: { surScore: (pct: number) => void; libelle?: string }) {
  const [points, setPoints] = useState('');
  const [sur, setSur] = useState('20');
  const pct = points.trim() === '' ? null : scorePct(Number(points.replace(',', '.')), Number(sur.replace(',', '.')));
  return (
    <div className="saisie-score">
      <span className="aide petite">Ou d’après un score :</span>
      <input type="text" inputMode="decimal" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="14" aria-label="Points obtenus" />
      <span aria-hidden>/</span>
      <input type="text" inputMode="decimal" value={sur} onChange={(e) => setSur(e.target.value)} aria-label="Sur combien" />
      <button type="button" className="bouton petit discret" disabled={pct === null} onClick={() => pct !== null && surScore(pct)}>
        {libelle}
        {pct !== null ? ` (${Math.round(pct)} % : ${noteDepuisPct(pct) === 'a-revoir' ? 'à revoir' : noteDepuisPct(pct)})` : ''}
      </button>
    </div>
  );
}

/** Un examen blanc terminé : le temps passé, et — si tu l’as — le score. Le score fixe la note de la page. */
function ValiderExamen({ bloc, aujourdhui, faire }: { bloc: Bloc; aujourdhui: string; faire: Faire }) {
  const [minutes, setMinutes] = useState(String(Math.round(bloc.minutes)));
  const [points, setPoints] = useState('');
  const [sur, setSur] = useState('20');
  const pct = points.trim() === '' ? null : scorePct(Number(points.replace(',', '.')), Number(sur.replace(',', '.')));
  const invalide = points.trim() !== '' && pct === null;
  return (
    <div className="valider-bloc">
      <span className="aide petite">Examen blanc : refais la page sans regarder la correction, en {formatDuree(bloc.minutes)}. Quand c’est fini :</span>
      <div className="ligne-examen">
        <label>
          Temps passé (min)
          <input type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
        <label>
          Score (facultatif)
          <span className="saisie-score">
            <input type="text" inputMode="decimal" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="14" aria-label="Points obtenus" />
            <span aria-hidden>/</span>
            <input type="text" inputMode="decimal" value={sur} onChange={(e) => setSur(e.target.value)} aria-label="Sur combien" />
          </span>
        </label>
        <button className="bouton petit" disabled={invalide} onClick={() => faire(() => validerExamen(bloc.chapitreIds[0], aujourdhui, { minutes: Number(minutes.replace(',', '.')) || null, scorePct: pct }), 'Examen blanc enregistré.')}>
          <IconeCoche taille={14} /> Terminé
        </button>
      </div>
    </div>
  );
}

/** Valider une séance entière : apprise (avec ton ressenti sur la vitesse), relue, notée, ou passée en examen blanc. Ce qui n'est pas validé revient dans le calendrier. */
export function ValiderBloc({ bloc, aujourdhui, userId, faire }: { bloc: Bloc; aujourdhui: string; userId: string; faire: Faire }) {
  if (bloc.type === 'decouverte') {
    if (bloc.termines.length === 0) return <span className="aide petite">Cette séance se termine un autre jour : rien à valider aujourd’hui.</span>;
    const reste = bloc.termines.length < bloc.chapitreIds.length;
    return (
      <div className="valider-bloc">
        <span className="aide petite">Lis, puis ferme la fiche et redis l’essentiel de tête avant de valider.</span>
        <span className="aide petite">
          Valider la séance{reste ? ` (${libellePages(bloc.pages.filter((_, i) => bloc.termines.includes(bloc.chapitreIds[i])))})` : ''} :
        </span>
        <div className="notation" role="group" aria-label="Valider la séance : à quelle vitesse as-tu appris ?">
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
  if (bloc.type === 'examen') return <ValiderExamen bloc={bloc} aujourdhui={aujourdhui} faire={faire} />;
  return (
    <div className="valider-bloc">
      <span className="aide petite">Valider la séance, en te notant :</span>
      <NotesRevision surNote={(n) => faire(() => noterChapitres(bloc.chapitreIds, n, aujourdhui), 'Noté : le calendrier est recalculé.')} />
      <SaisieScore surScore={(pct) => faire(() => noterChapitres(bloc.chapitreIds, noteDepuisPct(pct), aujourdhui, { scorePct: pct }), 'Noté d’après ton score : le calendrier est recalculé.')} />
    </div>
  );
}

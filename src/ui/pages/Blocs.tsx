// Les séances du calendrier, lues par blocs de pages : « Pages 1 à 7 · ≈ 55 min », et de quoi les valider.
import { useState } from 'react';
import type { Carte } from '../../core/cartes.ts';
import { libellePages, type Bloc } from '../../core/pages.ts';
import { noteDepuisPct, scorePct } from '../../core/passages.ts';
import { formatDuree } from '../../core/temps.ts';
import { NOTES, type Note } from '../../core/revision.ts';
import type { Ressenti } from '../../core/vitesse.ts';
import { marquerRelu, noterChapitres, validerExamen, validerLectureEtVitesse } from '../../data/cours.ts';
import { IconeCoche, IconeLien } from '../Icones.tsx';
import { NotesRevision, type Faire } from './CoursDetail.tsx';
import { RappelEcrit, type ResultatRappel } from '../RappelEcrit.tsx';

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

export interface PageDuBloc {
  id: string;
  titre: string;
  cartes: Carte[];
}

const OuvrirLaFiche = ({ lien }: { lien: string | null }) =>
  lien ? (
    <a className="bouton petit discret" href={lien} target="_blank" rel="noopener noreferrer">
      Ouvrir la fiche <IconeLien />
    </a>
  ) : null;

/**
 * L'apprentissage par cœur (premier retour) : on ferme la fiche et on écrit tout ce dont on se souvient (ici ou sur
 * papier) AVANT de comparer et de se noter. Sans cet effort de rappel, la note ne dirait que « j'ai reconnu », pas « je sais ».
 * Le texte, s'il est tapé ici, est gardé dans le journal : c'est ta réponse, pas un simple geste. La confiance dite
 * avant de comparer mesure l'illusion de savoir (voir confiance.ts).
 */
function ValiderApprentissage({ bloc, aujourdhui, faire, pages, lien }: { bloc: Bloc; aujourdhui: string; faire: Faire; pages: PageDuBloc[]; lien: string | null }) {
  return (
    <RappelEcrit
      obligatoire
      placeholder="Écris de mémoire (ou fais-le sur papier et coche ci-dessous)"
      etiquette="Ce dont tu te souviens, sans regarder la fiche"
      consigne={`${bloc.parCoeur ? 'À savoir mot pour mot. ' : ''}Ferme la fiche et écris tout ce dont tu te souviens${bloc.pages.length > 1 ? ' de ces pages' : ' de cette page'}, sans regarder. C’est cet effort qui fixe la page.`}
      pages={pages}
      fiche={<OuvrirLaFiche lien={lien} />}
      enfants={(r) => {
        const noter = (note: Note, pct: number | null) => faire(() => noterChapitres(bloc.chapitreIds, note, aujourdhui, { rappel: r.texte, scorePct: pct, confiance: r.confiance, erreur: r.erreur }), 'Noté : le calendrier est recalculé.');
        return (
          <>
            <NotesRevision surNote={(n) => noter(n, null)} />
            <SaisieScore surScore={(pct) => noter(noteDepuisPct(pct), pct)} />
          </>
        );
      }}
    />
  );
}

/** Après le rappel de la première séance : la note du rappel, PUIS ta vitesse (qui valide la séance). */
function EtapeValidation({ bloc, aujourdhui, userId, faire, r }: { bloc: Bloc; aujourdhui: string; userId: string; faire: Faire; r: ResultatRappel }) {
  const [note, setNote] = useState<Note | null>(null);
  const reste = bloc.termines.length < bloc.chapitreIds.length;
  return (
    <>
      <div className="notation" role="group" aria-label="Note de ton rappel">
        {NOTES.map((n) => (
          <button key={n.id} type="button" className={`note note-${n.id}${note === n.id ? ' choisie' : ''}`} aria-pressed={note === n.id} onClick={() => setNote(n.id)}>
            {n.nom}
          </button>
        ))}
      </div>
      <span className="aide petite">
        {note === null ? 'Choisis la note de ton rappel, puis valide' : 'Valide'} la séance{reste ? ` (${libellePages(bloc.pages.filter((_, i) => bloc.termines.includes(bloc.chapitreIds[i])))})` : ''} : à quelle vitesse as-tu appris ?
      </span>
      <div className="notation" role="group" aria-label="Valider la séance : à quelle vitesse as-tu appris ?">
        {RESSENTIS.map((v) => (
          <button
            key={v.id}
            disabled={note === null}
            className={`note ressenti-${v.id}`}
            onClick={() => note !== null && faire(() => validerLectureEtVitesse(userId, bloc.termines, aujourdhui, { ressenti: v.id }, { rappel: r.texte, note, confiance: r.confiance, erreur: r.erreur }), v.id === 'prevu' ? 'Page apprise : tu la reverras demain, pour l’apprendre par cœur.' : 'Page apprise : à revoir demain, et ta vitesse est ajustée.')}
          >
            {v.nom}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Valider une séance entière : première séance (lire PUIS écrire de mémoire, avec ton ressenti sur la vitesse), premier
 * retour (écrire de mémoire, puis se noter), révision notée, relecture, ou examen blanc. Ce qui n'est pas validé revient dans le calendrier.
 */
export function ValiderBloc({ bloc, aujourdhui, userId, faire, pages, lien }: { bloc: Bloc; aujourdhui: string; userId: string; faire: Faire; pages: PageDuBloc[]; lien: string | null }) {
  if (bloc.etape === 'lire') {
    if (bloc.termines.length === 0) return <span className="aide petite">Cette séance se termine un autre jour : rien à valider aujourd’hui.</span>;
    const faites = pages.filter((p) => bloc.termines.includes(p.id));
    return (
      <RappelEcrit
        obligatoire
        placeholder="Écris de mémoire (ou fais-le sur papier et coche ci-dessous)"
        etiquette="Ce dont tu te souviens, sans regarder la fiche"
        consigne={`${bloc.parCoeur ? 'À savoir mot pour mot. ' : ''}Lis, puis ferme la fiche et écris tout ce dont tu te souviens. Lire ne suffit pas : c’est en te forçant à le redire que tu l’apprends, dès la première fois.`}
        pages={faites}
        fiche={<OuvrirLaFiche lien={lien} />}
        enfants={(r) => <EtapeValidation bloc={bloc} aujourdhui={aujourdhui} userId={userId} faire={faire} r={r} />}
      />
    );
  }
  if (bloc.etape === 'relire')
    return (
      <button className="bouton petit" onClick={() => faire(() => marquerRelu(bloc.chapitreIds, aujourdhui), 'Relu : noté pour que la prochaine relecture fasse le tour des autres pages.')}>
        <IconeCoche taille={14} /> Relu
      </button>
    );
  if (bloc.etape === 'examen') return <ValiderExamen bloc={bloc} aujourdhui={aujourdhui} faire={faire} />;
  if (bloc.etape === 'apprendre') return <ValiderApprentissage bloc={bloc} aujourdhui={aujourdhui} faire={faire} pages={pages} lien={lien} />;
  return (
    <div className="valider-bloc">
      <span className="aide petite">Valider la séance, en te notant :</span>
      <NotesRevision surNote={(n) => faire(() => noterChapitres(bloc.chapitreIds, n, aujourdhui), 'Noté : le calendrier est recalculé.')} />
      <SaisieScore surScore={(pct) => faire(() => noterChapitres(bloc.chapitreIds, noteDepuisPct(pct), aujourdhui, { scorePct: pct }), 'Noté d’après ton score : le calendrier est recalculé.')} />
    </div>
  );
}

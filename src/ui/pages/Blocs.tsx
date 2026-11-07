// Les séances du calendrier, lues par blocs de pages : « Pages 1 à 7 · ≈ 55 min », et de quoi les valider.
import { useState } from 'react';
import { libellePages, type Bloc } from '../../core/pages.ts';
import { noteDepuisPct, scorePct } from '../../core/passages.ts';
import { formatDuree } from '../../core/temps.ts';
import type { Note } from '../../core/revision.ts';
import type { Ressenti } from '../../core/vitesse.ts';
import { marquerRelu, noterChapitres, validerExamen, validerLectureEtVitesse } from '../../data/cours.ts';
import { IconeCoche } from '../Icones.tsx';
import { NotesRevision, type Faire } from './CoursDetail.tsx';

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

/**
 * L'apprentissage par cœur : on ferme la fiche et on écrit tout ce dont on se souvient (ici ou sur papier) AVANT de
 * comparer et de se noter. Sans cet effort de rappel, la note ne dirait que « j'ai reconnu », pas « je sais ».
 * Le texte, s'il est tapé ici, est gardé dans le journal : c'est ta réponse, pas un simple geste.
 */
function ValiderApprentissage({ bloc, aujourdhui, faire }: { bloc: Bloc; aujourdhui: string; faire: Faire }) {
  const [texte, setTexte] = useState('');
  const [surPapier, setSurPapier] = useState(false);
  const [compare, setCompare] = useState(false);
  const pret = texte.trim() !== '' || surPapier;
  const noter = (note: Note, pct: number | null) => faire(() => noterChapitres(bloc.chapitreIds, note, aujourdhui, { rappel: texte.trim() === '' ? null : texte.trim(), scorePct: pct }), 'Noté : le calendrier est recalculé.');
  return (
    <div className="valider-bloc">
      <span className="aide petite">
        {bloc.parCoeur ? 'À savoir mot pour mot. ' : ''}Ferme la fiche et écris tout ce dont tu te souviens{bloc.pages.length > 1 ? ' de ces pages' : ' de cette page'}, sans regarder. C’est cet effort qui fixe la page.
      </span>
      {!compare ? (
        <div className="rappel-saisie">
          <textarea rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Écris de mémoire (ou fais-le sur papier et coche ci-dessous)" aria-label="Ce dont tu te souviens, sans regarder la fiche" />
          <label className="case-papier">
            <input type="checkbox" checked={surPapier} onChange={(e) => setSurPapier(e.target.checked)} /> Je l’ai écrit sur papier
          </label>
          <button className="bouton petit" disabled={!pret} onClick={() => setCompare(true)}>
            Comparer avec la fiche
          </button>
        </div>
      ) : (
        <>
          <span className="aide petite">Ouvre la fiche, compare mot à mot, puis note-toi honnêtement :</span>
          <NotesRevision surNote={(n) => noter(n, null)} />
          <SaisieScore surScore={(pct) => noter(noteDepuisPct(pct), pct)} />
        </>
      )}
    </div>
  );
}

/** Valider une séance entière : apprise (avec ton ressenti sur la vitesse), relue, notée, ou passée en examen blanc. Ce qui n'est pas validé revient dans le calendrier. */
export function ValiderBloc({ bloc, aujourdhui, userId, faire }: { bloc: Bloc; aujourdhui: string; userId: string; faire: Faire }) {
  if (bloc.etape === 'lire') {
    if (bloc.termines.length === 0) return <span className="aide petite">Cette séance se termine un autre jour : rien à valider aujourd’hui.</span>;
    const reste = bloc.termines.length < bloc.chapitreIds.length;
    return (
      <div className="valider-bloc">
        <span className="aide petite">Lis pour comprendre : pas besoin de tout retenir aujourd’hui, c’est demain que tu l’apprends par cœur, en te forçant à l’écrire.</span>
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
  if (bloc.etape === 'relire')
    return (
      <button className="bouton petit" onClick={() => faire(() => marquerRelu(bloc.chapitreIds, aujourdhui), 'Relu : noté pour que la prochaine relecture fasse le tour des autres pages.')}>
        <IconeCoche taille={14} /> Relu
      </button>
    );
  if (bloc.etape === 'examen') return <ValiderExamen bloc={bloc} aujourdhui={aujourdhui} faire={faire} />;
  if (bloc.etape === 'apprendre') return <ValiderApprentissage bloc={bloc} aujourdhui={aujourdhui} faire={faire} />;
  return (
    <div className="valider-bloc">
      <span className="aide petite">Valider la séance, en te notant :</span>
      <NotesRevision surNote={(n) => faire(() => noterChapitres(bloc.chapitreIds, n, aujourdhui), 'Noté : le calendrier est recalculé.')} />
      <SaisieScore surScore={(pct) => faire(() => noterChapitres(bloc.chapitreIds, noteDepuisPct(pct), aujourdhui, { scorePct: pct }), 'Noté d’après ton score : le calendrier est recalculé.')} />
    </div>
  );
}

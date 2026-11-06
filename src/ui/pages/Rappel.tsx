// Le rappel du jour : quelques pages, de cours différents, qu'on se rappelle de tête avant d'ouvrir la fiche.
import { useState, type CSSProperties } from 'react';
import type { Chapitre, Cours, DonneesCours } from '../../core/cours.ts';
import { arrondi5, numerosDePages } from '../../core/pages.ts';
import { noteDepuisPct } from '../../core/passages.ts';
import type { ItemRappel, Rappel } from '../../core/rappel.ts';
import type { Note } from '../../core/revision.ts';
import { formatDuree } from '../../core/temps.ts';
import { noterChapitre } from '../../data/cours.ts';
import { IconeLien } from '../Icones.tsx';
import { SaisieScore } from './Blocs.tsx';
import { NotesRevision, type Faire } from './CoursDetail.tsx';

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;

function PageDuRappel({ item, cours, chapitre, numero, aujourdhui, faire }: { item: ItemRappel; cours: Cours; chapitre: Chapitre; numero: number; aujourdhui: string; faire: Faire }) {
  const [texte, setTexte] = useState('');
  const [compare, setCompare] = useState(false);
  const lien = chapitre.lien ?? cours.lien;
  // Une page pas encore due (micro-révision) : réussi, le rappel ne fait pas monter son cran ; raté, il compte.
  const noter = (note: Note, pct: number | null) => faire(() => noterChapitre(chapitre.id, note, aujourdhui, { sorte: 'rappel', anticipe: item.bonus, rappel: texte, scorePct: pct }), item.bonus ? 'Noté : une page fragile de plus travaillée.' : 'Noté : le calendrier est recalculé.');
  const sorte = item.bonus ? 'Micro-révision' : item.consolidation ? 'Dernier passage' : 'Révision';
  return (
    <li className="rappel-page" style={teinte(cours.couleur)}>
      <div className="seance-corps">
        <span className="seance-cours">{cours.titre}</span>
        <strong>{chapitre.titre}</strong>
        <span className="aide">
          Page {numero} · {sorte}
          {item.fragile ? ' · page fragile' : ''}
          {item.retard > 0 ? ` · en retard de ${item.retard} j` : ''}
        </span>
      </div>
      {!compare ? (
        <div className="rappel-saisie">
          <textarea rows={2} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Sans regarder la fiche : écris l’essentiel de tête (facultatif)" aria-label={`Ce dont tu te souviens de ${chapitre.titre}`} />
          <button className="bouton petit" onClick={() => setCompare(true)}>
            Comparer avec la fiche
          </button>
        </div>
      ) : (
        <div className="valider-bloc">
          {lien && (
            <a className="bouton petit discret" href={lien} target="_blank" rel="noopener noreferrer">
              Ouvrir la fiche <IconeLien />
            </a>
          )}
          {texte.trim() !== '' && <p className="aide petite rappel-ecrit">Ce que tu avais écrit : « {texte.trim()} »</p>}
          <span className="aide petite">Compare, puis note-toi honnêtement :</span>
          <NotesRevision surNote={(n) => noter(n, null)} />
          <SaisieScore surScore={(pct) => noter(noteDepuisPct(pct), pct)} />
        </div>
      )}
    </li>
  );
}

export function RappelDuJour({ rappel, donnees, aujourdhui, faire }: { rappel: Rappel; donnees: DonneesCours; aujourdhui: string; faire: Faire }) {
  if (rappel.items.length === 0) return null;
  const numeros = numerosDePages(donnees.chapitres);
  return (
    <div className="rappel-du-jour">
      <div className="entete">
        <h3 className="sous-titre">Rappel du jour</h3>
        <span className="pastille">≈ {formatDuree(arrondi5(rappel.minutes))}</span>
      </div>
      <p className="aide petite">Se rappeler sans regarder dit si tu sais ; relire donne seulement l’impression de savoir. Quelques pages, de cours mélangés : écris de tête, ouvre la fiche pour comparer, puis note-toi.</p>
      <ul className="seances">
        {rappel.items.map((item) => {
          const chapitre = donnees.chapitres.find((c) => c.id === item.chapitreId);
          const cours = donnees.cours.find((c) => c.id === item.coursId);
          return chapitre && cours ? <PageDuRappel key={item.chapitreId} item={item} cours={cours} chapitre={chapitre} numero={numeros.get(chapitre.id) ?? 0} aujourdhui={aujourdhui} faire={faire} /> : null;
        })}
      </ul>
    </div>
  );
}

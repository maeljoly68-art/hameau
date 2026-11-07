// Le rappel du jour : quelques pages, de cours différents, qu'on se rappelle de tête avant d'ouvrir la fiche.
import type { CSSProperties } from 'react';
import { cartesParPage, type Carte } from '../../core/cartes.ts';
import type { Chapitre, Cours, DonneesCours } from '../../core/cours.ts';
import { arrondi5, numerosDePages } from '../../core/pages.ts';
import { noteDepuisPct } from '../../core/passages.ts';
import type { ItemRappel, Rappel } from '../../core/rappel.ts';
import type { Note } from '../../core/revision.ts';
import { formatDuree } from '../../core/temps.ts';
import { noterChapitres } from '../../data/cours.ts';
import { IconeLien } from '../Icones.tsx';
import { RappelEcrit } from '../RappelEcrit.tsx';
import { SaisieScore } from './Blocs.tsx';
import { NotesRevision, type Faire } from './CoursDetail.tsx';

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;

function PageDuRappel({ item, cours, chapitre, numero, cartes, aujourdhui, faire }: { item: ItemRappel; cours: Cours; chapitre: Chapitre; numero: number; cartes: readonly Carte[]; aujourdhui: string; faire: Faire }) {
  const lien = chapitre.lien ?? cours.lien;
  const sorte = item.bonus ? 'Micro-révision' : item.consolidation ? 'Dernier passage' : item.obligatoire ? (chapitre.parCoeur ? 'Apprendre par cœur · mot pour mot' : 'Apprendre par cœur') : chapitre.parCoeur ? 'Réviser · mot pour mot' : 'Réviser';
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
      {/* Une page à apprendre ne se note pas sans avoir été écrite de mémoire (ici ou sur papier) : sinon la note dirait « reconnu », pas « su ». */}
      <RappelEcrit
        obligatoire={item.obligatoire}
        placeholder={item.obligatoire ? 'Écris de mémoire (ou sur papier, puis coche ci-dessous)' : 'Sans regarder la fiche : écris l’essentiel de tête (facultatif)'}
        etiquette={`Ce dont tu te souviens de ${chapitre.titre}`}
        pages={[{ id: chapitre.id, titre: chapitre.titre, cartes }]}
        fiche={
          lien ? (
            <a className="bouton petit discret" href={lien} target="_blank" rel="noopener noreferrer">
              Ouvrir la fiche <IconeLien />
            </a>
          ) : null
        }
        enfants={(r) => {
          // Une page pas encore due (micro-révision) : réussi, le rappel ne fait pas monter son cran ; raté, il compte.
          const noter = (note: Note, pct: number | null) => faire(() => noterChapitres([chapitre.id], note, aujourdhui, { sorte: 'rappel', anticipe: item.bonus, rappel: r.texte, scorePct: pct, confiance: r.confiance, erreur: r.erreur }), item.bonus ? 'Noté : une page fragile de plus travaillée.' : 'Noté : le calendrier est recalculé.');
          return (
            <>
              <NotesRevision surNote={(n) => noter(n, null)} />
              <SaisieScore surScore={(pct) => noter(noteDepuisPct(pct), pct)} />
            </>
          );
        }}
      />
    </li>
  );
}

export function RappelDuJour({ rappel, donnees, aujourdhui, faire }: { rappel: Rappel; donnees: DonneesCours; aujourdhui: string; faire: Faire }) {
  if (rappel.items.length === 0) return null;
  const numeros = numerosDePages(donnees.chapitres);
  const cartes = cartesParPage(donnees.cartes);
  return (
    <div className="rappel-du-jour">
      <div className="entete">
        <h3 className="sous-titre">Rappel du jour</h3>
        <span className="pastille">≈ {formatDuree(arrondi5(rappel.minutes))}</span>
      </div>
      <p className="aide petite">Se rappeler sans regarder dit si tu sais ; relire donne seulement l’impression de savoir. Écris de tête, ouvre la fiche pour comparer, puis note-toi. Les pages à apprendre par cœur (premier retour) y passent toutes, et s’écrivent obligatoirement. Dis aussi si tu penses savoir AVANT de comparer : le bilan te montre si tu te surestimes.</p>
      <ul className="seances">
        {rappel.items.map((item) => {
          const chapitre = donnees.chapitres.find((c) => c.id === item.chapitreId);
          const cours = donnees.cours.find((c) => c.id === item.coursId);
          return chapitre && cours ? <PageDuRappel key={item.chapitreId} item={item} cours={cours} chapitre={chapitre} numero={numeros.get(chapitre.id) ?? 0} cartes={cartes.get(chapitre.id) ?? []} aujourdhui={aujourdhui} faire={faire} /> : null;
        })}
      </ul>
    </div>
  );
}

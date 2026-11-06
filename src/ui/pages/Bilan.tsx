// Le bilan de la semaine : ce qui a été fait, à quelle vitesse, et ce que ce rythme donne avant chaque partiel.
import { useMemo, type CSSProperties } from 'react';
import type { DonneesCours } from '../../core/cours.ts';
import { jourCourt } from '../../core/jours.ts';
import { numerosDePages } from '../../core/pages.ts';
import { BILAN_JOURS, bilanSemaine } from '../../core/passages.ts';
import { libelleVitesse } from '../../core/vitesse.ts';

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;
const pages = (n: number) => `${n} page${n > 1 ? 's' : ''}`;

export function Bilan({ donnees, aujourdhui, fragiles, ouvert }: { donnees: DonneesCours; aujourdhui: string; fragiles: ReadonlySet<string>; ouvert: boolean }) {
  const b = useMemo(() => bilanSemaine({ passages: donnees.passages, chapitres: donnees.chapitres, cours: donnees.cours, aujourdhui, fragiles }), [donnees.passages, donnees.chapitres, donnees.cours, aujourdhui, fragiles]);
  const numeros = useMemo(() => numerosDePages(donnees.chapitres), [donnees.chapitres]);
  const titreDe = (id: string) => donnees.chapitres.find((c) => c.id === id);
  const coursDe = (id: string) => donnees.cours.find((c) => c.id === id);
  return (
    <details className="carte bilan" open={ouvert}>
      <summary>Bilan de la semaine</summary>
      {!donnees.journal && <p className="alerte douce">Le journal des passages n’est pas encore activé sur ta base : le bilan et les pages fragiles se rempliront après la mise à jour SQL.</p>}
      <div className="bilan-chiffres">
        <div>
          <b>
            {b.joursActifs} / {BILAN_JOURS}
          </b>
          <span>jours actifs</span>
        </div>
        <div>
          <b>{b.passages.lecture}</b>
          <span>pages apprises</span>
        </div>
        <div>
          <b>{b.passages.revision + b.passages.rappel}</b>
          <span>révisions</span>
        </div>
        <div>
          <b>{b.passages.relecture}</b>
          <span>relectures</span>
        </div>
        <div>
          <b>{b.passages.examen}</b>
          <span>examens blancs</span>
        </div>
        <div className={b.enRetard > 0 ? 'en-retard-chiffre' : undefined}>
          <b>{b.enRetard}</b>
          <span>pages en retard</span>
        </div>
      </div>
      <p className="aide petite">
        Tes notes : {b.notes['a-revoir']} à revoir · {b.notes.difficile} difficile · {b.notes.bien} bien · {b.notes.facile} facile.
        {b.vitesse && ` Ta vitesse : ${b.vitesse.debut.toFixed(2)} → ${b.vitesse.fin.toFixed(2)} (${libelleVitesse(b.vitesse.fin)}).`}
      </p>
      {b.cours.length > 0 && (
        <>
          <h3 className="sous-titre">À ce rythme</h3>
          <ul className="bilan-cours">
            {b.cours.map((c) => {
              const cours = coursDe(c.coursId);
              if (!cours) return null;
              return (
                <li key={c.coursId} style={teinte(cours.couleur)}>
                  <strong>{cours.titre}</strong>
                  <span className="aide">
                    {c.pagesRestantes === 0 ? 'toutes les pages sont apprises ✓' : `${pages(c.pagesRestantes)} à apprendre · ${c.fin ? `à ${c.rythme.toFixed(1)} page/j, tout serait appris le ${jourCourt(c.fin)}` : 'pas encore de rythme sur 14 jours'}`}
                    {cours.partiel && c.pagesRestantes > 0 ? ` (partiel ${jourCourt(cours.partiel)})` : ''}
                    {c.avantPartiel === true ? ' ✓' : ''}
                    {c.avantPartiel === false ? <strong className="en-retard"> ⚠ trop tard pour le partiel : il faut accélérer</strong> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {b.fragiles.length > 0 && (
        <>
          <h3 className="sous-titre">Pages fragiles</h3>
          <p className="aide petite">Plusieurs notes basses de suite : elles passent en priorité dans tes révisions.</p>
          <ul className="bilan-fragiles">
            {b.fragiles.map((id) => {
              const ch = titreDe(id);
              const cours = ch ? coursDe(ch.coursId) : undefined;
              return ch && cours ? (
                <li key={id} style={teinte(cours.couleur)}>
                  <strong>{ch.titre}</strong>
                  <span className="aide">
                    {cours.titre} · page {numeros.get(id) ?? 0}
                  </span>
                </li>
              ) : null;
            })}
          </ul>
        </>
      )}
    </details>
  );
}

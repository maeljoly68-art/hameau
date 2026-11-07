// Le bilan de la semaine : ce qui a été fait, à quelle vitesse, et ce que ce rythme donne avant chaque partiel.
import { useMemo, type CSSProperties } from 'react';
import { CALIBRAGE_JOURS, CALIBRAGE_MIN, calibrage } from '../../core/confiance.ts';
import type { DonneesCours } from '../../core/cours.ts';
import type { Heures } from '../../core/heures.ts';
import { HEURES_MIN } from '../../core/heures.ts';
import { ajouterJours, jourCourt } from '../../core/jours.ts';
import { numerosDePages } from '../../core/pages.ts';
import { BILAN_JOURS, bilanSemaine } from '../../core/passages.ts';
import { pointsApprentissage } from '../../core/pointsApprentissage.ts';
import { libelleVitesse } from '../../core/vitesse.ts';

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;
const pages = (n: number) => `${n} page${n > 1 ? 's' : ''}`;

export function Bilan({ donnees, aujourdhui, fragiles, moments, ouvert }: { donnees: DonneesCours; aujourdhui: string; fragiles: ReadonlySet<string>; moments: Heures; ouvert: boolean }) {
  const b = useMemo(() => bilanSemaine({ passages: donnees.passages, chapitres: donnees.chapitres, cours: donnees.cours, aujourdhui, fragiles }), [donnees.passages, donnees.chapitres, donnees.cours, aujourdhui, fragiles]);
  const numeros = useMemo(() => numerosDePages(donnees.chapitres), [donnees.chapitres]);
  const calibre = useMemo(() => calibrage(donnees.passages, aujourdhui), [donnees.passages, aujourdhui]);
  const appris = useMemo(() => pointsApprentissage(donnees.passages, aujourdhui), [donnees.passages, aujourdhui]);
  const pointsSemaine = useMemo(() => {
    let t = 0;
    for (let i = 0; i < BILAN_JOURS; i++) t += appris.parJour.get(ajouterJours(aujourdhui, -i)) ?? 0;
    return t;
  }, [appris, aujourdhui]);
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
      <p className="aide petite">
        Points gagnés en apprenant cette semaine : <strong>{pointsSemaine}</strong>
        {appris.serie > 0 ? ` · série de ${appris.serie} jour${appris.serie > 1 ? 's' : ''} d’apprentissage` : ''}. Chaque page apprise, chaque rappel réussi, chaque examen blanc rapporte des points au village (plafonnés par jour).
      </p>
      <h3 className="sous-titre">Ta confiance</h3>
      <p className="aide petite bilan-confiance">
        {calibre.verdict === 'insuffisant'
          ? `Dis si tu penses savoir avant de comparer à la fiche : après ${CALIBRAGE_MIN} rappels (${calibre.n} pour l’instant sur ${CALIBRAGE_JOURS} jours), tu verras si tu te surestimes.`
          : calibre.verdict === 'surestime'
            ? `Tu te surestimes : tu te crois meilleur que ta note (écart de ${calibre.ecart.toFixed(1)} cran).${calibre.illusions > 0 ? ` ${calibre.illusions} fois « sûr de moi » puis « à revoir » ou « difficile » : c’est l’illusion de savoir — relire ne suffit pas, teste-toi.` : ''}`
            : calibre.verdict === 'sous-estime'
              ? `Tu te sous-estimes : tu réussis mieux que tu ne le crois (écart de ${calibre.ecart.toFixed(1)} cran). Fais-toi confiance, ça tient.`
              : `Ta confiance est juste : ce que tu crois savoir, tu le sais (écart de ${calibre.ecart.toFixed(1)} cran sur ${calibre.n} rappels).`}
      </p>
      <h3 className="sous-titre">Tes meilleurs moments</h3>
      {moments.meilleur && moments.pire ? (
        <p className="aide petite">
          Tes notes sont les meilleures {moments.meilleur.nom.toLowerCase()} ({moments.meilleur.plage}), les plus faibles {moments.pire.nom.toLowerCase()} ({moments.pire.plage}). Garde le meilleur moment pour tes pages difficiles. Hameau te le rappelle ; il ne fixe pas d’heure, le calendrier raisonne en jours.
        </p>
      ) : (
        <p className="aide petite">Pas encore assez de passages notés à des moments différents ({HEURES_MIN} par moment au moins) pour dire quand tu apprends le mieux.</p>
      )}
      <ul className="bilan-moments">
        {moments.moments
          .filter((m) => m.n > 0)
          .map((m) => (
            <li key={m.moment.id}>
              {m.moment.nom} ({m.moment.plage}) : {m.moyenne === null ? '—' : `${m.moyenne.toFixed(1)} / 3`} sur {m.n} passage{m.n > 1 ? 's' : ''}
            </li>
          ))}
      </ul>
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

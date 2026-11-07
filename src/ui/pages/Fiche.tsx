// La fiche de la veille : ce qui vaut d'être relu juste avant un partiel, sur un seul écran.
import { useState } from 'react';
import { ficheEnTexte, type Fiche, type PageFiche } from '../../core/fiche.ts';
import { jourCourt } from '../../core/jours.ts';

function PageDeLaFiche({ p }: { p: PageFiche }) {
  return (
    <li className="fiche-page">
      <strong>
        Page {p.numero} · {p.titre}
      </strong>
      {p.fragile && <span className="badge-fragile">Page fragile</span>}
      {p.cartes.length > 0 && (
        <ul className="fiche-cartes">
          {p.cartes.map((c) => (
            <li key={c.id}>
              <b>{c.question}</b> <span className="carte-reponse">→ {c.reponse}</span>
            </li>
          ))}
        </ul>
      )}
      {p.notes.map((n) => (
        <p key={n.id} className="aide petite">
          Note : {n.texte}
          {n.citation ? ` (« ${n.citation} »)` : ''}
        </p>
      ))}
      {p.erreurs.map((x) => (
        <p key={x.id} className="aide petite fiche-erreur">
          Erreur à ne pas refaire : {x.texte}
        </p>
      ))}
    </li>
  );
}

export function FicheVeille({ fiche, surFermer }: { fiche: Fiche; surFermer: () => void }) {
  const [copie, setCopie] = useState<'oui' | 'non' | null>(null);
  const vide = fiche.erreurs.length + fiche.motPourMot.length + fiche.fragiles.length + fiche.notes.length === 0;
  return (
    <section className="carte fiche-veille" aria-label={`Fiche de la veille : ${fiche.titre}`}>
      <div className="entete">
        <h2>Fiche de la veille</h2>
        <button className="bouton petit discret" onClick={surFermer}>
          Fermer
        </button>
      </div>
      <p className="aide">
        {fiche.titre}
        {fiche.partiel ? ` · partiel ${jourCourt(fiche.partiel)}${fiche.joursAvant !== null && fiche.joursAvant >= 0 ? ` (dans ${fiche.joursAvant} jour${fiche.joursAvant > 1 ? 's' : ''})` : ''}` : ''} · {fiche.apprises} / {fiche.total} pages apprises
      </p>
      {fiche.pasApprises.length > 0 && (
        <p className="alerte douce">
          Pas encore apprises : {fiche.pasApprises.map((p) => `page ${p.numero}`).join(', ')}.
        </p>
      )}
      {vide && <p className="aide">Rien à rassembler pour l’instant : marque des pages « mot pour mot », écris des cartes ou des notes, et note tes erreurs en te testant. Elles apparaîtront ici.</p>}
      {fiche.erreurs.length > 0 && (
        <>
          <h3 className="sous-titre">Erreurs à ne pas refaire</h3>
          <ul className="fiche-erreurs">
            {fiche.erreurs.map((x) => (
              <li key={x.erreur.id}>
                <b>« {x.erreur.texte} »</b> <span className="aide">page {x.numero} · {x.titre}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {fiche.motPourMot.length > 0 && (
        <>
          <h3 className="sous-titre">À savoir mot pour mot</h3>
          <ul className="fiche-pages">
            {fiche.motPourMot.map((p) => (
              <PageDeLaFiche key={p.chapitreId} p={p} />
            ))}
          </ul>
        </>
      )}
      {fiche.fragiles.length > 0 && (
        <>
          <h3 className="sous-titre">Pages fragiles</h3>
          <ul className="fiche-pages">
            {fiche.fragiles.map((p) => (
              <PageDeLaFiche key={p.chapitreId} p={p} />
            ))}
          </ul>
        </>
      )}
      {fiche.notes.length > 0 && (
        <>
          <h3 className="sous-titre">Mes notes</h3>
          <ul className="fiche-pages">
            {fiche.notes.map((p) => (
              <PageDeLaFiche key={p.chapitreId} p={p} />
            ))}
          </ul>
        </>
      )}
      <div className="actions gauche">
        <button
          className="bouton petit"
          onClick={() => {
            navigator.clipboard.writeText(ficheEnTexte(fiche, jourCourt)).then(
              () => setCopie('oui'),
              () => setCopie('non'),
            );
          }}
        >
          Copier la fiche
        </button>
        {copie === 'oui' && <span className="aide petite">Copiée : colle-la dans tes notes.</span>}
        {copie === 'non' && <span className="aide petite">Impossible de copier depuis ce navigateur.</span>}
      </div>
    </section>
  );
}

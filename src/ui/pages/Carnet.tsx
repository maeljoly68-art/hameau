// Le carnet d'erreurs du jour, et les cartes question/réponse d'une page.
import { useState, type CSSProperties } from 'react';
import { CARTES_PAR_PAGE_MAX, analyserCartes, type Carte } from '../../core/cartes.ts';
import type { DonneesCours } from '../../core/cours.ts';
import { erreursDuJour } from '../../core/erreurs.ts';
import { numerosDePages } from '../../core/pages.ts';
import { ajouterCartes, reglerErreur, revoirErreur, supprimerCarte } from '../../data/cours.ts';
import type { Faire } from './CoursDetail.tsx';

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;

/**
 * Les erreurs notées il y a quelques jours, de retour : une erreur qu'on a comprise mardi est celle qu'on refait samedi.
 * « Je sais » : elle ne revient plus. « Encore flou » : elle revient dans trois jours.
 */
export function CarnetDuJour({ donnees, aujourdhui, faire }: { donnees: DonneesCours; aujourdhui: string; faire: Faire }) {
  if (!donnees.carnet) return null;
  const dejaRevues = donnees.erreurs.filter((e) => e.revueLe === aujourdhui || e.regleeLe === aujourdhui).length;
  const dues = erreursDuJour(donnees.erreurs, aujourdhui, dejaRevues);
  if (dues.length === 0) return null;
  const numeros = numerosDePages(donnees.chapitres);
  return (
    <div className="carnet-du-jour">
      <h3 className="sous-titre">Tes erreurs, de retour</h3>
      <p className="aide petite">Tu t’étais trompé. Réponds sans regarder : sais-tu maintenant ?</p>
      <ul className="seances">
        {dues.map((e) => {
          const ch = donnees.chapitres.find((c) => c.id === e.chapitreId);
          const cours = ch ? donnees.cours.find((c) => c.id === ch.coursId) : undefined;
          return (
            <li key={e.id} className="rappel-page" style={teinte(cours?.couleur ?? '#888')}>
              <div className="seance-corps">
                <span className="seance-cours">{cours?.titre ?? ''}</span>
                <strong>« {e.texte} »</strong>
                <span className="aide">
                  {ch ? `Page ${numeros.get(ch.id) ?? 0} · ${ch.titre} · ` : ''}notée le {e.jour.slice(8, 10)}/{e.jour.slice(5, 7)}
                </span>
              </div>
              <div className="actions gauche">
                <button className="bouton petit" onClick={() => faire(() => reglerErreur(e.id, aujourdhui), 'Erreur réglée : elle ne reviendra plus.')}>
                  Je sais
                </button>
                <button className="bouton petit discret" onClick={() => faire(() => revoirErreur(e.id, aujourdhui), 'Elle reviendra dans quelques jours.')}>
                  Encore flou
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Les cartes d'une page : les voir, en ajouter une, en coller une liste (« question :: réponse », une par ligne). */
export function PanneauCartes({ chapitreId, cartes, faire }: { chapitreId: string; cartes: readonly Carte[]; faire: Faire }) {
  const [question, setQuestion] = useState('');
  const [reponse, setReponse] = useState('');
  const [liste, setListe] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const prochain = cartes.reduce((m, c) => Math.max(m, c.ordre + 1), 0);
  const place = CARTES_PAR_PAGE_MAX - cartes.length;
  return (
    <div className="panneau-cartes">
      {cartes.length === 0 && <p className="aide petite">Aucune carte. Avec des cartes, le rappel te pose de vraies questions au lieu de « redis ce que tu retiens ».</p>}
      <ol className="cartes-liste">
        {cartes.map((c) => (
          <li key={c.id}>
            <strong>{c.question}</strong> <span className="carte-reponse">→ {c.reponse}</span>{' '}
            <button className="lien" aria-label={`Supprimer la carte « ${c.question} »`} onClick={() => faire(() => supprimerCarte(c.id), 'Carte supprimée.')}>
              Supprimer
            </button>
          </li>
        ))}
      </ol>
      <form
        className="ligne-carte"
        onSubmit={(e) => {
          e.preventDefault();
          const { cartes: lues } = analyserCartes(`${question.replace(/\n/g, ' ')} :: ${reponse.replace(/\n/g, ' ')}`);
          if (lues.length === 0) return setMessage('Il faut une question et une réponse.');
          if (place < 1) return setMessage(`Une page garde ${CARTES_PAR_PAGE_MAX} cartes au plus.`);
          setMessage(null);
          faire(() => ajouterCartes(chapitreId, lues, prochain), 'Carte ajoutée.');
          setQuestion('');
          setReponse('');
        }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" aria-label="Question de la carte" />
        <input value={reponse} onChange={(e) => setReponse(e.target.value)} placeholder="Réponse" aria-label="Réponse de la carte" />
        <button className="bouton petit">Ajouter</button>
      </form>
      <details>
        <summary className="aide petite">Coller une liste de cartes</summary>
        <textarea rows={4} value={liste} onChange={(e) => setListe(e.target.value)} placeholder={'Capital minimum d’une SA ? :: 37 000 €\nQuorum en première convocation ? :: Un quart'} aria-label="Liste de cartes" />
        <button
          className="bouton petit"
          disabled={liste.trim() === ''}
          onClick={() => {
            const { cartes: lues, ecartees } = analyserCartes(liste);
            if (lues.length === 0) return setMessage('Aucune carte lue : chaque ligne doit être « question :: réponse ».');
            if (lues.length > place) return setMessage(`Il reste de la place pour ${Math.max(0, place)} carte${place > 1 ? 's' : ''} sur cette page (${CARTES_PAR_PAGE_MAX} au plus).`);
            setMessage(null);
            faire(() => ajouterCartes(chapitreId, lues, prochain), `${lues.length} carte${lues.length > 1 ? 's' : ''} ajoutée${lues.length > 1 ? 's' : ''}${ecartees > 0 ? ` (${ecartees} ligne${ecartees > 1 ? 's' : ''} ignorée${ecartees > 1 ? 's' : ''})` : ''}.`);
            setListe('');
          }}
        >
          Ajouter la liste
        </button>
      </details>
      {message && <p className="alerte douce">{message}</p>}
    </div>
  );
}

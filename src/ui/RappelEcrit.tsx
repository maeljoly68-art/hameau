import { useState, type ReactNode } from 'react';
import { CARTE_REPONSE_MAX, texteDuRappel, type Carte } from '../core/cartes.ts';
import { CONFIANCES } from '../core/confiance.ts';
import { ERREUR_TEXTE_MAX } from '../core/erreurs.ts';
import { Repliable, libelleQuestions } from './Repliable.tsx';

/** Ce que le rappel donne, à l'étape où l'on compare : de quoi écrire le passage dans le journal et, si besoin, le carnet d'erreurs. */
export interface ResultatRappel {
  /** Ce qui a été tapé ; null si tout est sur papier ou si rien n'a été écrit. */
  texte: string | null;
  /** « Je pense savoir… » dit avant de comparer : 0 à 3. */
  confiance: number;
  /** Une erreur à garder dans le carnet, avec la page où elle est née (par défaut : la seule page). */
  erreur: { texte: string; chapitreId?: string } | null;
}

export interface PageDuRappel {
  id: string;
  titre: string;
  cartes: readonly Carte[];
}

/**
 * Se tester avant de se noter, dans l'ordre : on voit les questions (s'il y en a), on écrit de mémoire, on dit si
 * l'on pense savoir, ET SEULEMENT ENSUITE on compare à la fiche. Sans cet ordre, la note dirait « j'ai reconnu »,
 * pas « je sais » ; et la confiance dite AVANT la note est ce qui mesure l'illusion de savoir.
 *
 * `obligatoire` : on ne compare pas sans avoir écrit (ici ou sur papier) — pour les pages qu'on apprend. Sinon, le
 * texte est facultatif mais la confiance reste demandée.
 */
export function RappelEcrit({ obligatoire, placeholder, etiquette, consigne, pages, fiche, sansErreur = false, enfants }: { obligatoire: boolean; placeholder: string; etiquette: string; consigne?: ReactNode; pages: readonly PageDuRappel[]; fiche?: ReactNode; /** Pas de champ d'erreur : on ne saurait pas à quelle page la rattacher. */ sansErreur?: boolean; enfants: (r: ResultatRappel) => ReactNode }) {
  const [texte, setTexte] = useState('');
  // Les réponses tapées à côté des questions, par carte : elles comptent comme « écrit », au même titre que le champ libre.
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [surPapier, setSurPapier] = useState(false);
  const [confiance, setConfiance] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);
  const [erreur, setErreur] = useState('');
  const [pageErreur, setPageErreur] = useState(pages[0]?.id ?? '');
  const avecCartes = pages.filter((p) => p.cartes.length > 0);
  const ecrit = texteDuRappel(avecCartes, reponses, texte);
  const pret = (!obligatoire || ecrit !== null || surPapier) && confiance !== null;
  const resultat = (): ResultatRappel => ({
    texte: ecrit,
    confiance: confiance ?? 0,
    erreur: sansErreur || erreur.trim() === '' ? null : { texte: erreur.trim(), chapitreId: pages.length > 1 ? pageErreur : pages[0]?.id },
  });
  // Avant de comparer : chaque question a son champ, juste à côté. Après : la même liste, avec ta réponse en face de la bonne.
  const questions = (comparer: boolean) =>
    avecCartes.map((p) => {
      const liste = (
        <ol className="cartes-liste">
          {p.cartes.map((c) => {
            const tienne = (reponses[c.id] ?? '').trim();
            return (
              <li key={c.id} className="carte-ligne">
                <span className="carte-question">{c.question}</span>
                {comparer ? (
                  <span className="carte-comparaison">
                    <span className={tienne === '' ? 'carte-toi sans-reponse' : 'carte-toi'}>{tienne === '' ? 'pas de réponse' : tienne}</span>
                    <span className="carte-reponse"> → {c.reponse}</span>
                  </span>
                ) : (
                  <input
                    className="carte-saisie"
                    value={reponses[c.id] ?? ''}
                    maxLength={CARTE_REPONSE_MAX}
                    onChange={(e) => setReponses((r) => ({ ...r, [c.id]: e.target.value }))}
                    placeholder="Ta réponse"
                    aria-label={`Ta réponse : ${c.question}`}
                    autoComplete="off"
                  />
                )}
              </li>
            );
          })}
        </ol>
      );
      // Plusieurs pages : chacune se replie sous son titre. Une seule : pas de titre à replier.
      return (
        <div key={p.id} className="cartes-page">
          {pages.length > 1 ? (
            <Repliable titre={p.titre} compte={libelleQuestions(p.cartes.length)}>
              {liste}
            </Repliable>
          ) : (
            liste
          )}
        </div>
      );
    });
  if (!compare)
    return (
      <div className="rappel-saisie">
        {consigne && <span className="aide petite">{consigne}</span>}
        {avecCartes.length > 0 && (
          <div className="cartes-questions">
            <span className="aide petite">Réponds à chaque question, à côté d’elle, sans regarder la fiche :</span>
            {questions(false)}
          </div>
        )}
        <textarea rows={avecCartes.length > 0 ? 2 : obligatoire ? 4 : 3} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={avecCartes.length > 0 ? 'Autre chose à retenir ? (facultatif)' : placeholder} aria-label={etiquette} />
        {obligatoire && (
          <label className="case-papier">
            <input type="checkbox" checked={surPapier} onChange={(e) => setSurPapier(e.target.checked)} /> Je l’ai écrit sur papier
          </label>
        )}
        <div className="confiance" role="group" aria-label="Penses-tu savoir ?">
          <span className="aide petite">Avant de comparer, penses-tu savoir ?</span>
          {CONFIANCES.map((c) => (
            <button key={c.id} type="button" className={confiance === c.id ? 'puce choisie' : 'puce'} aria-pressed={confiance === c.id} onClick={() => setConfiance(c.id)}>
              {c.nom}
            </button>
          ))}
        </div>
        <button className="bouton petit" disabled={!pret} onClick={() => setCompare(true)}>
          Comparer avec la fiche
        </button>
      </div>
    );
  return (
    <div className="valider-bloc">
      {fiche}
      {avecCartes.length > 0 && (
        <div className="cartes-reponses">
          <span className="aide petite">Ta réponse, puis la bonne :</span>
          {questions(true)}
        </div>
      )}
      {texte.trim() !== '' && <p className="aide petite rappel-ecrit">{avecCartes.length > 0 ? 'Écrit en plus' : 'Ce que tu avais écrit'} : « {texte.trim()} »</p>}
      {!sansErreur && (
        <label className="champ-erreur">
          <span className="aide petite">Une erreur à retenir ? (facultatif, une ligne)</span>
          <span className="ligne-erreur">
            <input value={erreur} maxLength={ERREUR_TEXTE_MAX} onChange={(e) => setErreur(e.target.value)} placeholder="Ex. : je confonds quorum et majorité" />
            {pages.length > 1 && erreur.trim() !== '' && (
              <select value={pageErreur} onChange={(e) => setPageErreur(e.target.value)} aria-label="Page de l’erreur">
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titre}
                  </option>
                ))}
              </select>
            )}
          </span>
        </label>
      )}
      <span className="aide petite">Compare, puis note-toi honnêtement :</span>
      {enfants(resultat())}
    </div>
  );
}

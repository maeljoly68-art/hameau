import { useState, type ReactNode } from 'react';
import type { Carte } from '../core/cartes.ts';
import { CONFIANCES } from '../core/confiance.ts';
import { ERREUR_TEXTE_MAX } from '../core/erreurs.ts';

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
  const [surPapier, setSurPapier] = useState(false);
  const [confiance, setConfiance] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);
  const [erreur, setErreur] = useState('');
  const [pageErreur, setPageErreur] = useState(pages[0]?.id ?? '');
  const avecCartes = pages.filter((p) => p.cartes.length > 0);
  const pret = (!obligatoire || texte.trim() !== '' || surPapier) && confiance !== null;
  const resultat = (): ResultatRappel => ({
    texte: texte.trim() === '' ? null : texte.trim(),
    confiance: confiance ?? 0,
    erreur: sansErreur || erreur.trim() === '' ? null : { texte: erreur.trim(), chapitreId: pages.length > 1 ? pageErreur : pages[0]?.id },
  });
  const questions = (avecReponses: boolean) =>
    avecCartes.map((p) => (
      <div key={p.id} className="cartes-page">
        {pages.length > 1 && <strong className="aide petite">{p.titre}</strong>}
        <ol className="cartes-liste">
          {p.cartes.map((c) => (
            <li key={c.id}>
              {c.question}
              {avecReponses && <span className="carte-reponse"> → {c.reponse}</span>}
            </li>
          ))}
        </ol>
      </div>
    ));
  if (!compare)
    return (
      <div className="rappel-saisie">
        {consigne && <span className="aide petite">{consigne}</span>}
        {avecCartes.length > 0 && (
          <div className="cartes-questions">
            <span className="aide petite">Réponds de tête à ces questions, puis écris l’essentiel :</span>
            {questions(false)}
          </div>
        )}
        <textarea rows={obligatoire ? 4 : 3} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={placeholder} aria-label={etiquette} />
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
          <span className="aide petite">Les réponses :</span>
          {questions(true)}
        </div>
      )}
      {texte.trim() !== '' && <p className="aide petite rappel-ecrit">Ce que tu avais écrit : « {texte.trim()} »</p>}
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

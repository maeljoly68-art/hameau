import { useDeferredValue, useMemo, useState } from 'react';
import { pointsSession } from '../../core/points.ts';
import { dureeSession, pauseValide } from '../../core/session.ts';
import { libelleSites, type SiteTemps } from '../../core/sites.ts';
import { correspond } from '../../core/suggestions.ts';
import { cleJour, formatDuree } from '../../core/temps.ts';
import type { Session } from '../../core/types.ts';
import { styleTeinte } from '../couleurs.ts';
import { depuisChampLocal, versChampLocal } from '../DialogueFin.tsx';
import { IconeRecherche } from '../Icones.tsx';

const PAR_PAGE = 60;

export default function Historique({
  sessions,
  sites,
  categories,
  surModifier,
  surSupprimer,
  surAjouter,
}: {
  sessions: Session[];
  /** Les sites où l'on a travaillé pendant chaque session (clé : son identifiant), vus par l'extension Chrome. */
  sites: ReadonlyMap<string, SiteTemps[]>;
  categories: string[];
  surModifier: (id: string, champs: Partial<Session>) => void;
  surSupprimer: (id: string) => void;
  surAjouter: (s: Omit<Session, 'id'>) => void;
}) {
  const [edition, setEdition] = useState<string | null>(null);
  const [ajout, setAjout] = useState<Omit<Session, 'id'> | null>(null);
  const [filtre, setFiltre] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  // Différée : sur un long historique, filtrer à chaque frappe faisait
  // trébucher la saisie sur téléphone.
  const rechercheDiferee = useDeferredValue(recherche);
  const [limite, setLimite] = useState(PAR_PAGE);

  const closes = useMemo(() => sessions.filter((s) => s.fin !== null).sort((a, b) => b.debut.localeCompare(a.debut)), [sessions]);
  const presentes = useMemo(() => [...new Set(closes.map((s) => s.categorie.trim() || 'Sans catégorie'))], [closes]);
  const visibles = useMemo(
    () => closes.filter((s) => (filtre === null || (s.categorie.trim() || 'Sans catégorie') === filtre) && correspond(s, rechercheDiferee)),
    [closes, filtre, rechercheDiferee],
  );

  // Regroupe par jour local, avec le total du jour en tête de groupe.
  const groupes = useMemo(() => {
    const g: { cle: string; titre: string; total: number; sessions: Session[] }[] = [];
    for (const s of visibles.slice(0, limite)) {
      const k = cleJour(new Date(s.debut));
      let dernier = g[g.length - 1];
      if (!dernier || dernier.cle !== k) {
        dernier = { cle: k, titre: new Date(s.debut).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), total: 0, sessions: [] };
        g.push(dernier);
      }
      dernier.sessions.push(s);
      dernier.total += dureeSession(s) ?? 0;
    }
    return g;
  }, [visibles, limite]);

  return (
    <section className="carte">
      <div className="entete">
        <h2>Historique</h2>
        <button
          className="bouton petit"
          onClick={() => {
            const fin = new Date();
            setAjout({ debut: new Date(fin.getTime() - 3_600_000).toISOString(), fin: fin.toISOString(), description: '', categorie: '', appareil: 'Ajout manuel', objectif: null, pauseSecondes: 0, pauseDepuis: null });
          }}
        >
          + Session oubliée
        </button>
      </div>
      {closes.length > 0 && (
        <label className="recherche">
          <IconeRecherche />
          <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher dans les descriptions…" aria-label="Chercher dans l’historique" />
        </label>
      )}
      {presentes.length > 1 && (
        <div className="puces" role="group" aria-label="Filtrer par catégorie">
          <button className={filtre === null ? 'puce choisie' : 'puce'} onClick={() => setFiltre(null)}>
            Tout
          </button>
          {presentes.map((c) => (
            <button key={c} className={filtre === c ? 'puce choisie' : 'puce'} onClick={() => setFiltre(filtre === c ? null : c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      {ajout && (
        <FormulaireSession
          categories={categories}
          initial={ajout}
          surValider={(s) => {
            surAjouter(s);
            setAjout(null);
          }}
          surAnnuler={() => setAjout(null)}
        />
      )}
      {closes.length === 0 && <p className="vide">Aucune session terminée pour l’instant. Lance ta première depuis le village.</p>}
      {closes.length > 0 && visibles.length === 0 && <p className="vide">Aucune session ne correspond.</p>}
      {groupes.map((g) => (
        <div key={g.cle} className="groupe-jour">
          <h3 className="jour">
            <span>{g.titre}</span>
            <span className="jour-total">{formatDuree(g.total)}</span>
          </h3>
          <ul className="historique">
            {g.sessions.map((s) => {
              const minutes = dureeSession(s);
              const atteint = s.objectif !== null && minutes !== null && minutes >= s.objectif;
              const pauseMin = pauseValide(s.pauseSecondes) / 60;
              return (
                <li key={s.id}>
                  {edition === s.id ? (
                    <FormulaireSession
                      categories={categories}
                      initial={s}
                      surValider={(champs) => {
                        surModifier(s.id, champs);
                        setEdition(null);
                      }}
                      surAnnuler={() => setEdition(null)}
                      surSupprimer={() => {
                        // Pas de confirmation : la suppression s'annule depuis le message qui suit.
                        surSupprimer(s.id);
                        setEdition(null);
                      }}
                    />
                  ) : (
                    <button className="ligne" style={styleTeinte(s.categorie)} onClick={() => setEdition(s.id)}>
                      <span className="ligne-heure">{new Date(s.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="ligne-texte">
                        <strong>{s.categorie || 'Session'}</strong>
                        {s.description ? <span className="ligne-desc">{s.description}</span> : <span className="ligne-desc discret">sans description</span>}
                        <span className="ligne-meta">
                          {s.appareil && <span className="etiquette">{s.appareil}</span>}
                          {s.objectif !== null && <span className={atteint ? 'etiquette reussie' : 'etiquette'}>{atteint ? '✓ ' : ''}objectif {s.objectif} min</span>}
                          {pauseMin >= 1 && <span className="etiquette">pause {formatDuree(pauseMin)}</span>}
                        </span>
                        <LigneSites sites={sites.get(s.id)} />
                      </span>
                      <span className="ligne-duree">
                        {minutes !== null ? formatDuree(minutes) : '—'}
                        <small>+{pointsSession(minutes)}</small>
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {visibles.length > limite && (
        <button className="bouton discret" onClick={() => setLimite(limite + PAR_PAGE)}>
          Voir plus ancien
        </button>
      )}
    </section>
  );
}

/** « Sites : claude.ai 38 min · docs.exemple.org 12 min » — rien si l'extension n'a rien vu. Les titres de pages, s'ils sont gardés, s'affichent au survol. */
function LigneSites({ sites }: { sites: SiteTemps[] | undefined }) {
  if (!sites || sites.length === 0) return null;
  const titres = sites
    .filter((x) => x.titres.length > 0)
    .map((x) => `${x.site} : ${x.titres.map((t) => t.titre).join(' · ')}`)
    .join('\n');
  return (
    <span className="ligne-sites" title={titres || undefined}>
      Sites : {libelleSites(sites)}
    </span>
  );
}

function FormulaireSession({
  initial,
  categories,
  surValider,
  surAnnuler,
  surSupprimer,
}: {
  initial: Omit<Session, 'id'>;
  categories: string[];
  surValider: (s: Omit<Session, 'id'>) => void;
  surAnnuler: () => void;
  surSupprimer?: () => void;
}) {
  const [debut, setDebut] = useState(versChampLocal(initial.debut));
  const [fin, setFin] = useState(initial.fin ? versChampLocal(initial.fin) : '');
  const [description, setDescription] = useState(initial.description);
  const [categorie, setCategorie] = useState(initial.categorie);
  const d = depuisChampLocal(debut);
  const f = depuisChampLocal(fin);
  const valide = d !== null && f !== null && Date.parse(f) >= Date.parse(d);

  return (
    <form
      className="formulaire"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valide) return;
        // On repart de TOUTE la session d'origine et on ne remplace que ce que
        // le formulaire édite : un champ ajouté plus tard survit à l'édition.
        surValider({ ...initial, debut: d, fin: f, description: description.trim(), categorie: categorie.trim() });
      }}
    >
      <div className="deux">
        <label>
          Début
          <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} />
        </label>
        <label>
          Fin
          <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />
        </label>
      </div>
      <label>
        Catégorie
        <input list="categories-hist" value={categorie} onChange={(e) => setCategorie(e.target.value)} />
        <datalist id="categories-hist">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label>
        Ce que tu as fait
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {!valide && <p className="alerte">Vérifie les dates : la fin doit suivre le début.</p>}
      <div className="actions">
        {surSupprimer && (
          <button type="button" className="bouton danger" onClick={surSupprimer}>
            Supprimer
          </button>
        )}
        <button type="button" className="bouton discret" onClick={surAnnuler}>
          Annuler
        </button>
        <button type="submit" className="bouton" disabled={!valide}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}

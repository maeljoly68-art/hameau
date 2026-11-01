import { useState } from 'react';
import { pointsSession } from '../core/points.ts';
import { derniersJours, minutesAujourdhui, minutesSemaine, parCategorie, serie } from '../core/stats.ts';
import { dureeMinutes, formatDuree } from '../core/temps.ts';
import type { Session } from '../core/types.ts';
import { CATALOGUE, type Batiment } from '../core/village.ts';
import { depuisChampLocal, versChampLocal } from './DialogueFin.tsx';

/* ───────────── Boutique ───────────── */

export function Boutique({ niveau, solde, choisi, surChoisir }: { niveau: number; solde: number; choisi: string | null; surChoisir: (b: Batiment | null) => void }) {
  return (
    <section className="carte">
      <h2>Construire</h2>
      <p className="aide">Choisis un bâtiment, puis touche une case libre du village.</p>
      <ul className="boutique">
        {CATALOGUE.map((b) => {
          const verrou = niveau < b.niveauRequis;
          const tropCher = solde < b.cout;
          return (
            <li key={b.id}>
              <button className={choisi === b.id ? 'article choisi' : 'article'} disabled={verrou || tropCher} onClick={() => surChoisir(choisi === b.id ? null : b)}>
                <span className="article-nom">{b.nom}</span>
                <span className="article-desc">{verrou ? `Niveau ${b.niveauRequis} requis` : b.description}</span>
                <span className="article-prix">{b.cout} pts</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ───────────── Statistiques ───────────── */

export function Statistiques({ sessions, maintenant }: { sessions: Session[]; maintenant: number }) {
  const m = new Date(maintenant);
  const jours = derniersJours(sessions, m, 14);
  // L'échelle se règle sur le 2e plus gros jour, plafonnée : un seul
  // marathon ne doit pas écraser toutes les autres barres.
  const tries = jours.map((j) => j.minutes).sort((a, b) => b - a);
  const echelle = Math.max(60, tries[1] ?? 0, (tries[0] ?? 0) * 0.6);
  const cats = parCategorie(sessions, m, 30);
  const totalCats = cats.reduce((a, c) => a + c.minutes, 0);

  return (
    <>
      <section className="tuiles">
        <div className="tuile">
          <span className="tuile-valeur">{formatDuree(minutesAujourdhui(sessions, m))}</span>
          <span className="tuile-nom">aujourd’hui</span>
        </div>
        <div className="tuile">
          <span className="tuile-valeur">{formatDuree(minutesSemaine(sessions, m))}</span>
          <span className="tuile-nom">cette semaine</span>
        </div>
        <div className="tuile">
          <span className="tuile-valeur">{serie(sessions, m)} j</span>
          <span className="tuile-nom">série (25 min/jour)</span>
        </div>
      </section>
      <section className="carte">
        <h2>14 derniers jours</h2>
        <div className="barres">
          {jours.map((j) => (
            <div key={j.jour} className="barre" title={`${j.jour} : ${formatDuree(j.minutes)}`}>
              <div className="barre-remplie" style={{ height: `${Math.min(100, (j.minutes / echelle) * 100)}%` }} data-deborde={j.minutes > echelle || undefined} />
              <span className="barre-jour">{new Date(j.jour + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="carte">
        <h2>Où passe ton temps (30 jours)</h2>
        {cats.length === 0 && <p className="aide">Rien encore. Lance ta première session !</p>}
        <ul className="categories">
          {cats.map((c) => (
            <li key={c.categorie}>
              <span>{c.categorie}</span>
              <span className="jauge">
                <span style={{ width: `${(c.minutes / totalCats) * 100}%` }} />
              </span>
              <span className="nombre">{formatDuree(c.minutes)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ───────────── Historique ───────────── */

export function Historique({
  sessions,
  categories,
  surModifier,
  surSupprimer,
  surAjouter,
}: {
  sessions: Session[];
  categories: string[];
  surModifier: (id: string, champs: Partial<Session>) => void;
  surSupprimer: (id: string) => void;
  surAjouter: (s: Omit<Session, 'id'>) => void;
}) {
  const [edition, setEdition] = useState<string | null>(null);
  const [ajout, setAjout] = useState<Omit<Session, 'id'> | null>(null);
  const closes = sessions.filter((s) => s.fin !== null).sort((a, b) => b.debut.localeCompare(a.debut));
  const jourDe = (s: Session) => new Date(s.debut).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <section className="carte">
      <div className="entete">
        <h2>Historique</h2>
        <button
          className="bouton petit"
          onClick={() => {
            const fin = new Date();
            setAjout({ debut: new Date(fin.getTime() - 3_600_000).toISOString(), fin: fin.toISOString(), description: '', categorie: '', appareil: 'Ajout manuel' });
          }}
        >
          + Ajouter une session oubliée
        </button>
      </div>
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
      {closes.length === 0 && <p className="aide">Aucune session terminée pour l’instant.</p>}
      <ul className="historique">
        {closes.map((s, i) => {
          const jour = jourDe(s);
          const titre = i === 0 || jour !== jourDe(closes[i - 1]) ? jour : null;
          const minutes = dureeMinutes(s.debut, s.fin);
          return (
            <li key={s.id}>
              {titre && <h3 className="jour">{titre}</h3>}
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
                    if (confirm('Supprimer cette session ? Ses points seront retirés.')) {
                      surSupprimer(s.id);
                      setEdition(null);
                    }
                  }}
                />
              ) : (
                <button className="ligne" onClick={() => setEdition(s.id)}>
                  <span className="ligne-heure">
                    {new Date(s.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="ligne-texte">
                    <strong>{s.categorie || 'Session'}</strong>
                    {s.description && <span> — {s.description}</span>}
                  </span>
                  <span className="ligne-duree">
                    {minutes !== null ? formatDuree(minutes) : '—'}
                    <small>+{pointsSession(minutes)} pts</small>
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
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

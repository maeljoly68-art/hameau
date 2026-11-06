import { useState } from 'react';
import type { Creneau } from '../../core/agenda.ts';
import { COULEURS_COURS, lienValide, lignesVersChapitres, maitriseCours, type Chapitre, type Cours, type NoteChapitre } from '../../core/cours.ts';
import { estJour, jourCourt } from '../../core/jours.ts';
import { numerosDePages } from '../../core/pages.ts';
import { NIVEAU_MAX, NOTES, type Note } from '../../core/revision.ts';
import { ajouterChapitres, ajouterNote, modifierChapitre, modifierCours, modifierNote, noterChapitre, remettreAZero, supprimerChapitre, supprimerCours, supprimerNote } from '../../data/cours.ts';
import { IconeChevron, IconeCoche, IconeLien } from '../Icones.tsx';
import { BlocAgendaCours } from './Creneaux.tsx';

export type Faire = (f: () => Promise<unknown>, message?: string) => void;

/** « Lu » pour un chapitre neuf, les quatre notes pour un chapitre déjà vu. */
/** Les quatre notes d'un passage de révision : « À revoir » ramène à demain, « Facile » saute un cran. */
export function NotesRevision({ surNote }: { surNote: (n: Note) => void }) {
  return (
    <div className="notation" role="group" aria-label="Comment s’est passée la révision ?">
      {NOTES.map((n) => (
        <button key={n.id} className={`note note-${n.id}`} onClick={() => surNote(n.id)}>
          {n.nom}
        </button>
      ))}
    </div>
  );
}

export function Notation({ niveau, surNote }: { niveau: number; surNote: (n: Note) => void }) {
  if (niveau === 0)
    return (
      <button className="bouton petit" onClick={() => surNote('bien')}>
        <IconeCoche taille={14} /> Lu
      </button>
    );
  return <NotesRevision surNote={surNote} />;
}

function Crans({ niveau }: { niveau: number }) {
  return (
    <span className="crans" role="img" aria-label={niveau === 0 ? 'À découvrir' : `Niveau ${niveau} sur ${NIVEAU_MAX}`}>
      {Array.from({ length: NIVEAU_MAX }, (_, i) => (
        <span key={i} className={i < niveau ? 'cran plein' : 'cran'} />
      ))}
    </span>
  );
}

function Notes({ chapitre, notes, faire }: { chapitre: Chapitre; notes: NoteChapitre[]; faire: Faire }) {
  const [texte, setTexte] = useState('');
  const [citation, setCitation] = useState('');
  const [edition, setEdition] = useState<{ id: string; texte: string } | null>(null);
  return (
    <div className="notes-chapitre">
      {notes.length === 0 && <p className="aide">Aucune note. Ce que tu écris ici est gardé dans ton compte, avec le chapitre.</p>}
      <ul>
        {notes.map((n) => (
          <li key={n.id}>
            {n.citation && <blockquote>{n.citation}</blockquote>}
            {edition?.id === n.id ? (
              <form
                className="ligne-formulaire"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (edition.texte.trim()) faire(() => modifierNote(n.id, edition.texte.trim()));
                  setEdition(null);
                }}
              >
                <textarea value={edition.texte} maxLength={4000} rows={3} onChange={(e) => setEdition({ id: n.id, texte: e.target.value })} aria-label="Modifier la note" autoFocus />
                <button className="bouton petit">Enregistrer</button>
              </form>
            ) : (
              <p>{n.texte}</p>
            )}
            <span className="actions-note">
              <button className="lien" onClick={() => setEdition({ id: n.id, texte: n.texte })}>
                Modifier
              </button>
              <button className="lien" onClick={() => faire(() => supprimerNote(n.id))}>
                Supprimer
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="formulaire-note"
        onSubmit={(e) => {
          e.preventDefault();
          const t = texte.trim();
          if (!t) return;
          faire(() => ajouterNote(chapitre.id, t, citation.trim() || null));
          setTexte('');
          setCitation('');
        }}
      >
        <textarea value={texte} maxLength={4000} rows={3} onChange={(e) => setTexte(e.target.value)} placeholder="Une note, une astuce, ce qui t’a bloqué…" aria-label="Nouvelle note" />
        <input value={citation} maxLength={1000} onChange={(e) => setCitation(e.target.value)} placeholder="Passage concerné (facultatif)" aria-label="Passage concerné" />
        <button className="bouton petit" disabled={!texte.trim()}>
          Ajouter la note
        </button>
      </form>
    </div>
  );
}

function EditionChapitre({ chapitre, faire, surFermer }: { chapitre: Chapitre; faire: Faire; surFermer: () => void }) {
  const [titre, setTitre] = useState(chapitre.titre);
  const [duree, setDuree] = useState(String(chapitre.dureeMin));
  return (
    <form
      className="edition-chapitre"
      onSubmit={(e) => {
        e.preventDefault();
        if (!titre.trim()) return;
        faire(() => modifierChapitre(chapitre.id, { titre: titre.trim().slice(0, 120), dureeMin: Number(duree) }));
        surFermer();
      }}
    >
      <label>
        Titre
        <input value={titre} maxLength={120} onChange={(e) => setTitre(e.target.value)} />
      </label>
      <label>
        Durée d’une première lecture (minutes)
        <input type="number" inputMode="numeric" min={5} max={240} value={duree} onChange={(e) => setDuree(e.target.value)} />
      </label>
      <div className="actions gauche">
        <button className="bouton petit">Enregistrer</button>
        {chapitre.niveau > 0 && (
          <button
            type="button"
            className="bouton petit discret"
            onClick={() => {
              if (!confirm(`Remettre « ${chapitre.titre} » à découvrir ? Sa progression repart de zéro.`)) return;
              faire(() => remettreAZero(chapitre.id), 'Chapitre remis à zéro.');
              surFermer();
            }}
          >
            Remettre à zéro
          </button>
        )}
        <button
          type="button"
          className="bouton petit danger"
          onClick={() => {
            if (!confirm(`Supprimer « ${chapitre.titre} » et ses notes ?`)) return;
            faire(() => supprimerChapitre(chapitre.id), 'Chapitre supprimé.');
          }}
        >
          Supprimer
        </button>
      </div>
    </form>
  );
}

function LigneChapitre({ chapitre, numero, cours, notes, aujourdhui, faire }: { chapitre: Chapitre; numero: number; cours: Cours; notes: NoteChapitre[]; aujourdhui: string; faire: Faire }) {
  const [ouvert, setOuvert] = useState<'notes' | 'edition' | null>(null);
  const lien = chapitre.lien ?? cours.lien;
  const enRetard = chapitre.prochaine !== null && chapitre.prochaine <= aujourdhui;
  return (
    <li className="chapitre">
      <div className="chapitre-tete">
        <Crans niveau={chapitre.niveau} />
        <div className="chapitre-titre">
          <strong>{chapitre.titre}</strong>
          <span className="aide">
            Page {numero} · {chapitre.dureeMin} min
            {chapitre.niveau === 0 ? ' · à découvrir' : chapitre.derniere ? ` · vu le ${jourCourt(chapitre.derniere)}` : ''}
            {chapitre.niveau > 0 && chapitre.prochaine && <span className={enRetard ? 'retard' : undefined}> · à revoir {enRetard ? 'maintenant' : `le ${jourCourt(chapitre.prochaine)}`}</span>}
          </span>
        </div>
      </div>
      <div className="chapitre-actions">
        <Notation niveau={chapitre.niveau} surNote={(n) => faire(() => noterChapitre(chapitre.id, n, aujourdhui), 'Noté.')} />
        <span className="chapitre-outils">
          <button className={ouvert === 'notes' ? 'lien actif' : 'lien'} onClick={() => setOuvert(ouvert === 'notes' ? null : 'notes')} aria-expanded={ouvert === 'notes'}>
            Notes{notes.length > 0 ? ` (${notes.length})` : ''}
          </button>
          <button className={ouvert === 'edition' ? 'lien actif' : 'lien'} onClick={() => setOuvert(ouvert === 'edition' ? null : 'edition')} aria-expanded={ouvert === 'edition'}>
            Modifier
          </button>
          {lien && (
            <a className="lien" href={lien} target="_blank" rel="noopener noreferrer">
              Ouvrir <IconeLien />
            </a>
          )}
        </span>
      </div>
      {ouvert === 'notes' && <Notes chapitre={chapitre} notes={notes} faire={faire} />}
      {ouvert === 'edition' && <EditionChapitre chapitre={chapitre} faire={faire} surFermer={() => setOuvert(null)} />}
    </li>
  );
}

/** `creneaux` : les cours de cette matière dans l'emploi du temps, ou null tant qu'aucun emploi du temps n'est branché. */
export function PageCours({ cours, chapitres, notes, aujourdhui, faire, creneaux, retour }: { cours: Cours; chapitres: Chapitre[]; notes: NoteChapitre[]; aujourdhui: string; faire: Faire; creneaux: readonly Creneau[] | null; retour: () => void }) {
  const [titre, setTitre] = useState(cours.titre);
  const [lien, setLien] = useState(cours.lien ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [liste, setListe] = useState('');
  const maitrise = maitriseCours(chapitres);
  const notesDe = (id: string) => notes.filter((n) => n.chapitreId === id);
  const suivant = chapitres.reduce((m, c) => Math.max(m, c.ordre + 1), 0);
  const numeros = numerosDePages(chapitres);

  return (
    <div className="page cours-detail">
      <button className="lien retour" onClick={retour}>
        <IconeChevron sens="gauche" /> Tous les cours
      </button>

      <section className="carte" style={{ borderTop: `4px solid ${cours.couleur}` }}>
        <form
          className="ligne-formulaire"
          onSubmit={(e) => {
            e.preventDefault();
            const t = titre.trim().slice(0, 120);
            if (t && t !== cours.titre) faire(() => modifierCours(cours.id, { titre: t }));
          }}
        >
          <input value={titre} maxLength={120} onChange={(e) => setTitre(e.target.value)} aria-label="Nom du cours" className="titre-cours" />
          <button className="bouton petit discret" disabled={!titre.trim() || titre.trim() === cours.titre}>
            Renommer
          </button>
        </form>
        <div className="progression-cours">
          <span className="jauge">
            <span style={{ width: `${maitrise}%`, background: cours.couleur }} />
          </span>
          <span className="aide">
            Maîtrise : <strong>{maitrise} %</strong> · {chapitres.filter((c) => c.niveau >= 1).length} / {chapitres.length} pages vues
          </span>
        </div>
        <div className="ligne-pause">
          <button
            className={cours.enPause ? 'bouton petit' : 'bouton petit discret'}
            aria-pressed={cours.enPause}
            onClick={() => faire(() => modifierCours(cours.id, { enPause: !cours.enPause }), cours.enPause ? 'Cours remis au calendrier.' : 'Cours en pause : il sort du calendrier, rien n’est perdu.')}
          >
            {cours.enPause ? 'Remettre au calendrier' : 'Mettre en pause'}
          </button>
          <span className="aide petite">{cours.enPause ? 'En pause : ni séance, ni alerte, ni partiel affiché.' : 'En pause, un cours reste ici mais sort du calendrier.'}</span>
        </div>
        <div className="deux">
          <label>
            Date du partiel
            <input
              type="date"
              value={cours.partiel ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                faire(() => modifierCours(cours.id, { partiel: v && estJour(v) ? v : null }), v ? 'Date du partiel enregistrée.' : 'Date du partiel effacée.');
              }}
            />
          </label>
          <div className="couleurs" role="group" aria-label="Couleur du cours">
            {COULEURS_COURS.map((c) => (
              <button key={c} className={c === cours.couleur ? 'pastille-couleur choisie' : 'pastille-couleur'} style={{ background: c }} aria-label={`Couleur ${c}`} aria-pressed={c === cours.couleur} onClick={() => faire(() => modifierCours(cours.id, { couleur: c }))} />
            ))}
          </div>
        </div>
        <form
          className="ligne-formulaire large"
          onSubmit={(e) => {
            e.preventDefault();
            const v = lien.trim() === '' ? null : lienValide(lien);
            if (lien.trim() !== '' && v === null) return setMessage('L’adresse doit commencer par https://');
            setMessage(null);
            faire(() => modifierCours(cours.id, { lien: v }), 'Adresse enregistrée.');
          }}
        >
          <input value={lien} onChange={(e) => setLien(e.target.value)} placeholder="Adresse de l’artefact (https://…)" aria-label="Adresse de l’artefact" inputMode="url" />
          <button className="bouton petit discret">Enregistrer</button>
          {cours.lien && (
            <a className="bouton petit" href={cours.lien} target="_blank" rel="noopener noreferrer">
              Ouvrir <IconeLien />
            </a>
          )}
        </form>
        {message && <p className="alerte douce">{message}</p>}
      </section>

      {creneaux && <BlocAgendaCours cours={cours} creneaux={creneaux} aujourdhui={aujourdhui} faire={faire} />}

      <section className="carte">
        <div className="entete">
          <h2>Chapitres</h2>
          <span className="pastille">{chapitres.length}</span>
        </div>
        {chapitres.length === 0 && <p className="aide">Aucun chapitre. Colle la liste ci-dessous, un par ligne.</p>}
        <ol className="chapitres">
          {chapitres.map((ch) => (
            <LigneChapitre key={ch.id} chapitre={ch} numero={numeros.get(ch.id) ?? 0} cours={cours} notes={notesDe(ch.id)} aujourdhui={aujourdhui} faire={faire} />
          ))}
        </ol>
      </section>

      <form
        className="carte"
        onSubmit={(e) => {
          e.preventDefault();
          const lignes = lignesVersChapitres(liste);
          if (lignes.length === 0) return;
          faire(() => ajouterChapitres(cours.id, lignes, suivant), `${lignes.length} chapitre${lignes.length > 1 ? 's' : ''} ajouté${lignes.length > 1 ? 's' : ''}.`);
          setListe('');
        }}
      >
        <h2>Ajouter des chapitres</h2>
        <textarea value={liste} onChange={(e) => setListe(e.target.value)} rows={5} placeholder={'Un chapitre par ligne.\nFiche 11 · Les pièges | 30\n(la durée en minutes, après « | », est facultative)'} aria-label="Chapitres à ajouter" />
        <button className="bouton" disabled={lignesVersChapitres(liste).length === 0}>
          Ajouter
        </button>
      </form>

      <button
        className="lien danger-lien"
        onClick={() => {
          if (!confirm(`Supprimer le cours « ${cours.titre} », ses ${chapitres.length} chapitres et leurs notes ?`)) return;
          faire(() => supprimerCours(cours.id), 'Cours supprimé.');
          retour();
        }}
      >
        Supprimer ce cours
      </button>
    </div>
  );
}

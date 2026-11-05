import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { COULEURS_COURS, DISPONIBILITES_DEFAUT, MAX_LIBRES, MINUTES_JOUR_MAX, joursAvantPartiel, lienValide, lignesVersChapitres, maitriseCours, type Chapitre, type Cours as CoursT, type Disponibilites, type DonneesCours } from '../../core/cours.ts';
import { debutDuMois, estJour, grilleDuMois, jourCourt, moisSuivant, versDate } from '../../core/jours.ts';
import { planifier, resumeParJour, seancesDuJour, type Alerte, type Plan, type TypeSeance } from '../../core/planning.ts';
import { cleJour, formatDuree } from '../../core/temps.ts';
import { ajouterCours, enregistrerDisponibilites, noterChapitre } from '../../data/cours.ts';
import { IconeChevron } from '../Icones.tsx';
import { useCours } from '../useCours.ts';
import { Notation, PageCours, type Faire } from './CoursDetail.tsx';

export interface LancerChapitre {
  coursId: string;
  titreCours: string;
  chapitreId: string;
  titreChapitre: string;
  minutes: number;
}

const TYPES: Record<TypeSeance, string> = { decouverte: 'Lecture', revision: 'Révision', consolidation: 'Dernier passage' };
const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;

function Aujourdhui({ plan, donnees, aujourdhui, faire, surLancer }: { plan: Plan; donnees: DonneesCours; aujourdhui: string; faire: Faire; surLancer: (l: LancerChapitre) => void }) {
  const seances = seancesDuJour(plan, aujourdhui);
  const total = seances.reduce((t, s) => t + s.minutes, 0);
  const faits = donnees.chapitres.filter((c) => c.derniere === aujourdhui);
  return (
    <section className="carte">
      <div className="entete">
        <h2>À faire aujourd’hui</h2>
        <span className="pastille">{seances.length > 0 ? formatDuree(total) : 'Rien de prévu'}</span>
      </div>
      {seances.length === 0 && <p className="aide">{faits.length > 0 ? 'Tout est fait pour aujourd’hui.' : 'Rien de prévu aujourd’hui : ni révision à faire, ni temps disponible. Le calendrier ci-dessous montre la suite.'}</p>}
      <ul className="seances">
        {seances.map((s) => {
          const c = donnees.cours.find((x) => x.id === s.coursId);
          const ch = donnees.chapitres.find((x) => x.id === s.chapitreId);
          if (!c || !ch) return null;
          return (
            <li key={s.chapitreId} style={teinte(c.couleur)}>
              <div className="seance-corps">
                <span className="seance-cours">{c.titre}</span>
                <strong>{ch.titre}</strong>
                <span className="aide">
                  {TYPES[s.type]} · {formatDuree(s.minutes)} · {s.raison}
                </span>
              </div>
              <div className="seance-actions">
                <Notation niveau={ch.niveau} surNote={(n) => faire(() => noterChapitre(ch.id, n, aujourdhui), 'Noté : le calendrier est recalculé.')} />
                <button className="lien" onClick={() => surLancer({ coursId: c.id, titreCours: c.titre, chapitreId: ch.id, titreChapitre: ch.titre, minutes: s.minutes })}>
                  Lancer le chrono
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {faits.length > 0 && (
        <p className="aide petite">
          Déjà travaillé aujourd’hui : {faits.map((c) => c.titre).join(', ')}.
        </p>
      )}
    </section>
  );
}

function Alertes({ alertes, donnees, aujourdhui, ouvrir }: { alertes: Alerte[]; donnees: DonneesCours; aujourdhui: string; ouvrir: (id: string) => void }) {
  if (alertes.length === 0) return null;
  return (
    <div className="alertes-cours">
      {alertes.map((a) => {
        const c = donnees.cours.find((x) => x.id === a.coursId);
        if (!c) return null;
        const avant = joursAvantPartiel(c, aujourdhui);
        return (
          <button key={`${a.type}-${a.coursId}`} className={a.type === 'surcharge' ? 'alerte' : 'alerte douce'} onClick={() => ouvrir(c.id)}>
            {a.type === 'surcharge' && (
              <>
                <strong>{c.titre}</strong> : il manque environ {formatDuree(a.minutes)} pour tout voir et revoir avant le partiel{avant !== null ? ` (dans ${avant} j)` : ''}. Ajoute du temps disponible ou décale ce que tu peux.
              </>
            )}
            {a.type === 'sans-date' && (
              <>
                <strong>{c.titre}</strong> n’a pas de date de partiel : indique-la pour qu’il passe en priorité dans le calendrier.
              </>
            )}
            {a.type === 'partiel-passe' && (
              <>
                Le partiel de <strong>{c.titre}</strong> est passé : tu peux supprimer ce cours.
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Calendrier({ plan, donnees, aujourdhui }: { plan: Plan; donnees: DonneesCours; aujourdhui: string }) {
  const [mois, setMois] = useState(() => debutDuMois(aujourdhui));
  const [choisi, setChoisi] = useState(aujourdhui);
  const resume = useMemo(() => resumeParJour(plan), [plan]);
  const partiels = useMemo(() => {
    const m = new Map<string, CoursT[]>();
    for (const c of donnees.cours) if (c.partiel) m.set(c.partiel, [...(m.get(c.partiel) ?? []), c]);
    return m;
  }, [donnees.cours]);
  const grille = grilleDuMois(mois);
  const titreMois = versDate(mois).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const duJour = seancesDuJour(plan, choisi);
  const couleur = (id: string) => donnees.cours.find((c) => c.id === id)?.couleur ?? '#888888';

  return (
    <section className="carte agenda">
      <div className="entete">
        <h2>Calendrier</h2>
        <div className="ag-nav">
          <button className="bouton petit discret" onClick={() => setMois(moisSuivant(mois, -1))} aria-label="Mois précédent">
            <IconeChevron sens="gauche" />
          </button>
          <span className="ag-mois">{titreMois}</span>
          <button className="bouton petit discret" onClick={() => setMois(moisSuivant(mois, 1))} aria-label="Mois suivant">
            <IconeChevron />
          </button>
        </div>
      </div>
      <div className="ag-grille" role="grid" aria-label={titreMois}>
        {JOURS_COURTS.map((j) => (
          <span key={j} className="ag-entete" role="columnheader">
            {j}
          </span>
        ))}
        {grille.map((j) => {
          const r = resume.get(j);
          const p = partiels.get(j);
          const classes = ['ag-jour', j.slice(0, 7) !== mois.slice(0, 7) && 'hors-mois', j === aujourdhui && 'aujourdhui', j === choisi && 'choisi', j < aujourdhui && 'passe', p && 'avec-partiel'].filter(Boolean).join(' ');
          return (
            <button key={j} className={classes} onClick={() => setChoisi(j)} aria-current={j === aujourdhui ? 'date' : undefined} aria-pressed={j === choisi} aria-label={`${jourCourt(j)}${r ? `, ${formatDuree(r.minutes)} prévues` : ''}${p ? `, partiel : ${p.map((c) => c.titre).join(', ')}` : ''}`}>
              <span className="ag-numero">{Number(j.slice(8))}</span>
              <span className="ag-points">
                {r?.cours.slice(0, 3).map((id) => <span key={id} className="ag-point" style={{ background: couleur(id) }} />)}
                {p && <span className="ag-drapeau" aria-hidden>★</span>}
              </span>
              <span className="ag-minutes">{r ? formatDuree(r.minutes) : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="ag-detail">
        <h3>{jourCourt(choisi)}{choisi === aujourdhui ? ' · aujourd’hui' : ''}</h3>
        {(partiels.get(choisi) ?? []).map((c) => (
          <p key={c.id} className="ag-partiel" style={teinte(c.couleur)}>
            ★ Partiel : <strong>{c.titre}</strong>
          </p>
        ))}
        {duJour.length === 0 && !partiels.has(choisi) && <p className="aide">{choisi < aujourdhui ? 'Jour passé.' : 'Rien de prévu ce jour-là.'}</p>}
        <ul className="seances compactes">
          {duJour.map((s) => {
            const c = donnees.cours.find((x) => x.id === s.coursId);
            const ch = donnees.chapitres.find((x) => x.id === s.chapitreId);
            if (!c || !ch) return null;
            return (
              <li key={`${s.chapitreId}-${s.type}`} style={teinte(c.couleur)}>
                <div className="seance-corps">
                  <span className="seance-cours">{c.titre}</span>
                  <strong>{ch.titre}</strong>
                  <span className="aide">
                    {TYPES[s.type]} · {formatDuree(s.minutes)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function CarteCours({ cours, chapitres, aujourdhui, ouvrir }: { cours: CoursT; chapitres: Chapitre[]; aujourdhui: string; ouvrir: () => void }) {
  const maitrise = maitriseCours(chapitres);
  const avant = joursAvantPartiel(cours, aujourdhui);
  const badge = avant === null ? 'Pas de date' : avant < 0 ? 'Passé' : avant === 0 ? 'Aujourd’hui' : `J−${avant}`;
  return (
    <button className="carte-cours" style={teinte(cours.couleur)} onClick={ouvrir}>
      <span className="carte-cours-tete">
        <strong>{cours.titre}</strong>
        <span className={avant !== null && avant >= 0 && avant <= 14 ? 'badge-partiel proche' : 'badge-partiel'}>{badge}</span>
      </span>
      <span className="jauge">
        <span style={{ width: `${maitrise}%`, background: cours.couleur }} />
      </span>
      <span className="aide">
        {chapitres.filter((c) => c.niveau >= 1).length} / {chapitres.length} chapitres vus · maîtrise {maitrise} %{cours.partiel ? ` · partiel ${jourCourt(cours.partiel)}` : ''}
      </span>
    </button>
  );
}

function TempsDisponible({ valeur, surEnregistrer }: { valeur: Disponibilites; surEnregistrer: (d: Disponibilites) => void }) {
  const [semaine, setSemaine] = useState(valeur.semaine.map(String));
  const [libres, setLibres] = useState(valeur.libres);
  const [nouveau, setNouveau] = useState('');
  const minutes = semaine.map((v) => Math.min(MINUTES_JOUR_MAX, Math.max(0, Math.round(Number(v) || 0))));
  const total = minutes.reduce((t, m) => t + m, 0);
  return (
    <form
      className="carte"
      onSubmit={(e) => {
        e.preventDefault();
        surEnregistrer({ semaine: minutes, libres });
      }}
    >
      <h2>Temps disponible</h2>
      <p className="aide">Combien de minutes peux-tu étudier chaque jour ? Le calendrier ne planifie jamais plus que ça.</p>
      <div className="semaine-dispo">
        {JOURS_COURTS.map((j, i) => (
          <label key={j}>
            {j}
            <input type="number" inputMode="numeric" min={0} max={MINUTES_JOUR_MAX} step={5} value={semaine[i]} onChange={(e) => setSemaine(semaine.map((v, k) => (k === i ? e.target.value : v)))} />
          </label>
        ))}
      </div>
      <p className="aide petite">Soit environ {formatDuree(total)} par semaine.</p>
      <div>
        <h3 className="sous-titre">Jours sans étude</h3>
        <div className="puces">
          {libres.map((j) => (
            <button type="button" key={j} className="puce choisie" onClick={() => setLibres(libres.filter((x) => x !== j))} aria-label={`Retirer ${jourCourt(j)}`}>
              {jourCourt(j)} ×
            </button>
          ))}
          {libres.length === 0 && <span className="aide">Aucun.</span>}
        </div>
        <div className="ligne-formulaire">
          <input type="date" value={nouveau} onChange={(e) => setNouveau(e.target.value)} aria-label="Ajouter un jour sans étude" />
          <button
            type="button"
            className="bouton petit discret"
            disabled={!estJour(nouveau) || libres.includes(nouveau) || libres.length >= MAX_LIBRES}
            onClick={() => {
              setLibres([...libres, nouveau].sort());
              setNouveau('');
            }}
          >
            Ajouter
          </button>
        </div>
      </div>
      <button className="bouton">Enregistrer</button>
    </form>
  );
}

function NouveauCours({ ordre, surCreer, surAnnuler }: { ordre: number; surCreer: (c: { titre: string; couleur: string; partiel: string | null; lien: string | null; ordre: number }, chapitres: { titre: string; dureeMin: number }[]) => void; surAnnuler: () => void }) {
  const [titre, setTitre] = useState('');
  const [partiel, setPartiel] = useState('');
  const [lien, setLien] = useState('');
  const [couleur, setCouleur] = useState<string>(COULEURS_COURS[ordre % COULEURS_COURS.length]);
  const [liste, setListe] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="carte"
      onSubmit={(e) => {
        e.preventDefault();
        const t = titre.trim().slice(0, 120);
        if (!t) return setMessage('Donne un nom au cours.');
        const l = lien.trim() === '' ? null : lienValide(lien);
        if (lien.trim() !== '' && l === null) return setMessage('L’adresse doit commencer par https://');
        surCreer({ titre: t, couleur, partiel: estJour(partiel) ? partiel : null, lien: l, ordre }, lignesVersChapitres(liste));
      }}
    >
      <h2>Nouveau cours</h2>
      <label>
        Nom
        <input value={titre} maxLength={120} onChange={(e) => setTitre(e.target.value)} placeholder="Droit des sociétés" autoFocus />
      </label>
      <div className="deux">
        <label>
          Date du partiel
          <input type="date" value={partiel} onChange={(e) => setPartiel(e.target.value)} />
        </label>
        <div className="couleurs" role="group" aria-label="Couleur du cours">
          {COULEURS_COURS.map((c) => (
            <button type="button" key={c} className={c === couleur ? 'pastille-couleur choisie' : 'pastille-couleur'} style={{ background: c }} aria-label={`Couleur ${c}`} aria-pressed={c === couleur} onClick={() => setCouleur(c)} />
          ))}
        </div>
      </div>
      <label>
        Adresse de l’artefact (facultatif)
        <input value={lien} onChange={(e) => setLien(e.target.value)} placeholder="https://claude.ai/artifact/…" inputMode="url" />
      </label>
      <label>
        Chapitres, un par ligne
        <textarea value={liste} onChange={(e) => setListe(e.target.value)} rows={6} placeholder={'Fiche 1 · Bases | 20\nFiche 2 · SAS\nTD 1 | 45\nFlashcards'} />
      </label>
      <p className="aide petite">{lignesVersChapitres(liste).length} chapitre(s). La durée en minutes, après « | », est facultative (20 min par défaut).</p>
      {message && <p className="alerte douce">{message}</p>}
      <div className="actions">
        <button type="button" className="lien" onClick={surAnnuler}>
          Annuler
        </button>
        <button className="bouton">Créer le cours</button>
      </div>
    </form>
  );
}

export default function OngletCours({ userId, synchronise, maintenant, surLancer, toast }: { userId: string | null; synchronise: boolean; maintenant: number; surLancer: (l: LancerChapitre) => void; toast: (texte: string) => void }) {
  const { donnees, erreur, setErreur, agir } = useCours(synchronise ? userId : null);
  // null : l'accueil ; 'nouveau' : le formulaire ; sinon l'identifiant d'un cours.
  const [vue, setVue] = useState<string | null>(null);
  const [reglage, setReglage] = useState(false);
  const aujourdhui = cleJour(new Date(maintenant));

  const faire = useCallback<Faire>(
    (f, message) => {
      void agir(f).then(
        () => {
          if (message) toast(message);
        },
        () => undefined,
      );
    },
    [agir, toast],
  );

  const plan = useMemo(() => (donnees ? planifier({ cours: donnees.cours, chapitres: donnees.chapitres, disponibilites: donnees.disponibilites, aujourdhui }) : null), [donnees, aujourdhui]);

  if (!synchronise || !userId)
    return (
      <section className="carte">
        <h2>Cours</h2>
        <p className="aide">Les cours passent par ton compte : c’est lui qui garde ta progression et ton calendrier identiques sur le téléphone, l’iPad et l’ordinateur. Connecte-toi depuis l’onglet Réglages (tes sessions de cet appareil pourront y être importées).</p>
      </section>
    );
  if (!donnees || !plan) return <div className="carte aide">{erreur ? <p className="alerte">{erreur}</p> : 'Chargement des cours…'}</div>;

  const chapitresDe = (id: string) => donnees.chapitres.filter((c) => c.coursId === id);
  const ouvert = vue && vue !== 'nouveau' ? donnees.cours.find((c) => c.id === vue) : null;

  const bandeau = erreur && (
    <button className="alerte" onClick={() => setErreur(null)}>
      {erreur} <small>(toucher pour fermer)</small>
    </button>
  );

  if (ouvert)
    return (
      <>
        {bandeau}
        <PageCours cours={ouvert} chapitres={chapitresDe(ouvert.id)} notes={donnees.notes.filter((n) => chapitresDe(ouvert.id).some((c) => c.id === n.chapitreId))} aujourdhui={aujourdhui} faire={faire} retour={() => setVue(null)} />
      </>
    );

  if (vue === 'nouveau')
    return (
      <>
        {bandeau}
        <NouveauCours
          ordre={donnees.cours.reduce((m, c) => Math.max(m, c.ordre + 1), 0)}
          surAnnuler={() => setVue(null)}
          surCreer={(c, chapitres) => {
            faire(() => ajouterCours(c, chapitres), 'Cours créé.');
            setVue(null);
          }}
        />
      </>
    );

  const prochain = donnees.cours
    .filter((c) => c.partiel !== null && c.partiel > aujourdhui)
    .sort((a, b) => (a.partiel! < b.partiel! ? -1 : 1))[0];
  const avantProchain = prochain ? joursAvantPartiel(prochain, aujourdhui) : null;

  return (
    <div className="page cours">
      {bandeau}
      {prochain && avantProchain !== null && (
        <section className="carte prochain-partiel" style={teinte(prochain.couleur)}>
          <span className="sur-titre">Prochain partiel</span>
          <strong>{prochain.titre}</strong>
          <span className="aide">
            {jourCourt(prochain.partiel!)} · dans {avantProchain} jour{avantProchain > 1 ? 's' : ''}
          </span>
        </section>
      )}

      {donnees.cours.length === 0 ? (
        <section className="carte">
          <h2>Tes cours, ton calendrier</h2>
          <p>Ajoute un cours avec ses chapitres et la date du partiel : Hameau te dit chaque jour quoi lire et quoi revoir, en espaçant les révisions de plus en plus.</p>
          <button className="bouton gros" onClick={() => setVue('nouveau')}>
            Ajouter un cours
          </button>
        </section>
      ) : (
        <>
          <Aujourdhui plan={plan} donnees={donnees} aujourdhui={aujourdhui} faire={faire} surLancer={surLancer} />
          <Alertes alertes={plan.alertes} donnees={donnees} aujourdhui={aujourdhui} ouvrir={setVue} />
          <Calendrier plan={plan} donnees={donnees} aujourdhui={aujourdhui} />
          <section className="carte">
            <div className="entete">
              <h2>Mes cours</h2>
              <button className="bouton petit" onClick={() => setVue('nouveau')}>
                Ajouter
              </button>
            </div>
            <div className="liste-cours">
              {donnees.cours.map((c) => (
                <CarteCours key={c.id} cours={c} chapitres={chapitresDe(c.id)} aujourdhui={aujourdhui} ouvrir={() => setVue(c.id)} />
              ))}
            </div>
          </section>
        </>
      )}

      <button className={reglage ? 'bouton discret actif' : 'bouton discret'} onClick={() => setReglage(!reglage)} aria-expanded={reglage}>
        Temps disponible
      </button>
      {reglage && (
        <TempsDisponible
          key={JSON.stringify(donnees.disponibilites)}
          valeur={donnees.disponibilites ?? DISPONIBILITES_DEFAUT}
          surEnregistrer={(d) => {
            faire(() => enregistrerDisponibilites(userId, d), 'Temps disponible enregistré : le calendrier est recalculé.');
            setReglage(false);
          }}
        />
      )}

      <details className="carte explication">
        <summary>Comment le calendrier est calculé</summary>
        <ol>
          <li>Le partiel le plus proche passe en premier.</li>
          <li>Un chapitre lu est revu dès le lendemain, puis après 3, 7, 14, 30 jours : l’écart grandit à chaque révision réussie.</li>
          <li>Ta note ajuste l’écart : « À revoir » ramène à demain, « Difficile » le divise par deux, « Facile » saute un cran.</li>
          <li>Les chapitres neufs se lisent dans l’ordre, jamais dans les 3 derniers jours avant le partiel.</li>
          <li>Dans les 4 derniers jours, chaque chapitre a un dernier passage, sans rien de nouveau.</li>
          <li>Si ton temps disponible ne suffit pas, Hameau le dit et chiffre ce qui manque.</li>
        </ol>
        <p className="aide">Le calendrier n’est pas enregistré : il se recalcule à chaque fois depuis où tu en es vraiment.</p>
      </details>
    </div>
  );
}

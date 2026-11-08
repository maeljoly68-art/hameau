import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { emploiDuTemps, partielProbable, plageHeures, salleCourte, type Creneau, type EmploiDuTemps } from '../../core/agenda.ts';
import { COULEURS_COURS, DISPONIBILITES_DEFAUT, MAX_LIBRES, MINUTES_JOUR_MAX, RAPPEL_DEFAUT, RAPPEL_MAX, REDUCTION_DEFAUT, REDUCTION_MAX, RELECTURE_MAX, VITESSE_MAX, VITESSE_MIN, joursAvantPartiel, lienValide, lignesVersChapitres, maitriseCours, vitesseValide, type Chapitre, type Cours as CoursT, type Disponibilites, type DonneesCours } from '../../core/cours.ts';
import { ajouterJours, debutDuMois, estJour, grilleDuMois, jourCourt, jourSemaine, moisSuivant, versDate } from '../../core/jours.ts';
import { LIBELLE_ETAPE, arrondi5, libellePages, regrouper, sansCoupure, type Etape } from '../../core/pages.ts';
import { examensFaits as calculerExamensFaits, pagesFragiles } from '../../core/passages.ts';
import { cartesParPage } from '../../core/cartes.ts';
import { reservesPratique } from '../../core/pratique.ts';
import { fusionnerLibres, minutesLibresParJour, seancesLibres, type SeanceLibre } from '../../core/revisionLibre.ts';
import { construireRappel } from '../../core/rappel.ts';
import { estVeille } from '../../core/fiche.ts';
import { heuresProductives, type Heures } from '../../core/heures.ts';
import { JOURS_AVANT_DEBUT, PLEIN_COURS, SEUIL_COURS, planifier, resumeParJour, seancesDuJour, type Alerte, type Plan, type TypeSeance } from '../../core/planning.ts';
import { cleJour, formatDuree } from '../../core/temps.ts';
import { libelleVitesse } from '../../core/vitesse.ts';
import { viderCacheAgenda } from '../../data/agenda.ts';
import { ajouterCours, enregistrerAgendaLien, enregistrerDisponibilites } from '../../data/cours.ts';
import type { Session } from '../../core/types.ts';
import { IconeChevron } from '../Icones.tsx';
import { useAgenda } from '../useAgenda.ts';
import { useCours } from '../useCours.ts';
import { Bilan } from './Bilan.tsx';
import { CarnetDuJour } from './Carnet.tsx';
import { ValiderBloc } from './Blocs.tsx';
import { PageCours, type Faire } from './CoursDetail.tsx';
import { PratiqueDuJour } from './Pratique.tsx';
import { RevisionLibreDuJour } from './RevisionLibre.tsx';
import { RappelDuJour } from './Rappel.tsx';
import { Semaine } from './Semaine.tsx';
import { ListeCreneaux, NoteCharge, ReglageAgenda } from './Creneaux.tsx';

/** Une séance lancée au chrono : une page, ou un bloc de pages (« Pages 1 à 7 »). */
export interface LancerChapitre {
  coursId: string;
  titreCours: string;
  /** Ce qu'on travaille, pour le chrono et la fenêtre de fin : le titre de la page, ou « Pages 1 à 7 ». */
  titre: string;
  chapitreIds: string[];
  /** Les pages que cette séance finit : seules elles passent pour lues à la validation. */
  termines: string[];
  type: TypeSeance;
  /** Lire, apprendre par cœur ou réviser : la fenêtre de fin de chrono n'en dit pas la même chose. */
  etape: Etape;
  /** Au moins une page est à savoir mot pour mot. */
  parCoeur: boolean;
  /** Durée prévue : l'objectif du chrono, et ce à quoi la durée réelle sera comparée pour préciser ta vitesse. */
  minutes: number;
}
/** L'heure, sur l'appareil, à laquelle un passage a été écrit (le cœur ne lit ni l'horloge ni le fuseau). */
const heureLocale = (creeLe: string): number | null => {
  const d = new Date(creeLe);
  return Number.isNaN(d.getTime()) ? null : d.getHours();
};
const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;

/** La teinte du cours de Hameau auquel un créneau de l'emploi du temps appartient, ou null s'il n'appartient à aucun. */
const couleurCreneau = (edt: EmploiDuTemps | null, cours: readonly CoursT[]) => (c: Creneau): string | null => {
  const id = edt?.coursDe.get(c.id);
  return id ? (cours.find((x) => x.id === id)?.couleur ?? null) : null;
};

function Aujourdhui({ plan, donnees, aujourdhui, faire, surLancer, surChrono, sessions, libres, edt, userId, fragiles, ouvrirFiche, moments }: { plan: Plan; donnees: DonneesCours; aujourdhui: string; faire: Faire; surLancer: (l: LancerChapitre) => void; surChrono: (categorie: string, minutes: number) => void; sessions: readonly Session[]; libres: readonly SeanceLibre[]; edt: EmploiDuTemps | null; userId: string; fragiles: ReadonlySet<string>; ouvrirFiche: (coursId: string) => void; moments: Heures }) {
  const seances = seancesDuJour(plan, aujourdhui);
  // Quelques révisions du jour se font par rappel (de tête, cours mélangés) ; le reste, en blocs, se note d'un geste.
  // Sans le journal on ne saurait pas combien de rappels sont déjà faits aujourd'hui : pas de rappel, plutôt qu'un rappel sans fin.
  const dejaFaits = donnees.passages.filter((p) => p.sorte === 'rappel' && p.jour === aujourdhui).length;
  const rappel = construireRappel({ seances, chapitres: donnees.chapitres, cours: donnees.cours, fragiles, aujourdhui, max: donnees.journal ? (donnees.disponibilites.rappel ?? RAPPEL_DEFAUT) : 0, dejaFaits, chargeJour: edt?.charge.get(aujourdhui) ?? 0 });
  const blocs = regrouper(rappel.restantes, donnees.chapitres);
  const cartesDe = cartesParPage(donnees.cartes);
  const cours = edt?.parJour.get(aujourdhui) ?? [];
  const veilles = donnees.cours.filter((c) => !c.enPause && estVeille(joursAvantPartiel(c, aujourdhui)));
  const libresDuJour = libres.filter((s) => s.jour === aujourdhui);
  const total = seances.reduce((t, s) => t + s.minutes, 0) + libresDuJour.reduce((t, s) => t + s.minutes, 0);
  const faits = donnees.chapitres.filter((c) => c.derniere === aujourdhui);
  return (
    <section className="carte">
      <div className="entete">
        <h2>À faire aujourd’hui</h2>
        <span className="pastille">{seances.length > 0 || libresDuJour.length > 0 ? `≈ ${formatDuree(arrondi5(total))}` : 'Rien de prévu'}</span>
      </div>
      {cours.length > 0 && (
        <div className="cours-du-jour">
          <h3 className="sous-titre">Tes cours aujourd’hui</h3>
          <ListeCreneaux creneaux={cours} couleurDe={couleurCreneau(edt, donnees.cours)} />
          <NoteCharge jour={aujourdhui} minutesDeCours={edt?.charge.get(aujourdhui) ?? 0} disponibilites={donnees.disponibilites} />
        </div>
      )}
      {seances.length === 0 && rappel.items.length === 0 && libresDuJour.length === 0 && <p className="aide">{faits.length > 0 ? 'Tout est fait pour aujourd’hui.' : 'Rien de prévu aujourd’hui : ni révision à faire, ni temps disponible. Le calendrier ci-dessous montre la suite.'}</p>}
      {veilles.map((c) => (
        <button key={c.id} className="alerte douce fiche-veille-banniere" onClick={() => ouvrirFiche(c.id)}>
          <strong>Partiel de {c.titre} dans {joursAvantPartiel(c, aujourdhui)} jour{joursAvantPartiel(c, aujourdhui) === 1 ? '' : 's'}</strong> : la fiche de la veille t’attend (erreurs, mot pour mot, pages fragiles).
        </button>
      ))}
      <RappelDuJour rappel={rappel} donnees={donnees} aujourdhui={aujourdhui} faire={faire} />
      <CarnetDuJour donnees={donnees} aujourdhui={aujourdhui} faire={faire} />
      {moments.meilleur && fragiles.size > 0 && (
        <p className="aide petite conseil-heure">
          Tes notes sont les meilleures {moments.meilleur.nom === 'Matin' ? 'le matin' : moments.meilleur.nom === 'Midi' ? 'à midi' : moments.meilleur.nom === 'Après-midi' ? 'l’après-midi' : moments.meilleur.nom === 'Soir' ? 'le soir' : 'la nuit'} ({moments.meilleur.plage}) : garde ce moment pour tes pages fragiles.
        </p>
      )}
      <ul className="seances">
        {blocs.map((b) => {
          const c = donnees.cours.find((x) => x.id === b.coursId);
          if (!c) return null;
          const titres = b.chapitreIds.map((id) => donnees.chapitres.find((x) => x.id === id)?.titre ?? '');
          const seule = b.chapitreIds.length === 1;
          const nom = seule ? titres[0] : libellePages(b.pages);
          return (
            <li key={`${b.coursId}-${b.etape}`} style={teinte(c.couleur)}>
              <div className="seance-corps">
                <span className="seance-cours">{c.titre}</span>
                <strong>{nom}</strong>
                <span className="aide">
                  {seule ? `Page ${b.pages[0]} · ` : ''}
                  {sansCoupure(`${LIBELLE_ETAPE[b.etape]} · ≈ ${formatDuree(arrondi5(b.minutes))} · `)}
                  <span className={b.retard > 0 ? 'en-retard' : undefined}>{sansCoupure(b.raison)}</span>
                  {b.fragile && <span className="badge-fragile">Page fragile</span>}
                </span>
                {!seule && <span className="aide petite pages-titres">{titres.join(' · ')}</span>}
              </div>
              <div className="seance-actions">
                <ValiderBloc bloc={b} aujourdhui={aujourdhui} userId={userId} faire={faire} pages={b.chapitreIds.map((id, i) => ({ id, titre: titres[i], cartes: cartesDe.get(id) ?? [] }))} lien={(seule ? donnees.chapitres.find((x) => x.id === b.chapitreIds[0])?.lien : null) ?? c.lien} />
                <button className="lien" onClick={() => surLancer({ coursId: c.id, titreCours: c.titre, titre: nom, chapitreIds: b.chapitreIds, termines: b.termines, type: b.type, etape: b.etape, parCoeur: b.parCoeur, minutes: b.minutes })}>
                  Lancer le chrono
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <RevisionLibreDuJour seances={libresDuJour} donnees={donnees} sessions={sessions} aujourdhui={aujourdhui} faire={faire} surChrono={surChrono} />
      {seances.length > 0 && <p className="aide petite">Ce que tu ne valides pas revient demain : une révision en retard est signalée, une lecture se replace au calendrier.</p>}
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
            {a.type === 'pas-commence' && (
              <>
                <strong>{c.titre}</strong> n’a pas commencé : premier cours le {jourCourt(a.debut)}, au calendrier à partir du {jourCourt(ajouterJours(a.debut, -JOURS_AVANT_DEBUT))} (lis un de ses chapitres pour t’y mettre plus tôt).
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Calendrier({ plan, libres, donnees, aujourdhui, edt }: { plan: Plan; libres: readonly SeanceLibre[]; donnees: DonneesCours; aujourdhui: string; edt: EmploiDuTemps | null }) {
  const [mois, setMois] = useState(() => debutDuMois(aujourdhui));
  const [choisi, setChoisi] = useState(aujourdhui);
  const resume = useMemo(() => fusionnerLibres(resumeParJour(plan), libres), [plan, libres]);
  const libresDuChoisi = libres.filter((s) => s.jour === choisi);
  const partiels = useMemo(() => {
    const m = new Map<string, CoursT[]>();
    for (const c of donnees.cours) if (c.partiel && !c.enPause) m.set(c.partiel, [...(m.get(c.partiel) ?? []), c]);
    return m;
  }, [donnees.cours]);
  const grille = grilleDuMois(mois);
  const titreMois = versDate(mois).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const duJour = regrouper(seancesDuJour(plan, choisi), donnees.chapitres);
  const couleur = (id: string) => donnees.cours.find((c) => c.id === id)?.couleur ?? '#888888';
  const coursDuChoisi = edt?.parJour.get(choisi) ?? [];

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
      <div className="ag-grille" role="group" aria-label={titreMois}>
        {JOURS_COURTS.map((j) => (
          <span key={j} className="ag-entete" aria-hidden="true">
            {j}
          </span>
        ))}
        {grille.map((j) => {
          const r = resume.get(j);
          const p = partiels.get(j);
          const charge = edt?.charge.get(j) ?? 0;
          const classes = ['ag-jour', j.slice(0, 7) !== mois.slice(0, 7) && 'hors-mois', j === aujourdhui && 'aujourdhui', j === choisi && 'choisi', j < aujourdhui && 'passe', p && 'avec-partiel'].filter(Boolean).join(' ');
          return (
            <button key={j} className={classes} onClick={() => setChoisi(j)} aria-current={j === aujourdhui ? 'date' : undefined} aria-pressed={j === choisi} aria-label={`${jourCourt(j)}${charge > 0 ? `, ${formatDuree(charge)} de cours` : ''}${r ? `, ${formatDuree(r.minutes)} prévues` : ''}${p ? `, partiel : ${p.map((c) => c.titre).join(', ')}` : ''}`}>
              <span className="ag-numero">{Number(j.slice(8))}</span>
              <span className="ag-points">
                {r?.cours.slice(0, 3).map((id) => <span key={id} className="ag-point" style={{ background: couleur(id) }} />)}
                {p && <span className="ag-drapeau" aria-hidden>★</span>}
              </span>
              <span className="ag-minutes">{r ? formatDuree(arrondi5(r.minutes)) : ''}</span>
              {charge > 0 && <span className="ag-barre" style={{ '--charge': Math.min(1, charge / PLEIN_COURS) } as CSSProperties} aria-hidden />}
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
        {coursDuChoisi.length > 0 && (
          <>
            <ListeCreneaux creneaux={coursDuChoisi} couleurDe={couleurCreneau(edt, donnees.cours)} />
            <NoteCharge jour={choisi} minutesDeCours={edt?.charge.get(choisi) ?? 0} disponibilites={donnees.disponibilites} />
          </>
        )}
        {duJour.length === 0 && libresDuChoisi.length === 0 && !partiels.has(choisi) && <p className="aide">{choisi < aujourdhui ? 'Jour passé.' : coursDuChoisi.length > 0 ? 'Pas de révision prévue ce jour-là.' : 'Rien de prévu ce jour-là.'}</p>}
        <ul className="seances compactes">
          {duJour.map((b) => {
            const c = donnees.cours.find((x) => x.id === b.coursId);
            if (!c) return null;
            const seule = b.chapitreIds.length === 1;
            return (
              <li key={`${b.coursId}-${b.etape}`} style={teinte(c.couleur)}>
                <div className="seance-corps">
                  <span className="seance-cours">{c.titre}</span>
                  <strong>{seule ? (donnees.chapitres.find((x) => x.id === b.chapitreIds[0])?.titre ?? libellePages(b.pages)) : libellePages(b.pages)}</strong>
                  <span className="aide">
                    {seule ? `Page ${b.pages[0]} · ` : ''}
                    {LIBELLE_ETAPE[b.etape]} · ≈ {formatDuree(arrondi5(b.minutes))}
                  </span>
                </div>
              </li>
            );
          })}
          {libresDuChoisi.map((l) => {
            const c = donnees.cours.find((x) => x.id === l.coursId);
            return c ? (
              <li key={`libre-${l.coursId}`} style={teinte(c.couleur)}>
                <div className="seance-corps">
                  <span className="seance-cours">{c.titre}</span>
                  <strong>Étude libre</strong>
                  <span className="aide">≈ {formatDuree(arrondi5(l.minutes))} · relis ton cours, refais des exercices</span>
                </div>
              </li>
            ) : null;
          })}
        </ul>
      </div>
    </section>
  );
}

function CarteCours({ cours, chapitres, aujourdhui, debut, ouvrir }: { cours: CoursT; chapitres: Chapitre[]; aujourdhui: string; debut: string | undefined; ouvrir: () => void }) {
  const maitrise = maitriseCours(chapitres);
  const avant = joursAvantPartiel(cours, aujourdhui);
  const badge = avant === null ? (debut && debut > aujourdhui ? `Dès le ${jourCourt(debut)}` : 'Pas de date') : avant < 0 ? 'Passé' : avant === 0 ? 'Aujourd’hui' : `J−${avant}`;
  return (
    <button className={cours.enPause ? 'carte-cours en-pause' : 'carte-cours'} style={teinte(cours.couleur)} onClick={ouvrir}>
      <span className="carte-cours-tete">
        <strong>{cours.titre}</strong>
        <span className={!cours.enPause && avant !== null && avant >= 0 && avant <= 14 ? 'badge-partiel proche' : 'badge-partiel'}>{cours.enPause ? 'En pause' : badge}</span>
      </span>
      {cours.pratiqueMin !== null && <span className="badge-pratique">Pratique quotidienne · {cours.pratiqueMin} min</span>}
      {cours.revisionLibreMin !== null && <span className="badge-pratique">Étude libre · {cours.revisionLibreMin} min</span>}
      <span className="jauge">
        <span style={{ width: `${maitrise}%`, background: cours.couleur }} />
      </span>
      <span className="aide">
        {chapitres.filter((c) => c.niveau >= 1).length} / {chapitres.length} pages vues · maîtrise {maitrise} %{cours.partiel ? ` · partiel ${jourCourt(cours.partiel)}` : ''}
      </span>
    </button>
  );
}

function TempsDisponible({ valeur, avecEmploiDuTemps, surEnregistrer }: { valeur: Disponibilites; avecEmploiDuTemps: boolean; surEnregistrer: (d: Disponibilites) => void }) {
  const [semaine, setSemaine] = useState(valeur.semaine.map(String));
  const [reduction, setReduction] = useState(String(valeur.reduction ?? REDUCTION_DEFAUT));
  const [relecture, setRelecture] = useState(String(valeur.relecture ?? 0));
  const [vitesse, setVitesse] = useState(String(valeur.vitesse ?? 1));
  const [rappel, setRappel] = useState(String(valeur.rappel ?? RAPPEL_DEFAUT));
  const [libres, setLibres] = useState(valeur.libres);
  const [nouveau, setNouveau] = useState('');
  const minutes = semaine.map((v) => Math.min(MINUTES_JOUR_MAX, Math.max(0, Math.round(Number(v) || 0))));
  const total = minutes.reduce((t, m) => t + m, 0);
  return (
    <form
      className="carte"
      onSubmit={(e) => {
        e.preventDefault();
        surEnregistrer({
          semaine: minutes,
          libres,
          reduction: Math.min(REDUCTION_MAX, Math.max(0, Math.round(Number(reduction) || 0))),
          relecture: Math.min(RELECTURE_MAX, Math.max(0, Math.round(Number(relecture) || 0))),
          vitesse: vitesseValide(Number(vitesse) || 1),
          rappel: Math.min(RAPPEL_MAX, Math.max(0, Math.round(Number(rappel) || 0))),
        });
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
      {avecEmploiDuTemps && (
        <label>
          Jours de cours chargés : retirer jusqu’à (%)
          <input type="number" inputMode="numeric" min={0} max={REDUCTION_MAX} step={5} value={reduction} onChange={(e) => setReduction(e.target.value)} />
          <span className="aide petite">
            Rien jusqu’à {SEUIL_COURS / 60} h de cours dans la journée, puis de plus en plus, jusqu’à ce pourcentage pour {PLEIN_COURS / 60} h. 0 : ton temps ne change jamais.
          </span>
        </label>
      )}
      {avecEmploiDuTemps && (
        <label>
          Relecture les jours de cours (minutes)
          <input type="number" inputMode="numeric" min={0} max={RELECTURE_MAX} step={5} value={relecture} onChange={(e) => setRelecture(e.target.value)} />
          <span className="aide petite">Prise SUR ton temps du jour (1 h 30 dont 30 min de relecture), avant toute lecture neuve : les pages déjà vues des cours dont le partiel est le plus proche, sans note. 0 : aucune relecture.</span>
        </label>
      )}
      <label>
        Pages du rappel du jour
        <input type="number" inputMode="numeric" min={0} max={RAPPEL_MAX} step={1} value={rappel} onChange={(e) => setRappel(e.target.value)} />
        <span className="aide petite">Chaque jour, quelques révisions se font de tête : tu écris l’essentiel sans regarder, tu ouvres la fiche pour comparer, puis tu te notes. 0 : pas de rappel, toutes les révisions se notent d’un geste.</span>
      </label>
      <label>
        Ta vitesse de lecture
        <input type="number" inputMode="decimal" min={VITESSE_MIN} max={VITESSE_MAX} step="any" value={vitesse} onChange={(e) => setVitesse(e.target.value)} />
        <span className="aide petite">
          Aujourd’hui : {libelleVitesse(Number(vitesse))}. 1 = la durée tirée de la taille des pages ; 1,3 = tu mets 30 % de plus. Elle se précise toute seule à chaque séance que tu valides (« plus vite », « plus lent ») ou chronomètres.
        </span>
      </label>
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

export default function OngletCours({ userId, synchronise, maintenant, sessions, surLancer, surChrono, toast }: { userId: string | null; synchronise: boolean; maintenant: number; sessions: readonly Session[]; surLancer: (l: LancerChapitre) => void; surChrono: (categorie: string, minutes: number) => void; toast: (texte: string) => void }) {
  const { donnees, erreur, setErreur, agir } = useCours(synchronise ? userId : null);
  // L'emploi du temps de l'université : lu depuis le lien enregistré dans le compte.
  const agenda = useAgenda(synchronise ? userId : null, donnees?.agendaLien ?? null);
  // null : l'accueil ; 'nouveau' : le formulaire ; sinon l'identifiant d'un cours.
  const [vue, setVue] = useState<string | null>(null);
  const [reglage, setReglage] = useState(false);
  const [reglageEdt, setReglageEdt] = useState(false);
  // La fiche de la veille s'ouvre d'emblée quand on y arrive depuis « la fiche de la veille t'attend ».
  const [ficheAuDepart, setFicheAuDepart] = useState(false);
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

  const edt = useMemo(() => (donnees && agenda.creneaux ? emploiDuTemps(agenda.creneaux, donnees.cours.map((c) => ({ id: c.id, titre: c.titre, motifs: c.motifs, ordre: c.ordre }))) : null), [donnees, agenda.creneaux]);
  const passages = donnees?.passages;
  const chapitresDonnees = donnees?.chapitres;
  const fragiles = useMemo(() => pagesFragiles(passages ?? [], aujourdhui), [passages, aujourdhui]);
  const moments = useMemo(() => heuresProductives(passages ?? [], heureLocale), [passages]);
  // Sans le journal, on ne saurait pas qu'un examen blanc a été passé : il reviendrait sans fin. Pas d'examen blanc alors.
  const journal = donnees?.journal ?? false;
  const coursDonnees = donnees?.cours;
  const examensFaits = useMemo(() => (journal ? calculerExamensFaits(passages ?? [], chapitresDonnees ?? [], aujourdhui) : new Set((coursDonnees ?? []).map((c) => c.id))), [journal, passages, chapitresDonnees, coursDonnees, aujourdhui]);
  // La durée d'un examen blanc est celle de l'épreuve, quand l'emploi du temps la donne (le dernier cours magistral du cours).
  const examens = useMemo(() => {
    const m = new Map<string, number>();
    if (!donnees || !edt) return m;
    for (const c of donnees.cours) {
      const p = c.partiel ? partielProbable(edt.parCours.get(c.id) ?? [], aujourdhui) : null;
      if (p && p.jour === c.partiel && p.fin > p.debut) m.set(c.id, p.fin - p.debut);
    }
    return m;
  }, [donnees, edt, aujourdhui]);
  // La pratique quotidienne, puis les séances de révision libre, sont mises de côté AVANT de placer les pages.
  const reserves = useMemo(() => (donnees ? reservesPratique(donnees.cours, aujourdhui) : []), [donnees, aujourdhui]);
  const libres = useMemo(() => (donnees ? seancesLibres({ cours: donnees.cours, disponibilites: donnees.disponibilites, aujourdhui, charge: edt?.charge, reserves }) : []), [donnees, aujourdhui, edt, reserves]);
  const plan = useMemo(() => (donnees ? planifier({ cours: donnees.cours, chapitres: donnees.chapitres, disponibilites: donnees.disponibilites, aujourdhui, charge: edt?.charge, debuts: edt?.debuts, fragiles, examens, examensFaits, reserves, reservesJours: minutesLibresParJour(libres) }) : null), [donnees, aujourdhui, edt, fragiles, examens, examensFaits, reserves, libres]);

  if (!synchronise || !userId)
    return (
      <section className="carte">
        <h2>Cours</h2>
        <p className="aide">Les cours passent par ton compte : c’est lui qui garde ta progression et ton calendrier identiques sur le téléphone, l’iPad et l’ordinateur. Connecte-toi depuis l’onglet Réglages (tes sessions de cet appareil pourront y être importées).</p>
      </section>
    );
  if (!donnees || !plan) return <div className="carte aide">{erreur ? <p className="alerte">{erreur}</p> : 'Chargement des cours…'}</div>;

  const chapitresDe = (id: string) => donnees.chapitres.filter((c) => c.coursId === id);
  const panneauAgenda = (integre: boolean) => (
    <ReglageAgenda
      integre={integre}
      userId={userId}
      lien={donnees.agendaLien}
      nombre={agenda.creneaux ? agenda.creneaux.length : null}
      majLe={agenda.majLe}
      erreur={agenda.erreur}
      enCours={agenda.enCours}
      surBrancher={(lien, nombre) => {
        // `agir` plutôt que `faire` : le panneau ne se referme que si l'enregistrement a réussi.
        void agir(() => enregistrerAgendaLien(userId, lien)).then(
          () => {
            toast(`Emploi du temps branché : ${nombre} créneaux lus.`);
            setReglageEdt(false);
          },
          () => undefined,
        );
      }}
      surRetirer={() => {
        viderCacheAgenda(userId);
        faire(() => enregistrerAgendaLien(userId, null), 'Emploi du temps retiré.');
        setReglageEdt(false);
      }}
      surActualiser={() => void agenda.actualiser()}
    />
  );
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
        <PageCours cours={ouvert} chapitres={chapitresDe(ouvert.id)} notes={donnees.notes.filter((n) => chapitresDe(ouvert.id).some((c) => c.id === n.chapitreId))} cartes={donnees.cartes} erreurs={donnees.erreurs} fragiles={fragiles} carnet={donnees.carnet} ficheAuDepart={ficheAuDepart} aujourdhui={aujourdhui} faire={faire} creneaux={edt ? (edt.parCours.get(ouvert.id) ?? []) : null} retour={() => { setFicheAuDepart(false); setVue(null); }} />
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

  // Le prochain jour de partiels, avec TOUS les partiels de ce jour-là (il peut y en avoir deux), l'heure et la salle quand l'emploi du temps les donne.
  const aVenir = donnees.cours.filter((c) => !c.enPause && c.partiel !== null && c.partiel > aujourdhui);
  const jourProchain = aVenir.reduce<string | null>((m, c) => (m === null || c.partiel! < m ? c.partiel : m), null);
  const prochains = aVenir.filter((c) => c.partiel === jourProchain);
  const avantProchain = jourProchain !== null ? joursAvantPartiel({ partiel: jourProchain }, aujourdhui) : null;
  const heureDuPartiel = (c: CoursT): string | null => {
    const p = edt ? partielProbable(edt.parCours.get(c.id) ?? [], aujourdhui) : null;
    if (!p || p.jour !== c.partiel) return null;
    const salle = salleCourte(p.lieu);
    return `${plageHeures(p)}${salle ? ` · ${salle}` : ''}`;
  };

  return (
    <div className="page cours">
      {bandeau}
      {jourProchain !== null && avantProchain !== null && (
        <section className="carte prochain-partiel" style={teinte(prochains[0].couleur)}>
          <span className="sur-titre">Prochain{prochains.length > 1 ? 's' : ''} partiel{prochains.length > 1 ? 's' : ''}</span>
          {prochains.map((c) => (
            <div key={c.id} className="partiel-ligne">
              <strong>{c.titre}</strong>
              {heureDuPartiel(c) && <span className="aide">{heureDuPartiel(c)}</span>}
            </div>
          ))}
          <span className="aide">
            {jourCourt(jourProchain)} · dans {avantProchain} jour{avantProchain > 1 ? 's' : ''}
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
          <PratiqueDuJour donnees={donnees} sessions={sessions} aujourdhui={aujourdhui} faire={faire} surChrono={surChrono} />
          <Aujourdhui plan={plan} donnees={donnees} aujourdhui={aujourdhui} faire={faire} surLancer={surLancer} surChrono={surChrono} sessions={sessions} libres={libres} edt={edt} userId={userId} fragiles={fragiles} moments={moments} ouvrirFiche={(id) => { setFicheAuDepart(true); setVue(id); }} />
          <Alertes alertes={plan.alertes} donnees={donnees} aujourdhui={aujourdhui} ouvrir={setVue} />
          {/* Sans emploi du temps lu (jamais, ou plus de cache), le calendrier ignore les cours : on le dit, au lieu de laisser croire qu'il en tient compte. Hors ligne avec un cache, rien à dire : le panneau montre l'erreur. */}
          {donnees.agendaLien && agenda.erreur && agenda.creneaux === null && <p className="alerte douce">Emploi du temps : {agenda.erreur}</p>}
          {!donnees.agendaLien && (
            <details className="carte explication">
              <summary>Brancher mon emploi du temps</summary>
              {panneauAgenda(true)}
            </details>
          )}
          <Semaine plan={plan} donnees={donnees} libres={libres} aujourdhui={aujourdhui} charge={edt?.charge} userId={userId} faire={faire} surLancer={surLancer} />
          <Calendrier plan={plan} libres={libres} donnees={donnees} aujourdhui={aujourdhui} edt={edt} />
          <Bilan donnees={donnees} aujourdhui={aujourdhui} fragiles={fragiles} moments={moments} ouvert={jourSemaine(aujourdhui) === 6} />
          <section className="carte">
            <div className="entete">
              <h2>Mes cours</h2>
              <button className="bouton petit" onClick={() => setVue('nouveau')}>
                Ajouter
              </button>
            </div>
            <div className="liste-cours">
              {donnees.cours.map((c) => (
                <CarteCours key={c.id} cours={c} chapitres={chapitresDe(c.id)} aujourdhui={aujourdhui} debut={edt?.debuts.get(c.id)} ouvrir={() => setVue(c.id)} />
              ))}
            </div>
          </section>
        </>
      )}

      <div className="reglages-cours">
        <button className={reglage ? 'bouton discret actif' : 'bouton discret'} onClick={() => setReglage(!reglage)} aria-expanded={reglage}>
          Temps disponible
        </button>
        {donnees.agendaLien && (
          <button className={reglageEdt ? 'bouton discret actif' : 'bouton discret'} onClick={() => setReglageEdt(!reglageEdt)} aria-expanded={reglageEdt}>
            Emploi du temps
          </button>
        )}
      </div>
      {reglageEdt && donnees.agendaLien && panneauAgenda(false)}
      {reglage && (
        <TempsDisponible
          key={JSON.stringify(donnees.disponibilites)}
          avecEmploiDuTemps={donnees.agendaLien !== null}
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
          <li>Une page = un tableau de l’artefact. Sa durée vient de sa taille, multipliée par TA vitesse ; le calendrier te dit « pages 1 à 7 » plutôt qu’un chapitre pour une heure.</li>
          <li>Trois temps, et on apprend dès la première fois. « Lire + écrire » (jour 0) : tu lis, puis tu fermes la fiche et tu écris de mémoire ce que tu as retenu, avant de comparer et de te noter. « Apprendre par cœur » (le lendemain) : même exercice, obligatoire (ici ou sur papier). « Réviser » : les retours suivants, de plus en plus espacés. « Relire » revoit une page sans te noter. Le temps annoncé d’une première séance compte ce rappel (30 % de la lecture en plus).</li>
          <li>Avant de comparer à la fiche, dis si tu penses savoir : le bilan mesure l’écart avec ta note (l’illusion de savoir). Une erreur ? Note-la en une ligne : elle revient 6 jours après, jusqu’à ce que tu dises « je sais », et finit dans la fiche de la veille du partiel.</li>
          <li>Les cartes question/réponse d’une page (bouton « Cartes ») remplacent « redis ce que tu retiens » par de vraies questions. Les points du village viennent aussi de ce que tu apprends (pages apprises, rappels réussis, examens blancs, série de jours), plafonnés par jour.</li>
          <li>Une page lue est revue dès le lendemain, puis après 3, 7, 14, 30 jours : l’écart grandit à chaque révision réussie.</li>
          <li>Une page « mot pour mot » (une formule, un article, un dialogue, des chiffres clés) suit un cycle resserré (1, 2, 4, 7, 14 jours) et reste en apprentissage un retour de plus. Tu la règles page par page (« Mot pour mot ») ou pour tout le cours.</li>
          <li>Ta note ajuste l’écart : « À revoir » ramène à demain, « Difficile » le divise par deux, « Facile » saute un cran. Un score (« 14 sur 20 ») donne la note : 90 % facile, 70 % bien, 50 % difficile.</li>
          <li>Le rappel du jour te fait te tester toi-même : quelques révisions, de cours mélangés, où tu écris de tête avant d’ouvrir la fiche. Un jour chargé en cours, il peut y ajouter une micro-révision de pages fragiles (réussie, elle ne fait pas monter le cran : on ne gagne rien à réviser trop tôt).</li>
          <li>Une page fragile (plusieurs notes basses de suite) passe devant dans tes révisions, jusqu’à ce que deux bons passages de suite la libèrent.</li>
          <li>Un cours avec une « pratique quotidienne » (l’artefact d’erreurs du TOEIC, bientôt celui du TAGE MAGE) n’a pas de séance de calendrier : tu dois y passer un minimum de minutes chaque jour, jusqu’au partiel. Hameau met ce temps de côté dans chaque journée, compte ta série (un jour libre ne la casse pas) et le chrono lancé depuis la carte compte tout seul.</li>
          <li>Un cours sans artefact (ou en plus de ses pages) peut avoir des « séances d’étude libre » : pas de page à lire, du temps mis de côté. Elles sont comptées à rebours depuis le partiel (la veille, J−3, J−6, J−10, J−15…), donc plus rapprochées à l’approche de l’épreuve et fixes d’un jour à l’autre ; une séance qui tombe un jour libre ou trop court recule d’un ou deux jours.</li>
          <li>Les pages neuves se lisent dans l’ordre, jamais dans les 3 derniers jours avant le partiel.</li>
          <li>Entre 14 et 4 jours avant un partiel, un examen blanc est placé le jour le plus libre : refais un sujet ou un TD en conditions, à la durée de l’épreuve (celle de ton emploi du temps), puis donne ton score.</li>
          <li>Ce que tu ne valides pas n’est pas perdu : le calendrier est recalculé depuis où tu en es vraiment. Une révision non faite revient « en retard », une page non apprise se replace.</li>
          <li>Les jours de cours, un bloc de relecture (réglable) passe avant toute lecture neuve : les pages déjà vues des cours dont le partiel est le plus proche, une page n’étant jamais relue deux jours de suite.</li>
          <li>Dans les 4 derniers jours, chaque chapitre a un dernier passage, sans rien de nouveau.</li>
          <li>Si ton temps disponible ne suffit pas, Hameau le dit et chiffre ce qui manque.</li>
          <li>Avec ton emploi du temps : à partir de {SEUIL_COURS / 60} h de cours dans la journée, je retire de plus en plus de temps de révision (réglable), et un cours qui n’a pas commencé n’est mis au calendrier que le mois qui précède son premier cours.</li>
        </ol>
        <p className="aide">Le calendrier n’est pas enregistré : il se recalcule à chaque fois depuis où tu en es vraiment.</p>
      </details>
    </div>
  );
}

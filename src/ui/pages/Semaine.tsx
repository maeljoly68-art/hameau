// Le plan de la semaine : ce qu'il y a à faire chaque jour, page par page (« lire les pages 1 à 7, apprendre les pages
// 1 à 3 »), de quoi s'avancer sur les jours à venir, et de quoi déclarer qu'on est allé plus loin que prévu.
// Rien n'est stocké : tout se relit du calendrier et du journal, donc tout se recalcule après chaque geste.
import { useMemo, useState, type CSSProperties } from 'react';
import { cartesParPage } from '../../core/cartes.ts';
import { vitesseValide, type DonneesCours } from '../../core/cours.ts';
import { jourCourt } from '../../core/jours.ts';
import { LIBELLE_ETAPE, arrondi5, libellePages, sansCoupure, type Bloc } from '../../core/pages.ts';
import type { SortePassage } from '../../core/passages.ts';
import type { Plan } from '../../core/planning.ts';
import type { SeanceLibre } from '../../core/revisionLibre.ts';
import { debutDeSemaine, libelleDeclaration, libelleSemaine, minutesDAvance, objectifsDeSemaine, pagesAjoutables, pagesEntre, pagesPasEncoreDues, peutFaireDAvance, semaine, type JourSemaine, type LigneFaite } from '../../core/semaine.ts';
import { ajouterJours } from '../../core/jours.ts';
import { formatDuree } from '../../core/temps.ts';
import { validerLecture } from '../../data/cours.ts';
import { IconeChevron, IconeCoche } from '../Icones.tsx';
import { ValiderBloc } from './Blocs.tsx';
import type { Faire } from './CoursDetail.tsx';
import type { LancerChapitre } from './Cours.tsx';

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;
const LIBELLE_FAIT: Record<SortePassage, string> = { lecture: 'Lu', revision: 'Révisé', rappel: 'Rappel', relecture: 'Relu', examen: 'Examen blanc' };
const enMinuscules = (pages: readonly number[]) => libellePages(pages).toLowerCase();

interface Props {
  plan: Plan;
  donnees: DonneesCours;
  libres: readonly SeanceLibre[];
  aujourdhui: string;
  /** Minutes de cours de chaque jour (emploi du temps), quand il est branché. */
  charge: ReadonlyMap<string, number> | undefined;
  userId: string;
  faire: Faire;
  surLancer: (l: LancerChapitre) => void;
}

export function Semaine({ plan, donnees, libres, aujourdhui, charge, userId, faire, surLancer }: Props) {
  const [lundi, setLundi] = useState(() => debutDeSemaine(aujourdhui));
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  const jours = useMemo(() => semaine({ lundi, aujourdhui, plan, chapitres: donnees.chapitres, cours: donnees.cours, passages: donnees.passages, libres }), [lundi, aujourdhui, plan, donnees.chapitres, donnees.cours, donnees.passages, libres]);
  const objectifs = useMemo(() => objectifsDeSemaine(jours), [jours]);
  const cartesDe = useMemo(() => cartesParPage(donnees.cartes), [donnees.cartes]);
  const cetteSemaine = debutDeSemaine(aujourdhui);
  const passee = lundi < cetteSemaine;
  const nomDuCours = (id: string) => donnees.cours.find((c) => c.id === id)?.titre ?? '';
  const couleurDuCours = (id: string) => donnees.cours.find((c) => c.id === id)?.couleur ?? '#888888';
  const peutAjouter = donnees.cours.some((c) => !c.enPause && pagesAjoutables(c.id, donnees.chapitres).length > 0);

  const ligneBloc = (b: Bloc, j: JourSemaine) => {
    const c = donnees.cours.find((x) => x.id === b.coursId);
    if (!c) return null;
    // Les pages font partie de la clé : une séance validée laisse place à une autre, qui ne doit pas s'ouvrir toute seule.
    const cle = `${j.jour}|${b.coursId}|${b.etape}|${b.chapitreIds.join(',')}`;
    const titres = b.chapitreIds.map((id) => donnees.chapitres.find((x) => x.id === id)?.titre ?? '');
    const seule = b.chapitreIds.length === 1;
    const aujourdhuiMeme = j.quand === 'aujourdhui';
    // Un autre jour : on ne peut le faire maintenant que si les pages sont dans l'état que la séance suppose.
    const faisable = aujourdhuiMeme ? ({ ok: true } as const) : peutFaireDAvance(b, donnees.chapitres);
    const anticipes = new Set(pagesPasEncoreDues(b, donnees.chapitres, aujourdhui));
    const nom = seule ? titres[0] : libellePages(b.pages);
    const chrono = faisable.ok && (aujourdhuiMeme || b.etape === 'lire');
    return (
      <li key={cle} style={teinte(c.couleur)}>
        <div className="seance-corps">
          <span className="seance-cours">{c.titre}</span>
          <strong>
            {LIBELLE_ETAPE[b.etape]} · {seule ? `page ${b.pages[0]}` : enMinuscules(b.pages)}
          </strong>
          <span className="aide">
            {sansCoupure(`≈ ${formatDuree(arrondi5(b.minutes))} · `)}
            <span className={b.retard > 0 ? 'en-retard' : undefined}>{sansCoupure(b.raison)}</span>
            {b.fragile && <span className="badge-fragile">Page fragile</span>}
          </span>
          {seule && <span className="aide petite pages-titres">{titres[0]}</span>}
        </div>
        <div className="seance-actions">
          {faisable.ok ? (
            <>
              <button type="button" className={ouvert === cle ? 'bouton petit' : 'bouton petit discret'} aria-expanded={ouvert === cle} onClick={() => setOuvert(ouvert === cle ? null : cle)}>
                {aujourdhuiMeme ? 'Valider' : 'Le faire maintenant'}
              </button>
              {chrono && (
                <button type="button" className="lien" onClick={() => surLancer({ coursId: c.id, titreCours: c.titre, titre: nom, chapitreIds: b.chapitreIds, termines: b.termines, type: b.type, etape: b.etape, parCoeur: b.parCoeur, minutes: b.minutes })}>
                  Lancer le chrono
                </button>
              )}
            </>
          ) : (
            <span className="aide petite">{faisable.raison}</span>
          )}
        </div>
        {ouvert === cle && faisable.ok && (
          <div className="sem-valider">
            {!aujourdhuiMeme && (
              <p className="aide petite">
                {b.etape === 'lire'
                  ? 'Fait d’avance : ces pages comptent comme lues aujourd’hui, et la suite du calendrier avance d’autant.'
                  : anticipes.size > 0
                    ? 'Fait d’avance : une page réussie avant son échéance compte comme un rappel en plus, le calendrier la garde à sa date.'
                    : 'Fait d’avance : le calendrier est recalculé.'}
              </p>
            )}
            <ValiderBloc bloc={b} aujourdhui={aujourdhui} userId={userId} faire={faire} anticipes={anticipes} pages={b.chapitreIds.map((id, i) => ({ id, titre: titres[i], cartes: cartesDe.get(id) ?? [] }))} lien={(seule ? donnees.chapitres.find((x) => x.id === b.chapitreIds[0])?.lien : null) ?? c.lien} />
          </div>
        )}
      </li>
    );
  };

  const ligneFaite = (f: LigneFaite) => (
    <li key={`${f.coursId}-${f.sorte}`} style={teinte(couleurDuCours(f.coursId))}>
      <span className="sem-coche" aria-hidden>
        <IconeCoche taille={12} />
      </span>
      <span>
        <strong>{nomDuCours(f.coursId)}</strong> · {LIBELLE_FAIT[f.sorte]} {enMinuscules(f.pages)}
        {f.minutes !== null && f.minutes > 0 ? ` · ${formatDuree(f.minutes)}` : ''}
      </span>
    </li>
  );

  const bilanVide = objectifs.length === 0;
  return (
    <section className="carte semaine-plan" aria-label="Plan de la semaine">
      <div className="entete">
        <h2>Ma semaine</h2>
        <div className="ag-nav">
          <button className="bouton petit discret" onClick={() => setLundi(ajouterJours(lundi, -7))} aria-label="Semaine précédente">
            <IconeChevron sens="gauche" />
          </button>
          <span className="ag-mois">{libelleSemaine(lundi)}</span>
          <button className="bouton petit discret" onClick={() => setLundi(ajouterJours(lundi, 7))} aria-label="Semaine suivante">
            <IconeChevron />
          </button>
        </div>
      </div>
      {lundi !== cetteSemaine && (
        <button className="lien" onClick={() => setLundi(cetteSemaine)}>
          Revenir à cette semaine
        </button>
      )}

      {!passee && (
        <div className="sem-bilan">
          <h3 className="sous-titre">{lundi === cetteSemaine ? 'Ce qu’il reste à faire cette semaine' : 'Au programme'}</h3>
          {bilanVide ? (
            <p className="aide">Rien de prévu sur cette semaine.</p>
          ) : (
            <ul className="sem-objectifs">
              {objectifs.map((o) => (
                <li key={o.coursId} style={teinte(couleurDuCours(o.coursId))}>
                  <div className="sem-objectif-tete">
                    <span className="seance-cours">{nomDuCours(o.coursId)}</span>
                    <span className="aide petite">≈ {formatDuree(arrondi5(o.minutes))}</span>
                  </div>
                  <ul>
                    {o.lignes.map((l) => (
                      <li key={l.etape}>
                        <strong>{LIBELLE_ETAPE[l.etape]}</strong> · {enMinuscules(l.pages)} <span className="aide petite">≈ {formatDuree(arrondi5(l.minutes))}</span>
                      </li>
                    ))}
                    {o.libre.seances > 0 && (
                      <li>
                        <strong>Étude libre</strong> · {o.libre.seances} séance{o.libre.seances > 1 ? 's' : ''} <span className="aide petite">≈ {formatDuree(arrondi5(o.libre.minutes))}</span>
                      </li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!passee && (
        <div className="sem-avance">
          {!ajout ? (
            <button className="bouton petit discret" onClick={() => setAjout(true)} disabled={!peutAjouter} title={peutAjouter ? undefined : 'Toutes les pages de tes cours sont déjà lues.'}>
              + J’ai avancé plus loin
            </button>
          ) : (
            <AjoutLibre donnees={donnees} aujourdhui={aujourdhui} faire={faire} fermer={() => setAjout(false)} />
          )}
          <p className="aide petite">Tu as du temps ? « Le faire maintenant » sur un jour à venir avance ton calendrier ; ou déclare les pages que tu as lues en plus.</p>
        </div>
      )}

      {passee && donnees.journal && jours.every((j) => j.faits.length === 0) && <p className="aide">Rien n’a été noté cette semaine-là.</p>}

      <ol className="sem-jours">
        {jours.map((j) => {
          const vide = j.faits.length === 0 && j.blocs.length === 0 && j.libres.length === 0 && j.partiels.length === 0;
          const classes = ['sem-jour', j.quand, j.quand === 'passe' && vide && 'replie'].filter(Boolean).join(' ');
          const cours = charge?.get(j.jour) ?? 0;
          return (
            <li key={j.jour} className={classes}>
              <div className="sem-jour-tete">
                <h3>
                  {jourCourt(j.jour)}
                  {j.quand === 'aujourdhui' && <span className="sem-badge">aujourd’hui</span>}
                </h3>
                <span className="aide petite">
                  {cours > 0 ? `${formatDuree(cours)} de cours` : ''}
                  {cours > 0 && j.minutes > 0 ? ' · ' : ''}
                  {j.minutes > 0 ? `≈ ${formatDuree(arrondi5(j.minutes))} à faire` : ''}
                </span>
              </div>
              {j.partiels.map((id) => (
                <p key={id} className="ag-partiel" style={teinte(couleurDuCours(id))}>
                  ★ Partiel : <strong>{nomDuCours(id)}</strong>
                </p>
              ))}
              {j.faits.length > 0 && <ul className="sem-faits">{j.faits.map(ligneFaite)}</ul>}
              {j.blocs.length > 0 && <ul className="seances compactes">{j.blocs.map((b) => ligneBloc(b, j))}</ul>}
              {j.libres.length > 0 && (
                <ul className="seances compactes">
                  {j.libres.map((l) => (
                    <li key={`libre-${l.coursId}`} style={teinte(couleurDuCours(l.coursId))}>
                      <div className="seance-corps">
                        <span className="seance-cours">{nomDuCours(l.coursId)}</span>
                        <strong>Étude libre</strong>
                        <span className="aide">≈ {formatDuree(arrondi5(l.minutes))} · relis ton cours, refais des exercices</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {vide && j.quand !== 'passe' && <p className="aide petite">{j.quand === 'aujourdhui' ? 'Rien d’autre à faire aujourd’hui.' : 'Rien de prévu.'}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * « Je suis allé plus loin que prévu » : des pages jamais lues, de tel numéro à tel numéro, deviennent lues aujourd'hui.
 * Le calendrier se recalcule : elles ne sont plus à lire, elles reviennent dès demain pour être apprises, et les
 * semaines suivantes s'allègent d'autant.
 */
function AjoutLibre({ donnees, aujourdhui, faire, fermer }: { donnees: DonneesCours; aujourdhui: string; faire: Faire; fermer: () => void }) {
  const candidats = donnees.cours.filter((c) => !c.enPause && pagesAjoutables(c.id, donnees.chapitres).length > 0);
  const [choixCours, setChoixCours] = useState<string | null>(null);
  const [choixDe, setChoixDe] = useState<number | null>(null);
  const [choixA, setChoixA] = useState<number | null>(null);
  // Un choix qui n'existe plus (la page vient d'être lue, le cours a disparu) retombe sur le premier possible.
  const coursId = candidats.some((c) => c.id === choixCours) ? (choixCours as string) : (candidats[0]?.id ?? '');
  const ajoutables = pagesAjoutables(coursId, donnees.chapitres);
  const de = ajoutables.some((p) => p.page === choixDe) ? (choixDe as number) : (ajoutables[0]?.page ?? 0);
  const apres = ajoutables.filter((p) => p.page >= de);
  const a = apres.some((p) => p.page === choixA) ? (choixA as number) : de;
  const choisies = pagesEntre(ajoutables, de, a);
  const minutes = minutesDAvance(choisies, vitesseValide(donnees.disponibilites.vitesse));
  if (candidats.length === 0) return <p className="aide">Toutes les pages de tes cours sont déjà lues.</p>;
  const titreCourt = (t: string) => (t.length > 38 ? `${t.slice(0, 37)}…` : t);
  return (
    <div className="sem-ajout">
      <label>
        Cours
        <select value={coursId} onChange={(e) => { setChoixCours(e.target.value); setChoixDe(null); setChoixA(null); }}>
          {candidats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.titre}
            </option>
          ))}
        </select>
      </label>
      <div className="sem-plage">
        <label>
          De la page
          <select value={de} onChange={(e) => { setChoixDe(Number(e.target.value)); setChoixA(null); }}>
            {ajoutables.map((p) => (
              <option key={p.id} value={p.page}>
                {p.page} · {titreCourt(p.titre)}
              </option>
            ))}
          </select>
        </label>
        <label>
          à la page
          <select value={a} onChange={(e) => setChoixA(Number(e.target.value))}>
            {apres.map((p) => (
              <option key={p.id} value={p.page}>
                {p.page} · {titreCourt(p.titre)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="aide">
        {libelleDeclaration(choisies)} · lue{choisies.length > 1 ? 's' : ''} aujourd’hui · ≈ {formatDuree(arrondi5(minutes))} d’avance
      </p>
      <div className="actions gauche">
        <button
          className="bouton"
          disabled={choisies.length === 0}
          onClick={() => {
            const ids = choisies.map((p) => p.id);
            faire(() => validerLecture(ids, aujourdhui), `${libelleDeclaration(choisies)} ajoutée${choisies.length > 1 ? 's' : ''} : le calendrier est recalculé, ≈ ${formatDuree(arrondi5(minutes))} d’avance.`);
            fermer();
          }}
        >
          Ajouter à ce que j’ai lu
        </button>
        <button className="bouton discret" onClick={fermer}>
          Annuler
        </button>
      </div>
      <p className="aide petite">Ces pages reviennent dès demain pour être apprises par cœur, comme toute page lue aujourd’hui.</p>
    </div>
  );
}

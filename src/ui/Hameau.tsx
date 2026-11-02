import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pointsSession } from '../core/points.ts';
import { premiersPas } from '../core/premiersPas.ts';
import { saisonPour } from '../core/saison.ts';
import { clore, dureeSession, ecouleEffectif, enPause } from '../core/session.ts';
import { minutesAujourdhui, serie } from '../core/stats.ts';
import { nouveauxSucces, succes as calculerSucces } from '../core/succes.ts';
import { cleJour, formatChrono, formatDuree } from '../core/temps.ts';
import type { Construction, Session } from '../core/types.ts';
import { batiment, refusConstruction, tailleTerrain, type Batiment } from '../core/village.ts';
import type { Depot } from '../data/depot.ts';
import { useAlerteObjectif } from './alertes.ts';
import { Boutique } from './Boutique.tsx';
import { Anneau, CATEGORIES_PROPOSEES, Chrono, ecrirePreference, etatChrono, lirePreference } from './Chrono.tsx';
import { DialogueFin } from './DialogueFin.tsx';
import { IconeCoche, IconeEtincelle, IconeFenetre, IconeFlamme, IconeHistorique, IconeMarteau, IconeReglages, IconeStats, IconeVillage } from './Icones.tsx';
import { miniChronoDisponible, useMiniChrono } from './MiniChrono.tsx';
import { ModeFocus } from './ModeFocus.tsx';
import { useHameau, useMaintenant } from './useHameau.ts';
import { CadreVillage, phasePour } from './Village.tsx';

// Les onglets secondaires ne sont chargés qu'à la première visite : l'écran
// d'ouverture n'a besoin que du village et du chrono.
const chargerHistorique = () => import('./pages/Historique.tsx');
const chargerStatistiques = () => import('./pages/Statistiques.tsx');
const chargerReglages = () => import('./pages/Reglages.tsx');
const Historique = lazy(chargerHistorique);
const Statistiques = lazy(chargerStatistiques);
const Reglages = lazy(chargerReglages);

type Onglet = 'village' | 'historique' | 'stats' | 'reglages';

const ONGLETS: { id: Onglet; nom: string; Icone: () => React.ReactElement }[] = [
  { id: 'village', nom: 'Village', Icone: IconeVillage },
  { id: 'historique', nom: 'Historique', Icone: IconeHistorique },
  { id: 'stats', nom: 'Stats', Icone: IconeStats },
  { id: 'reglages', nom: 'Réglages', Icone: IconeReglages },
];

interface Toast {
  id: number;
  texte: string;
  type?: 'succes';
  action?: { libelle: string; faire: () => void };
}

/** L'app tourne-t-elle installée (écran d'accueil, fenêtre d'app) sur cet appareil ? */
function estInstallee(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** Le chrono dans le titre : visible dans l'onglet et la barre des tâches. Isolé pour ne rafraîchir que lui. */
function TitreDocument({ session }: { session: Session | null }) {
  const maintenant = useMaintenant(session && !enPause(session) ? 1000 : 30_000);
  useEffect(() => {
    if (!session) document.title = 'Hameau';
    else document.title = `${enPause(session) ? '⏸ ' : ''}${formatChrono(ecouleEffectif(session, maintenant) * 60_000)} · Hameau`;
  }, [session, maintenant]);
  return null;
}

function MiniContenu({ session, surLancer, surTerminer, surPause, surReprendre }: { session: Session | null; surLancer: () => void; surTerminer: () => void; surPause: () => void; surReprendre: () => void }) {
  const maintenant = useMaintenant(1000);
  const e = session ? etatChrono(session, maintenant) : null;
  return (
    <div className={session ? `mini-chrono actif${e?.enPause ? ' en-pause' : ''}` : 'mini-chrono'}>
      <div className="mini-temps">{e ? formatChrono(e.ecouleMs) : '0:00'}</div>
      <div className="mini-legende">{e ? e.legende : 'Pas de session'}</div>
      <div className="mini-barre">
        <span style={{ width: `${(e?.ratio ?? 0) * 100}%` }} className={e?.atteint ? 'atteint' : undefined} />
      </div>
      {session ? (
        <div className="actions centre">
          {e?.enPause ? (
            <button key="reprendre" className="bouton petit demarrer" onClick={surReprendre}>
              Reprendre
            </button>
          ) : (
            <button key="pause" className="bouton petit discret" onClick={surPause}>
              Pause
            </button>
          )}
          <button className="bouton petit arreter" onClick={surTerminer}>
            Terminer
          </button>
        </div>
      ) : (
        <button className="bouton petit demarrer" onClick={surLancer}>
          Lancer
        </button>
      )}
    </div>
  );
}

function PremiersPas({ etapes, surMasquer }: { etapes: ReturnType<typeof premiersPas>; surMasquer: () => void }) {
  const faites = etapes.filter((e) => e.fait).length;
  const prochaine = etapes.find((e) => !e.fait);
  return (
    <section className="carte premiers-pas">
      <div className="entete">
        <h2>Premiers pas</h2>
        <span className="pastille">
          {faites} / {etapes.length}
        </span>
      </div>
      <ul>
        {etapes.map((e) => (
          <li key={e.id} className={e.fait ? 'fait' : e === prochaine ? 'prochaine' : undefined}>
            <span className="coche" aria-hidden>
              {e.fait && <IconeCoche taille={14} />}
            </span>
            <span>
              <strong>{e.titre}</strong>
              {e === prochaine && <span className="aide">{e.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      <button className="lien" onClick={surMasquer}>
        Masquer
      </button>
    </section>
  );
}

export function Hameau({ depot, email, surDeconnexion }: { depot: Depot; email: string | null; surDeconnexion: () => void }) {
  const { donnees, frais, derive, erreur, setErreur, agir } = useHameau(depot);
  // Une demi-minute suffit pour l'heure du ciel et le total du jour : le
  // chrono, lui, a sa propre horloge à la seconde.
  const maintenant = useMaintenant(30_000);
  const [onglet, setOnglet] = useState<Onglet>('village');
  const [finEnCours, setFinEnCours] = useState(false);
  const [focus, setFocus] = useState(false);
  const [aConstruire, setAConstruire] = useState<Batiment | null>(null);
  const [boutique, setBoutique] = useState(false);
  const [selection, setSelection] = useState<Construction | null>(null);
  const [recent, setRecent] = useState<string | null>(null);
  const [fete, setFete] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pasMasques, setPasMasques] = useState(() => lirePreference('hameau.premiers-pas-masques', false));
  const [installee] = useState(estInstallee);
  const mini = useMiniChrono();

  const enCours = derive?.enCours ?? null;
  const profil = donnees?.profil;

  const toast = useCallback((texte: string, options: { type?: 'succes'; action?: Toast['action']; duree?: number | null } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, texte, type: options.type, action: options.action }]);
    // Un toast d'annulation reste plus longtemps : le temps de lire ET d'agir.
    const duree = options.duree === undefined ? (options.action ? 7000 : 4500) : options.duree;
    if (duree !== null) window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duree);
  }, []);
  const fermerToast = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const alerteObjectif = useCallback((m: string) => toast(m, { type: 'succes' }), [toast]);
  useAlerteObjectif(enCours, alerteObjectif);

  // Nouvelle version publiée pendant que l'app est ouverte (un iPad laissé en
  // mode focus des heures) : on le dit, sans recharger de force en pleine session.
  useEffect(() => {
    const surMaj = () => toast('Une nouvelle version de Hameau est disponible.', { action: { libelle: 'Recharger', faire: () => location.reload() }, duree: null });
    window.addEventListener('hameau:mise-a-jour', surMaj);
    return () => window.removeEventListener('hameau:mise-a-jour', surMaj);
  }, [toast]);

  // Les onglets secondaires sont téléchargés quand le navigateur n'a rien
  // d'autre à faire : pas au démarrage, mais avant qu'on les ouvre.
  useEffect(() => {
    const precharger = () => {
      void chargerHistorique();
      void chargerStatistiques();
      void chargerReglages();
    };
    const w = window as unknown as { requestIdleCallback?: (f: () => void, o: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(precharger, { timeout: 6000 });
    else window.setTimeout(precharger, 3000);
  }, []);

  const listeSucces = useMemo(
    () => (donnees ? calculerSucces(donnees.sessions, donnees.constructions, donnees.profil.objectifJour) : null),
    [donnees],
  );

  // Fête le niveau et les succès gagnés, une fois, sans rejouer au chargement.
  const vu = useRef<{ niveau: number; succes: NonNullable<typeof listeSucces> } | null>(null);
  useEffect(() => {
    if (!derive || !listeSucces || !frais) return;
    const avant = vu.current;
    vu.current = { niveau: derive.niveau.niveau, succes: listeSucces };
    if (!avant) return;
    if (derive.niveau.niveau > avant.niveau) {
      toast(`Niveau ${derive.niveau.niveau} ! Le hameau s’agrandit.`, { type: 'succes' });
      setFete(true);
      window.setTimeout(() => setFete(false), 5000);
    }
    for (const s of nouveauxSucces(avant.succes, listeSucces)) toast(`Succès : ${s.nom}`, { type: 'succes' });
  }, [derive, listeSucces, frais, toast]);

  const categories = useMemo(() => {
    const vues = new Set(CATEGORIES_PROPOSEES);
    for (const s of donnees?.sessions ?? []) if (s.categorie.trim()) vues.add(s.categorie.trim());
    return [...vues].slice(0, 12);
  }, [donnees]);

  const posables = useMemo(() => {
    if (!aConstruire || !derive || !donnees) return undefined;
    const t = tailleTerrain(derive.niveau.niveau);
    const s = new Set<string>();
    for (let y = 0; y < t; y++)
      for (let x = 0; x < t; x++)
        if (refusConstruction(aConstruire.id, x, y, { niveau: derive.niveau.niveau, solde: derive.solde, constructions: donnees.constructions }) === null) s.add(`${x},${y}`);
    return s;
  }, [aConstruire, derive, donnees]);

  const demarrer = useCallback((categorie: string, objectif: number | null) => void agir(() => depot.demarrer(categorie, objectif)), [agir, depot]);
  const demarrerRapide = useCallback(() => demarrer(lirePreference('hameau.categorie', ''), lirePreference<number | null>('hameau.objectif', 50)), [demarrer]);
  const pause = useCallback(() => enCours && void agir(() => depot.pause(enCours.id)), [agir, depot, enCours]);
  const reprise = useCallback(() => enCours && void agir(() => depot.reprendre(enCours.id)), [agir, depot, enCours]);

  const poser = useCallback(
    (x: number, y: number) => {
      if (!aConstruire) return;
      const b = aConstruire;
      setAConstruire(null);
      setBoutique(false);
      void agir(() => depot.construire({ batiment: b.id, x, y, cout: b.cout })).then(() => {
        toast(`${b.nom} construit !`);
        // L'animation « pousse » vise le bâtiment le plus récent sur cette case.
        setRecent(`${x},${y}`);
      });
    },
    [aConstruire, agir, depot, toast],
  );

  // Supprimer et démolir s'annulent pendant quelques secondes, plutôt que de
  // demander confirmation : une confirmation se valide par réflexe, une
  // annulation rattrape vraiment l'erreur.
  const supprimerSession = useCallback(
    (id: string) => {
      const s = donnees?.sessions.find((x) => x.id === id);
      if (!s) return;
      const copie: Omit<Session, 'id'> = { debut: s.debut, fin: s.fin, description: s.description, categorie: s.categorie, appareil: s.appareil, objectif: s.objectif, pauseSecondes: s.pauseSecondes, pauseDepuis: null };
      void agir(() => depot.supprimerSession(id)).then(() =>
        toast('Session supprimée.', { action: { libelle: 'Annuler', faire: () => void agir(() => depot.ajouterSession(copie)) } }),
      );
    },
    [agir, depot, donnees, toast],
  );
  const demolir = useCallback(
    (c: Construction) => {
      const nom = batiment(c.batiment)?.nom ?? c.batiment;
      void agir(() => depot.demolir(c.id)).then(() =>
        toast(`${nom} démoli (+${c.cout}).`, { action: { libelle: 'Annuler', faire: () => void agir(() => depot.construire({ batiment: c.batiment, x: c.x, y: c.y, cout: c.cout })) } }),
      );
    },
    [agir, depot, toast],
  );

  // Raccourcis clavier sur ordinateur. Jamais pendant une saisie : taper une
  // espace dans la description ne doit pas lancer une session.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(cible.tagName))) return;
      if (finEnCours || selection || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (enCours) setFinEnCours(true);
        else if (profil) demarrerRapide();
      } else if (e.key === 'f' && enCours) setFocus((f) => !f);
      else if (e.key === 'p' && enCours) {
        if (enPause(enCours)) reprise();
        else pause();
      } else if (e.key === 'Escape') {
        setAConstruire(null);
        setBoutique(false);
      }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [enCours, finEnCours, selection, profil, demarrerRapide, pause, reprise]);

  if (!donnees || !derive || !profil || !listeSucces) {
    return <div className="chargement">{erreur ? `Erreur : ${erreur}` : 'Chargement du hameau…'}</div>;
  }

  const { niveau, solde } = derive;
  const m = new Date(maintenant);
  const phase = phasePour(m.getHours());
  const saison = saisonPour(m);
  const jours = serie(donnees.sessions, m);
  // Le total du jour compte aussi la session en cours (pauses déduites), à la demi-minute près.
  const enCoursAujourdhui = enCours && cleJour(new Date(enCours.debut)) === cleJour(m) ? ecouleEffectif(enCours, maintenant) : 0;
  const aujourdhui = minutesAujourdhui(donnees.sessions, m) + enCoursAujourdhui;
  const prochain = listeSucces.filter((s) => !s.obtenu).sort((a, b) => b.actuel / b.cible - a.actuel / a.cible)[0];
  const recentId = recent ? (donnees.constructions.find((c) => `${c.x},${c.y}` === recent)?.id ?? null) : null;
  const etapes = premiersPas(donnees, { installee, synchronise: depot.synchronise });
  const montrerPas = !pasMasques && etapes.some((e) => !e.fait);
  const actionsSession = { surArreter: () => setFinEnCours(true), surPause: pause, surReprendre: reprise, surFocus: () => setFocus(true) };

  return (
    <div className={`app${focus ? ' app-focus' : ''}`}>
      <TitreDocument session={enCours} />

      <nav className="navigation" aria-label="Sections">
        <div className="marque">
          <span className="marque-logo" aria-hidden>
            <IconeFlamme taille={18} />
          </span>
          <span className="marque-nom">Hameau</span>
        </div>
        {ONGLETS.map(({ id, nom, Icone }) => (
          <button key={id} className={onglet === id ? 'onglet actif' : 'onglet'} onClick={() => setOnglet(id)} aria-current={onglet === id ? 'page' : undefined}>
            <Icone />
            <span>{nom}</span>
          </button>
        ))}
      </nav>

      <div className="colonne">
        <header className="barre-haut">
          <div className="titre-hameau">
            <h1>{profil.nomHameau}</h1>
            <div className="niveau">
              <span className="niveau-num">Niv. {niveau.niveau}</span>
              <span className="progression" title={`${niveau.dansNiveau} / ${niveau.tailleNiveau} points avant le niveau ${niveau.niveau + 1}`}>
                <span style={{ width: `${(niveau.dansNiveau / niveau.tailleNiveau) * 100}%` }} />
              </span>
            </div>
          </div>
          <div className="compteurs">
            <span className="compteur" title="Points à dépenser">
              <IconeEtincelle /> {solde}
            </span>
            <span className={jours > 0 ? 'compteur serie-vive' : 'compteur'} title="Jours d’affilée avec au moins 25 min">
              <IconeFlamme /> {jours}
            </span>
          </div>
        </header>

        {erreur && (
          <button className="alerte" onClick={() => setErreur(null)}>
            {erreur} <small>(toucher pour fermer)</small>
          </button>
        )}

        <main className="contenu">
          {onglet === 'village' && (
            <div className="grille-village">
              <div className="col-scene">
                <CadreVillage
                  niveau={niveau.niveau}
                  constructions={donnees.constructions}
                  actif={enCours !== null && !enPause(enCours)}
                  phase={phase}
                  saison={saison}
                  fete={fete}
                  posables={posables}
                  fantome={aConstruire?.id}
                  recent={recentId}
                  surCase={poser}
                  surConstruction={setSelection}
                  pied={
                    aConstruire ? (
                      <div className="bandeau">
                        <span>
                          Touche une case en surbrillance pour poser : <strong>{aConstruire.nom}</strong>
                        </span>
                        <button className="bouton petit discret" onClick={() => setAConstruire(null)}>
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="village-actions">
                        <button className={boutique ? 'bouton discret actif' : 'bouton discret'} onClick={() => setBoutique(!boutique)} aria-expanded={boutique}>
                          <IconeMarteau /> Construire
                        </button>
                        {miniChronoDisponible() && (
                          <button className="bouton discret" onClick={() => void (mini.ouverte ? mini.fermer() : mini.ouvrir())} title="Petite fenêtre toujours au premier plan">
                            <IconeFenetre /> {mini.ouverte ? 'Fermer le mini-chrono' : 'Mini-chrono'}
                          </button>
                        )}
                      </div>
                    )
                  }
                />
                {boutique && !aConstruire && (
                  <Boutique
                    niveau={niveau.niveau}
                    solde={solde}
                    saison={saison}
                    surChoisir={(b) => {
                      setAConstruire(b);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                )}
              </div>
              <div className="col-panneau">
                <Chrono enCours={enCours} categories={categories} surDemarrer={demarrer} {...actionsSession} />
                {montrerPas && (
                  <PremiersPas
                    etapes={etapes}
                    surMasquer={() => {
                      setPasMasques(true);
                      ecrirePreference('hameau.premiers-pas-masques', true);
                    }}
                  />
                )}
                <section className="carte journee">
                  <Anneau ratio={aujourdhui / profil.objectifJour} taille={84} epaisseur={8} atteint={aujourdhui >= profil.objectifJour}>
                    <span className="journee-pct">{Math.min(999, Math.round((aujourdhui / profil.objectifJour) * 100))}%</span>
                  </Anneau>
                  <div>
                    <h2>Aujourd’hui</h2>
                    <p>
                      <strong>{formatDuree(aujourdhui)}</strong> sur {formatDuree(profil.objectifJour)}
                    </p>
                    <p className="aide">
                      {aujourdhui >= profil.objectifJour
                        ? 'Objectif du jour atteint. Le feu brûlera longtemps ce soir.'
                        : `Encore ${formatDuree(profil.objectifJour - aujourdhui)} pour l’objectif du jour.`}
                    </p>
                  </div>
                </section>
                {prochain && (
                  <button className="carte prochain-succes" onClick={() => setOnglet('stats')}>
                    <span className="sur-titre">Prochain succès</span>
                    <strong>{prochain.nom}</strong>
                    <span className="aide">{prochain.description}</span>
                    <span className="jauge">
                      <span style={{ width: `${(prochain.actuel / prochain.cible) * 100}%` }} />
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
          <Suspense fallback={<div className="carte aide">Chargement…</div>}>
            {onglet === 'historique' && (
              <Historique
                sessions={donnees.sessions}
                categories={categories}
                surModifier={(id, champs) => void agir(() => depot.modifierSession(id, champs))}
                surSupprimer={supprimerSession}
                surAjouter={(s) => void agir(() => depot.ajouterSession(s))}
              />
            )}
            {onglet === 'stats' && <Statistiques sessions={donnees.sessions} succes={listeSucces} objectifJour={profil.objectifJour} maintenant={maintenant} />}
            {onglet === 'reglages' && (
              <Reglages
                email={email}
                synchronise={depot.synchronise}
                donnees={donnees}
                surProfil={(p) => void agir(() => depot.enregistrerProfil(p)).then(() => toast('Réglages enregistrés.'))}
                surDeconnexion={surDeconnexion}
                surImporter={
                  depot.synchronise
                    ? async () => {
                        const { lireLocal } = await import('../data/local.ts');
                        const locales = lireLocal();
                        const closes = locales.sessions.filter((s) => s.fin !== null);
                        if (closes.length + locales.constructions.length === 0) return toast('Rien à importer sur cet appareil.');
                        if (!confirm(`Importer ${closes.length} session(s) et ${locales.constructions.length} construction(s) de cet appareil vers ton compte ?`)) return;
                        await agir(async () => {
                          for (const s of closes)
                            await depot.ajouterSession({ debut: s.debut, fin: s.fin, description: s.description, categorie: s.categorie, appareil: s.appareil, objectif: s.objectif, pauseSecondes: s.pauseSecondes, pauseDepuis: null });
                          // Une case déjà prise dans le compte : on garde celle du compte.
                          for (const c of locales.constructions) await depot.construire(c).catch(() => undefined);
                        });
                        toast('Import terminé.');
                      }
                    : undefined
                }
              />
            )}
          </Suspense>
        </main>
      </div>

      {focus && enCours && (
        <ModeFocus
          session={enCours}
          nomHameau={profil.nomHameau}
          surPause={pause}
          surReprendre={reprise}
          surQuitter={() => setFocus(false)}
          surTerminer={() => {
            setFocus(false);
            setFinEnCours(true);
          }}
        />
      )}

      {finEnCours && enCours && (
        <DialogueFin
          session={enCours}
          sessions={donnees.sessions}
          categories={categories}
          surAnnuler={() => setFinEnCours(false)}
          surValider={(champs) => {
            setFinEnCours(false);
            // Le gain affiché est celui que la base retiendra : pauses déduites.
            const gain = pointsSession(dureeSession(clore(enCours, champs.fin)));
            void agir(() => depot.terminer(enCours.id, champs)).then(() => toast(gain > 0 ? `+${gain} points de concentration` : 'Session enregistrée.'));
          }}
        />
      )}

      {selection && (
        <div className="voile" role="dialog" aria-modal="true" onClick={() => setSelection(null)}>
          <div className="fenetre" onClick={(e) => e.stopPropagation()}>
            <h2>{batiment(selection.batiment)?.nom ?? selection.batiment}</h2>
            <p className="aide">{batiment(selection.batiment)?.description}</p>
            <p>
              Construit le {new Date(selection.construitLe).toLocaleDateString('fr-FR')} pour {selection.cout} points.
            </p>
            <p className="aide">Démolir rend les points dépensés : c’est aussi la façon de déplacer un bâtiment.</p>
            <div className="actions">
              <button
                className="bouton danger"
                onClick={() => {
                  const c = selection;
                  setSelection(null);
                  demolir(c);
                }}
              >
                Démolir (+{selection.cout})
              </button>
              <button className="bouton" onClick={() => setSelection(null)}>
                Garder
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.type === 'succes' ? ' succes' : ''}${t.action ? ' avec-action' : ''}`}>
            {t.type === 'succes' && <IconeEtincelle />} {t.texte}
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.faire();
                  fermerToast(t.id);
                }}
              >
                {t.action.libelle}
              </button>
            )}
          </div>
        ))}
      </div>

      {mini.portail(
        <MiniContenu
          session={enCours}
          surLancer={demarrerRapide}
          surPause={pause}
          surReprendre={reprise}
          surTerminer={() => {
            // La saisie de fin se fait dans la fenêtre principale, plus confortable.
            window.focus();
            setOnglet('village');
            setFinEnCours(true);
          }}
        />,
      )}
    </div>
  );
}

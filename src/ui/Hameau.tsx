import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pointsSession } from '../core/points.ts';
import { minutesAujourdhui, serie } from '../core/stats.ts';
import { nouveauxSucces, succes as calculerSucces } from '../core/succes.ts';
import { cleJour, dureeMinutes, formatChrono, formatDuree } from '../core/temps.ts';
import type { Construction, Session } from '../core/types.ts';
import { batiment, refusConstruction, tailleTerrain, type Batiment } from '../core/village.ts';
import type { Depot } from '../data/depot.ts';
import { useAlerteObjectif } from './alertes.ts';
import { Boutique } from './Boutique.tsx';
import { Anneau, CATEGORIES_PROPOSEES, Chrono, etatChrono, lirePreference } from './Chrono.tsx';
import { DialogueFin } from './DialogueFin.tsx';
import { IconeEtincelle, IconeFenetre, IconeFlamme, IconeHistorique, IconeMarteau, IconeReglages, IconeStats, IconeVillage } from './Icones.tsx';
import { miniChronoDisponible, useMiniChrono } from './MiniChrono.tsx';
import { ModeFocus } from './ModeFocus.tsx';
import { useHameau, useMaintenant } from './useHameau.ts';
import { CadreVillage, phasePour } from './Village.tsx';

// Les onglets secondaires ne sont chargés qu'à la première visite : l'écran
// d'ouverture n'a besoin que du village et du chrono.
const Historique = lazy(() => import('./pages/Historique.tsx'));
const Statistiques = lazy(() => import('./pages/Statistiques.tsx'));
const Reglages = lazy(() => import('./pages/Reglages.tsx'));

type Onglet = 'village' | 'historique' | 'stats' | 'reglages';

const ONGLETS: { id: Onglet; nom: string; Icone: () => React.ReactElement }[] = [
  { id: 'village', nom: 'Village', Icone: IconeVillage },
  { id: 'historique', nom: 'Historique', Icone: IconeHistorique },
  { id: 'stats', nom: 'Stats', Icone: IconeStats },
  { id: 'reglages', nom: 'Réglages', Icone: IconeReglages },
];

/** Le chrono dans le titre : visible dans l'onglet et la barre des tâches. Isolé pour ne rafraîchir que lui. */
function TitreDocument({ session }: { session: Session | null }) {
  const maintenant = useMaintenant(session ? 1000 : 60_000);
  useEffect(() => {
    document.title = session ? `${formatChrono(maintenant - Date.parse(session.debut))} · Hameau` : 'Hameau';
  }, [session, maintenant]);
  return null;
}

function MiniContenu({ session, surLancer, surTerminer }: { session: Session | null; surLancer: () => void; surTerminer: () => void }) {
  const maintenant = useMaintenant(1000);
  const e = session ? etatChrono(session, maintenant) : null;
  return (
    <div className={session ? 'mini-chrono actif' : 'mini-chrono'}>
      <div className="mini-temps">{e ? formatChrono(e.ecouleMs) : '0:00'}</div>
      <div className="mini-legende">{e ? e.legende : 'Pas de session'}</div>
      <div className="mini-barre">
        <span style={{ width: `${(e?.ratio ?? 0) * 100}%` }} className={e?.atteint ? 'atteint' : undefined} />
      </div>
      {session ? (
        <button className="bouton petit arreter" onClick={surTerminer}>
          Terminer
        </button>
      ) : (
        <button className="bouton petit demarrer" onClick={surLancer}>
          Lancer
        </button>
      )}
    </div>
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
  const [toasts, setToasts] = useState<{ id: number; texte: string; type?: 'succes' }[]>([]);
  const mini = useMiniChrono();

  const enCours = derive?.enCours ?? null;
  const profil = donnees?.profil;

  const toast = useCallback((texte: string, type?: 'succes') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, texte, type }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  useAlerteObjectif(enCours, toast);

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
    if (derive.niveau.niveau > avant.niveau) toast(`Niveau ${derive.niveau.niveau} ! Le hameau s’agrandit.`, 'succes');
    for (const s of nouveauxSucces(avant.succes, listeSucces)) toast(`Succès : ${s.nom}`, 'succes');
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
        else if (profil) demarrer(lirePreference('hameau.categorie', ''), lirePreference<number | null>('hameau.objectif', 50));
      } else if (e.key === 'f' && enCours) setFocus((f) => !f);
      else if (e.key === 'Escape') {
        setAConstruire(null);
        setBoutique(false);
      }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [enCours, finEnCours, selection, profil, demarrer]);

  if (!donnees || !derive || !profil || !listeSucces) {
    return <div className="chargement">{erreur ? `Erreur : ${erreur}` : 'Chargement du hameau…'}</div>;
  }

  const { niveau, solde } = derive;
  const m = new Date(maintenant);
  const phase = phasePour(m.getHours());
  const jours = serie(donnees.sessions, m);
  // Le total du jour compte aussi la session en cours, à la demi-minute près.
  const enCoursAujourdhui = enCours && cleJour(new Date(enCours.debut)) === cleJour(m) ? Math.max(0, (maintenant - Date.parse(enCours.debut)) / 60_000) : 0;
  const aujourdhui = minutesAujourdhui(donnees.sessions, m) + enCoursAujourdhui;
  const prochain = listeSucces.filter((s) => !s.obtenu).sort((a, b) => b.actuel / b.cible - a.actuel / a.cible)[0];
  const recentId = recent ? (donnees.constructions.find((c) => `${c.x},${c.y}` === recent)?.id ?? null) : null;

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
                  actif={enCours !== null}
                  phase={phase}
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
                        <button className={boutique ? 'bouton discret actif' : 'bouton discret'} onClick={() => setBoutique(!boutique)}>
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
                    surChoisir={(b) => {
                      setAConstruire(b);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                )}
              </div>
              <div className="col-panneau">
                <Chrono enCours={enCours} categories={categories} surDemarrer={demarrer} surArreter={() => setFinEnCours(true)} surFocus={() => setFocus(true)} />
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
                surSupprimer={(id) => void agir(() => depot.supprimerSession(id))}
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
                          for (const s of closes) await depot.ajouterSession({ debut: s.debut, fin: s.fin, description: s.description, categorie: s.categorie, appareil: s.appareil, objectif: s.objectif });
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
          categories={categories}
          surAnnuler={() => setFinEnCours(false)}
          surValider={(champs) => {
            setFinEnCours(false);
            const gain = pointsSession(dureeMinutes(enCours.debut, champs.fin));
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
                  void agir(() => depot.demolir(c.id));
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
          <div key={t.id} className={t.type === 'succes' ? 'toast succes' : 'toast'}>
            {t.type === 'succes' && <IconeEtincelle />} {t.texte}
          </div>
        ))}
      </div>

      {mini.portail(
        <MiniContenu
          session={enCours}
          surLancer={() => demarrer(lirePreference('hameau.categorie', ''), lirePreference<number | null>('hameau.objectif', 50))}
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

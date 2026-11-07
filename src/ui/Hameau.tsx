import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nouveauxCosmetiques, type Progression } from '../core/apparence.ts';
import { cielPour } from '../core/ciel.ts';
import { pointsSession } from '../core/points.ts';
import { premiersPas } from '../core/premiersPas.ts';
import { saisonPour } from '../core/saison.ts';
import { clore, dureeSession, ecouleEffectif, enPause } from '../core/session.ts';
import { meilleureSerie, minutesAujourdhui, serie } from '../core/stats.ts';
import { nouveauxSucces, succes as calculerSucces } from '../core/succes.ts';
import { cleJour, formatChrono, formatDuree } from '../core/temps.ts';
import type { Construction, Session } from '../core/types.ts';
import { accord, batiment, casesDeplacement, coutAmelioration, habitants, NIVEAU_MAX, niveauRequisAmelioration, refusAmelioration, refusConstruction, tailleTerrain, type Batiment } from '../core/village.ts';
import type { Depot } from '../data/depot.ts';
import { lireLocal } from '../data/local.ts';
import { marquerRelu, noterChapitres, validerExamen, validerLectureEtVitesse } from '../data/cours.ts';
import { etapeDe, type Etape } from '../core/pages.ts';
import type { TypeSeance } from '../core/planning.ts';
import { NOTES, type Note } from '../core/revision.ts';
import { lienSillage, marquerTache, synchroniser, type LienSillage } from '../data/sillage.ts';
import type { TacheSillage } from '../core/sillage.ts';
import { useAlerteObjectif } from './alertes.ts';
import { Boutique } from './Boutique.tsx';
import { Rappels } from './Rappels.tsx';
import { Anneau, CATEGORIES_PROPOSEES, Chrono, ecrirePreference, etatChrono, lirePreference } from './Chrono.tsx';
import { DialogueFin } from './DialogueFin.tsx';
import { FinApprentissage } from './FinApprentissage.tsx';
import { FinExamen } from './FinExamen.tsx';
import { GardeRobe } from './GardeRobe.tsx';
import { IconeAmis, IconeCintre, IconeCours, IconeCoche, IconeEtincelle, IconeEtoile, IconeFenetre, IconeFlamme, IconeHistorique, IconeMarteau, IconeReglages, IconeStats, IconeTaches, IconeVillage } from './Icones.tsx';
import { miniChronoDisponible, useMiniChrono } from './MiniChrono.tsx';
import { ModeFocus } from './ModeFocus.tsx';
import type { LancerChapitre } from './pages/Cours.tsx';
import { ongletDansAdresse, ongletValide, sansOnglet, type Onglet } from '../core/onglets.ts';
import { useHameau, useMaintenant } from './useHameau.ts';
import { usePointsApprentissage } from './usePointsApprentissage.ts';
import { CadreVillage } from './Village.tsx';
import { Dessin, SaisonContexte } from './village/dessins.tsx';

// Les onglets secondaires ne sont chargés qu'à la première visite : l'écran
// d'ouverture n'a besoin que du village et du chrono.
/** La séance de travail en cours qui vient d'un bloc du calendrier (gardée sur l'appareil jusqu'à la fin de la session). */
interface ChapitreEnCours {
  session: string;
  chapitreIds: string[];
  termines: string[];
  titre: string;
  type: TypeSeance;
  /** Absente d'une session lancée avant les étapes : elle se range alors en « réviser ». */
  etape?: Etape;
  parCoeur?: boolean;
  minutes: number;
}
/** Avant les blocs de pages : un seul chapitre, noté à la fin. Une session lancée juste avant la mise à jour doit pouvoir finir. */
interface AncienChapitreEnCours {
  session: string;
  chapitreId: string;
  titre: string;
}
/** Ce que la fenêtre de fin de séance demande de valider. */
interface ATraiter {
  chapitreIds: string[];
  termines: string[];
  titre: string;
  type: TypeSeance;
  etape: Etape;
  /** Au moins une des pages est à savoir mot pour mot. */
  parCoeur: boolean;
  prevues: number;
  /** Minutes réellement passées (pauses déduites), ou null. */
  reelles: number | null;
}
const aTraiter = (c: ChapitreEnCours | AncienChapitreEnCours, reelles: number | null): ATraiter =>
  'chapitreIds' in c
    ? { chapitreIds: c.chapitreIds, termines: c.termines, titre: c.titre, type: c.type, etape: c.etape ?? etapeDe(c.type, 2, false), parCoeur: c.parCoeur === true, prevues: c.minutes, reelles }
    : { chapitreIds: [c.chapitreId], termines: [c.chapitreId], titre: c.titre, type: 'revision', etape: 'reviser', parCoeur: false, prevues: 0, reelles };

const chargerHistorique = () => import('./pages/Historique.tsx');
const chargerStatistiques = () => import('./pages/Statistiques.tsx');
const chargerReglages = () => import('./pages/Reglages.tsx');
const chargerTaches = () => import('./pages/Taches.tsx');
const chargerAmis = () => import('./pages/Amis.tsx');
const chargerOngletCours = () => import('./pages/Cours.tsx');
const Historique = lazy(chargerHistorique);
const Statistiques = lazy(chargerStatistiques);
const Reglages = lazy(chargerReglages);
const Taches = lazy(chargerTaches);
const Amis = lazy(chargerAmis);
const OngletCours = lazy(chargerOngletCours);



const ONGLETS: { id: Onglet; nom: string; Icone: () => React.ReactElement }[] = [
  { id: 'village', nom: 'Village', Icone: IconeVillage },
  { id: 'cours', nom: 'Cours', Icone: IconeCours },
  { id: 'taches', nom: 'Tâches', Icone: IconeTaches },
  { id: 'amis', nom: 'Amis', Icone: IconeAmis },
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

/** La tâche Sillage sur laquelle cette session a été lancée, si c'est le cas sur cet appareil. */
function tacheDe(s: Session): { tacheId: string; titre: string } | null {
  const t = lirePreference<{ session: string; tacheId: string; titre: string } | null>('hameau.tache-en-cours', null);
  return t && t.session === s.id ? t : null;
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

const RAISONS_AMELIORATION = { niveau: 'Le village doit grandir', solde: 'Pas encore assez de points', max: 'Niveau maximal', inconnu: 'Bâtiment inconnu' } as const;

/** Fiche d'un bâtiment : son niveau, ce que change le suivant, et de quoi l'améliorer. */
function FicheBatiment({ construction: c, niveauVillage, solde, saison, surAmeliorer }: { construction: Construction; niveauVillage: number; solde: number; saison: ReturnType<typeof saisonPour>; surAmeliorer: (c: Construction) => void }) {
  const b = batiment(c.batiment);
  const cout = b ? coutAmelioration(b, c.niveau) : null;
  const refus = refusAmelioration(c, { niveau: niveauVillage, solde });
  const gain = habitants(c.batiment, c.niveau + 1) - habitants(c.batiment, c.niveau);
  return (
    <div className="fiche-batiment">
      <div className="entete">
        <h2>{b?.nom ?? c.batiment}</h2>
        <span className="etoiles" aria-label={`Niveau ${c.niveau} sur ${NIVEAU_MAX}`}>
          {Array.from({ length: NIVEAU_MAX }, (_, i) => (
            <IconeEtoile key={i} pleine={i < c.niveau} />
          ))}
        </span>
      </div>
      <p className="aide">{b?.description}</p>
      <SaisonContexte.Provider value={saison}>
        <div className="evolution">
          <svg viewBox="-40 -92 80 102" aria-hidden>
            <ellipse cx={0} cy={4} rx={30} ry={11} fill="rgba(0,0,0,.18)" />
            <Dessin id={c.batiment} actif={false} niveau={c.niveau} />
          </svg>
          {b && cout !== null && (
            <>
              <span className="fleche" aria-hidden>→</span>
              <svg viewBox="-40 -92 80 102" aria-hidden>
                <ellipse cx={0} cy={4} rx={30} ry={11} fill="rgba(0,0,0,.18)" />
                <Dessin id={c.batiment} actif={false} niveau={c.niveau + 1} />
              </svg>
            </>
          )}
        </div>
      </SaisonContexte.Provider>
      {b && cout !== null ? (
        <div className="amelioration">
          <p>
            <strong>Niveau {c.niveau + 1} :</strong> {b.ameliorations[c.niveau - 1]}
            {gain > 0 && ` · +${gain} habitant`}.
          </p>
          <button className="bouton" disabled={refus !== null} onClick={() => surAmeliorer(c)}>
            Améliorer · <IconeEtincelle taille={13} /> {cout}
          </button>
          {refus === 'niveau' && <p className="aide petite">Possible au niveau {niveauRequisAmelioration(b, c.niveau + 1)} du village.</p>}
        </div>
      ) : (
        <p className="aide">{RAISONS_AMELIORATION.max} : ce bâtiment ne peut plus grandir.</p>
      )}
    </div>
  );
}

export function Hameau({ depot, email, surDeconnexion }: { depot: Depot; email: string | null; surDeconnexion: () => void }) {
  const pointsEnApprenant = usePointsApprentissage(depot.synchronise ? depot.userId : null);
  const { donnees, frais, derive, erreur, setErreur, agir } = useHameau(depot, pointsEnApprenant);
  // Une demi-minute suffit pour l'heure du ciel et le total du jour : le
  // chrono, lui, a sa propre horloge à la seconde.
  const maintenant = useMaintenant(30_000);
  // Une invitation reçue par lien ouvre directement l'onglet Amis.
  const [invitation, setInvitation] = useState<string | null>(() => lirePreference<string | null>('hameau.invitation', null));
  // Une invitation ouvre Amis ; un clic sur le rappel du jour ouvre l'onglet qu'il annonce (« ?onglet=cours »).
  const [onglet, setOnglet] = useState<Onglet>(() => (invitation && depot.synchronise ? 'amis' : (ongletDansAdresse(window.location.search) ?? 'village')));
  useEffect(() => {
    // L'onglet demandé est ouvert : on l'enlève de l'adresse pour qu'un rechargement ne ramène pas toujours là.
    if (ongletDansAdresse(window.location.search)) window.history.replaceState(null, '', `${window.location.pathname}${sansOnglet(window.location.search)}${window.location.hash}`);
    // L'app est déjà ouverte quand on touche la notification : le service worker lui dit où aller.
    const surMessage = (e: MessageEvent) => {
      const d = e.data as { type?: unknown; onglet?: unknown } | null;
      const demande = d && d.type === 'hameau-ouvrir' ? ongletValide(d.onglet) : null;
      if (demande) setOnglet(demande);
    };
    if (!('serviceWorker' in navigator)) return undefined;
    navigator.serviceWorker.addEventListener('message', surMessage);
    return () => navigator.serviceWorker.removeEventListener('message', surMessage);
  }, []);
  const [gardeRobe, setGardeRobe] = useState(false);
  // Le ciel suit le soleil à la minute : recalculé seulement quand elle change,
  // pour que le village (mémoïsé) ne se redessine pas à chaque battement.
  const minute = Math.floor(maintenant / 60_000);
  const ciel = useMemo(() => cielPour(new Date(minute * 60_000)), [minute]);
  const [finEnCours, setFinEnCours] = useState(false);
  const [focus, setFocus] = useState(false);
  const [aConstruire, setAConstruire] = useState<Batiment | null>(null);
  // Un bâtiment « soulevé » : on choisit sa nouvelle case, sans rien payer.
  const [aDeplacer, setADeplacer] = useState<Construction | null>(null);
  const [boutique, setBoutique] = useState(false);
  const [selection, setSelection] = useState<Construction | null>(null);
  const [recent, setRecent] = useState<string | null>(null);
  const [fete, setFete] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pasMasques, setPasMasques] = useState(() => lirePreference('hameau.premiers-pas-masques', false));
  const [installee] = useState(estInstallee);
  const [lien, setLien] = useState<LienSillage | null>(lienSillage);
  const mini = useMiniChrono();

  const enCours = derive?.enCours ?? null;
  const profil = donnees?.profil;
  // Prévient l'extension de blocage (si elle est installée) qu'un chrono a commencé, fini ou changé de pause : elle
  // vérifie aussitôt, sans attendre son passage de toutes les 30 secondes. Le message ne porte aucune donnée.
  const idEnCours = enCours?.id ?? null;
  const pauseEnCours = enCours?.pauseDepuis ?? null;
  useEffect(() => {
    window.postMessage({ source: 'hameau-session' }, window.location.origin);
  }, [idEnCours, pauseEnCours]);

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
      void chargerTaches();
      void chargerAmis();
      void chargerOngletCours();
    };
    const w = window as unknown as { requestIdleCallback?: (f: () => void, o: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(precharger, { timeout: 6000 });
    else window.setTimeout(precharger, 3000);
  }, []);

  // Le temps part vers Sillage après chaque changement venu de la base (pas
  // depuis le cache, qui peut être en retard), regroupé : une rafale de
  // modifications ne fait qu'un envoi.
  const erreurSynchroSignalee = useRef(false);
  useEffect(() => {
    if (!lien || !frais || !donnees) return;
    const id = window.setTimeout(() => {
      // Le module est léger ; c'est la bibliothèque Supabase, qu'il charge à
      // la demande, qui pèse — et elle n'est demandée qu'une fois relié.
      synchroniser(lien.profilId, donnees.sessions).then(
          () => {
            erreurSynchroSignalee.current = false;
          },
          (e: unknown) => {
            if (erreurSynchroSignalee.current) return;
            erreurSynchroSignalee.current = true;
            toast(`Sillage : ${e instanceof Error ? e.message : String(e)}`);
          },
        );
    }, 3000);
    return () => window.clearTimeout(id);
  }, [lien, frais, donnees, toast]);

  const listeSucces = useMemo(
    () => (donnees ? calculerSucces(donnees.sessions, donnees.constructions, donnees.profil.objectifJour) : null),
    [donnees],
  );

  // Où en est-on, pour la garde-robe : tout se déduit des sessions et des
  // constructions, comme les succès.
  const progression = useMemo<Progression | null>(() => {
    if (!donnees || !derive || !listeSucces) return null;
    let minutes = 0;
    let sessions = 0;
    for (const s of donnees.sessions) {
      const d = dureeSession(s);
      if (d === null) continue;
      minutes += d;
      if (d >= 5) sessions++;
    }
    return {
      niveau: derive.niveau.niveau,
      minutes,
      sessions,
      meilleureSerie: meilleureSerie(donnees.sessions),
      batiments: donnees.constructions.length,
      succes: new Set(listeSucces.filter((x) => x.obtenu).map((x) => x.id)),
    };
  }, [donnees, derive, listeSucces]);

  // Fête le niveau, les succès et les objets gagnés, une fois, sans rejouer au chargement.
  const vu = useRef<{ niveau: number; succes: NonNullable<typeof listeSucces>; progression: Progression } | null>(null);
  useEffect(() => {
    if (!derive || !listeSucces || !progression || !frais) return;
    const avant = vu.current;
    vu.current = { niveau: derive.niveau.niveau, succes: listeSucces, progression };
    if (!avant) return;
    if (derive.niveau.niveau > avant.niveau) {
      toast(`Niveau ${derive.niveau.niveau} ! Le hameau s’agrandit.`, { type: 'succes' });
      setFete(true);
      window.setTimeout(() => setFete(false), 5000);
    }
    for (const s of nouveauxSucces(avant.succes, listeSucces)) toast(`Succès : ${s.nom}`, { type: 'succes' });
    for (const c of nouveauxCosmetiques(avant.progression, progression))
      toast(`Garde-robe : ${c.nom} gagné`, { type: 'succes', action: { libelle: 'Voir', faire: () => {
        setOnglet('village');
        setBoutique(false);
        setGardeRobe(true);
      } } });
  }, [derive, listeSucces, progression, frais, toast]);

  // Le niveau montré aux amis : recopié quand il change. Une fois par niveau
  // et par ouverture, en silence : si la base n'est pas encore à jour, on
  // retentera à la prochaine ouverture plutôt qu'à chaque rechargement.
  const niveauEnvoye = useRef<number | null>(null);
  useEffect(() => {
    if (!frais || !depot.synchronise || !donnees || !derive) return;
    const n = derive.niveau.niveau;
    if (donnees.profil.niveauPublie === n || niveauEnvoye.current === n) return;
    niveauEnvoye.current = n;
    depot.enregistrerProfil({ ...donnees.profil, niveauPublie: n }).catch(() => undefined);
  }, [frais, depot, donnees, derive]);

  const categories = useMemo(() => {
    const vues = new Set(CATEGORIES_PROPOSEES);
    for (const s of donnees?.sessions ?? []) if (s.categorie.trim()) vues.add(s.categorie.trim());
    return [...vues].slice(0, 12);
  }, [donnees]);

  const posables = useMemo(() => {
    if (aDeplacer && derive && donnees) return casesDeplacement(aDeplacer, { niveau: derive.niveau.niveau, constructions: donnees.constructions });
    if (!aConstruire || !derive || !donnees) return undefined;
    const t = tailleTerrain(derive.niveau.niveau);
    const s = new Set<string>();
    for (let y = 0; y < t; y++)
      for (let x = 0; x < t; x++)
        if (refusConstruction(aConstruire.id, x, y, { niveau: derive.niveau.niveau, solde: derive.solde, constructions: donnees.constructions }) === null) s.add(`${x},${y}`);
    return s;
  }, [aConstruire, aDeplacer, derive, donnees]);
  // Pendant un déplacement, le bâtiment soulevé disparaît de sa case (et revient si l'on annule).
  const constructionsVisibles = useMemo(() => (donnees && aDeplacer ? donnees.constructions.filter((c) => c.id !== aDeplacer.id) : donnees?.constructions), [donnees, aDeplacer]);

  const demarrer = useCallback((categorie: string, objectif: number | null) => void agir(() => depot.demarrer(categorie, objectif)), [agir, depot]);

  // Lancer une session SUR une tâche Sillage : l'estimation de la tâche
  // devient l'objectif, et le lien est retenu pour proposer de la marquer
  // faite à la fin. Retenu sur l'appareil seulement : c'est un pense-bête de
  // fin de session, pas une donnée à synchroniser.
  const lancerTache = useCallback(
    (t: TacheSillage) =>
      void agir(async () => {
        const objectif = t.estimate_min !== null && t.estimate_min > 0 ? Math.min(600, t.estimate_min) : lirePreference<number | null>('hameau.objectif', 50);
        const s = await depot.demarrer(lirePreference('hameau.categorie', ''), objectif);
        ecrirePreference('hameau.tache-en-cours', { session: s.id, tacheId: t.id, titre: t.title });
      }).then(() => {
        setOnglet('village');
        toast(`Session lancée sur « ${t.title} »`);
      }),
    [agir, depot, toast],
  );
  // Lancer le chrono SUR une page (ou un bloc de pages) : la catégorie est le cours, la durée prévue
  // devient l'objectif, et le lien est retenu pour proposer de valider la séance à la fin.
  const [aNoter, setANoter] = useState<ATraiter | null>(null);
  const lancerChapitre = useCallback(
    (l: LancerChapitre) => {
      if (enCours) return toast('Une session tourne déjà : termine-la d’abord.');
      void agir(async () => {
        const s = await depot.demarrer(l.titreCours, Math.min(600, Math.max(5, l.minutes)));
        const lien: ChapitreEnCours = { session: s.id, chapitreIds: l.chapitreIds, termines: l.termines, titre: l.titre, type: l.type, etape: l.etape, parCoeur: l.parCoeur, minutes: l.minutes };
        ecrirePreference('hameau.chapitre-en-cours', lien);
      }).then(() => {
        setOnglet('village');
        toast(`Session lancée : ${l.titre}`);
      });
    },
    [agir, depot, enCours, toast],
  );
  // La pratique quotidienne : un chrono sans page derrière, rangé sous « <cours> · erreurs » pour être retrouvé et compté.
  const lancerPratique = useCallback(
    (categorie: string, minutes: number) => {
      if (enCours) return toast('Une session tourne déjà : termine-la d’abord.');
      void agir(() => depot.demarrer(categorie, Math.min(600, Math.max(5, minutes)))).then(() => {
        setOnglet('village');
        toast(`Session lancée : ${categorie}`);
      });
    },
    [agir, depot, enCours, toast],
  );
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
        toast(`${b.nom} ${accord(b, 'construit')} !`);
        // L'animation « pousse » vise le bâtiment le plus récent sur cette case.
        setRecent(`${x},${y}`);
      });
    },
    [aConstruire, agir, depot, toast],
  );

  const deplacerVers = useCallback(
    (x: number, y: number) => {
      if (!aDeplacer) return;
      const c = aDeplacer;
      const b = batiment(c.batiment);
      setADeplacer(null);
      void agir(() => depot.deplacer(c.id, x, y)).then(() => {
        toast(`${b?.nom ?? c.batiment} ${accord(b, 'déplacé')}.`, { action: { libelle: 'Annuler', faire: () => void agir(() => depot.deplacer(c.id, c.x, c.y)) } });
        setRecent(`${x},${y}`);
      });
    },
    [aDeplacer, agir, depot, toast],
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
      const b = batiment(c.batiment);
      const nom = b?.nom ?? c.batiment;
      void agir(() => depot.demolir(c.id)).then(() =>
        toast(`${nom} ${accord(b, 'démoli')} (+${c.cout}).`, { action: { libelle: 'Annuler', faire: () => void agir(() => depot.construire({ batiment: c.batiment, x: c.x, y: c.y, cout: c.cout, niveau: c.niveau })) } }),
      );
    },
    [agir, depot, toast],
  );
  const ameliorer = useCallback(
    (c: Construction) => {
      const b = batiment(c.batiment);
      const cout = b ? coutAmelioration(b, c.niveau) : null;
      if (!b || cout === null) return;
      void agir(() => depot.ameliorer(c, cout)).then(() => {
        toast(`${b.nom} ${accord(b, 'amélioré')} : niveau ${c.niveau + 1} !`, { type: 'succes' });
        setRecent(`${c.x},${c.y}`);
      });
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
  const saison = saisonPour(m);
  const jours = serie(donnees.sessions, m);
  // Le total du jour compte aussi la session en cours (pauses déduites), à la demi-minute près.
  const enCoursAujourdhui = enCours && cleJour(new Date(enCours.debut)) === cleJour(m) ? ecouleEffectif(enCours, maintenant) : 0;
  const aujourdhui = minutesAujourdhui(donnees.sessions, m) + enCoursAujourdhui;
  const prochain = listeSucces.filter((s) => !s.obtenu).sort((a, b) => b.actuel / b.cible - a.actuel / a.cible)[0];
  const recentId = recent ? (donnees.constructions.find((c) => `${c.x},${c.y}` === recent)?.id ?? null) : null;
  // Le bâtiment ouvert, tel qu'il est MAINTENANT : après une amélioration, son
  // niveau et son coût ont changé ; démoli ailleurs, la fiche se ferme.
  const choisie = selection ? (donnees.constructions.find((c) => c.id === selection.id) ?? null) : null;
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

        {depot.synchronise && depot.userId && <Rappels userId={depot.userId} jour={cleJour(new Date(maintenant))} />}

        <main className="contenu">
          {onglet === 'village' && (
            <div className="grille-village">
              <div className="col-scene">
                <CadreVillage
                  niveau={niveau.niveau}
                  constructions={constructionsVisibles ?? donnees.constructions}
                  actif={enCours !== null && !enPause(enCours)}
                  ciel={ciel}
                  saison={saison}
                  apparence={profil.apparence}
                  surPersonnage={() => {
                    setBoutique(false);
                    setGardeRobe(true);
                  }}
                  fete={fete}
                  posables={posables}
                  fantome={aConstruire?.id ?? aDeplacer?.batiment}
                  recent={recentId}
                  surCase={aDeplacer ? deplacerVers : poser}
                  surConstruction={setSelection}
                  pied={
                    aConstruire || aDeplacer ? (
                      <div className="bandeau">
                        <span>
                          Touche une case en surbrillance pour {aDeplacer ? 'déplacer' : 'poser'} : <strong>{aConstruire?.nom ?? batiment(aDeplacer!.batiment)?.nom}</strong>
                          {aDeplacer && ' (gratuit)'}
                        </span>
                        <button
                          className="bouton petit discret"
                          onClick={() => {
                            setAConstruire(null);
                            setADeplacer(null);
                          }}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="village-actions">
                        <button
                          className={boutique ? 'bouton discret icone actif' : 'bouton discret icone'}
                          onClick={() => {
                            setGardeRobe(false);
                            setBoutique(!boutique);
                          }}
                          aria-expanded={boutique}
                          aria-label="Construire"
                          title="Construire"
                        >
                          <IconeMarteau />
                        </button>
                        <button
                          className={gardeRobe ? 'bouton discret icone actif' : 'bouton discret icone'}
                          onClick={() => {
                            setBoutique(false);
                            setGardeRobe(!gardeRobe);
                          }}
                          aria-expanded={gardeRobe}
                          aria-label="Garde-robe"
                          title="Garde-robe"
                        >
                          <IconeCintre />
                        </button>
                        {miniChronoDisponible() && (
                          <button
                            className={mini.ouverte ? 'bouton discret icone actif' : 'bouton discret icone'}
                            onClick={() => void (mini.ouverte ? mini.fermer() : mini.ouvrir())}
                            aria-pressed={mini.ouverte}
                            aria-label={mini.ouverte ? 'Fermer le mini-chrono' : 'Mini-chrono'}
                            title={mini.ouverte ? 'Fermer le mini-chrono' : 'Mini-chrono : petite fenêtre toujours au premier plan'}
                          >
                            <IconeFenetre />
                          </button>
                        )}
                      </div>
                    )
                  }
                />
                {gardeRobe && !aConstruire && !aDeplacer && progression && (
                  <GardeRobe
                    apparence={profil.apparence}
                    progression={progression}
                    nomSucces={(id) => listeSucces.find((x) => x.id === id)?.nom ?? id}
                    surChoisir={(a) => void agir(() => depot.enregistrerProfil({ ...profil, apparence: a }))}
                    surFermer={() => setGardeRobe(false)}
                  />
                )}
                {boutique && !aConstruire && !aDeplacer && (
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
            {onglet === 'cours' && <OngletCours userId={depot.userId} synchronise={depot.synchronise} maintenant={maintenant} sessions={donnees?.sessions ?? []} surLancer={lancerChapitre} surChrono={lancerPratique} toast={toast} />}
            {onglet === 'taches' && <Taches emailSuggere={email} sessionEnCours={enCours !== null} surLancer={lancerTache} surLien={setLien} />}
            {onglet === 'amis' && (
              <Amis
                synchronise={depot.synchronise}
                profil={profil}
                maintenant={maintenant}
                invitation={invitation}
                surInvitationTraitee={() => {
                  setInvitation(null);
                  ecrirePreference('hameau.invitation', null);
                }}
                surPseudo={(pseudo) => agir(() => depot.enregistrerProfil({ ...profil, pseudo })).then(() => toast('Pseudo enregistré.'))}
                toast={toast}
              />
            )}
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
          tache={tacheDe(enCours)}
          surAnnuler={() => setFinEnCours(false)}
          surValider={(champs, { tacheFaite }) => {
            setFinEnCours(false);
            const tache = tacheDe(enCours);
            // Le gain affiché est celui que la base retiendra : pauses déduites.
            const gain = pointsSession(dureeSession(clore(enCours, champs.fin)));
            const chapitre = lirePreference<ChapitreEnCours | AncienChapitreEnCours | null>('hameau.chapitre-en-cours', null);
            // Le temps réel, pauses déduites : c'est lui qui précise ta vitesse (null : la session n'a pas de durée).
            const reelles = dureeSession(clore(enCours, champs.fin));
            void agir(() => depot.terminer(enCours.id, champs)).then(() => {
              toast(gain > 0 ? `+${gain} points de concentration` : 'Session enregistrée.');
              ecrirePreference('hameau.tache-en-cours', null);
              ecrirePreference('hameau.chapitre-en-cours', null);
              // Le chapitre travaillé : on propose de le noter tout de suite, c'est là que la mémoire est fraîche.
              if (chapitre && chapitre.session === enCours.id) setANoter(aTraiter(chapitre, reelles));
              if (tache && tacheFaite)
                marquerTache(tache.tacheId, true).then(
                    () => toast(`« ${tache.titre} » faite dans Sillage`, { type: 'succes' }),
                    (e: unknown) => toast(`Sillage : ${e instanceof Error ? e.message : String(e)}`),
                  );
            });
          }}
        />
      )}

      {choisie && (
        <div className="voile" role="dialog" aria-modal="true" onClick={() => setSelection(null)}>
          <div className="fenetre" onClick={(e) => e.stopPropagation()}>
            <FicheBatiment construction={choisie} niveauVillage={niveau.niveau} solde={solde} saison={saison} surAmeliorer={ameliorer} />
            <div className="actions">
              <button
                className="bouton"
                onClick={() => {
                  setSelection(null);
                  setBoutique(false);
                  setGardeRobe(false);
                  setAConstruire(null);
                  setADeplacer(choisie);
                }}
              >
                Déplacer
              </button>
              <button
                className="bouton danger"
                onClick={() => {
                  setSelection(null);
                  demolir(choisie);
                }}
              >
                Démolir (+{choisie.cout})
              </button>
              <button className="bouton" onClick={() => setSelection(null)}>
                Garder
              </button>
            </div>
          </div>
        </div>
      )}

      {aNoter && (
        <div className="voile" role="dialog" aria-modal="true" aria-label="Valider la séance" onClick={() => setANoter(null)}>
          <div className="fenetre" onClick={(e) => e.stopPropagation()}>
            {aNoter.type === 'decouverte' ? (
              aNoter.termines.length === 0 ? (
                <>
                  <h2>« {aNoter.titre} » continue un autre jour</h2>
                  <p className="aide">Cette séance ne finit aucune page aujourd’hui : rien à valider. Elle reprendra où tu t’es arrêté.</p>
                  <div className="actions">
                    <button className="bouton" onClick={() => setANoter(null)}>
                      D’accord
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="aide">{aNoter.reelles !== null ? `Tu y as passé ${formatDuree(aNoter.reelles)} pour ${formatDuree(aNoter.prevues)} prévues (rappel écrit compris). Le temps réel précise ta vitesse.` : 'Le temps réel précise ta vitesse quand le chrono a servi.'}</p>
                  <FinApprentissage
                    titre={aNoter.titre}
                    premiere
                    erreurPossible={aNoter.termines.length === 1}
                    parCoeur={aNoter.parCoeur}
                    surPlusTard={() => setANoter(null)}
                    surNote={(note, r) => {
                      const c = aNoter;
                      setANoter(null);
                      if (!depot.userId) return;
                      validerLectureEtVitesse(depot.userId, c.termines, cleJour(new Date()), { reelles: c.reelles, prevues: c.prevues }, { rappel: r.texte, note, confiance: r.confiance, erreur: r.erreur ? { texte: r.erreur.texte, chapitreId: c.termines.length === 1 ? c.termines[0] : undefined } : null }).then(
                        () => toast('Page apprise : tu la reverras demain, pour l’apprendre par cœur.'),
                        (e: unknown) => toast(e instanceof Error ? e.message : String(e)),
                      );
                    }}
                  />
                </>
              )
            ) : aNoter.etape === 'apprendre' ? (
              <FinApprentissage
                titre={aNoter.titre}
                premiere={false}
                erreurPossible={aNoter.chapitreIds.length === 1}
                parCoeur={aNoter.parCoeur}
                surPlusTard={() => setANoter(null)}
                surNote={(note, r) => {
                  const c = aNoter;
                  setANoter(null);
                  noterChapitres(c.chapitreIds, note, cleJour(new Date()), { rappel: r.texte, confiance: r.confiance, erreur: r.erreur }).then(
                    () => toast('Noté : le calendrier est recalculé.'),
                    (e: unknown) => toast(e instanceof Error ? e.message : String(e)),
                  );
                }}
              />
            ) : aNoter.type === 'examen' ? (
              <FinExamen
                titre={aNoter.titre}
                prevues={aNoter.prevues}
                reelles={aNoter.reelles}
                surPlusTard={() => setANoter(null)}
                surValider={(minutes, pct) => {
                  const c = aNoter;
                  setANoter(null);
                  validerExamen(c.chapitreIds[0], cleJour(new Date()), { minutes, scorePct: pct }).then(
                    () => toast('Examen blanc enregistré.'),
                    (e: unknown) => toast(e instanceof Error ? e.message : String(e)),
                  );
                }}
              />
            ) : aNoter.type === 'relecture' ? (
              <>
                <h2>Tu as relu « {aNoter.titre} » ?</h2>
                <p className="aide">Une relecture n’a pas de note : on retient seulement le jour, pour que la prochaine fasse le tour des autres pages.</p>
                <div className="actions">
                  <button className="bouton discret" onClick={() => setANoter(null)}>
                    Plus tard
                  </button>
                  <button
                    className="bouton"
                    onClick={() => {
                      const c = aNoter;
                      setANoter(null);
                      marquerRelu(c.chapitreIds, cleJour(new Date())).then(
                        () => toast('Relu : noté.'),
                        (e: unknown) => toast(e instanceof Error ? e.message : String(e)),
                      );
                    }}
                  >
                    Relu
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Comment s’est passé « {aNoter.titre} » ?</h2>
                <p className="aide">Ta note règle quand ces pages reviennent dans le calendrier : « À revoir » demain, « Difficile » plus tôt, « Facile » plus tard.</p>
                <div className="notation grande" role="group" aria-label="Note de la séance">
                  {NOTES.map((n) => (
                    <button
                      key={n.id}
                      className={`note note-${n.id}`}
                      onClick={() => {
                        const c = aNoter;
                        setANoter(null);
                        noterChapitres(c.chapitreIds, n.id as Note, cleJour(new Date())).then(
                          () => toast('Noté : le calendrier est recalculé.'),
                          (e: unknown) => toast(e instanceof Error ? e.message : String(e)),
                        );
                      }}
                    >
                      {n.nom}
                    </button>
                  ))}
                </div>
                <div className="actions">
                  <button className="bouton discret" onClick={() => setANoter(null)}>
                    Plus tard
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className={aNoter ? 'toasts en-haut' : 'toasts'} aria-live="polite">
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

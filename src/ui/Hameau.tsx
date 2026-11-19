import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { premiersPas } from '../core/premiersPas.ts';
import { clore, dureeSession, ecouleEffectif, enPause } from '../core/session.ts';
import { minutesAujourdhui, serie } from '../core/stats.ts';
import { nouveauxSucces, succes as calculerSucces, succesEnJeu } from '../core/succes.ts';
import { cleJour, formatChrono, formatDuree } from '../core/temps.ts';
import type { Session } from '../core/types.ts';
import { heuresDe, jourDeFete, nouveautes, progressionVille } from '../core/ville.ts';
import type { Depot } from '../data/depot.ts';
import { lireLocal } from '../data/local.ts';
import { marquerRelu, noterChapitres, validerExamen, validerLectureEtVitesse } from '../data/cours.ts';
import { etapeDe, type Etape } from '../core/pages.ts';
import type { TypeSeance } from '../core/planning.ts';
import { NOTES, type Note } from '../core/revision.ts';
import { lienSillage, marquerTache, synchroniser, type LienSillage } from '../data/sillage.ts';
import type { TacheSillage } from '../core/sillage.ts';
import { useAlerteObjectif } from './alertes.ts';
import { Rappels } from './Rappels.tsx';
import { Anneau, CATEGORIES_PROPOSEES, Chrono, ecrirePreference, etatChrono, lirePreference } from './Chrono.tsx';
import { DialogueFin } from './DialogueFin.tsx';
import { FinApprentissage } from './FinApprentissage.tsx';
import { FinExamen } from './FinExamen.tsx';
import { IconeAmis, IconeCours, IconeCoche, IconeEtincelle, IconeFenetre, IconeFlamme, IconeHistorique, IconeReglages, IconeStats, IconeTaches, IconeVillage } from './Icones.tsx';
import { miniChronoDisponible, useMiniChrono } from './MiniChrono.tsx';
import { ModeFocus } from './ModeFocus.tsx';
import type { LancerChapitre } from './pages/Cours.tsx';
import { ongletDansAdresse, ongletValide, sansOnglet, type Onglet } from '../core/onglets.ts';
import { useHameau, useMaintenant } from './useHameau.ts';
import { usePointsApprentissage } from './usePointsApprentissage.ts';
import { useSites } from './useSites.ts';
import { SuiteVille, Ville } from './Ville.tsx';
import { BilanLecture, descriptionLecture, preparerBilan, type BilanSeance } from './BilanLecture.tsx';
import { EVENEMENT_LIRE, type DemandeLecture } from './liseuse/ouvrir.ts';

// Les onglets secondaires ne sont chargés qu'à la première visite : l'écran
// d'ouverture n'a besoin que de la ville et du chrono.
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
const Liseuse = lazy(() => import('./Liseuse.tsx'));

/** « ?lire=<cours>&page=<page> » : un lien qui ouvre directement un cours dans la liseuse (sur n'importe quel appareil). */
function lectureDansAdresse(recherche: string): DemandeLecture | null {
  const p = new URLSearchParams(recherche);
  const coursId = p.get('lire');
  return coursId && /^[0-9a-f-]{36}$/i.test(coursId) ? { coursId, chapitreId: /^[0-9a-f-]{36}$/i.test(p.get('page') ?? '') ? p.get('page') : null } : null;
}
function adresseLecture(d: DemandeLecture | null): string {
  const p = new URLSearchParams(window.location.search);
  p.delete('lire');
  p.delete('page');
  if (d) {
    p.set('lire', d.coursId);
    if (d.chapitreId) p.set('page', d.chapitreId);
  }
  const q = p.toString();
  return `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`;
}



const ONGLETS: { id: Onglet; nom: string; Icone: () => React.ReactElement }[] = [
  { id: 'village', nom: 'Ville', Icone: IconeVillage },
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


const AUCUNE_SESSION: Session[] = [];

export function Hameau({ depot, email, surDeconnexion }: { depot: Depot; email: string | null; surDeconnexion: () => void }) {
  const pointsEnApprenant = usePointsApprentissage(depot.synchronise ? depot.userId : null);
  const { donnees, frais, derive, erreur, setErreur, agir } = useHameau(depot, pointsEnApprenant);
  // Une demi-minute suffit pour l'heure du ciel et le total du jour : le
  // chrono, lui, a sa propre horloge à la seconde.
  const maintenant = useMaintenant(30_000);
  // Les sites sur lesquels l'extension a vu travailler pendant les chronos (rien sans compte ni sans extension).
  const sites = useSites(depot.synchronise ? depot.userId : null, donnees?.sessions ?? AUCUNE_SESSION, cleJour(new Date(maintenant)));
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
  const [finEnCours, setFinEnCours] = useState(false);
  const [focus, setFocus] = useState(false);
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
    () => (donnees ? succesEnJeu(calculerSucces(donnees.sessions, donnees.constructions, donnees.profil.objectifJour)) : null),
    [donnees],
  );

  // Les heures de travail closes, pauses déduites : ce qui fait grandir la ville. Sillage reçoit ces mêmes
  // séances et en tire la même progression, d'où la même ville des deux côtés.
  const minutesTravail = useMemo(() => {
    let minutes = 0;
    for (const s of donnees?.sessions ?? []) {
      const d = s.fin ? dureeSession(s) : null;
      if (d !== null && d > 0) minutes += d;
    }
    return minutes;
  }, [donnees]);
  const heuresTravail = heuresDe(minutesTravail);
  const ville = useMemo(() => progressionVille(heuresTravail), [heuresTravail]);

  // Annonce les succès et ce qui vient d'apparaître dans la ville, une fois, sans rejouer au chargement.
  const vu = useRef<{ succes: NonNullable<typeof listeSucces>; heures: number } | null>(null);
  useEffect(() => {
    if (!listeSucces || !frais) return;
    const avant = vu.current;
    vu.current = { succes: listeSucces, heures: heuresTravail };
    if (!avant) return;
    for (const s of nouveauxSucces(avant.succes, listeSucces)) toast(`Succès : ${s.nom}`, { type: 'succes' });
    for (const p of nouveautes(avant.heures, heuresTravail))
      toast(`Nouveau dans ta ville : ${p.libelle}`, { type: 'succes', action: { libelle: 'Voir', faire: () => setOnglet('village') } });
  }, [listeSucces, heuresTravail, frais, toast]);

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
  // La liseuse : ouverte par un bouton (événement), par un lien (?lire=…) ; le bouton « retour » du navigateur la ferme.
  const [liseuse, setLiseuse] = useState<DemandeLecture | null>(() => lectureDansAdresse(window.location.search));
  useEffect(() => {
    const ouvrir = (e: Event) => {
      const d = (e as CustomEvent<DemandeLecture>).detail;
      if (!d?.coursId) return;
      window.history.pushState({ hameauLiseuse: true }, '', adresseLecture(d));
      setLiseuse(d);
    };
    const retour = () => setLiseuse(lectureDansAdresse(window.location.search));
    window.addEventListener(EVENEMENT_LIRE, ouvrir);
    window.addEventListener('popstate', retour);
    return () => {
      window.removeEventListener(EVENEMENT_LIRE, ouvrir);
      window.removeEventListener('popstate', retour);
    };
  }, []);
  const fermerLiseuse = useCallback(() => {
    if ((window.history.state as { hameauLiseuse?: boolean } | null)?.hameauLiseuse) window.history.back();
    else {
      window.history.replaceState(null, '', adresseLecture(null));
      setLiseuse(null);
    }
  }, []);
  // La fin d'une séance passée dans la liseuse : préparée dès que la fenêtre de fin s'ouvre (le temps qu'on la remplisse).
  const [bilan, setBilan] = useState<BilanSeance | null>(null);
  const [suggestionLecture, setSuggestionLecture] = useState<string | null>(null);
  const bilanPrepare = useRef<{ session: string; promesse: Promise<BilanSeance | null> } | null>(null);
  const lancerChapitre = useCallback(
    (l: LancerChapitre) => {
      if (enCours) return toast('Une session tourne déjà : termine-la d’abord.');
      void agir(async () => {
        const s = await depot.demarrer(l.titreCours, Math.min(600, Math.max(5, l.minutes)));
        const lien: ChapitreEnCours = { session: s.id, chapitreIds: l.chapitreIds, termines: l.termines, titre: l.titre, type: l.type, etape: l.etape, parCoeur: l.parCoeur, minutes: l.minutes };
        ecrirePreference('hameau.chapitre-en-cours', lien);
      }).then(() => {
        toast(`Session lancée : ${l.titre}`);
        // Un cours qui se lit dans Hameau s'ouvre à la première page de la séance : c'est là que les pages se comptent.
        if (l.lire) {
          window.history.pushState({ hameauLiseuse: true }, '', adresseLecture({ coursId: l.coursId, chapitreId: l.chapitreIds[0] ?? null }));
          setLiseuse({ coursId: l.coursId, chapitreId: l.chapitreIds[0] ?? null });
        } else setOnglet('village');
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
  // Le chrono lancé depuis la liseuse : rangé sous le nom du cours, sans quitter la page qu'on lit.
  const demarrerLecture = useCallback(
    (categorie: string) => {
      if (enCours) return toast('Une session tourne déjà.');
      void agir(() => depot.demarrer(categorie, lirePreference<number | null>('hameau.objectif', 50))).then(() => toast('Chrono lancé : les pages que tu lis sont comptées.'));
    },
    [agir, depot, enCours, toast],
  );
  useEffect(() => {
    if (!finEnCours || !idEnCours) return;
    const promesse = preparerBilan(idEnCours).catch(() => null);
    bilanPrepare.current = { session: idEnCours, promesse };
    let fini = false;
    void promesse.then((b) => {
      if (!fini) setSuggestionLecture(b ? descriptionLecture(b) : null);
    });
    return () => {
      fini = true;
    };
  }, [finEnCours, idEnCours]);
  const pause = useCallback(() => enCours && void agir(() => depot.pause(enCours.id)), [agir, depot, enCours]);
  const reprise = useCallback(() => enCours && void agir(() => depot.reprendre(enCours.id)), [agir, depot, enCours]);

  // Supprimer s'annule pendant quelques secondes, plutôt que de demander
  // confirmation : une confirmation se valide par réflexe, une annulation
  // rattrape vraiment l'erreur.
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
  // Raccourcis clavier sur ordinateur. Jamais pendant une saisie : taper une
  // espace dans la description ne doit pas lancer une session.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(cible.tagName))) return;
      // Dans la liseuse, l'espace fait défiler la page : il ne doit pas arrêter le chrono.
      if (finEnCours || liseuse || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (enCours) setFinEnCours(true);
        else if (profil) demarrerRapide();
      } else if (e.key === 'f' && enCours) setFocus((f) => !f);
      else if (e.key === 'p' && enCours) {
        if (enPause(enCours)) reprise();
        else pause();
      }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [enCours, finEnCours, liseuse, profil, demarrerRapide, pause, reprise]);

  if (!donnees || !derive || !profil || !listeSucces) {
    return <div className="chargement">{erreur ? `Erreur : ${erreur}` : 'Chargement du hameau…'}</div>;
  }

  const m = new Date(maintenant);
  const jours = serie(donnees.sessions, m);
  // Le total du jour compte aussi la session en cours (pauses déduites), à la demi-minute près.
  const enCoursAujourdhui = enCours && cleJour(new Date(enCours.debut)) === cleJour(m) ? ecouleEffectif(enCours, maintenant) : 0;
  const aujourdhui = minutesAujourdhui(donnees.sessions, m) + enCoursAujourdhui;
  const prochain = listeSucces.filter((s) => !s.obtenu).sort((a, b) => b.actuel / b.cible - a.actuel / a.cible)[0];
  // Le feu d'artifice des soirs où l'objectif du jour est atteint (une fois débloqué dans la ville).
  const fete = jourDeFete(ville, aujourdhui, profil.objectifJour);
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
        <a className="evitement" href="#contenu">
          Aller au contenu
        </a>
        <header className="barre-haut">
          <div className="titre-hameau">
            <h1>{profil.nomHameau}</h1>
          </div>
          <div className="compteurs">
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

        <main className="contenu" id="contenu" tabIndex={-1}>
          {/* Sous la liseuse, la ville 3D (qui dessine chaque image) se met en veille : sur un iPad, c'est de la batterie. */}
          {onglet === 'village' && !liseuse && (
            <div className="grille-village">
              <div className="col-scene">
                <Ville
                  progression={ville}
                  fete={fete}
                  pied={
                    <div className="ville-pied">
                      <SuiteVille minutesCloses={minutesTravail} minutesEnCours={enCours ? ecouleEffectif(enCours, maintenant) : 0} />
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
                  }
                />
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
                sites={sites.parSession}
                categories={categories}
                surModifier={(id, champs) => void agir(() => depot.modifierSession(id, champs))}
                surSupprimer={supprimerSession}
                surAjouter={(s) => void agir(() => depot.ajouterSession(s))}
              />
            )}
            {onglet === 'stats' && <Statistiques sessions={donnees.sessions} sites={sites.periode} succes={listeSucces} objectifJour={profil.objectifJour} maintenant={maintenant} />}
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
          suggestion={suggestionLecture}
          surAnnuler={() => {
            setFinEnCours(false);
            setSuggestionLecture(null);
          }}
          surValider={(champs, { tacheFaite }) => {
            setFinEnCours(false);
            setSuggestionLecture(null);
            const tache = tacheDe(enCours);
            const chapitre = lirePreference<ChapitreEnCours | AncienChapitreEnCours | null>('hameau.chapitre-en-cours', null);
            // Le temps réel, pauses déduites : c'est lui qui précise ta vitesse (null : la session n'a pas de durée).
            const reelles = dureeSession(clore(enCours, champs.fin));
            // Ce que la liseuse a compté : préparé à l'ouverture de cette fenêtre (sinon, maintenant).
            const lu = bilanPrepare.current?.session === enCours.id ? bilanPrepare.current.promesse : preparerBilan(enCours.id).catch(() => null);
            // Sans description écrite, la séance se décrit par ce qu'on a lu (« Croissance : pages 1 à 5 (3e fois) »).
            const description = champs.description || suggestionLecture || '';
            void agir(() => depot.terminer(enCours.id, { ...champs, description })).then(async () => {
              toast('Session enregistrée.');
              ecrirePreference('hameau.tache-en-cours', null);
              ecrirePreference('hameau.chapitre-en-cours', null);
              // Lu dans la liseuse : ce qu'on a vraiment lu se valide (voir BilanLecture). Sinon, le chapitre lancé :
              // on propose de le noter tout de suite, c'est là que la mémoire est fraîche.
              const b = await lu;
              if (b) setBilan(b);
              else if (chapitre && chapitre.session === enCours.id) setANoter(aTraiter(chapitre, reelles));
              if (tache && tacheFaite)
                marquerTache(tache.tacheId, true).then(
                    () => toast(`« ${tache.titre} » faite dans Sillage`, { type: 'succes' }),
                    (e: unknown) => toast(`Sillage : ${e instanceof Error ? e.message : String(e)}`),
                  );
            });
          }}
        />
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

      {liseuse && depot.userId && depot.synchronise && (
        <Suspense fallback={null}>
          <Liseuse
            userId={depot.userId}
            coursId={liseuse.coursId}
            chapitreId={liseuse.chapitreId}
            session={enCours}
            maintenant={maintenant}
            surFermer={fermerLiseuse}
            surDemarrer={demarrerLecture}
            surPause={pause}
            surReprendre={reprise}
            surTerminer={() => setFinEnCours(true)}
          />
        </Suspense>
      )}

      {bilan && <BilanLecture bilan={bilan} toast={toast} surFermer={() => setBilan(null)} />}

      <div className={aNoter || bilan ? 'toasts en-haut' : 'toasts'} aria-live="polite">
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

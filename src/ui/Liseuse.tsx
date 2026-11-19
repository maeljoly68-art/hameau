// La liseuse : un cours lu DANS Hameau. La page du cours (déchiffrée) tourne dans un cadre isolé ; autour, de quoi
// écrire, surligner, gommer, et le chrono. Ce qu'on écrit et ce qu'on coche part dans le compte (on le retrouve sur
// l'autre appareil, en direct) ; pendant une séance, les pages lues sont comptées pour être validées à la fin.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import moteur from '../liseuse/moteur-dc.js?raw';
import pont from '../liseuse/pont.js?raw';
import type { Chapitre } from '../core/cours.ts';
import { numerosDePages } from '../core/pages.ts';
import { ecouleEffectif, enPause } from '../core/session.ts';
import { formatChrono } from '../core/temps.ts';
import type { Session } from '../core/types.ts';
import { ajouterTraits, chargerDocument, chargerEtats, chargerTraits, ecouterEtats, ecouterTraits, ecrireEtats, supprimerTraits, type Outil, type Trait } from '../data/liseuse.ts';
import { useCours } from './useCours.ts';
import * as suivi from './liseuse/suivi.ts';

type OutilChoisi = 'lire' | Outil | 'gomme';

const COULEURS_STYLO = [
  { valeur: '#1F2430', nom: 'Noir' },
  { valeur: '#2B59C3', nom: 'Bleu' },
  { valeur: '#C2362B', nom: 'Rouge' },
  { valeur: '#17774A', nom: 'Vert' },
];
const COULEURS_SURLIGNEUR = [
  { valeur: '#FFD84A', nom: 'Jaune' },
  { valeur: '#7EE08A', nom: 'Vert' },
  { valeur: '#FF9BD2', nom: 'Rose' },
  { valeur: '#8CCBFF', nom: 'Bleu' },
];
const TAILLES_STYLO = [
  { valeur: 1.6, nom: 'Fin' },
  { valeur: 2.6, nom: 'Moyen' },
  { valeur: 4.2, nom: 'Épais' },
];
const EPAISSEUR_SURLIGNEUR = 18;
const ZOOMS = [1, 1.25, 1.5, 2];
/** Les clés de Hameau dans l'état du document : jamais montrées à la page du cours. */
const CLE_POSITION = '__hameau:position';
const PREFS = 'hameau.liseuse';

interface Prefs {
  stylo: string;
  surligneur: string;
  taille: number;
  doigt: boolean | null;
  zoom: number;
}
function lirePrefs(): Prefs {
  const defaut: Prefs = { stylo: COULEURS_STYLO[0].valeur, surligneur: COULEURS_SURLIGNEUR[0].valeur, taille: TAILLES_STYLO[1].valeur, doigt: null, zoom: 1 };
  try {
    return { ...defaut, ...(JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<Prefs>) };
  } catch {
    return defaut;
  }
}

/** La page du cours, avec le pont (en tête, avant tout script du cours) et le moteur des planches (à la fin). */
export function pageAvecPont(html: string, etats: Record<string, string>): string {
  const depart = JSON.stringify({ etats }).replace(/</g, '\\u003c');
  const tete = `<script>window.__HAMEAU__=${depart};</script><script>${pont}</script>`;
  const ouverture = /<head(\s[^>]*)?>/i.exec(html);
  let page = ouverture ? html.slice(0, ouverture.index + ouverture[0].length) + tete + html.slice(ouverture.index + ouverture[0].length) : tete + html;
  const fin = page.toLowerCase().lastIndexOf('</body>');
  page = fin >= 0 ? `${page.slice(0, fin)}<script>${moteur}</script>${page.slice(fin)}` : `${page}<script>${moteur}</script>`;
  return page;
}

const largeurDe = (html: string): number => {
  const m = /<meta name="hameau-largeur" content="(\d+)"/.exec(html);
  return m ? Math.min(3000, Math.max(320, Number(m[1]))) : 1000;
};

interface PagePlanche {
  id: string;
  titre: string;
}
type Action = { type: 'ajout'; traits: Trait[] } | { type: 'gomme'; traits: Trait[] };

const Icone = ({ d, taille = 20 }: { d: string; taille?: number }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const DESSINS: Record<OutilChoisi, string> = {
  lire: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-1.5v-2a1.5 1.5 0 0 1 3 0V12m0-1.5a1.5 1.5 0 0 1 3 0V12m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5-2.7L4.6 14a1.5 1.5 0 0 1 2.4-1.8L8 13.5',
  stylo: 'M4 20l1.5-5L16 4.5l3.5 3.5L9 18.5zM14 6.5l3.5 3.5',
  surligneur: 'M9 11l-5 5v3h3l5-5M9 11l6.5-6.5a2.1 2.1 0 0 1 3 3L12 14M9 11l3 3M14 21h7',
  gomme: 'M7 21h13M5.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 19H8.4a2 2 0 0 1-1.4-.6l-1.5-1.5a1 1 0 0 1 0-1.4zM10 11l5 5',
};
const NOMS: Record<OutilChoisi, string> = { lire: 'Lire et cliquer', stylo: 'Stylo', surligneur: 'Surligneur', gomme: 'Gomme (efface un trait entier)' };

export default function Liseuse({
  userId,
  coursId,
  chapitreId,
  session,
  maintenant,
  surFermer,
  surDemarrer,
  surPause,
  surReprendre,
  surTerminer,
}: {
  userId: string;
  coursId: string;
  /** La page où ouvrir le cours ; sans elle, là où on s'était arrêté. */
  chapitreId: string | null;
  session: Session | null;
  maintenant: number;
  surFermer: () => void;
  surDemarrer: (categorie: string) => void;
  surPause: () => void;
  surReprendre: () => void;
  surTerminer: () => void;
}) {
  const { donnees } = useCours(userId);
  const cours = donnees?.cours.find((c) => c.id === coursId) ?? null;
  const idDocument = cours?.document ?? null;
  const chapitres = useMemo<Chapitre[]>(() => (donnees?.chapitres ?? []).filter((c) => c.coursId === coursId).sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id)), [donnees, coursId]);
  const numeros = useMemo(() => numerosDePages(chapitres), [chapitres]);
  const correspondance = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of chapitres) for (const planche of (c.ancre ?? '').split(',').filter(Boolean)) m.set(planche, c.id);
    return m;
  }, [chapitres]);

  const [contenu, setContenu] = useState<{ document: string; html: string; page: string; largeur: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [planches, setPlanches] = useState<PagePlanche[]>([]);
  const [courante, setCourante] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(lirePrefs);
  const [outil, setOutil] = useState<OutilChoisi>('lire');
  const [masque, setMasque] = useState(false);
  const [historique, setHistorique] = useState({ annuler: 0, retablir: 0 });
  const [aActualiser, setAActualiser] = useState(false);
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const [hors, setHors] = useState(false);

  const cadre = useRef<HTMLIFrameElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const traits = useRef(new Map<string, Trait>());
  const pile = useRef<{ annuler: Action[]; retablir: Action[] }>({ annuler: [], retablir: [] });
  const aEnvoyer = useRef({ ajouts: new Map<string, Trait>(), retraits: new Set<string>() });
  const etats = useRef<Record<string, string>>({});
  const ecritsParMoi = useRef(new Map<string, string | null>());
  const etatsEnAttente = useRef<Record<string, string | null>>({});
  const position = useRef<{ page: string; decalage: number } | null>(null);
  const dejaPlace = useRef(false);
  const tactile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const doigt = prefs.doigt ?? !tactile;

  const poster = useCallback((m: Record<string, unknown>) => cadre.current?.contentWindow?.postMessage({ hameau: 1, ...m }, '*'), []);

  // ── Chargement : la page, l'état des planches, l'encre ──
  useEffect(() => {
    if (!idDocument) return;
    let fini = false;
    void (async () => {
      try {
        const [html, lus, encre] = await Promise.all([chargerDocument(idDocument), chargerEtats(idDocument), chargerTraits(idDocument)]);
        if (fini) return;
        const pourLaPage: Record<string, string> = {};
        for (const [cle, valeur] of Object.entries(lus)) {
          if (cle.startsWith('__hameau:')) continue;
          pourLaPage[cle] = valeur;
        }
        try {
          const p = JSON.parse(lus[CLE_POSITION] ?? 'null') as { page?: unknown; decalage?: unknown } | null;
          if (p && typeof p.page === 'string') position.current = { page: p.page, decalage: typeof p.decalage === 'number' ? p.decalage : 0 };
        } catch {
          position.current = null;
        }
        etats.current = pourLaPage;
        traits.current = new Map(encre.map((t) => [t.id, t]));
        setContenu({ document: idDocument, html, page: pageAvecPont(html, pourLaPage), largeur: largeurDe(html) });
      } catch (e) {
        if (!fini) setErreur(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      fini = true;
    };
  }, [idDocument]);

  // ── L'encre : envoi en base, avec reprise si le réseau manque ──
  const relancer = useRef<() => void>(() => undefined);
  const envoyerEncre = useCallback(async () => {
    if (!idDocument) return;
    const { ajouts, retraits } = aEnvoyer.current;
    if (ajouts.size === 0 && retraits.size === 0) return;
    const lot = [...ajouts.values()];
    const effaces = [...retraits];
    ajouts.clear();
    retraits.clear();
    try {
      await ajouterTraits(idDocument, lot);
      await supprimerTraits(effaces);
      setHors(false);
    } catch {
      for (const t of lot) if (!aEnvoyer.current.retraits.has(t.id)) aEnvoyer.current.ajouts.set(t.id, t);
      for (const id of effaces) aEnvoyer.current.retraits.add(id);
      setHors(true);
      window.setTimeout(() => relancer.current(), 8000);
    }
  }, [idDocument]);
  useEffect(() => {
    relancer.current = () => void envoyerEncre();
  }, [envoyerEncre]);

  const ajouter = useCallback(
    (lot: Trait[]) => {
      for (const t of lot) {
        traits.current.set(t.id, t);
        aEnvoyer.current.retraits.delete(t.id);
        aEnvoyer.current.ajouts.set(t.id, t);
      }
      void envoyerEncre();
    },
    [envoyerEncre],
  );
  const effacer = useCallback(
    (lot: Trait[]) => {
      for (const t of lot) {
        traits.current.delete(t.id);
        // Un trait jamais parti n'a pas à être supprimé en base : on oublie simplement de l'envoyer.
        if (!aEnvoyer.current.ajouts.delete(t.id)) aEnvoyer.current.retraits.add(t.id);
      }
      void envoyerEncre();
    },
    [envoyerEncre],
  );

  const majHistorique = useCallback(() => setHistorique({ annuler: pile.current.annuler.length, retablir: pile.current.retablir.length }), []);
  const defaire = useCallback(
    (sens: 'annuler' | 'retablir') => {
      const action = pile.current[sens].pop();
      if (!action) return;
      const inverse = sens === 'annuler' ? 'retablir' : 'annuler';
      pile.current[inverse].push(action);
      const remettre = (action.type === 'ajout') === (sens === 'retablir');
      if (remettre) {
        ajouter(action.traits);
        poster({ type: 'trait+', traits: action.traits });
      } else {
        effacer(action.traits);
        poster({ type: 'trait-', ids: action.traits.map((t) => t.id) });
      }
      majHistorique();
    },
    [ajouter, effacer, poster, majHistorique],
  );

  // ── L'état des planches : regroupé, puis écrit ──
  const minuterieEtats = useRef(0);
  const ecrireEtat = useCallback(
    (cle: string, valeur: string | null) => {
      if (!idDocument) return;
      etatsEnAttente.current[cle] = valeur;
      ecritsParMoi.current.set(cle, valeur);
      window.clearTimeout(minuterieEtats.current);
      minuterieEtats.current = window.setTimeout(() => {
        const lot = etatsEnAttente.current;
        etatsEnAttente.current = {};
        ecrireEtats(idDocument, lot).catch(() => {
          etatsEnAttente.current = { ...lot, ...etatsEnAttente.current };
          setHors(true);
        });
      }, 600);
    },
    [idDocument],
  );

  // ── Les cases « Mes passages » : les jours où chaque page a été vue ──
  const passagesParPlanche = useMemo(() => {
    const r: Record<string, string[]> = {};
    for (const c of chapitres) {
      if (!c.ancre) continue;
      const jours = [...new Set((donnees?.passages ?? []).filter((p) => p.chapitreId === c.id).map((p) => p.jour))].sort();
      for (const planche of c.ancre.split(',')) r[planche] = jours.map((j) => `${j.slice(8, 10)}/${j.slice(5, 7)}`);
    }
    return r;
  }, [chapitres, donnees]);

  const reglageOutil = useMemo(
    () => ({ type: 'outil', outil, couleur: outil === 'surligneur' ? prefs.surligneur : prefs.stylo, epaisseur: outil === 'surligneur' ? EPAISSEUR_SURLIGNEUR : prefs.taille, doigt, masque }),
    [outil, prefs, doigt, masque],
  );
  useEffect(() => {
    poster(reglageOutil);
  }, [poster, reglageOutil]);
  useEffect(() => {
    poster({ type: 'passages', pages: passagesParPlanche });
  }, [poster, passagesParPlanche]);
  useEffect(() => {
    try {
      localStorage.setItem(PREFS, JSON.stringify(prefs));
    } catch {
      // Préférences de cet appareil seulement : sans stockage, on garde celles de la visite.
    }
  }, [prefs]);

  // ── Les messages de la page ──
  const minuteriePosition = useRef(0);
  useEffect(() => {
    if (!contenu) return;
    const recevoir = (e: MessageEvent) => {
      if (!cadre.current || e.source !== cadre.current.contentWindow) return;
      const m = e.data as { hameau?: number; type?: string; [k: string]: unknown };
      if (!m || m.hameau !== 1) return;
      switch (m.type) {
        case 'pret': {
          const pages = Array.isArray(m.pages) ? (m.pages as PagePlanche[]) : [];
          setPlanches(pages.map((p) => ({ id: String(p.id), titre: String(p.titre) })));
          suivi.documentOuvert(contenu.document, correspondance);
          poster(reglageOutil);
          poster({ type: 'traits', traits: [...traits.current.values()] });
          poster({ type: 'passages', pages: passagesParPlanche });
          if (!dejaPlace.current) {
            dejaPlace.current = true;
            const voulue = chapitres.find((c) => c.id === chapitreId)?.ancre?.split(',')[0];
            if (voulue) poster({ type: 'aller', page: voulue, decalage: 0 });
            else if (position.current) poster({ type: 'aller', page: position.current.page, decalage: position.current.decalage });
          }
          break;
        }
        case 'vue': {
          const pages = (Array.isArray(m.pages) ? m.pages : []) as suivi.VuePage[];
          suivi.vue(pages, Number(m.haut) || 0);
          const dominante = pages.reduce<suivi.VuePage | null>((d, p) => (!d || p.a - p.de > d.a - d.de ? p : d), null);
          if (dominante) {
            setCourante(dominante.id);
            position.current = { page: dominante.id, decalage: Math.round(dominante.de) };
            window.clearTimeout(minuteriePosition.current);
            minuteriePosition.current = window.setTimeout(() => position.current && ecrireEtat(CLE_POSITION, JSON.stringify(position.current)), 4000);
          }
          break;
        }
        case 'activite':
          suivi.activite();
          break;
        case 'trait': {
          const t = m.trait as Trait;
          ajouter([t]);
          pile.current.annuler.push({ type: 'ajout', traits: [t] });
          pile.current.retablir = [];
          majHistorique();
          suivi.activite();
          break;
        }
        case 'gomme': {
          const lot = (m.traits as Trait[]).filter((t) => traits.current.has(t.id));
          if (lot.length === 0) break;
          effacer(lot);
          pile.current.annuler.push({ type: 'gomme', traits: lot });
          pile.current.retablir = [];
          majHistorique();
          break;
        }
        case 'etat':
          if (typeof m.cle === 'string' && !m.cle.startsWith('__hameau:')) {
            const valeur = typeof m.valeur === 'string' ? m.valeur : null;
            if (valeur === null) delete etats.current[m.cle];
            else etats.current[m.cle] = valeur;
            ecrireEtat(m.cle, valeur);
          }
          break;
        case 'raccourci':
          defaire(m.action === 'retablir' ? 'retablir' : 'annuler');
          break;
        case 'erreur':
          console.warn('[liseuse]', m.message);
          break;
      }
    };
    window.addEventListener('message', recevoir);
    return () => window.removeEventListener('message', recevoir);
  }, [contenu, correspondance, chapitres, chapitreId, poster, reglageOutil, passagesParPlanche, ajouter, effacer, majHistorique, ecrireEtat, defaire]);

  // ── En direct : l'encre et l'état venus de l'autre appareil ──
  useEffect(() => {
    if (!contenu) return;
    const arreterTraits = ecouterTraits(
      contenu.document,
      (t) => {
        if (traits.current.has(t.id)) return;
        traits.current.set(t.id, t);
        poster({ type: 'trait+', traits: [t] });
      },
      (id) => {
        if (!traits.current.delete(id)) return;
        poster({ type: 'trait-', ids: [id] });
      },
    );
    const arreterEtats = ecouterEtats(contenu.document, (cle, valeur) => {
      if (cle.startsWith('__hameau:')) return;
      // L'écho de nos propres écritures revient aussi : on le reconnaît et on l'ignore.
      if (ecritsParMoi.current.has(cle) && ecritsParMoi.current.get(cle) === valeur) return;
      if ((etats.current[cle] ?? null) === valeur) return;
      if (valeur === null) delete etats.current[cle];
      else etats.current[cle] = valeur;
      poster({ type: 'etat', cle, valeur });
      setAActualiser(true);
    });
    // Au retour sur l'app (l'iPad coupe le temps réel en arrière-plan) : on reprend l'encre telle qu'elle est en base.
    const auRetour = () => {
      if (window.document.visibilityState !== 'visible') return;
      chargerTraits(contenu.document)
        .then((encre) => {
          const enBase = new Map(encre.map((t) => [t.id, t]));
          for (const t of aEnvoyer.current.ajouts.values()) enBase.set(t.id, t);
          for (const id of aEnvoyer.current.retraits) enBase.delete(id);
          traits.current = enBase;
          poster({ type: 'traits', traits: [...enBase.values()] });
        })
        .catch(() => undefined);
    };
    window.document.addEventListener('visibilitychange', auRetour);
    return () => {
      arreterTraits();
      arreterEtats();
      window.document.removeEventListener('visibilitychange', auRetour);
    };
  }, [contenu, poster]);

  // ── Le compteur de lecture ──
  useEffect(() => {
    suivi.suivreSession(session && !session.fin ? session.id : null);
  }, [session]);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = sessionRef.current;
      suivi.tic(Date.now(), !s || s.fin !== null || enPause(s));
    }, 1000);
    const partir = () => void suivi.vider();
    window.addEventListener('pagehide', partir);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('pagehide', partir);
      suivi.documentOuvert(null, null);
      void suivi.vider();
    };
  }, []);
  // Les traits et l'état encore en attente partent avant de fermer.
  useEffect(
    () => () => {
      void envoyerEncre();
      window.clearTimeout(minuterieEtats.current);
      const lot = etatsEnAttente.current;
      if (idDocument && Object.keys(lot).length > 0) void ecrireEtats(idDocument, lot).catch(() => undefined);
    },
    [idDocument, envoyerEncre],
  );

  // ── La taille : la page garde sa largeur, on l'agrandit ou la réduit pour qu'elle tienne ──
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    // L'observateur mesure aussi au départ : pas de mesure à la main dans l'effet.
    const o = new ResizeObserver(() => setTaille({ l: el.clientWidth, h: el.clientHeight }));
    o.observe(el);
    return () => o.disconnect();
  }, [contenu]);

  // Échap : on repose l'outil ; une seconde fois, on ferme.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || window.document.querySelector('.voile')) return;
      if (outil !== 'lire') setOutil('lire');
      else surFermer();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [outil, surFermer]);

  const largeur = contenu?.largeur ?? 1000;
  const ajuste = taille.l > 0 ? Math.min(1, (taille.l - 8) / largeur) : 1;
  const echelle = Math.max(0.2, ajuste * prefs.zoom);
  const hauteurCadre = taille.h > 0 ? taille.h / echelle : 800;
  const indexZoom = ZOOMS.indexOf(prefs.zoom);
  const ecoule = session && !session.fin ? ecouleEffectif(session, maintenant) : null;
  const enPauseMaintenant = session !== null && !session.fin && enPause(session);
  const chapitreCourant = courante ? correspondance.get(courante) : undefined;
  const titreCourant = planches.find((p) => p.id === courante)?.titre ?? '';

  const actualiser = () => {
    if (!contenu) return;
    setAActualiser(false);
    dejaPlace.current = false;
    setContenu({ ...contenu, page: pageAvecPont(contenu.html, etats.current) });
  };

  if (!cours) return null;
  return (
    <div className="liseuse" role="dialog" aria-modal="true" aria-label={`Liseuse : ${cours.titre}`}>
      <header className="liseuse-barre">
        <div className="liseuse-ligne">
          <button className="liseuse-bouton" onClick={surFermer} aria-label="Fermer la liseuse" title="Fermer (Échap)">
            <Icone d="M15 5l-7 7 7 7" />
          </button>
          <div className="liseuse-titre">
            <span className="liseuse-cours" style={{ '--teinte': cours.couleur } as CSSProperties}>
              {cours.titre}
            </span>
            {planches.length > 0 && (
              <select
                className="liseuse-sommaire"
                value={courante ?? ''}
                aria-label="Aller à la page"
                onChange={(e) => {
                  poster({ type: 'aller', page: e.target.value, decalage: 0 });
                  suivi.activite();
                }}
              >
                {planches.map((p) => {
                  const ch = correspondance.get(p.id);
                  return (
                    <option key={p.id} value={p.id}>
                      {ch ? `Page ${numeros.get(ch)} · ` : ''}
                      {p.titre}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
          <div className="liseuse-seance">
            {ecoule === null ? (
              <button className="bouton petit demarrer" onClick={() => surDemarrer(cours.titre)} title="Pendant le chrono, Hameau compte les pages que tu lis">
                Lancer le chrono
              </button>
            ) : (
              <>
                <span className={enPauseMaintenant ? 'liseuse-chrono en-pause' : 'liseuse-chrono'} title={chapitreCourant ? `Page ${numeros.get(chapitreCourant)} comptée` : 'Cette planche n’est pas une page du cours'}>
                  <span className="point" aria-hidden />
                  {formatChrono(ecoule * 60_000)}
                </span>
                <button className="liseuse-bouton" onClick={enPauseMaintenant ? surReprendre : surPause} aria-label={enPauseMaintenant ? 'Reprendre' : 'Pause'}>
                  <Icone d={enPauseMaintenant ? 'M8 5l11 7-11 7z' : 'M9 5v14M15 5v14'} />
                </button>
                <button className="bouton petit arreter" onClick={surTerminer}>
                  Terminer
                </button>
              </>
            )}
          </div>
        </div>
        <div className="liseuse-ligne liseuse-outils" role="toolbar" aria-label="Annoter la page">
          <div className="liseuse-groupe">
            {(['lire', 'stylo', 'surligneur', 'gomme'] as OutilChoisi[]).map((o) => (
              <button key={o} className={outil === o ? 'liseuse-outil choisi' : 'liseuse-outil'} aria-pressed={outil === o} title={NOMS[o]} aria-label={NOMS[o]} onClick={() => setOutil(o)}>
                <Icone d={DESSINS[o]} />
              </button>
            ))}
          </div>
          {(outil === 'stylo' || outil === 'surligneur') && (
            <div className="liseuse-groupe" role="group" aria-label="Couleur">
              {(outil === 'stylo' ? COULEURS_STYLO : COULEURS_SURLIGNEUR).map((c) => {
                const choisie = (outil === 'stylo' ? prefs.stylo : prefs.surligneur) === c.valeur;
                return (
                  <button key={c.valeur} className={choisie ? 'liseuse-couleur choisie' : 'liseuse-couleur'} style={{ '--pastille': c.valeur } as CSSProperties} aria-pressed={choisie} aria-label={c.nom} title={c.nom} onClick={() => setPrefs((p) => (outil === 'stylo' ? { ...p, stylo: c.valeur } : { ...p, surligneur: c.valeur }))} />
                );
              })}
            </div>
          )}
          {outil === 'stylo' && (
            <div className="liseuse-groupe" role="group" aria-label="Épaisseur">
              {TAILLES_STYLO.map((t) => (
                <button key={t.valeur} className={prefs.taille === t.valeur ? 'liseuse-outil choisi' : 'liseuse-outil'} aria-pressed={prefs.taille === t.valeur} aria-label={t.nom} title={t.nom} onClick={() => setPrefs((p) => ({ ...p, taille: t.valeur }))}>
                  <span className="liseuse-trait" style={{ height: `${Math.round(t.valeur * 1.6)}px` }} />
                </button>
              ))}
            </div>
          )}
          <div className="liseuse-groupe">
            <button className="liseuse-outil" disabled={historique.annuler === 0} onClick={() => defaire('annuler')} aria-label="Annuler" title="Annuler (Ctrl Z)">
              <Icone d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-4" />
            </button>
            <button className="liseuse-outil" disabled={historique.retablir === 0} onClick={() => defaire('retablir')} aria-label="Rétablir" title="Rétablir (Ctrl Maj Z)">
              <Icone d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h4" />
            </button>
            <button className={masque ? 'liseuse-outil choisi' : 'liseuse-outil'} aria-pressed={masque} onClick={() => setMasque((v) => !v)} aria-label={masque ? 'Montrer mes annotations' : 'Cacher mes annotations'} title={masque ? 'Montrer mes annotations' : 'Cacher mes annotations'}>
              <Icone d={masque ? 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A9.6 9.6 0 0 1 12 5c5 0 9 5 10 7a14 14 0 0 1-3.2 3.9M6.1 6.2A14 14 0 0 0 2 12c1 2 5 7 10 7a9.4 9.4 0 0 0 4.2-1' : 'M2 12c1-2 5-7 10-7s9 5 10 7c-1 2-5 7-10 7S3 14 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'} />
            </button>
            {tactile && (
              <button className={doigt ? 'liseuse-outil choisi texte' : 'liseuse-outil texte'} aria-pressed={doigt} onClick={() => setPrefs((p) => ({ ...p, doigt: !doigt }))} title="Écrire aussi avec le doigt (sinon le doigt fait défiler, le stylet écrit)">
                Doigt
              </button>
            )}
          </div>
          <div className="liseuse-groupe liseuse-zoom">
            <button className="liseuse-outil" disabled={indexZoom <= 0} onClick={() => setPrefs((p) => ({ ...p, zoom: ZOOMS[Math.max(0, ZOOMS.indexOf(p.zoom) - 1)] ?? 1 }))} aria-label="Réduire">
              <Icone d="M5 12h14" />
            </button>
            <span className="liseuse-echelle">{Math.round(echelle * 100)} %</span>
            <button className="liseuse-outil" disabled={indexZoom >= ZOOMS.length - 1} onClick={() => setPrefs((p) => ({ ...p, zoom: ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(p.zoom) + 1)] ?? 1 }))} aria-label="Agrandir">
              <Icone d="M12 5v14M5 12h14" />
            </button>
          </div>
          {(hors || aActualiser) && (
            <div className="liseuse-etat" role="status">
              {hors && <span>Hors ligne : tes annotations partiront dès le retour du réseau.</span>}
              {aActualiser && (
                <button className="lien" onClick={actualiser}>
                  Modifié sur l’autre appareil · Actualiser
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      <div className="liseuse-zone" ref={zone}>
        {erreur ? (
          <div className="liseuse-message">
            <p>{erreur}</p>
            {cours.lien && (
              <a className="bouton petit discret" href={cours.lien} target="_blank" rel="noopener noreferrer">
                Ouvrir l’artefact sur Claude
              </a>
            )}
          </div>
        ) : !idDocument ? (
          <div className="liseuse-message">
            <p>Ce cours n’a pas encore de version lisible dans Hameau.</p>
            {cours.lien && (
              <a className="bouton petit discret" href={cours.lien} target="_blank" rel="noopener noreferrer">
                Ouvrir l’artefact sur Claude
              </a>
            )}
          </div>
        ) : !contenu ? (
          <div className="liseuse-message" aria-busy="true">
            <p>Ouverture du cours…</p>
          </div>
        ) : (
          <div className="liseuse-feuille" style={{ width: Math.round(largeur * echelle), height: '100%' }}>
            <iframe
              ref={cadre}
              title={`Cours : ${cours.titre}${titreCourant ? ` — ${titreCourant}` : ''}`}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals"
              srcDoc={contenu.page}
              style={{ width: largeur, height: hauteurCadre, transform: `scale(${echelle})` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session as SessionAuth } from '@supabase/supabase-js';
import { pointsSession } from '../core/points.ts';
import { serie } from '../core/stats.ts';
import { dureeMinutes, formatChrono } from '../core/temps.ts';
import type { Construction } from '../core/types.ts';
import { batiment, refusConstruction, type Batiment } from '../core/village.ts';
import { supabase } from '../data/config.ts';
import type { Depot } from '../data/depot.ts';
import { depotDistant } from '../data/distant.ts';
import { depotLocal } from '../data/local.ts';
import { Chrono, CATEGORIES_PROPOSEES } from './Chrono.tsx';
import { Connexion } from './Connexion.tsx';
import { DialogueFin } from './DialogueFin.tsx';
import { miniChronoDisponible, useMiniChrono } from './MiniChrono.tsx';
import { Boutique, Historique, Statistiques } from './Pages.tsx';
import { Reglages } from './Reglages.tsx';
import { useHameau, useMaintenant } from './useHameau.ts';
import { Village } from './Village.tsx';

const CLE_MODE = 'hameau.mode';

function lireMode(): string | null {
  try {
    return localStorage.getItem(CLE_MODE);
  } catch {
    return null;
  }
}

export function App() {
  const sb = useMemo(() => supabase(), []);
  const [auth, setAuth] = useState<SessionAuth | null | undefined>(sb ? undefined : null);
  const [local, setLocal] = useState(() => !sb || lireMode() === 'local');

  useEffect(() => {
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => setAuth(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setAuth(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  const userId = auth?.user.id ?? null;
  const depot = useMemo<Depot | null>(() => {
    if (sb && userId) return depotDistant(sb);
    if (local) return depotLocal();
    return null;
  }, [sb, userId, local]);

  if (auth === undefined) return <div className="chargement">Hameau…</div>;
  if (!depot) {
    return (
      <Connexion
        sb={sb!}
        surSansCompte={() => {
          localStorage.setItem(CLE_MODE, 'local');
          setLocal(true);
        }}
      />
    );
  }
  return (
    <Hameau
      key={userId ?? 'local'}
      depot={depot}
      email={auth?.user.email ?? null}
      surDeconnexion={async () => {
        localStorage.removeItem(CLE_MODE);
        setLocal(false);
        if (sb && auth) await sb.auth.signOut();
      }}
    />
  );
}

type Onglet = 'village' | 'historique' | 'stats' | 'reglages';

function Hameau({ depot, email, surDeconnexion }: { depot: Depot; email: string | null; surDeconnexion: () => void }) {
  const { donnees, derive, erreur, setErreur, agir } = useHameau(depot);
  const maintenant = useMaintenant(1000);
  const [onglet, setOnglet] = useState<Onglet>('village');
  const [finEnCours, setFinEnCours] = useState(false);
  const [aConstruire, setAConstruire] = useState<Batiment | null>(null);
  const [boutique, setBoutique] = useState(false);
  const [selection, setSelection] = useState<Construction | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const mini = useMiniChrono();
  const sb = useMemo(() => supabase(), []);

  const enCours = derive?.enCours ?? null;

  // Le chrono dans le titre : visible dans l'onglet et la barre des tâches.
  useEffect(() => {
    document.title = enCours ? `⏱ ${formatChrono(maintenant - Date.parse(enCours.debut))} · Hameau` : 'Hameau';
  }, [enCours, maintenant]);

  // Fête le passage de niveau, une fois, sans le rejouer au chargement.
  const niveauVu = useRef<number | null>(null);
  useEffect(() => {
    const n = derive?.niveau.niveau;
    if (n === undefined) return;
    if (niveauVu.current !== null && n > niveauVu.current) setToast(`Niveau ${n} ! Le hameau s’agrandit.`);
    niveauVu.current = n;
  }, [derive?.niveau.niveau]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const categories = useMemo(() => {
    const vues = new Set(CATEGORIES_PROPOSEES);
    for (const s of donnees?.sessions ?? []) if (s.categorie.trim()) vues.add(s.categorie.trim());
    return [...vues].slice(0, 12);
  }, [donnees]);

  if (!donnees || !derive) {
    return <div className="chargement">{erreur ? `Erreur : ${erreur}` : 'Chargement du hameau…'}</div>;
  }

  const { niveau, solde } = derive;
  const heure = new Date(maintenant).getHours();
  const jours = serie(donnees.sessions, new Date(maintenant));

  const poser = (x: number, y: number) => {
    if (!aConstruire) return;
    const refus = refusConstruction(aConstruire.id, x, y, { niveau: niveau.niveau, solde, constructions: donnees.constructions });
    if (refus) return;
    const b = aConstruire;
    setAConstruire(null);
    setBoutique(false);
    void agir(() => depot.construire({ batiment: b.id, x, y, cout: b.cout })).then(() => setToast(`${b.nom} construit !`));
  };

  const chrono = enCours ? formatChrono(maintenant - Date.parse(enCours.debut)) : '0:00';

  return (
    <div className="app">
      <header className="barre-haut">
        <div className="niveau">
          <span className="niveau-num">Niv. {niveau.niveau}</span>
          <span className="progression" title={`${niveau.dansNiveau} / ${niveau.tailleNiveau} points`}>
            <span style={{ width: `${(niveau.dansNiveau / niveau.tailleNiveau) * 100}%` }} />
          </span>
        </div>
        <div className="compteurs">
          <span title="Points à dépenser">✦ {solde}</span>
          <span title="Jours d’affilée avec au moins 25 min">🔥 {jours}</span>
        </div>
      </header>

      {erreur && (
        <p className="alerte" onClick={() => setErreur(null)}>
          {erreur}
        </p>
      )}

      <main className="contenu">
        {onglet === 'village' && (
          <>
            <Village
              niveau={niveau.niveau}
              constructions={donnees.constructions}
              actif={enCours !== null}
              heure={heure}
              posable={aConstruire ? (x, y) => refusConstruction(aConstruire.id, x, y, { niveau: niveau.niveau, solde, constructions: donnees.constructions }) === null : undefined}
              surCase={poser}
              surConstruction={setSelection}
            />
            {aConstruire ? (
              <div className="bandeau">
                Touche une case en surbrillance pour poser : <strong>{aConstruire.nom}</strong>
                <button className="bouton petit discret" onClick={() => setAConstruire(null)}>
                  Annuler
                </button>
              </div>
            ) : (
              <Chrono enCours={enCours} maintenant={maintenant} categories={categories} surDemarrer={(c) => void agir(() => depot.demarrer(c))} surArreter={() => setFinEnCours(true)} />
            )}
            <div className="actions centre">
              {!aConstruire && (
                <button className="bouton discret" onClick={() => setBoutique(!boutique)}>
                  {boutique ? 'Fermer la boutique' : '🏗 Construire'}
                </button>
              )}
              {miniChronoDisponible() && (
                <button className="bouton discret" onClick={() => void (mini.ouverte ? mini.fermer() : mini.ouvrir())}>
                  {mini.ouverte ? 'Fermer le mini-chrono' : '⧉ Mini-chrono'}
                </button>
              )}
            </div>
            {boutique && !aConstruire && (
              <Boutique
                niveau={niveau.niveau}
                solde={solde}
                choisi={null}
                surChoisir={(b) => {
                  setAConstruire(b);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}
          </>
        )}
        {onglet === 'historique' && (
          <Historique
            sessions={donnees.sessions}
            categories={categories}
            surModifier={(id, champs) => void agir(() => depot.modifierSession(id, champs))}
            surSupprimer={(id) => void agir(() => depot.supprimerSession(id))}
            surAjouter={(s) => void agir(() => depot.ajouterSession(s))}
          />
        )}
        {onglet === 'stats' && <Statistiques sessions={donnees.sessions} maintenant={maintenant} />}
        {onglet === 'reglages' && (
          <Reglages
            sb={sb}
            email={email}
            synchronise={depot.synchronise}
            donnees={donnees}
            surDeconnexion={surDeconnexion}
            surImporter={async () => {
              const locales = await depotLocal().charger();
              const closes = locales.sessions.filter((s) => s.fin !== null);
              if (closes.length + locales.constructions.length === 0) return setToast('Rien à importer sur cet appareil.');
              if (!confirm(`Importer ${closes.length} session(s) et ${locales.constructions.length} construction(s) de cet appareil vers ton compte ?`)) return;
              await agir(async () => {
                for (const s of closes) await depot.ajouterSession({ debut: s.debut, fin: s.fin, description: s.description, categorie: s.categorie, appareil: s.appareil });
                for (const c of locales.constructions) {
                  // Une case déjà prise dans le compte : on garde celle du compte.
                  await depot.construire(c).catch(() => undefined);
                }
              });
              setToast('Import terminé.');
            }}
          />
        )}
      </main>

      <nav className="onglets">
        {(
          [
            ['village', '🏡', 'Village'],
            ['historique', '📜', 'Historique'],
            ['stats', '📊', 'Stats'],
            ['reglages', '⚙️', 'Réglages'],
          ] as const
        ).map(([id, icone, nom]) => (
          <button key={id} className={onglet === id ? 'onglet actif' : 'onglet'} onClick={() => setOnglet(id)}>
            <span aria-hidden>{icone}</span>
            {nom}
          </button>
        ))}
      </nav>

      {finEnCours && enCours && (
        <DialogueFin
          session={enCours}
          categories={categories}
          surAnnuler={() => setFinEnCours(false)}
          surValider={(champs) => {
            setFinEnCours(false);
            const gain = pointsSession(dureeMinutes(enCours.debut, champs.fin));
            void agir(() => depot.terminer(enCours.id, champs)).then(() => setToast(gain > 0 ? `+${gain} points de concentration ✦` : 'Session enregistrée.'));
          }}
        />
      )}

      {selection && (
        <div className="voile" role="dialog" aria-modal="true" onClick={() => setSelection(null)}>
          <div className="fenetre" onClick={(e) => e.stopPropagation()}>
            <h2>{batiment(selection.batiment)?.nom ?? selection.batiment}</h2>
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

      {toast && <div className="toast">{toast}</div>}

      {mini.portail(
        <div className={enCours ? 'mini-chrono actif' : 'mini-chrono'}>
          <div className="mini-temps">{chrono}</div>
          <div className="mini-legende">{enCours ? enCours.categorie || 'Session' : 'Pas de session'}</div>
          {enCours ? (
            <button
              className="bouton petit arreter"
              onClick={() => {
                // La saisie de fin se fait dans la fenêtre principale, plus confortable.
                window.focus();
                setFinEnCours(true);
                setOnglet('village');
              }}
            >
              Terminer
            </button>
          ) : (
            <button className="bouton petit demarrer" onClick={() => void agir(() => depot.demarrer(''))}>
              Lancer
            </button>
          )}
        </div>,
      )}
    </div>
  );
}

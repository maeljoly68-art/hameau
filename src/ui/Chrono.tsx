import { useState } from 'react';
import { DUREES_PROPOSEES, prochainBonus, progression } from '../core/objectif.ts';
import { BLOC_MINUTES } from '../core/points.ts';
import { formatChrono, MINUTE_MS } from '../core/temps.ts';
import type { Session } from '../core/types.ts';
import { IconeLecture, IconePleinEcran, IconeStop } from './Icones.tsx';
import { useMaintenant } from './useHameau.ts';

export const CATEGORIES_PROPOSEES = ['Travail', 'Études', 'Projet perso', 'Lecture', 'Admin', 'Sport'];

/** Anneau de progression ; `graduations` marque les blocs de 25 minutes. */
export function Anneau({ ratio, taille, epaisseur, atteint, graduations = 0, children }: { ratio: number; taille: number; epaisseur: number; atteint?: boolean; graduations?: number; children?: React.ReactNode }) {
  const r = (taille - epaisseur) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="anneau" style={{ width: taille, height: taille }}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} aria-hidden>
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="var(--piste)" strokeWidth={epaisseur} />
        {/* Rien à 0 % : le bout arrondi d'un arc vide dessine sinon un point. */}
        {ratio > 0 && <circle
          cx={taille / 2}
          cy={taille / 2}
          r={r}
          fill="none"
          stroke={atteint ? 'var(--vert)' : 'var(--accent)'}
          strokeWidth={epaisseur}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.max(0, Math.min(1, ratio))} ${c}`}
          transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
          className="anneau-plein"
        />}
        {Array.from({ length: graduations }, (_, i) => {
          const a = (i / graduations) * 2 * Math.PI - Math.PI / 2;
          const x = taille / 2 + Math.cos(a) * r;
          const y = taille / 2 + Math.sin(a) * r;
          return <circle key={i} cx={x} cy={y} r={epaisseur / 5} fill="var(--fond)" opacity={0.6} />;
        })}
      </svg>
      <div className="anneau-centre">{children}</div>
    </div>
  );
}

/** Ce que l'anneau et les légendes affichent, pour une session donnée à un instant donné. */
export function etatChrono(s: Session, maintenant: number) {
  const ecouleMs = Math.max(0, maintenant - Date.parse(s.debut));
  const min = ecouleMs / MINUTE_MS;
  const p = progression(min, s.objectif);
  const bonus = prochainBonus(min);
  // Session libre : l'anneau suit le bloc de 25 min en cours, ce qui donne
  // un repère concret (« encore 7 min avant le bonus ») au lieu d'un cercle vide.
  const ratio = p ? p.ratio : (min % BLOC_MINUTES) / BLOC_MINUTES;
  let legende: string;
  if (p && !p.atteint) legende = `encore ${formatChrono(p.reste * MINUTE_MS)} avant l’objectif`;
  else if (p) legende = p.auDela >= 1 ? `objectif atteint · +${Math.floor(p.auDela)} min` : 'objectif atteint !';
  else legende = bonus === null ? 'plafond de 4 h atteint' : `bonus +5 dans ${Math.ceil(bonus)} min`;
  return { ecouleMs, ratio, atteint: p?.atteint ?? false, legende };
}

/** Dernier choix fait sur cet appareil (catégorie, durée), aussi pour les lancements rapides. */
export function lirePreference<T>(cle: string, defaut: T): T {
  try {
    const v = localStorage.getItem(cle);
    return v === null ? defaut : (JSON.parse(v) as T);
  } catch {
    return defaut;
  }
}
function ecrirePreference(cle: string, v: unknown) {
  try {
    localStorage.setItem(cle, JSON.stringify(v));
  } catch {
    // Préférence de confort : la perdre n'empêche rien.
  }
}

/** Le chrono principal : choix de la session au repos, anneau pendant. */
export function Chrono({
  enCours,
  categories,
  surDemarrer,
  surArreter,
  surFocus,
}: {
  enCours: Session | null;
  categories: string[];
  surDemarrer: (categorie: string, objectif: number | null) => void;
  surArreter: () => void;
  surFocus: () => void;
}) {
  // Le dernier choix est retenu sur l'appareil : on travaille souvent par
  // blocs de même durée, le redemander à chaque fois agace.
  const [categorie, setCategorie] = useState<string>(() => lirePreference('hameau.categorie', ''));
  const [objectif, setObjectif] = useState<number | null>(() => lirePreference('hameau.objectif', 50));

  if (enCours) return <ChronoActif session={enCours} surArreter={surArreter} surFocus={surFocus} />;

  return (
    <section className="carte chrono">
      <div className="chrono-repos">
        <div className="chrono-zero">0:00</div>
        <p className="aide">Prêt quand tu l’es.</p>
      </div>
      <div className="choix">
        <span className="choix-titre">Durée</span>
        <div className="puces" role="group" aria-label="Durée visée">
          {[null, ...DUREES_PROPOSEES].map((d) => (
            <button
              key={d ?? 'libre'}
              className={d === objectif ? 'puce choisie' : 'puce'}
              onClick={() => {
                setObjectif(d);
                ecrirePreference('hameau.objectif', d);
              }}
            >
              {d === null ? 'Libre' : `${d} min`}
            </button>
          ))}
        </div>
      </div>
      <div className="choix">
        <span className="choix-titre">Sur quoi</span>
        <div className="puces" role="group" aria-label="Catégorie">
          {categories.map((c) => (
            <button
              key={c}
              className={c === categorie ? 'puce choisie' : 'puce'}
              onClick={() => {
                const v = c === categorie ? '' : c;
                setCategorie(v);
                ecrirePreference('hameau.categorie', v);
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <button className="bouton gros demarrer" onClick={() => surDemarrer(categorie, objectif)}>
        <IconeLecture /> Lancer la session
      </button>
      <p className="raccourci-clavier">
        <kbd>Espace</kbd> pour lancer ou terminer
      </p>
    </section>
  );
}

function ChronoActif({ session, surArreter, surFocus }: { session: Session; surArreter: () => void; surFocus: () => void }) {
  const maintenant = useMaintenant(1000);
  const e = etatChrono(session, maintenant);
  return (
    <section className="carte chrono actif">
      <Anneau ratio={e.ratio} taille={236} epaisseur={12} atteint={e.atteint}>
        <div className="chrono-temps">{formatChrono(e.ecouleMs)}</div>
        <div className="chrono-legende">{e.legende}</div>
      </Anneau>
      <p className="chrono-sujet">
        <strong>{session.categorie || 'Session libre'}</strong>
        {session.objectif && <span> · objectif {session.objectif} min</span>}
        <span className="discret"> · lancée sur {session.appareil || 'un appareil'}</span>
      </p>
      <div className="actions centre">
        <button className="bouton gros arreter" onClick={surArreter}>
          <IconeStop /> Terminer
        </button>
        <button className="bouton icone discret" onClick={surFocus} aria-label="Mode focus plein écran" title="Mode focus (F)">
          <IconePleinEcran />
        </button>
      </div>
    </section>
  );
}

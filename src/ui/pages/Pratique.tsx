// La pratique quotidienne : l'artefact d'erreurs d'un cours (TOEIC, bientôt TAGE MAGE) à ouvrir CHAQUE jour, un
// minimum de minutes. Une carte à part, pas une séance du calendrier : c'est une habitude, avec sa série.
import { useMemo, type CSSProperties } from 'react';
import type { Cours, DonneesCours } from '../../core/cours.ts';
import { jourSemaine } from '../../core/jours.ts';
import { PRATIQUE_DEFAUT, categoriePratique, etatPratique, minutesParJour, pratiqueDue } from '../../core/pratique.ts';
import type { Session } from '../../core/types.ts';
import { ajouterPratique, supprimerPratique } from '../../data/cours.ts';
import { Anneau } from '../Chrono.tsx';
import { IconeCoche, IconeLien } from '../Icones.tsx';
import type { Faire } from './CoursDetail.tsx';

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;
const INITIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const minutes = (n: number) => `${n} min`;

function CartePratique({ cours, donnees, sessions, aujourdhui, faire, surChrono }: { cours: Cours; donnees: DonneesCours; sessions: readonly Session[]; aujourdhui: string; faire: Faire; surChrono: (categorie: string, minutes: number) => void }) {
  const cible = cours.pratiqueMin ?? PRATIQUE_DEFAUT;
  const libres = useMemo(() => new Set(donnees.disponibilites.libres), [donnees.disponibilites.libres]);
  const etat = useMemo(() => etatPratique({ cible, minutes: minutesParJour(cours.id, cours.titre, donnees.pratiques, sessions), aujourdhui, libres }), [cible, cours.id, cours.titre, donnees.pratiques, sessions, aujourdhui, libres]);
  const declarees = donnees.pratiques.filter((p) => p.coursId === cours.id && p.jour === aujourdhui);
  // Ce qu'il reste à faire, ou cinq minutes de plus quand le minimum est atteint.
  const aAjouter = etat.fait ? PRATIQUE_DEFAUT : etat.restantes;
  return (
    <section className={etat.fait ? 'carte pratique fait' : 'carte pratique'} style={teinte(cours.couleur)} aria-label={`Pratique quotidienne : ${cours.titre}`}>
      <div className="pratique-tete">
        <Anneau ratio={etat.faites / etat.cible} taille={72} epaisseur={8} atteint={etat.fait}>
          {etat.fait ? (
            <IconeCoche taille={26} />
          ) : (
            <span className="pratique-compte">
              {etat.faites}
              <small>/{etat.cible}</small>
            </span>
          )}
        </Anneau>
        <div className="pratique-titre">
          <span className="sur-titre pratique-etiquette">Pratique quotidienne</span>
          <strong>{cours.titre} · erreurs</strong>
          <span className="aide">
            {etat.fait ? `Fait aujourd’hui : ${minutes(etat.faites)} ✓` : `${minutes(etat.cible)} minimum, chaque jour · il reste ${minutes(etat.restantes)}`}
            {cours.partiel ? ` · jusqu’au partiel` : ''}
          </span>
        </div>
      </div>
      <div className="pratique-suivi">
        <ul className="pratique-semaine" aria-label="Les sept derniers jours">
          {etat.semaine.map((j) => (
            <li key={j.jour} className={j.fait ? 'point fait' : j.libre ? 'point libre' : j.jour === aujourdhui ? 'point aujourdhui' : 'point manque'} title={`${j.jour} : ${minutes(j.minutes)}${j.libre ? ' (jour libre)' : ''}`}>
              <span className="point-marque" aria-hidden />
              <small>{INITIALES[jourSemaine(j.jour)]}</small>
            </li>
          ))}
        </ul>
        <span className={etat.serie > 0 ? 'pratique-serie' : 'pratique-serie sans-serie'}>{etat.serie > 0 ? `Série de ${etat.serie} jour${etat.serie > 1 ? 's' : ''}` : 'Pas de série : commence aujourd’hui'}</span>
      </div>
      <div className="actions gauche pratique-actions">
        {cours.lien && (
          <a className="bouton petit" href={cours.lien} target="_blank" rel="noopener noreferrer">
            Ouvrir l’artefact d’erreurs <IconeLien />
          </a>
        )}
        <button className="bouton petit discret" onClick={() => surChrono(categoriePratique(cours.titre), etat.fait ? PRATIQUE_DEFAUT : etat.restantes)}>
          Lancer le chrono
        </button>
        {donnees.pratique && (
          <button className="bouton petit discret" onClick={() => faire(() => ajouterPratique(cours.id, aAjouter, aujourdhui), etat.fait ? `+${minutes(aAjouter)} notées.` : 'Pratique du jour notée.')}>
            {etat.fait ? `+ ${minutes(aAjouter)}` : `J’ai fait mes ${minutes(aAjouter)}`}
          </button>
        )}
      </div>
      {declarees.length > 0 && (
        <p className="aide petite pratique-declarees">
          Déclaré à la main aujourd’hui :{' '}
          {declarees.map((p) => (
            <button key={p.id} className="lien" onClick={() => faire(() => supprimerPratique(p.id), 'Retiré.')} aria-label={`Retirer ${minutes(p.minutes)} déclarées`}>
              {minutes(p.minutes)} ✕
            </button>
          ))}
        </p>
      )}
      {!cours.lien && <p className="aide petite">Ajoute l’adresse de l’artefact dans la page du cours pour l’ouvrir d’ici.</p>}
      <p className="aide petite">Le chrono compte tout seul ; hors chrono, déclare tes minutes. Le calendrier met ce temps de côté chaque jour.</p>
    </section>
  );
}

/** Une carte par cours dont la pratique est due aujourd'hui (rien si aucun cours n'en a). */
export function PratiqueDuJour({ donnees, sessions, aujourdhui, faire, surChrono }: { donnees: DonneesCours; sessions: readonly Session[]; aujourdhui: string; faire: Faire; surChrono: (categorie: string, minutes: number) => void }) {
  const dues = donnees.cours.filter((c) => pratiqueDue(c, aujourdhui));
  if (dues.length === 0) return null;
  return (
    <>
      {dues.map((c) => (
        <CartePratique key={c.id} cours={c} donnees={donnees} sessions={sessions} aujourdhui={aujourdhui} faire={faire} surChrono={surChrono} />
      ))}
    </>
  );
}

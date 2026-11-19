// La fin d'une séance passée dans la liseuse : « Croissance — pages 1 à 3, 3e passage ; pages 4 et 5, 1er passage »,
// et le planning validé tout seul. Les pages neuves passent pour lues ; les révisions du jour attendent une note (on
// ne se note pas à la place de la personne) — sans réponse, elles comptent seulement comme relues.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Chapitre, Cours } from '../core/cours.ts';
import { pagesVues, phraseLecture, planValidation, resumeLecture, fois, type CoursLu, type PlanValidation } from '../core/lecture.ts';
import { libellePages, numerosDePages } from '../core/pages.ts';
import type { Note } from '../core/revision.ts';
import { cleJour } from '../core/temps.ts';
import { chargerCours, marquerRelu, noterChapitres, validerLectureSuivie } from '../data/cours.ts';
import { lireLectures } from '../data/liseuse.ts';
import { FinApprentissage } from './FinApprentissage.tsx';
import { NotesRevision } from './pages/CoursDetail.tsx';
import type { ResultatRappel } from './RappelEcrit.tsx';
import * as suivi from './liseuse/suivi.ts';

export interface BilanSeance {
  sessionId: string;
  jour: string;
  resume: CoursLu[];
  plan: PlanValidation;
  cours: Cours[];
  chapitres: Chapitre[];
}

/**
 * Ce que la liseuse a compté pendant la séance (sur tous les appareils), et ce qu'il faut en faire. Null : aucune page
 * vue (séance sans liseuse, ou pages seulement survolées) — la fin de séance habituelle s'applique alors.
 */
export async function preparerBilan(sessionId: string): Promise<BilanSeance | null> {
  await suivi.vider();
  const [lectures, d] = await Promise.all([lireLectures(sessionId), chargerCours()]);
  const vues = pagesVues(lectures, d.chapitres);
  if (vues.length === 0) return null;
  const jour = cleJour(new Date());
  const ordre = d.cours.slice().sort((a, b) => a.ordre - b.ordre).map((c) => c.id);
  return { sessionId, jour, resume: resumeLecture(vues, d.chapitres, d.passages, jour, ordre), plan: planValidation(vues, d.chapitres, jour), cours: d.cours, chapitres: d.chapitres };
}

/** « Croissance : pages 1 à 3 (3e passage) » : la description de la séance quand on n'en écrit pas. */
export function descriptionLecture(b: BilanSeance): string {
  return b.resume
    .map((c) => {
      const titre = b.cours.find((x) => x.id === c.coursId)?.titre ?? 'Cours';
      return `${titre} : ${phraseLecture(c.groupes)}`;
    })
    .join(' · ');
}

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;
// Une séance ne se valide qu'une fois, même si la fenêtre est montée deux fois (mode strict, retour rapide).
const relusDeja = new Set<string>();

export function BilanLecture({ bilan, toast, surFermer }: { bilan: BilanSeance; toast: (texte: string) => void; surFermer: () => void }) {
  const { plan, jour } = bilan;
  const numeros = useMemo(() => numerosDePages(bilan.chapitres), [bilan.chapitres]);
  const [etape, setEtape] = useState<'nouvelles' | 'reviser' | 'fini'>(plan.nouvelles.length > 0 ? 'nouvelles' : plan.aNoter.length > 0 ? 'reviser' : 'fini');
  const [fait, setFait] = useState<string[]>([]);
  const restant = useRef({ nouvelles: plan.nouvelles.length > 0, reviser: plan.aNoter.length > 0 });

  // Les pages déjà lues et pas encore dues : comptées comme relues, sans rien demander.
  useEffect(() => {
    if (plan.relues.length === 0 || relusDeja.has(bilan.sessionId)) return;
    relusDeja.add(bilan.sessionId);
    marquerRelu(plan.relues, jour).catch(() => undefined);
  }, [bilan.sessionId, plan.relues, jour]);

  /** « pages 4 et 5 (Croissance), page 2 (Droit) » */
  const libelle = (ids: readonly string[]) => {
    const parCours = new Map<string, number[]>();
    for (const id of ids) {
      const c = bilan.chapitres.find((x) => x.id === id);
      if (c) parCours.set(c.coursId, [...(parCours.get(c.coursId) ?? []), numeros.get(id) ?? 0]);
    }
    const morceaux = [...parCours.entries()].map(([coursId, pages]) => {
      const titre = bilan.cours.find((x) => x.id === coursId)?.titre ?? '';
      return parCours.size > 1 ? `${libellePages(pages).toLowerCase()} (${titre})` : libellePages(pages).toLowerCase();
    });
    return morceaux.join(', ');
  };
  const parCoeur = (ids: readonly string[]) => ids.some((id) => bilan.chapitres.find((c) => c.id === id)?.parCoeur === true);

  const apres = (quoi: 'nouvelles' | 'reviser', message: string) => {
    restant.current[quoi] = false;
    setFait((f) => [...f, message]);
    setEtape(quoi === 'nouvelles' && restant.current.reviser ? 'reviser' : 'fini');
  };
  const lire = (rappel: { note: Note; r: ResultatRappel } | null) => {
    const ids = plan.nouvelles;
    apres('nouvelles', `${libelle(ids)} : lue${ids.length > 1 ? 's' : ''}, à apprendre par cœur demain.`);
    validerLectureSuivie(ids, jour, rappel ? { rappel: rappel.r.texte, note: rappel.note, confiance: rappel.r.confiance, erreur: rappel.r.erreur } : null).catch((e: unknown) => toast(e instanceof Error ? e.message : String(e)));
  };
  const noter = (note: Note, r: ResultatRappel | null) => {
    const ids = plan.aNoter;
    apres('reviser', `${libelle(ids)} : notée${ids.length > 1 ? 's' : ''}, le calendrier est recalculé.`);
    noterChapitres(ids, note, jour, r ? { rappel: r.texte, confiance: r.confiance, erreur: r.erreur } : {}).catch((e: unknown) => toast(e instanceof Error ? e.message : String(e)));
  };
  const plusTardRevision = () => {
    apres('reviser', `${libelle(plan.aNoter)} : comptée${plan.aNoter.length > 1 ? 's' : ''} comme relue${plan.aNoter.length > 1 ? 's' : ''} ; la révision reste à noter.`);
    marquerRelu(plan.aNoter, jour).catch(() => undefined);
  };

  // Fermer avant la fin : ce qui reste se valide quand même (sans note), c'était lu.
  const fermer = () => {
    if (restant.current.nouvelles) lire(null);
    if (restant.current.reviser) plusTardRevision();
    surFermer();
  };

  return (
    <div className="voile" role="dialog" aria-modal="true" aria-labelledby="titre-lu" onClick={fermer}>
      <div className="fenetre bilan-lecture" onClick={(e) => e.stopPropagation()}>
        <h2 id="titre-lu">Ce que tu as lu</h2>
        <ul className="lu-liste">
          {bilan.resume.map((c) => {
            const cours = bilan.cours.find((x) => x.id === c.coursId);
            return (
              <li key={c.coursId} className="lu-cours" style={teinte(cours?.couleur ?? 'var(--accent)')}>
                <strong>{cours?.titre ?? 'Cours'}</strong>
                {c.groupes.map((g) => (
                  <span key={g.pages.join('-')} className="lu-groupe">
                    {libellePages(g.pages)} <span className="lu-rang">{fois(g.rang)}</span>
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
        {fait.map((m) => (
          <p key={m} className="aide lu-fait">
            ✓ {m.charAt(0).toUpperCase() + m.slice(1)}
          </p>
        ))}
        {etape === 'nouvelles' && (
          <FinApprentissage
            titre={`${libelle(plan.nouvelles)}`}
            premiere
            parCoeur={parCoeur(plan.nouvelles)}
            erreurPossible={plan.nouvelles.length === 1}
            surNote={(note, r) => lire({ note, r })}
            surPlusTard={() => lire(null)}
          />
        )}
        {etape === 'reviser' &&
          (plan.aApprendre.length > 0 ? (
            <FinApprentissage titre={libelle(plan.aNoter)} premiere={false} parCoeur={parCoeur(plan.aNoter)} erreurPossible={plan.aNoter.length === 1} surNote={(note, r) => noter(note, r)} surPlusTard={plusTardRevision} />
          ) : (
            <>
              <p className="aide">
                Révision du jour : <strong>{libelle(plan.aNoter)}</strong>. Ferme la page, récite de tête, puis note-toi.
              </p>
              <NotesRevision surNote={(n) => noter(n, null)} />
              <div className="actions">
                <button className="bouton discret" onClick={plusTardRevision}>
                  Plus tard
                </button>
              </div>
            </>
          ))}
        {etape === 'fini' && (
          <>
            {fait.length === 0 && <p className="aide">C’est noté : ces pages étaient déjà à jour dans ton planning.</p>}
            <div className="actions">
              <button className="bouton" onClick={fermer} autoFocus>
                Terminer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

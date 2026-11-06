// L'emploi du temps de l'université dans l'onglet Cours : les créneaux d'un jour, le réglage du lien,
// et, sur la page d'un cours, ses mots-clés et la date de partiel que l'emploi du temps laisse deviner.
import { useState, type CSSProperties } from 'react';
import { LIBELLE_TYPE, MOTIFS_MAX, partielProbable, plageHeures, prochainCreneau, salleCourte, type Creneau } from '../../core/agenda.ts';
import { lienValide, type Cours, type Disponibilites } from '../../core/cours.ts';
import { jourCourt } from '../../core/jours.ts';
import { capaciteDuJour } from '../../core/planning.ts';
import { formatDuree } from '../../core/temps.ts';
import { ecrireCacheAgenda, recupererAgenda } from '../../data/agenda.ts';
import { modifierCours } from '../../data/cours.ts';
import type { Faire } from './CoursDetail.tsx';

const teinte = (c: string) => ({ '--teinte': c }) as CSSProperties;

/** Les créneaux d'un jour ou d'un cours. `couleurDe` : la teinte du cours de Hameau auquel un créneau appartient, ou null s'il n'en a pas. */
export function ListeCreneaux({ creneaux, couleurDe }: { creneaux: readonly Creneau[]; couleurDe: (c: Creneau) => string | null }) {
  if (creneaux.length === 0) return null;
  return (
    <ul className="creneaux" aria-label="Cours de l’emploi du temps">
      {creneaux.map((c) => {
        const couleur = couleurDe(c);
        const salle = salleCourte(c.lieu);
        return (
          <li key={c.id} className={couleur ? 'creneau lie' : 'creneau'} style={couleur ? teinte(couleur) : undefined}>
            <span className="creneau-heure">{c.journee ? 'Journée' : plageHeures(c)}</span>
            <span className="creneau-corps">
              <strong>{c.titre}</strong>
              {salle && <span className="aide">{salle}</span>}
            </span>
            {LIBELLE_TYPE[c.type] && <span className="creneau-type">{LIBELLE_TYPE[c.type]}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** « 8 h de cours : temps de révision ramené de 1 h à 30 min » — pour qu'une journée légère ne paraisse pas un oubli. */
export function NoteCharge({ jour, minutesDeCours, disponibilites }: { jour: string; minutesDeCours: number; disponibilites: Disponibilites }) {
  if (minutesDeCours <= 0) return null;
  const base = capaciteDuJour(disponibilites, jour, 0);
  const reduite = capaciteDuJour(disponibilites, jour, minutesDeCours);
  return (
    <p className="aide petite">
      {formatDuree(minutesDeCours)} de cours{reduite < base ? ` : temps de révision ramené de ${formatDuree(base)} à ${formatDuree(reduite)}.` : '.'}
    </p>
  );
}

function hote(lien: string): string {
  try {
    return new URL(lien).host;
  } catch {
    return 'emploi du temps';
  }
}

const heureLocale = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Brancher, relire ou retirer le lien. L'adresse n'est jamais réaffichée : elle donne accès à l'emploi du temps de quelqu'un. */
export function ReglageAgenda({
  integre = false,
  userId,
  lien,
  nombre,
  majLe,
  erreur,
  enCours,
  surBrancher,
  surRetirer,
  surActualiser,
}: {
  /** Dans un volet déjà titré : ni carte ni titre. */
  integre?: boolean;
  userId: string;
  lien: string | null;
  nombre: number | null;
  majLe: number | null;
  erreur: string | null;
  enCours: boolean;
  surBrancher: (lien: string, nombre: number) => void;
  surRetirer: () => void;
  surActualiser: () => void;
}) {
  const [saisie, setSaisie] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  return (
    <section className={integre ? 'agenda-reglage' : 'carte'}>
      {!integre && <h2>Emploi du temps</h2>}
      {lien ? (
        <>
          <p>
            Branché sur <strong>{hote(lien)}</strong>
            {nombre !== null && <> · {nombre} créneaux</>}
            {majLe !== null && <> · lu le {heureLocale(majLe)}</>}
          </p>
          {erreur && <p className="alerte douce">{erreur}</p>}
          <div className="actions">
            <button className="bouton petit" onClick={surActualiser} disabled={enCours}>
              {enCours ? 'Lecture…' : 'Actualiser'}
            </button>
            <button
              className="lien danger-lien"
              onClick={() => {
                if (confirm('Retirer l’emploi du temps ? Le calendrier d’étude ne tiendra plus compte de tes cours.')) surRetirer();
              }}
            >
              Retirer le lien
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const l = lienValide(saisie);
            if (!l) return setMessage('L’adresse doit commencer par https://');
            setOccupe(true);
            setMessage(null);
            // On lit le fichier AVANT d'enregistrer le lien : une adresse fausse ne s'installe pas.
            void recupererAgenda(l)
              .then((lu) => {
                ecrireCacheAgenda(userId, l, lu.creneaux, Date.now());
                surBrancher(l, lu.creneaux.length);
                setSaisie('');
              })
              .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Lecture impossible.'))
              .finally(() => setOccupe(false));
          }}
        >
          <p className="aide">Colle le lien d’export (.ics) de « Mon emploi du temps » de ton université. Le calendrier d’étude saura quand tu es en cours, quels jours sont chargés, et devinera la date de chaque partiel.</p>
          <input type="url" inputMode="url" autoComplete="off" spellCheck={false} value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="https://…/export" aria-label="Lien de l’emploi du temps" />
          {message && <p className="alerte douce">{message}</p>}
          <button className="bouton" disabled={occupe || !saisie.trim()}>
            {occupe ? 'Lecture…' : 'Brancher'}
          </button>
        </form>
      )}
      <p className="aide petite">Ce lien est un secret : quiconque le connaît lit ton emploi du temps. Il reste dans ton compte Hameau, et ton navigateur lit le fichier directement chez l’université — rien ne passe par un autre serveur.</p>
    </section>
  );
}

const jourEtHeure = (c: Creneau) => `${jourCourt(c.jour)}, ${plageHeures(c)}`;

/** Sur la page d'un cours : ce que l'emploi du temps en dit, les mots qui le retrouvent, et la date de partiel qu'il laisse deviner. */
export function BlocAgendaCours({ cours, creneaux, aujourdhui, faire }: { cours: Cours; creneaux: readonly Creneau[]; aujourdhui: string; faire: Faire }) {
  const [motifs, setMotifs] = useState(cours.motifs);
  const probable = partielProbable(creneaux, aujourdhui);
  const prochain = prochainCreneau(creneaux, aujourdhui);
  const compte = (t: Creneau['type']) => creneaux.filter((c) => c.type === t).length;
  const detail = (['cm', 'td', 'tp', 'sae'] as const)
    .filter((t) => compte(t) > 0)
    .map((t) => `${compte(t)} ${LIBELLE_TYPE[t]}`)
    .join(' · ');
  return (
    <section className="carte">
      <h2>Emploi du temps</h2>
      {creneaux.length === 0 ? (
        <p className="aide">Aucun créneau ne correspond à ces mots. Dans l’emploi du temps, ce cours porte peut-être un autre intitulé : essaie un mot qu’on y lit (« finance », « droit spécial »…).</p>
      ) : (
        <p className="aide">
          {creneaux.length} créneaux trouvés{detail ? ` (${detail})` : ''}
          {prochain ? ` · prochain : ${jourEtHeure(prochain)}` : ' · aucun à venir'}.
        </p>
      )}
      {probable &&
        (probable.jour === cours.partiel ? (
          <p className="ag-partiel ok" style={teinte(cours.couleur)}>
            ✓ L’emploi du temps confirme le partiel : <strong>{jourEtHeure(probable)}</strong>
            {salleCourte(probable.lieu) && <> · {salleCourte(probable.lieu)}</>}
          </p>
        ) : (
          <div className="ag-partiel" style={teinte(cours.couleur)}>
            <p>
              Partiel probable d’après l’emploi du temps (dernier cours magistral) : <strong>{jourEtHeure(probable)}</strong>
              {salleCourte(probable.lieu) && <> · {salleCourte(probable.lieu)}</>}.
            </p>
            <button className="bouton petit" onClick={() => faire(() => modifierCours(cours.id, { partiel: probable.jour }), 'Date du partiel enregistrée.')}>
              Utiliser cette date
            </button>
          </div>
        ))}
      <form
        className="ligne-formulaire large"
        onSubmit={(e) => {
          e.preventDefault();
          const v = motifs.trim().slice(0, MOTIFS_MAX);
          if (v !== cours.motifs) faire(() => modifierCours(cours.id, { motifs: v }), 'Mots de l’emploi du temps enregistrés.');
        }}
      >
        <input value={motifs} maxLength={MOTIFS_MAX} onChange={(e) => setMotifs(e.target.value)} placeholder={`Mots de l’emploi du temps (par défaut : « ${cours.titre} »)`} aria-label="Mots qui retrouvent ce cours dans l’emploi du temps" />
        <button className="bouton petit discret" disabled={motifs.trim() === cours.motifs}>
          Enregistrer
        </button>
      </form>
      <p className="aide petite">Sépare les mots par des virgules : un créneau est rattaché à ce cours quand son intitulé les contient en mots entiers.</p>
    </section>
  );
}

// Le calendrier d'étude : quoi travailler quand, d'après où l'on en est dans
// chaque chapitre, le cycle de révision et la date de chaque partiel. Pur.
//
// Ce n'est PAS un plan stocké : il se recalcule à chaque ouverture, depuis
// l'état réel des chapitres. Un plan gardé en base finirait par ne plus
// correspondre à ce qu'on a vraiment fait (deux sources de vérité).
import type { Chapitre, Cours, Disponibilites } from './cours.ts';
import { MINUTES_JOUR_MAX } from './cours.ts';
import { ajouterJours, ecartJours, estJour, jourSemaine } from './jours.ts';
import { ECART_JOURS, NIVEAU_MAX, niveauValide } from './revision.ts';

export type TypeSeance = 'decouverte' | 'revision' | 'consolidation';

export interface Seance {
  jour: string;
  coursId: string;
  chapitreId: string;
  type: TypeSeance;
  minutes: number;
  /** Pourquoi ce chapitre ce jour-là, en une phrase. */
  raison: string;
  /** Suite d'une lecture commencée un autre jour : le chapitre ne tenait pas dans une seule séance. */
  suite: boolean;
}

export type Alerte =
  /** Le temps disponible ne suffit pas : `minutes` manquent pour tout voir et tout revoir avant ce partiel. */
  | { type: 'surcharge'; coursId: string; minutes: number }
  /** Pas de date de partiel : le cours n'a pas d'échéance, donc pas d'urgence. */
  | { type: 'sans-date'; coursId: string }
  | { type: 'partiel-passe'; coursId: string };

export interface Plan {
  seances: Seance[];
  alertes: Alerte[];
}

export interface EntreePlan {
  cours: readonly Cours[];
  chapitres: readonly Chapitre[];
  disponibilites: Disponibilites;
  /** « AAAA-MM-JJ » : l'horloge n'est jamais lue ici. */
  aujourdhui: string;
}

/** Aucune lecture nouvelle dans les derniers jours : on consolide, on n'apprend plus. */
export const JOURS_SANS_NOUVEAU = 3;
/** Chaque chapitre a un dernier passage dans cette fenêtre qui précède le partiel. */
export const FENETRE_FINALE = 4;
/** Une révision dure ce rapport de la première lecture, sans descendre sous REVISION_MIN. */
export const RATIO_REVISION = 0.4;
export const REVISION_MIN = 10;
/** En dessous, un créneau ne vaut pas qu'on s'y installe. */
export const CRENEAU_MIN = 10;
/** Les cours sans date : on regarde quatre semaines devant, pas plus. */
export const HORIZON_SANS_DATE = 28;
const HORIZON_MAX = 180;

export function dureeRevision(c: Pick<Chapitre, 'dureeMin'>): number {
  return Math.max(REVISION_MIN, Math.round((c.dureeMin * RATIO_REVISION) / 5) * 5);
}

interface Suivi {
  ch: Chapitre;
  niveau: number;
  /** Jour à partir duquel on le revoit ; null tant qu'il n'est pas vu. */
  prochaine: string | null;
  /** Minutes de première lecture qu'il reste à faire (0 s'il est déjà vu). */
  restant: number;
  /** Il a déjà eu son dernier passage dans la fenêtre d'avant le partiel. */
  dernierFait: boolean;
  /** Dernier jour où on l'a travaillé : jamais deux séances le même jour. */
  vuLe: string | null;
}

export function planifier(entree: EntreePlan): Plan {
  const { cours, chapitres, disponibilites, aujourdhui } = entree;
  const seances: Seance[] = [];
  const alertes: Alerte[] = [];
  const libres = new Set(disponibilites.libres);
  const capacite = (jour: string) => (libres.has(jour) ? 0 : Math.max(0, Math.min(MINUTES_JOUR_MAX, disponibilites.semaine[jourSemaine(jour)] ?? 0)));

  // Seuls comptent les cours dont le partiel est à venir (ou sans date).
  const actifs = cours
    .filter((c) => {
      if (c.partiel !== null && !estJour(c.partiel)) return false;
      if (c.partiel !== null && ecartJours(aujourdhui, c.partiel) < 0) {
        alertes.push({ type: 'partiel-passe', coursId: c.id });
        return false;
      }
      // Le jour même du partiel, il n'y a plus rien à planifier.
      if (c.partiel !== null && ecartJours(aujourdhui, c.partiel) === 0) return false;
      if (c.partiel === null) alertes.push({ type: 'sans-date', coursId: c.id });
      return true;
    })
    .slice()
    .sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id));

  const parCours = new Map<string, Suivi[]>();
  for (const c of actifs) {
    const suivis = chapitres
      .filter((ch) => ch.coursId === c.id)
      .slice()
      .sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id))
      .map((ch): Suivi => {
        const niveau = niveauValide(ch.niveau);
        const debutFenetre = c.partiel === null ? null : ajouterJours(c.partiel, -FENETRE_FINALE);
        return {
          ch,
          niveau,
          prochaine: niveau >= 1 ? (ch.prochaine && estJour(ch.prochaine) ? ch.prochaine : aujourdhui) : null,
          restant: niveau === 0 ? Math.max(5, ch.dureeMin) : 0,
          // Déjà passé en revue dans la fenêtre finale, pour de vrai : pas besoin de le refaire.
          dernierFait: debutFenetre !== null && niveau >= 1 && ch.derniere !== null && estJour(ch.derniere) && ecartJours(debutFenetre, ch.derniere) >= 0,
          vuLe: ch.derniere !== null && estJour(ch.derniere) ? ch.derniere : null,
        };
      });
    parCours.set(c.id, suivis);
  }

  const dates = actifs.flatMap((c) => (c.partiel ? [c.partiel] : []));
  const dernierPartiel = dates.reduce((a, b) => (ecartJours(a, b) > 0 ? b : a), aujourdhui);
  const horizon = Math.min(HORIZON_MAX, Math.max(ecartJours(aujourdhui, dernierPartiel), actifs.some((c) => c.partiel === null) ? HORIZON_SANS_DATE : 0));
  const fin = ajouterJours(aujourdhui, horizon);
  // La plus longue journée possible : un chapitre plus long qu'elle ne tiendra jamais d'un coup.
  let capaMax = 0;
  for (let j = aujourdhui; ecartJours(j, fin) >= 0; j = ajouterJours(j, 1)) capaMax = Math.max(capaMax, capacite(j));

  /**
   * À quel point la lecture des chapitres neufs presse : le rapport entre ce
   * qui reste à lire et le temps qu'il reste pour le faire (40 % partira en
   * révisions). Au-delà de 1, on ne peut plus tout lire : la lecture passe
   * devant les révisions peu urgentes.
   */
  const pression = (c: Cours, jour: string): number => {
    if (c.partiel === null) return 1;
    const aLire = parCours.get(c.id)!.reduce((t, s) => t + s.restant, 0);
    if (aLire === 0) return 1;
    const limite = ajouterJours(c.partiel, -(JOURS_SANS_NOUVEAU + 1));
    let dispo = 0;
    for (let j = jour; ecartJours(j, limite) >= 0; j = ajouterJours(j, 1)) dispo += capacite(j);
    return Math.min(3, 1 + aLire / Math.max(1, dispo * 0.6));
  };

  interface Choix {
    score: number;
    cours: Cours;
    suivi: Suivi;
    type: TypeSeance;
    retard: number;
    avant: number | null;
  }

  const meilleur = (jour: string, reste: number): Choix | null => {
    let best: Choix | null = null;
    const comparer = (a: Choix, b: Choix) => {
      if (a.score !== b.score) return a.score - b.score;
      // À égalité : le partiel le plus proche, puis l'ordre des cours et des chapitres.
      const ea = a.cours.partiel === null ? Infinity : ecartJours(jour, a.cours.partiel);
      const eb = b.cours.partiel === null ? Infinity : ecartJours(jour, b.cours.partiel);
      if (ea !== eb) return eb - ea;
      if (a.cours.ordre !== b.cours.ordre) return b.cours.ordre - a.cours.ordre;
      return b.suivi.ch.ordre - a.suivi.ch.ordre;
    };
    for (const c of actifs) {
      const avant = c.partiel === null ? null : ecartJours(jour, c.partiel);
      if (avant !== null && avant <= 0) continue;
      // Plus le partiel est proche, plus tout ce qui s'y rapporte presse.
      const urgence = avant === null ? 1 : 1 + 10 / avant;
      let premierNeuf = true;
      for (const s of parCours.get(c.id)!) {
        if (s.vuLe === jour) continue;
        let candidat: Choix | null = null;
        if (s.niveau === 0) {
          // Les chapitres neufs se lisent dans l'ordre : seul le premier est proposé.
          if (!premierNeuf) continue;
          premierNeuf = false;
          if (avant !== null && avant <= JOURS_SANS_NOUVEAU) continue;
          const presse = pression(c, jour);
          // Un chapitre qui ne tient pas dans ce qui reste de la journée n'est pas coupé : lire la moitié
          // d'une fiche aujourd'hui et le reste demain ne vaut pas une lecture entière un autre jour.
          // On ne le coupe que s'il ne tiendra dans aucune journée, ou si le temps presse vraiment.
          if (s.restant > reste && s.restant <= capaMax && presse < 1.5) continue;
          candidat = { score: urgence * 1.6 * presse, cours: c, suivi: s, type: 'decouverte', retard: 0, avant };
        } else {
          let echeance = s.prochaine ?? jour;
          // Un dernier passage est dû dès l'entrée dans la fenêtre finale, même si le cycle dirait « plus tard ».
          if (c.partiel !== null && !s.dernierFait) {
            const debut = ajouterJours(c.partiel, -FENETRE_FINALE);
            if (ecartJours(debut, echeance) > 0) echeance = debut;
          }
          if (ecartJours(echeance, jour) < 0) continue;
          const retard = ecartJours(echeance, jour);
          const final = avant !== null && avant <= FENETRE_FINALE && !s.dernierFait;
          candidat = final
            ? { score: urgence * (4 + (NIVEAU_MAX - s.niveau) * 0.3 + retard), cours: c, suivi: s, type: 'consolidation', retard, avant }
            : { score: urgence * (2 + retard), cours: c, suivi: s, type: 'revision', retard, avant };
        }
        if (best === null || comparer(candidat, best) > 0) best = candidat;
      }
    }
    return best;
  };

  for (let jour = aujourdhui; ecartJours(jour, fin) >= 0; jour = ajouterJours(jour, 1)) {
    let reste = capacite(jour);
    while (reste >= CRENEAU_MIN) {
      const choix = meilleur(jour, reste);
      if (!choix) break;
      const { cours: c, suivi: s, type, retard, avant } = choix;
      const dejaCommence = s.restant < Math.max(5, s.ch.dureeMin);
      const minutes = type === 'decouverte' ? Math.min(s.restant, reste) : Math.min(dureeRevision(s.ch), reste);
      let raison: string;
      if (type === 'decouverte') raison = dejaCommence ? 'Suite de la lecture' : avant === null ? 'À découvrir' : `À découvrir avant le partiel (dans ${avant} j)`;
      else if (type === 'consolidation') raison = 'Dernier passage avant le partiel';
      else raison = retard > 0 ? `En retard de ${retard} j` : `Révision espacée (niveau ${s.niveau})`;
      seances.push({ jour, coursId: c.id, chapitreId: s.ch.id, type, minutes, raison, suite: type === 'decouverte' && dejaCommence });
      reste -= minutes;
      s.vuLe = jour;
      if (type === 'decouverte') {
        s.restant -= minutes;
        if (s.restant <= 0) {
          s.restant = 0;
          s.niveau = 1;
          s.prochaine = ajouterJours(jour, ECART_JOURS[1]);
        }
      } else {
        // La note à venir est inconnue : on suppose « bien », le cas médian.
        s.niveau = Math.min(NIVEAU_MAX, s.niveau + 1);
        s.prochaine = ajouterJours(jour, ECART_JOURS[s.niveau]);
        if (avant !== null && avant <= FENETRE_FINALE) s.dernierFait = true;
      }
    }
  }

  for (const c of actifs) {
    if (c.partiel === null) continue;
    let manque = 0;
    for (const s of parCours.get(c.id)!) {
      if (s.niveau === 0) manque += s.restant;
      else if (!s.dernierFait) manque += dureeRevision(s.ch);
    }
    if (manque > 0) alertes.push({ type: 'surcharge', coursId: c.id, minutes: manque });
  }

  return { seances, alertes };
}

export function seancesDuJour(plan: Plan, jour: string): Seance[] {
  return plan.seances.filter((s) => s.jour === jour);
}

/** Pour le calendrier : minutes prévues par jour, et les cours concernés (dans l'ordre d'apparition). */
export function resumeParJour(plan: Plan): Map<string, { minutes: number; cours: string[] }> {
  const m = new Map<string, { minutes: number; cours: string[] }>();
  for (const s of plan.seances) {
    const j = m.get(s.jour) ?? { minutes: 0, cours: [] };
    j.minutes += s.minutes;
    if (!j.cours.includes(s.coursId)) j.cours.push(s.coursId);
    m.set(s.jour, j);
  }
  return m;
}

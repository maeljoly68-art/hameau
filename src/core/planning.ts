// Le calendrier d'étude : quoi travailler quand, d'après où l'on en est dans
// chaque chapitre, le cycle de révision et la date de chaque partiel. Pur.
//
// Ce n'est PAS un plan stocké : il se recalcule à chaque ouverture, depuis
// l'état réel des chapitres. Un plan gardé en base finirait par ne plus
// correspondre à ce qu'on a vraiment fait (deux sources de vérité).
import type { Chapitre, Cours, Disponibilites } from './cours.ts';
import { MINUTES_JOUR_MAX, REDUCTION_DEFAUT, REDUCTION_MAX, RELECTURE_MAX, vitesseValide } from './cours.ts';
import { ajouterJours, ecartJours, estJour, jourSemaine } from './jours.ts';
import { apresPratique, minutesReservees, type ReservePratique } from './pratique.ts';
import { NIVEAU_MAX, ecartsPour, niveauValide } from './revision.ts';

/**
 * `relecture` : un passage sans note sur un chapitre déjà vu des cours les plus proches de leur partiel, les jours
 * de cours (voir `Disponibilites.relecture`). Il ne touche pas au cycle : seul un passage noté le fait avancer.
 * `examen` : un examen blanc, en conditions, dans les deux semaines qui précèdent le partiel.
 */
export type TypeSeance = 'decouverte' | 'revision' | 'consolidation' | 'relecture' | 'examen';

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
  /**
   * La séance finit le chapitre. Faux pour une lecture coupée (le reste vient un autre jour) : la cocher ne
   * doit pas faire passer le chapitre pour lu.
   */
  complete: boolean;
  /** Jours de retard sur l'échéance du cycle (0 : à l'heure, ou séance sans échéance). */
  retard: number;
  /** La page est fragile (plusieurs notes basses de suite) : le calendrier la revoit en priorité. */
  fragile: boolean;
  /** Le cran de la page AVANT cette séance (0 : jamais lue). Une révision au cran 1 est le premier retour : « apprendre par cœur ». */
  niveau: number;
  /** La page est à savoir mot pour mot : son cycle est resserré et ses révisions passent par un rappel de tête. */
  parCoeur: boolean;
}

export type Alerte =
  /** Le temps disponible ne suffit pas : `minutes` manquent pour tout voir et tout revoir avant ce partiel. */
  | { type: 'surcharge'; coursId: string; minutes: number }
  /** Pas de date de partiel : le cours n'a pas d'échéance, donc pas d'urgence. */
  | { type: 'sans-date'; coursId: string }
  | { type: 'partiel-passe'; coursId: string }
  /** Le cours n'a pas commencé et n'a pas de partiel : il n'est pas planifié avant le mois qui précède son premier cours. */
  | { type: 'pas-commence'; coursId: string; debut: string };

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
  /** Minutes de cours de chaque jour (emploi du temps) : un jour chargé laisse moins de temps de révision. Absent : on ne sait rien des cours. */
  charge?: ReadonlyMap<string, number>;
  /** Premier jour de cours de chaque matière (par identifiant), quand l'emploi du temps le dit. */
  debuts?: ReadonlyMap<string, string>;
  /** Les pages fragiles (voir passages.ts) : à urgence égale, leurs révisions passent devant les autres. */
  fragiles?: ReadonlySet<string>;
  /** Durée de l'épreuve de chaque matière en minutes, d'après l'emploi du temps : celle d'un examen blanc. */
  examens?: ReadonlyMap<string, number>;
  /** Les matières qui ont eu leur examen blanc récemment : pas besoin d'un autre. */
  examensFaits?: ReadonlySet<string>;
  /** Part de rappel écrit dans une première séance (voir `PART_RAPPEL_PREMIERE`, la valeur par défaut). */
  partRappel?: number;
  /**
   * Les pratiques quotidiennes dues (voir pratique.ts) : leurs minutes sont retirées de chaque journée où elles sont
   * dues, avant de placer les pages. Un jour sans temps (libre) reste sans temps.
   */
  reserves?: readonly ReservePratique[];
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
/** Un cours sans partiel se prépare le mois qui précède son premier cours, pas avant. */
export const JOURS_AVANT_DEBUT = 28;
/** Jusqu'à 4 h de cours dans la journée, le temps de révision ne bouge pas ; à 8 h, il est réduit au maximum. */
export const SEUIL_COURS = 240;
export const PLEIN_COURS = 480;
/** Une page fragile passe devant : son score de révision est multiplié par ce coefficient. */
export const FRAGILE_COEF = 1.5;
/** Un examen blanc se place entre 14 et 4 jours avant le partiel : assez tôt pour corriger, assez tard pour être prêt. */
export const EXAMEN_FENETRE_DEBUT = 14;
export const EXAMEN_FENETRE_FIN = 4;
/** Sans l'emploi du temps pour le dire, une épreuve dure 1 h 30. En dessous de 45 min, ce n'est plus un examen blanc. */
export const EXAMEN_DUREE_DEFAUT = 90;
export const EXAMEN_MIN = 45;

/** Les pages qui servent d'examen blanc : sujets, TD, exercices (« TD1 corrigé », « E2 · Pareto », « Exercices corrigés »). */
export const estPageExamen = (titre: string): boolean => /\b(td\d*|exercices?|examens?|sujets?)\b/i.test(titre) || /^e\d+\s*·/i.test(titre);

/** Un chapitre n'est relu (sans note) que s'il n'a pas été touché depuis au moins ce nombre de jours : relire hier puis aujourd'hui n'apprend rien de plus. */
export const RELECTURE_ECART_MIN = 2;

/**
 * Minutes de révision possibles ce jour-là. Après huit heures de cours on n'a plus
 * l'énergie que dit le réglage de la semaine : de 4 h à 8 h de cours, on retire de
 * plus en plus de temps (progressivement, pour qu'une demi-heure de plus ne fasse
 * pas tomber la journée), jusqu'à `reduction` % ; arrondi aux 5 minutes.
 */
export function capaciteDuJour(d: Disponibilites, jour: string, minutesDeCours = 0, libres: ReadonlySet<string> = new Set(d.libres)): number {
  if (libres.has(jour)) return 0;
  const base = Math.max(0, Math.min(MINUTES_JOUR_MAX, d.semaine[jourSemaine(jour)] ?? 0));
  const part = Math.min(1, Math.max(0, (minutesDeCours - SEUIL_COURS) / (PLEIN_COURS - SEUIL_COURS)));
  const reduction = Math.min(REDUCTION_MAX, Math.max(0, d.reduction ?? REDUCTION_DEFAUT)) / 100;
  // Sans réduction à appliquer, le réglage de la personne est rendu tel quel (47 min restent 47 min).
  if (part === 0 || reduction === 0) return base;
  return Math.round((base * (1 - reduction * part)) / 5) * 5;
}

/**
 * Une première séance ne se termine pas à la dernière ligne lue : on ferme la fiche et on écrit de mémoire ce
 * qu'on a retenu (c'est là que ça s'apprend, pas dans la lecture). Ce rappel prend ce rapport du temps de lecture.
 */
export const PART_RAPPEL_PREMIERE = 0.3;

/**
 * Minutes pour apprendre un chapitre la première fois, à TA vitesse : la lecture (estimation tirée de la taille
 * des pages) puis le rappel écrit qui la suit, le tout multiplié par `vitesse` (1 = l'estimation telle quelle,
 * 1,3 = tu mets 30 % de plus). Arrondie à la minute.
 */
export function dureeLecture(c: Pick<Chapitre, 'dureeMin'>, vitesse = 1, partRappel = PART_RAPPEL_PREMIERE): number {
  return Math.max(5, Math.round(c.dureeMin * (1 + partRappel) * vitesseValide(vitesse)));
}

export function dureeRevision(c: Pick<Chapitre, 'dureeMin'>, vitesse = 1): number {
  return Math.max(REVISION_MIN, Math.round((c.dureeMin * vitesseValide(vitesse) * RATIO_REVISION) / 5) * 5);
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
  /** Son échelle de révision : l'ordinaire, ou la resserrée (mot pour mot). */
  parCoeur: boolean;
}

export function planifier(entree: EntreePlan): Plan {
  const { cours, chapitres, disponibilites, aujourdhui, charge, debuts } = entree;
  const fragiles = entree.fragiles ?? new Set<string>();
  const seances: Seance[] = [];
  const alertes: Alerte[] = [];
  const libres = new Set(disponibilites.libres);
  const reserves = entree.reserves ?? [];
  const capacite = (jour: string) => apresPratique(capaciteDuJour(disponibilites, jour, charge?.get(jour) ?? 0, libres), minutesReservees(reserves, jour));
  const vitesse = vitesseValide(disponibilites.vitesse);
  const partRappel = Number.isFinite(entree.partRappel) ? Math.max(0, entree.partRappel as number) : PART_RAPPEL_PREMIERE;
  const lecture = (ch: Pick<Chapitre, 'dureeMin'>) => dureeLecture(ch, vitesse, partRappel);
  // Ce qui est déjà fait aujourd'hui compte sur le temps d'aujourd'hui. Sans cela, valider une séance libérerait
  // du temps et une autre apparaîtrait à sa place : la journée ne finirait jamais. Le plan n'étant pas stocké, on
  // estime à partir des chapitres travaillés aujourd'hui : une première lecture (cran 1) coûte sa durée de
  // lecture, tout autre passage (révision, relecture) une durée de révision.
  const minutesFaites = chapitres.reduce((t, ch) => (ch.derniere === aujourdhui ? t + (niveauValide(ch.niveau) === 1 ? lecture(ch) : dureeRevision(ch, vitesse)) : t), 0);
  const relecture = typeof disponibilites.relecture === 'number' && Number.isFinite(disponibilites.relecture) ? Math.min(RELECTURE_MAX, Math.max(0, Math.round(disponibilites.relecture))) : 0;

  // Seuls comptent les cours dont le partiel est à venir (ou sans date).
  const actifs = cours
    .filter((c) => {
      // Un cours en pause reste dans la liste mais n'a ni séance ni alerte : on ne le travaille pas, on ne s'en inquiète pas.
      if (c.enPause) return false;
      if (c.partiel !== null && !estJour(c.partiel)) return false;
      if (c.partiel !== null && ecartJours(aujourdhui, c.partiel) < 0) {
        alertes.push({ type: 'partiel-passe', coursId: c.id });
        return false;
      }
      // Le jour même du partiel, il n'y a plus rien à planifier.
      if (c.partiel !== null && ecartJours(aujourdhui, c.partiel) === 0) return false;
      // Pas de partiel et pas encore de cours : rien à réviser maintenant, sauf si on a déjà lu un de ses chapitres
      // (on le prépare en avance, et c'est bien).
      const debut = debuts?.get(c.id);
      if (c.partiel === null && debut !== undefined && ecartJours(aujourdhui, debut) > JOURS_AVANT_DEBUT && !chapitres.some((ch) => ch.coursId === c.id && niveauValide(ch.niveau) >= 1)) {
        alertes.push({ type: 'pas-commence', coursId: c.id, debut });
        return false;
      }
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
          restant: niveau === 0 ? lecture(ch) : 0,
          // Déjà passé en revue dans la fenêtre finale, pour de vrai : pas besoin de le refaire.
          dernierFait: debutFenetre !== null && niveau >= 1 && ch.derniere !== null && estJour(ch.derniere) && ecartJours(debutFenetre, ch.derniere) >= 0,
          vuLe: ch.derniere !== null && estJour(ch.derniere) ? ch.derniere : null,
          parCoeur: ch.parCoeur === true,
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

  /** Jour à partir duquel un chapitre vu est dû : son échéance du cycle, ramenée au début de la fenêtre finale s'il n'a pas eu son dernier passage. */
  const echeanceDe = (c: Cours, s: Suivi, jour: string): string => {
    let echeance = s.prochaine ?? jour;
    // Un dernier passage est dû dès l'entrée dans la fenêtre finale, même si le cycle dirait « plus tard ».
    if (c.partiel !== null && !s.dernierFait) {
      const debut = ajouterJours(c.partiel, -FENETRE_FINALE);
      if (ecartJours(debut, echeance) > 0) echeance = debut;
    }
    return echeance;
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
          const echeance = echeanceDe(c, s, jour);
          if (ecartJours(echeance, jour) < 0) continue;
          const retard = ecartJours(echeance, jour);
          const final = avant !== null && avant <= FENETRE_FINALE && !s.dernierFait;
          const coef = fragiles.has(s.ch.id) ? FRAGILE_COEF : 1;
          candidat = final
            ? { score: urgence * (4 + (NIVEAU_MAX - s.niveau) * 0.3 + retard) * coef, cours: c, suivi: s, type: 'consolidation', retard, avant }
            : { score: urgence * (2 + retard) * coef, cours: c, suivi: s, type: 'revision', retard, avant };
        }
        if (best === null || comparer(candidat, best) > 0) best = candidat;
      }
    }
    return best;
  };

  // Un examen blanc par matière, entre 14 et 4 jours avant son partiel : le jour qui laisse le plus de temps (le
  // week-end, en pratique), et le plus tard possible. Deux matières ne se partagent pas un jour. Ce qui est déjà fait
  // aujourd'hui est retiré du temps d'aujourd'hui, comme pour le reste du calendrier.
  const examensDuJour = new Map<string, { cours: Cours; page: Chapitre; minutes: number }>();
  const parPartiel = actifs.filter((c) => c.partiel !== null && !entree.examensFaits?.has(c.id)).sort((a, b) => a.partiel!.localeCompare(b.partiel!) || a.ordre - b.ordre || a.id.localeCompare(b.id));
  for (const c of parPartiel) {
    const pages = chapitres.filter((h) => h.coursId === c.id && estPageExamen(h.titre));
    if (pages.length === 0) continue;
    const debut = ajouterJours(c.partiel!, -EXAMEN_FENETRE_DEBUT);
    const dernier = ajouterJours(c.partiel!, -EXAMEN_FENETRE_FIN);
    let choisi: string | null = null;
    let libre = 0;
    for (let j = ecartJours(aujourdhui, debut) > 0 ? debut : aujourdhui; ecartJours(j, dernier) >= 0; j = ajouterJours(j, 1)) {
      if (examensDuJour.has(j)) continue;
      const cap = capacite(j) - (j === aujourdhui ? minutesFaites : 0);
      if (cap < EXAMEN_MIN) continue;
      // Les jours défilent du plus tôt au plus tard : à temps libre égal, c'est le plus tardif qui reste.
      if (choisi === null || cap >= libre) {
        choisi = j;
        libre = cap;
      }
    }
    if (choisi === null) continue;
    // On refait la page qu'on a le moins vue : un sujet jamais travaillé est le meilleur test.
    const page = pages.slice().sort((a, b) => (a.derniere ?? '').localeCompare(b.derniere ?? '') || a.ordre - b.ordre || a.id.localeCompare(b.id))[0];
    examensDuJour.set(choisi, { cours: c, page, minutes: entree.examens?.get(c.id) ?? EXAMEN_DUREE_DEFAUT });
  }

  /**
   * Les chapitres à relire ce jour-là, du plus important au moins important : le partiel le plus proche d'abord,
   * puis ce qui n'a pas été touché depuis le plus longtemps (pour que la relecture fasse le tour au lieu de
   * reprendre toujours les mêmes), puis le moins su. Jamais un chapitre que le cycle demande ce jour-là — c'est
   * la révision, notée, qui le prend — ni un chapitre touché la veille ou le jour même.
   */
  const aRelire = (jour: string) => {
    const liste: { s: Suivi; c: Cours; avant: number | null }[] = [];
    for (const c of actifs) {
      const avant = c.partiel === null ? null : ecartJours(jour, c.partiel);
      if (avant !== null && avant <= 0) continue;
      for (const s of parCours.get(c.id)!) {
        if (s.niveau < 1) continue;
        if (s.vuLe !== null && ecartJours(s.vuLe, jour) < RELECTURE_ECART_MIN) continue;
        if (ecartJours(echeanceDe(c, s, jour), jour) >= 0) continue;
        liste.push({ s, c, avant });
      }
    }
    return liste.sort((a, b) => {
      const ea = a.avant ?? Infinity;
      const eb = b.avant ?? Infinity;
      if (ea !== eb) return ea < eb ? -1 : 1;
      const va = a.s.vuLe ?? '';
      const vb = b.s.vuLe ?? '';
      if (va !== vb) return va < vb ? -1 : 1;
      return a.s.niveau - b.s.niveau || a.c.ordre - b.c.ordre || a.s.ch.ordre - b.s.ch.ordre || a.s.ch.id.localeCompare(b.s.ch.id);
    });
  };

  for (let jour = aujourdhui; ecartJours(jour, fin) >= 0; jour = ajouterJours(jour, 1)) {
    const faites = jour === aujourdhui ? minutesFaites : 0;
    // Négatif si on a déjà fait plus que le temps du jour : il n'y a alors plus rien à planifier aujourd'hui.
    let reste = capacite(jour) - faites;
    // L'examen blanc d'abord : c'est lui qui a choisi ce jour-là.
    const examen = examensDuJour.get(jour);
    if (examen) {
      const minutes = Math.min(examen.minutes, reste);
      const suiviExamen = parCours.get(examen.cours.id)!.find((x) => x.ch.id === examen.page.id);
      seances.push({ jour, coursId: examen.cours.id, chapitreId: examen.page.id, type: 'examen', minutes, raison: `Examen blanc · partiel dans ${ecartJours(jour, examen.cours.partiel!)} j`, suite: false, complete: true, retard: 0, fragile: false, niveau: suiviExamen?.niveau ?? 0, parCoeur: suiviExamen?.parCoeur ?? false });
      reste -= minutes;
      if (suiviExamen) suiviExamen.vuLe = jour;
    }
    // Les jours de cours, un bloc de relecture passe AVANT toute lecture neuve. Ce qu'il ne remplit pas
    // (rien à relire encore) retourne à la journée : le bloc est réservé, pas perdu. Une fois la journée
    // commencée (quelque chose de fait), il n'est plus proposé : il ne revient pas après chaque validation.
    if (relecture > 0 && reste > 0 && faites === 0 && (charge?.get(jour) ?? 0) > 0) {
      let budget = Math.min(relecture, reste);
      for (const { s, c, avant } of aRelire(jour)) {
        const minutes = Math.min(dureeRevision(s.ch, vitesse), budget);
        if (minutes < CRENEAU_MIN) break;
        seances.push({ jour, coursId: c.id, chapitreId: s.ch.id, type: 'relecture', minutes, raison: avant === null ? 'Relecture' : `Relecture avant le partiel (dans ${avant} j)`, suite: false, complete: true, retard: 0, fragile: fragiles.has(s.ch.id), niveau: s.niveau, parCoeur: s.parCoeur });
        s.vuLe = jour;
        reste -= minutes;
        budget -= minutes;
        if (budget < CRENEAU_MIN) break;
      }
    }
    while (reste >= CRENEAU_MIN) {
      const choix = meilleur(jour, reste);
      if (!choix) break;
      const { cours: c, suivi: s, type, retard, avant } = choix;
      const dejaCommence = s.restant < lecture(s.ch);
      const minutes = type === 'decouverte' ? Math.min(s.restant, reste) : Math.min(dureeRevision(s.ch, vitesse), reste);
      let raison: string;
      if (type === 'decouverte') raison = dejaCommence ? 'Suite de la lecture' : avant === null ? 'À découvrir' : `À découvrir avant le partiel (dans ${avant} j)`;
      else if (type === 'consolidation') raison = 'Dernier passage avant le partiel';
      else raison = retard > 0 ? `En retard de ${retard} j` : `Révision espacée (niveau ${s.niveau})`;
      seances.push({ jour, coursId: c.id, chapitreId: s.ch.id, type, minutes, raison, suite: type === 'decouverte' && dejaCommence, complete: type !== 'decouverte' || minutes >= s.restant, retard, fragile: fragiles.has(s.ch.id), niveau: s.niveau, parCoeur: s.parCoeur });
      reste -= minutes;
      s.vuLe = jour;
      if (type === 'decouverte') {
        s.restant -= minutes;
        if (s.restant <= 0) {
          s.restant = 0;
          s.niveau = 1;
          s.prochaine = ajouterJours(jour, ecartsPour(s.parCoeur)[1]);
        }
      } else {
        // La note à venir est inconnue : on suppose « bien », le cas médian.
        s.niveau = Math.min(NIVEAU_MAX, s.niveau + 1);
        s.prochaine = ajouterJours(jour, ecartsPour(s.parCoeur)[s.niveau]);
        if (avant !== null && avant <= FENETRE_FINALE) s.dernierFait = true;
      }
    }
  }

  for (const c of actifs) {
    if (c.partiel === null) continue;
    let manque = 0;
    for (const s of parCours.get(c.id)!) {
      if (s.niveau === 0) manque += s.restant;
      else if (!s.dernierFait) manque += dureeRevision(s.ch, vitesse);
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

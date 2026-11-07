// Le rappel du jour : quelques pages, de cours différents, qu'on se rappelle de tête avant d'ouvrir la fiche. Pur.
//
// Relire donne l'impression de savoir ; se rappeler sans regarder dit si on sait. Mais le faire pour chaque page
// de chaque révision coûterait trop cher : le rappel est une dose par jour (quelques pages, de cours mélangés —
// c'est aussi l'entrelacement), prise parmi les révisions déjà au calendrier. Les autres se notent d'un geste.
import { RAPPEL_DEFAUT, RAPPEL_MAX, type Chapitre, type Cours } from './cours.ts';
import { ecartJours } from './jours.ts';
import { etapeDe } from './pages.ts';
import { SEUIL_COURS, type Seance } from './planning.ts';

/** Une page se rappelle en quelques minutes : de quoi tenir « 3 pages en 5 minutes » les jours chargés. */
export const BONUS_MINUTES = 3;
/** Nombre de pages du rappel du jour, par défaut (réglable de 0 à RAPPEL_MAX ; 0 : pas de rappel) : voir cours.ts. */
export { RAPPEL_DEFAUT, RAPPEL_MAX };

export interface ItemRappel {
  coursId: string;
  chapitreId: string;
  /** Page pas encore due : le rappel ne fait pas monter son cran (voir `apresRappelAnticipe`). */
  bonus: boolean;
  fragile: boolean;
  /** Dernier passage avant le partiel. */
  consolidation: boolean;
  /**
   * Premier retour d'une page (ou page « mot pour mot » encore en apprentissage) : c'est là qu'on l'apprend, en se
   * forçant à la redire par écrit. Ces pages-là ne sont pas laissées à la dose du jour : elles y passent toutes.
   */
  obligatoire: boolean;
  retard: number;
  minutes: number;
  raison: string;
}

export interface Rappel {
  items: ItemRappel[];
  /** Les séances du jour qui ne sont pas dans le rappel : elles restent des blocs ordinaires. */
  restantes: Seance[];
  minutes: number;
}

export interface EntreeRappel {
  /** Les séances d'AUJOURD'HUI. */
  seances: readonly Seance[];
  chapitres: readonly Chapitre[];
  cours: readonly Cours[];
  fragiles: ReadonlySet<string>;
  aujourdhui: string;
  max: number;
  /** Les rappels déjà faits aujourd'hui : ils comptent dans la dose du jour, sinon en finir un en ferait apparaître un autre. */
  dejaFaits: number;
  /** Minutes de cours aujourd'hui, d'après l'emploi du temps. */
  chargeJour: number;
}

/** Un item après l'autre, un cours après l'autre : les cours se mélangent plutôt que de s'enchaîner. */
function entrelacer(parCours: Map<string, ItemRappel[]>, max: number, dejaPris: number): ItemRappel[] {
  const files = [...parCours.values()].filter((f) => f.length > 0);
  const pris: ItemRappel[] = [];
  while (dejaPris + pris.length < max && files.some((f) => f.length > 0)) {
    for (const f of files) {
      if (dejaPris + pris.length >= max) break;
      const item = f.shift();
      if (item) pris.push(item);
    }
  }
  return pris;
}

export function construireRappel(e: EntreeRappel): Rappel {
  const ordreCours = new Map(e.cours.map((c) => [c.id, c.ordre]));
  const pages = new Map(e.chapitres.map((c) => [c.id, c]));
  const ordreDe = (id: string) => pages.get(id)?.ordre ?? 0;
  const niveauDe = (id: string) => pages.get(id)?.niveau ?? 0;
  const dose = Number.isFinite(e.max) ? Math.max(0, Math.min(RAPPEL_MAX, Math.floor(e.max))) : 0;
  const max = Math.max(0, dose - (Number.isFinite(e.dejaFaits) ? Math.max(0, Math.floor(e.dejaFaits)) : 0));
  // Dose à zéro : le rappel est coupé (ou le journal manque), les blocs prennent tout — et exigent eux aussi l'écrit.
  if (dose === 0) return { items: [], restantes: [...e.seances], minutes: 0 };

  // 1. Les révisions du jour : les pages fragiles d'abord, puis le dernier passage, puis le plus en retard, puis le moins su.
  const dues: ItemRappel[] = e.seances
    .filter((s) => s.type === 'revision' || s.type === 'consolidation')
    .map((s) => ({ coursId: s.coursId, chapitreId: s.chapitreId, bonus: false, fragile: e.fragiles.has(s.chapitreId), consolidation: s.type === 'consolidation', obligatoire: etapeDe(s.type, s.niveau, s.parCoeur) === 'apprendre', retard: s.retard, minutes: s.minutes, raison: s.raison }));
  const plusUrgent = (a: ItemRappel, b: ItemRappel) =>
    Number(b.fragile) - Number(a.fragile) ||
    Number(b.consolidation) - Number(a.consolidation) ||
    b.retard - a.retard ||
    niveauDe(a.chapitreId) - niveauDe(b.chapitreId) ||
    (ordreCours.get(a.coursId) ?? 0) - (ordreCours.get(b.coursId) ?? 0) ||
    ordreDe(a.chapitreId) - ordreDe(b.chapitreId) ||
    a.chapitreId.localeCompare(b.chapitreId);
  dues.sort(plusUrgent);
  const enFiles = (liste: readonly ItemRappel[]) => {
    const parCours = new Map<string, ItemRappel[]>();
    for (const it of liste) parCours.set(it.coursId, [...(parCours.get(it.coursId) ?? []), it]);
    return parCours;
  };
  // Les pages à apprendre passent toutes (cours mélangés) ; la dose du jour ne sert qu'à compléter. En finir une
  // en laisse une de moins à apprendre et une de plus de faite : le total ne bouge pas (pas de tapis roulant).
  const items = entrelacer(enFiles(dues.filter((i) => i.obligatoire)), Number.POSITIVE_INFINITY, 0);
  items.push(...entrelacer(enFiles(dues.filter((i) => !i.obligatoire)), Math.max(0, max - items.length), 0));

  // 2. Un jour chargé en cours : s'il reste de la place (`entrelacer` s'arrête au nombre voulu), des pages fragiles
  // qui ne sont pas dues — mieux que rien.
  if (e.chargeJour >= SEUIL_COURS) {
    const dejaLa = new Set(e.seances.map((s) => s.chapitreId));
    const actifs = new Map(e.cours.filter((c) => !c.enPause && (c.partiel === null || ecartJours(e.aujourdhui, c.partiel) > 0)).map((c) => [c.id, c]));
    const bonus = e.chapitres
      .filter((c) => e.fragiles.has(c.id) && c.niveau >= 1 && c.derniere !== e.aujourdhui && !dejaLa.has(c.id) && actifs.has(c.coursId))
      .sort((a, b) => a.niveau - b.niveau || (a.derniere ?? '').localeCompare(b.derniere ?? '') || (ordreCours.get(a.coursId) ?? 0) - (ordreCours.get(b.coursId) ?? 0) || a.ordre - b.ordre || a.id.localeCompare(b.id))
      .map((c): ItemRappel => ({ coursId: c.coursId, chapitreId: c.id, bonus: true, fragile: true, consolidation: false, obligatoire: false, retard: 0, minutes: BONUS_MINUTES, raison: 'Micro-révision d’une page fragile' }));
    items.push(...entrelacer(enFiles(bonus), max, items.length));
  }

  const pris = new Set(items.map((i) => i.chapitreId));
  return { items, restantes: e.seances.filter((s) => !pris.has(s.chapitreId)), minutes: items.reduce((t, i) => t + i.minutes, 0) };
}

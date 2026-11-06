// L'emploi du temps de l'université : lecture du flux iCalendar (.ics), rattachement
// des créneaux à chaque cours, et ce qu'on peut en déduire pour le calendrier d'étude.
// Pur : ni réseau, ni horloge (le jour courant est toujours passé en argument).
import { ajouterJours, ecartJours, estJour } from './jours.ts';

export type TypeCreneau = 'cm' | 'td' | 'tp' | 'sae' | 'autre';

export interface Creneau {
  /** UID du flux, suffixé « #n » quand un créneau est coupé à minuit. */
  id: string;
  /** « AAAA-MM-JJ », en heure de l'université. */
  jour: string;
  /** Minutes depuis minuit. */
  debut: number;
  fin: number;
  titre: string;
  lieu: string;
  type: TypeCreneau;
  /** Journée entière (férié, vacances) : ça n'occupe pas le temps de cours. */
  journee: boolean;
}

export interface LectureAgenda {
  creneaux: Creneau[];
  /** Événements illisibles (date absente ou invalide) ou au-delà du plafond, laissés de côté. */
  ignores: number;
  /** Événements à répétition : seule leur première occurrence est lue. */
  recurrents: number;
}

/** Un emploi du temps se lit en heure de Strasbourg, quel que soit le fuseau de l'appareil. */
export const FUSEAU_FAC = 'Europe/Paris';
export const MAX_CRENEAUX = 4000;
/** Au-delà, on ne devine pas une date de partiel : l'emploi du temps n'est pas encore publié. */
export const HORIZON_PARTIEL = 120;
/** Longueur maximale du champ « mots de l'emploi du temps » d'un cours (la base impose la même). */
export const MOTIFS_MAX = 300;
const MOTIF_MAX = 60;
const MOTIFS_PAR_COURS = 10;
const JOURS_MAX_PAR_EVENEMENT = 31;
const HEURE_MS = 3_600_000;

export const LIBELLE_TYPE: Record<TypeCreneau, string> = { cm: 'CM', td: 'TD', tp: 'TP', sae: 'SAÉ', autre: '' };

// ── Fuseaux horaires ────────────────────────────────────────────────────────

const formateurs = new Map<string, Intl.DateTimeFormat | null>();

function formateur(zone: string): Intl.DateTimeFormat | null {
  if (formateurs.has(zone)) return formateurs.get(zone)!;
  let f: Intl.DateTimeFormat | null = null;
  try {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    // Fuseau inconnu : on retombera sur celui de l'université.
  }
  formateurs.set(zone, f);
  return f;
}

interface Murale {
  a: number;
  m: number;
  j: number;
  h: number;
  mi: number;
  s: number;
}

/** L'heure qu'il est sur les murs de `zone` à l'instant `ms`. */
function murale(ms: number, zone: string): Murale {
  const f = formateur(zone) ?? formateur(FUSEAU_FAC)!;
  const v: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') v[p.type] = Number(p.value);
  return { a: v.year, m: v.month, j: v.day, h: v.hour % 24, mi: v.minute, s: v.second };
}

const decalage = (ms: number, zone: string): number => {
  const w = murale(ms, zone);
  return Date.UTC(w.a, w.m - 1, w.j, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
};

/** L'instant où les murs de `zone` marquent cette heure. Deux passes : le décalage change au changement d'heure. */
function instantMurale(w: Murale, zone: string): number {
  const naif = Date.UTC(w.a, w.m - 1, w.j, w.h, w.mi, w.s);
  const premier = naif - decalage(naif, zone);
  return naif - decalage(premier, zone);
}

const deuxChiffres = (n: number) => String(n).padStart(2, '0');
const jourDe = (w: Murale) => `${w.a}-${deuxChiffres(w.m)}-${deuxChiffres(w.j)}`;

// ── Lecture du fichier .ics ─────────────────────────────────────────────────

interface Propriete {
  params: Map<string, string>;
  valeur: string;
}

/** « NOM;PARAM=x:valeur » → le nom, ses paramètres et la valeur. Les guillemets protègent un « : » ou un « ; ». */
function lireLigne(ligne: string): { nom: string; prop: Propriete } | null {
  let guillemets = false;
  let fin = -1;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') guillemets = !guillemets;
    else if (c === ':' && !guillemets) {
      fin = i;
      break;
    }
  }
  if (fin <= 0) return null;
  const tete = ligne.slice(0, fin);
  const morceaux: string[] = [];
  let debut = 0;
  guillemets = false;
  for (let i = 0; i < tete.length; i++) {
    const c = tete[i];
    if (c === '"') guillemets = !guillemets;
    else if (c === ';' && !guillemets) {
      morceaux.push(tete.slice(debut, i));
      debut = i + 1;
    }
  }
  morceaux.push(tete.slice(debut));
  const params = new Map<string, string>();
  for (const m of morceaux.slice(1)) {
    const eg = m.indexOf('=');
    if (eg > 0) params.set(m.slice(0, eg).trim().toUpperCase(), m.slice(eg + 1).trim().replace(/^"|"$/g, ''));
  }
  return { nom: morceaux[0].trim().toUpperCase(), prop: { params, valeur: ligne.slice(fin + 1) } };
}

type DateLue = { type: 'journee'; jour: string } | { type: 'instant'; ms: number };

function lireDate(p: Propriete): DateLue | null {
  const v = p.valeur.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) {
    const jour = `${m[1]}-${m[2]}-${m[3]}`;
    return estJour(jour) ? { type: 'journee', jour } : null;
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m || !estJour(`${m[1]}-${m[2]}-${m[3]}`)) return null;
  const w: Murale = { a: Number(m[1]), m: Number(m[2]), j: Number(m[3]), h: Number(m[4]), mi: Number(m[5]), s: Number(m[6]) };
  if (w.h > 23 || w.mi > 59 || w.s > 60) return null;
  if (m[7] === 'Z') return { type: 'instant', ms: Date.UTC(w.a, w.m - 1, w.j, w.h, w.mi, w.s) };
  // Heure « locale » : celle de son fuseau s'il est nommé (un fuseau inconnu retombe sur celui de l'université, voir murale), sinon celle de l'université.
  return { type: 'instant', ms: instantMurale(w, p.params.get('TZID') ?? FUSEAU_FAC) };
}

/** Texte du fichier → texte lisible : `\,` `\;` `\\` retrouvent leur sens, un retour à la ligne devient une espace. */
const texteLu = (v: string) => v.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? ' ' : c));
const nettoyer = (s: string, max: number) => s.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** L'événement, jour par jour : un créneau qui passe minuit est coupé en deux. */
function decouper(debutMs: number, finMs: number): { jour: string; debut: number; fin: number }[] {
  const d = murale(debutMs, FUSEAU_FAC);
  const f = murale(finMs, FUSEAU_FAC);
  const j0 = jourDe(d);
  const j1 = jourDe(f);
  const m0 = d.h * 60 + d.mi;
  const m1 = f.h * 60 + f.mi;
  if (j0 === j1) return [{ jour: j0, debut: m0, fin: Math.max(m1, m0 + 1) }];
  const morceaux = [{ jour: j0, debut: m0, fin: 1440 }];
  let j = ajouterJours(j0, 1);
  for (let n = 1; n < JOURS_MAX_PAR_EVENEMENT && ecartJours(j, j1) > 0; n++, j = ajouterJours(j, 1)) morceaux.push({ jour: j, debut: 0, fin: 1440 });
  if (m1 > 0) morceaux.push({ jour: j1, debut: 0, fin: m1 });
  return morceaux;
}

/** `null` : ce n'est pas un calendrier (une page de connexion renvoyée à la place, par exemple). */
export function lireICalendrier(texte: string): LectureAgenda | null {
  // `\s` couvre aussi la marque d'ordre des octets (U+FEFF) que certains exports placent en tête.
  if (!/^\s*BEGIN:VCALENDAR/i.test(texte)) return null;
  // Les lignes longues sont repliées : une ligne qui commence par une espace ou une tabulation continue la précédente.
  const lignes = texte.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);

  const evenements: Map<string, Propriete>[] = [];
  let courant: Map<string, Propriete> | null = null;
  let imbrique = 0; // une alarme dans l'événement a ses propres DESCRIPTION, qui ne sont pas les siennes
  for (const ligne of lignes) {
    const l = lireLigne(ligne);
    if (!l) continue;
    if (l.nom === 'BEGIN') {
      if (courant) imbrique++;
      else if (l.prop.valeur.trim().toUpperCase() === 'VEVENT') courant = new Map();
    } else if (l.nom === 'END') {
      if (courant && imbrique > 0) imbrique--;
      else if (courant && l.prop.valeur.trim().toUpperCase() === 'VEVENT') {
        evenements.push(courant);
        courant = null;
      }
    } else if (courant && imbrique === 0 && !courant.has(l.nom)) {
      courant.set(l.nom, l.prop);
    }
  }

  const creneaux: Creneau[] = [];
  const vus = new Set<string>();
  let ignores = 0;
  let recurrents = 0;
  evenements.forEach((e, numero) => {
    if (e.get('STATUS')?.valeur.trim().toUpperCase() === 'CANCELLED') return;
    const dtstart = e.get('DTSTART');
    const debut = dtstart ? lireDate(dtstart) : null;
    if (!debut) {
      ignores++;
      return;
    }
    if (e.has('RRULE')) recurrents++;
    const uid = (e.get('UID')?.valeur ?? '').trim().slice(0, 120) || `evt-${numero}`;
    const titre = nettoyer(texteLu(e.get('SUMMARY')?.valeur ?? ''), 120) || 'Sans titre';
    const lieu = nettoyer(texteLu(e.get('LOCATION')?.valeur ?? ''), 240);
    const type = typeDeCreneau(titre);
    const dtend = e.get('DTEND');
    const fin = dtend ? lireDate(dtend) : null;
    const ajouter = (c: Omit<Creneau, 'id'>, i: number) => {
      const id = i === 0 ? uid : `${uid}#${i}`;
      if (!vus.has(id)) {
        vus.add(id);
        creneaux.push({ id, ...c });
      }
    };
    if (debut.type === 'journee') {
      // La fin d'un événement « journée » est exclusive : du 24 au 27, ce sont les jours 24, 25 et 26.
      const exclu = fin?.type === 'journee' ? fin.jour : ajouterJours(debut.jour, 1);
      let i = 0;
      for (let j = debut.jour; ecartJours(j, exclu) > 0 && i < JOURS_MAX_PAR_EVENEMENT; j = ajouterJours(j, 1), i++) ajouter({ jour: j, debut: 0, fin: 1440, titre, lieu, type, journee: true }, i);
      return;
    }
    let finMs = fin?.type === 'instant' ? fin.ms : debut.ms + HEURE_MS;
    // Une fin avant le début (ou sans durée) n'a pas de sens : une heure, faute de mieux.
    if (finMs <= debut.ms) finMs = debut.ms + HEURE_MS;
    decouper(debut.ms, finMs).forEach((m, i) => ajouter({ jour: m.jour, debut: m.debut, fin: m.fin, titre, lieu, type, journee: false }, i));
  });

  creneaux.sort(chrono);
  if (creneaux.length > MAX_CRENEAUX) {
    ignores += creneaux.length - MAX_CRENEAUX;
    creneaux.length = MAX_CRENEAUX;
  }
  return { creneaux, ignores, recurrents };
}

/** Ce qu'on a relu dans le cache de l'appareil : seul ce qui est bien formé est gardé. */
export function creneauxValides(brut: unknown): Creneau[] {
  if (!Array.isArray(brut)) return [];
  const types: readonly string[] = ['cm', 'td', 'tp', 'sae', 'autre'];
  const r: Creneau[] = [];
  for (const x of brut.slice(0, MAX_CRENEAUX)) {
    if (!x || typeof x !== 'object') continue;
    const c = x as Record<string, unknown>;
    if (typeof c.id !== 'string' || !estJour(c.jour) || typeof c.titre !== 'string' || typeof c.lieu !== 'string' || typeof c.type !== 'string' || !types.includes(c.type)) continue;
    if (typeof c.debut !== 'number' || typeof c.fin !== 'number' || !Number.isInteger(c.debut) || !Number.isInteger(c.fin) || c.debut < 0 || c.fin > 1440 || c.fin <= c.debut) continue;
    r.push({ id: c.id.slice(0, 130), jour: c.jour, debut: c.debut, fin: c.fin, titre: c.titre.slice(0, 120), lieu: c.lieu.slice(0, 240), type: c.type as TypeCreneau, journee: c.journee === true });
  }
  return r;
}

// ── Reconnaître un créneau ──────────────────────────────────────────────────

const chrono = (a: Creneau, b: Creneau) => (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : a.debut - b.debut || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Minuscules, sans accents ni ponctuation : « Économie  industrielle » et « economie-industrielle » se valent. */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** CM, TD, TP ou SAÉ d'après l'intitulé (« Finance TD3 », « SAE droit des sociétés TD3 », « AnglaisTP5 »). */
export function typeDeCreneau(titre: string): TypeCreneau {
  const mots = normaliser(titre).split(' ');
  if (mots.includes('sae')) return 'sae';
  if (mots.includes('cm')) return 'cm';
  if (mots.some((m) => /^td\d*$/.test(m) || /[a-z]td\d+$/.test(m))) return 'td';
  if (mots.some((m) => /^tp\d*$/.test(m) || /[a-z]tp\d+$/.test(m))) return 'tp';
  return 'autre';
}

/** « Droit spécial des sociétés, SAE droit des sociétés » → les mots à retrouver dans un intitulé. */
export function motifsDe(texte: string): string[] {
  const vus = new Set<string>();
  for (const brut of texte.split(/[,;\n]/)) {
    const m = normaliser(brut).slice(0, MOTIF_MAX).trim();
    if (m) vus.add(m);
    if (vus.size >= MOTIFS_PAR_COURS) break;
  }
  return [...vus];
}

export interface CoursPourAgenda {
  id: string;
  titre: string;
  motifs: string;
  ordre: number;
}

/**
 * Les créneaux de chaque cours. Un intitulé se rattache au cours dont les mots
 * le retrouvent EN MOTS ENTIERS (« finance » ne prend pas « financement »), le
 * plus précis l'emporte, puis l'ordre des cours. Sans mots réglés, le nom du
 * cours sert de mot. Les journées entières n'appartiennent à aucun cours.
 */
export function rattacher(creneaux: readonly Creneau[], cours: readonly CoursPourAgenda[]): Map<string, Creneau[]> {
  const regles = cours.map((c) => {
    const m = motifsDe(c.motifs);
    return { c, motifs: m.length > 0 ? m : [normaliser(c.titre)].filter(Boolean) };
  });
  const r = new Map<string, Creneau[]>(cours.map((c) => [c.id, []]));
  for (const cr of creneaux) {
    if (cr.journee) continue;
    const titre = ` ${normaliser(cr.titre)} `;
    let meilleur: { id: string; ordre: number; taille: number } | null = null;
    for (const { c, motifs } of regles) {
      for (const m of motifs) {
        if (!titre.includes(` ${m} `)) continue;
        const mieux = !meilleur || m.length > meilleur.taille || (m.length === meilleur.taille && (c.ordre < meilleur.ordre || (c.ordre === meilleur.ordre && c.id < meilleur.id)));
        if (mieux) meilleur = { id: c.id, ordre: c.ordre, taille: m.length };
      }
    }
    if (meilleur) r.get(meilleur.id)!.push(cr);
  }
  // Quel que soit l'ordre reçu, chaque cours rend ses créneaux dans l'ordre du temps.
  for (const liste of r.values()) liste.sort(chrono);
  return r;
}

// ── Ce que l'emploi du temps apprend au calendrier d'étude ──────────────────

/**
 * Minutes de cours par jour. Les créneaux qui se chevauchent comptent une fois
 * (deux groupes dans la même salle ne font pas quatre heures), et une journée
 * entière (férié) n'est pas une journée de cours.
 */
export function chargeParJour(creneaux: readonly Creneau[]): Map<string, number> {
  const parJour = new Map<string, [number, number][]>();
  for (const c of creneaux) {
    if (c.journee) continue;
    const l = parJour.get(c.jour) ?? [];
    l.push([c.debut, c.fin]);
    parJour.set(c.jour, l);
  }
  const r = new Map<string, number>();
  for (const [jour, plages] of parJour) {
    plages.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let total = 0;
    let [d, f] = plages[0];
    for (const [pd, pf] of plages.slice(1)) {
      if (pd <= f) f = Math.max(f, pf);
      else {
        total += f - d;
        [d, f] = [pd, pf];
      }
    }
    r.set(jour, total + (f - d));
  }
  return r;
}

/** Premier jour de cours (il peut être passé), ou null sans créneau. */
export function premierJour(creneaux: readonly Creneau[]): string | null {
  let p: string | null = null;
  for (const c of creneaux) if (!c.journee && (p === null || c.jour < p)) p = c.jour;
  return p;
}

/**
 * Le partiel probable : le dernier cours magistral de la matière, s'il est à
 * venir. Dans cet emploi du temps, l'examen d'une matière s'affiche comme un
 * « CM » de plus (Finance : celui du 17 décembre est dans la salle d'examen).
 * Il en faut deux au moins : un seul CM publié est le premier cours, pas
 * l'examen. Au-delà de quatre mois, l'emploi du temps n'est pas encore connu.
 */
export function partielProbable(creneaux: readonly Creneau[], aujourdhui: string): Creneau | null {
  const cms = creneaux.filter((c) => !c.journee && c.type === 'cm').sort(chrono);
  if (cms.length < 2) return null;
  const dernier = cms[cms.length - 1];
  const ecart = ecartJours(aujourdhui, dernier.jour);
  return ecart >= 0 && ecart <= HORIZON_PARTIEL ? dernier : null;
}

/** Le premier créneau d'aujourd'hui ou d'après. */
export function prochainCreneau(creneaux: readonly Creneau[], aujourdhui: string): Creneau | null {
  let p: Creneau | null = null;
  for (const c of creneaux) if (!c.journee && c.jour >= aujourdhui && (p === null || chrono(c, p) < 0)) p = c;
  return p;
}

export interface EmploiDuTemps {
  /** Tous les créneaux, jour par jour, dans l'ordre des heures. */
  parJour: Map<string, Creneau[]>;
  /** Minutes de cours de chaque jour (les créneaux qui se chevauchent comptent une fois). */
  charge: Map<string, number>;
  /** Les créneaux de chaque cours de Hameau. */
  parCours: Map<string, Creneau[]>;
  /** À quel cours de Hameau appartient chaque créneau (par identifiant de créneau). */
  coursDe: Map<string, string>;
  /** Premier jour de cours de chaque cours qui a des créneaux. */
  debuts: Map<string, string>;
}

/** Tout ce qu'on tire du flux, d'un coup : ce que l'écran affiche et ce que le calendrier d'étude utilise. */
export function emploiDuTemps(creneaux: readonly Creneau[], cours: readonly CoursPourAgenda[]): EmploiDuTemps {
  const parCours = rattacher(creneaux, cours);
  const coursDe = new Map<string, string>();
  const debuts = new Map<string, string>();
  for (const [id, liste] of parCours) {
    for (const c of liste) coursDe.set(c.id, id);
    const premier = premierJour(liste);
    if (premier !== null) debuts.set(id, premier);
  }
  return { parJour: creneauxParJour(creneaux), charge: chargeParJour(creneaux), parCours, coursDe, debuts };
}

// ── Pour l'affichage ───────────────────────────────────────────────────────

export function creneauxParJour(creneaux: readonly Creneau[]): Map<string, Creneau[]> {
  const r = new Map<string, Creneau[]>();
  for (const c of [...creneaux].sort(chrono)) r.set(c.jour, [...(r.get(c.jour) ?? []), c]);
  return r;
}

export const heure = (minutes: number): string => `${deuxChiffres(Math.floor(minutes / 60))}:${deuxChiffres(minutes % 60)}`;
export const plageHeures = (c: Pick<Creneau, 'debut' | 'fin'>): string => `${heure(c.debut)}–${heure(c.fin)}`;

/**
 * La salle seule : l'emploi du temps ajoute le site entre parenthèses
 * (« Amphi 3 (SCH -SITE SCHILTIGHEIM, IUT…) ») et, pour deux salles, les sépare par « ; ».
 */
export function salleCourte(lieu: string): string {
  const premiere = lieu.split(';')[0] ?? '';
  return premiere
    .replace(/\(\s*[A-Z]{2,5}\s*-\s*SITE[^)]*\)/gi, '')
    .replace(/\(\s*EX\.?\s+([^)]*)\)/gi, '($1)')
    .replace(/\s+/g, ' ')
    .trim();
}

// Les sites sur lesquels on a travaillé : l'extension Chrome mesure, pendant un chrono, le temps passé sur chaque SITE
// (jamais l'adresse d'une page) et l'envoie au compte. Ici : lire ces lignes et les regrouper, par session ou sur une
// période. Pur.
import { ajouterJours } from './jours.ts';
import { cleJour, formatDuree } from './temps.ts';
import type { Session } from './types.ts';

/** Un site vu moins de trente secondes dans une session n'est pas montré : un onglet traversé n'est pas du travail. */
export const SITE_MIN_S = 30;
/** La période des statistiques : les sept derniers jours, aujourd'hui compris. */
export const SITES_JOURS = 7;
/** Les titres de pages gardés par site (s'ils ont été autorisés dans l'extension). */
export const TITRES_MAX = 3;
const SECONDES_PAR_JOUR = 86_400;

/** Une ligne de la base : le temps cumulé d'un navigateur sur un site (et un titre, s'il est gardé) pendant une session. */
export interface LigneSite {
  sessionId: string;
  site: string;
  /** Vide tant que l'extension n'a pas l'autorisation de garder les titres. */
  titre: string;
  secondes: number;
}

export interface TitreTemps {
  titre: string;
  secondes: number;
}

export interface SiteTemps {
  site: string;
  secondes: number;
  /** Les pages les plus longues, vide si les titres ne sont pas gardés. */
  titres: TitreTemps[];
}

export function ligneSiteValide(brut: unknown): LigneSite | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  if (typeof o.sessionId !== 'string' || o.sessionId === '') return null;
  if (typeof o.site !== 'string' || o.site.length < 3 || o.site.length > 253) return null;
  if (o.titre !== undefined && typeof o.titre !== 'string') return null;
  if (typeof o.secondes !== 'number' || !Number.isFinite(o.secondes) || o.secondes < 0 || o.secondes > SECONDES_PAR_JOUR) return null;
  return { sessionId: o.sessionId, site: o.site, titre: o.titre ?? '', secondes: o.secondes };
}

const parTemps = <T extends { secondes: number }>(a: T, b: T, nom: (x: T) => string) => b.secondes - a.secondes || nom(a).localeCompare(nom(b));

/**
 * Le temps par site : les lignes d'un même site s'additionnent, quel que soit le navigateur ou le titre (activer les
 * titres en cours de route ne double rien : chaque seconde n'est dans qu'une ligne). Du plus long au plus court.
 */
export function regrouperSites(lignes: Iterable<LigneSite>): SiteTemps[] {
  const m = new Map<string, { secondes: number; titres: Map<string, number> }>();
  for (const l of lignes) {
    const e = m.get(l.site) ?? { secondes: 0, titres: new Map<string, number>() };
    e.secondes += l.secondes;
    if (l.titre !== '') e.titres.set(l.titre, (e.titres.get(l.titre) ?? 0) + l.secondes);
    m.set(l.site, e);
  }
  return [...m.entries()]
    .map(([site, e]) => ({
      site,
      secondes: e.secondes,
      titres: [...e.titres.entries()]
        .map(([titre, secondes]) => ({ titre, secondes }))
        .sort((a, b) => parTemps(a, b, (x) => x.titre))
        .slice(0, TITRES_MAX),
    }))
    .sort((a, b) => parTemps(a, b, (x) => x.site));
}

const assezLong = (s: SiteTemps) => s.secondes >= SITE_MIN_S;

/** Les sites de chaque session (clé : l'identifiant de la session), ceux vus moins de trente secondes écartés. */
export function sitesParSession(lignes: readonly LigneSite[]): Map<string, SiteTemps[]> {
  const groupes = new Map<string, LigneSite[]>();
  for (const l of lignes) {
    const g = groupes.get(l.sessionId);
    if (g) g.push(l);
    else groupes.set(l.sessionId, [l]);
  }
  const m = new Map<string, SiteTemps[]>();
  for (const [id, g] of groupes) {
    const sites = regrouperSites(g).filter(assezLong);
    if (sites.length > 0) m.set(id, sites);
  }
  return m;
}

/**
 * Les sites des `jours` derniers jours, aujourd'hui compris. Une session compte le jour où elle a commencé (comme ses
 * minutes partout ailleurs) ; une ligne dont la session n'est plus dans la liste (supprimée) ne compte pas.
 */
export function sitesDeLaPeriode(lignes: readonly LigneSite[], sessions: readonly Pick<Session, 'id' | 'debut'>[], aujourdhui: string, jours: number = SITES_JOURS): SiteTemps[] {
  const premier = ajouterJours(aujourdhui, -(jours - 1));
  const dedans = new Set<string>();
  for (const s of sessions) {
    const debut = Date.parse(s.debut);
    if (!Number.isFinite(debut)) continue;
    const jour = cleJour(new Date(debut));
    if (jour >= premier && jour <= aujourdhui) dedans.add(s.id);
  }
  return regrouperSites(lignes.filter((l) => dedans.has(l.sessionId))).filter(assezLong);
}

/** « 45 s » sous la minute, « 38 min », « 1 h 05 » : la durée telle qu'on la lit. */
export function dureeSite(secondes: number): string {
  const s = Math.round(secondes);
  return s < 60 ? `${s} s` : formatDuree(s / 60);
}

/** « claude.ai 38 min · docs.google.com 12 min · +2 autres » : la ligne d'une session dans l'historique. */
export function libelleSites(sites: readonly SiteTemps[], n: number = 3): string {
  const montres = sites.slice(0, n).map((s) => `${s.site} ${dureeSite(s.secondes)}`);
  const reste = sites.length - n;
  return reste > 0 ? [...montres, `+${reste} autre${reste > 1 ? 's' : ''}`].join(' · ') : montres.join(' · ');
}

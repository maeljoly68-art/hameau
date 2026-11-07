// La fiche de la veille : tout ce qui vaut d'être relu juste avant un partiel, sur un seul écran. Pur.
//
// Rouvrir tout l'artefact la veille d'un partiel noie l'essentiel. La fiche rassemble ce que TU as marqué comme
// important : les erreurs que tu as notées, les pages à savoir mot pour mot, les pages fragiles, tes notes.
import type { Carte } from './cartes.ts';
import type { Chapitre, Cours, NoteChapitre } from './cours.ts';
import { estOuverte, type Erreur } from './erreurs.ts';
import { ecartJours } from './jours.ts';
import { numerosDePages } from './pages.ts';

/** La fiche est mise en avant dans les deux jours qui précèdent le partiel. */
export const FICHE_VEILLE_JOURS = 2;

export interface PageFiche {
  chapitreId: string;
  numero: number;
  titre: string;
  niveau: number;
  parCoeur: boolean;
  fragile: boolean;
  cartes: Carte[];
  notes: NoteChapitre[];
  erreurs: Erreur[];
}

export interface Fiche {
  coursId: string;
  titre: string;
  partiel: string | null;
  /** Jours avant le partiel ; null sans date ; négatif une fois passé. */
  joursAvant: number | null;
  /** Les erreurs pas encore sues, avec la page où elles sont nées. */
  erreurs: { erreur: Erreur; numero: number; titre: string }[];
  /** À savoir mot pour mot : les pages avec leurs cartes. */
  motPourMot: PageFiche[];
  /** Les pages fragiles qui ne sont pas déjà dans « mot pour mot ». */
  fragiles: PageFiche[];
  /** Les autres pages où tu as écrit des notes. */
  notes: PageFiche[];
  /** Pages jamais apprises : à la veille d'un partiel, il faut le savoir. */
  pasApprises: { chapitreId: string; numero: number; titre: string }[];
  /** Combien de pages du cours sont à niveau 1 ou plus. */
  apprises: number;
  total: number;
}

export function construireFiche(e: {
  cours: Cours;
  chapitres: readonly Chapitre[];
  notes: readonly NoteChapitre[];
  cartes: readonly Carte[];
  erreurs: readonly Erreur[];
  fragiles: ReadonlySet<string>;
  aujourdhui: string;
}): Fiche {
  const pages = e.chapitres.filter((c) => c.coursId === e.cours.id).sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id));
  const numeros = numerosDePages(pages);
  const ouvertes = e.erreurs.filter(estOuverte);
  const page = (c: Chapitre): PageFiche => ({
    chapitreId: c.id,
    numero: numeros.get(c.id) ?? 0,
    titre: c.titre,
    niveau: c.niveau,
    parCoeur: c.parCoeur,
    fragile: e.fragiles.has(c.id),
    cartes: e.cartes.filter((k) => k.chapitreId === c.id).sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id)),
    notes: e.notes.filter((n) => n.chapitreId === c.id),
    erreurs: ouvertes.filter((x) => x.chapitreId === c.id),
  });
  const toutes = pages.map(page);
  const motPourMot = toutes.filter((p) => p.parCoeur);
  const fragiles = toutes.filter((p) => !p.parCoeur && p.fragile);
  const dejaLa = new Set([...motPourMot, ...fragiles].map((p) => p.chapitreId));
  return {
    coursId: e.cours.id,
    titre: e.cours.titre,
    partiel: e.cours.partiel,
    joursAvant: e.cours.partiel === null ? null : ecartJours(e.aujourdhui, e.cours.partiel),
    erreurs: ouvertes
      .filter((x) => numeros.has(x.chapitreId))
      .sort((a, b) => (numeros.get(a.chapitreId) ?? 0) - (numeros.get(b.chapitreId) ?? 0) || a.jour.localeCompare(b.jour) || a.id.localeCompare(b.id))
      .map((erreur) => ({ erreur, numero: numeros.get(erreur.chapitreId) ?? 0, titre: pages.find((c) => c.id === erreur.chapitreId)?.titre ?? '' })),
    motPourMot,
    fragiles,
    notes: toutes.filter((p) => !dejaLa.has(p.chapitreId) && p.notes.length > 0),
    pasApprises: toutes.filter((p) => p.niveau === 0).map((p) => ({ chapitreId: p.chapitreId, numero: p.numero, titre: p.titre })),
    apprises: toutes.filter((p) => p.niveau >= 1).length,
    total: toutes.length,
  };
}

/** La fiche de la veille est à proposer : partiel dans 1 ou 2 jours (pas le jour même : trop tard, pas passé). */
export const estVeille = (joursAvant: number | null): boolean => joursAvant !== null && joursAvant >= 1 && joursAvant <= FICHE_VEILLE_JOURS;

/** La fiche en texte simple : à coller dans des notes, un message, ou à imprimer. */
export function ficheEnTexte(f: Fiche, jourPartiel: (jour: string) => string = (j) => j): string {
  const L: string[] = [];
  const quand = f.partiel === null ? '' : ` (partiel ${jourPartiel(f.partiel)}${f.joursAvant !== null && f.joursAvant >= 0 ? `, dans ${f.joursAvant} j` : ''})`;
  L.push(`FICHE DE LA VEILLE — ${f.titre}${quand}`);
  L.push(`${f.apprises} page${f.apprises > 1 ? 's' : ''} apprise${f.apprises > 1 ? 's' : ''} sur ${f.total}.`);
  const page = (p: PageFiche) => {
    L.push('', `Page ${p.numero} · ${p.titre}`);
    for (const c of p.cartes) L.push(`  Q : ${c.question}`, `  R : ${c.reponse}`);
    for (const n of p.notes) L.push(`  Note : ${n.texte}${n.citation ? ` (« ${n.citation} »)` : ''}`);
    for (const x of p.erreurs) L.push(`  Erreur : ${x.texte}`);
  };
  if (f.erreurs.length > 0) {
    L.push('', 'ERREURS À NE PAS REFAIRE');
    for (const x of f.erreurs) L.push(`- page ${x.numero} · ${x.titre} : ${x.erreur.texte}`);
  }
  if (f.motPourMot.length > 0) {
    L.push('', 'À SAVOIR MOT POUR MOT');
    f.motPourMot.forEach(page);
  }
  if (f.fragiles.length > 0) {
    L.push('', 'PAGES FRAGILES');
    f.fragiles.forEach(page);
  }
  if (f.notes.length > 0) {
    L.push('', 'MES NOTES');
    f.notes.forEach(page);
  }
  if (f.pasApprises.length > 0) L.push('', `PAS ENCORE APPRISES : ${f.pasApprises.map((p) => `page ${p.numero}`).join(', ')}`);
  return L.join('\n');
}

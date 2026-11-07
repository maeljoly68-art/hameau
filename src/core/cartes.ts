// Les cartes question/réponse d'une page : de vraies questions pour le rappel, au lieu de « redis ce que tu retiens ». Pur.
//
// Se rappeler à partir d'une question précise est plus dur — et apprend plus — que redire une page à plat. Les
// cartes sont écrites (ou collées en liste) par page ; une page sans carte garde le rappel libre.

export interface Carte {
  id: string;
  chapitreId: string;
  question: string;
  reponse: string;
  ordre: number;
}

export const CARTE_QUESTION_MAX = 300;
export const CARTE_REPONSE_MAX = 800;
/** Au-delà, une page n'est plus un rappel mais un cours de plus : on en garde assez pour une séance de quelques minutes. */
export const CARTES_PAR_PAGE_MAX = 40;

const propre = (t: string, max: number): string => t.replace(/[ \t]+/g, ' ').trim().slice(0, max).trim();

export function carteValide(brut: unknown): Carte | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.chapitreId !== 'string' || typeof o.question !== 'string' || typeof o.reponse !== 'string') return null;
  const question = propre(o.question, CARTE_QUESTION_MAX);
  const reponse = propre(o.reponse, CARTE_REPONSE_MAX);
  if (question === '' || reponse === '') return null;
  return { id: o.id, chapitreId: o.chapitreId, question, reponse, ordre: typeof o.ordre === 'number' && Number.isFinite(o.ordre) ? Math.floor(o.ordre) : 0 };
}

export const SEPARATEUR_CARTE = '::';

/**
 * Une liste collée, une carte par ligne : « question :: réponse ». Les lignes vides, sans séparateur ou dont un
 * côté est vide sont écartées (et comptées, pour le dire) ; une réponse peut elle-même contenir « :: ».
 */
export function analyserCartes(texte: string): { cartes: { question: string; reponse: string }[]; ecartees: number } {
  const cartes: { question: string; reponse: string }[] = [];
  let ecartees = 0;
  for (const ligne of texte.split(/\r?\n/)) {
    if (ligne.trim() === '') continue;
    const i = ligne.indexOf(SEPARATEUR_CARTE);
    const question = i < 0 ? '' : propre(ligne.slice(0, i), CARTE_QUESTION_MAX);
    const reponse = i < 0 ? '' : propre(ligne.slice(i + SEPARATEUR_CARTE.length), CARTE_REPONSE_MAX);
    if (question === '' || reponse === '') ecartees++;
    else cartes.push({ question, reponse });
  }
  return { cartes, ecartees };
}

/** Les cartes de chaque page, dans l'ordre où elles ont été écrites. */
export function cartesParPage(cartes: readonly Carte[]): Map<string, Carte[]> {
  const parPage = new Map<string, Carte[]>();
  for (const c of cartes.slice().sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id))) parPage.set(c.chapitreId, [...(parPage.get(c.chapitreId) ?? []), c]);
  return parPage;
}

/**
 * Ce qu'on a écrit de mémoire, en un seul texte pour le journal : une ligne « question → ta réponse » par carte
 * à laquelle on a répondu (dans l'ordre des pages), puis ce qu'on a écrit en plus. Une réponse laissée vide n'est pas
 * une ligne : on ne note pas « question → » pour rien. null s'il ne reste rien, pour que « j'ai écrit » reste vrai.
 */
export function texteDuRappel(pages: readonly { cartes: readonly Carte[] }[], reponses: Readonly<Record<string, string>>, libre: string): string | null {
  const lignes: string[] = [];
  for (const p of pages)
    for (const c of p.cartes) {
      const r = propre(reponses[c.id] ?? '', CARTE_REPONSE_MAX);
      if (r !== '') lignes.push(`${c.question} → ${r}`);
    }
  const reste = libre.trim();
  if (reste !== '') lignes.push(reste);
  return lignes.length === 0 ? null : lignes.join('\n');
}

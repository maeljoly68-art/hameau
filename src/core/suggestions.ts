// Descriptions déjà écrites, proposées à la fin d'une session : on reprend
// souvent la même tâche, la retaper à chaque fois décourage de la noter.
import type { Session } from './types.ts';

const cle = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Les `n` descriptions distinctes les plus récentes, celles de la même catégorie d'abord. */
export function suggestionsDescription(sessions: readonly Session[], categorie: string, n = 4): string[] {
  const closes = sessions.filter((s) => s.fin !== null && s.description.trim() !== '').sort((a, b) => b.debut.localeCompare(a.debut));
  const meme = cle(categorie);
  const ordonnees = meme ? [...closes.filter((s) => cle(s.categorie) === meme), ...closes.filter((s) => cle(s.categorie) !== meme)] : closes;
  const vues = new Set<string>();
  const r: string[] = [];
  for (const s of ordonnees) {
    const k = cle(s.description);
    if (vues.has(k)) continue;
    vues.add(k);
    r.push(s.description.trim());
    if (r.length >= n) break;
  }
  return r;
}

/** Recherche tolérante : sans accents ni majuscules, dans la catégorie et la description. */
export function correspond(s: Pick<Session, 'categorie' | 'description'>, recherche: string): boolean {
  const q = cle(recherche);
  if (!q) return true;
  return q.split(/\s+/).every((mot) => cle(`${s.categorie} ${s.description}`).includes(mot));
}

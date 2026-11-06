// Lecture de l'emploi du temps de l'université depuis le navigateur, et son cache sur l'appareil.
//
// Le serveur de l'université répond avec les en-têtes CORS qui autorisent la lecture depuis n'importe
// quelle origine : aucun relais n'est nécessaire, et l'adresse du flux (un secret) ne passe donc par
// aucun serveur tiers. Si l'université retirait cette autorisation, l'erreur ci-dessous le dit.
import { creneauxValides, lireICalendrier, type Creneau, type LectureAgenda } from '../core/agenda.ts';

const DELAI_MS = 15_000;
const TAILLE_MAX = 5_000_000;

export class ErreurAgenda extends Error {}

/**
 * Télécharge et lit le flux. Les messages d'erreur ne contiennent JAMAIS l'adresse : elle donne accès à
 * l'emploi du temps de quelqu'un, et un message finit à l'écran, dans un bandeau, dans une capture.
 */
export async function recupererAgenda(lien: string): Promise<LectureAgenda> {
  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), DELAI_MS);
  try {
    let reponse: Response;
    try {
      // Sans cookies ni référent : l'université n'a besoin de rien d'autre que l'adresse.
      reponse = await fetch(lien, { signal: arret.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch {
      throw new ErreurAgenda(arret.signal.aborted ? 'L’emploi du temps met trop de temps à répondre.' : 'Impossible de joindre l’emploi du temps : pas de connexion, ou l’université n’autorise plus sa lecture depuis l’application.');
    }
    if ([401, 403, 404, 410].includes(reponse.status)) throw new ErreurAgenda('Ce lien n’est plus valable : copie-le à nouveau depuis « Mon emploi du temps » de l’université.');
    if (!reponse.ok) throw new ErreurAgenda(`L’emploi du temps est indisponible pour le moment (erreur ${reponse.status}).`);
    if (Number(reponse.headers.get('content-length')) > TAILLE_MAX) throw new ErreurAgenda('Ce fichier est trop gros pour être un emploi du temps.');
    let texte: string;
    try {
      texte = await reponse.text();
    } catch {
      throw new ErreurAgenda('La lecture de l’emploi du temps a été interrompue.');
    }
    if (texte.length > TAILLE_MAX) throw new ErreurAgenda('Ce fichier est trop gros pour être un emploi du temps.');
    const lu = lireICalendrier(texte);
    if (!lu) throw new ErreurAgenda('Ce lien ne renvoie pas un emploi du temps (un fichier .ics est attendu).');
    return lu;
  } finally {
    clearTimeout(minuteur);
  }
}

/** Une empreinte courte de l'adresse : un cache d'une autre adresse (le lien a changé) ne doit pas être relu. Pas cryptographique. */
export function empreinte(lien: string): string {
  let h = 5381;
  for (let i = 0; i < lien.length; i++) h = ((h << 5) + h + lien.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export interface CacheAgenda {
  empreinte: string;
  /** Instant (ms) de la dernière lecture réussie. */
  majLe: number;
  creneaux: Creneau[];
}

const cle = (userId: string) => `hameau.agenda.${userId}`;

/** Dernier emploi du temps lu pour CETTE adresse, pour l'afficher sans attendre le réseau (et hors ligne). */
export function lireCacheAgenda(userId: string, lien: string): CacheAgenda | null {
  try {
    const brut = localStorage.getItem(cle(userId));
    if (!brut) return null;
    const c = JSON.parse(brut) as Partial<CacheAgenda>;
    if (c.empreinte !== empreinte(lien) || typeof c.majLe !== 'number' || !Number.isFinite(c.majLe)) return null;
    return { empreinte: c.empreinte, majLe: c.majLe, creneaux: creneauxValides(c.creneaux) };
  } catch {
    return null;
  }
}

export function ecrireCacheAgenda(userId: string, lien: string, creneaux: Creneau[], majLe: number): void {
  try {
    localStorage.setItem(cle(userId), JSON.stringify({ empreinte: empreinte(lien), majLe, creneaux } satisfies CacheAgenda));
  } catch {
    // Stockage plein ou bloqué : l'emploi du temps se relit à chaque ouverture, c'est tout.
  }
}

export function viderCacheAgenda(userId: string): void {
  try {
    localStorage.removeItem(cle(userId));
  } catch {
    // Rien à vider.
  }
}

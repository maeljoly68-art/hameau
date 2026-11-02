// Export CSV des sessions, lisible tel quel par Excel en français.
import { pointsSession } from './points.ts';
import { dureeSession, pauseValide } from './session.ts';
import { cleJour } from './temps.ts';
import type { Session } from './types.ts';

const SEPARATEUR = ';'; // Excel en français attend « ; » : la virgule y est décimale.

/** Une cellule CSV sûre : guillemets doublés, et pas de formule déguisée. */
export function cellule(v: string): string {
  // Une description commençant par « = », « + », « - » ou « @ » serait
  // exécutée comme une formule par le tableur : l'apostrophe la neutralise.
  const sure = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(sure) ? `"${sure.replace(/"/g, '""')}"` : sure;
}

const heure = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function versCsv(sessions: readonly Session[]): string {
  const entete = ['Date', 'Début', 'Fin', 'Durée (min)', 'Pause (min)', 'Catégorie', 'Description', 'Objectif (min)', 'Appareil', 'Points'];
  const lignes = [...sessions]
    .sort((a, b) => a.debut.localeCompare(b.debut))
    .map((s) => {
      const d = dureeSession(s);
      return [
        cleJour(new Date(s.debut)),
        heure(s.debut),
        s.fin === null ? '' : heure(s.fin),
        // Session en cours : cellule vide, pas « 0 » — un zéro serait relu
        // comme une vraie session de zéro minute et fausserait les moyennes.
        d === null ? '' : String(Math.round(d)),
        String(Math.round(pauseValide(s.pauseSecondes) / 60)),
        s.categorie,
        s.description,
        s.objectif === null ? '' : String(s.objectif),
        s.appareil,
        d === null ? '' : String(pointsSession(d)),
      ];
    });
  return [entete, ...lignes].map((l) => l.map(cellule).join(SEPARATEUR)).join('\r\n') + '\r\n';
}

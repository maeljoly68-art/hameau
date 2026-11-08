// Les sites sur lesquels on a travaillé : lus dans la table que l'extension Chrome remplit pendant les chronos (voir
// extension/background.js). Lecture seule ici ; réservé au compte.
import { ligneSiteValide, type LigneSite } from '../core/sites.ts';
import { client } from './config.ts';

interface LigneBase {
  session_id: string;
  site: string;
  titre: string;
  secondes: number;
}

/** On remonte deux mois de lignes : assez pour l'historique récent, peu pour que la requête reste légère. */
export const JOURS_SITES_CHARGES = 60;
const PAGE = 1000;
/** Garde-fou : cinq pages au plus (5 000 lignes), un compte normal en a quelques centaines. */
const PAGES_MAX = 5;

const tableAbsente = (code: string | undefined) => code === 'PGRST205' || code === '42P01';

/** Les lignes des soixante derniers jours. La table n'existe qu'après sa migration : sans elle, il n'y a simplement aucun site. */
export async function chargerSites(maintenantMs: number): Promise<LigneSite[]> {
  const sb = await client();
  const depuis = new Date(maintenantMs - JOURS_SITES_CHARGES * 86_400_000).toISOString();
  const lignes: LigneSite[] = [];
  for (let page = 0; page < PAGES_MAX; page++) {
    const r = await sb
      .from('sessions_sites')
      .select('session_id, site, titre, secondes')
      .gte('maj_le', depuis)
      // Un ordre total : sans lui, deux pages pourraient se recouvrir ou sauter une ligne.
      .order('maj_le', { ascending: false })
      .order('session_id')
      .order('appareil')
      .order('site')
      .order('titre')
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (r.error) {
      if (tableAbsente(r.error.code)) return [];
      throw new Error(r.error.message);
    }
    const lot = (r.data ?? []) as LigneBase[];
    for (const l of lot) {
      const v = ligneSiteValide({ sessionId: l.session_id, site: l.site, titre: l.titre, secondes: l.secondes });
      if (v !== null) lignes.push(v);
    }
    if (lot.length < PAGE) break;
  }
  return lignes;
}

// Premiers pas : tout est déduit des données, rien n'est stocké — une étape
// cochée à la main pourrait l'être sans avoir été faite.
import { PROFIL_DEFAUT, type Construction, type Profil, type Session } from './types.ts';

export interface Etape {
  id: string;
  titre: string;
  detail: string;
  fait: boolean;
}

export function premiersPas(
  d: { sessions: readonly Session[]; constructions: readonly Construction[]; profil: Profil },
  contexte: { installee: boolean; synchronise: boolean },
): Etape[] {
  const etapes: Etape[] = [
    { id: 'session', titre: 'Termine une première session', detail: 'Lance le chrono, travaille, puis note ce que tu as fait.', fait: d.sessions.some((s) => s.fin !== null) },
    { id: 'construction', titre: 'Pose ton premier bâtiment', detail: 'Tes points te permettent de construire : le marteau, sous le village.', fait: d.constructions.length > 0 },
    { id: 'nom', titre: 'Baptise ton hameau', detail: 'Réglages → Ton hameau. Tu peux aussi y régler ton objectif du jour.', fait: d.profil.nomHameau !== PROFIL_DEFAUT.nomHameau },
    { id: 'installation', titre: 'Installe l’app sur cet appareil', detail: 'Elle s’ouvrira en plein écran, comme une vraie app : Réglages → Installer.', fait: contexte.installee },
  ];
  if (contexte.synchronise) {
    etapes.push({ id: 'raccourci', titre: 'Lance une session par un raccourci', detail: 'Depuis l’iPhone ou l’iPad, sans ouvrir l’app : Réglages → Raccourcis.', fait: d.sessions.some((s) => s.appareil === 'Raccourci') });
  }
  return etapes;
}

// La ville qui grandit avec le travail. Pur, et JUMEAU : ce fichier existe à l'identique dans Sillage
// (src/lib/ville/progression.ts). Les deux applications dessinent la même ville parce qu'elles calculent la même
// progression à partir du même total d'heures — celles de Hameau, que Sillage reçoit dans `focus_externe`. Aucun
// état n'est stocké nulle part : une table partagée entre deux bases finirait par diverger, un calcul ne diverge pas.
// Toute modification se reporte dans l'autre dépôt, tests compris.
//
// Pas de points, pas d'achat : chaque palier d'heures débloque une chose, toujours la même, toujours dans le même ordre.
// Les premiers paliers sont rapprochés (une nouveauté toutes les heures ou deux), les suivants s'espacent : de quoi voir
// la ville bouger dès les premières séances, sans qu'elle soit finie en un mois. Le dernier tombe à 280 h, soit environ
// cinq mois à une heure trois quarts par jour.

export type CleQuartier = 'tower' | 'bank' | 'shop' | 'uni' | 'plaza' | 'library' | 'park' | 'home';
export const CLES_QUARTIERS: readonly CleQuartier[] = ['tower', 'bank', 'shop', 'uni', 'plaza', 'library', 'park', 'home'];

/** 0 : terrain nu. 1 : cabane. 2 : maison. 3 : le bâtiment de la ville. 4 : sa version prestige. */
export type NiveauQuartier = 0 | 1 | 2 | 3 | 4;

export type Vehicule = 'velo' | 'deudeuche' | 'taxi' | 'camion' | 'citadines' | 'bus' | 'sport' | 'tram';
export type ObjetParc = 'bancs' | 'canards' | 'pommiers' | 'fontaine' | 'kiosque' | 'jeux' | 'statue';
export type Ambiance = 'montgolfiere' | 'feuArtifice' | 'port';

export type Deblocage =
  | { genre: 'quartier'; cle: CleQuartier; niveau: Exclude<NiveauQuartier, 0> }
  | { genre: 'routes'; niveau: 1 | 2 }
  | { genre: 'eclairage'; niveau: 1 | 2 }
  | { genre: 'feux' }
  | { genre: 'arbres'; lot: number }
  | { genre: 'decor'; niveau: 1 | 2 | 3 | 4 }
  | { genre: 'vehicule'; cle: Vehicule }
  | { genre: 'parc'; cle: ObjetParc }
  | { genre: 'ambiance'; cle: Ambiance };

export interface Palier {
  heures: number;
  deblocage: Deblocage;
  /** Ce qui apparaît, en une phrase : le message d'annonce. */
  libelle: string;
}

const q = (cle: CleQuartier, niveau: 1 | 2 | 3 | 4): Deblocage => ({ genre: 'quartier', cle, niveau });

/** Le barème, dans l'ordre. À 0 h : une cabane et un feu de camp, rien d'autre. */
export const PALIERS: readonly Palier[] = [
  { heures: 0, deblocage: q('home', 1), libelle: 'Ta cabane' },
  { heures: 0, deblocage: q('plaza', 1), libelle: 'Un feu de camp au centre' },
  { heures: 1, deblocage: { genre: 'arbres', lot: 1 }, libelle: 'Les premiers arbres' },
  { heures: 2, deblocage: q('park', 1), libelle: 'Un pré, futur parc' },
  { heures: 3, deblocage: { genre: 'vehicule', cle: 'velo' }, libelle: 'Des vélos dans les rues' },
  { heures: 4, deblocage: q('uni', 1), libelle: 'Une cabane d’école' },
  { heures: 5, deblocage: { genre: 'parc', cle: 'bancs' }, libelle: 'Des bancs dans le parc' },
  { heures: 6, deblocage: q('library', 1), libelle: 'Une cabane à livres' },
  { heures: 7, deblocage: { genre: 'arbres', lot: 2 }, libelle: 'D’autres arbres' },
  { heures: 8, deblocage: q('shop', 1), libelle: 'Une échoppe' },
  { heures: 9, deblocage: { genre: 'decor', niveau: 1 }, libelle: 'Des voisins s’installent' },
  { heures: 10, deblocage: q('home', 2), libelle: 'Ta cabane devient une maison' },
  { heures: 11, deblocage: { genre: 'vehicule', cle: 'deudeuche' }, libelle: 'Des 2 CV' },
  { heures: 12, deblocage: q('plaza', 2), libelle: 'Une place pavée et son bassin' },
  { heures: 13, deblocage: q('bank', 1), libelle: 'Un coffre en bois, future banque' },
  { heures: 14, deblocage: { genre: 'eclairage', niveau: 1 }, libelle: 'Des réverbères' },
  { heures: 16, deblocage: q('park', 2), libelle: 'Un étang dans le parc' },
  { heures: 18, deblocage: q('tower', 1), libelle: 'Une baraque de marché' },
  { heures: 20, deblocage: { genre: 'routes', niveau: 1 }, libelle: 'Des rues pavées' },
  { heures: 22, deblocage: { genre: 'parc', cle: 'canards' }, libelle: 'Des canards sur l’étang' },
  { heures: 24, deblocage: q('uni', 2), libelle: 'Une école de village' },
  { heures: 26, deblocage: { genre: 'arbres', lot: 3 }, libelle: 'Des arbres le long des rues' },
  { heures: 28, deblocage: q('library', 2), libelle: 'Une petite bibliothèque' },
  { heures: 30, deblocage: { genre: 'decor', niveau: 2 }, libelle: 'Des commerces ouvrent' },
  { heures: 32, deblocage: q('shop', 2), libelle: 'Une vraie boutique' },
  { heures: 34, deblocage: { genre: 'parc', cle: 'pommiers' }, libelle: 'Des pommiers dans le parc' },
  { heures: 36, deblocage: { genre: 'vehicule', cle: 'taxi' }, libelle: 'Des taxis' },
  { heures: 39, deblocage: q('bank', 2), libelle: 'Une maison de banque' },
  { heures: 42, deblocage: { genre: 'parc', cle: 'fontaine' }, libelle: 'Un jet d’eau sur l’étang' },
  { heures: 45, deblocage: { genre: 'feux' }, libelle: 'Des feux et des passages piétons' },
  { heures: 48, deblocage: q('tower', 2), libelle: 'Un bureau de change' },
  { heures: 51, deblocage: { genre: 'parc', cle: 'kiosque' }, libelle: 'Un kiosque à musique' },
  { heures: 54, deblocage: { genre: 'arbres', lot: 4 }, libelle: 'Des bosquets' },
  { heures: 57, deblocage: q('home', 3), libelle: 'Ta maison devient une villa' },
  { heures: 60, deblocage: { genre: 'decor', niveau: 3 }, libelle: 'Les premiers immeubles' },
  { heures: 64, deblocage: { genre: 'vehicule', cle: 'camion' }, libelle: 'Des camions de livraison' },
  { heures: 68, deblocage: q('plaza', 3), libelle: 'La tour de l’horloge' },
  { heures: 72, deblocage: { genre: 'parc', cle: 'jeux' }, libelle: 'Une aire de jeux' },
  { heures: 76, deblocage: { genre: 'routes', niveau: 2 }, libelle: 'Des rues goudronnées' },
  { heures: 80, deblocage: { genre: 'vehicule', cle: 'citadines' }, libelle: 'Les voitures de tous les jours' },
  { heures: 85, deblocage: q('park', 3), libelle: 'Le grand parc' },
  { heures: 90, deblocage: { genre: 'vehicule', cle: 'bus' }, libelle: 'Des bus' },
  { heures: 95, deblocage: q('uni', 3), libelle: 'La grande école' },
  { heures: 100, deblocage: { genre: 'eclairage', niveau: 2 }, libelle: 'Des guirlandes lumineuses' },
  { heures: 105, deblocage: q('library', 3), libelle: 'La bibliothèque à colonnes' },
  { heures: 110, deblocage: { genre: 'arbres', lot: 5 }, libelle: 'Une ville verte' },
  { heures: 116, deblocage: q('shop', 3), libelle: 'La boutique de cartes' },
  { heures: 122, deblocage: { genre: 'decor', niveau: 4 }, libelle: 'Les grands immeubles' },
  { heures: 128, deblocage: q('bank', 3), libelle: 'La banque' },
  { heures: 135, deblocage: { genre: 'ambiance', cle: 'montgolfiere' }, libelle: 'Une montgolfière' },
  { heures: 142, deblocage: q('tower', 3), libelle: 'La tour de la salle de marché' },
  { heures: 150, deblocage: { genre: 'vehicule', cle: 'sport' }, libelle: 'Des voitures de sport' },
  { heures: 158, deblocage: { genre: 'parc', cle: 'statue' }, libelle: 'Une statue dorée' },
  { heures: 166, deblocage: { genre: 'arbres', lot: 6 }, libelle: 'Des arbres partout' },
  { heures: 175, deblocage: q('home', 4), libelle: 'Ta villa de prestige' },
  { heures: 184, deblocage: { genre: 'ambiance', cle: 'feuArtifice' }, libelle: 'Un feu d’artifice les soirs de grand travail' },
  { heures: 193, deblocage: q('plaza', 4), libelle: 'Une place d’honneur' },
  { heures: 202, deblocage: q('park', 4), libelle: 'Un parc fleuri' },
  { heures: 212, deblocage: { genre: 'vehicule', cle: 'tram' }, libelle: 'Un tramway' },
  { heures: 222, deblocage: q('uni', 4), libelle: 'L’école prestigieuse' },
  { heures: 232, deblocage: q('library', 4), libelle: 'La bibliothèque prestigieuse' },
  { heures: 242, deblocage: q('shop', 4), libelle: 'La boutique prestigieuse' },
  { heures: 254, deblocage: { genre: 'ambiance', cle: 'port' }, libelle: 'Un port et ses voiliers' },
  { heures: 266, deblocage: q('bank', 4), libelle: 'La banque prestigieuse' },
  { heures: 280, deblocage: q('tower', 4), libelle: 'La tour prestigieuse' },
];

/** Ce que la ville montre. Rien d'autre n'en décide : le moteur ne dessine que ce qui est ici. */
export interface Progression {
  heures: number;
  quartiers: Record<CleQuartier, NiveauQuartier>;
  /** 0 : terre battue. 1 : pavés. 2 : goudron, marquages au sol. */
  routes: 0 | 1 | 2;
  /** 0 : aucun. 1 : réverbères. 2 : et guirlandes. */
  eclairage: 0 | 1 | 2;
  feux: boolean;
  /** Lots d'arbres plantés, de 0 à 6. */
  arbres: number;
  /** 0 : rien entre les quartiers. 4 : la ville dense (immeubles, commerces, couronne de maisons, parking). */
  decor: 0 | 1 | 2 | 3 | 4;
  vehicules: Vehicule[];
  parc: ObjetParc[];
  ambiance: Ambiance[];
  /** Combien de paliers sont franchis, sur combien : de quoi doser les habitants. */
  franchis: number;
  total: number;
}

/** Les heures de travail, à partir de minutes. Une valeur absente ou fausse ne fait pas grandir la ville. */
export function heuresDe(minutes: number | null | undefined): number {
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes / 60 : 0;
}

/** Les paliers franchis à ce total d'heures (un palier compte dès qu'on l'atteint). */
export function paliersFranchis(heures: number): Palier[] {
  const h = Number.isFinite(heures) ? heures : 0;
  return PALIERS.filter((p) => p.heures <= h);
}

export function progressionVille(heures: number): Progression {
  const h = Number.isFinite(heures) && heures > 0 ? heures : 0;
  const p: Progression = {
    heures: h,
    quartiers: { tower: 0, bank: 0, shop: 0, uni: 0, plaza: 0, library: 0, park: 0, home: 0 },
    routes: 0,
    eclairage: 0,
    feux: false,
    arbres: 0,
    decor: 0,
    vehicules: [],
    parc: [],
    ambiance: [],
    franchis: 0,
    total: PALIERS.length,
  };
  for (const palier of paliersFranchis(h)) {
    const d = palier.deblocage;
    p.franchis++;
    // Le niveau le plus haut gagne : l'ordre du barème n'a pas à être celui des niveaux pour que la ville soit juste.
    if (d.genre === 'quartier') p.quartiers[d.cle] = Math.max(p.quartiers[d.cle], d.niveau) as NiveauQuartier;
    else if (d.genre === 'routes') p.routes = Math.max(p.routes, d.niveau) as 0 | 1 | 2;
    else if (d.genre === 'eclairage') p.eclairage = Math.max(p.eclairage, d.niveau) as 0 | 1 | 2;
    else if (d.genre === 'feux') p.feux = true;
    else if (d.genre === 'arbres') p.arbres = Math.max(p.arbres, d.lot);
    else if (d.genre === 'decor') p.decor = Math.max(p.decor, d.niveau) as 0 | 1 | 2 | 3 | 4;
    else if (d.genre === 'vehicule') {
      if (!p.vehicules.includes(d.cle)) p.vehicules.push(d.cle);
    } else if (d.genre === 'parc') {
      if (!p.parc.includes(d.cle)) p.parc.push(d.cle);
    } else if (!p.ambiance.includes(d.cle)) p.ambiance.push(d.cle);
  }
  return p;
}

/** Ce qui vient d'apparaître entre deux totaux d'heures : de quoi l'annoncer à la fin d'une séance. */
export function nouveautes(avant: number, apres: number): Palier[] {
  const a = Number.isFinite(avant) && avant > 0 ? avant : 0;
  const b = Number.isFinite(apres) ? apres : 0;
  return PALIERS.filter((p) => p.heures > a && p.heures <= b);
}

/** Une clé qui change quand la ville change : redessiner coûte cher, on ne le fait qu'à un palier franchi. */
export const cleProgression = (p: Progression): string => `${p.franchis}/${p.total}`;

/** Le feu d'artifice : débloqué, et une journée de grand travail (au moins `seuilMinutes` aujourd'hui). */
export function jourDeFete(p: Progression, minutesDuJour: number | null | undefined, seuilMinutes = 120): boolean {
  return p.ambiance.includes('feuArtifice') && typeof minutesDuJour === 'number' && Number.isFinite(minutesDuJour) && minutesDuJour >= seuilMinutes;
}

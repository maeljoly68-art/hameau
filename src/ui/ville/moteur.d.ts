// Ce que le moteur 3D (écrit en JavaScript, jumeau de celui de Sillage) accepte et rend. Le moteur est le même
// fichier dans les deux dépôts : le typer ici plutôt que de le réécrire évite que les deux copies divergent.
import type { CleQuartier, Progression } from '../../core/ville.ts';

/** Les signaux que Sillage tire de ses données ; Hameau en donne des valeurs de ville habitée. */
export interface SignauxVille {
  etagesBanque: number;
  etagesTour: number;
  ton: 'profit' | 'loss' | 'neutre';
  etudiants: number;
  promeneurs: number;
  joggeurs: number;
  orage: 0 | 1 | 2;
  ballons: boolean;
  presentoirs: number;
  etals: number;
  piles: number;
  lecteurs: number;
  fete?: boolean;
}

export interface Ville {
  update(signaux: SignauxVille): void;
  focus(cle: CleQuartier): void;
  unfocus(): void;
  rotate(sens: 1 | -1): void;
  setPlaying(anime: boolean): void;
  setClock(horloge: (() => Date) | null): void;
  dispose(): void;
  /** Ce que coûte la dernière image (appels de dessin, triangles, mémoire) : pour les vérifications. */
  stats(): Record<string, number>;
  /** La position de chaque véhicule : pour vérifier de l'extérieur qu'aucun n'en traverse un autre. */
  diagnostic(): { x: number; z: number; len: number; fx: number; fz: number; v: number; ghost: boolean }[];
}

/** Monte la ville dans `hote` ; `null` si l'appareil n'a pas de WebGL. */
export function creerVille(
  hote: HTMLElement,
  etiquettes: Partial<Record<CleQuartier, HTMLElement>>,
  auChoix: (cle: CleQuartier) => void,
  progression?: Progression,
  reglages?: { cadrage?: number },
): Ville | null;

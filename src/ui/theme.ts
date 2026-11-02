// Thème de l'interface (le village, lui, suit l'heure et la saison). Une
// préférence d'appareil : le téléphone peut rester sombre et l'iPad clair.
export type Theme = 'auto' | 'sombre' | 'clair';

const CLE = 'hameau.theme';

export function lireTheme(): Theme {
  try {
    const t = localStorage.getItem(CLE);
    return t === 'sombre' || t === 'clair' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

function effectif(t: Theme): 'sombre' | 'clair' {
  if (t !== 'auto') return t;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'clair' : 'sombre';
}

/** Pose le thème sur la page et accorde la barre d'état du téléphone. */
export function appliquerTheme(t: Theme, memoriser = false): void {
  document.documentElement.dataset.theme = t;
  // Sans ça, la barre d'état d'Android et d'iOS garde la couleur sombre
  // au-dessus d'une page claire.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effectif(t) === 'clair' ? '#f4efe6' : '#0d1224');
  if (memoriser) {
    try {
      localStorage.setItem(CLE, t);
    } catch {
      // Préférence de confort : la perdre n'empêche rien.
    }
  }
}

/** Suit le réglage du système quand le thème est automatique. */
export function suivreSysteme(): void {
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    if (lireTheme() === 'auto') appliquerTheme('auto');
  });
}

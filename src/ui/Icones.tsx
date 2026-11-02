// Icônes dessinées en SVG plutôt qu'en émojis : les émojis changent d'allure
// d'un système à l'autre (Windows les rend en contours), et n'héritent pas de
// la couleur du texte.
const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const IconeVillage = () => (
  <svg {...base}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10v9.5h13V10" />
    <path d="M10 19.5v-5h4v5" />
  </svg>
);
export const IconeHistorique = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const IconeStats = () => (
  <svg {...base}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
export const IconeReglages = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </svg>
);
export const IconeEtincelle = ({ taille = 16 }: { taille?: number }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 2c.6 4.6 2.4 7.4 10 10-7.6 2.6-9.4 5.4-10 10-.6-4.6-2.4-7.4-10-10 7.6-2.6 9.4-5.4 10-10z" fill="currentColor" />
  </svg>
);
export const IconeFlamme = ({ taille = 16 }: { taille?: number }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 2c1 4 6 6.5 6 12a6 6 0 0 1-12 0c0-3 1.6-4.8 3-6 .2 2 1 3 2 3.5C10.5 8 11 5 12 2z" fill="currentColor" />
  </svg>
);
export const IconeLecture = () => (
  <svg {...base} width={20} height={20}>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
  </svg>
);
export const IconeStop = () => (
  <svg {...base} width={20} height={20}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />
  </svg>
);
export const IconePleinEcran = () => (
  <svg {...base} width={18} height={18}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
export const IconeFenetre = () => (
  <svg {...base} width={18} height={18}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none" />
  </svg>
);
export const IconeMarteau = () => (
  <svg {...base} width={18} height={18}>
    <path d="m14 7 3-3 3 3-3 3M15.5 8.5 5 19a1.5 1.5 0 0 1-2-2L13.5 6.5" />
  </svg>
);
export const IconeCadenas = () => (
  <svg {...base} width={14} height={14}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
export const IconePause = () => (
  <svg {...base} width={20} height={20}>
    <rect x="6.5" y="5.5" width="4" height="13" rx="1.4" fill="currentColor" stroke="none" />
    <rect x="13.5" y="5.5" width="4" height="13" rx="1.4" fill="currentColor" stroke="none" />
  </svg>
);
export const IconeSon = ({ coupe = false }: { coupe?: boolean }) => (
  <svg {...base} width={18} height={18}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
    {coupe ? <path d="m16 9.5 5 5M21 9.5l-5 5" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
  </svg>
);
export const IconeRecherche = () => (
  <svg {...base} width={18} height={18}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);
export const IconeCoche = ({ taille = 16 }: { taille?: number }) => (
  <svg {...base} width={taille} height={taille}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

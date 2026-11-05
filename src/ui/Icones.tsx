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
export const IconeTaches = () => (
  <svg {...base}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </svg>
);
export const IconeAmis = () => (
  <svg {...base}>
    <path d="M8 21h8M12 17v4" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.5M17 6h2.5a2.5 2.5 0 0 1-2.6 3.5" />
  </svg>
);
export const IconeCintre = () => (
  <svg {...base}>
    <path d="M12 7.5a2 2 0 1 1 2-2c0 1.3-2 1.6-2 3.2" />
    <path d="M12 8.7 3.2 15.2c-.9.7-.4 2.1.7 2.1h16.2c1.1 0 1.6-1.4.7-2.1z" />
  </svg>
);
export const IconePartager = () => (
  <svg {...base} width={18} height={18}>
    <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
    <path d="M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);
export const IconeCopier = () => (
  <svg {...base} width={18} height={18}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
  </svg>
);
export const IconeEtoile = ({ pleine = true, taille = 14 }: { pleine?: boolean; taille?: number }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill={pleine ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
);
export const IconeCours = () => (
  <svg {...base}>
    <path d="M3 8.5 12 4l9 4.5-9 4.5z" />
    <path d="M7 11v4.6c0 1 2.2 2.4 5 2.4s5-1.4 5-2.4V11" />
    <path d="M21 8.5V14" />
  </svg>
);
export const IconeChevron = ({ sens = 'droite' }: { sens?: 'gauche' | 'droite' }) => (
  <svg {...base} width={18} height={18}>
    <path d={sens === 'droite' ? 'm9 5 7 7-7 7' : 'm15 5-7 7 7 7'} />
  </svg>
);
export const IconeLien = () => (
  <svg {...base} width={16} height={16}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </svg>
);

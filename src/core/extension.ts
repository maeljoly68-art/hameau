// L'extension Chrome de concentration (extension/) : sa version la plus récente, et la comparaison avec celle qu'une page
// détecte. Une extension chargée « non empaquetée » ne se met pas à jour toute seule : il faut le dire. Pur.

/** La version du manifeste d'extension/manifest.json : un test vérifie qu'elles restent identiques. */
export const VERSION_EXTENSION = '1.2.0';

const morceaux = (v: string): number[] | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** La version installée est-elle plus ancienne que `derniere` ? Une version illisible n'est jamais déclarée en retard. */
export function enRetard(installee: string, derniere: string = VERSION_EXTENSION): boolean {
  const a = morceaux(installee);
  const b = morceaux(derniere);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

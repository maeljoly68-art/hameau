/**
 * Teinte stable d'une catégorie : la même couleur pour « Études » sur tous les
 * appareils et à chaque ouverture, sans rien stocker. Les teintes voisines
 * du rouge sont évitées : en rouge, une catégorie aurait l'air d'une erreur.
 */
export function teinte(categorie: string): number | null {
  const c = categorie.trim().toLowerCase();
  if (!c || c === 'sans catégorie') return null;
  let h = 0;
  for (let i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) >>> 0;
  return 30 + (h % 300);
}

/** Style à poser sur un élément pour qu'il prenne la teinte de sa catégorie. */
export function styleTeinte(categorie: string): React.CSSProperties | undefined {
  const t = teinte(categorie);
  return t === null ? undefined : ({ '--teinte': t } as React.CSSProperties);
}

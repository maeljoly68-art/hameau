// Saison du village, d'après le mois LOCAL : c'est la saison qu'on voit par
// la fenêtre qui compte, pas celle d'un fuseau abstrait.
export type Saison = 'printemps' | 'ete' | 'automne' | 'hiver';

export function saisonPour(date: Date): Saison {
  const m = date.getMonth(); // 0 = janvier
  if (m >= 2 && m <= 4) return 'printemps';
  if (m >= 5 && m <= 7) return 'ete';
  if (m >= 8 && m <= 10) return 'automne';
  return 'hiver';
}

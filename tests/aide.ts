import type { Construction, Session } from '../src/core/types.ts';

let n = 0;
export function session(debut: string, minutes: number | null, categorie = 'Travail'): Session {
  const fin = minutes === null ? null : new Date(Date.parse(debut) + minutes * 60_000).toISOString();
  return { id: `s${++n}`, debut: new Date(debut).toISOString(), fin, description: '', categorie, appareil: 'test' };
}

export function construction(batiment: string, x: number, y: number, cout: number): Construction {
  return { id: `c${++n}`, batiment, x, y, cout, construitLe: '2026-11-01T10:00:00Z' };
}

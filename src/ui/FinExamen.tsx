import { useState } from 'react';
import { scorePct } from '../core/passages.ts';
import { formatDuree } from '../core/temps.ts';

/** La fin d'un examen blanc passé au chrono : le temps réel est déjà là ; le score, s'il existe, fixe la note de la page. */
export function FinExamen({ titre, prevues, reelles, surValider, surPlusTard }: { titre: string; prevues: number; reelles: number | null; surValider: (minutes: number | null, scorePct: number | null) => void; surPlusTard: () => void }) {
  const [minutes, setMinutes] = useState(reelles !== null ? String(Math.round(reelles)) : '');
  const [points, setPoints] = useState('');
  const [sur, setSur] = useState('20');
  const pct = points.trim() === '' ? null : scorePct(Number(points.replace(',', '.')), Number(sur.replace(',', '.')));
  const invalide = points.trim() !== '' && pct === null;
  return (
    <>
      <h2>Examen blanc terminé ?</h2>
      <p className="aide">
        « {titre} ». {reelles !== null ? `Tu y as passé ${formatDuree(reelles)} pour ${formatDuree(prevues)} d’épreuve. ` : ''}
        Donne ton score si tu l’as : il fixe la note de la page, donc quand elle revient. Sans score, la page est seulement marquée refaite aujourd’hui.
      </p>
      <div className="ligne-examen">
        <label>
          Temps passé (min)
          <input type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
        <label>
          Score (facultatif)
          <span className="saisie-score">
            <input type="text" inputMode="decimal" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="14" aria-label="Points obtenus" />
            <span aria-hidden>/</span>
            <input type="text" inputMode="decimal" value={sur} onChange={(e) => setSur(e.target.value)} aria-label="Sur combien" />
          </span>
        </label>
      </div>
      <div className="actions">
        <button className="bouton discret" onClick={surPlusTard}>
          Plus tard
        </button>
        <button className="bouton" disabled={invalide} onClick={() => surValider(Number(minutes.replace(',', '.')) || null, pct)}>
          Valider
        </button>
      </div>
    </>
  );
}

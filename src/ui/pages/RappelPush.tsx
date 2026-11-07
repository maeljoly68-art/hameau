// Le rappel quotidien sur le téléphone : une notification par jour, à l'heure choisie, qui dit ce qui t'attend.
import { useCallback, useEffect, useState } from 'react';
import { HEURE_DEFAUT, activerPush, changerHeurePush, changerRelancePush, desactiverPush, lireEtatPush, testerPush, type EtatPush } from '../../data/notifications.ts';

const HEURES = Array.from({ length: 24 }, (_, h) => h);

export function RappelPush() {
  const [etat, setEtat] = useState<EtatPush | null>(null);
  const [heure, setHeure] = useState(HEURE_DEFAUT);
  // La case répond tout de suite ; si l'écriture échoue, la relecture la remet comme la base l'a.
  const [relance, setRelance] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  const relire = useCallback(() => {
    lireEtatPush().then(
      (e) => {
        setEtat(e);
        setHeure(e.heure);
        setRelance(e.relance);
      },
      (e: unknown) => setMessage({ texte: e instanceof Error ? e.message : String(e), erreur: true }),
    );
  }, []);
  useEffect(() => {
    const t = window.setTimeout(relire, 0);
    return () => window.clearTimeout(t);
  }, [relire]);

  const agir = async (f: () => Promise<string | void>) => {
    setOccupe(true);
    setMessage(null);
    try {
      const texte = await f();
      if (texte) setMessage({ texte, erreur: false });
    } catch (e) {
      setMessage({ texte: e instanceof Error ? e.message : String(e), erreur: true });
    } finally {
      setOccupe(false);
      relire();
    }
  };

  if (!etat) return <section className="carte"><h2>Rappel quotidien</h2><p className="aide">{message ? message.texte : 'Chargement…'}</p></section>;
  const enMarche = etat.actif && etat.abonne;
  return (
    <section className="carte rappel-push">
      <h2>Rappel quotidien sur ce téléphone</h2>
      <p className="aide">Une notification par jour, à l’heure choisie, avec une ligne par chose qui t’attend : pages à apprendre par cœur, à réviser, erreurs de retour, pratique du jour, rappel du mois, fiche de la veille quand un partiel approche. Un clic ouvre l’onglet Cours. Rien n’est envoyé les jours où il n’y a rien à dire.</p>
      {etat.tableAbsente && <p className="alerte douce">Les rappels ne sont pas encore activés sur ta base : ils le seront après la mise à jour SQL.</p>}
      {!etat.priseEnCharge && !etat.tableAbsente && <p className="alerte douce">Ce navigateur ne sait pas recevoir de rappel. Sur iPhone : touche « Partager », « Sur l’écran d’accueil », puis ouvre Hameau depuis son icône et reviens ici.</p>}
      {etat.permission === 'denied' && <p className="alerte douce">Les notifications sont refusées pour Hameau : autorise-les dans les réglages du navigateur (ou de l’iPhone), puis réessaie.</p>}
      {etat.priseEnCharge && !etat.tableAbsente && (
        <>
          <label className="ligne-heure">
            Heure du rappel
            <select value={heure} disabled={occupe} onChange={(e) => {
              const h = Number(e.target.value);
              setHeure(h);
              if (enMarche) void agir(async () => { await changerHeurePush(h); return `Rappel décalé à ${h} h.`; });
            }}>
              {HEURES.map((h) => (
                <option key={h} value={h}>
                  {h} h
                </option>
              ))}
            </select>
          </label>
          {etat.relanceDisponible && (
            <label className="case-relance">
              <input
                type="checkbox"
                checked={relance}
                disabled={!enMarche}
                onChange={(e) => {
                  const voulue = e.target.checked;
                  setRelance(voulue);
                  void agir(async () => { await changerRelancePush(heure, voulue); return voulue ? `Relance activée : à ${Math.min(23, heure + 3)} h, s’il te reste quelque chose.` : 'Relance coupée.'; });
                }}
              />
              Relance 3 h plus tard, seulement s’il te reste quelque chose{heure + 3 > 23 ? ' (pas possible après 20 h : elle sortirait de la journée)' : ''}
            </label>
          )}
          <div className="actions gauche">
            {!enMarche ? (
              <button className="bouton" disabled={occupe} onClick={() => void agir(async () => { await activerPush(heure); return `Rappel activé : tous les jours à ${heure} h (si tu as quelque chose à faire).`; })}>
                Activer le rappel
              </button>
            ) : (
              <>
                <button className="bouton petit" disabled={occupe} onClick={() => void agir(async () => {
                  const r = await testerPush();
                  if (r.appareils === 0) return 'Aucun appareil abonné : active le rappel d’abord.';
                  if (r.envoyes === 0) throw new Error(r.echecs[0] ? `Envoi refusé (${r.echecs[0].statut ?? 'réseau'}) : ${r.echecs[0].message}` : 'Aucune notification partie : réactive le rappel.');
                  return `Notification de test envoyée à ${r.envoyes} appareil${r.envoyes > 1 ? 's' : ''} : elle arrive dans quelques secondes.`;
                })}>
                  Envoyer un test
                </button>
                <button className="bouton petit discret" disabled={occupe} onClick={() => void agir(async () => { await desactiverPush(heure); return 'Rappel coupé sur cet appareil.'; })}>
                  Couper le rappel
                </button>
              </>
            )}
          </div>
          {enMarche && <p className="aide petite">Actif : tous les jours à {etat.heure} h, sur cet appareil. Chaque appareil (téléphone, iPad, ordinateur) s’active de son côté.</p>}
        </>
      )}
      {message && <p className={message.erreur ? 'alerte' : 'aide'} role="status">{message.texte}</p>}
    </section>
  );
}

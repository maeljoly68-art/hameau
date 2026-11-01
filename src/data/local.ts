import type { Construction, Session } from '../core/types.ts';
import { nomAppareil, nouvelId, type Depot, type Donnees } from './depot.ts';

const CLE = 'hameau.v1';

function lire(): Donnees {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) {
      const d = JSON.parse(brut) as Partial<Donnees>;
      return { sessions: d.sessions ?? [], constructions: d.constructions ?? [] };
    }
  } catch {
    // Stockage illisible ou bloqué (navigation privée) : on repart à vide
    // plutôt que de rendre l'application inutilisable.
  }
  return { sessions: [], constructions: [] };
}

function ecrire(d: Donnees): void {
  localStorage.setItem(CLE, JSON.stringify(d));
}

/** Stockage sur cet appareil seulement : pour essayer sans compte. */
export function depotLocal(): Depot {
  const auditeurs = new Set<() => void>();
  const prevenir = () => auditeurs.forEach((f) => f());
  const modifier = (f: (d: Donnees) => void) => {
    const d = lire();
    f(d);
    ecrire(d);
    prevenir();
  };

  return {
    synchronise: false,
    async charger() {
      return lire();
    },
    async demarrer(categorie) {
      const d = lire();
      const ouverte = d.sessions.find((s) => s.fin === null);
      if (ouverte) return ouverte;
      const s: Session = { id: nouvelId(), debut: new Date().toISOString(), fin: null, description: '', categorie, appareil: nomAppareil() };
      d.sessions.push(s);
      ecrire(d);
      prevenir();
      return s;
    },
    async terminer(id, champs) {
      modifier((d) => {
        const s = d.sessions.find((x) => x.id === id);
        if (s) Object.assign(s, champs);
      });
    },
    async ajouterSession(s) {
      modifier((d) => void d.sessions.push({ ...s, id: nouvelId() }));
    },
    async modifierSession(id, champs) {
      modifier((d) => {
        const s = d.sessions.find((x) => x.id === id);
        if (s) Object.assign(s, champs);
      });
    },
    async supprimerSession(id) {
      modifier((d) => void (d.sessions = d.sessions.filter((s) => s.id !== id)));
    },
    async construire(c) {
      modifier((d) => {
        if (d.constructions.some((x) => x.x === c.x && x.y === c.y)) throw new Error('Case déjà occupée');
        const n: Construction = { ...c, id: nouvelId(), construitLe: new Date().toISOString() };
        d.constructions.push(n);
      });
    },
    async demolir(id) {
      modifier((d) => void (d.constructions = d.constructions.filter((c) => c.id !== id)));
    },
    ecouter(rappel) {
      auditeurs.add(rappel);
      // L'événement « storage » ne se déclenche que dans les AUTRES onglets :
      // c'est lui qui garde la mini-fenêtre et l'onglet principal d'accord.
      const surStockage = (e: StorageEvent) => {
        if (e.key === CLE) rappel();
      };
      window.addEventListener('storage', surStockage);
      return () => {
        auditeurs.delete(rappel);
        window.removeEventListener('storage', surStockage);
      };
    },
  };
}

import { apparenceValide } from '../core/apparence.ts';
import { objectifValide } from '../core/objectif.ts';
import { clore, mettreEnPause, pauseValide, reprendre } from '../core/session.ts';
import { PROFIL_DEFAUT, type Construction, type Profil, type Session } from '../core/types.ts';
import { niveauValide } from '../core/village.ts';
import { nomAppareil, nouvelId, type Depot, type Donnees } from './depot.ts';

const CLE = 'hameau.v1';

/** Remet d'aplomb une session lue : les anciennes versions n'avaient ni objectif ni pause. */
function normaliser(s: Session): Session {
  return { ...s, objectif: objectifValide(s.objectif), pauseSecondes: pauseValide(s.pauseSecondes), pauseDepuis: s.fin === null ? (s.pauseDepuis ?? null) : null };
}

/** Les bâtiments d'avant les améliorations n'ont pas de niveau : ils sont au premier. */
const normaliserConstruction = (c: Construction): Construction => ({ ...c, niveau: niveauValide(c.niveau) });

/** Profil lu : les champs ajoutés depuis (pseudo, apparence) prennent leur valeur par défaut. */
export function profilValide(p: Partial<Profil> | undefined): Profil {
  const d = { ...PROFIL_DEFAUT, ...p };
  return {
    nomHameau: typeof d.nomHameau === 'string' && d.nomHameau.trim() ? d.nomHameau : PROFIL_DEFAUT.nomHameau,
    objectifJour: typeof d.objectifJour === 'number' && d.objectifJour > 0 ? d.objectifJour : PROFIL_DEFAUT.objectifJour,
    pseudo: typeof d.pseudo === 'string' ? d.pseudo : '',
    apparence: apparenceValide(d.apparence),
    niveauPublie: typeof d.niveauPublie === 'number' && d.niveauPublie >= 1 ? Math.floor(d.niveauPublie) : 1,
  };
}

export function lireLocal(): Donnees {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) {
      const d = JSON.parse(brut) as Partial<Donnees>;
      return {
        sessions: (d.sessions ?? []).map(normaliser),
        constructions: (d.constructions ?? []).map(normaliserConstruction),
        profil: profilValide(d.profil),
      };
    }
  } catch {
    // Stockage illisible ou bloqué (navigation privée) : on repart à vide
    // plutôt que de rendre l'application inutilisable.
  }
  return { sessions: [], constructions: [], profil: PROFIL_DEFAUT };
}

function ecrire(d: Donnees): void {
  localStorage.setItem(CLE, JSON.stringify(d));
}

/** Stockage sur cet appareil seulement : pour essayer sans compte. */
export function depotLocal(): Depot {
  const auditeurs = new Set<() => void>();
  const prevenir = () => auditeurs.forEach((f) => f());
  const modifier = (f: (d: Donnees) => void) => {
    const d = lireLocal();
    f(d);
    ecrire(d);
    prevenir();
  };
  const remplacer = (id: string, f: (s: Session) => Session) =>
    modifier((d) => void (d.sessions = d.sessions.map((s) => (s.id === id ? f(s) : s))));

  return {
    synchronise: false,
    userId: null,
    cleCache: 'hameau.cache.local',
    async charger() {
      return lireLocal();
    },
    async demarrer(categorie, objectif) {
      const d = lireLocal();
      const ouverte = d.sessions.find((s) => s.fin === null);
      if (ouverte) return ouverte;
      const s: Session = { id: nouvelId(), debut: new Date().toISOString(), fin: null, description: '', categorie, appareil: nomAppareil(), objectif: objectifValide(objectif), pauseSecondes: 0, pauseDepuis: null };
      d.sessions.push(s);
      ecrire(d);
      prevenir();
      return s;
    },
    async terminer(id, champs) {
      // Même règle que le déclencheur de la base : une pause en cours
      // s'arrête à la fin, le cumul ne dépasse pas la durée.
      remplacer(id, (s) => clore({ ...s, description: champs.description, categorie: champs.categorie }, champs.fin));
    },
    async pause(id) {
      remplacer(id, (s) => mettreEnPause(s, new Date().toISOString()));
    },
    async reprendre(id) {
      remplacer(id, (s) => reprendre(s, new Date().toISOString()));
    },
    async ajouterSession(s) {
      modifier((d) => void d.sessions.push({ ...s, id: nouvelId() }));
    },
    async modifierSession(id, champs) {
      remplacer(id, (s) => {
        const m = { ...s, ...champs };
        return m.fin !== null ? clore(m, m.fin) : m;
      });
    },
    async supprimerSession(id) {
      modifier((d) => void (d.sessions = d.sessions.filter((s) => s.id !== id)));
    },
    async construire(c) {
      modifier((d) => {
        if (d.constructions.some((x) => x.x === c.x && x.y === c.y)) throw new Error('Case déjà occupée');
        const n: Construction = { ...c, niveau: niveauValide(c.niveau), id: nouvelId(), construitLe: new Date().toISOString() };
        d.constructions.push(n);
      });
    },
    async ameliorer(c, cout) {
      modifier((d) => {
        const x = d.constructions.find((k) => k.id === c.id);
        if (!x || x.niveau !== c.niveau) throw new Error('Ce bâtiment a changé entre-temps : recharge le village.');
        x.niveau = niveauValide(c.niveau + 1);
        x.cout += cout;
      });
    },
    async demolir(id) {
      modifier((d) => void (d.constructions = d.constructions.filter((c) => c.id !== id)));
    },
    async deplacer(id, x, y) {
      modifier((d) => {
        const c = d.constructions.find((k) => k.id === id);
        if (!c) throw new Error('Ce bâtiment n’existe plus.');
        if (d.constructions.some((k) => k.id !== id && k.x === x && k.y === y)) throw new Error('Case déjà occupée');
        c.x = x;
        c.y = y;
      });
    },
    async enregistrerProfil(p) {
      modifier((d) => void (d.profil = p));
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

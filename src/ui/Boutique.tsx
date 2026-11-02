import type { Saison } from '../core/saison.ts';
import { CATALOGUE, type Batiment } from '../core/village.ts';
import { IconeCadenas, IconeEtincelle } from './Icones.tsx';
import { Dessin, SaisonContexte } from './village/dessins.tsx';

/** Aperçu dessiné d'un bâtiment, le même trait que dans le village. */
function Apercu({ id }: { id: string }) {
  return (
    <svg viewBox="-38 -80 76 90" className="apercu" aria-hidden>
      <ellipse cx={0} cy={4} rx={30} ry={11} fill="rgba(0,0,0,.18)" />
      <Dessin id={id} actif={false} nuit={false} />
    </svg>
  );
}

export function Boutique({ niveau, solde, saison, surChoisir }: { niveau: number; solde: number; saison: Saison; surChoisir: (b: Batiment) => void }) {
  return (
    <SaisonContexte.Provider value={saison}>
    <section className="carte">
      <div className="entete">
        <h2>Construire</h2>
        <span className="pastille">
          <IconeEtincelle /> {solde} à dépenser
        </span>
      </div>
      <ul className="boutique">
        {CATALOGUE.map((b) => {
          const verrou = niveau < b.niveauRequis;
          const manque = b.cout - solde;
          return (
            <li key={b.id}>
              <button className="article" disabled={verrou || manque > 0} onClick={() => surChoisir(b)}>
                <Apercu id={b.id} />
                <span className="article-nom">{b.nom}</span>
                <span className="article-desc">{verrou ? `Niveau ${b.niveauRequis} requis` : manque > 0 ? `Encore ${manque} points` : b.description}</span>
                <span className="article-prix">
                  {verrou ? <IconeCadenas /> : <IconeEtincelle taille={12} />} {b.cout}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
    </SaisonContexte.Provider>
  );
}

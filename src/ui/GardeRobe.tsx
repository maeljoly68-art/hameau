import { useState } from 'react';
import { COSMETIQUES, EMPLACEMENTS, avancement, debloque, texteCondition, type Cosmetique, type Emplacement, type Progression } from '../core/apparence.ts';
import type { Apparence } from '../core/types.ts';
import { IconeCadenas, IconeCoche } from './Icones.tsx';
import { Compagnon, Personnage, type Pose } from './village/personnage.tsx';

/** Le personnage seul, à la taille voulue : en pied, ou en buste pour un avatar. */
export function Portrait({ apparence, cadre = 'pied', pose = 'repos', avecCompagnon = false, className }: { apparence: Apparence; cadre?: 'pied' | 'buste'; pose?: Pose; avecCompagnon?: boolean; className?: string }) {
  const compagnon = avecCompagnon && apparence.compagnon !== 'aucun';
  // Le buste garde la place du plus haut chapeau (celui du mage).
  const vue = cadre === 'buste' ? '-10 -40 20 27' : compagnon ? '-34 -40 52 46' : '-17 -40 34 46';
  return (
    <svg viewBox={vue} className={className} aria-hidden>
      {compagnon && (
        <g transform="translate(-22 2)">
          <Compagnon id={apparence.compagnon} dort={false} />
        </g>
      )}
      <Personnage apparence={apparence} pose={pose} />
    </svg>
  );
}

/** Aperçu d'un objet : porté par le personnage, ou le compagnon seul. */
function ApercuObjet({ apparence, objet }: { apparence: Apparence; objet: Cosmetique }) {
  const essai = { ...apparence, [objet.emplacement]: objet.id };
  if (objet.emplacement === 'compagnon') {
    return (
      <svg viewBox="-12 -17 24 19" className="apercu-objet" aria-hidden>
        {objet.id === 'aucun' ? <circle cx={0} cy={-6} r={4} fill="none" stroke="currentColor" strokeDasharray="2 2" opacity={0.5} /> : <Compagnon id={objet.id} dort={false} />}
      </svg>
    );
  }
  const buste = objet.emplacement === 'chapeau' || objet.emplacement === 'coiffure' || objet.emplacement === 'cheveux' || objet.emplacement === 'peau';
  return <Portrait apparence={essai} cadre={buste ? 'buste' : 'pied'} className="apercu-objet" />;
}

/**
 * La garde-robe : toucher un objet débloqué l'enfile aussitôt ; toucher un
 * objet verrouillé le fait essayer, avec ce qu'il reste à faire pour l'avoir.
 */
export function GardeRobe({ apparence, progression, nomSucces, surChoisir, surFermer }: { apparence: Apparence; progression: Progression; nomSucces: (id: string) => string; surChoisir: (a: Apparence) => void; surFermer: () => void }) {
  const [onglet, setOnglet] = useState<Emplacement>('chapeau');
  const [essai, setEssai] = useState<Cosmetique | null>(null);
  const objets = COSMETIQUES.filter((c) => c.emplacement === onglet);
  const debloques = COSMETIQUES.filter((c) => c.condition && debloque(c, progression)).length;
  const total = COSMETIQUES.filter((c) => c.condition).length;
  const porte = essai ? { ...apparence, [essai.emplacement]: essai.id } : apparence;

  return (
    <section className="carte garde-robe">
      <div className="entete">
        <h2>Garde-robe</h2>
        <span className="pastille" title="Objets gagnés">
          {debloques} / {total} gagnés
        </span>
      </div>
      <div className="garde-robe-corps">
        <div className="garde-robe-scene">
          <Portrait apparence={porte} avecCompagnon className="portrait-grand" />
          {essai ? (
            <div className="essai">
              <strong>
                <IconeCadenas /> {essai.nom}
              </strong>
              <span className="aide">{essai.condition && texteCondition(essai.condition, nomSucces)}</span>
              {essai.condition && (
                <span className="jauge">
                  <span style={{ width: `${(avancement(essai.condition, progression).actuel / avancement(essai.condition, progression).cible) * 100}%` }} />
                </span>
              )}
              <button className="lien" onClick={() => setEssai(null)}>
                Retirer l’essai
              </button>
            </div>
          ) : (
            <p className="aide">Chaque objet se gagne en travaillant : niveaux, séries, succès.</p>
          )}
        </div>
        <div className="garde-robe-choix">
          <div className="puces" role="tablist" aria-label="Emplacements">
            {EMPLACEMENTS.map((e) => (
              <button
                key={e.id}
                role="tab"
                aria-selected={onglet === e.id}
                className={onglet === e.id ? 'puce choisie' : 'puce'}
                onClick={() => {
                  setOnglet(e.id);
                  setEssai(null);
                }}
              >
                {e.nom}
              </button>
            ))}
          </div>
          <ul className="vestiaire">
            {objets.map((c) => {
              const libre = debloque(c, progression);
              const choisi = apparence[c.emplacement] === c.id;
              const av = c.condition ? avancement(c.condition, progression) : null;
              return (
                <li key={c.id}>
                  <button
                    className={`objet${choisi ? ' choisi' : ''}${libre ? '' : ' verrouille'}${essai?.id === c.id && essai.emplacement === c.emplacement ? ' essaye' : ''}`}
                    onClick={() => {
                      if (libre) {
                        setEssai(null);
                        if (!choisi) surChoisir({ ...apparence, [c.emplacement]: c.id });
                      } else setEssai(c);
                    }}
                    aria-pressed={choisi}
                    title={libre ? c.nom : `${c.nom} — ${c.condition ? texteCondition(c.condition, nomSucces) : ''}`}
                  >
                    <ApercuObjet apparence={apparence} objet={c} />
                    <span className="objet-nom">{c.nom}</span>
                    {choisi && (
                      <span className="objet-porte" aria-label="Porté">
                        <IconeCoche taille={12} />
                      </span>
                    )}
                    {!libre && av && (
                      <span className="objet-verrou">
                        <IconeCadenas /> {c.condition!.type === 'succes' ? 'Succès' : `${av.actuel} / ${av.cible}`}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="actions">
        <button className="bouton discret petit" onClick={surFermer}>
          Fermer
        </button>
      </div>
    </section>
  );
}

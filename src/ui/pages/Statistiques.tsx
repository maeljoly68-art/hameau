import {
  bilan,
  calendrier,
  concentrationParMoment,
  derniersJours,
  ECHANTILLON_MINIMUM,
  intensite,
  meilleureSerie,
  minutesAujourdhui,
  minutesSemaine,
  minutesSemainePrecedenteAuMemeJour,
  MOMENTS,
  parCategorie,
  serie,
} from '../../core/stats.ts';
import { dureeSite, SITES_JOURS, type SiteTemps } from '../../core/sites.ts';
import type { Succes } from '../../core/succes.ts';
import { formatDuree } from '../../core/temps.ts';
import type { Session } from '../../core/types.ts';
import { styleTeinte } from '../couleurs.ts';
import { IconeEtincelle } from '../Icones.tsx';

/** Sur grand écran, une année entière tient : 20 semaines y laissaient un grand vide. */
const semainesAffichees = () => (window.matchMedia?.('(min-width: 960px)').matches ? 52 : 20);
const JOURS_COURTS = ['L', '', 'M', '', 'V', '', 'D'];
const SITES_MONTRES = 8;

export default function Statistiques({ sessions, sites, succes, objectifJour, maintenant }: { sessions: Session[]; sites: SiteTemps[]; succes: Succes[]; objectifJour: number; maintenant: number }) {
  const m = new Date(maintenant);
  const semaine = minutesSemaine(sessions, m);
  const precedente = minutesSemainePrecedenteAuMemeJour(sessions, m);
  // Un lundi matin sans session afficherait « −100 % » : rien n'est encore joué.
  const ecart = precedente > 0 && semaine > 0 ? Math.round(((semaine - precedente) / precedente) * 100) : null;
  const b = bilan(sessions);
  const jours = derniersJours(sessions, m, 14);
  // L'échelle des barres suit l'objectif du jour, pas le plus gros jour : un
  // marathon isolé écraserait sinon toutes les autres barres.
  const echelle = Math.max(objectifJour * 1.5, 30);
  const cats = parCategorie(sessions, m, 30);
  const totalCats = cats.reduce((a, c) => a + c.minutes, 0);
  const semaines = semainesAffichees();
  const cal = calendrier(sessions, m, semaines);
  const obtenus = succes.filter((s) => s.obtenu).length;
  const conc = concentrationParMoment(sessions);
  const plusLongueMoyenne = Math.max(1, ...conc.lignes.map((l) => l.moyenne ?? 0));
  const meilleur = conc.meilleur ? MOMENTS.find((x) => x.id === conc.meilleur)! : null;
  // Les sites les plus travaillés (vus par l'extension Chrome) : la carte n'existe que s'il y en a.
  const sitesMontres = sites.slice(0, SITES_MONTRES);
  const plusLongSite = Math.max(1, ...sitesMontres.map((x) => x.secondes));

  return (
    <div className="pile">
      <section className="tuiles">
        <div className="tuile">
          <span className="tuile-valeur">{formatDuree(minutesAujourdhui(sessions, m))}</span>
          <span className="tuile-nom">aujourd’hui · objectif {formatDuree(objectifJour)}</span>
        </div>
        <div className="tuile">
          <span className="tuile-valeur">{formatDuree(semaine)}</span>
          <span className="tuile-nom">
            cette semaine
            {ecart !== null && <span className={ecart >= 0 ? 'hausse' : 'baisse'}> {ecart >= 0 ? `+${ecart}` : ecart} %</span>}
          </span>
        </div>
        <div className="tuile">
          <span className="tuile-valeur">{serie(sessions, m)} j</span>
          <span className="tuile-nom">série · record {meilleureSerie(sessions)} j</span>
        </div>
        <div className="tuile">
          <span className="tuile-valeur">{b.moyenne === null ? '—' : formatDuree(b.moyenne)}</span>
          <span className="tuile-nom">session moyenne · {b.sessions} au total</span>
        </div>
      </section>

      <section className="carte">
        <div className="entete">
          <h2>Régularité</h2>
          <span className="aide">{semaines === 52 ? 'les 12 derniers mois' : `${semaines} dernières semaines`}</span>
        </div>
        <div className="calendrier-cadre">
          <div className="calendrier">
            <div className="calendrier-jours" aria-hidden>
              {JOURS_COURTS.map((j, i) => (
                <span key={i}>{j}</span>
              ))}
            </div>
            {cal.map((col, i) => (
              <div key={i} className="calendrier-col">
                {col.map((j) => (
                  <span key={j.jour} className={j.futur ? 'case-cal futur' : `case-cal n${intensite(j.minutes, objectifJour)}`} title={j.futur ? undefined : `${new Date(j.jour + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : ${formatDuree(j.minutes)}`} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="legende-cal" aria-hidden>
          <span>moins</span>
          {[0, 1, 2, 3, 4].map((n) => (
            <span key={n} className={`case-cal n${n}`} />
          ))}
          <span>objectif atteint</span>
        </div>
      </section>

      <section className="carte">
        <h2>14 derniers jours</h2>
        <div className="barres" style={{ ['--objectif' as string]: `${Math.min(100, (objectifJour / echelle) * 100)}%` }}>
          <div className="ligne-objectif" title={`Objectif : ${formatDuree(objectifJour)}`} />
          {jours.map((j) => (
            <div key={j.jour} className="barre" title={`${j.jour} : ${formatDuree(j.minutes)}`}>
              <div className={j.minutes >= objectifJour ? 'barre-remplie atteint' : 'barre-remplie'} style={{ height: `${Math.min(100, (j.minutes / echelle) * 100)}%` }} data-deborde={j.minutes > echelle || undefined} />
              <span className="barre-jour">{new Date(j.jour + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="carte">
        <h2>Quand es-tu le plus concentré ?</h2>
        <p className="aide">Durée moyenne d’une session selon le moment où tu la commences — pas le temps total, qui désignerait juste le moment où tu travailles le plus souvent.</p>
        <ul className="moments">
          {conc.lignes.map((l) => {
            const info = MOMENTS.find((x) => x.id === l.moment)!;
            return (
              <li key={l.moment} className={l.moment === conc.meilleur ? 'meilleur' : undefined}>
                <span className="moment-nom">
                  <strong>{info.nom}</strong>
                  <span className="aide">{info.plage}</span>
                </span>
                <span className="jauge">
                  <span style={{ width: `${((l.moyenne ?? 0) / plusLongueMoyenne) * 100}%` }} />
                </span>
                <span className="nombre">{l.moyenne === null ? (l.sessions > 0 ? `${l.sessions}/${ECHANTILLON_MINIMUM}` : '—') : formatDuree(l.moyenne)}</span>
              </li>
            );
          })}
        </ul>
        <p className="aide">
          {meilleur
            ? `Tes sessions ${meilleur.complement} sont les plus longues : garde ce créneau pour les tâches qui demandent de la profondeur.`
            : `Il faut au moins ${ECHANTILLON_MINIMUM} sessions dans un moment de la journée pour en tirer une moyenne fiable.`}
        </p>
      </section>

      <section className="carte">
        <h2>Où passe ton temps (30 jours)</h2>
        {cats.length === 0 && <p className="vide">Rien encore. Lance ta première session !</p>}
        <ul className="categories">
          {cats.map((c) => (
            <li key={c.categorie} style={styleTeinte(c.categorie)} className="avec-teinte">
              <span>{c.categorie}</span>
              <span className="jauge">
                <span style={{ width: `${(c.minutes / totalCats) * 100}%` }} />
              </span>
              <span className="nombre">{formatDuree(c.minutes)}</span>
            </li>
          ))}
        </ul>
        {b.plusLongue !== null && <p className="aide">Plus longue session : {formatDuree(b.plusLongue)}.</p>}
      </section>

      {sitesMontres.length > 0 && (
        <section className="carte">
          <div className="entete">
            <h2>Où tu as travaillé ({SITES_JOURS} jours)</h2>
          </div>
          <ul className="categories sites-travailles">
            {sitesMontres.map((x) => (
              <li key={x.site} title={[x.site, ...x.titres.map((t) => t.titre)].join('\n')}>
                <span>{x.site}</span>
                <span className="jauge">
                  <span style={{ width: `${(x.secondes / plusLongSite) * 100}%` }} />
                </span>
                <span className="nombre">{dureeSite(x.secondes)}</span>
              </li>
            ))}
          </ul>
          <p className="aide petite">Mesuré par l’extension Chrome pendant tes chronos : le nom du site seulement, jamais l’adresse de la page.</p>
        </section>
      )}

      <section className="carte">
        <div className="entete">
          <h2>Succès</h2>
          <span className="pastille">
            <IconeEtincelle /> {obtenus} / {succes.length}
          </span>
        </div>
        <ul className="liste-succes">
          {succes.map((s) => (
            <li key={s.id} className={s.obtenu ? 'obtenu' : undefined}>
              <span className="succes-medaille" aria-hidden>
                <IconeEtincelle taille={18} />
              </span>
              <span className="succes-texte">
                <strong>{s.nom}</strong>
                <span className="aide">{s.description}</span>
                {!s.obtenu && (
                  <span className="jauge">
                    <span style={{ width: `${(s.actuel / s.cible) * 100}%` }} />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

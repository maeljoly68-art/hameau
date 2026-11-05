import { useCallback, useEffect, useMemo, useState } from 'react';
import { echeanceTexte, habitudesDuJour, IMPORTANCES, joursAvant, lundiDe, trierTaches, type TacheSillage } from '../../core/sillage.ts';
import { cleJour, decalerJours, formatDuree } from '../../core/temps.ts';
import { SILLAGE } from '../../data/config.ts';
import { ajouterTache, charger, choisirProfil, cocher, connecter, delier, demanderLienMotDePasse, derniereSynchro, lienSillage, marquerTache, type DonneesSillage, type LienSillage } from '../../data/sillage.ts';
import { IconeCoche, IconeLecture } from '../Icones.tsx';

function Connexion({ emailSuggere, surLie }: { emailSuggere: string | null; surLie: (l: LienSillage) => void }) {
  const [email, setEmail] = useState(emailSuggere ?? '');
  const [motDePasse, setMotDePasse] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [profils, setProfils] = useState<LienSillage[] | null>(null);

  const motDePasseOublie = () => {
    const adresse = email.trim();
    if (!adresse) return setMessage('Entre d’abord l’adresse de ton compte Sillage.');
    setOccupe(true);
    setMessage(null);
    setInfo(null);
    demanderLienMotDePasse(adresse)
      .then(() => setInfo(`Si un compte Sillage existe pour ${adresse}, un e-mail vient de lui être envoyé. Son lien ouvre Sillage : choisis-y ton mot de passe, puis reviens ici te connecter.`))
      .catch((er: unknown) => setMessage(er instanceof Error ? er.message : String(er)))
      .finally(() => setOccupe(false));
  };

  if (profils && profils.length > 1)
    return (
      <section className="carte">
        <h2>Quel profil Sillage ?</h2>
        <div className="puces">
          {profils.map((p) => (
            <button
              key={p.profilId}
              className="puce"
              onClick={() => {
                choisirProfil(p);
                surLie(p);
              }}
            >
              {p.nom}
            </button>
          ))}
        </div>
      </section>
    );

  return (
    <form
      className="carte"
      onSubmit={(e) => {
        e.preventDefault();
        setOccupe(true);
        setMessage(null);
        connecter(email.trim(), motDePasse)
          .then((liste) => {
            if (liste.length === 0) setMessage('Ce compte Sillage n’a encore aucun profil.');
            else if (liste.length === 1) surLie(liste[0]);
            else setProfils(liste);
          })
          .catch((er: unknown) => setMessage(er instanceof Error ? er.message : String(er)))
          .finally(() => setOccupe(false));
      }}
    >
      <h2>Relier Sillage</h2>
      <p>
        Tes <strong>habitudes</strong> du jour et tes <strong>tâches</strong> de Sillage apparaîtront ici, et ton temps de travail partira dans les statistiques de Sillage.
      </p>
      <label>
        Email du compte Sillage
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Mot de passe Sillage
        <input type="password" autoComplete="current-password" required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
      </label>
      <button type="button" className="lien lien-a-droite" disabled={occupe} onClick={motDePasseOublie}>
        Mot de passe Sillage oublié ?
      </button>
      {message && <p className="alerte douce">{message}</p>}
      {info && <p className="alerte douce">{info}</p>}
      <button className="bouton gros" disabled={occupe}>
        {occupe ? '…' : 'Relier'}
      </button>
      <p className="aide">
        Le mot de passe n’est pas gardé : seule la connexion l’est, sur cet appareil, comme quand tu te connectes à Sillage. Hameau n’a pas plus de droits que toi dans Sillage. Si tu te connectes à Sillage avec Discord ou Google, tu n’as pas encore de mot de passe : touche « Mot de passe Sillage oublié ? » pour en définir un.
      </p>
    </form>
  );
}

function FormulaireTache({ surAjouter }: { surAjouter: (t: { titre: string; importance: number; echeance: string | null; estimation: number | null }) => Promise<void> }) {
  const [titre, setTitre] = useState('');
  const [importance, setImportance] = useState(2);
  const [echeance, setEcheance] = useState('');
  const [estimation, setEstimation] = useState('');
  const [occupe, setOccupe] = useState(false);
  return (
    <form
      className="formulaire-tache"
      onSubmit={(e) => {
        e.preventDefault();
        if (!titre.trim()) return;
        setOccupe(true);
        const minutes = Number(estimation);
        surAjouter({ titre: titre.trim(), importance, echeance: echeance || null, estimation: estimation && Number.isFinite(minutes) ? minutes : null })
          .then(() => {
            setTitre('');
            setEcheance('');
            setEstimation('');
          })
          .finally(() => setOccupe(false));
      }}
    >
      <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Nouvelle tâche (ajoutée aussi dans Sillage)…" aria-label="Titre de la tâche" maxLength={200} />
      {/* Les options n'apparaissent qu'une fois le titre tapé : la plupart des
          tâches n'en ont pas besoin, et quatre champs vides découragent d'en noter une. */}
      {titre.trim() && (
      <div className="formulaire-tache-options">
        <div className="puces" role="group" aria-label="Importance">
          {IMPORTANCES.map((i) => (
            <button type="button" key={i.niveau} className={importance === i.niveau ? 'puce choisie' : 'puce'} aria-pressed={importance === i.niveau} onClick={() => setImportance(i.niveau)}>
              {i.nom}
            </button>
          ))}
        </div>
        <label className="champ-court">
          Échéance
          <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
        </label>
        <label className="champ-court">
          Durée estimée
          <input type="number" min={1} max={600} inputMode="numeric" value={estimation} onChange={(e) => setEstimation(e.target.value)} placeholder="min" />
        </label>
        <button className="bouton" disabled={occupe || !titre.trim()}>
          Ajouter
        </button>
      </div>
      )}
    </form>
  );
}

export default function Taches({
  emailSuggere,
  sessionEnCours,
  surLancer,
  surLien,
}: {
  emailSuggere: string | null;
  /** Une session tourne déjà : on ne propose pas d'en lancer une autre. */
  sessionEnCours: boolean;
  surLancer: (t: TacheSillage) => void;
  /** Prévient l'app que le lien a changé (pour lancer ou couper la synchronisation). */
  surLien: (l: LienSillage | null) => void;
}) {
  const [lien, setLien] = useState<LienSillage | null>(lienSillage);
  const [donnees, setDonnees] = useState<DonneesSillage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [faitesOuvertes, setFaitesOuvertes] = useState(false);
  const aujourdhui = cleJour(new Date());

  const recharger = useCallback(async () => {
    if (!lien) return;
    setChargement(true);
    try {
      setDonnees(await charger(lien.profilId, lundiDe(aujourdhui), cleJour(decalerJours(new Date(), -1))));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  }, [lien, aujourdhui]);

  useEffect(() => {
    const t = window.setTimeout(() => void recharger(), 0);
    // Au retour sur l'app : ce qui a été coché dans Sillage entre-temps.
    const auRetour = () => {
      if (document.visibilityState === 'visible') void recharger();
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [recharger]);

  // Chaque action recharge depuis Sillage : c'est lui qui fait foi, Hameau
  // n'en garde aucune copie à faire diverger.
  const agir = (f: () => Promise<void>) =>
    f().then(
      () => recharger(),
      (e: unknown) => setErreur(e instanceof Error ? e.message : String(e)),
    );

  const habitudes = useMemo(() => (donnees ? habitudesDuJour(donnees.habitudes, donnees.coches, aujourdhui) : []), [donnees, aujourdhui]);
  const triees = useMemo(() => (donnees ? trierTaches(donnees.taches, aujourdhui) : []), [donnees, aujourdhui]);
  const ouvertes = triees.filter((t) => !t.done_at);
  const faites = triees.filter((t) => t.done_at);
  const synchro = derniereSynchro();

  if (!lien)
    return (
      <div className="pile">
        <Connexion
          emailSuggere={emailSuggere}
          surLie={(l) => {
            setLien(l);
            surLien(l);
          }}
        />
      </div>
    );

  return (
    <div className="pile taches">
      <section className="carte">
        <div className="entete">
          <h2>Aujourd’hui dans Sillage</h2>
          <span className="pastille">
            {habitudes.filter((h) => h.faite).length} / {habitudes.length}
          </span>
        </div>
        {erreur && <p className="alerte">{erreur}</p>}
        {!donnees && !erreur && <p className="aide">Chargement…</p>}
        {donnees && habitudes.length === 0 && <p className="vide">Aucune habitude attendue aujourd’hui.</p>}
        <ul className="liste-cases">
          {habitudes.map((h) => (
            <li key={h.id}>
              <button className={h.faite ? 'case-a-cocher faite' : 'case-a-cocher'} aria-pressed={h.faite} onClick={() => void agir(() => cocher(lien.profilId, h.id, aujourdhui, !h.faite))}>
                <span className="coche" aria-hidden>
                  {h.faite && <IconeCoche taille={14} />}
                </span>
                <span className="case-texte">
                  <strong>{h.titre}</strong>
                  {h.semaine && (
                    <span className="aide">
                      {h.semaine.faites} / {h.semaine.cible} cette semaine
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="carte">
        <div className="entete">
          <h2>Tâches</h2>
          <span className="pastille">{ouvertes.length}</span>
        </div>
        <FormulaireTache surAjouter={(t) => agir(() => ajouterTache(lien.profilId, t))} />
        {donnees && ouvertes.length === 0 && <p className="vide">Rien à faire. Profite, ou ajoute la prochaine.</p>}
        <ul className="liste-cases">
          {ouvertes.map((t) => {
            const j = joursAvant(t.due_on, aujourdhui);
            const echeance = echeanceTexte(t.due_on, aujourdhui);
            return (
              <li key={t.id} className="ligne-tache">
                <button className="case-a-cocher" aria-label={`Marquer « ${t.title} » comme faite`} onClick={() => void agir(() => marquerTache(t.id, true))}>
                  <span className="coche" aria-hidden />
                </button>
                <span className="case-texte">
                  <strong>{t.title}</strong>
                  <span className="ligne-meta">
                    {echeance && <span className={j !== null && j < 0 ? 'etiquette retard' : j === 0 ? 'etiquette urgent' : 'etiquette'}>{echeance}</span>}
                    {t.importance === 3 && <span className="etiquette urgent">importante</span>}
                    {t.estimate_min !== null && <span className="etiquette">{formatDuree(t.estimate_min)}</span>}
                  </span>
                </span>
                <button
                  className="bouton icone discret petit-icone"
                  disabled={sessionEnCours}
                  title={sessionEnCours ? 'Une session tourne déjà' : 'Lancer une session sur cette tâche'}
                  aria-label={`Lancer une session sur « ${t.title} »`}
                  onClick={() => surLancer(t)}
                >
                  <IconeLecture />
                </button>
              </li>
            );
          })}
        </ul>
        {faites.length > 0 && (
          <details open={faitesOuvertes} onToggle={(e) => setFaitesOuvertes((e.target as HTMLDetailsElement).open)}>
            <summary>Faites depuis hier ({faites.length})</summary>
            <ul className="liste-cases">
              {faites.map((t) => (
                <li key={t.id}>
                  <button className="case-a-cocher faite" aria-pressed onClick={() => void agir(() => marquerTache(t.id, false))} title="Remettre à faire">
                    <span className="coche" aria-hidden>
                      <IconeCoche taille={14} />
                    </span>
                    <span className="case-texte">
                      <strong>{t.title}</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="carte pied-sillage">
        <p>
          Relié au profil <strong>{lien.nom}</strong> de Sillage.{' '}
          {synchro ? `Temps envoyé ${new Date(synchro.quand).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.` : 'Le temps partira après la prochaine session.'}
        </p>
        <div className="actions gauche">
          <button className="bouton discret" disabled={chargement} onClick={() => void recharger()}>
            {chargement ? 'Actualisation…' : 'Actualiser'}
          </button>
          <a className="bouton discret" href={`${SILLAGE.app}/lifestyle/tasks`} target="_blank" rel="noreferrer">
            Ouvrir Sillage
          </a>
          <button
            className="bouton discret"
            onClick={() => {
              if (!confirm('Délier Sillage sur cet appareil ? Le temps déjà envoyé reste dans Sillage.')) return;
              void delier().then(() => {
                setLien(null);
                setDonnees(null);
                surLien(null);
              });
            }}
          >
            Délier
          </button>
        </div>
      </section>
    </div>
  );
}

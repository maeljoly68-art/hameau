import { useCallback, useEffect, useState } from 'react';
import { bornesPeriode, classer, ecartAuSuivant, formaterCode, joursDePeriode, lienInvitation, normaliserCode, type Membre, type Periode, type Rang } from '../../core/classement.ts';
import { ecouleEffectif } from '../../core/session.ts';
import { formatDuree } from '../../core/temps.ts';
import type { Profil } from '../../core/types.ts';
import { ajouterAmi, chargerClassement, monCode, nouveauCode, retirerAmi } from '../../data/amis.ts';
import { Portrait } from '../GardeRobe.tsx';
import { IconeCopier, IconePartager } from '../Icones.tsx';

const PERIODES: { id: Periode; nom: string; texte: string }[] = [
  { id: 'jour', nom: 'Aujourd’hui', texte: 'aujourd’hui' },
  { id: 'semaine', nom: 'Semaine', texte: 'cette semaine' },
  { id: 'mois', nom: 'Mois', texte: 'ce mois-ci' },
];

const nomDe = (m: Membre) => (m.moi ? 'Toi' : m.pseudo?.trim() || 'Sans pseudo');

/** Ce que fait ce membre en ce moment : la session qui tourne chez lui, s'il y en a une. */
function EnCe({ membre, maintenant }: { membre: Membre; maintenant: number }) {
  const o = membre.ouverte;
  if (!o) return null;
  if (o.pauseDepuis) return <span className="en-direct pause">En pause</span>;
  const minutes = ecouleEffectif({ debut: o.debut, fin: null, pauseSecondes: o.pauseSecondes, pauseDepuis: null }, maintenant);
  return (
    <span className="en-direct">
      <span className="point-direct" aria-hidden /> En session · {formatDuree(minutes)}
    </span>
  );
}

function Barres({ valeurs, max }: { valeurs: number[]; max: number }) {
  if (valeurs.length <= 1 || max <= 0) return null;
  return (
    <span className={valeurs.length > 7 ? 'barres serrees' : 'barres'} aria-hidden>
      {valeurs.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(v > 0 ? 12 : 4, (v / max) * 100)}%` }} className={v > 0 ? 'pleine' : undefined} />
      ))}
    </span>
  );
}

function Podium({ rangs }: { rangs: Rang[] }) {
  // Deuxième à gauche, premier au centre, troisième à droite : la marche du
  // milieu est la plus haute, comme sur un vrai podium.
  const places = [rangs[1], rangs[0], rangs[2]];
  return (
    <div className="podium">
      {places.map((r, i) =>
        r ? (
          <div key={r.membre.id} className={`marche marche-${[2, 1, 3][i]}${r.membre.moi ? ' moi' : ''}`}>
            <Portrait apparence={r.membre.apparence} className="podium-perso" pose={r.membre.ouverte && !r.membre.ouverte.pauseDepuis ? 'travail' : 'repos'} />
            <strong>{nomDe(r.membre)}</strong>
            <span className="podium-temps">{formatDuree(r.minutes)}</span>
            <span className="podium-socle">{r.rang}</span>
          </div>
        ) : (
          <div key={`vide${i}`} className="marche vide" />
        ),
      )}
    </div>
  );
}

export default function Amis({ synchronise, profil, maintenant, invitation, surPseudo, surInvitationTraitee, toast }: {
  synchronise: boolean;
  profil: Profil;
  maintenant: number;
  invitation: string | null;
  surPseudo: (pseudo: string) => Promise<void>;
  surInvitationTraitee: () => void;
  toast: (texte: string) => void;
}) {
  const [periode, setPeriode] = useState<Periode>('semaine');
  const [membres, setMembres] = useState<Membre[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [pseudo, setPseudo] = useState(profil.pseudo);
  const [occupe, setOccupe] = useState(false);
  const [gestion, setGestion] = useState(false);

  const charger = useCallback(async () => {
    const { depuis, jours } = bornesPeriode(new Date(), periode);
    try {
      setMembres(await chargerClassement(depuis, jours));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }, [periode]);

  // Rechargé à chaque changement de période, chaque minute, et au retour sur
  // l'app : c'est ce qui montre qu'un ami vient de lancer une session.
  useEffect(() => {
    if (!synchronise) return;
    const premier = window.setTimeout(() => void charger(), 0);
    const id = window.setInterval(() => void charger(), 60_000);
    const auRetour = () => document.visibilityState === 'visible' && void charger();
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearTimeout(premier);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [synchronise, charger]);

  useEffect(() => {
    if (!synchronise || !profil.pseudo) return;
    let fini = false;
    monCode().then(
      (c) => !fini && setCode(c),
      (e: unknown) => !fini && setErreur(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      fini = true;
    };
  }, [synchronise, profil.pseudo]);

  if (!synchronise) {
    return (
      <section className="carte">
        <h2>Classement entre amis</h2>
        <p className="aide">Le classement passe par ton compte : c’est lui qui relie ton hameau à ceux de tes amis. Crée-le ou connecte-toi depuis l’onglet Réglages, tes sessions de cet appareil pourront y être importées.</p>
      </section>
    );
  }

  const ajouter = async (brut: string) => {
    const c = normaliserCode(brut);
    if (!c) return toast('Un code ami fait 8 caractères, sans I, O, 0 ni 1.');
    setOccupe(true);
    try {
      const ami = await ajouterAmi(c);
      toast(`${ami.pseudo} rejoint ton classement.`);
      setSaisie('');
      await charger();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  };

  const lien = code ? lienInvitation(new URL(import.meta.env.BASE_URL, location.origin).href, code) : null;
  const partager = async () => {
    if (!lien || !code) return;
    const texte = `Rejoins mon hameau ! Mon code ami : ${formaterCode(code)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Hameau', text: texte, url: lien });
      else {
        await navigator.clipboard.writeText(`${texte}\n${lien}`);
        toast('Lien d’invitation copié.');
      }
    } catch {
      // Partage annulé : rien à signaler.
    }
  };

  if (!profil.pseudo) {
    return (
      <section className="carte">
        <h2>Ton nom dans le classement</h2>
        <p className="aide">Tes amis verront ce pseudo, ton personnage, ton niveau et ton temps de concentration — jamais le détail de tes sessions.</p>
        <form
          className="ligne-formulaire"
          onSubmit={(e) => {
            e.preventDefault();
            const p = pseudo.trim();
            if (p) void surPseudo(p.slice(0, 24));
          }}
        >
          <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={24} placeholder="Ton pseudo" aria-label="Pseudo" autoComplete="nickname" />
          <button className="bouton" disabled={!pseudo.trim()}>
            Continuer
          </button>
        </form>
      </section>
    );
  }

  const rangs = membres ? classer(membres) : [];
  const ecart = ecartAuSuivant(rangs);
  const texte = PERIODES.find((p) => p.id === periode)!.texte;
  const max = Math.max(1, ...rangs.flatMap((r) => r.membre.parJour));
  const jours = membres ? joursDePeriode(bornesPeriode(new Date(maintenant), periode).depuis, bornesPeriode(new Date(maintenant), periode).jours) : [];
  const seul = rangs.length <= 1;
  const premier = rangs[0];

  return (
    <div className="page amis">
      {invitation && (
        <section className="carte invitation">
          <div>
            <h2>Une invitation t’attend</h2>
            <p className="aide">Code {formaterCode(invitation)} : vous verrez vos temps de concentration l’un de l’autre.</p>
          </div>
          <div className="actions">
            <button className="lien" onClick={surInvitationTraitee}>
              Ignorer
            </button>
            <button
              className="bouton"
              disabled={occupe}
              onClick={() => {
                surInvitationTraitee();
                void ajouter(invitation);
              }}
            >
              Accepter
            </button>
          </div>
        </section>
      )}

      <section className="carte classement">
        <div className="entete">
          <h2>Classement</h2>
          <div className="segments" role="tablist" aria-label="Période">
            {PERIODES.map((p) => (
              <button key={p.id} role="tab" aria-selected={periode === p.id} className={periode === p.id ? 'segment actif' : 'segment'} onClick={() => setPeriode(p.id)}>
                {p.nom}
              </button>
            ))}
          </div>
        </div>
        {erreur && <p className="alerte">{erreur}</p>}
        {!membres && !erreur && <p className="aide">Chargement du classement…</p>}
        {membres && !seul && <Podium rangs={rangs} />}
        {membres && (
          <p className="ecart">
            {seul
              ? 'Ajoute un ami avec son code pour lancer le classement.'
              : premier.minutes === 0
                ? `Personne n’a encore travaillé ${texte}. La place est à prendre.`
                : ecart
                  ? `Encore ${formatDuree(ecart.minutes)} pour dépasser ${nomDe(ecart.devant)}.`
                  : `Tu mènes ${texte} !`}
          </p>
        )}
        {membres && (
          <ol className="liste-classement">
            {rangs.map((r) => (
              <li key={r.membre.id} className={r.membre.moi ? 'moi' : undefined}>
                <span className="rang">{r.rang}</span>
                <Portrait apparence={r.membre.apparence} cadre="buste" className="avatar" />
                <span className="qui">
                  <strong>{nomDe(r.membre)}</strong>
                  <span className="aide">
                    {r.membre.nomHameau} · niv. {r.membre.niveau}
                  </span>
                  <EnCe membre={r.membre} maintenant={maintenant} />
                </span>
                <Barres valeurs={r.membre.parJour} max={max} />
                <span className="temps">{formatDuree(r.minutes)}</span>
                {gestion && !r.membre.moi && (
                  <button
                    className="bouton petit danger"
                    onClick={() => {
                      if (!confirm(`Retirer ${nomDe(r.membre)} de tes amis ? Vous ne verrez plus vos temps.`)) return;
                      retirerAmi(r.membre.id).then(
                        () => void charger(),
                        (e: unknown) => toast(e instanceof Error ? e.message : String(e)),
                      );
                    }}
                  >
                    Retirer
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        {membres && periode !== 'jour' && jours.length > 0 && !seul && (
          <p className="aide petite">
            Barres : minutes par jour, du {new Date(`${jours[0]}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au{' '}
            {new Date(`${jours[jours.length - 1]}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.
          </p>
        )}
        {!seul && (
          <button className="lien" onClick={() => setGestion(!gestion)}>
            {gestion ? 'Terminer' : 'Gérer mes amis'}
          </button>
        )}
      </section>

      <div className="deux">
        <section className="carte">
          <h2>Inviter</h2>
          <p className="aide">Donne ce code à un ami, ou envoie-lui le lien : il l’ajoute, et vous vous voyez l’un l’autre.</p>
          <div className="code-ami">
            <span className="code">{code ? formaterCode(code) : '········'}</span>
            <button
              className="bouton discret petit"
              disabled={!code}
              onClick={() => code && navigator.clipboard?.writeText(formaterCode(code)).then(() => toast('Code copié.'), () => undefined)}
              aria-label="Copier le code"
            >
              <IconeCopier />
            </button>
          </div>
          <div className="actions gauche">
            <button className="bouton" disabled={!lien} onClick={() => void partager()}>
              <IconePartager /> Partager le lien
            </button>
            <button
              className="lien"
              disabled={!code}
              onClick={() => {
                if (!confirm('Changer de code ? L’ancien ne marchera plus ; tes amis actuels le restent.')) return;
                nouveauCode().then(setCode, (e: unknown) => toast(e instanceof Error ? e.message : String(e)));
              }}
            >
              Changer de code
            </button>
          </div>
        </section>
        <section className="carte">
          <h2>Ajouter un ami</h2>
          <form
            className="ligne-formulaire"
            onSubmit={(e) => {
              e.preventDefault();
              void ajouter(saisie);
            }}
          >
            <input value={saisie} onChange={(e) => setSaisie(e.target.value.toUpperCase())} placeholder="ABCD-2345" aria-label="Code de ton ami" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={12} />
            <button className="bouton" disabled={occupe || !saisie.trim()}>
              Ajouter
            </button>
          </form>
          <p className="aide petite">
            Ton pseudo : <strong>{profil.pseudo}</strong>.{' '}
            <button
              className="lien"
              onClick={() => {
                const p = prompt('Nouveau pseudo (24 caractères au plus)', profil.pseudo)?.trim();
                if (p) void surPseudo(p.slice(0, 24));
              }}
            >
              Changer
            </button>
          </p>
        </section>
      </div>
    </div>
  );
}

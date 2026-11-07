// La logique de l'extension, sans rien de propre à Chrome : testable à part (tests/extension.test.ts).

export const SITES_PAR_DEFAUT = ['youtube.com', 'linkedin.com', 'instagram.com'];
export const SITES_MAX = 50;
/** Une session ouverte depuis plus longtemps est un chrono oublié : l'application le dit, nous n'enfermons personne pour autant. */
export const FRAICHEUR_MAX_MS = 60 * 60 * 1000;

/**
 * Ces domaines (et leurs parents) ne se bloquent jamais : l'application où l'on arrête son chrono, et la base qui
 * le garde. Sans cette garde, écrire « github.io » dans la liste enfermerait la personne dehors, chrono en cours.
 */
export const DOMAINES_PROTEGES = ['maeljoly68-art.github.io', 'github.io', 'nisjysdlyryyrsgwmcaa.supabase.co', 'supabase.co', 'supabase.com'];

const FORME_DOMAINE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;

/** « https://www.YouTube.com/watch?v=1 » → « youtube.com » ; null si ça ne ressemble pas à un site. */
export function domaineDe(saisie) {
  let t = String(saisie ?? '').trim().toLowerCase();
  if (t === '') return null;
  t = t.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  t = t.split(/[/?#]/)[0];
  t = t.replace(/^[^@]*@/, '');
  t = t.replace(/:\d+$/, '');
  t = t.replace(/^www\./, '').replace(/\.$/, '');
  return FORME_DOMAINE.test(t) ? t : null;
}

/** Ce domaine est-il celui d'un site qu'on ne bloque jamais, ou l'un de ses sous-domaines ? */
export function estProtege(domaine) {
  return DOMAINES_PROTEGES.some((p) => domaine === p || domaine.endsWith(`.${p}`) || p.endsWith(`.${domaine}`));
}

/**
 * Une liste saisie (une entrée par ligne, ou séparées par des virgules ou des espaces) → les domaines retenus, sans
 * doublon, et ce qu'on a écarté avec la raison.
 */
export function lireSites(texte) {
  const sites = [];
  const ecartes = [];
  for (const brut of String(texte ?? '').split(/[\s,;]+/)) {
    if (brut.trim() === '') continue;
    const d = domaineDe(brut);
    if (d === null) ecartes.push({ saisie: brut, raison: 'pas un site' });
    else if (estProtege(d)) ecartes.push({ saisie: brut, raison: 'Hameau et sa base ne se bloquent jamais' });
    else if (!sites.includes(d)) {
      if (sites.length >= SITES_MAX) ecartes.push({ saisie: brut, raison: `${SITES_MAX} sites au plus` });
      else sites.push(d);
    }
  }
  return { sites, ecartes };
}

/**
 * L'état du blocage d'après la ligne de la session ouverte (ou null s'il n'y en a pas).
 * Une pause laisse bloqué, sauf si l'on a choisi de débloquer pendant les pauses.
 */
export function etatDepuisSession(ligne, options = {}) {
  if (!ligne || ligne.fin) return { enCours: false, bloque: false, enPause: false, categorie: '', debut: null, sessionId: null };
  const enPause = ligne.pause_depuis != null;
  return {
    enCours: true,
    bloque: !(enPause && options.debloquerEnPause === true),
    enPause,
    categorie: typeof ligne.categorie === 'string' ? ligne.categorie : '',
    debut: typeof ligne.debut === 'string' ? ligne.debut : null,
    sessionId: typeof ligne.id === 'string' ? ligne.id : null,
  };
}

/**
 * Faut-il garder le blocage quand on ne peut pas joindre la base ? Oui un moment (on ne se débloque pas en coupant le
 * wifi une minute), mais plus d'une heure sans nouvelle : dans le doute, on ne bloque pas.
 */
export function garderBlocage(precedent, maintenantMs) {
  if (!precedent || precedent.bloque !== true) return false;
  const ok = Number(precedent.dernierSucces);
  return Number.isFinite(ok) && maintenantMs - ok <= FRAICHEUR_MAX_MS;
}

/** Les règles de redirection (une par site) vers la page de blocage, qui retient l'adresse demandée. */
export function reglesBlocage(sites, racineExtension) {
  return sites.map((site, i) => ({
    id: i + 1,
    priority: 1,
    action: { type: 'redirect', redirect: { regexSubstitution: `${racineExtension}bloque.html?u=\\0` } },
    condition: { regexFilter: '^https?://.*', requestDomains: [site], resourceTypes: ['main_frame'] },
  }));
}

/** Cet hôte tombe-t-il sous l'un des sites bloqués (le site lui-même ou un sous-domaine) ? */
export function hoteBloque(hote, sites) {
  const h = String(hote ?? '').toLowerCase();
  return sites.some((s) => h === s || h.endsWith(`.${s}`));
}

/** L'adresse demandée avant le blocage, retrouvée dans celle de la page de blocage ; null si ce n'est pas du web. */
export function urlOriginale(search, hash = '') {
  const brut = String(search ?? '').replace(/^\?u=/, '') + String(hash ?? '');
  try {
    const u = new URL(brut);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Minutes écoulées depuis le début d'une session ; null si le début est illisible. */
export function minutesDepuis(debutIso, maintenantMs) {
  const d = Date.parse(String(debutIso ?? ''));
  return Number.isFinite(d) ? Math.max(0, Math.floor((maintenantMs - d) / 60000)) : null;
}

/** Ce que dit la fenêtre de l'extension : le titre et le détail, d'après l'état et la liste. */
export function phraseEtat(etat, sites, maintenantMs) {
  if (!etat || !etat.enCours) return { titre: 'Aucun chrono', detail: 'Rien n’est bloqué : tout se débloque quand le chrono s’arrête.' };
  const duree = minutesDepuis(etat.debut, maintenantMs);
  const sur = etat.categorie.trim() === '' ? '' : ` sur « ${etat.categorie.trim()} »`;
  const depuis = duree === null ? '' : ` depuis ${duree} min`;
  if (!etat.bloque) return { titre: `Pause${sur}`, detail: 'Les sites sont débloqués pendant la pause : ils se rebloquent à la reprise.' };
  const liste = sites.length === 0 ? 'aucun site (la liste est vide)' : sites.join(', ');
  return { titre: `Chrono en cours${sur}${depuis}`, detail: `Bloqués : ${liste}.` };
}

/**
 * Les adresses à autoriser pour bloquer ces sites : Chrome ne redirige une page que s'il a accès au site. Les sites par
 * défaut sont déclarés dans le manifeste ; ceux qu'on ajoute se demandent à la personne, à l'enregistrement.
 */
export function originesAAutoriser(sites) {
  return sites.filter((s) => !SITES_PAR_DEFAUT.includes(s)).map((s) => `*://*.${s}/*`);
}

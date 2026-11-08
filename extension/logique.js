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

const CHEMIN_VALIDE = /^\/[a-z0-9._~%!$&'()*+,;=:@/-]*$/;

/**
 * Une entrée de la liste : « youtube.com » (tout le site) ou « youtube.com/shorts » (une partie seulement). Tolère une
 * adresse complète copiée du navigateur : protocole, www, requête et fragment s'en vont. null si ça n'a pas la forme
 * d'un site, ou d'un chemin.
 */
export function entreeDe(saisie) {
  const brut = String(saisie ?? '').trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const i = brut.search(/[/?#]/);
  const hote = domaineDe(i < 0 ? brut : brut.slice(0, i));
  if (hote === null) return null;
  if (i < 0 || brut[i] !== '/') return hote;
  const chemin = `/${brut.slice(i + 1).split(/[?#]/)[0].replace(/\/+$/, '')}`;
  if (chemin === '/') return hote;
  return CHEMIN_VALIDE.test(chemin) ? `${hote}${chemin}` : null;
}

/** Une entrée → son hôte et son chemin (vide : tout le site). */
export function partiesDe(entree) {
  const i = String(entree).indexOf('/');
  return i < 0 ? { hote: String(entree), chemin: '' } : { hote: String(entree).slice(0, i), chemin: String(entree).slice(i) };
}

/**
 * Une liste saisie (une entrée par ligne, ou séparées par des virgules ou des espaces) → les entrées retenues, sans
 * doublon, et ce qu'on a écarté avec la raison.
 */
export function lireSites(texte) {
  const sites = [];
  const ecartes = [];
  for (const brut of String(texte ?? '').split(/[\s,;]+/)) {
    if (brut.trim() === '') continue;
    const e = entreeDe(brut);
    if (e === null) ecartes.push({ saisie: brut, raison: 'pas un site' });
    else if (estProtege(partiesDe(e).hote)) ecartes.push({ saisie: brut, raison: 'Hameau et sa base ne se bloquent jamais' });
    else if (!sites.includes(e)) {
      if (sites.length >= SITES_MAX) ecartes.push({ saisie: brut, raison: `${SITES_MAX} sites au plus` });
      else sites.push(e);
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

const echapper = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Les règles de redirection (une par entrée) vers la page de blocage, qui retient l'adresse demandée. Un site entier :
 * le domaine et ses sous-domaines. Un chemin (« youtube.com/shorts ») : seulement les adresses qui commencent ainsi.
 */
export function reglesBlocage(sites, racineExtension) {
  return sites.map((entree, i) => {
    const { hote, chemin } = partiesDe(entree);
    const redirection = (substitution) => ({ type: 'redirect', redirect: { regexSubstitution: `${racineExtension}bloque.html?u=${substitution}` } });
    if (chemin === '') return { id: i + 1, priority: 1, action: redirection('\\0'), condition: { regexFilter: '^https?://.*', requestDomains: [hote], resourceTypes: ['main_frame'] } };
    // Un chemin ne s'exprime pas avec requestDomains : une expression sur l'adresse entière, capturée pour la renvoyer telle quelle.
    return { id: i + 1, priority: 1, action: redirection('\\1'), condition: { regexFilter: `^(https?://([^/]+\\.)?${echapper(hote)}(?::\\d+)?${echapper(chemin)}(?:[/?#].*)?)$`, resourceTypes: ['main_frame'] } };
  });
}

/** Cet hôte tombe-t-il sous l'un des sites bloqués (le site lui-même ou un sous-domaine) ? */
export function hoteBloque(hote, sites) {
  const h = String(hote ?? '').toLowerCase();
  return sites.some((s) => h === s || h.endsWith(`.${s}`));
}

/** Cette adresse tombe-t-elle sous l'une des entrées (le site, ou le chemin demandé) ? */
export function urlBloquee(adresse, sites) {
  let u;
  try {
    u = new URL(String(adresse));
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const chemin = u.pathname.toLowerCase();
  return sites.some((entree) => {
    const p = partiesDe(entree);
    if (!hoteBloque(u.hostname, [p.hote])) return false;
    return p.chemin === '' || chemin === p.chemin || chemin.startsWith(`${p.chemin}/`);
  });
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
  const hotes = sites.map((s) => partiesDe(s).hote).filter((h) => !SITES_PAR_DEFAUT.includes(h));
  return [...new Set(hotes)].map((h) => `*://*.${h}/*`);
}

// ── Confirmer avant de changer de page ──

/** Les réglages de la confirmation, tels qu'ils sont tant que la personne n'a rien changé. */
export const CONFIRMATION_DEFAUT = { active: true, delaiS: 5, passeMin: 10 };
/** Des sites où l'on travaille vraiment (les artefacts de cours) : jamais de question dessus. */
export const SITES_DE_TRAVAIL_DEFAUT = ['claude.ai'];
export const DELAIS_S = [0, 3, 5, 10, 20];
export const PASSES_MIN = [5, 10, 30, 60, 240];

/** Les réglages lus du stockage, ramenés à des valeurs permises : une valeur abîmée ne casse pas la confirmation. */
export function confirmationValide(brut) {
  const o = brut && typeof brut === 'object' ? brut : {};
  return {
    active: o.active !== false,
    delaiS: DELAIS_S.includes(o.delaiS) ? o.delaiS : CONFIRMATION_DEFAUT.delaiS,
    passeMin: PASSES_MIN.includes(o.passeMin) ? o.passeMin : CONFIRMATION_DEFAUT.passeMin,
  };
}

const SECOND_NIVEAU = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go']);

/**
 * Le « site » d'un hôte, à peu près (sans liste des suffixes publics) : docs.google.com et mail.google.com sont le même
 * site ; bbc.co.uk garde trois étiquettes. Changer de sous-domaine n'est pas changer de page au sens du chrono.
 */
export function siteDe(hote) {
  const h = String(hote ?? '').toLowerCase().replace(/\.$/, '');
  if (!h.includes('.') || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return h;
  const e = h.split('.');
  const n = e[e.length - 1].length === 2 && SECOND_NIVEAU.has(e[e.length - 2]) ? 3 : 2;
  return e.slice(-n).join('.');
}

/** Un laissez-passer valable pour ce site à cet instant ? (`passes` : site → instant d'expiration, en ms.) */
export function passeValide(passes, site, maintenantMs) {
  return Number(passes?.[site]) > maintenantMs;
}

/** Les laissez-passer avec celui-ci en plus (et sans ceux qui ont expiré : la liste ne grossit pas sans fin). */
export function ajouterPasse(passes, site, dureeMin, maintenantMs) {
  const sortie = {};
  for (const [s, fin] of Object.entries(passes ?? {})) if (Number(fin) > maintenantMs) sortie[s] = fin;
  // Un laissez-passer plus long déjà donné pour ce site n'est jamais raccourci.
  sortie[site] = Math.max(Number(sortie[site]) || 0, maintenantMs + dureeMin * 60000);
  return sortie;
}

/**
 * Faut-il demander « tu es sûr ? » avant cette navigation ? Oui quand un chrono tourne (pas en pause) et qu'on va sur un
 * AUTRE site que celui où l'on est, sauf :
 *  - une page qui n'est pas du web, ou Hameau et sa base (on doit toujours pouvoir y arrêter son chrono) ;
 *  - un site de travail (liste de la personne), ou un site pour lequel elle vient de dire « continuer » (laissez-passer) ;
 *  - une page bloquée : c'est la page de blocage, plus ferme, qui répond.
 */
export function doitConfirmer({ etat, destination, actuelle, autorises = [], bloques = [], passes = {}, maintenantMs }) {
  if (!etat || !etat.enCours || etat.enPause) return false;
  let d;
  try {
    d = new URL(String(destination));
  } catch {
    return false;
  }
  if (d.protocol !== 'http:' && d.protocol !== 'https:') return false;
  if (estProtege(d.hostname)) return false;
  if (urlBloquee(d.href, bloques)) return false;
  if (hoteBloque(d.hostname, autorises.map((a) => partiesDe(a).hote))) return false;
  if (passeValide(passes, siteDe(d.hostname), maintenantMs)) return false;
  try {
    // Une page d'origine qui n'est pas du web (onglet vide, page interne) n'a pas d'hôte qui puisse ressembler au site demandé.
    if (siteDe(new URL(String(actuelle)).hostname) === siteDe(d.hostname)) return false;
  } catch {
    // Pas de page d'origine (nouvel onglet, onglet vide) : on vient de nulle part, donc d'un autre site.
  }
  return true;
}

/** Le décompte du jour (jours « AAAA-MM-JJ » de l'appareil) : combien de fois on est resté concentré, combien de fois on a continué. */
export function compter(compteurs, jour, genre) {
  const sortie = { ...(compteurs ?? {}) };
  const j = sortie[jour] ?? { resistes: 0, continues: 0 };
  sortie[jour] = { resistes: j.resistes + (genre === 'rester' ? 1 : 0), continues: j.continues + (genre === 'continuer' ? 1 : 0) };
  // Une semaine de mémoire suffit à la fenêtre de l'extension.
  const jours = Object.keys(sortie).sort().slice(-7);
  return Object.fromEntries(jours.map((k) => [k, sortie[k]]));
}

// ── Les sites sur lesquels on travaille pendant le chrono ──

/** Les réglages du suivi : actif par défaut (c'est ce qu'on a demandé), sans les titres des pages, sans exclusion. */
export const SUIVI_DEFAUT = { active: true, titres: false, exclusions: [] };
/** Au-delà, un segment sans nouvelle de l'extension (ordinateur en veille) n'est pas du travail : il est plafonné. */
export const SECONDES_SEGMENT_MAX = 120;
export const TITRE_MAX = 120;
/** Au plus ce nombre de couples (site, titre) par session : les titres changent tout le temps (« (3) Messages »). */
export const CLES_MAX = 200;
/** Sans touche ni souris pendant ce temps (5 min), on ne travaille plus : lire un cours reste du travail, dormir non. */
export const SEUIL_INACTIVITE_S = 300;
export const SECONDES_JOUR = 86400;

export function suiviValide(brut) {
  const o = brut && typeof brut === 'object' ? brut : {};
  // Une exclusion vise un site entier : un chemin collé (« mabanque.fr/compte ») devient le site.
  const exclusions = Array.isArray(o.exclusions) ? [...new Set(lireSites(o.exclusions.join('\n')).sites.map((e) => partiesDe(e).hote))] : [];
  return { active: o.active !== false, titres: o.titres === true, exclusions };
}

/**
 * Le site qu'on retient pour une adresse : le NOM du site (l'hôte, sans « www. »), jamais l'adresse complète (une adresse
 * peut porter un jeton, un identifiant, une recherche). null si ce n'est pas du web, si c'est Hameau ou sa base (des outils,
 * pas des sites de travail), ou si la personne a demandé de ne jamais le retenir.
 */
export function siteEnregistre(adresse, exclusions = []) {
  let u;
  try {
    u = new URL(String(adresse));
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!FORME_DOMAINE.test(h) || estProtege(h)) return null;
  if (hoteBloque(h, exclusions.map((e) => partiesDe(e).hote))) return null;
  return h;
}

/** Le titre d'une page, nettoyé et borné. */
export const titreEnregistre = (titre) => String(titre ?? '').replace(/\s+/g, ' ').trim().slice(0, TITRE_MAX).trim();

export const cleActivite = (site, titre) => `${site}\n${titre}`;
export function partiesCle(cle) {
  const i = cle.indexOf('\n');
  return i < 0 ? { site: cle, titre: '' } : { site: cle.slice(0, i), titre: cle.slice(i + 1) };
}

export const SUIVI_VIDE = { sessionId: null, totaux: {}, envoye: {}, courant: null };

/** Les secondes d'un segment, plafonnées : jamais négatives, jamais plus que ce qu'une absence de nouvelles permet. */
export function secondesEntre(depuisMs, maintenantMs, max = SECONDES_SEGMENT_MAX) {
  const s = (maintenantMs - depuisMs) / 1000;
  return Number.isFinite(s) ? Math.min(max, Math.max(0, s)) : 0;
}

/** Referme le segment en cours : son temps rejoint le total de son site, et plus rien ne court. */
export function cloturer(suivi, maintenantMs) {
  if (!suivi.courant) return { ...suivi, courant: null };
  const totaux = { ...suivi.totaux };
  totaux[suivi.courant.cle] = (totaux[suivi.courant.cle] ?? 0) + secondesEntre(suivi.courant.depuis, maintenantMs);
  return { ...suivi, totaux, courant: null };
}

/**
 * Un nouvel instant : le segment en cours est refermé, et un autre s'ouvre si on travaille VRAIMENT — chrono qui tourne
 * (pas en pause), fenêtre du navigateur au premier plan, personne qui dort devant (`actif`), et un site à retenir.
 * `onglet` : { site, titre } de l'onglet visible, ou null.
 */
export function avancer(suivi, { maintenantMs, travaille, actif, onglet }) {
  const ferme = cloturer(suivi, maintenantMs);
  if (!travaille || !actif || !onglet) return ferme;
  let cle = cleActivite(onglet.site, onglet.titre);
  // Trop de titres différents : le reste se range sous le site seul.
  if (!(cle in ferme.totaux) && Object.keys(ferme.totaux).length >= CLES_MAX) cle = cleActivite(onglet.site, '');
  return { ...ferme, courant: { cle, depuis: maintenantMs } };
}

const arrondi = (s) => Math.round(s);

/** Les lignes à envoyer : celles dont le total (arrondi à la seconde) a changé depuis le dernier envoi réussi. */
export function lignesAEnvoyer(suivi, appareil, maintenantIso) {
  const lignes = [];
  for (const [cle, s] of Object.entries(suivi.totaux)) {
    const secondes = Math.min(SECONDES_JOUR, arrondi(s));
    // Rien d'envoyé encore vaut 0 : un total qui arrondit à zéro n'est donc jamais envoyé non plus.
    if (secondes === (suivi.envoye[cle] ?? 0)) continue;
    const { site, titre } = partiesCle(cle);
    lignes.push({ appareil, site, titre, secondes, maj_le: maintenantIso });
  }
  return lignes;
}

/** Ce qui vient d'être envoyé avec succès est noté : le prochain envoi ne renverra que la différence. */
export function apresEnvoi(suivi, lignes) {
  const envoye = { ...suivi.envoye };
  for (const l of lignes) envoye[cleActivite(l.site, l.titre)] = l.secondes;
  return { ...suivi, envoye };
}

/** Le temps de la session par site (titres confondus), du plus long au plus court : ce que la fenêtre de l'extension montre. */
export function parSite(suivi, n = 3) {
  const m = new Map();
  for (const [cle, s] of Object.entries(suivi.totaux)) {
    const { site } = partiesCle(cle);
    m.set(site, (m.get(site) ?? 0) + s);
  }
  return [...m.entries()].map(([site, secondes]) => ({ site, secondes: arrondi(secondes) })).filter((x) => x.secondes > 0).sort((a, b) => b.secondes - a.secondes || a.site.localeCompare(b.site)).slice(0, n);
}

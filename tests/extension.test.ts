import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADRESSE_HAMEAU, CLE_PUBLIQUE, URL_SUPABASE } from '../extension/config.js';
import { VERSION_EXTENSION, enRetard } from '../src/core/extension.ts';
import {
  CLES_MAX,
  SECONDES_SEGMENT_MAX,
  SUIVI_DEFAUT,
  SUIVI_VIDE,
  apresEnvoi,
  avancer,
  cleActivite,
  cloturer,
  lignesAEnvoyer,
  parSite,
  partiesCle,
  secondesEntre,
  siteEnregistre,
  suiviValide,
  titreEnregistre,
  CONFIRMATION_DEFAUT,
  DELAIS_S,
  DOMAINES_PROTEGES,
  PASSES_MIN,
  SITES_DE_TRAVAIL_DEFAUT,
  ajouterPasse,
  compter,
  confirmationValide,
  doitConfirmer,
  entreeDe,
  partiesDe,
  passeValide,
  siteDe,
  urlBloquee,
  FRAICHEUR_MAX_MS,
  SITES_MAX,
  SITES_PAR_DEFAUT,
  domaineDe,
  estProtege,
  etatDepuisSession,
  garderBlocage,
  hoteBloque,
  lireSites,
  minutesDepuis,
  originesAAutoriser,
  phraseEtat,
  reglesBlocage,
  urlOriginale,
} from '../extension/logique.js';

test('l’extension parle au même projet que l’application', () => {
  const config = readFileSync(new URL('../src/data/config.ts', import.meta.url), 'utf8');
  assert.ok(config.includes(`url: '${URL_SUPABASE}'`), 'l’adresse du projet');
  assert.ok(config.includes(`cle: '${CLE_PUBLIQUE}'`), 'la clé publiable');
  assert.ok(!/sb_secret_|service_role/.test(readFileSync(new URL('../extension/config.js', import.meta.url), 'utf8')), 'aucune clé secrète');
  assert.ok(ADRESSE_HAMEAU.startsWith('https://') && ADRESSE_HAMEAU.endsWith('/'));
});

test('le manifeste déclare les droits utiles et rien de plus large que la base', () => {
  const m = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.equal(m.manifest_version, 3);
  // L'accès à la base, et aux trois sites bloqués par défaut (Chrome ne redirige que les sites auxquels l'extension a accès) ; le reste se demande.
  const attendus = [`${URL_SUPABASE}/*`, ...SITES_PAR_DEFAUT.map((s) => `*://*.${s}/*`)];
  assert.deepEqual([...m.host_permissions].sort(), attendus.sort());
  assert.deepEqual(m.optional_host_permissions, ['*://*/*']);
  for (const p of ['declarativeNetRequest', 'storage', 'alarms', 'tabs', 'webNavigation', 'idle']) assert.ok(m.permissions.includes(p), p);
  assert.ok(m.content_scripts.every((c: { matches: string[] }) => c.matches.every((x) => x === `${ADRESSE_HAMEAU}*`)), 'le relais ne tourne que sur Hameau');
  assert.ok(!m.permissions.includes('<all_urls>') && !m.permissions.includes('webRequest'));
});

test('un domaine se retrouve dans une adresse, un nom ou un copier-coller', () => {
  assert.equal(domaineDe('youtube.com'), 'youtube.com');
  assert.equal(domaineDe('https://www.YouTube.com/watch?v=abc#t=3'), 'youtube.com');
  assert.equal(domaineDe('  http://m.youtube.com:8080/x '), 'm.youtube.com');
  assert.equal(domaineDe('user:pass@linkedin.com/in/moi'), 'linkedin.com');
  assert.equal(domaineDe('www.instagram.com.'), 'instagram.com');
  assert.equal(domaineDe('mon-site.co.uk'), 'mon-site.co.uk');
  for (const mauvais of ['', '   ', 'youtube', 'localhost', '192.168.0.1', 'pas un site', '-x.com', 'a..com', 'x.c', '.com', null, undefined, 42]) assert.equal(domaineDe(mauvais), null, String(mauvais));
});

test('Hameau et sa base ne se bloquent jamais, ni leurs parents', () => {
  for (const d of ['maeljoly68-art.github.io', 'github.io', 'foo.github.io', 'supabase.co', 'nisjysdlyryyrsgwmcaa.supabase.co', 'api.supabase.co']) assert.ok(estProtege(d), d);
  for (const d of ['youtube.com', 'instagram.com', 'notgithub.io', 'github.com']) assert.ok(!estProtege(d), d);
  assert.ok(DOMAINES_PROTEGES.includes('maeljoly68-art.github.io'));
});

test('une liste saisie : domaines nettoyés, sans doublon, avec les refus expliqués', () => {
  const r = lireSites('youtube.com\nhttps://www.linkedin.com/feed, instagram.com  YOUTUBE.com\ngithub.io\npas un site\n\ntiktok.com');
  assert.deepEqual(r.sites, ['youtube.com', 'linkedin.com/feed', 'instagram.com', 'tiktok.com'], 'une adresse avec chemin devient une entrée « site/chemin »');
  assert.deepEqual(r.ecartes.map((e) => e.saisie), ['github.io', 'pas', 'un', 'site']);
  assert.match(r.ecartes[0].raison, /ne se bloquent jamais/);
  assert.deepEqual(lireSites('').sites, []);
  assert.deepEqual(lireSites(null).sites, []);
});

test('la liste est bornée', () => {
  const beaucoup = Array.from({ length: SITES_MAX + 3 }, (_, i) => `site${i}.com`).join('\n');
  const r = lireSites(beaucoup);
  assert.equal(r.sites.length, SITES_MAX);
  assert.equal(r.ecartes.length, 3);
  assert.match(r.ecartes[0].raison, /au plus/);
});

test('les sites par défaut sont ceux demandés, et aucun n’est protégé', () => {
  assert.deepEqual(SITES_PAR_DEFAUT, ['youtube.com', 'linkedin.com', 'instagram.com']);
  assert.ok(SITES_PAR_DEFAUT.every((s) => domaineDe(s) === s && !estProtege(s)));
});

test('une session ouverte bloque ; sans session, ou close, rien n’est bloqué', () => {
  const ligne = { id: 's1', debut: '2026-11-07T10:00:00Z', fin: null, categorie: 'Droit', pause_depuis: null };
  assert.deepEqual(etatDepuisSession(ligne), { enCours: true, bloque: true, enPause: false, categorie: 'Droit', debut: '2026-11-07T10:00:00Z', sessionId: 's1' });
  assert.equal(etatDepuisSession(null).bloque, false);
  assert.equal(etatDepuisSession(null).enCours, false);
  assert.equal(etatDepuisSession({ ...ligne, fin: '2026-11-07T11:00:00Z' }).bloque, false);
});

test('en pause : bloqué, sauf si l’on a choisi de débloquer pendant les pauses', () => {
  const pause = { id: 's1', debut: '2026-11-07T10:00:00Z', fin: null, categorie: '', pause_depuis: '2026-11-07T10:30:00Z' };
  assert.equal(etatDepuisSession(pause).bloque, true);
  assert.equal(etatDepuisSession(pause).enPause, true);
  assert.equal(etatDepuisSession(pause, { debloquerEnPause: true }).bloque, false);
  assert.equal(etatDepuisSession(pause, { debloquerEnPause: true }).enCours, true, 'la session continue, seul le blocage lève');
  assert.equal(etatDepuisSession({ ...pause, pause_depuis: null }, { debloquerEnPause: true }).bloque, true, 'hors pause, l’option ne change rien');
});

test('une ligne étrange ne casse pas l’état', () => {
  const e = etatDepuisSession({ id: 3, debut: 5, categorie: null, fin: null });
  assert.equal(e.bloque, true);
  assert.equal(e.categorie, '');
  assert.equal(e.debut, null);
  assert.equal(e.sessionId, null);
});

test('base injoignable : on garde le blocage un moment, jamais plus d’une heure', () => {
  const t = Date.UTC(2026, 10, 7, 12, 0, 0);
  assert.equal(garderBlocage({ bloque: true, dernierSucces: t - 5 * 60_000 }, t), true);
  assert.equal(garderBlocage({ bloque: true, dernierSucces: t - FRAICHEUR_MAX_MS }, t), true, 'pile une heure : encore bloqué');
  assert.equal(garderBlocage({ bloque: true, dernierSucces: t - FRAICHEUR_MAX_MS - 1 }, t), false, 'dans le doute, on ne bloque pas');
  assert.equal(garderBlocage({ bloque: false, dernierSucces: t }, t), false, 'rien à garder');
  assert.equal(garderBlocage(null, t), false);
  assert.equal(garderBlocage({ bloque: true }, t), false, 'sans date de dernier succès');
});

test('une règle de redirection par site, vers la page de blocage qui retient l’adresse', () => {
  const r = reglesBlocage(['youtube.com', 'instagram.com'], 'chrome-extension://abc/');
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => x.id), [1, 2]);
  assert.deepEqual(r[0].condition.requestDomains, ['youtube.com']);
  assert.deepEqual(r[0].condition.resourceTypes, ['main_frame'], 'seulement la page, pas les images d’autres sites');
  assert.equal(r[0].action.redirect.regexSubstitution, 'chrome-extension://abc/bloque.html?u=\\0');
  assert.equal(r[0].condition.regexFilter, '^https?://.*');
  assert.deepEqual(reglesBlocage([], 'chrome-extension://abc/'), []);
});

test('un hôte est bloqué s’il est le site ou un de ses sous-domaines, pas un site qui lui ressemble', () => {
  const sites = ['youtube.com'];
  assert.ok(hoteBloque('youtube.com', sites));
  assert.ok(hoteBloque('www.youtube.com', sites));
  assert.ok(hoteBloque('M.YOUTUBE.com', sites));
  assert.ok(!hoteBloque('notyoutube.com', sites));
  assert.ok(!hoteBloque('youtube.com.evil.fr', sites));
  assert.ok(!hoteBloque('', sites));
  assert.ok(!hoteBloque(undefined, sites));
});

test('l’adresse demandée se retrouve, avec sa requête et son fragment ; seulement du web', () => {
  assert.equal(urlOriginale('?u=https://www.youtube.com/watch?v=abc&t=3', '#fin'), 'https://www.youtube.com/watch?v=abc&t=3#fin');
  assert.equal(urlOriginale('?u=http://exemple.fr/'), 'http://exemple.fr/');
  assert.equal(urlOriginale('?u=javascript:alert(1)'), null);
  assert.equal(urlOriginale('?u=chrome://settings'), null);
  assert.equal(urlOriginale('?u=file:///etc/passwd'), null);
  assert.equal(urlOriginale('?u=pas une adresse'), null);
  assert.equal(urlOriginale(''), null);
  assert.equal(urlOriginale(undefined), null);
});

test('minutes écoulées : arrondies vers le bas, jamais négatives, null si illisible', () => {
  const t = Date.parse('2026-11-07T10:30:59Z');
  assert.equal(minutesDepuis('2026-11-07T10:00:00Z', t), 30);
  assert.equal(minutesDepuis('2026-11-07T11:00:00Z', t), 0, 'début dans le futur (horloge décalée)');
  assert.equal(minutesDepuis('n’importe quoi', t), null);
  assert.equal(minutesDepuis(null, t), null);
});

test('la fenêtre de l’extension dit où l’on en est', () => {
  const t = Date.parse('2026-11-07T10:30:00Z');
  const sites = ['youtube.com', 'linkedin.com'];
  const en = etatDepuisSession({ id: 's', debut: '2026-11-07T10:00:00Z', fin: null, categorie: 'Droit des sociétés', pause_depuis: null });
  assert.deepEqual(phraseEtat(en, sites, t), { titre: 'Chrono en cours sur « Droit des sociétés » depuis 30 min', detail: 'Bloqués : youtube.com, linkedin.com.' });
  assert.equal(phraseEtat(etatDepuisSession(null), sites, t).titre, 'Aucun chrono');
  assert.match(phraseEtat(etatDepuisSession(null), sites, t).detail, /Rien n’est bloqué/);
  const libre = etatDepuisSession({ id: 's', debut: '2026-11-07T10:00:00Z', fin: null, categorie: '', pause_depuis: null });
  assert.equal(phraseEtat(libre, sites, t).titre, 'Chrono en cours depuis 30 min', 'sans catégorie, pas de « sur »');
  assert.match(phraseEtat(libre, [], t).detail, /liste est vide/);
  const pause = etatDepuisSession({ id: 's', debut: '2026-11-07T10:00:00Z', fin: null, categorie: 'Droit', pause_depuis: '2026-11-07T10:20:00Z' }, { debloquerEnPause: true });
  assert.equal(phraseEtat(pause, sites, t).titre, 'Pause sur « Droit »');
  assert.match(phraseEtat(pause, sites, t).detail, /se rebloquent/);
});

test('les sites ajoutés à la main se demandent à Chrome ; ceux de départ sont déjà autorisés', () => {
  assert.deepEqual(originesAAutoriser(['youtube.com', 'tiktok.com', 'm.reddit.com']), ['*://*.tiktok.com/*', '*://*.m.reddit.com/*']);
  assert.deepEqual(originesAAutoriser(SITES_PAR_DEFAUT), []);
  assert.deepEqual(originesAAutoriser([]), []);
});

// ── Une entrée : un site entier, ou une partie de site ──

test('une entrée est un site, ou un site et un chemin ; le reste d’une adresse collée s’en va', () => {
  assert.equal(entreeDe('youtube.com'), 'youtube.com');
  assert.equal(entreeDe('https://www.YouTube.com/Shorts/abc?x=1#t'), 'youtube.com/shorts/abc');
  assert.equal(entreeDe('youtube.com/shorts/'), 'youtube.com/shorts');
  assert.equal(entreeDe('reddit.com/r/Memes'), 'reddit.com/r/memes');
  assert.equal(entreeDe('youtube.com/'), 'youtube.com');
  assert.equal(entreeDe('youtube.com?x=1'), 'youtube.com');
  for (const mauvais of ['youtube.com/a b', 'youtube.com/<script>', '/shorts', 'shorts', '', null]) assert.equal(entreeDe(mauvais), null, String(mauvais));
  assert.deepEqual(partiesDe('youtube.com'), { hote: 'youtube.com', chemin: '' });
  assert.deepEqual(partiesDe('youtube.com/shorts/abc'), { hote: 'youtube.com', chemin: '/shorts/abc' });
});

test('une liste mêle sites et chemins ; Hameau reste protégé même avec un chemin', () => {
  const r = lireSites('youtube.com/shorts\nyoutube.com\ngithub.io/hameau\nreddit.com/r/memes tiktok.com');
  assert.deepEqual(r.sites, ['youtube.com/shorts', 'youtube.com', 'reddit.com/r/memes', 'tiktok.com']);
  assert.deepEqual(r.ecartes.map((e) => e.saisie), ['github.io/hameau']);
  assert.deepEqual(lireSites('youtube.com/shorts youtube.com/SHORTS/').sites, ['youtube.com/shorts'], 'même entrée une seule fois');
});

test('une adresse est bloquée si elle est sur le site, ou sous le chemin demandé, pas à côté', () => {
  assert.ok(urlBloquee('https://www.youtube.com/watch?v=1', ['youtube.com']));
  assert.ok(urlBloquee('https://m.youtube.com/', ['youtube.com']));
  assert.ok(urlBloquee('https://www.youtube.com/shorts/abc', ['youtube.com/shorts']));
  assert.ok(urlBloquee('https://www.youtube.com/shorts', ['youtube.com/shorts']));
  assert.ok(urlBloquee('https://www.youtube.com/SHORTS/abc?x=1', ['youtube.com/shorts']), 'majuscules ignorées');
  assert.ok(!urlBloquee('https://www.youtube.com/watch?v=1', ['youtube.com/shorts']), 'le reste du site reste libre');
  assert.ok(!urlBloquee('https://www.youtube.com/shortsfoo', ['youtube.com/shorts']), 'pas un chemin qui lui ressemble');
  assert.ok(!urlBloquee('https://notyoutube.com/shorts/a', ['youtube.com/shorts']));
  assert.ok(!urlBloquee('chrome://settings', ['youtube.com']));
  for (const autre of ['chrome://youtube.com/x', 'ftp://youtube.com/x', 'file://youtube.com/x', 'chrome-extension://youtube.com/x']) assert.ok(!urlBloquee(autre, ['youtube.com']), `${autre} : ce n’est pas du web`);
  assert.ok(!urlBloquee('pas une adresse', ['youtube.com']));
  assert.ok(!urlBloquee('https://youtube.com/', []));
});

test('un chemin se bloque par une expression sur l’adresse entière, un site par son domaine', () => {
  const r = reglesBlocage(['youtube.com', 'youtube.com/shorts', 'reddit.com/r/a.b'], 'chrome-extension://abc/');
  assert.deepEqual(r.map((x) => x.id), [1, 2, 3]);
  assert.deepEqual(r[0].condition.requestDomains, ['youtube.com']);
  assert.equal(r[1].condition.requestDomains, undefined, 'un chemin n’utilise pas requestDomains');
  assert.equal(r[1].action.redirect.regexSubstitution, 'chrome-extension://abc/bloque.html?u=\\1', 'l’adresse entière est capturée et renvoyée');
  const re = new RegExp(r[1].condition.regexFilter);
  assert.ok(re.test('https://www.youtube.com/shorts/abc?x=1#y'));
  assert.ok(re.test('http://youtube.com/shorts'));
  assert.ok(re.test('http://youtube.com:8080/shorts/a'), 'avec un port');
  assert.ok(!re.test('http://youtube.com:8080/watch'), 'un port ne change pas le chemin');
  assert.ok(!re.test('https://www.youtube.com/watch?v=1'));
  assert.ok(!re.test('https://www.youtube.com/shortsfoo'));
  assert.ok(!re.test('https://evilyoutube.com/shorts/a'), 'pas un autre site qui finit pareil');
  assert.ok(new RegExp(r[2].condition.regexFilter).test('https://reddit.com/r/a.b/top'), 'le point du chemin est un point');
  assert.ok(!new RegExp(r[2].condition.regexFilter).test('https://reddit.com/r/axb'), 'et pas « n’importe quel caractère »');
});

test('l’accès se demande pour l’hôte, une fois, même avec des chemins', () => {
  assert.deepEqual(originesAAutoriser(['reddit.com/r/memes', 'reddit.com/r/all', 'youtube.com/shorts']), ['*://*.reddit.com/*']);
});

// ── Le site, les laissez-passer, la décision ──

test('le site : sous-domaines confondus, suffixes à deux niveaux respectés, adresses IP laissées telles quelles', () => {
  assert.equal(siteDe('docs.google.com'), 'google.com');
  assert.equal(siteDe('mail.google.com'), 'google.com');
  assert.equal(siteDe('google.com'), 'google.com');
  assert.equal(siteDe('www.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(siteDe('bbc.co.uk'), 'bbc.co.uk');
  assert.equal(siteDe('a.b.exemple.fr'), 'exemple.fr');
  assert.equal(siteDe('127.0.0.1'), '127.0.0.1');
  assert.equal(siteDe('localhost'), 'localhost');
  assert.equal(siteDe('EXEMPLE.FR.'), 'exemple.fr');
  assert.equal(siteDe(undefined), '');
});

test('les réglages de la confirmation sont ramenés à des valeurs permises', () => {
  assert.deepEqual(confirmationValide(undefined), CONFIRMATION_DEFAUT);
  assert.deepEqual(confirmationValide({ active: false, delaiS: 10, passeMin: 30 }), { active: false, delaiS: 10, passeMin: 30 });
  assert.deepEqual(confirmationValide({ delaiS: 7, passeMin: 999 }), CONFIRMATION_DEFAUT, 'valeurs hors liste : celles par défaut');
  assert.equal(confirmationValide({ active: 'non' }).active, true, 'seul « faux » éteint la confirmation');
  assert.ok(DELAIS_S.includes(CONFIRMATION_DEFAUT.delaiS) && PASSES_MIN.includes(CONFIRMATION_DEFAUT.passeMin));
  assert.deepEqual(SITES_DE_TRAVAIL_DEFAUT, ['claude.ai']);
});

test('un laissez-passer vaut jusqu’à son expiration, pour ce site seulement', () => {
  const t = 1_000_000;
  const p = ajouterPasse({}, 'youtube.com', 10, t);
  assert.equal(p['youtube.com'], t + 600_000);
  assert.ok(passeValide(p, 'youtube.com', t + 599_999));
  assert.ok(!passeValide(p, 'youtube.com', t + 600_000), 'à l’instant exact, c’est fini');
  assert.ok(!passeValide(p, 'instagram.com', t));
  assert.ok(!passeValide(undefined, 'youtube.com', t));
  const suite = ajouterPasse(p, 'reddit.com', 5, t + 700_000);
  assert.deepEqual(Object.keys(suite), ['reddit.com'], 'le passage expiré est oublié');
  const long = ajouterPasse({ 'youtube.com': t + 3_600_000 }, 'youtube.com', 1, t);
  assert.equal(long['youtube.com'], t + 3_600_000, 'un laissez-passer plus court ne raccourcit jamais celui qui existe');
  assert.equal(ajouterPasse({ 'youtube.com': t + 60_000 }, 'youtube.com', 10, t)['youtube.com'], t + 600_000, 'un plus long prolonge');
});

const en = { enCours: true, enPause: false };
const base = { etat: en, destination: 'https://youtube.com/watch?v=1', actuelle: 'https://claude.ai/artifact/x', autorises: SITES_DE_TRAVAIL_DEFAUT, bloques: [], passes: {}, maintenantMs: 1_000_000 };

test('chrono en cours, autre site : on demande', () => {
  assert.equal(doitConfirmer(base), true);
});

test('pas de chrono, ou chrono en pause : jamais de question', () => {
  assert.equal(doitConfirmer({ ...base, etat: { enCours: false, enPause: false } }), false);
  assert.equal(doitConfirmer({ ...base, etat: null }), false);
  assert.equal(doitConfirmer({ ...base, etat: { enCours: true, enPause: true } }), false, 'la pause est une pause');
});

test('le même site, sous-domaines compris, ne demande rien', () => {
  assert.equal(doitConfirmer({ ...base, actuelle: 'https://www.youtube.com/', destination: 'https://m.youtube.com/watch' }), false);
  assert.equal(doitConfirmer({ ...base, actuelle: 'https://docs.google.com/a', destination: 'https://mail.google.com/' }), false);
  assert.equal(doitConfirmer({ ...base, actuelle: 'https://youtube.com/', destination: 'https://instagram.com/' }), true);
});

test('Hameau, sa base et les pages qui ne sont pas du web ne demandent rien', () => {
  for (const d of ['https://maeljoly68-art.github.io/hameau/', 'https://nisjysdlyryyrsgwmcaa.supabase.co/x', 'chrome://settings', 'chrome-extension://abc/popup.html', 'about:blank', 'file:///x.pdf', 'pas une adresse']) assert.equal(doitConfirmer({ ...base, destination: d }), false, d);
});

test('un site de travail ne demande rien, ni ses sous-domaines', () => {
  assert.equal(doitConfirmer({ ...base, autorises: ['youtube.com'] }), false);
  assert.equal(doitConfirmer({ ...base, destination: 'https://www.youtube.com/', autorises: ['youtube.com'] }), false);
  assert.equal(doitConfirmer({ ...base, destination: 'https://notyoutube.com/', autorises: ['youtube.com'] }), true);
  assert.equal(doitConfirmer({ ...base, autorises: [] }), true);
});

test('un laissez-passer encore valable évite la question, une fois expiré elle revient', () => {
  assert.equal(doitConfirmer({ ...base, passes: { 'youtube.com': 1_000_001 } }), false);
  assert.equal(doitConfirmer({ ...base, passes: { 'youtube.com': 1_000_000 } }), true);
  assert.equal(doitConfirmer({ ...base, destination: 'https://m.youtube.com/', passes: { 'youtube.com': 2_000_000 } }), false, 'le laissez-passer vaut pour le site entier');
  assert.equal(doitConfirmer({ ...base, passes: { 'instagram.com': 2_000_000 } }), true, 'pas pour un autre site');
});

test('une page bloquée n’est pas demandée : la page de blocage, plus ferme, répond', () => {
  assert.equal(doitConfirmer({ ...base, bloques: ['youtube.com'] }), false);
  assert.equal(doitConfirmer({ ...base, destination: 'https://youtube.com/shorts/a', bloques: ['youtube.com/shorts'] }), false);
  assert.equal(doitConfirmer({ ...base, destination: 'https://youtube.com/watch', bloques: ['youtube.com/shorts'] }), true, 'le reste du site se demande');
});

test('d’où l’on vient : onglet vide ou page interne = un autre site, adresse illisible aussi', () => {
  for (const a of ['', undefined, 'chrome://newtab/', 'about:blank', 'chrome-extension://abc/confirmer.html']) assert.equal(doitConfirmer({ ...base, actuelle: a }), true, String(a));
});

test('le décompte du jour compte les deux issues, et garde une semaine', () => {
  let c = compter(undefined, '2026-11-08', 'rester');
  c = compter(c, '2026-11-08', 'rester');
  c = compter(c, '2026-11-08', 'continuer');
  assert.deepEqual(c['2026-11-08'], { resistes: 2, continues: 1 });
  for (let i = 1; i <= 8; i++) c = compter(c, `2026-11-${String(8 + i).padStart(2, '0')}`, 'rester');
  assert.equal(Object.keys(c).length, 7);
  assert.equal(c['2026-11-08'], undefined, 'le plus ancien est oublié');
  assert.deepEqual(compter({ a: { resistes: 1, continues: 0 } }, 'b', 'autre' as never), { a: { resistes: 1, continues: 0 }, b: { resistes: 0, continues: 0 } }, 'un genre inconnu ne compte rien');
});

test('la version annoncée par l’application est celle du manifeste', () => {
  const m = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.equal(m.version, VERSION_EXTENSION, 'penser à changer les deux ensemble');
});

test('une version installée plus ancienne est signalée, jamais une égale, une plus récente ou une illisible', () => {
  assert.equal(enRetard('1.0.0', '1.1.0'), true);
  assert.equal(enRetard('1.0.9', '1.1.0'), true);
  assert.equal(enRetard('0.9.9', '1.0.0'), true);
  assert.equal(enRetard('1.1.0', '1.1.0'), false);
  assert.equal(enRetard('1.2.0', '1.1.0'), false);
  assert.equal(enRetard('2.0.0', '1.9.9'), false);
  assert.equal(enRetard('1.10.0', '1.9.0'), false, 'comparaison par nombres, pas par texte');
  assert.equal(enRetard('?', '1.1.0'), false);
  assert.equal(enRetard('1.1', '1.1.0'), false);
  assert.equal(enRetard('1.0.0'), true, 'par défaut : la version de l’application');
});

// ── Les sites sur lesquels on travaille ──

test('on retient le NOM du site, jamais l’adresse complète', () => {
  assert.equal(siteEnregistre('https://www.claude.ai/artifact/W6oYDMPur2SWTTyAhEvUkT?token=secret#x'), 'claude.ai');
  assert.equal(siteEnregistre('https://docs.google.com/document/d/abc/edit'), 'docs.google.com');
  assert.equal(siteEnregistre('http://Mail.Google.com:8080/'), 'mail.google.com');
  assert.equal(siteEnregistre('https://www.bbc.co.uk./news'), 'bbc.co.uk');
  for (const non of ['chrome://settings', 'chrome-extension://abc/popup.html', 'about:blank', 'file:///c:/x.pdf', 'pas une adresse', '', null, undefined, 'https://localhost:3000/', 'http://127.0.0.1/']) assert.equal(siteEnregistre(non), null, String(non));
});

test('Hameau, sa base et les sites exclus ne sont jamais retenus', () => {
  assert.equal(siteEnregistre('https://maeljoly68-art.github.io/hameau/'), null);
  assert.equal(siteEnregistre('https://nisjysdlyryyrsgwmcaa.supabase.co/rest/v1/x'), null);
  assert.equal(siteEnregistre('https://www.mabanque.fr/compte', ['mabanque.fr']), null);
  assert.equal(siteEnregistre('https://secure.mabanque.fr/', ['mabanque.fr']), null, 'sous-domaines compris');
  assert.equal(siteEnregistre('https://mabanque.fr.evil.com/', ['mabanque.fr']), 'mabanque.fr.evil.com');
  assert.equal(siteEnregistre('https://claude.ai/', ['mabanque.fr']), 'claude.ai');
});

test('le titre d’une page est nettoyé et borné', () => {
  assert.equal(titreEnregistre('  Cours   de \n droit '), 'Cours de droit');
  assert.equal(titreEnregistre('x'.repeat(500)).length, 120);
  assert.equal(titreEnregistre(null), '');
  assert.deepEqual(partiesCle(cleActivite('claude.ai', 'Droit')), { site: 'claude.ai', titre: 'Droit' });
  assert.deepEqual(partiesCle(cleActivite('claude.ai', '')), { site: 'claude.ai', titre: '' });
});

test('les réglages du suivi : actif par défaut, titres seulement si on les veut, exclusions filtrées', () => {
  assert.deepEqual(suiviValide(undefined), SUIVI_DEFAUT);
  assert.equal(suiviValide({ active: false }).active, false);
  assert.equal(suiviValide({ active: 'non' }).active, true, 'seul « faux » éteint le suivi');
  assert.equal(suiviValide({ titres: 'oui' }).titres, false, 'les titres demandent un vrai « vrai »');
  assert.equal(suiviValide({ titres: true }).titres, true);
  assert.deepEqual(suiviValide({ exclusions: ['https://www.mabanque.fr/x', 'github.io', 'pas un site'] }).exclusions, ['mabanque.fr']);
  assert.deepEqual(suiviValide({ exclusions: 'x' }).exclusions, []);
});

test('un segment compte les secondes écoulées, plafonnées, jamais négatives', () => {
  assert.equal(secondesEntre(1000, 31_000), 30);
  assert.equal(secondesEntre(0, 10 * 60_000), SECONDES_SEGMENT_MAX, 'ordinateur en veille : plafonné');
  assert.equal(secondesEntre(5000, 1000), 0, 'horloge à l’envers');
  assert.equal(secondesEntre(NaN, 1000), 0);
});

const t0 = 1_000_000;
const sur = (site: string, titre = '') => ({ site, titre });
const ouvert = (extra = {}) => ({ maintenantMs: t0, travaille: true, actif: true, onglet: sur('claude.ai'), ...extra });

test('un site ouvert pendant le chrono accumule son temps, un autre site prend le relais', () => {
  let s = avancer(SUIVI_VIDE, ouvert());
  assert.deepEqual(s.courant, { cle: cleActivite('claude.ai', ''), depuis: t0 });
  s = avancer(s, ouvert({ maintenantMs: t0 + 60_000, onglet: sur('docs.google.com') }));
  s = avancer(s, ouvert({ maintenantMs: t0 + 90_000, onglet: sur('claude.ai') }));
  s = avancer(s, ouvert({ maintenantMs: t0 + 110_000, onglet: null }));
  assert.equal(s.courant, null, 'pas d’onglet à retenir : rien ne court');
  assert.deepEqual(parSite(s), [{ site: 'claude.ai', secondes: 80 }, { site: 'docs.google.com', secondes: 30 }].sort((a, b) => b.secondes - a.secondes));
});

test('rien ne s’accumule hors chrono, en pause, fenêtre en arrière-plan ou personne devant', () => {
  const base = avancer(SUIVI_VIDE, ouvert());
  for (const empeche of [{ travaille: false }, { actif: false }, { onglet: null }]) {
    const s = avancer(base, ouvert({ maintenantMs: t0 + 30_000, ...empeche }));
    assert.equal(s.courant, null, JSON.stringify(empeche));
    assert.equal(parSite(s)[0].secondes, 30, 'ce qui était déjà écoulé est gardé');
    const suite = avancer(s, ouvert({ maintenantMs: t0 + 600_000, ...empeche }));
    assert.equal(parSite(suite)[0].secondes, 30, 'et ensuite rien ne s’ajoute');
  }
});

test('plusieurs titres du même site restent distincts, et se regroupent par site', () => {
  let s = avancer(SUIVI_VIDE, ouvert({ onglet: sur('claude.ai', 'Droit') }));
  s = avancer(s, ouvert({ maintenantMs: t0 + 40_000, onglet: sur('claude.ai', 'Finance') }));
  s = avancer(s, ouvert({ maintenantMs: t0 + 100_000, onglet: null }));
  assert.deepEqual(Object.keys(s.totaux).sort(), [cleActivite('claude.ai', 'Droit'), cleActivite('claude.ai', 'Finance')].sort());
  assert.deepEqual(parSite(s), [{ site: 'claude.ai', secondes: 100 }]);
});

test('trop de titres différents : le surplus se range sous le site seul', () => {
  let s = { ...SUIVI_VIDE, totaux: Object.fromEntries(Array.from({ length: CLES_MAX }, (_, i) => [cleActivite('claude.ai', `page ${i}`), 1])) };
  s = avancer(s, ouvert({ onglet: sur('claude.ai', 'une de trop') }));
  assert.equal(s.courant?.cle, cleActivite('claude.ai', ''));
  s = avancer(s, ouvert({ onglet: sur('claude.ai', 'page 3') }));
  assert.equal(s.courant?.cle, cleActivite('claude.ai', 'page 3'), 'une clé déjà connue garde son titre');
});

test('refermer un segment l’ajoute au total de son site, et rien ne court plus', () => {
  const s = cloturer(avancer(SUIVI_VIDE, ouvert()), t0 + 45_000);
  assert.equal(s.courant, null);
  assert.equal(parSite(s)[0].secondes, 45);
  assert.deepEqual(cloturer(SUIVI_VIDE, t0), { ...SUIVI_VIDE, courant: null });
});

test('on n’envoie que ce qui a changé, au total cumulé, et jamais en dessous d’une seconde', () => {
  let s = avancer(SUIVI_VIDE, ouvert({ onglet: sur('claude.ai', 'Droit') }));
  s = avancer(s, ouvert({ maintenantMs: t0 + 90_400, onglet: sur('docs.google.com') }));
  s = avancer(s, ouvert({ maintenantMs: t0 + 90_700, onglet: null }));
  const l1 = lignesAEnvoyer(s, 'chrome-a', '2026-11-08T10:00:00Z');
  assert.deepEqual(l1, [{ appareil: 'chrome-a', site: 'claude.ai', titre: 'Droit', secondes: 90, maj_le: '2026-11-08T10:00:00Z' }], 'docs.google.com : 0,3 s, rien à envoyer');
  const s2 = apresEnvoi(s, l1);
  assert.deepEqual(lignesAEnvoyer(s2, 'chrome-a', 'x'), [], 'rien de neuf, rien d’envoyé');
  let s3 = avancer(s2, ouvert({ maintenantMs: t0 + 100_000, onglet: sur('claude.ai', 'Droit') }));
  s3 = avancer(s3, ouvert({ maintenantMs: t0 + 130_000, onglet: null }));
  const l2 = lignesAEnvoyer(s3, 'chrome-a', 'x');
  assert.equal(l2.length, 1);
  assert.equal(l2[0].secondes, 120, 'le total cumulé (90 + 30), pas la différence : un renvoi ne compte pas deux fois');
});

test('un envoi échoué est renvoyé la fois suivante, et le total est borné à 24 h', () => {
  const s = { ...SUIVI_VIDE, totaux: { [cleActivite('claude.ai', '')]: 100_000 } };
  assert.equal(lignesAEnvoyer(s, 'a', 'x')[0].secondes, 86_400);
  assert.equal(lignesAEnvoyer(s, 'a', 'x').length, 1, 'pas marqué envoyé : on recommence');
});

test('la fenêtre de l’extension montre les sites de la session, du plus long au plus court', () => {
  const s = { ...SUIVI_VIDE, totaux: { [cleActivite('a.fr', '')]: 10, [cleActivite('b.fr', 'x')]: 500, [cleActivite('b.fr', 'y')]: 100, [cleActivite('c.fr', '')]: 0.2 } };
  assert.deepEqual(parSite(s), [{ site: 'b.fr', secondes: 600 }, { site: 'a.fr', secondes: 10 }], 'c.fr : moins d’une seconde, absent');
  assert.equal(parSite(s, 1).length, 1);
});

test('suivi : les bornes de la mesure sont celles que la base et la fenêtre attendent', () => {
  assert.equal(SECONDES_SEGMENT_MAX, 120, 'deux minutes sans nouvelle : au-delà, on ne compte pas');
  assert.equal(CLES_MAX, 200);
  assert.equal(secondesEntre(0, 120_000), 120);
  assert.equal(secondesEntre(0, 121_000), 120, 'plafonné à la seconde près');
});

test('suivi : au plus 200 couples (site, titre) — le 200e passe, le 201e se range sous le site seul', () => {
  let s = SUIVI_VIDE;
  for (let i = 0; i < 200; i++) s = avancer(s, { maintenantMs: i * 1000, travaille: true, actif: true, onglet: { site: 'claude.ai', titre: `page ${i}` } });
  s = avancer(s, { maintenantMs: 200_000, travaille: true, actif: true, onglet: { site: 'claude.ai', titre: 'la 201e' } });
  s = avancer(s, { maintenantMs: 205_000, travaille: true, actif: true, onglet: null });
  const cles = Object.keys(s.totaux);
  assert.equal(cles.length, 201, '200 pages + la clé du site seul');
  assert.ok(cles.includes(cleActivite('claude.ai', 'page 199')), 'la 200e est gardée telle quelle');
  assert.ok(!cles.includes(cleActivite('claude.ai', 'la 201e')) && cles.includes(cleActivite('claude.ai', '')), 'la 201e est rangée sous le site');
});

test('lignesAEnvoyer : arrondi à la seconde la plus proche, et rien pour un total qui arrondit à zéro', () => {
  const s = { ...SUIVI_VIDE, totaux: { [cleActivite('a.fr', '')]: 0.4, [cleActivite('b.fr', '')]: 2.6, [cleActivite('c.fr', '')]: 0.5 } };
  const l = lignesAEnvoyer(s, 'chrome-1', '2026-11-08T10:00:00.000Z');
  assert.deepEqual(l.map((x) => [x.site, x.secondes]).sort(), [['b.fr', 3], ['c.fr', 1]], '0,4 s ne part pas ; 2,6 s fait 3 ; 0,5 s fait 1');
});

test('parSite : trois sites par défaut', () => {
  const s = { ...SUIVI_VIDE, totaux: { [cleActivite('a.fr', '')]: 40, [cleActivite('b.fr', '')]: 30, [cleActivite('c.fr', '')]: 20, [cleActivite('d.fr', '')]: 10 } };
  assert.deepEqual(parSite(s).map((x) => x.site), ['a.fr', 'b.fr', 'c.fr']);
  assert.equal(parSite(s, 4).length, 4);
});

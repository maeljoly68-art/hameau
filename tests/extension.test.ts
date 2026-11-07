import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADRESSE_HAMEAU, CLE_PUBLIQUE, URL_SUPABASE } from '../extension/config.js';
import {
  DOMAINES_PROTEGES,
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
  for (const p of ['declarativeNetRequest', 'storage', 'alarms', 'tabs']) assert.ok(m.permissions.includes(p), p);
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
  assert.deepEqual(r.sites, ['youtube.com', 'linkedin.com', 'instagram.com', 'tiktok.com']);
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

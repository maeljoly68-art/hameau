// Le widget Scriptable du chrono : on le fait tourner dans un faux Scriptable, pour chaque état du chrono et chaque
// taille de widget, et on regarde ce qu'il dessine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCRIPT = readFileSync(new URL('../scriptable/hameau-widget.js', import.meta.url), 'utf8');

interface Element {
  genre: 'texte' | 'date';
  texte?: string;
  date?: Date;
  minuteur?: boolean;
}
interface Rendu {
  elements: Element[];
  requetes: { url: string; method?: string; headers?: Record<string, string>; body?: string }[];
  presente: boolean;
}

/** Lance le script comme Scriptable le ferait, avec une réponse de Hameau (ou une panne réseau). */
async function rendre({ famille = 'small', parametre = 'jeton-de-test', reponse = {} as unknown, code = 200, panne = false, dansWidget = true } = {}): Promise<Rendu> {
  const rendu: Rendu = { elements: [], requetes: [], presente: false };
  class ListWidget {
    url = '';
    refreshAfterDate: Date | null = null;
    backgroundColor: unknown = null;
    addAccessoryWidgetBackground = false;
    addText(t: string) {
      const o: Element = { genre: 'texte', texte: t };
      rendu.elements.push(o);
      return o;
    }
    addDate(d: Date) {
      const o: Element & { applyTimerStyle: () => void } = { genre: 'date', date: d, applyTimerStyle: () => (o.minuteur = true) };
      rendu.elements.push(o);
      return o;
    }
    addSpacer() {}
    setPadding() {}
    async presentSmall() {
      rendu.presente = true;
    }
  }
  class Request {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutInterval = 0;
    response: { statusCode: number } | null = null;
    url: string;
    constructor(url: string) {
      this.url = url;
    }
    async loadJSON() {
      rendu.requetes.push({ url: this.url, method: this.method, headers: this.headers, body: this.body });
      if (panne) throw new Error('hors ligne');
      this.response = { statusCode: code };
      return reponse;
    }
  }
  class Color {
    hex: string;
    constructor(hex: string) {
      this.hex = hex;
    }
    static dynamic(clair: Color) {
      return clair;
    }
  }
  const police = () => ({});
  const Font = { systemFont: police, semiboldSystemFont: police, boldRoundedSystemFont: police };
  let fini = false;
  const contexte = vm.createContext({
    ListWidget,
    Request,
    Color,
    Font,
    config: { widgetFamily: famille, runsInWidget: dansWidget },
    args: { widgetParameter: parametre },
    Script: { setWidget: () => undefined, complete: () => (fini = true) },
    Date,
    JSON,
    Math,
    String,
  });
  // Scriptable accepte le « await » au premier niveau ; ici, on l'enveloppe dans une fonction asynchrone.
  await vm.runInContext(`(async () => {\n${SCRIPT}\n})()`, contexte);
  assert.ok(fini, 'le script se termine (Script.complete)');
  return rendu;
}
const textes = (r: Rendu) => r.elements.filter((e) => e.genre === 'texte').map((e) => e.texte).join(' | ');
const minuteurs = (r: Rendu) => r.elements.filter((e) => e.genre === 'date' && e.minuteur);

test('chrono en cours : le temps défile à partir du départ sans les pauses, avec l’objectif', async () => {
  const depuis = '2026-11-26T17:30:00.000+00:00';
  const r = await rendre({ reponse: { etat: 'en_cours', minutes: 37, secondes: 2245, depuis, objectif: 50 } });
  assert.equal(minuteurs(r).length, 1);
  assert.equal(minuteurs(r)[0].date?.toISOString(), new Date(depuis).toISOString());
  assert.match(textes(r), /En cours/);
  assert.match(textes(r), /objectif 50 min/);
  // la demande : l'état, avec le jeton du paramètre, la clé publiable et du JSON
  const q = r.requetes[0];
  assert.equal(q.method, 'POST');
  assert.deepEqual(JSON.parse(q.body ?? '{}'), { p_jeton: 'jeton-de-test', p_action: 'etat' });
  assert.equal(q.headers?.['Content-Type'], 'application/json');
  assert.ok(q.headers?.apikey?.startsWith('sb_publishable_'));
});

test('en pause : le temps est figé (pas de minuteur qui défilerait pendant la pause)', async () => {
  const r = await rendre({ reponse: { etat: 'en_pause', minutes: 66, secondes: 3990, objectif: 90 } });
  assert.equal(minuteurs(r).length, 0);
  assert.match(textes(r), /1 h 06/);
  assert.match(textes(r), /En pause/);
});

test('sans chrono, sans jeton, jeton refusé, hors ligne : le widget le dit, sans minuteur', async () => {
  assert.match(textes(await rendre({ reponse: { etat: 'aucune', message: 'Pas de session en cours.' } })), /Pas de chrono/);
  const sansJeton = await rendre({ parametre: '  ' });
  assert.equal(sansJeton.requetes.length, 0, 'aucune demande sans jeton');
  assert.match(textes(sansJeton), /Jeton à mettre/);
  assert.match(textes(await rendre({ code: 401, reponse: { message: 'jeton inconnu' } })), /Jeton à mettre/);
  const horsLigne = await rendre({ panne: true });
  assert.match(textes(horsLigne), /Hors ligne/);
  assert.equal(minuteurs(horsLigne).length, 0);
});

test('écran verrouillé : rectangulaire avec le minuteur, une ligne au-dessus de l’heure, rond', async () => {
  const enCours = { etat: 'en_cours', minutes: 12, secondes: 730, depuis: '2026-11-26T18:00:00Z', objectif: null };
  assert.equal(minuteurs(await rendre({ famille: 'accessoryRectangular', reponse: enCours })).length, 1);
  assert.equal(minuteurs(await rendre({ famille: 'accessoryCircular', reponse: enCours })).length, 1);
  const ligne = await rendre({ famille: 'accessoryInline', reponse: enCours });
  assert.equal(ligne.elements.length, 1, 'une seule ligne');
  assert.equal(ligne.elements[0].texte, 'Hameau · 12 min');
});

test('ouvert dans l’app Scriptable, il montre un aperçu au lieu de se poser en widget', async () => {
  assert.ok((await rendre({ dansWidget: false, reponse: { etat: 'aucune' } })).presente);
});

test('le widget parle au même projet que l’application, et ne contient aucun secret', () => {
  const config = readFileSync(new URL('../src/data/config.ts', import.meta.url), 'utf8');
  const url = /const URL_RPC = '(https:\/\/[^']+)\/rest\/v1\/rpc\/hameau_raccourci'/.exec(SCRIPT)?.[1];
  const cle = /const CLE_PUBLIQUE = '([^']+)'/.exec(SCRIPT)?.[1];
  assert.ok(url && config.includes(`url: '${url}'`), 'l’adresse du projet');
  assert.ok(cle && config.includes(`cle: '${cle}'`), 'la clé publiable');
  assert.ok(!/sb_secret_|service_role/.test(SCRIPT));
  // un jeton des raccourcis fait 64 caractères hexadécimaux : il va dans le paramètre du widget, jamais dans le script
  assert.ok(!/[0-9a-f]{64}/.test(SCRIPT));
});

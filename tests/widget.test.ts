// Le widget Scriptable du chrono : on le fait tourner dans un faux Scriptable, pour chaque état du chrono et chaque
// taille de widget, et on regarde ce qu'il dessine ; puis on rejoue les touchers (lancer, pause, terminer) comme
// Scriptable les relance dans l'app.
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
  /** Le conteneur (widget ou pile) qui le porte : son lien est celui d'un toucher à cet endroit. */
  dans: { url: string };
}
interface Requete {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  corps: Record<string, unknown>;
}
interface AlerteVue {
  titre: string;
  message: string;
  actions: string[];
  champs: number;
}
interface Rendu {
  elements: Element[];
  requetes: Requete[];
  alertes: AlerteVue[];
  notifications: string[];
  ouvertes: string[];
  url: string;
  presente: boolean;
}

interface Options {
  famille?: string;
  parametre?: string;
  /** La réponse de Hameau, ou une fonction du corps envoyé (pour un échange en plusieurs appels). */
  reponse?: unknown;
  code?: number;
  panne?: boolean;
  dansWidget?: boolean;
  /** Le lancement par un toucher : les paramètres de l'adresse scriptable:///run/…?action=…&jeton=… */
  touche?: Record<string, string>;
  /** Le bouton choisi dans chaque alerte, dans l'ordre (-1 : annuler) ; et le texte tapé dans le champ. */
  choix?: number[];
  saisie?: string;
}

/** Lance le script comme Scriptable le ferait, avec une réponse de Hameau (ou une panne réseau). */
async function rendre({ famille = 'small', parametre = 'jeton-de-test', reponse = {}, code = 200, panne = false, dansWidget = true, touche, choix = [], saisie = '' }: Options = {}): Promise<Rendu> {
  const rendu: Rendu = { elements: [], requetes: [], alertes: [], notifications: [], ouvertes: [], url: '', presente: false };
  class Conteneur {
    url = '';
    backgroundColor: unknown = null;
    cornerRadius = 0;
    addText(t: string) {
      const o: Element = { genre: 'texte', texte: t, dans: this };
      rendu.elements.push(o);
      return o;
    }
    addDate(d: Date) {
      const o: Element & { applyTimerStyle: () => void } = { genre: 'date', date: d, dans: this, applyTimerStyle: () => (o.minuteur = true) };
      rendu.elements.push(o);
      return o;
    }
    addStack() {
      return new Conteneur();
    }
    addSpacer() {}
    setPadding() {}
    layoutHorizontally() {}
    layoutVertically() {}
    centerAlignContent() {}
  }
  class ListWidget extends Conteneur {
    refreshAfterDate: Date | null = null;
    addAccessoryWidgetBackground = false;
    constructor() {
      super();
      widgets.push(this);
    }
    async presentSmall() {
      rendu.presente = true;
    }
  }
  const widgets: ListWidget[] = [];
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
      const corps = JSON.parse(this.body ?? '{}') as Record<string, unknown>;
      rendu.requetes.push({ url: this.url, method: this.method, headers: this.headers, corps });
      if (panne) throw new Error('hors ligne');
      this.response = { statusCode: code };
      return typeof reponse === 'function' ? (reponse as (c: Record<string, unknown>) => unknown)(corps) : reponse;
    }
  }
  const choixRestants = [...choix];
  class Alert {
    title = '';
    message = '';
    vue: AlerteVue = { titre: '', message: '', actions: [], champs: 0 };
    addAction(t: string) {
      this.vue.actions.push(t);
    }
    addDestructiveAction(t: string) {
      this.vue.actions.push(t);
    }
    addCancelAction() {}
    addTextField() {
      this.vue.champs++;
    }
    textFieldValue() {
      return saisie;
    }
    async presentAlert() {
      this.vue.titre = this.title;
      this.vue.message = this.message;
      rendu.alertes.push(this.vue);
      return choixRestants.length ? choixRestants.shift()! : 0;
    }
    async presentSheet() {
      return this.presentAlert();
    }
  }
  class Notification {
    title = '';
    body = '';
    async schedule() {
      rendu.notifications.push(this.body);
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
    Alert,
    Notification,
    Color,
    Font,
    Safari: { open: (u: string) => rendu.ouvertes.push(u) },
    config: { widgetFamily: famille, runsInWidget: dansWidget && !touche },
    args: { widgetParameter: parametre, queryParameters: touche ?? {} },
    Script: { name: () => 'Hameau', setWidget: () => undefined, complete: () => (fini = true) },
    Date,
    JSON,
    Math,
    String,
    encodeURIComponent,
  });
  // Scriptable accepte le « await » au premier niveau ; ici, on l'enveloppe dans une fonction asynchrone.
  await vm.runInContext(`(async () => {\n${SCRIPT}\n})()`, contexte);
  assert.ok(fini, 'le script se termine (Script.complete)');
  rendu.url = widgets[0]?.url ?? '';
  return rendu;
}
const textes = (r: Rendu) => r.elements.filter((e) => e.genre === 'texte').map((e) => e.texte).join(' | ');
const minuteurs = (r: Rendu) => r.elements.filter((e) => e.genre === 'date' && e.minuteur);
/** Le lien du bouton qui porte ce libellé. */
const lienDe = (r: Rendu, libelle: string) => r.elements.find((e) => e.texte === libelle)?.dans.url ?? '';
const action = (lien: string) => new URL(lien.replace('scriptable:///', 'https://scriptable.invalid/')).searchParams.get('action');

const EN_COURS = { etat: 'en_cours', minutes: 37, secondes: 2245, depuis: '2026-11-26T17:30:00.000+00:00', objectif: 50, message: 'En session depuis 37 min.' };
const EN_PAUSE = { etat: 'en_pause', minutes: 66, secondes: 3990, objectif: 90, message: 'En pause, 66 min de travail au compteur.' };

test('chrono en cours : le temps défile à partir du départ sans les pauses, avec l’objectif', async () => {
  const r = await rendre({ reponse: EN_COURS });
  assert.equal(minuteurs(r).length, 1);
  assert.equal(minuteurs(r)[0].date?.toISOString(), new Date(EN_COURS.depuis).toISOString());
  assert.match(textes(r), /En cours/);
  assert.match(textes(r), /objectif 50 min/);
  // la demande : l'état, avec le jeton du paramètre, la clé publiable et du JSON
  const q = r.requetes[0];
  assert.equal(q.method, 'POST');
  assert.deepEqual(q.corps, { p_jeton: 'jeton-de-test', p_action: 'etat' });
  assert.equal(q.headers?.['Content-Type'], 'application/json');
  assert.ok(q.headers?.apikey?.startsWith('sb_publishable_'));
});

test('en pause : le temps est figé (pas de minuteur qui défilerait pendant la pause)', async () => {
  const r = await rendre({ reponse: EN_PAUSE });
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
  const enCours = { ...EN_COURS, minutes: 12, objectif: null };
  assert.equal(minuteurs(await rendre({ famille: 'accessoryRectangular', reponse: enCours })).length, 1);
  assert.equal(minuteurs(await rendre({ famille: 'accessoryCircular', reponse: enCours })).length, 1);
  const ligne = await rendre({ famille: 'accessoryInline', reponse: enCours });
  assert.equal(ligne.elements.length, 1, 'une seule ligne');
  assert.equal(ligne.elements[0].texte, 'Hameau · 12 min');
});

test('ouvert dans l’app Scriptable, il montre un aperçu au lieu de se poser en widget', async () => {
  assert.ok((await rendre({ dansWidget: false, reponse: { etat: 'aucune' } })).presente);
});

test('widget moyen : deux boutons, la pause n’arrête pas, et « Fin » n’existe que s’il y a une session', async () => {
  const r = await rendre({ famille: 'systemMedium', reponse: EN_COURS });
  assert.equal(action(lienDe(r, '⏸ Pause')), 'pause');
  assert.equal(action(lienDe(r, '■ Fin')), 'terminer');
  // le lien relance ce script dans l'app, avec le jeton du widget
  assert.match(lienDe(r, '⏸ Pause'), /^scriptable:\/\/\/run\/Hameau\?action=pause&jeton=jeton-de-test$/);
  const p = await rendre({ famille: 'systemMedium', reponse: EN_PAUSE });
  assert.equal(action(lienDe(p, '▶ Reprendre')), 'reprendre');
  assert.equal(action(lienDe(p, '■ Fin')), 'terminer');
  const rien = await rendre({ famille: 'systemMedium', reponse: { etat: 'aucune' } });
  assert.equal(action(lienDe(rien, '▶ Lancer')), 'demarrer');
  assert.ok(!textes(rien).includes('■ Fin'), 'rien à terminer');
  // aucun bouton n'envoie « alterner » : un widget qui date de quelques minutes ne doit pas reprendre une pause faite ailleurs
  assert.ok(![r, p, rien].some((x) => x.elements.some((e) => e.dans.url.includes('action=alterner'))));
});

test('petit widget : un toucher lance s’il n’y a rien, sinon ouvre le choix ; sans jeton, il ouvre Hameau', async () => {
  assert.equal(action((await rendre({ reponse: { etat: 'aucune' } })).url), 'demarrer');
  assert.equal(action((await rendre({ reponse: EN_COURS })).url), 'menu');
  assert.equal(action((await rendre({ reponse: EN_PAUSE })).url), 'menu');
  assert.equal(action((await rendre({ panne: true })).url), 'menu', 'hors ligne : le menu relit l’état au lieu de lancer à l’aveugle');
  assert.equal((await rendre({ parametre: '' })).url, 'https://maeljoly68-art.github.io/hameau/');
});

test('toucher « Pause » : l’action part avec le jeton du lien, et une notification le confirme', async () => {
  const r = await rendre({ touche: { action: 'pause', jeton: 'jeton-du-lien' }, reponse: { etat: 'en_pause', message: 'Pause après 32 min. Reprends quand tu veux.' } });
  assert.deepEqual(r.requetes.map((q) => q.corps), [{ p_jeton: 'jeton-du-lien', p_action: 'pause' }]);
  assert.deepEqual(r.notifications, ['Pause après 32 min. Reprends quand tu veux.']);
  const lance = await rendre({ touche: { action: 'demarrer', jeton: 'j' }, reponse: { etat: 'en_cours', message: 'Session lancée.' } });
  assert.deepEqual(lance.requetes[0].corps, { p_jeton: 'j', p_action: 'demarrer', p_objectif: 50 });
});

test('toucher « Fin » : il demande ce qui a été fait ; annuler n’enregistre rien, confirmer arrête avec la description', async () => {
  const annule = await rendre({ touche: { action: 'terminer', jeton: 'j' }, choix: [-1] });
  assert.equal(annule.requetes.length, 0, 'annuler laisse la session tourner');
  assert.equal(annule.alertes[0].champs, 1, 'un champ « qu’as-tu fait ? »');
  const fini = await rendre({ touche: { action: 'terminer', jeton: 'j' }, choix: [0], saisie: 'Chapitre 3 relu', reponse: { etat: 'terminee', minutes: 52, message: 'Session de 52 min enregistrée.' } });
  assert.deepEqual(fini.requetes.map((q) => q.corps), [{ p_jeton: 'j', p_action: 'arreter', p_description: 'Chapitre 3 relu' }]);
  assert.deepEqual(fini.notifications, ['Session de 52 min enregistrée.']);
});

test('le choix du petit widget relit l’état et propose ce qui a du sens', async () => {
  const selon = (etat: unknown, suite: unknown) => (c: Record<string, unknown>) => (c.p_action === 'etat' ? etat : suite);
  // en cours : « ⏸ Pause » d'abord ; le choisir envoie « pause »
  const r = await rendre({ touche: { action: 'menu', jeton: 'j' }, choix: [0], reponse: selon(EN_COURS, { etat: 'en_pause', message: 'Pause.' }) });
  assert.deepEqual(r.alertes[0].actions, ['⏸ Pause', '■ Terminer…', 'Ouvrir Hameau']);
  assert.deepEqual(r.requetes.map((q) => q.corps.p_action), ['etat', 'pause']);
  // en pause : « ▶ Reprendre »
  const p = await rendre({ touche: { action: 'menu', jeton: 'j' }, choix: [0], reponse: selon(EN_PAUSE, { etat: 'en_cours', message: 'C’est reparti !' }) });
  assert.deepEqual(p.alertes[0].actions, ['▶ Reprendre', '■ Terminer…', 'Ouvrir Hameau']);
  assert.deepEqual(p.requetes.map((q) => q.corps.p_action), ['etat', 'reprendre']);
  // « Terminer… » passe par la question de fin, puis arrête
  const t = await rendre({ touche: { action: 'menu', jeton: 'j' }, choix: [1, 0], saisie: 'Fiches', reponse: selon(EN_COURS, { etat: 'terminee', message: 'Session de 37 min enregistrée.' }) });
  assert.equal(t.alertes[1].titre, 'Terminer la session ?');
  assert.deepEqual(t.requetes.map((q) => q.corps.p_action), ['etat', 'arreter']);
  // « Ouvrir Hameau »
  const o = await rendre({ touche: { action: 'menu', jeton: 'j' }, choix: [1], reponse: { etat: 'aucune', message: 'Pas de session en cours.' } });
  assert.deepEqual(o.alertes[0].actions, ['▶ Lancer', 'Ouvrir Hameau']);
  assert.deepEqual(o.ouvertes, ['https://maeljoly68-art.github.io/hameau/']);
});

test('jeton refusé ou réseau coupé pendant un toucher : une alerte le dit, rien n’est annoncé comme fait', async () => {
  const refuse = await rendre({ touche: { action: 'pause', jeton: 'faux' }, code: 401, reponse: { message: 'jeton inconnu' } });
  assert.equal(refuse.notifications.length, 0);
  assert.match(refuse.alertes[0].message, /Jeton absent ou refusé/);
  const coupe = await rendre({ touche: { action: 'pause', jeton: 'j' }, panne: true });
  assert.match(coupe.alertes[0].message, /ne répond pas/);
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

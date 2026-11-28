// Le widget Scriptable du chrono : on le fait tourner dans un faux Scriptable, pour chaque état du chrono et chaque
// taille de widget, et on regarde ce qu'il dessine ; puis on rejoue les touchers (lancer, pause, terminer) comme
// Scriptable les relance dans l'app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCRIPT = readFileSync(new URL('../scriptable/hameau-widget.js', import.meta.url), 'utf8');

interface Trace {
  genre: 'plein' | 'contour' | 'rectangle' | 'texte';
  rect: { x: number; y: number; width: number; height: number };
  couleur?: { hex: string; alpha: number };
  texte?: string;
}
interface Dessin {
  traces: Trace[];
}
interface Element {
  genre: 'texte' | 'date' | 'image';
  image?: { dessin: Dessin };
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
  dessins: Dessin[];
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
  const rendu: Rendu = { elements: [], requetes: [], alertes: [], notifications: [], ouvertes: [], dessins: [], url: '', presente: false };
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
    addImage(image: { dessin: Dessin }) {
      const o: Element & { imageSize?: unknown } = { genre: 'image', image, dans: this };
      rendu.elements.push(o);
      return o;
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
    alpha: number;
    constructor(hex: string, alpha = 1) {
      this.hex = hex;
      this.alpha = alpha;
    }
    static dynamic(clair: Color) {
      return clair;
    }
  }
  const police = () => ({});
  const Font = { systemFont: police, semiboldSystemFont: police, boldSystemFont: police, boldRoundedSystemFont: police };
  class Rect {
    x: number;
    y: number;
    width: number;
    height: number;
    constructor(x: number, y: number, width: number, height: number) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
  }
  class Size {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  }
  class Path {
    rect: Rect | null = null;
    addRoundedRect(r: Rect) {
      this.rect = r;
    }
  }
  /** Un faux DrawContext : il note ce qu'on y peint, dans l'ordre, avec la couleur. */
  class DrawContext {
    size: Size | null = null;
    opaque = true;
    respectScreenScale = false;
    dessin: Dessin = { traces: [] };
    chemin: Path | null = null;
    fond: Color | null = null;
    trait: Color | null = null;
    constructor() {
      rendu.dessins.push(this.dessin);
    }
    addPath(p: Path) {
      this.chemin = p;
    }
    setFillColor(c: Color) {
      this.fond = c;
    }
    setStrokeColor(c: Color) {
      this.trait = c;
    }
    setLineWidth() {}
    setFont() {}
    setTextColor() {}
    setTextAlignedCenter() {}
    fillPath() {
      this.dessin.traces.push({ genre: 'plein', rect: this.chemin!.rect!, couleur: this.fond! });
    }
    strokePath() {
      this.dessin.traces.push({ genre: 'contour', rect: this.chemin!.rect!, couleur: this.trait! });
    }
    fillRect(r: Rect) {
      this.dessin.traces.push({ genre: 'rectangle', rect: r, couleur: this.fond! });
    }
    drawTextInRect(t: string, r: Rect) {
      this.dessin.traces.push({ genre: 'texte', rect: r, texte: t });
    }
    getImage() {
      return { dessin: this.dessin, size: this.size };
    }
  }
  let fini = false;
  const contexte = vm.createContext({
    ListWidget,
    Request,
    Alert,
    Notification,
    Color,
    Font,
    Rect,
    Size,
    Path,
    DrawContext,
    Device: { isUsingDarkAppearance: () => true },
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
  // lancée sans objectif : une session libre, comme demandé (pas de 50 min imposées)
  const lance = await rendre({ touche: { action: 'demarrer', jeton: 'j' }, reponse: { etat: 'en_cours', message: 'Session lancée.' } });
  assert.deepEqual(lance.requetes[0].corps, { p_jeton: 'j', p_action: 'demarrer' });
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

// ── Le grand widget : la régularité et les 14 derniers jours ──

/** Un instant local (10 h par défaut), n jours avant aujourd'hui. */
const ilYa = (n: number, heure = 10, minute = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, heure, minute).toISOString();
};
const VERT_ATTEINT = '#61dd97';
const ORANGE = '#fcb036';
/** Le grand widget : l'état « en cours », et les sessions des stats. */
const grandWidget = (sessions: unknown[], objectif_jour: unknown = 90, extra: Options = {}) =>
  rendre({ famille: 'systemLarge', reponse: (c: Record<string, unknown>) => (c.p_action === 'stats' ? { etat: 'stats', objectif_jour, sessions } : EN_COURS), ...extra });
const cases = (r: Rendu) => r.dessins[0].traces.filter((t) => t.genre === 'plein' || t.genre === 'contour');
const barres = (r: Rendu) => r.dessins[1].traces.filter((t) => t.genre === 'plein');
/** La place d'aujourd'hui dans le calendrier : dernière colonne (semaine 20), ligne du jour (lundi = 0). */
const indexAujourdhui = () => 19 * 7 + ((new Date().getDay() + 6) % 7);

test('grand widget : il demande aussi les stats ; le moyen, non', async () => {
  const g = await grandWidget([]);
  assert.deepEqual(g.requetes.map((q) => q.corps.p_action).sort(), ['etat', 'stats']);
  assert.match(textes(g), /Régularité · 20 semaines/);
  assert.match(textes(g), /14 derniers jours/);
  assert.equal(g.elements.filter((e) => e.genre === 'image').length, 2);
  const m = await rendre({ famille: 'systemMedium', reponse: EN_COURS });
  assert.deepEqual(m.requetes.map((q) => q.corps.p_action), ['etat']);
  assert.equal(m.dessins.length, 0);
});

test('régularité : 20 semaines de 7 jours, l’intensité selon l’objectif du jour, les jours à venir en contour', async () => {
  // aujourd'hui pile 90 min (objectif 90 : atteint), hier 30 min (un tiers : niveau 2), avant-hier 50 min (plus de la moitié : 3)
  const r = await grandWidget([
    { debut: ilYa(0), secondes: 90 * 60 },
    { debut: ilYa(1), secondes: 30 * 60 },
    { debut: ilYa(2), secondes: 20 * 60 },
    { debut: ilYa(2, 15), secondes: 30 * 60 },
  ]);
  const c = cases(r);
  assert.equal(c.length, 140);
  const i = indexAujourdhui();
  assert.deepEqual({ ...c[i].couleur }, { hex: '#6fd39a', alpha: 1 }, 'objectif atteint : le vert plein');
  if (i - 1 >= 0) assert.equal(c[i - 1].couleur?.alpha, 0.48, 'un tiers de l’objectif : niveau 2');
  if (i - 2 >= 0) assert.equal(c[i - 2].couleur?.alpha, 0.72, 'deux sessions le même jour s’additionnent : 50 min, niveau 3');
  // les jours qui restent dans la semaine : des contours, aucun après aujourd'hui n'est peint
  assert.ok(c.slice(i + 1).every((t) => t.genre === 'contour'));
  assert.ok(c.slice(0, i + 1).every((t) => t.genre === 'plein'));
  // une ligne par jour, de haut en bas : lundi en haut de chaque colonne
  assert.ok(c[7].rect.x > c[6].rect.x && c[7].rect.y === c[0].rect.y);
});

test('14 derniers jours : vert si l’objectif est atteint, orange sinon, un jour vide se voit, au-delà de l’échelle un liseré', async () => {
  const r = await grandWidget([
    { debut: ilYa(0), secondes: 200 * 60 }, // au-delà de 1,5 × 90 = 135 min : liseré
    { debut: ilYa(1), secondes: 40 * 60 },
    { debut: ilYa(13), secondes: 90 * 60 },
    { debut: ilYa(14), secondes: 999 * 60 }, // hors des 14 jours
  ]);
  const b = barres(r);
  assert.equal(b.length, 14);
  assert.equal(b[13].couleur?.hex, VERT_ATTEINT, 'aujourd’hui, objectif atteint');
  assert.equal(b[12].couleur?.hex, ORANGE, 'hier, pas atteint');
  assert.equal(b[0].couleur?.hex, VERT_ATTEINT, 'il y a 13 jours, juste l’objectif : atteint');
  assert.equal(b[5].rect.height, 3, 'un jour vide garde un trait de 3 points');
  assert.ok(b[12].rect.height > 3 && b[12].rect.height < b[0].rect.height, 'la hauteur suit les minutes');
  const liseres = r.dessins[1].traces.filter((t) => t.genre === 'rectangle' && t.rect.height === 2);
  assert.equal(liseres.length, 1, 'un seul jour dépasse l’échelle');
  assert.equal(liseres[0].rect.x, b[13].rect.x);
  // la lettre du jour sous chaque barre, la dernière étant aujourd'hui
  const lettres = r.dessins[1].traces.filter((t) => t.genre === 'texte').map((t) => t.texte);
  assert.equal(lettres.length, 14);
  assert.equal(lettres[13], ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date().getDay()]);
});

test('une session compte au jour LOCAL de son début, pour sa durée effective', async () => {
  // 0 h 30 aujourd'hui, heure de l'iPhone : c'est aujourd'hui, même si en temps universel (à Paris) c'est encore hier
  const r = await grandWidget([{ debut: ilYa(0, 0, 30), secondes: 95 * 60 }]);
  const b = barres(r);
  assert.equal(b[13].couleur?.hex, VERT_ATTEINT);
  assert.equal(b[12].rect.height, 3, 'hier reste vide');
});

test('sans stats lisibles (panne, réponse vide), le grand widget garde le chrono et ne dessine rien de faux', async () => {
  const r = await rendre({ famille: 'systemLarge', reponse: (c: Record<string, unknown>) => (c.p_action === 'stats' ? { etat: 'stats' } : EN_COURS) });
  assert.equal(r.dessins.length, 0);
  assert.equal(minuteurs(r).length, 1);
  const sansObjectif = await grandWidget([{ debut: ilYa(0), secondes: 130 * 60 }], null);
  assert.equal(barres(sansObjectif)[13].couleur?.hex, VERT_ATTEINT, 'objectif du jour absent : 120 min par défaut, 130 l’atteint');
});

test('le très grand widget (iPad) met les deux côte à côte', async () => {
  const r = await rendre({ famille: 'systemExtraLarge', reponse: (c: Record<string, unknown>) => (c.p_action === 'stats' ? { etat: 'stats', objectif_jour: 60, sessions: [] } : EN_COURS) });
  assert.equal(r.dessins.length, 2);
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

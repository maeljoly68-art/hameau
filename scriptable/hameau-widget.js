// Hameau · le chrono sur l'écran d'accueil et l'écran verrouillé de l'iPhone, par l'app Scriptable (gratuite).
//
// Une app web ne peut ni créer de widget ni apparaître dans la Dynamic Island : Scriptable, si. Ce script demande à
// Hameau où en est le chrono (le même appel que les raccourcis : action « etat ») et dessine le widget.
//
// Réglage : dans le widget, « Parameter » = ton jeton des raccourcis (Hameau → Réglages). Le script ne contient aucun
// secret : l'adresse et la clé publiable ci-dessous sont celles que tout navigateur reçoit en ouvrant Hameau.
//
// Le temps compte à la seconde tout seul (c'est l'iPhone qui fait tourner le minuteur à partir de l'heure de départ) ;
// l'état lui-même (en cours, en pause, arrêté) se relit quand iOS rafraîchit le widget, toutes les quelques minutes.
//
// Le grand widget montre aussi la régularité des 20 dernières semaines et les 14 derniers jours, comme la page Stats.
//
// Toucher le widget agit sur le chrono : iOS ouvre Scriptable une seconde, le temps de le faire, et une notification
// confirme. Widget moyen : deux boutons, « ⏸ Pause » (ou « ▶ Lancer », « ▶ Reprendre ») et « ■ Fin ». Petit widget et
// écran verrouillé : un toucher lance s'il n'y a pas de chrono, sinon propose pause ou reprise, et terminer.
// La pause et l'arrêt ne se confondent jamais : le bouton de pause n'arrête pas, et terminer demande d'abord ce que tu
// as fait ; c'est la confirmation, car une session terminée ne se rouvre pas.

const URL_RPC = 'https://nisjysdlyryyrsgwmcaa.supabase.co/rest/v1/rpc/hameau_raccourci';
const CLE_PUBLIQUE = 'sb_publishable_06uV9QEJP7WmyV31tKe9pQ_yvGjTp-c';
const ADRESSE_HAMEAU = 'https://maeljoly68-art.github.io/hameau/';
// Une session lancée depuis le widget est libre. Pour lui donner un objectif, mets ici un nombre de minutes (ex. 50).
const OBJECTIF = null;

const COULEURS = {
  fond: Color.dynamic(new Color('#f5efe3'), new Color('#13201c')),
  encre: Color.dynamic(new Color('#2b2620'), new Color('#efe9dc')),
  doux: Color.dynamic(new Color('#7a7064'), new Color('#9fb0a6')),
  accent: Color.dynamic(new Color('#b0561c'), new Color('#f0b44a')),
  vert: Color.dynamic(new Color('#2e7d4f'), new Color('#6fd39a')),
  surCouleur: Color.dynamic(new Color('#ffffff'), new Color('#13201c')),
  piste: Color.dynamic(new Color('#e6dccb'), new Color('#24332e')),
};

/** Une action du raccourci (« etat », « pause »…), ou { erreur } : « jeton » (absent ou refusé), « serveur », « reseau ». */
async function appeler(jeton, action, plus = {}) {
  if (!jeton) return { erreur: 'jeton' };
  try {
    const r = new Request(URL_RPC);
    r.method = 'POST';
    r.timeoutInterval = 10;
    r.headers = { apikey: CLE_PUBLIQUE, 'Content-Type': 'application/json' };
    r.body = JSON.stringify({ p_jeton: jeton, p_action: action, ...plus });
    const j = await r.loadJSON();
    const code = r.response ? r.response.statusCode : 200;
    if (code >= 400) return { erreur: /jeton/i.test(String(j && j.message)) ? 'jeton' : 'serveur' };
    return j || { erreur: 'serveur' };
  } catch {
    // Sans réseau, le widget le dit plutôt que d'afficher un chrono faux.
    return { erreur: 'reseau' };
  }
}
const lancement = () => (OBJECTIF ? { p_objectif: OBJECTIF } : {});

/** « 37 min », « 1 h 06 ». */
const duree = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`);

// ── Les statistiques du grand widget (mêmes règles que la page Stats de Hameau) ──

/** Le jour local (« 2026-11-28 ») : les sessions se groupent dans le fuseau du téléphone, pas celui du serveur. */
const cleJour = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** n jours plus tard, à midi : un changement d'heure ne fait jamais sauter ni doubler un jour. */
const decaler = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
const lundi = (d) => decaler(d, -((d.getDay() + 6) % 7));

/** Minutes de travail par jour : une session compte au jour de son début, pour sa durée effective. */
function minutesParJour(sessions) {
  const m = new Map();
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (typeof s.secondes !== 'number' || !s.debut) continue;
    const k = cleJour(new Date(s.debut));
    m.set(k, (m.get(k) || 0) + s.secondes / 60);
  }
  return m;
}

/** 0 : rien ; 1 : un peu ; 2 : un quart ; 3 : la moitié ; 4 : objectif atteint. */
function intensite(minutes, objectifJour) {
  if (minutes <= 0) return 0;
  const r = minutes / Math.max(1, objectifJour);
  return r >= 1 ? 4 : r >= 0.5 ? 3 : r >= 0.25 ? 2 : 1;
}

/** Les couleurs des dessins : une image ne suit pas seule le thème, on la peint pour celui du moment. */
function palette() {
  const sombre = Device.isUsingDarkAppearance();
  const v = '#6fd39a';
  return {
    cases: [sombre ? new Color('#ffffff', 0.1) : new Color('#3b2a17', 0.1), new Color(v, 0.25), new Color(v, 0.48), new Color(v, 0.72), new Color(v)],
    vide: sombre ? new Color('#ffffff', 0.14) : new Color('#3b2a17', 0.16),
    atteint: new Color(sombre ? '#61dd97' : '#00713e'),
    pasAtteint: new Color(sombre ? '#fcb036' : '#aa4000'),
    ligne: new Color(v, 0.55),
    deborde: new Color(sombre ? '#efe9dc' : '#2b2620'),
    etiquette: new Color(sombre ? '#979e91' : '#6e6151'),
  };
}

const SEMAINES = 20;
const LARGEUR_DESSIN = 296;

/** La régularité : une colonne par semaine (lundi en haut), la dernière contient aujourd'hui. */
function imageRegularite(parJour, objectifJour, maintenant, largeur = LARGEUR_DESSIN) {
  const P = palette();
  const marge = 14;
  const ecart = 3;
  const c = (largeur - marge - ecart * (SEMAINES - 1)) / SEMAINES;
  const ctx = new DrawContext();
  ctx.size = new Size(largeur, 7 * c + 6 * ecart);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFont(Font.systemFont(9));
  ctx.setTextColor(P.etiquette);
  ['L', '', 'M', '', 'V', '', 'D'].forEach((t, j) => t && ctx.drawTextInRect(t, new Rect(0, j * (c + ecart) + (c - 11) / 2, marge, 12)));
  const aujourdhui = cleJour(maintenant);
  const premier = decaler(lundi(maintenant), -7 * (SEMAINES - 1));
  for (let s = 0; s < SEMAINES; s++) {
    for (let j = 0; j < 7; j++) {
      const k = cleJour(decaler(premier, s * 7 + j));
      const chemin = new Path();
      chemin.addRoundedRect(new Rect(marge + s * (c + ecart), j * (c + ecart), c, c), c * 0.28, c * 0.28);
      ctx.addPath(chemin);
      if (k > aujourdhui) {
        // Les jours à venir de la semaine : un contour, pas une case vide qu'on lirait comme « rien fait ».
        ctx.setStrokeColor(P.vide);
        ctx.setLineWidth(1);
        ctx.strokePath();
      } else {
        ctx.setFillColor(P.cases[intensite(parJour.get(k) || 0, objectifJour)]);
        ctx.fillPath();
      }
    }
  }
  return ctx.getImage();
}

/** Les 14 derniers jours : vert quand l'objectif du jour est atteint, orange sinon, et la ligne de l'objectif. */
function imageJours(parJour, objectifJour, maintenant, largeur = LARGEUR_DESSIN) {
  const P = palette();
  const N = 14;
  const ecart = 5;
  const haut = 56;
  const b = (largeur - ecart * (N - 1)) / N;
  // L'échelle suit l'objectif, pas le plus gros jour : un marathon isolé écraserait sinon toutes les autres barres.
  const echelle = Math.max(objectifJour * 1.5, 30);
  const ctx = new DrawContext();
  ctx.size = new Size(largeur, haut + 16);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFillColor(P.ligne);
  const yObjectif = haut - haut * Math.min(1, objectifJour / echelle);
  for (let x = 0; x < largeur; x += 6) ctx.fillRect(new Rect(x, yObjectif, 3, 1));
  ctx.setFont(Font.systemFont(9));
  ctx.setTextColor(P.etiquette);
  ctx.setTextAlignedCenter();
  for (let i = 0; i < N; i++) {
    const jour = decaler(maintenant, i - (N - 1));
    const m = parJour.get(cleJour(jour)) || 0;
    const deborde = m > echelle;
    // 3 points au moins : un jour vide se voit, au lieu de disparaître.
    const h = Math.max(3, (haut - (deborde ? 3 : 0)) * Math.min(1, m / echelle));
    const x = i * (b + ecart);
    const chemin = new Path();
    chemin.addRoundedRect(new Rect(x, haut - h, b, h), Math.min(4, b / 3), Math.min(4, b / 3));
    ctx.addPath(chemin);
    ctx.setFillColor(m >= objectifJour ? P.atteint : P.pasAtteint);
    ctx.fillPath();
    if (deborde) {
      // Au-delà de l'échelle : un liseré clair au sommet dit « plus que ça ».
      ctx.setFillColor(P.deborde);
      ctx.fillRect(new Rect(x, 0, b, 2));
    }
    ctx.drawTextInRect(['D', 'L', 'M', 'M', 'J', 'V', 'S'][jour.getDay()], new Rect(x, haut + 4, b, 12));
  }
  return ctx.getImage();
}

// ── Dans l'app : ce que fait un toucher sur le widget ──

/** Ce que Hameau a répondu : une notification si c'est fait, une alerte s'il y a un souci (elle, on ne la rate pas). */
async function annoncer(r) {
  if (r.erreur) {
    const a = new Alert();
    a.title = 'Hameau';
    a.message = r.erreur === 'jeton' ? 'Jeton absent ou refusé : modifie le widget → Parameter (ton jeton des raccourcis).' : 'Hameau ne répond pas. Réessaie dans un instant.';
    a.addAction('OK');
    await a.presentAlert();
    return;
  }
  const n = new Notification();
  n.title = 'Hameau';
  n.body = r.message || 'C’est fait.';
  await n.schedule();
}

/** Terminer : on demande ce qui a été fait ; annuler laisse la session tourner, rien n'est enregistré. */
async function terminer(jeton) {
  const q = new Alert();
  q.title = 'Terminer la session ?';
  q.message = 'Elle sera enregistrée (pour une pause, c’est l’autre bouton). Qu’as-tu fait ?';
  q.addTextField('Chapitre 3 relu…', '');
  q.addDestructiveAction('Terminer et enregistrer');
  q.addCancelAction('Continuer la session');
  if ((await q.presentAlert()) === -1) return;
  await annoncer(await appeler(jeton, 'arreter', { p_description: q.textFieldValue(0) }));
}

/** Le petit widget : on relit l'état (celui du widget peut dater de quelques minutes) et on propose ce qui a du sens. */
async function menu(jeton) {
  const e = await appeler(jeton, 'etat');
  if (e.erreur) return annoncer(e);
  const a = new Alert();
  a.title = 'Hameau';
  a.message = e.message || '';
  const choix = [];
  const ajouter = (libelle, faire) => {
    a.addAction(libelle);
    choix.push(faire);
  };
  if (e.etat === 'en_cours') ajouter('⏸ Pause', async () => annoncer(await appeler(jeton, 'pause')));
  else if (e.etat === 'en_pause') ajouter('▶ Reprendre', async () => annoncer(await appeler(jeton, 'reprendre')));
  else ajouter('▶ Lancer', async () => annoncer(await appeler(jeton, 'demarrer', lancement())));
  if (e.etat === 'en_cours' || e.etat === 'en_pause') ajouter('■ Terminer…', () => terminer(jeton));
  ajouter('Ouvrir Hameau', async () => Safari.open(ADRESSE_HAMEAU));
  a.addCancelAction('Annuler');
  const i = await a.presentSheet();
  if (i >= 0 && choix[i]) await choix[i]();
}

async function agir(demande, jeton) {
  // Les boutons envoient l'action qu'ils montrent (pause, reprendre…), jamais un « alterner » : un widget qui date de
  // quelques minutes ne doit pas reprendre une session qu'on vient de mettre en pause ailleurs.
  if (demande === 'demarrer') await annoncer(await appeler(jeton, 'demarrer', lancement()));
  else if (demande === 'pause' || demande === 'reprendre') await annoncer(await appeler(jeton, demande));
  else if (demande === 'terminer') await terminer(jeton);
  else if (demande === 'menu') await menu(jeton);
}

// ── Le widget ──

async function dessiner() {
  const jeton = String(args.widgetParameter || '').trim();
  const famille = config.widgetFamily || 'small';
  const grand = famille === 'systemLarge' || famille === 'systemExtraLarge';
  // Le grand widget demande aussi les statistiques, en même temps que l'état.
  const [e, stats] = await Promise.all([appeler(jeton, 'etat'), grand ? appeler(jeton, 'stats') : Promise.resolve(null)]);
  const enCours = e.etat === 'en_cours' && typeof e.depuis === 'string';
  const enPause = e.etat === 'en_pause';
  const ouverte = enCours || enPause;
  const minutes = typeof e.minutes === 'number' ? e.minutes : null;
  const objectif = typeof e.objectif === 'number' ? e.objectif : null;
  const statut = e.erreur === 'jeton' ? 'Jeton à mettre' : e.erreur ? 'Hors ligne' : enCours ? 'En cours' : enPause ? 'En pause' : 'Pas de chrono';
  /** Le lien d'un toucher : relance ce script dans l'app, avec l'action et le jeton du widget. */
  const lien = (action) => `scriptable:///run/${encodeURIComponent(Script.name())}?action=${action}&jeton=${encodeURIComponent(jeton)}`;

  const w = new ListWidget();
  // Sans jeton, le toucher ouvre Hameau, là où on le crée ; sinon il agit sur le chrono.
  // Hors ligne, le menu relit l'état au toucher plutôt que de lancer à l'aveugle.
  w.url = e.erreur === 'jeton' ? ADRESSE_HAMEAU : e.erreur || ouverte ? lien('menu') : lien('demarrer');
  // Relire l'état dans cinq minutes : iOS choisit le moment exact, souvent un peu plus tard.
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

  function texte(t, police, couleur, dans = w) {
    const x = dans.addText(t);
    x.font = police;
    x.textColor = couleur;
    x.minimumScaleFactor = 0.6;
    x.lineLimit = 1;
    return x;
  }
  /** Le temps de travail qui défile, compté à partir du départ sans les pauses (« depuis »). */
  function minuteur(police, couleur, dans = w) {
    const d = dans.addDate(new Date(e.depuis));
    d.applyTimerStyle();
    d.font = police;
    d.textColor = couleur;
    d.minimumScaleFactor = 0.5;
    d.lineLimit = 1;
    return d;
  }
  function bouton(dans, libelle, action, fond, encre) {
    const b = dans.addStack();
    b.url = lien(action);
    b.backgroundColor = fond;
    b.cornerRadius = 12;
    b.setPadding(8, 14, 8, 14);
    texte(libelle, Font.semiboldSystemFont(15), encre, b);
    return b;
  }
  const tempsFige = () => (minutes !== null ? duree(minutes) : '—');

  if (famille === 'accessoryInline') {
    // Une seule ligne au-dessus de l'heure de l'écran verrouillé.
    texte(ouverte ? `Hameau · ${enPause ? 'pause · ' : ''}${tempsFige()}` : `Hameau · ${statut.toLowerCase()}`, Font.systemFont(12), COULEURS.encre);
  } else if (famille === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    if (enCours) minuteur(Font.boldRoundedSystemFont(13), COULEURS.encre);
    else texte(enPause ? 'II' : '—', Font.boldRoundedSystemFont(16), COULEURS.encre);
    texte(enPause ? tempsFige() : 'Hameau', Font.systemFont(9), COULEURS.doux);
  } else if (famille === 'accessoryRectangular') {
    texte(`Hameau · ${statut}`, Font.semiboldSystemFont(12), COULEURS.doux);
    if (enCours) minuteur(Font.boldRoundedSystemFont(26), COULEURS.encre);
    else texte(enPause ? tempsFige() : '—', Font.boldRoundedSystemFont(22), COULEURS.encre);
    if (objectif !== null && ouverte) texte(`objectif ${duree(objectif)}`, Font.systemFont(11), COULEURS.doux);
  } else if (famille === 'small') {
    // Le temps en grand, l'état et l'objectif dessous ; un toucher lance, ou propose pause et fin.
    w.backgroundColor = COULEURS.fond;
    w.setPadding(14, 16, 14, 16);
    texte('HAMEAU', Font.semiboldSystemFont(11), COULEURS.accent);
    w.addSpacer();
    if (enCours) minuteur(Font.boldRoundedSystemFont(34), COULEURS.encre);
    else texte(enPause ? tempsFige() : '—', Font.boldRoundedSystemFont(30), COULEURS.encre);
    w.addSpacer(4);
    texte(statut, Font.semiboldSystemFont(13), enCours ? COULEURS.accent : COULEURS.doux);
    if (objectif !== null && ouverte) texte(`objectif ${duree(objectif)}`, Font.systemFont(12), COULEURS.doux);
    if (e.erreur === 'jeton') texte('Modifier le widget → Parameter', Font.systemFont(11), COULEURS.doux);
    else if (!e.erreur) texte(ouverte ? 'Toucher : pause ou fin' : 'Toucher pour lancer', Font.systemFont(11), COULEURS.doux);
  } else {
    // Moyen et grand : le temps à gauche, les deux boutons à droite. Toucher ailleurs ouvre Hameau.
    w.url = ADRESSE_HAMEAU;
    w.backgroundColor = COULEURS.fond;
    w.setPadding(14, 16, 14, 16);
    texte('HAMEAU', Font.semiboldSystemFont(11), COULEURS.accent);
    if (grand) w.addSpacer(4);
    else w.addSpacer();
    const ligne = w.addStack();
    ligne.layoutHorizontally();
    ligne.centerAlignContent();
    const gauche = ligne.addStack();
    gauche.layoutVertically();
    if (enCours) minuteur(Font.boldRoundedSystemFont(grand ? 32 : 40), COULEURS.encre, gauche);
    else texte(enPause ? tempsFige() : '—', Font.boldRoundedSystemFont(grand ? 28 : 34), COULEURS.encre, gauche);
    texte(statut, Font.semiboldSystemFont(13), enCours ? COULEURS.accent : COULEURS.doux, gauche);
    if (objectif !== null && ouverte) texte(`objectif ${duree(objectif)}`, Font.systemFont(12), COULEURS.doux, gauche);
    if (e.erreur === 'jeton') texte('Modifier le widget → Parameter', Font.systemFont(11), COULEURS.doux, gauche);
    ligne.addSpacer();
    if (!e.erreur) {
      const droite = ligne.addStack();
      droite.layoutVertically();
      // ⏸ ambre pour la pause ; ▶ vert pour lancer ou reprendre ; ■ discret pour finir.
      if (enCours) bouton(droite, '⏸ Pause', 'pause', COULEURS.accent, COULEURS.surCouleur);
      else if (enPause) bouton(droite, '▶ Reprendre', 'reprendre', COULEURS.vert, COULEURS.surCouleur);
      else bouton(droite, '▶ Lancer', 'demarrer', COULEURS.vert, COULEURS.surCouleur);
      if (ouverte) {
        droite.addSpacer(8);
        bouton(droite, '■ Fin', 'terminer', COULEURS.piste, COULEURS.encre);
      }
    }
    if (grand && stats && !stats.erreur && Array.isArray(stats.sessions)) statistiques(w, stats, famille === 'systemExtraLarge');
    w.addSpacer();
  }

  /** La régularité et les 14 derniers jours, l'un sous l'autre (côte à côte sur le très grand widget de l'iPad). */
  function statistiques(dans, st, coteACote) {
    const parJour = minutesParJour(st.sessions);
    const objectifJour = typeof st.objectif_jour === 'number' && st.objectif_jour > 0 ? st.objectif_jour : 120;
    const maintenant = new Date();
    dans.addSpacer(10);
    const bloc = dans.addStack();
    if (coteACote) bloc.layoutHorizontally();
    else bloc.layoutVertically();
    const partie = (titre, image) => {
      const p = bloc.addStack();
      p.layoutVertically();
      texte(titre, Font.boldSystemFont(13), COULEURS.encre, p);
      p.addSpacer(4);
      const i = p.addImage(image);
      i.imageSize = image.size;
      return p;
    };
    partie(`Régularité · ${SEMAINES} semaines`, imageRegularite(parJour, objectifJour, maintenant));
    bloc.addSpacer(coteACote ? 24 : 10);
    partie('14 derniers jours', imageJours(parJour, objectifJour, maintenant));
  }

  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentSmall();
}

const demande = (args.queryParameters || {}).action;
if (!config.runsInWidget && demande) await agir(demande, String((args.queryParameters || {}).jeton || '').trim());
else await dessiner();
Script.complete();

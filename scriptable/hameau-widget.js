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

const URL_RPC = 'https://nisjysdlyryyrsgwmcaa.supabase.co/rest/v1/rpc/hameau_raccourci';
const CLE_PUBLIQUE = 'sb_publishable_06uV9QEJP7WmyV31tKe9pQ_yvGjTp-c';
const ADRESSE_HAMEAU = 'https://maeljoly68-art.github.io/hameau/';

const COULEURS = {
  fond: Color.dynamic(new Color('#f5efe3'), new Color('#13201c')),
  encre: Color.dynamic(new Color('#2b2620'), new Color('#efe9dc')),
  doux: Color.dynamic(new Color('#7a7064'), new Color('#9fb0a6')),
  accent: Color.dynamic(new Color('#b0561c'), new Color('#f0b44a')),
};

/** L'état du chrono, ou { erreur } : « jeton » (absent ou refusé), « serveur », « reseau ». */
async function lireEtat(jeton) {
  if (!jeton) return { erreur: 'jeton' };
  try {
    const r = new Request(URL_RPC);
    r.method = 'POST';
    r.timeoutInterval = 10;
    r.headers = { apikey: CLE_PUBLIQUE, 'Content-Type': 'application/json' };
    r.body = JSON.stringify({ p_jeton: jeton, p_action: 'etat' });
    const j = await r.loadJSON();
    const code = r.response ? r.response.statusCode : 200;
    if (code >= 400) return { erreur: /jeton/i.test(String(j && j.message)) ? 'jeton' : 'serveur' };
    return j || { erreur: 'serveur' };
  } catch {
    // Sans réseau, le widget le dit plutôt que d'afficher un chrono faux.
    return { erreur: 'reseau' };
  }
}

/** « 37 min », « 1 h 06 ». */
const duree = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`);

const famille = config.widgetFamily || 'small';
const e = await lireEtat(String(args.widgetParameter || '').trim());
const enCours = e.etat === 'en_cours' && typeof e.depuis === 'string';
const enPause = e.etat === 'en_pause';
const minutes = typeof e.minutes === 'number' ? e.minutes : null;
const objectif = typeof e.objectif === 'number' ? e.objectif : null;
const statut = e.erreur === 'jeton' ? 'Jeton à mettre' : e.erreur ? 'Hors ligne' : enCours ? 'En cours' : enPause ? 'En pause' : 'Pas de chrono';

const w = new ListWidget();
w.url = ADRESSE_HAMEAU;
// Relire l'état dans cinq minutes : iOS choisit le moment exact, souvent un peu plus tard.
w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

function texte(t, police, couleur) {
  const x = w.addText(t);
  x.font = police;
  x.textColor = couleur;
  x.minimumScaleFactor = 0.6;
  x.lineLimit = 1;
  return x;
}
/** Le temps de travail qui défile, compté à partir du départ sans les pauses (« depuis »). */
function minuteur(police, couleur) {
  const d = w.addDate(new Date(e.depuis));
  d.applyTimerStyle();
  d.font = police;
  d.textColor = couleur;
  d.minimumScaleFactor = 0.5;
  d.lineLimit = 1;
  return d;
}
const tempsFige = () => (minutes !== null ? duree(minutes) : '—');

if (famille === 'accessoryInline') {
  // Une seule ligne au-dessus de l'heure de l'écran verrouillé.
  texte(enCours || enPause ? `Hameau · ${enPause ? 'pause · ' : ''}${tempsFige()}` : `Hameau · ${statut.toLowerCase()}`, Font.systemFont(12), COULEURS.encre);
} else if (famille === 'accessoryCircular') {
  w.addAccessoryWidgetBackground = true;
  if (enCours) minuteur(Font.boldRoundedSystemFont(13), COULEURS.encre);
  else texte(enPause ? 'II' : '—', Font.boldRoundedSystemFont(16), COULEURS.encre);
  texte(enPause ? tempsFige() : 'Hameau', Font.systemFont(9), COULEURS.doux);
} else if (famille === 'accessoryRectangular') {
  texte(`Hameau · ${statut}`, Font.semiboldSystemFont(12), COULEURS.doux);
  if (enCours) minuteur(Font.boldRoundedSystemFont(26), COULEURS.encre);
  else texte(enPause ? tempsFige() : '—', Font.boldRoundedSystemFont(22), COULEURS.encre);
  if (objectif !== null && (enCours || enPause)) texte(`objectif ${duree(objectif)}`, Font.systemFont(11), COULEURS.doux);
} else {
  // Écran d'accueil (petit, moyen ou grand) : le temps en grand, l'état et l'objectif dessous.
  w.backgroundColor = COULEURS.fond;
  w.setPadding(14, 16, 14, 16);
  texte('HAMEAU', Font.semiboldSystemFont(11), COULEURS.accent);
  w.addSpacer();
  if (enCours) minuteur(Font.boldRoundedSystemFont(famille === 'small' ? 34 : 44), COULEURS.encre);
  else texte(enPause ? tempsFige() : '—', Font.boldRoundedSystemFont(famille === 'small' ? 30 : 38), COULEURS.encre);
  w.addSpacer(4);
  texte(statut, Font.semiboldSystemFont(13), enCours ? COULEURS.accent : COULEURS.doux);
  if (objectif !== null && (enCours || enPause)) texte(`objectif ${duree(objectif)}`, Font.systemFont(12), COULEURS.doux);
  if (e.erreur === 'jeton') texte('Modifier le widget → Parameter', Font.systemFont(11), COULEURS.doux);
}

if (config.runsInWidget) Script.setWidget(w);
else await w.presentSmall();
Script.complete();

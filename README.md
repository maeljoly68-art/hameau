# Hameau

Suivi du temps de travail, en petit jeu : tu lances une session, tu l’arrêtes,
tu notes ce que tu as fait — et chaque minute de concentration te donne des
points qui font grandir un village isométrique.

Une seule app pour le **téléphone, l’iPad et l’ordinateur** : c’est une
application web installable (PWA). Pas d’App Store, pas de compte
développeur Apple, rien à télécharger sur Windows.

## Le jeu

| | |
|---|---|
| **Points** | 1 point par minute, +5 par bloc ininterrompu de 25 min. Rien sous 5 min. Plafond à 4 h par session (un chrono oublié la nuit ne rapporte pas 600 points). |
| **Objectif de session** | Libre, 25, 50 ou 90 min : le chrono monte, l'anneau se remplit vers l'objectif avec le compte à rebours, et un carillon (plus une notification si activée) annonce la fin. En session libre, l'anneau suit le prochain bonus de 25 min. |
| **Pause** | Une session se met en pause et reprend : le chrono se fige, et le temps de pause est déduit de la durée, donc des points, des stats et des succès. Terminer pendant une pause est permis : la pause s'arrête avec la session. |
| **Objectif du jour** | Réglable (30 min à 6 h). Il sert d'échelle à l'anneau « Aujourd'hui » et au calendrier de régularité. |
| **Niveaux** | Calculés sur les points *gagnés* (dépenser ne fait jamais reculer). Chaque niveau demande ~1 h de plus que le précédent. |
| **Village** | Le terrain s'agrandit de 5×5 à 11×11 avec les niveaux. 16 bâtiments, du parterre de fleurs (10 pts) au château (niveau 14). Démolir rend les points : c'est aussi comme ça qu'on déplace. Tu peux nommer ton hameau. |
| **Saisons** | Le village suit le calendrier : feuillage roux et feuilles qui tombent en automne, neige sur les toits et flocons en hiver, arbres en fleurs et pétales au printemps. Feux d'artifice au passage de niveau. |
| **Vivant** | Les habitants vont et viennent entre leur maison et le feu, les nuages passent, les lucioles sortent les nuits douces. Pendant une session, le feu s'embrase, le moulin tourne, la forge fume, les abeilles bourdonnent. Le ciel suit l'heure (aube, jour, soir, nuit). |
| **Succès** | 14 succès déduits de l'historique (séries, heures cumulées, marathon, lève-tôt…). Rien n'est stocké : supprimer une session retire honnêtement ce qu'elle avait donné. |
| **Stats** | Calendrier de régularité (un an sur ordinateur), 14 derniers jours avec la ligne d'objectif, comparaison à la semaine précédente au même jour, et « quand es-tu le plus concentré » : la durée MOYENNE des sessions par moment de la journée, à partir de 3 sessions — pas le total, qui désignerait seulement le moment le plus fréquent. |
| **Série** | Jours d'affilée avec au moins 25 min. La série d'hier tient tant que la journée n'est pas finie ; le record est gardé. |

## Sillage

L'onglet **Tâches** relie Hameau à [Sillage](https://maeljoly68-art-jdtpromaelfx.maeljoly68.workers.dev), avec le compte Sillage de la personne (une connexion par appareil, le mot de passe n'est pas gardé). Hameau n'a aucun droit de plus que dans Sillage : ce sont les règles d'accès de Sillage qui s'appliquent.

- **Habitudes du jour** (les tâches récurrentes de Sillage) : celles attendues aujourd'hui, à cocher — mêmes règles que Sillage (jours prévus, ou « n fois par semaine »).
- **Tâches** : dans l'ordre de Sillage (retard, échéance, importance). Ajouter une tâche ici l'ajoute dans Sillage ; la cocher la marque faite.
- **Lancer une session sur une tâche** : son estimation devient l'objectif, et la fin de session propose de la marquer faite.
- **Temps de travail** : chaque session close part dans `focus_externe` (source `hameau`), le circuit que le portail de Sillage lit déjà. L'envoi se fait par différences : une session corrigée ou supprimée ici l'est aussi là-bas.



- **Premiers pas** : une liste qui se coche toute seule d'après tes données (première session, premier bâtiment, nom du hameau, installation, raccourci).
- **Fin de session** : les dernières descriptions de la même catégorie sont proposées en un toucher.
- **Annuler** : supprimer une session ou démolir un bâtiment se rattrape pendant quelques secondes, sans confirmation à valider par réflexe.
- **Historique** : recherche sans accents ni majuscules, filtre par catégorie, une couleur stable par catégorie.
- **Mode focus** : ambiance « feu de camp » (bruit brun et crépitements, synthétisés sur l'appareil).
- **Thème** : automatique, sombre ou clair, par appareil.
- **Export** : CSV pour Excel (séparateur « ; », accents conservés, formules neutralisées) ou sauvegarde JSON complète.
- **Mise à jour** : une app laissée ouverte des heures prévient quand une nouvelle version est publiée.

## Cours et calendrier

L'onglet **Cours** garde, dans le compte, ce qui était jusque-là enregistré « sur cet appareil » dans les pages de cours : la progression de chaque chapitre, les notes, les dates de partiel. Il en tire le calendrier du jour et des semaines à venir.

- **Cours → chapitres** : un chapitre est une unité qu'on apprend (une fiche, un TD, les flashcards…). Il porte sa durée de lecture, son niveau dans le cycle, son dernier et son prochain passage. Un cours porte la date de son partiel et l'adresse de l'artefact d'origine.
- **Cycle d'apprentissage** (`src/core/revision.ts`) : lu une fois, un chapitre est revu dès le lendemain, puis après 3, 7, 14, 30 et 60 jours. La note donnée à chaque révision règle l'écart : « À revoir » ramène à demain et redescend de deux crans, « Difficile » divise l'écart par deux, « Facile » saute un cran.
- **Calendrier** (`src/core/planning.ts`) : le partiel le plus proche passe en premier ; les chapitres neufs se lisent dans l'ordre, jamais dans les 3 derniers jours ; chaque chapitre a un dernier passage dans les 4 jours qui précèdent le partiel ; la journée n'est jamais chargée au-delà du temps disponible. Si ce temps ne suffit pas, l'écart est chiffré. Le calendrier n'est **pas** enregistré : il se recalcule depuis l'état réel des chapitres, pour ne jamais diverger de ce qu'on a vraiment fait.
- **Notes** : par chapitre, avec un passage cité facultatif.
- **Chrono** : « Lancer le chrono » démarre une session dans la catégorie du cours, avec la durée prévue pour objectif ; à la fin, la fenêtre propose de noter le chapitre.
- Réservé au compte (les tables `cours`, `chapitres`, `notes_chapitres`, `reglages_cours`, protégées par RLS) : le calendrier doit être le même sur tous les appareils.

## Emploi du temps de l'université

« Brancher mon emploi du temps », dans l'onglet **Cours**, lit le fichier d'export (.ics) de « Mon emploi du temps » de l'université. Le calendrier d'étude s'en sert ainsi :

- **Cours du jour** : les créneaux d'aujourd'hui et de chaque jour du calendrier, avec leur salle. Une barre sous le numéro du jour dit à quel point il est chargé.
- **Jours chargés** (`capaciteDuJour`, `src/core/planning.ts`) : jusqu'à 4 h de cours dans la journée, le temps de révision ne bouge pas ; il baisse ensuite progressivement, jusqu'à −50 % (réglable de 0 à 90 %) pour 8 h. Une journée légère ne passe donc pas pour un oubli : l'écran dit « 8 h de cours : temps de révision ramené de 1 h à 30 min ».
- **Partiel probable** (`partielProbable`, `src/core/agenda.ts`) : dans cet emploi du temps, l'examen d'une matière s'affiche comme un « CM » de plus, le dernier de la matière (Finance : celui du 17 décembre est dans la salle d'examen). Hameau le **propose**, jamais sans confirmation, sur la page du cours ; il en faut deux CM au moins (un seul est le premier cours), et pas plus de quatre mois devant.
- **Cours pas commencé** : sans date de partiel, un cours n'entre au calendrier que le mois qui précède son premier cours (`JOURS_AVANT_DEBUT`) ; lire un de ses chapitres l'y fait entrer plus tôt.
- **Rattachement** : chaque cours a des « mots » (par exemple « droit spécial des sociétés »). Un créneau lui appartient quand son intitulé les contient **en mots entiers** (« finance » ne prend pas « financement ») ; le plus précis l'emporte, puis l'ordre des cours. Sans mots réglés, le nom du cours sert.

Le lien est dans la ligne `reglages_cours` du compte (colonne `agenda_url`, RLS propriétaire, https seulement), les mots dans `cours.motifs` : migration `20261106000000_agenda.sql`. **Le lien est un secret** : quiconque le connaît lit l'emploi du temps. Il n'est jamais dans le dépôt, jamais réaffiché après l'avoir enregistré, jamais dans un message d'erreur.

Le navigateur lit le fichier **directement chez l'université**, sans relais : son serveur autorise la lecture depuis n'importe quelle origine (en-têtes CORS). S'il cessait de le faire, l'application le dit (« l'université n'autorise plus sa lecture depuis l'application ») et il faudrait un relais côté serveur. Le dernier emploi du temps lu reste sur l'appareil, pour s'afficher aussitôt et hors ligne ; il est relu au-delà de 30 minutes.

## Raccourcis clavier (ordinateur)

<kbd>Espace</kbd> lance ou termine une session · <kbd>P</kbd> pause / reprise · <kbd>F</kbd> mode focus · <kbd>Échap</kbd> quitte · <kbd>Ctrl</kbd>+<kbd>Entrée</kbd> enregistre la fin de session.

## Voir le chrono partout

| Appareil | Comment |
|---|---|
| **Mode focus** | Plein écran, grand anneau, et l'écran reste allumé (pratique pour un iPad posé sur le bureau). |
| **Windows** | Edge ou Chrome → *Installer l’application*. Pendant une session, **⧉ Mini-chrono** ouvre une petite fenêtre toujours au premier plan. Le chrono s’affiche aussi dans le titre de la fenêtre / barre des tâches. |
| **iPhone / iPad** | Safari → Partager → *Sur l’écran d’accueil*. L’app s’ouvre en plein écran. |
| **Écran verrouillé iOS** | Une app web ne peut pas créer d’« activité en direct » (réservé à l’App Store). Le **raccourci Apple** contourne ça : il démarre la session *et* le minuteur de l’Horloge, qui, lui, s’affiche sur l’écran verrouillé et dans la Dynamic Island. Guide pas à pas dans l’app, onglet Réglages. |

Les sessions sont synchronisées en temps réel : lancée sur l’iPhone, elle
apparaît sur le PC ; on peut l’arrêter depuis n’importe quel appareil. Une
seule session peut être ouverte à la fois (la base l’impose).

## Mise en place

### Supabase

Pour mettre la base à jour à la main : ouvrir `supabase/A-COLLER-DANS-SUPABASE.sql`, le coller dans l'éditeur SQL du projet `hameau`, « Run ». Il est engendré depuis les migrations (`scripts/fichier-a-coller.sh`) et rejouable sans risque.


Projet `hameau` (région Paris). L'URL et la clé publiable sont dans
`src/data/config.ts` — publiques par conception, la sécurité repose sur les
règles RLS. La migration est dans `supabase/migrations/` (rejouable).

Authentication → URL Configuration : **Site URL** =
`https://maeljoly68-art.github.io/hameau/` (sinon les emails de confirmation
renvoient vers `localhost`). Le lien du **mot de passe oublié** ramène à cette
même adresse : elle doit aussi figurer dans **Redirect URLs**, faute de quoi
Supabase renvoie vers le Site URL.

Les e-mails (confirmation, mot de passe oublié) partent par le service intégré
de Supabase : il envoie très peu de messages par heure et, tant qu'aucun SMTP
personnalisé n'est branché (Authentication → Emails → SMTP Settings), peut se
limiter aux adresses des membres de l'organisation. Pour que des amis du
classement puissent aussi réinitialiser leur mot de passe, il faut un SMTP
(Resend ou Brevo ont une offre gratuite).

Le projet gratuit se met en pause après une semaine sans aucune activité ; il
se relance d'un clic depuis le tableau de bord Supabase.

### Hébergement

GitHub Pages (dépôt public, Settings → Pages → Source : GitHub Actions).
Chaque poussée sur `main` vérifie puis publie sur
https://maeljoly68-art.github.io/hameau/.

### Développer

```sh
npm install
cp .env.exemple .env.local   # facultatif : pour la synchro
npm run dev
```

Avant de pousser :

```sh
npm run verif                 # types, lint, tests, build
npm run verif:sql             # migration à neuf, rejouée, scénario (PostgreSQL requis : PGHOST, PGUSER…)
```

## Organisation

```
src/core/      calculs purs (points, objectifs, niveaux, séries, succès, village) — testés dans tests/
src/data/      stockage : local (localStorage) ou Supabase, même interface
src/ui/        React : village SVG, chrono en anneau, mode focus, mini-chrono, pages (chargées à la demande)
supabase/      migration : tables, RLS, fonctions des raccourcis
tests/sql/     scénario joué sur un vrai PostgreSQL
```

## Performances

- La bibliothèque Supabase (la moitié du poids de l'app) n'est chargée qu'après le premier affichage.
- Le dernier état connu est gardé sur l'appareil : le village s'affiche aussitôt à l'ouverture, puis se met à jour.
- Le village n'est pas redessiné quand le chrono avance : seul le chrono l'est.
- Historique, statistiques et réglages sont téléchargés quand le navigateur est inactif, pas au démarrage.
- React est dans un fichier à part : il reste en cache d'une version de l'app à l'autre.
- La connexion à Supabase est ouverte pendant que l'app démarre, avant la première requête.

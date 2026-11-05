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

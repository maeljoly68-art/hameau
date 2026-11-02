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
| **Objectif du jour** | Réglable (30 min à 6 h). Il sert d'échelle à l'anneau « Aujourd'hui » et au calendrier de régularité. |
| **Niveaux** | Calculés sur les points *gagnés* (dépenser ne fait jamais reculer). Chaque niveau demande ~1 h de plus que le précédent. |
| **Village** | Le terrain s'agrandit de 5×5 à 11×11 avec les niveaux. 16 bâtiments, du parterre de fleurs (10 pts) au château (niveau 14). Démolir rend les points : c'est aussi comme ça qu'on déplace. Tu peux nommer ton hameau. |
| **Vivant** | Les habitants vont et viennent entre leur maison et le feu, les nuages passent, les lucioles sortent la nuit. Pendant une session, le feu s'embrase, le moulin tourne, la forge fume, les abeilles bourdonnent. Le ciel suit l'heure (aube, jour, soir, nuit). |
| **Succès** | 14 succès déduits de l'historique (séries, heures cumulées, marathon, lève-tôt…). Rien n'est stocké : supprimer une session retire honnêtement ce qu'elle avait donné. |
| **Série** | Jours d'affilée avec au moins 25 min. La série d'hier tient tant que la journée n'est pas finie ; le record est gardé. |

## Raccourcis clavier (ordinateur)

<kbd>Espace</kbd> lance ou termine une session · <kbd>F</kbd> mode focus · <kbd>Échap</kbd> quitte · <kbd>Ctrl</kbd>+<kbd>Entrée</kbd> enregistre la fin de session.

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

Projet `hameau` (région Paris). L'URL et la clé publiable sont dans
`src/data/config.ts` — publiques par conception, la sécurité repose sur les
règles RLS. La migration est dans `supabase/migrations/` (rejouable).

Authentication → URL Configuration : **Site URL** =
`https://maeljoly68-art.github.io/hameau/` (sinon les emails de confirmation
renvoient vers `localhost`).

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
- Historique, statistiques et réglages ne sont téléchargés qu'à leur première ouverture.

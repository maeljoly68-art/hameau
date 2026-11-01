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
| **Niveaux** | Calculés sur les points *gagnés* (dépenser ne fait jamais reculer). Chaque niveau demande ~1 h de plus que le précédent. |
| **Village** | Le terrain s’agrandit de 5×5 à 11×11 avec les niveaux. 13 bâtiments, du parterre de fleurs (10 pts) au château (niveau 14). Démolir rend les points : c’est aussi comme ça qu’on déplace. |
| **Vivant** | Pendant une session, le feu de camp s’embrase, le villageois lit, le moulin tourne, la forge fume. Le ciel suit l’heure (jour, soir, nuit étoilée). |
| **Série** | Jours d’affilée avec au moins 25 min. La série d’hier tient tant que la journée n’est pas finie. |

## Voir le chrono partout

| Appareil | Comment |
|---|---|
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
src/core/      calculs purs (points, niveaux, série, village) — testés dans tests/
src/data/      stockage : local (localStorage) ou Supabase, même interface
src/ui/        React : village SVG, chrono, mini-chrono, pages
supabase/      migration : tables, RLS, fonctions des raccourcis
tests/sql/     scénario joué sur un vrai PostgreSQL
```

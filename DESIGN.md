# Hameau — direction artistique « Almanach »

Un carnet de veillée : la nuit de forêt et la braise d'ambre le soir, le parchemin et l'encre brune le jour.
Le village (illustration SVG, qui suit l'heure et la saison) reste le héros ; l'interface lui sert d'écrin.

## Jetons (`src/style.css`, tout en `oklch`)

| Jeton | Sombre (« Nuit de forêt ») | Clair (« Parchemin ») | Usage |
|---|---|---|---|
| `--fond` / `--fond-2` | vert-noir 19 % / 23 % | papier 95,5 % / 92 % | page, surfaces en creux (champs, lignes) |
| `--carte` / `--carte-2` | 26 % / 31 % | 98,8 % / 95,8 % | cartes, surfaces en relief |
| `--texte` / `-2` / `-3` | crème / 79 % / 69 % | encre / 43 % / 50 % | texte, secondaire, repères discrets |
| `--accent` / `--accent-2` | ambre 81 % / orange 72 % | braise brûlée 51 % / 52 % | actions, onglet actif, récompenses |
| `--vert` | 81 % | 48 % | réussite, démarrer |
| `--rouge` | 73 % | 50 % | alertes, retard |

Les deux thèmes ont été calculés pour que chaque paire texte/fond passe **AA (4,5:1)** ; `axe` ne relève aucune violation de
contraste sur les écrans principaux, clairs et sombres. En clair, l'accent est plus foncé qu'en sombre : une braise vive
sur du papier ne se lirait pas. Si une couleur change, relancer `axe` (voir plus bas).

## Typographie

- **Fraunces** (variable, auto-hébergée) : titres `h1`/`h2`, nom du hameau, titres de la vitrine. `--affichage`.
- **Instrument Sans** (variable, auto-hébergée) : tout le texte. `--police`.
- Chiffres du chrono et des compteurs : police ronde du système, chiffres tabulaires (`--chiffres`) — ils ne « dansent » pas.
- Aucune police chargée depuis un serveur tiers : pas d'adresse IP envoyée à Google, et le service worker garde les polices hors ligne.

## Formes et mouvement

- Rayons : cartes `22 px`, champs et boutons `14 px`, pastilles `99 px`. Une carte = bordure fine + dégradé de 6 % + ombre en deux couches.
- Une bande de couleur (couleur du cours) est une ombre intérieure droite (`box-shadow: inset 4px 0 0`), jamais un `border-left`
  sur un coin arrondi (il dessinait un croissant).
- Mouvement : transitions de 120 à 250 ms, courbe `--ease`. Tout s'arrête avec `prefers-reduced-motion`.
- Navigation : barre en bas sur téléphone (pastille de l'onglet actif), colonne à gauche dès 960 px.

## Règles de maintenance

- Aucune couleur « en dur » dans un composant : toujours un jeton. Les teintes d'un cours viennent de `--teinte` (`hsl`).
- Nommer une classe pour ce qu'elle fait, pas pour ce qu'elle dessine : `.barres` désignait à la fois le graphique des Stats et la
  mini-courbe des amis ; l'une écrasait l'autre. (Voir `.barres-amis`.)
- Vérifier chaque écran en clair et en sombre, à 390 px et à 1 100 px, puis passer `axe` (WCAG 2.2 AA).

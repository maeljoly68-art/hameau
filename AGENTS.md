# Consignes pour les agents

- Avant de pousser : `npm run verif` (types, lint sur tout le dépôt, tests,
  build) et, si la migration change, `npm run verif:sql`. Une poussée sur
  `main` publie.
- Pas de réécriture de l'historique déjà poussé.
- Commentaires en français, qui expliquent le _pourquoi_ (le défaut évité).
- `src/core/` reste pur (ni réseau, ni React, ni horloge lue en interne) et
  chaque règle y a son assertion dans `tests/`. Une assertion doit échouer
  quand on réintroduit le défaut qu'elle décrit.
- Une migration se vérifie à neuf PUIS rejouée sur un PostgreSQL réel
  (`scripts/verifier-migration.sh`).
- Aucune clé secrète ne porte le préfixe `VITE_` : il la livre au navigateur.
- Une durée absente (session en cours) vaut `null`, jamais 0.

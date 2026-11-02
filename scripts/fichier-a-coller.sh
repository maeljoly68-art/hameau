#!/usr/bin/env bash
# Assemble toutes les migrations en un seul fichier à coller dans l'éditeur SQL
# de Supabase. Chaque migration est rejouable : coller le fichier sur une base
# déjà à jour ne change rien. Avec --verifier, échoue si le fichier assemblé
# n'est plus le reflet exact des migrations (il serait devenu une seconde
# source de vérité, qui dérive sans bruit).
set -euo pipefail
cd "$(dirname "$0")/.."
SORTIE=supabase/A-COLLER-DANS-SUPABASE.sql
assembler() {
  echo "-- ================================================================"
  echo "-- À COLLER DANS SUPABASE (projet hameau) — SQL Editor, puis « Run »."
  echo "-- Fichier ENGENDRÉ par scripts/fichier-a-coller.sh : ne pas le modifier"
  echo "-- à la main, modifier les migrations puis relancer le script."
  echo "-- Rejouable : le relancer sur une base à jour ne change rien."
  echo "-- ================================================================"
  for f in supabase/migrations/*.sql; do
    echo
    echo "-- ── $(basename "$f") ──"
    cat "$f"
  done
}
if [ "${1:-}" = "--verifier" ]; then
  diff -q <(assembler) "$SORTIE" >/dev/null || { echo "$SORTIE n'est plus à jour : lancer scripts/fichier-a-coller.sh" >&2; exit 1; }
  echo "Fichier à coller à jour."
else
  assembler > "$SORTIE"
  echo "Écrit : $SORTIE"
fi

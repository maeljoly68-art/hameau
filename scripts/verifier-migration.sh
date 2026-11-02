#!/usr/bin/env bash
# Vérifie les migrations sur un PostgreSQL jetable : à neuf, PUIS rejouées,
# puis le scénario de comportement. Usage : PGHOST=… PGPORT=… PGUSER=… scripts/verifier-migration.sh
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="hameau_verif_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $BASE"
trap 'psql -q -d postgres -c "drop database if exists $BASE" >/dev/null' EXIT
P=(psql -q -v ON_ERROR_STOP=1 -d "$BASE" --set=client_min_messages=warning)
PGOPTIONS='-c client_min_messages=warning' "${P[@]}" -f scripts/simuler-supabase.sql 2>/dev/null
for passe in 1 2; do
  for f in supabase/migrations/*.sql; do PGOPTIONS='-c client_min_messages=warning' "${P[@]}" -f "$f"; done
  echo "Migrations appliquées (passe $passe)."
done
PGOPTIONS='-c client_min_messages=warning' "${P[@]}" -f tests/sql/scenario.sql
# Le fichier à coller doit refléter exactement les migrations vérifiées ici,
# et s'appliquer tel quel, d'un bloc et deux fois, comme dans l'éditeur SQL.
scripts/fichier-a-coller.sh --verifier
BASE2="hameau_coller_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $BASE2"
trap 'psql -q -d postgres -c "drop database if exists $BASE" >/dev/null; psql -q -d postgres -c "drop database if exists $BASE2" >/dev/null' EXIT
PGOPTIONS='-c client_min_messages=warning' psql -q -v ON_ERROR_STOP=1 -d "$BASE2" -f scripts/simuler-supabase.sql 2>/dev/null
for passe in 1 2; do PGOPTIONS='-c client_min_messages=warning' psql -q -v ON_ERROR_STOP=1 -d "$BASE2" -f supabase/A-COLLER-DANS-SUPABASE.sql; done
echo "Fichier à coller appliqué deux fois sans erreur."

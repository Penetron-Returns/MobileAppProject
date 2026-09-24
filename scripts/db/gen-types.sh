#!/usr/bin/env bash
# Regenerates shared/database.types.ts from supabase/migrations using a
# throwaway PostgreSQL cluster (no Supabase CLI or Docker needed).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

db_start
DB_SKIP_SEED=1 db_apply_schema >/dev/null
out="$DB_REPO_ROOT/shared/database.types.ts"
db_psql -At -f "$DB_SCRIPTS_DIR/introspect.sql" | node "$DB_SCRIPTS_DIR/gen-types.mjs" >"$out.tmp"
mv "$out.tmp" "$out"
echo "wrote ${out#"$DB_REPO_ROOT"/}"

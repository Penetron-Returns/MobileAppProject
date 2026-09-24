#!/usr/bin/env bash
# Runs the database test-suite against a throwaway PostgreSQL cluster:
#   shim → migrations (in order) → seed.sql → supabase/tests/*.sql
# then checks that packages/shared/database.types.ts matches the migrated schema.
# Exits non-zero on the first failure; the cluster is always torn down.
#
# Usage: scripts/db/test.sh            (from anywhere)
#        SKIP_TYPES_CHECK=1 scripts/db/test.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

db_start
echo "postgres $("$DB_PG_BIN/postgres" --version | awk '{print $3}') on port $DB_PORT (data: $DB_DATA_DIR)"

db_apply_schema

# Re-applying every migration must be harmless (idempotent-safe).
echo "== re-applying migrations (idempotency check)"
for f in "$DB_SUPABASE_DIR"/migrations/*.sql; do
  PGOPTIONS="-c client_min_messages=warning" db_psql -f "$f" >/dev/null 2>&1 || { echo "re-applying $(basename "$f") failed"; db_psql -f "$f"; exit 1; }
done

passed=0
files=0
for f in "$DB_SUPABASE_DIR"/tests/*.sql; do
  files=$((files + 1))
  name="$(basename "$f")"
  out="$(db_psql -f "$f" 2>&1)" || { echo "FAIL $name"; echo "$out"; exit 1; }
  count="$(grep -c 'NOTICE:  ok ' <<<"$out" || true)"
  passed=$((passed + count))
  echo "PASS $name ($count assertions)"
  if [[ -n "${VERBOSE:-}" ]]; then grep 'NOTICE:  ok ' <<<"$out" | sed 's/^.*NOTICE:  /    /'; fi
done

# ---------------------------------------------------------------------------
# Real concurrency: N sessions race for the same staff/slot. The exclusion
# constraint must let exactly one win; racing the same idempotency key must
# yield one appointment that every caller gets back.
# ---------------------------------------------------------------------------
echo "== concurrency"
fixture="$(db_psql -At -c "select tests.fixture('org_race')")"
race_dir="$(mktemp -d)"
N=12
for i in $(seq 1 "$N"); do
  db_psql -At -c "select pg_sleep(0.3); select (tests.book('$fixture'::jsonb, 'staff_a', 'service_long', 'client_1', '2033-01-03 09:00Z', 'race-distinct-$i')).id" \
    >"$race_dir/distinct.$i" 2>&1 &
  db_psql -At -c "select pg_sleep(0.3); select (tests.book('$fixture'::jsonb, 'staff_b', 'service_long', 'client_2', '2033-01-03 09:00Z', 'race-same-key')).id" \
    >"$race_dir/same.$i" 2>&1 &
done
wait
won="$(grep -lE '^[0-9a-f-]{36}$' "$race_dir"/distinct.* | wc -l)"
lost="$(grep -l 'appointments_no_overlap' "$race_dir"/distinct.* | wc -l)"
same_ids="$(cat "$race_dir"/same.* | grep -E '^[0-9a-f-]{36}$' | sort -u | wc -l)"
same_ok="$(grep -lE '^[0-9a-f-]{36}$' "$race_dir"/same.* | wc -l)"
rm -rf "$race_dir"
if [[ "$won" != "1" || "$lost" != "$((N - 1))" ]]; then
  echo "FAIL concurrency: $won winners / $lost exclusion losers out of $N (expected 1 / $((N - 1)))"; exit 1
fi
if [[ "$same_ok" != "$N" || "$same_ids" != "1" ]]; then
  echo "FAIL concurrency: same idempotency key gave $same_ok successes and $same_ids distinct ids (expected $N / 1)"; exit 1
fi
echo "PASS concurrency ($N racers: 1 booked, $lost got 23P01; $N same-key racers all got the same row)"
passed=$((passed + 2))

if [[ "${SKIP_TYPES_CHECK:-0}" != "1" ]]; then
  if command -v node >/dev/null 2>&1; then
    echo "== checking packages/shared/database.types.ts is up to date"
    tmp="$(mktemp)"
    db_psql -At -f "$DB_SCRIPTS_DIR/introspect.sql" | node "$DB_SCRIPTS_DIR/gen-types.mjs" >"$tmp"
    if ! diff -u "$DB_REPO_ROOT/packages/shared/database.types.ts" "$tmp" >"$tmp.diff"; then
      head -60 "$tmp.diff"
      echo "packages/shared/database.types.ts is stale: run scripts/db/gen-types.sh"
      rm -f "$tmp" "$tmp.diff"
      exit 1
    fi
    rm -f "$tmp" "$tmp.diff"
    echo "types OK"
  else
    echo "node not found; skipping types check"
  fi
fi

echo
echo "ALL GREEN: $files test files, $passed assertions"

#!/usr/bin/env bash
# Shared helpers for the throwaway-Postgres scripts in scripts/db/.
# Source it; it defines db_start / db_stop / db_psql / db_apply_schema.
#
# Env overrides:
#   PG_BIN   directory with initdb/pg_ctl/psql (default: pg_config --bindir,
#            then /usr/lib/postgresql/16/bin, then $PATH)
#   PG_PORT  port for the throwaway cluster (default: a free port)

set -euo pipefail

DB_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_SUPABASE_DIR="$DB_REPO_ROOT/packages/database/supabase"
DB_SCRIPTS_DIR="$DB_REPO_ROOT/scripts/db"

_find_pg_bin() {
  if [[ -n "${PG_BIN:-}" ]]; then echo "$PG_BIN"; return; fi
  for candidate in /usr/lib/postgresql/17/bin /usr/lib/postgresql/16/bin /usr/lib/postgresql/15/bin; do
    if [[ -x "$candidate/initdb" ]]; then echo "$candidate"; return; fi
  done
  if command -v pg_config >/dev/null 2>&1 && [[ -x "$(pg_config --bindir)/initdb" ]]; then
    pg_config --bindir; return
  fi
  dirname "$(command -v initdb)"
}

_free_port() {
  if [[ -n "${PG_PORT:-}" ]]; then echo "$PG_PORT"; return; fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
  else
    echo $(( 20000 + RANDOM % 20000 ))
  fi
}

# initdb refuses to run as root: run the server as the `postgres` OS user.
_as_pg() {
  if [[ "$(id -u)" == "0" ]]; then
    if ! id postgres >/dev/null 2>&1; then
      useradd --system --no-create-home --shell /usr/sbin/nologin postgres
    fi
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

db_start() {
  DB_PG_BIN="$(_find_pg_bin)"
  DB_PORT="$(_free_port)"
  DB_DATA_DIR="$(mktemp -d /tmp/wa-booking-pg.XXXXXX)"
  if [[ "$(id -u)" == "0" ]]; then
    id postgres >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin postgres
    chown postgres: "$DB_DATA_DIR"
  fi
  _as_pg "$DB_PG_BIN/initdb" -D "$DB_DATA_DIR/data" --auth=trust --username=postgres \
    --encoding=UTF8 --locale=C.UTF-8 >"$DB_DATA_DIR/initdb.log" 2>&1 \
    || { cat "$DB_DATA_DIR/initdb.log"; return 1; }
  _as_pg "$DB_PG_BIN/pg_ctl" -D "$DB_DATA_DIR/data" -l "$DB_DATA_DIR/server.log" -w \
    -o "-p $DB_PORT -k $DB_DATA_DIR -c listen_addresses='' -c fsync=off -c wal_level=logical -c timezone=UTC" start >/dev/null \
    || { cat "$DB_DATA_DIR/server.log"; return 1; }
  export PGHOST="$DB_DATA_DIR" PGPORT="$DB_PORT" PGUSER=postgres PGDATABASE=postgres
  trap db_stop EXIT
}

db_stop() {
  if [[ -n "${DB_DATA_DIR:-}" && -d "$DB_DATA_DIR" ]]; then
    _as_pg "$DB_PG_BIN/pg_ctl" -D "$DB_DATA_DIR/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$DB_DATA_DIR"
  fi
}

# psql with fail-fast semantics; extra args are passed through.
db_psql() {
  "$DB_PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 --no-psqlrc "$@"
}

# shim + every migration in order (+ seed unless DB_SKIP_SEED=1)
db_apply_schema() {
  local PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
  export PGOPTIONS
  echo "== supabase shim"
  db_psql -f "$DB_SCRIPTS_DIR/supabase-shim.sql" >/dev/null
  local f
  for f in "$DB_SUPABASE_DIR"/migrations/*.sql; do
    echo "== migration $(basename "$f")"
    db_psql -f "$f" >/dev/null
  done
  if [[ "${DB_SKIP_SEED:-0}" != "1" ]]; then
    echo "== seed.sql"
    db_psql -f "$DB_SUPABASE_DIR/seed.sql" >/dev/null
  fi
}

#!/usr/bin/env sh
# Run a dev server with secrets from Doppler when available, else from local .env files.
#
#   sh scripts/env/run.sh api      # supabase functions serve api (needs Supabase CLI + Docker)
#   sh scripts/env/run.sh mobile   # expo start --dev-client
#
# Windows: use Git Bash. Secrets are never printed; the temp env file is deleted on exit.
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
has_doppler() { command -v doppler >/dev/null 2>&1 && [ -f "$ROOT/doppler.yaml" ]; }

case "${1:-}" in
  api)
    cd "$ROOT/apps/api"
    if has_doppler; then
      TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT INT TERM; chmod 600 "$TMP"
      doppler secrets download --no-file --format env >"$TMP"
      # No `exec`: the shell must survive to run the cleanup trap.
      supabase --workdir "$ROOT/packages/database" functions serve api --env-file "$TMP"
      exit $?
    fi
    [ -f .env ] || { echo "No Doppler and no apps/api/.env. Run 'doppler setup' or copy .env.example to .env." >&2; exit 1; }
    exec supabase --workdir "$ROOT/packages/database" functions serve api --env-file .env
    ;;
  mobile)
    cd "$ROOT/apps/mobile"
    if has_doppler; then exec doppler run -- npx expo start --dev-client; fi
    [ -f .env.local ] || echo "warning: no Doppler and no apps/mobile/.env.local; the app will show its config error screen." >&2
    exec npx expo start --dev-client
    ;;
  *) echo "usage: run.sh api|mobile" >&2; exit 2 ;;
esac

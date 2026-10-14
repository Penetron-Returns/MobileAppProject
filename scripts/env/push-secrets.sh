#!/usr/bin/env sh
# Push backend secrets from Doppler to a hosted Supabase project's Edge Function secrets.
#
#   SUPABASE_PROJECT_REF=<ref> sh scripts/env/push-secrets.sh [--dry-run]
#
# Only variables named in apps/api/.env.example are sent (minus SUPABASE_*, which Supabase
# injects and refuses to accept), so mobile and unrelated Doppler values never reach the project.
# Empty values are skipped. Values are never printed; --dry-run lists names only.
# Needs: doppler (logged in, `doppler setup` done), supabase CLI (logged in). Windows: Git Bash.
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF to the dev project ref}"
command -v doppler >/dev/null 2>&1 || { echo "doppler CLI not found" >&2; exit 1; }
[ "$DRY" = 1 ] || command -v supabase >/dev/null 2>&1 || { echo "supabase CLI not found" >&2; exit 1; }

ALLOWED="$(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' "$ROOT/apps/api/.env.example" | grep -v '^SUPABASE_' || true)"
RAW="$(mktemp)"; OUT="$(mktemp)"
trap 'rm -f "$RAW" "$OUT"' EXIT INT TERM
chmod 600 "$RAW" "$OUT"

(cd "$ROOT/apps/api" && doppler secrets download --no-file --format env >"$RAW")

for key in $ALLOWED; do
  line="$(grep -E "^$key=" "$RAW" | tail -n 1 || true)"
  value="${line#*=}"
  case "$value" in ''|'""'|"''") continue ;; esac
  printf '%s\n' "$line" >>"$OUT"
  echo "  $key"
done

if [ "$DRY" = 1 ]; then
  echo "(dry run) the names above would be set on project $SUPABASE_PROJECT_REF"
  exit 0
fi
supabase secrets set --env-file "$OUT" --project-ref "$SUPABASE_PROJECT_REF"
echo "Secrets set. Edge Functions pick them up on the next invocation."

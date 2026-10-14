#!/usr/bin/env sh
# Report which environment variables are missing for an app. Prints NAMES only, never values.
#
#   sh scripts/env/check.sh [mobile|backend|all] [--hosted]
#
# Sources, in order: the current environment, Doppler (if installed and configured), then
# apps/mobile/.env.local or apps/backend/.env. --hosted skips SUPABASE_* because Supabase injects
# them into Edge Functions. Exit code 1 when a required variable is missing.
# Windows: run from Git Bash (`sh scripts/env/check.sh`).
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="all"
HOSTED=0
for arg in "$@"; do
  case "$arg" in
    mobile|backend|all) TARGET="$arg" ;;
    --hosted) HOSTED=1 ;;
    *) echo "usage: check.sh [mobile|backend|all] [--hosted]" >&2; exit 2 ;;
  esac
done

MOBILE_REQUIRED="EXPO_PUBLIC_API_URL EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"
BACKEND_REQUIRED="CLERK_SECRET_KEY CLERK_JWT_KEY CLERK_AUTHORIZED_PARTIES CLERK_WEBHOOK_SECRET TOKEN_ENCRYPTION_KEY FLOW_TOKEN_SECRET CRON_SECRET API_BASE_URL"
BACKEND_LOCAL_ONLY="SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY"
# Needed only for the WhatsApp channel / Stripe; the API starts without them.
BACKEND_OPTIONAL="META_APP_ID META_APP_SECRET WHATSAPP_VERIFY_TOKEN WHATSAPP_FLOW_PRIVATE_KEY WHATSAPP_REGISTRATION_PIN PUBLIC_WEB_BOOKING_URL STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET"

SNAPSHOT="$(mktemp)"
trap 'rm -f "$SNAPSHOT"' EXIT INT TERM
chmod 600 "$SNAPSHOT"

# Fill SNAPSHOT with "KEY=value" lines for the app, from Doppler or a local env file.
collect() {
  dir="$1"; file="$2"
  if command -v doppler >/dev/null 2>&1 && [ -f "$ROOT/doppler.yaml" ] &&
     (cd "$ROOT/$dir" && doppler secrets download --no-file --format env >"$SNAPSHOT" 2>/dev/null); then
    echo "source: doppler ($dir)"
  elif [ -f "$ROOT/$dir/$file" ]; then
    cp "$ROOT/$dir/$file" "$SNAPSHOT"
    echo "source: $dir/$file"
  else
    : >"$SNAPSHOT"
    echo "source: none (no Doppler, no $dir/$file); using the shell environment only"
  fi
}

is_set() {
  key="$1"
  eval "shell_val=\${$key:-}"
  [ -n "$shell_val" ] && return 0
  line="$(grep -E "^(export )?$key=" "$SNAPSHOT" | tail -n 1 || true)"
  [ -z "$line" ] && return 1
  value="${line#*=}"
  case "$value" in ''|'""'|"''") return 1 ;; esac
  return 0
}

missing_required=0
report() {
  label="$1"; keys="$2"; required="$3"
  for key in $keys; do
    if ! is_set "$key"; then
      if [ "$required" = 1 ]; then
        echo "  MISSING  $key  ($label)"; missing_required=1
      else
        echo "  unset    $key  ($label, optional)"
      fi
    fi
  done
}

if [ "$TARGET" = mobile ] || [ "$TARGET" = all ]; then
  echo "== mobile =="; collect apps/mobile .env.local
  report required "$MOBILE_REQUIRED" 1
fi
if [ "$TARGET" = backend ] || [ "$TARGET" = all ]; then
  echo "== backend =="; collect apps/backend .env
  report required "$BACKEND_REQUIRED" 1
  [ "$HOSTED" = 1 ] || report "local run" "$BACKEND_LOCAL_ONLY" 1
  report feature "$BACKEND_OPTIONAL" 0
fi

if [ "$missing_required" = 1 ]; then
  echo "Some required variables are missing (names only shown)."
  exit 1
fi
echo "All required variables are set."

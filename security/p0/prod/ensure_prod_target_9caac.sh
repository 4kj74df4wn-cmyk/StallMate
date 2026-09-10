#!/usr/bin/env bash
# StallMate P0 — PRODUCTION exact-target guard (R2). FAIL-CLOSED.
# PASS iff resolved deploy target == stallmate-9caac. staging/emulator/unknown/empty => FAIL.
# Usage:  ensure_prod_target_9caac.sh [PROJECT_ID]
#   - if PROJECT_ID arg given, checks it directly
#   - else reads alias 'prod' from ./.firebaserc (repo: security/p0/prod/.firebaserc)
set -euo pipefail
PRODID="stallmate-9caac"
here="$(cd "$(dirname "$0")" && pwd)"
fail(){ echo "PROD-GUARD FAIL: $1"; exit 2; }

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  RC="${FIREBASERC:-$here/.firebaserc}"
  [ -f "$RC" ] || fail "no target arg and .firebaserc not found ($RC)"
  TARGET=$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write((j.projects&&j.projects.prod)||'')" "$RC" 2>/dev/null || true)
fi

[ -n "$TARGET" ] || fail "target empty/unknown"
case "$TARGET" in
  stallmate-staging-*|*staging*)          fail "staging id rejected: $TARGET" ;;
  demo-*|*emulator*|localhost*|127.0.0.1*) fail "emulator/local id rejected: $TARGET" ;;
esac
[ "$TARGET" = "$PRODID" ] || fail "target '$TARGET' != $PRODID (unknown/unexpected)"
echo "PROD-GUARD PASS: target = $PRODID"

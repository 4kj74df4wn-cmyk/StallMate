#!/usr/bin/env bash
# StallMate P0 — production-targeting guard (HOLD-1 hardened, fail-closed).
# Proves staging/deploy commands cannot target production (stallmate-9caac).
# Run from security/p0/staging (or pass the config path as $CFG). Exits non-zero on ANY doubt.
set -euo pipefail
PROD="stallmate-9caac"
here="$(cd "$(dirname "$0")" && pwd)"
CFG="${CFG:-$here/firebase.staging.json}"
fail(){ echo "GUARD BLOCKED: $1"; exit 2; }

# 0) config must exist and resolve (fail-closed if missing/unreadable)
[ -f "$CFG" ]        || fail "config not found: $CFG"
[ -f "$here/.firebaserc" ] || fail ".firebaserc not found in $here (run 'firebase use --add' / provide alias first)"
node -e "JSON.parse(require('fs').readFileSync('$CFG','utf8'))" >/dev/null 2>&1 \
  || node -e "const s=require('fs').readFileSync('$CFG','utf8');JSON.parse(s.split('\n').filter(l=>!l.trim().startsWith('\"//\"')).join('\n'))" >/dev/null 2>&1 \
  || fail "config does not parse: $CFG"

# 1) .firebaserc (which holds the actual project bindings) must NOT reference production.
#    (firebase.json config carries no project id — only aliases in .firebaserc bind targets.)
grep -q "$PROD" "$here/.firebaserc" && fail "production id in $here/.firebaserc"

# 2) resolve the staging alias -> must exist and must NOT be production
STAGING_ID=$(node -e "const j=JSON.parse(require('fs').readFileSync('$here/.firebaserc','utf8'));const p=(j.projects||{});process.stdout.write(p.staging||'')" 2>/dev/null || true)
[ -n "$STAGING_ID" ] || fail "staging alias unresolved in .firebaserc (define alias 'staging' first)"
[ "$STAGING_ID" = "$PROD" ] && fail "staging alias resolves to PRODUCTION"
echo "resolved staging alias -> $STAGING_ID (not $PROD)"

# 3) any explicit arg (e.g. an intended --project value) must not be production
for a in "$@"; do [ "$a" = "$PROD" ] && fail "production id passed as argument"; done

# 4) default alias (if present) must be demo-* (offline) OR the staging id — never production
DEF=$(node -e "const j=JSON.parse(require('fs').readFileSync('$here/.firebaserc','utf8'));process.stdout.write((j.projects&&j.projects.default)||'')" 2>/dev/null || true)
if [ -n "$DEF" ]; then
  case "$DEF" in
    demo-*|"$STAGING_ID") echo "default alias '$DEF' ok";;
    "$PROD") fail "default alias points at production";;
    *) fail "default alias '$DEF' is neither demo-* nor the staging id";;
  esac
fi

echo "GUARD OK: no production ($PROD) reference; deploy target = staging '$STAGING_ID'."

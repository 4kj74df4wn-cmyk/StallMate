#!/usr/bin/env bash
# StallMate P0 §9.2 — production-targeting guard.
# Proves staging/emulator commands cannot accidentally hit production (stallmate-9caac).
# Run from the staging tooling dir (security/p0/staging). Exits non-zero if production is referenced.
set -euo pipefail
PROD="stallmate-9caac"
here="$(cd "$(dirname "$0")" && pwd)"

fail(){ echo "❌ GUARD BLOCKED: $1"; exit 2; }

# 1) Local .firebaserc in this dir must NOT contain the production project id.
if [ -f "$here/.firebaserc" ]; then
  grep -q "$PROD" "$here/.firebaserc" && fail "production id '$PROD' present in $here/.firebaserc"
else
  echo "note: no .firebaserc yet in $here (run 'firebase use --add' here first)"
fi

# 2) Any explicit argument (e.g. an intended --project value) must not be production.
for a in "$@"; do
  [ "$a" = "$PROD" ] && fail "production id '$PROD' passed as argument"
done

# 3) The default alias used for emulator work MUST be a demo-* id (demo-* is offline-only:
#    firebase-tools physically cannot connect a demo-* project to real Google backends).
if [ -f "$here/.firebaserc" ]; then
  DEF=$(node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync('$here/.firebaserc','utf8'));process.stdout.write((j.projects&&j.projects.default)||'')}catch(e){process.stdout.write('')}" 2>/dev/null || true)
  if [ -n "$DEF" ]; then
    case "$DEF" in
      demo-*) echo "✅ default alias '$DEF' is demo-* (emulator-only, cannot reach production)";;
      "$PROD") fail "default alias points at production";;
      *) echo "⚠️ default alias '$DEF' is not demo-* — ensure emulator work uses a demo-* project or explicit --project staging";;
    esac
  fi
fi

echo "✅ GUARD OK: no reference to production ($PROD) detected."

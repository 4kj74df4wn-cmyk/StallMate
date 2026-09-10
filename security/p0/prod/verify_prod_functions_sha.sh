#!/usr/bin/env bash
# StallMate P0 — PRODUCTION deploy-artifact reproducibility guard (R2). FAIL-CLOSED.
# Verifies the WHOLE deploy artifact set is the exact reviewed bytes BEFORE any deploy.
# Invoke from security/p0:   ./prod/verify_prod_functions_sha.sh functions
# Checks (all must match reviewed SHA + be tracked):
#   <parent>/firebase.production.json
#   <functions>/index.js
#   <functions>/p0_r2_owner_binding.js   (TRACKED — no build-copy/gitignore)
#   <functions>/package.json
#   <functions>/package-lock.json        (reproducible deps; use `npm ci`)
set -euo pipefail
D="${1:-functions}"
PARENT="$(dirname "$D")"
CONFIG="$PARENT/firebase.production.json"

EXPECT_INDEX="3e3cd662950f0b86c5be4569f3030bd577a00ef1ec92ecb3473d7fdb744cd4c3"
EXPECT_HANDLER="084f93cecc59b655661f2661b95b6d197505e6019f17dc90831c9b2361b7a200"
EXPECT_CONFIG="3a041f54e73f9d694370f9629d4159edae6d29888f602afd68175f6813b8c71f"
EXPECT_PKG="787a5c7eaa069e53af6dc3ca3128116c19f33a1d5371e2b35afc9109f84b207c"
EXPECT_LOCK="e03ede776e09931007fc7494b62b09d7da2ae6990e9d43b62240f06626534323"

fail(){ echo "FN-SHA GUARD FAIL: $1"; exit 3; }
_sha(){ if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
_check(){ local f="$1" exp="$2" name="$3"; [ -f "$f" ] || fail "$name not found ($f)"; local got; got="$(_sha "$f")"; [ "$got" = "$exp" ] || fail "$name SHA $got != reviewed $exp"; }

[ -f "$D/p0_r2_owner_binding.js" ] || fail "handler not tracked in $D (HOLD-1: no build-copy/gitignore)"
_check "$CONFIG"                    "$EXPECT_CONFIG"  "firebase.production.json"
_check "$D/index.js"                "$EXPECT_INDEX"   "index.js"
_check "$D/p0_r2_owner_binding.js"  "$EXPECT_HANDLER" "p0_r2_owner_binding.js"
_check "$D/package.json"            "$EXPECT_PKG"     "package.json"
_check "$D/package-lock.json"       "$EXPECT_LOCK"    "package-lock.json"
grep -q "require('./p0_r2_owner_binding.js')" "$D/index.js" || fail "index does not import tracked sibling handler"
echo "FN-SHA GUARD PASS: config+index+handler+package+lock all match reviewed bytes; handler tracked"

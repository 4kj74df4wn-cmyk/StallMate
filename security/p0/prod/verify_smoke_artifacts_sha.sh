#!/usr/bin/env bash
# StallMate P0 — SMOKE-ARTIFACT reproducibility guard (R2 post-deploy). FAIL-CLOSED.
# Ensures the smoke runner + its dependency manifest/lock are the exact reviewed bytes.
# Invoke from security/p0:   ./prod/verify_smoke_artifacts_sha.sh
# Smoke deps come from THIS level (security/p0), NOT functions/:
#   security/p0/package.json        (firebase + firebase-admin)
#   security/p0/package-lock.json   (use  npm ci  from here)
#   security/p0/evidence/p0_prod_r2_postdeploy_smoke.js
set -euo pipefail
EXPECT_PKG="cf44a24e769aac030b2aa1b4f16a1493c3956e98773635de281a5e51d6c8daa6"
EXPECT_SMOKE="20951da7ccd5558dbbc9ddc73518ed0a884ff2f7317f428682ee32533775f6a8"
EXPECT_LOCK="2847c4b6dbbce0469adee8362877d3427800f2d9a7563165cc53011d5365a7b0"
fail(){ echo "SMOKE-ARTIFACT GUARD FAIL: $1"; exit 3; }
_sha(){ if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
_check(){ local f="$1" exp="$2" name="$3"; [ -f "$f" ] || fail "$name not found ($f)"; local got; got="$(_sha "$f")"; [ "$got" = "$exp" ] || fail "$name SHA $got != reviewed $exp"; }
_check "package.json"                            "$EXPECT_PKG"   "security/p0/package.json"
_check "evidence/p0_prod_r2_postdeploy_smoke.js" "$EXPECT_SMOKE" "post-deploy smoke script"
_check "package-lock.json"                       "$EXPECT_LOCK"  "security/p0/package-lock.json"
echo "SMOKE-ARTIFACT GUARD PASS: package.json + smoke script + package-lock.json match reviewed bytes"

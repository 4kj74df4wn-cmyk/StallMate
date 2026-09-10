#!/usr/bin/env bash
# StallMate P0 — SMOKE-ARTIFACT reproducibility guard (R2 post-deploy). FAIL-CLOSED.
# The post-deploy smoke has a DEDICATED dependency manifest under security/p0/evidence/
# (firebase + firebase-admin only) to avoid the rules-unit-testing peer conflict in the
# test-suite package. Install + run from there:
#   cd security/p0/evidence && npm ci && node p0_prod_r2_postdeploy_smoke.js
# Invoke this guard from security/p0:   ./prod/verify_smoke_artifacts_sha.sh
set -euo pipefail
EXPECT_PKG="94520d6b651876362d482ae3a4183f5f6d1b43c143f8743a9fe2ac14525eccef"
EXPECT_LOCK="c397d2d83bcaa3f3d328759f6722a2f3fac7507c29d80853e2bf3e24a34d5f98"
EXPECT_SMOKE="e7211eacdd59f2f054f60e832d156f0f819437531e11595894d1ebf401d881b1"
fail(){ echo "SMOKE-ARTIFACT GUARD FAIL: $1"; exit 3; }
_sha(){ if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
_check(){ local f="$1" exp="$2" name="$3"; [ -f "$f" ] || fail "$name not found ($f)"; local got; got="$(_sha "$f")"; [ "$got" = "$exp" ] || fail "$name SHA $got != reviewed $exp"; }
_check "evidence/package.json"                     "$EXPECT_PKG"   "evidence/package.json"
_check "evidence/p0_prod_r2_postdeploy_smoke.js"   "$EXPECT_SMOKE" "post-deploy smoke script"
_check "evidence/package-lock.json"                "$EXPECT_LOCK"  "evidence/package-lock.json"
echo "SMOKE-ARTIFACT GUARD PASS: evidence package.json + smoke script + package-lock.json match reviewed bytes"

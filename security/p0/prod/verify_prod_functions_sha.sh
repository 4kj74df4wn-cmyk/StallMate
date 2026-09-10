#!/usr/bin/env bash
# StallMate P0 — PRODUCTION functions reproducibility guard (R2). FAIL-CLOSED.
# Ensures the deploy source is the exact reviewed bytes BEFORE any deploy.
# Repo layout required (tracked, NOT gitignored):
#   security/p0/functions/index.js                 (bindOwner callable wrapper)
#   security/p0/functions/p0_r2_owner_binding.js   (reviewed R2 handler — MUST be tracked)
#   security/p0/functions/package.json
set -euo pipefail
D="${1:-security/p0/functions}"
EXPECT_HANDLER="084f93cecc59b655661f2661b95b6d197505e6019f17dc90831c9b2361b7a200"
EXPECT_INDEX="3e3cd662950f0b86c5be4569f3030bd577a00ef1ec92ecb3473d7fdb744cd4c3"
fail(){ echo "FN-SHA GUARD FAIL: $1"; exit 3; }
[ -f "$D/p0_r2_owner_binding.js" ] || fail "handler not tracked in $D (Room 00 HOLD-1: no build-copy/gitignore)"
[ -f "$D/index.js" ]              || fail "index.js missing in $D"
GOT_H=$(sha256sum "$D/p0_r2_owner_binding.js" | cut -d' ' -f1)
GOT_I=$(sha256sum "$D/index.js" | cut -d' ' -f1)
[ "$GOT_H" = "$EXPECT_HANDLER" ] || fail "handler SHA $GOT_H != reviewed $EXPECT_HANDLER"
[ "$GOT_I" = "$EXPECT_INDEX" ]   || fail "index SHA $GOT_I != reviewed $EXPECT_INDEX"
grep -q "require('./p0_r2_owner_binding.js')" "$D/index.js" || fail "index does not import tracked handler"
echo "FN-SHA GUARD PASS: handler+index match reviewed bytes; import is local tracked file"

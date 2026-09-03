#!/usr/bin/env bash
set -uo pipefail
CAND="${1:-stallmate_v7.9.8.14.html}"
SNAP_13="523df939fae65166c30fce6394f12a7b780927cdcee4a3e02836a3388a9cb58e"
SNAP_14="d806e672b4409bbefb4f0b57980580720e291f69c268c8b74d08834a7f227a11"
RELEASE_INDEX_SHA="$SNAP_13"   # production index; changeable ONLY at a Room 00-approved Release Gate
sha(){ sha256sum "$1" | cut -d' ' -f1; }
fail(){ echo "VERIFY FAIL: $1"; exit 1; }

echo "== C5 syntax gate (before harness) =="
node tests/syntax_check.js "$CAND" || fail "syntax"

echo "== C3 immutable snapshot guard =="
[ "$(sha baseline/v7.9.8.13_523df939.html)" = "$SNAP_13" ] || fail ".13 snapshot changed"
[ "$(sha baseline/v7.9.8.14_M2_d806e672.html)" = "$SNAP_14" ] || fail "M2 snapshot changed"
echo "  snapshots immutable ok"
echo "== C3 production-index guard (Release-Gate controlled) =="
[ "$(sha index.html)" = "$RELEASE_INDEX_SHA" ] || fail "index.html != approved release ($RELEASE_INDEX_SHA)"
echo "  index.html = approved release ok"

echo "== C1 harness exact-count + exit-code guard =="
run_exact(){ # $1=script $2=exact "N/N PASS"
  local out rc; out="$(node "$1" "$CAND")"; rc=$?
  [ $rc -eq 0 ] || fail "$1 exit code $rc"
  echo "$out" | grep -qx "$2" || fail "$1 did not report EXACTLY '$2' (got: $(echo "$out"|grep -E '[0-9]+/[0-9]+ PASS'|tail -1))"
  echo "  $1 → $2 ok"
}
run_exact tests/M2_harness.js "209/209 PASS"
run_exact tests/M0_M1_harness.js "95/95 PASS"

echo "== C2 protected-scope guard (deterministic fn-body hash) =="
node tests/protected_scope_check.js "$CAND" baseline/v7.9.8.14_M2_d806e672.html || fail "protected scope changed"

echo "== VERIFY OK =="

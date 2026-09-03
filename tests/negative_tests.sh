#!/usr/bin/env bash
# Proves each control guard FAILS on bad input (fail-closed). NON-ZERO exit from guard = working.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; pass=0; fail=0
chk(){ local d="$1"; local rc="$2"; if [ "$rc" -ne 0 ]; then echo "✅ FIRED: $d"; pass=$((pass+1)); else echo "❌ MISS: $d"; fail=$((fail+1)); fi; }
T=$(mktemp -d); SNAP="baseline/v7.9.8.14_M2_d806e672.html"
# 1) 208/209 must FAIL
mkdir -p "$T/c1"; cp -r "$ROOT"/{stallmate_v7.9.8.14.html,verify.sh,baseline,index.html,tests} "$T/c1/"
printf '#!/usr/bin/env node\nconsole.log("208/209 PASS");process.exit(0);\n' > "$T/c1/tests/M2_harness.js"
( cd "$T/c1" && ./verify.sh stallmate_v7.9.8.14.html ) >/dev/null 2>&1; chk "208/209 rejected" $?
# 2) 94/95 must FAIL
mkdir -p "$T/c2"; cp -r "$ROOT"/{stallmate_v7.9.8.14.html,verify.sh,baseline,index.html,tests} "$T/c2/"
printf '#!/usr/bin/env node\nconsole.log("94/95 PASS");process.exit(0);\n' > "$T/c2/tests/M0_M1_harness.js"
( cd "$T/c2" && ./verify.sh stallmate_v7.9.8.14.html ) >/dev/null 2>&1; chk "94/95 rejected" $?
# 3) immutable snapshot tamper must FAIL
mkdir -p "$T/c3"; cp -r "$ROOT"/{stallmate_v7.9.8.14.html,verify.sh,baseline,index.html,tests} "$T/c3/"
printf '\n<!--tamper-->' >> "$T/c3/baseline/v7.9.8.13_523df939.html"
( cd "$T/c3" && ./verify.sh stallmate_v7.9.8.14.html ) >/dev/null 2>&1; chk "snapshot tamper rejected" $?
# 4) production index tamper must FAIL
mkdir -p "$T/c4"; cp -r "$ROOT"/{stallmate_v7.9.8.14.html,verify.sh,baseline,index.html,tests} "$T/c4/"
printf '\n<!--x-->' >> "$T/c4/index.html"
( cd "$T/c4" && ./verify.sh stallmate_v7.9.8.14.html ) >/dev/null 2>&1; chk "index tamper rejected" $?
# 5) protected A3/A4-6 body change must FAIL (real mutation, ref=immutable snapshot)
mkdir -p "$T/c5"; cp -r "$ROOT"/{verify.sh,baseline,index.html,tests} "$T/c5/"
perl -0pe 's/(function computeBillStats\s*\([^)]*\)\s*\{)/$1 var __tamper=1;/' "$ROOT/stallmate_v7.9.8.14.html" > "$T/c5/stallmate_v7.9.8.14.html"
grep -q "__tamper" "$T/c5/stallmate_v7.9.8.14.html" || echo "  (case5 mutation MISSING!)"
( cd "$T/c5" && node tests/protected_scope_check.js stallmate_v7.9.8.14.html "$SNAP" ) >/dev/null 2>&1; chk "protected-fn body change rejected" $?
# 6) missing m2-baseline tag must FAIL
mkdir -p "$T/c6/tests"; cp "$ROOT/tests/require_m2_baseline_tag.sh" "$T/c6/tests/"
( cd "$T/c6" && git init -q && bash tests/require_m2_baseline_tag.sh ) >/dev/null 2>&1; chk "missing m2-baseline tag rejected" $?
# 7) COMBINED BYPASS: protected fn changed + protected_baseline.json co-edited must STILL FAIL
mkdir -p "$T/c7"; cp -r "$ROOT"/{verify.sh,baseline,index.html,tests} "$T/c7/"
perl -0pe 's/(function computeBillStats\s*\([^)]*\)\s*\{)/$1 var __tamper=1;/' "$ROOT/stallmate_v7.9.8.14.html" > "$T/c7/stallmate_v7.9.8.14.html"
# attacker also rewrites the informational JSON to match the tampered candidate
( cd "$T/c7" && node tests/protected_scope_check.js stallmate_v7.9.8.14.html --emit > tests/protected_baseline.json )
( cd "$T/c7" && node tests/protected_scope_check.js stallmate_v7.9.8.14.html "$SNAP" ) >/dev/null 2>&1; chk "combined bypass (fn+json) still rejected" $?
echo ""; echo "NEGATIVE TESTS: $pass fired / $fail missed"; [ $fail -eq 0 ]

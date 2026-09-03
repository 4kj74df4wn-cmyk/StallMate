# SECURITY P0 PHASE 2A — §9.1 BRANCH PREPARATION PACKAGE

**Status:** Room 00 — **Phase 2A Foundation PASS**; **§9.1 branch preparation AUTHORIZED**. §9.2–§9.4, deployment, production changes, main merge, and M3 remain **HOLD**.
**By:** Claude DEV HQ · **Date:** 3 Sep 2026
**HQ push limitation:** HQ has no GitHub credentials — June executes §9.1 in Claude Code on her machine. HQ provides commands + the artifacts to commit.

## Scope of §9.1 (ONLY this)
Create the containment branch and land the Phase-2A **design/test artifacts** on it. **No** production change, **no** staging, **no** Blaze, **no** real data, **no** merge to main, **no** M3, **no** client/auth/Function code (that is R1+, separately gated).

## Label cleanup applied (no logic change)
Per Room 00: comment headers in `p0_rulesA/B` and `p0_emulator_tests.js` updated from "HOLD-4" to "Phase 2A Foundation PASS", and the Foundation doc sentences that read as if §9.1 was already confirmed were reworded to "not yet executed". **Rule/predicate logic is unchanged** — re-run of the emulator suite still yields 213/213 PASS, exit 0. SHAs in `p0_SHA256_manifest.txt` were regenerated to match the comment-only edits.

## Artifacts to commit on the branch (from 02_TEST_EVIDENCE/, SHAs in p0_SHA256_manifest.txt)
`StallMate_SECURITY_P0_Phase2A_Foundation.md` · `StallMate_SECURITY_P0_Phase1_HOLD2_CORRECTED.md` · `p0_rulesA_secure_transitional.rules.json` · `p0_rulesB_secure_fallback.rules.json` · `p0_rules_forwardfix_denyallwrites.rules.json` · `p0_emulator_tests.js` · `p0_emulator_results.txt` · `p0_emulator_results_raw.txt` · `p0_path_inventory.md` · `p0_emulator_test_matrix.md` · `p0_SHA256_manifest.txt`

## June executes in Claude Code
```bash
cd StallMate
git fetch origin
git rev-parse origin/main                              # expect 83b2ca7… (must stay unchanged)
git rev-parse migration/git-system-of-record          # expect e0a7ad35…
git checkout -b security/p0-containment migration/git-system-of-record
git rev-parse HEAD                                     # record branch base

# add Phase 2A artifacts under a security/ folder in the repo (copy from Drive 02_TEST_EVIDENCE/)
mkdir -p security/p0
cp /path/to/02_TEST_EVIDENCE/p0_*.{json,js,txt,md} security/p0/ 2>/dev/null
cp /path/to/02_TEST_EVIDENCE/StallMate_SECURITY_P0_Phase2A_Foundation.md security/p0/
cp /path/to/02_TEST_EVIDENCE/StallMate_SECURITY_P0_Phase1_HOLD2_CORRECTED.md security/p0/

# verify frozen app + regression untouched (no app code changed in 2A)
./verify.sh stallmate_v7.9.8.14.html                  # expect VERIFY OK, 209/209 + 95/95
bash tests/negative_tests.sh                           # expect 7 fired / 0 missed

# (optional but recommended) re-run the P0 emulator suite locally to reproduce 213/213
#   requires Java + the RTDB emulator jar; see p0_emulator_tests.js header

git add security/p0
git commit -m "P0 Phase 2A foundation artifacts (design/rules/emulator-tests) — no app/prod change"
git status                                             # expect clean
git push origin security/p0-containment
git rev-parse origin/security/p0-containment           # remote branch SHA
git rev-parse origin/main                              # expect STILL 83b2ca7… (main untouched)
```

## Fill back to Room 00 after push
- branch base (migration HEAD) `e0a7ad35…` confirmed: `____`
- new branch HEAD SHA: `____`
- remote `origin/security/p0-containment` SHA: `____`
- `origin/main` still `83b2ca7…`: `____`
- verify.sh: `VERIFY OK / 209/209 / 95/95`: `____`
- negative_tests: `7 fired / 0 missed`: `____`
- git status clean: `____`
- artifact SHAs match `p0_SHA256_manifest.txt`: `____`

## Still HOLD after §9.1
§9.2 staging project · §9.3 Blaze/billing · §9.4 production backup/restore · any Firebase deploy · production client change · main merge · M3. Each release R1–R6 needs its own Room 00 gate.

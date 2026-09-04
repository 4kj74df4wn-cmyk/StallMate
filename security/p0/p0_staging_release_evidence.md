# SECURITY P0 — STAGING RELEASE-PACKAGE — HOLD-2 CORRECTED — EVIDENCE (NOT EXECUTED)

**Authorization:** Room 00 — local staging release-package preparation only. **Blaze NOT authorized · no billing · nothing deployed.** Awaiting `BLAZE ACTIVATION — STAGING PROJECT ONLY AUTHORIZED`.
**Date:** 5 Sep 2026.

## HOLD-2 corrections (2 blockers + sequencing)
- **B1 — reproducible command paths:** canonical execution is now ONE form — `cd security/p0/staging` then relative `--config firebase.staging.json` (no absolute path when already in the dir). SR2, SR3 use the same form. **Rules rollback uses a dedicated `staging/firebase.rollback.json`** (→ `database.rules.forwardfix.json`) deployed with `--config firebase.rollback.json`, with **SHA-verify of BOTH the config (`46a7b673…`) and the rules file (`a297d2f9…`)** before deploy — no hand-editing config during an incident, never `firebase.json` without `--config`.
- **B2 — smoke test correctly scoped:** the emulator/handler smoke is **relabeled `PRE-DEPLOY LOCAL SMOKE 7/7 PASS`** (proves local logic only). A new **executable POST-DEPLOY smoke** `p0_staging_smoke_postdeploy.js` is added: authenticates to **staging Firebase Auth** with synthetic identities, calls the **deployed `bindOwner` callable**, uses claim/secret **out-of-band** (env, not repo), checks **staging RTDB** result, redacted output, exit non-zero on any failure, covers valid/anonymous/wrong-UID/replay/expired/tampered/already-bound. **PREPARED — no PASS result until a real SR2 deploy.** `node --check` OK.
- **Sequencing (Room 00):** HOLD-2 fix → build SR1 staging client (no Blaze) → verify SR1 on staging → June approves cost + Blaze (staging only) → deploy SR2 after a separate gate. Recorded in the runbook.

## HOLD-1 corrections (7)
1. **Secret Manager binding:** `functions/index.js` uses `defineSecret('OWNER_BIND_SECRET')`, binds via `onCall({secrets:[OWNER_BIND_SECRET], ...})`, reads `OWNER_BIND_SECRET.value()`. No raw `process.env`. `node --check` OK.
2. **Exact config execution:** runbook commands run from `security/p0/staging/` or `--config security/p0/staging/firebase.staging.json`; a mandatory pre-flight (`guard_no_prod.sh` + `firebase use` staging check) precedes every deploy; **guard fail-closed** if `.firebaserc`/config missing, unparseable, unresolved, or prod-referenced (verified: missing/prod-arg/prod-in-.firebaserc all exit 2; happy path exit 0 resolving `stallmate-staging-2026-5f39f`).
3. **Ruleset mismatch fixed:** SR3 deploys **`database.rules.B.json` (Rules B)** — distinct artifact; `firebase.staging.json` `database.rules` now points to it. SR3 command **SHA-guards** the file (`= 78fcd088…`) before deploy — no blind copy.
4. **Cost guard:** `maxInstances 1` (was 5), `concurrency 1`, `timeoutSeconds 30`, region `asia-southeast1` — all explicit. Budget alert documented as notification-only (not a hard cap).
5. **SR1 artifact:** explicitly **declared PREPARED-NOT-DEPLOYABLE** — the R1 auth module is reviewed/tested, but no full staging client build exists in this commit; integrating it is separate future work.
6. **Post-deploy verification:** executable **staging smoke-test** `p0_staging_smoke_test.js` — 7 cases (valid bind, anonymous, wrong UID, replay, expired, tampered, already-bound/no-takeover); **no production data**; redacted result + exit code (`p0_staging_smoke_result.txt` → **7/7 PASS, exit 0**) + SHA manifest.
7. **Rollback precision:** Function rollback = `firebase functions:delete bindOwner --region asia-southeast1 --project staging --force` (region + non-interactive). Rules rollback = **`database.rules.forwardfix.json` (last-known-secure) exists NOW, before SR3** (SHA `a297d2f9…`), SHA-verified before redeploy; never the insecure legacy ruleset.

## Constraints honored
No Blaze · no billing · no deploy · no live binding · production project never referenced · frozen `.14 d806e672…`/`.13 523df939…` unchanged · Rules B source unchanged · `origin/main 83b2ca7…` unchanged.

## Files (committed under `security/p0/`)
`functions/index.js` · `functions/package.json` · `staging/firebase.staging.json` · `staging/database.rules.B.json` · `staging/database.rules.forwardfix.json` · `staging/guard_no_prod.sh` · `backend/p0_staging_smoke_test.js` · `backend/p0_staging_smoke_result.txt` · `p0_staging_release_runbook.md` · this doc · `p0_staging_release_SHA256_manifest.txt`.

**Return:** SECURITY P0 STAGING RELEASE-PACKAGE HOLD-2 CORRECTED — READY_FOR_ROOM00

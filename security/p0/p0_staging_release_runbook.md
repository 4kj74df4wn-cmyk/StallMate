# SECURITY P0 — STAGING RELEASE RUNBOOK (PREPARED — NOT EXECUTED) — HOLD-1 CORRECTED

**Status:** Local staging release-package only. **Blaze NOT authorized. Nothing deployed. No billing.** Execute only after Room 00 issues `BLAZE ACTIVATION — STAGING PROJECT ONLY AUTHORIZED` + each per-release gate.
**Target:** staging **`stallmate-staging-2026-5f39f`** ONLY. Production project is never targeted. **Every command runs from `security/p0/staging/` (or passes `--config security/p0/staging/firebase.staging.json`) and is preceded by the pre-flight guard.**
**Date:** 5 Sep 2026.

## Pre-flight (MANDATORY before ANY deploy command)
```
cd security/p0/staging
./guard_no_prod.sh                        # fail-closed: aborts if .firebaserc/config missing, unresolved, or prod-referenced
firebase use staging                      # explicit alias
firebase use                              # MUST print staging (stallmate-staging-2026-5f39f), NOT production
firebase projects:list                    # confirm target project id
```
If the guard exits non-zero, or `firebase use` does not resolve to `stallmate-staging-2026-5f39f`, **STOP** (do not deploy).

## Prepared artifacts (committed, deployable, unused)
- `functions/index.js` — callable `bindOwner`, 2nd-gen, region `asia-southeast1`, **maxInstances 1, concurrency 1, timeoutSeconds 30**; secret via **Secret Manager** (`defineSecret('OWNER_BIND_SECRET')` + `onCall({secrets:[OWNER_BIND_SECRET]})` + `.value()`) — never `process.env`, never in repo.
- `functions/package.json` (Node 20). Handler `p0_r2_owner_binding.js` copied into `functions/` at deploy (build step, gitignored — no committed duplicate).
- `staging/firebase.staging.json` — `database.rules` = **`database.rules.B.json`**; functions source `../functions`.
- `staging/database.rules.B.json` — Rules B deploy artifact (SR3), SHA `78fcd0882c73085bf1f32d5ccf7a73869c54f95c2c9731010110b99ac9431850`.
- `staging/database.rules.forwardfix.json` — **last-known-secure rollback artifact (exists BEFORE SR3)**, SHA `a297d2f91f4acb57994e5b9d0ca9d810133ceca1a6ccdb8cdf228c1e31dea29c`.
- `p0_staging_smoke_test.js` — post-deploy verification (7 cases).

## Preconditions (ALL required before any deploy)
1. Room 00: `BLAZE ACTIVATION — STAGING PROJECT ONLY AUTHORIZED`.
2. June: Blaze on **staging only** + budget + alert (**alert = notification, NOT a hard cap**; cost guard = maxInstances 1 + low volume).
3. Pre-flight guard OK; `firebase use` = staging.
4. Auth providers (anonymous + email/OAuth) enabled on staging.
5. Secret set: `firebase functions:secrets:set OWNER_BIND_SECRET --project staging` (value out-of-band; never in repo/chat).

## Staging releases — each independently reversible (execute one at a time, gate between)
### SR1 — auth-capable client — **PREPARED-NOT-DEPLOYABLE**
The R1 auth module (`security/p0/auth/stallmate_auth.js`) is reviewed and unit-tested, but **no full staging client build/app artifact exists in this commit**. SR1 is therefore **declared PREPARED-NOT-DEPLOYABLE**: integrating the module into a staging client build (staging Firebase config, wired into the app) is a separate future artifact and is NOT part of this release. No SR1 deploy occurs.

### SR2 — owner-binding Function (needs Blaze)
- Pre-flight guard (above). Build step: `cp ../backend/p0_r2_owner_binding.js ../functions/` (gitignored copy).
- Deploy: `firebase deploy --only functions:bindOwner --project staging --config security/p0/staging/firebase.staging.json`
- Verify: `FIREBASE... node ../backend/p0_staging_smoke_test.js` in callable mode against staging (7 cases: valid, anon, wrong UID, replay, expired, tampered, already-bound/no-takeover) → 7/7, redacted result + SHA.
- **Rollback (precise):** `firebase functions:delete bindOwner --region asia-southeast1 --project staging --force` (non-interactive; region explicit). Existing `roomOwners` bindings persist.
- Monitoring: function error rate, permission-denied.

### SR3 — tighten rules to Rules B (after §E readiness gate)
- Pre-flight guard. §E device-readiness gate = PASS.
- **SHA guard BEFORE deploy (no blind copy):**
  ```
  test "$(shasum -a256 staging/database.rules.B.json | awk '{print $1}')" = "78fcd0882c73085bf1f32d5ccf7a73869c54f95c2c9731010110b99ac9431850" || { echo RULES_B_SHA_MISMATCH; exit 2; }
  ```
- Deploy: `firebase deploy --only database --project staging --config security/p0/staging/firebase.staging.json` (config → `database.rules.B.json`).
- Verify: run R3 integration behaviour against staging (owner ALLOW; anon/unbound/wrong-owner/delete/takeover DENY; idempotency/OPID_CONFLICT).
- **Rollback (secure, artifact pre-exists):** point config `database.rules` → `database.rules.forwardfix.json`, SHA-verify `= a297d2f9…`, then `firebase deploy --only database --project staging`. **Never** deploy the insecure legacy ruleset. After SR3 stable, snapshot the live rules as `rules_lastknownsecure_<ts>.json`.
- Monitoring: permission-denied on owner ops (halt on sustained > 0), sync/sale-write failure (halt on first).

## Guardrails (every step)
- STAGING ONLY (`--project staging`), production never targeted; pre-flight guard fail-closed before each.
- Synthetic fixtures only; no production data. Each release reversible; stop-triggers + rollback per HOLD-2 §H/§I.
- A separate Room 00 gate is required before any **production** rollout (R1–R6 on live).

**NOT EXECUTED. No Blaze. No deploy. No billing. Awaiting Room 00 authorization.**

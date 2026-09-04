# SECURITY P0 — STAGING RELEASE RUNBOOK (PREPARED — NOT EXECUTED)

**Status:** Local staging release-package preparation only (Room 00-authorized). **Blaze is NOT authorized. Nothing is deployed. No billing activated.** Execute only after Room 00 issues `BLAZE ACTIVATION — STAGING PROJECT ONLY AUTHORIZED` and each per-release gate.
**Target:** staging project **`stallmate-staging-2026-5f39f`** ONLY (via `--project staging`). Production **`stallmate-9caac`** is never targeted. Run `guard_no_prod.sh` before every step.
**Date:** 5 Sep 2026.

## Prepared artifacts (committed, deployable, unused)
- `security/p0/functions/index.js` — callable `bindOwner` (2nd-gen, asia-southeast1, maxInstances 5), wraps reviewed R2 handler. Secret `OWNER_BIND_SECRET` injected at deploy (never in repo).
- `security/p0/functions/package.json` — Node 20, firebase-functions ^5 / firebase-admin ^12.
- `security/p0/functions/p0_r2_owner_binding.js` — the reviewed handler (colocated at deploy).
- `security/p0/staging/firebase.staging.json` — staging deploy config (functions + database rules).
- Rules: `security/p0/p0_rulesB_secure_fallback.rules.json` (+ Rules A, forward-fix) — reviewed.
- Client-auth: `security/p0/auth/stallmate_auth.js` (R1) — for the staging client build.

## Preconditions (ALL required before any deploy)
1. Room 00: `BLAZE ACTIVATION — STAGING PROJECT ONLY AUTHORIZED`.
2. June: Blaze activated on **staging only** + budget + alert (alert ≠ hard cap; maxInstances is the guard).
3. `firebase use staging` active; `guard_no_prod.sh` → GUARD OK; `firebase use` shows staging (not prod).
4. Auth providers (anonymous + email/OAuth) enabled on staging.
5. Owner-bind secret set: `firebase functions:secrets:set OWNER_BIND_SECRET --project staging` (value out-of-band; never in repo/chat).

## Staging releases — each independently reversible (execute one at a time, gate between)
### SR1 — auth-capable client (staging build) — NO Blaze needed
- Deploy: point a staging client build at the staging project; ship anonymous-auth + owner sign-in (R1). No rules change.
- Verify: sign-in flows work against staging Auth emulator/project; existing reads still work under current (permissive) staging rules.
- Rollback: revert to prior client build. Monitoring: auth success/failure rate.

### SR2 — owner-binding Function (needs Blaze)
- Precondition: SR1 done + secret set. **Predeploy build step (not a committed duplicate):** `cp security/p0/backend/p0_r2_owner_binding.js security/p0/functions/` so `index.js`'s `require('./p0_r2_owner_binding.js')` resolves inside the uploaded functions source. The single source-of-truth stays `backend/p0_r2_owner_binding.js`; the copy under `functions/` is build-generated and gitignored (not committed).
- Deploy: `firebase deploy --only functions:bindOwner --project staging`
- Verify: callable `bindOwner` on staging — valid owner+intended-claim binds; anon/unbound/wrong-uid/replay/expired/tampered DENY; already-bound no-takeover (mirrors R2 30/30, now against staging).
- Rollback: `firebase functions:delete bindOwner --project staging` (reverts to no-backend; existing bindings persist).
- Monitoring: function error rate, permission-denied.

### SR3 — tighten rules (Rules B) — after §E readiness gate
- Precondition: SR1+SR2 verified; §E device-readiness gate = PASS (all active staging test devices authenticated + bound).
- Deploy: `firebase deploy --only database --project staging` with Rules B.
- Verify: run R3 integration behaviour against staging (owner ALLOW; anon/unbound/wrong-owner/delete/takeover DENY; idempotency/OPID_CONFLICT).
- Rollback: redeploy previous staging rules artifact (last-known-secure); if none yet, retreat to a secure fallback ruleset — **never** to insecure `1339b716`. Capture `rules_lastknownsecure_<ts>.json` after SR3 stable.
- Monitoring: permission-denied on owner ops (halt on sustained > 0), sync/sale-write failure (halt on first).

## Guardrails (every step)
- STAGING ONLY (`--project staging`); production `stallmate-9caac` never targeted; `guard_no_prod.sh` before each.
- Synthetic fixtures only; no production data on staging.
- Each release reversible; stop-triggers + rollback per HOLD-2 §H/§I.
- This whole sequence is for **staging**; a separate Room 00 gate is required before **production** rollout (R1–R6 on live).

**NOT EXECUTED. No Blaze. No deploy. No billing. Awaiting Room 00 authorization.**

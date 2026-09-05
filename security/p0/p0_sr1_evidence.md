# SECURITY P0 — SR1 STAGING CLIENT BUILD + PRE-SR2 SMOKE CORRECTIONS — EVIDENCE

**Authorization:** Room 00 — SR1 STAGING CLIENT BUILD authorized (no Blaze / no Function-Rules deploy / no production / no merge). Plus PRE-SR2 corrections to the post-deploy smoke.
**Date:** 5 Sep 2026.

## SR1 — staging client build (separate from frozen .13/.14)
`security/p0/client/p0_sr1_staging_client.js` — wires R1 `stallmate_auth.js` with the Firebase **client SDK**, targeting the **staging project only** (`stallmate-staging-2026-5f39f`; refuses any other id when not in emulator mode). Exercises the required flows; verified locally against the **Auth emulator (9099) + RTDB emulator (9000)** as a staging proxy. Staging run injects the staging web config.
- **Result: SR1 CLIENT 9/9 PASS, exit 0** (`p0_sr1_staging_client_result.txt`):
  anonymous bootstrap = device identity (not owner) · anonymous not owner-authorized · permanent sign-in = permanent identity · sign-out clears identity · re-auth restores identity · bound owner => owner-authorized · offline sale queued (not written) · reconnect + flush writes queued sale · exactly one sale at deterministic opId key.
- **Constraints:** frozen `.13/.14` untouched (this is a separate client, not the app); synthetic data only; no Blaze; no Function/Rules deploy; no production access.

## PRE-SR2 corrections (post-deploy smoke `p0_staging_smoke_postdeploy.js`)
1. **package.json + lockfile:** added `security/p0/package.json` (firebase ^10, firebase-admin ^12, @firebase/rules-unit-testing ^5) + `package-lock.json` (lockfileVersion 3) at the `security/p0/` root so BOTH `backend/` and `client/` runners resolve deps by upward `node_modules` resolution (repo previously lacked the imported `firebase`).
2. **Exact staging allowlist:** guard now requires `STAGING_PROJECT_ID === stallmate-staging-2026-5f39f` **and** validates `STAGING_DATABASE_URL` is a real staging RTDB instance (https + contains the staging project id + a firebase RTDB domain), not merely "≠ production". Refuses otherwise (exit 2).
3. **already-bound verification fixed:** after the takeover attempt, the script **re-authenticates as the original owner** to read `roomOwners` (rules permit only the owner to read it) — no longer reads as the attacker (which rules would deny → null).
4. **Cleanup in `finally`:** deletes test Auth users, `roomOwners`, `ownerBindClaimsUsed` nonces, and matching `ownerBindAudit` fixtures via a **staging-only** firebase-admin app (project-id guarded; never production), and **reports cleanup PASS/FAIL**.
- Still **PREPARED — no PASS result until a real SR2 deploy.** `node --check` OK.

## Files (committed under `security/p0/`)
`client/p0_sr1_staging_client.js` · `client/p0_sr1_staging_client_result.txt` · `backend/p0_staging_smoke_postdeploy.js` (corrected) · `package.json` · `package-lock.json` (at `security/p0/`) · this doc · `p0_sr1_SHA256_manifest.txt`.

**Return:** SECURITY P0 SR1 STAGING CLIENT + PRE-SR2 SMOKE CORRECTIONS — READY_FOR_ROOM00

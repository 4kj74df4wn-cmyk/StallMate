# SECURITY P0 — SR1 STAGING CLIENT — HOLD-1 CORRECTED — EVIDENCE

**Authorization:** Room 00 — SR1 STAGING CLIENT BUILD. STILL HOLD: Blaze · billing · Function/Rules/Hosting deploy · production · live binding · merge main · M3.
**Date:** 5 Sep 2026. **Frozen .13/.14 untouched. Staging only. No deploy.**

## HOLD-1 corrections
- **B1 — actual staging app build (browser):** added an **isolated staging app** at `security/p0/client/staging-app/` (derived from the .14 sale/satang model; **frozen .14 original untouched**): `index.html` (browser UI) + `stallmate_auth.browser.js` (generated from `stallmate_auth.js`; `window.StallMateAuth`) + `staging-config.example.js` + `README.md`. It **wires R1 into the app flow** — startup anonymous bootstrap, live auth-state display, owner sign-in / sign-out / re-auth, **guarded sale write**, and a **recovery UI** (pending count + reconnect-replay). Firebase config is **injected from the staging environment** (`window.__SM_STAGING__`); the app **refuses any projectId ≠ `stallmate-staging-2026-5f39f`** and any non-staging RTDB URL. **No Hosting deploy** — serve/test locally + emulator; **browser smoke** steps in the app README (emulator now; staging later). No production; the client never writes `roomOwners` in staging (owner binding is the R2 callable; an emulator-only dev seed exists solely under `?emulator=1`).
- **B2 — financial idempotency bug fixed:** the client writer (in the app AND the harness) is now **create-only + canonical-equal + `OPID_CONFLICT`** — `cur===null` create; existing canonical-equal → idempotent success; existing but **different** → abort transaction + throw `OPID_CONFLICT` (no false `{ok:true}`). New test: same opId + changed `total/totalSatang` ⇒ **DENY** and original record **unchanged**.
- **B3 — synthetic isolation:** the runner/app use a **unique synthetic room `SR1_TEST_<ts>`** (no real shop code like BBMANN). `roomOwners` seeding is **emulator-only and isolated** from production-capable client code; the **live/staging client never writes `roomOwners`** directly — it awaits the R2 callable binding.

## Automated flow verification (staging proxy)
`p0_sr1_staging_client.js` (same wiring as the app) vs Auth emu (9099) + RTDB emu (9000): **SR1 CLIENT 11/11 PASS, exit 0** (`p0_sr1_staging_client_result.txt`) — anonymous bootstrap / permanent sign-in / sign-out / re-auth / bound-owner authorized / auth-offline queue (amounts unchanged) / reconnect replay (same opId) / exactly-one at opId key / **same opId + changed amount ⇒ OPID_CONFLICT / original unchanged**.
Browser build check: `window.StallMateAuth.createAuthController` present; app references the browser auth build + emulator toggle + staging allowlist + `SR1_TEST_` room.

## Required verification — mapping
- Browser staging-app smoke → app README §A (emulator) / §B (staging), run by June.
- All prior R1 flows → covered (bootstrap/sign-in/out/re-auth).
- auth failure queues sale without changing amounts → PASS. reconnect replay same opId → PASS. same opId + different snapshot ⇒ OPID_CONFLICT → PASS.
- frozen `.13/.14` + `origin/main` unchanged → verify OK 209/209+95/95, negative 7/0; `.14 d806e672…`/`.13 523df939…`.

## Files (committed under `security/p0/client/`)
`staging-app/index.html` · `staging-app/stallmate_auth.browser.js` · `staging-app/staging-config.example.js` · `staging-app/README.md` · `staging-app/.gitignore` (ignores `staging-config.js`) · `p0_sr1_staging_client.js` · `p0_sr1_staging_client_result.txt` · `p0_sr1_evidence.md` · `p0_sr1_SHA256_manifest.txt`.

**Return:** SECURITY P0 SR1 STAGING CLIENT HOLD-1 CORRECTED — READY_FOR_ROOM00

# SECURITY P0 R1 — CLIENT-AUTH IMPLEMENTATION — EVIDENCE (HOLD-1 CORRECTED)

**Authorization:** Room 00 — R1 ONLY (client-auth foundation on `security/p0-containment`). STILL HOLD: §9.3 Blaze, R2 owner-binding backend, all Auth/Rules/Functions/Hosting prod config/deploy, production data mutation, merge main, M3.
**Date:** 3 Sep 2026. **Emulator + synthetic only. Frozen app (.14) and all rules unchanged.**

## HOLD-1 corrections
- **BLOCKER-1 (identity ≠ authority):** renamed `permanentOwnerIdentity` → **`permanentIdentity`** (identity fact only). New **`isOwnerAuthorized()`** requires BOTH a non-anonymous permanent identity AND a **verified roomOwners binding via an injected `verifyOwnerBinding(uid)` verifier**. With no verifier (pre-R2), `ownerAuthorized` defaults **false**. Authorization is **re-verified every guarded write** (never cached indefinitely) and cleared on sign-out / token change. `guardedSaleWrite` now requires `ownerAuthorized`, so a permanent-but-UNBOUND account is denied. Proven: anon DENY · unbound permanent DENY · wrong UID DENY · bound owner ALLOW · binding-revoked-after-success DENY · sign-out clears authority · pre-R2 no-verifier DENY.
- **BLOCKER-2 (durable idempotency):** `writeFn` now receives **`(saleSnapshot, opId)`** and MUST write to a **deterministic key = opId** (first write and any replay target the same record). The **immutable deep-cloned** payload + opId is **persisted to the queue BEFORE any network write**; the entry is removed **only after durable ack**; opId/key is **never regenerated on replay**. **Storage failure is surfaced and the network write is not attempted.** Proven: commit-then-client-timeout → replay same key → exactly one sale · restart+replay → still one · mutated caller object cannot alter queued snapshot · storage-failure surfaced (no write attempted) · success writes once at opId key · financial invariants preserved on flush.

## What R1 delivers (foundation, not wired into the frozen app)
`stallmate_auth.js` — a dependency-injected client-auth controller (runs identically in Node tests against the Auth emulator and in the browser via CDN firebase/auth), so **the frozen `.14` and its guards are untouched**. Capabilities:
- **Firebase Auth bootstrap + explicit auth-state handling** (`init`, `onState`, `onAuthStateChanged`/`onIdTokenChanged`).
- **Anonymous authentication = transitional device identity** (`signInAnon`) — `permanentOwnerIdentity=false`.
- **Permanent-owner sign-in pathway** (`signInOwner`) — `permanentOwnerIdentity=true` only for a non-anonymous authenticated user.
- **No weak source is owner authority:** `assertNotOwnerAuthority('anonymous'|'deviceId'|'roomCode'|'pin')` always false; owner authority = permanent (non-anonymous) identity. (roomOwners binding = R2, out of scope.)
- **Recovery/error states:** offline, auth timeout (`AUTH_TIMEOUT`, surfaced not swallowed), expired session / sign-out, re-authentication.
- **Auth failure cannot silently discard or alter a sale:** `guardedSaleWrite` writes durably only when a permanent owner is authenticated AND online AND the write succeeds; otherwise the sale is **queued** (`sm_pending_sale_writes`), never dropped, amounts never mutated; failure surfaced. `flushPendingSales` replays after re-auth, deduped by opId, removing entries only after durable success — **financial invariants preserved**, mirroring the M2 recoverable-journal principle.

## Constraints honored
- Existing production data paths and rules **unchanged** (no rules edited; auth module is additive, separate from `.14`).
- Tested exclusively with the **Auth + RTDB emulators** and **synthetic fixtures**.
- No production data, no credentials, no deploy, no merge.

## Test results (all run by HQ in sandbox)
- **R1 Auth emulator suite: 24/24 PASS, exit 0** (`p0_r1_auth_results.txt`) — incl. all BLOCKER-1 authority cases and BLOCKER-2 durable-idempotency cases above.
- **P0 Rules suite: 213/213 PASS, exit 0** (Rules A/B/forward-fix; unchanged).
- **M2: 209/209 PASS** · **M0/M1: 95/95 PASS** (on frozen `.14`, proving it is untouched).
- **negative_tests: 7 fired / 0 missed** — run on June's machine at commit time (repo-scoped).
- Frozen baselines unchanged: `.14` `d806e672…`, `.13` `523df939…`.

## Files (committed under `security/p0/auth/`)
`stallmate_auth.js` · `p0_r1_auth_tests.js` · `p0_r1_auth_results.txt` · this doc. SHA-256 in `p0_r1_SHA256_manifest.txt`.

**Return:** SECURITY P0 R1 CLIENT-AUTH HOLD-1 CORRECTED — READY_FOR_ROOM00

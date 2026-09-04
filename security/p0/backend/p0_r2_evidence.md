# SECURITY P0 R2 (LOCAL) + §9.3 PREFLIGHT — EVIDENCE

**Authorization:** Room 00 — R2 LOCAL implementation + §9.3 PREFLIGHT. STILL PROHIBITED: Blaze activation · Firebase deploy · production mutation · live owner binding · merge main · M3.
**Date:** 3 Sep 2026. **Emulators + synthetic only. Frozen app (.14) and all rules unchanged.**

## R2 establishes: Firebase UID → authorized owner → permitted room
`p0_r2_owner_binding.js` — trusted-backend owner-binding (Cloud Function / Admin SDK) + deterministic RTDB sale writer. Tested against the **RTDB emulator** (firebase-admin) with **Auth-verified identity injected** as the Functions runtime provides `context.auth`.

1. **Owner binding via backend only** (never client): `createOwnerBindingHandler().bindOwner(data, context)`.
2. **Requires permanent, non-anonymous identity** — anonymous / unauthenticated → DENY.
3. **Atomic, CREATE-ONLY `roomOwners` binding** (RTDB transaction) — never silent reassignment/takeover.
4. **Deny anonymous, wrong UID, replayed, expired, tampered** — signed single-use HMAC claim: tampered signature (constant-time compare) → DENY, expired → DENY, room mismatch → DENY, replayed nonce (atomic single-use consume) → DENY.
5. **No owner takeover:** second bind on an owned room → `already_bound`, owner unchanged.
6. **Security audit event without PIN/token/secret:** `ownerBindAudit` push = `{event, roomCode, uid, claimId, at}`; `claimId` = one-way SHA-256 hash of the nonce; the token/secret/PIN/nonce are never stored.
7. **Deterministic RTDB writer:** `createRtdbSaleWriter` → `writeFn(saleSnapshot, opId)` writes `rooms/$room/salesRecords/$opId` (key = opId). Commit → client timeout → replay with same opId = **exactly one sale**.
8. **Pending-queue read/cleanup failure surfaced as recovery-required** (R1 `pendingHealth()` / `flushPendingSales` `recoveryRequired`).
9. **Collision-resistant opId** — R1 default `genOpId` now uses `crypto.randomUUID()`.
10. **Owner verifier for R1** — `createOwnerVerifier(db, room)` resolves `roomOwners/$room === uid` live (feeds R1 `verifyOwnerBinding`, never cached indefinitely).

## Test results (HQ sandbox, emulator + synthetic)
- **R2 (LOCAL) suite: 20/20 PASS, exit 0** (`p0_r2_results.txt`) — anon/unauth DENY · valid bind + audit (no secrets) · tampered/expired/room-mismatch/replay DENY · already_bound + owner-unchanged (no takeover) · verifier true/false · **deterministic writer commit-then-timeout → replay same opId → exactly one** · restart+replay → one · **end-to-end** bound-owner → R1 `guardedSaleWrite` → exactly one sale.
- **R1 Auth suite: 24/24 PASS** (updated module: crypto.randomUUID opId + recovery-required surfacing).
- **P0 Rules: 213/213** · **M2: 209/209** · **M0/M1: 95/95** — frozen `.14 d806e672…` / `.13 523df939…` unchanged, rules unchanged.
- **negative_tests: 7 fired / 0 missed** — run on June's machine at commit time.

## §9.3 preflight
See `p0_93_billing_preflight.md`: current plans + billing isolation, Node 20 / `asia-southeast1`, cost/quotas/maxInstances(3–5)/rollback, **budget alerts are NOT hard caps**, **Blaze NOT activated**.

## Files (committed under `security/p0/backend/`)
`p0_r2_owner_binding.js` · `p0_r2_tests.js` · `p0_r2_results.txt` · `p0_93_billing_preflight.md` · this doc · `p0_r2_SHA256_manifest.txt`. Updated `security/p0/auth/stallmate_auth.js` (crypto.randomUUID + pendingHealth/recoveryRequired).

**Return:** SECURITY P0 R2 LOCAL + §9.3 PREFLIGHT — READY_FOR_ROOM00

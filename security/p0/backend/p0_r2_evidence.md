# SECURITY P0 R2 (LOCAL) + §9.3 PREFLIGHT — EVIDENCE (HOLD-1 CORRECTED)

**Authorization:** Room 00 — R2 LOCAL implementation + §9.3 PREFLIGHT. STILL PROHIBITED: Blaze activation · Firebase deploy · production mutation · live owner binding · merge main · M3.
**Date:** 4 Sep 2026. **Emulators + synthetic only. Frozen app (.14) and all rules unchanged.**

## HOLD-1 corrections (3 blockers + hardening)
- **B1 — claim bound to intendedUid:** the signed claim body now includes `intendedUid`; `bindOwner` denies unless `claim.intendedUid === context.auth.uid` (`claim_uid_mismatch`). A valid claim redeemed by a *different* permanent user is DENIED and no binding is created. Proven: valid+intended ALLOW · same claim + different UID DENY · owner unchanged.
- **B2 — writer is create-only + immutable-idempotent:** `createRtdbSaleWriter` uses an RTDB **transaction** — create when absent, idempotent success when the existing payload is canonical-equal, and **`OPID_CONFLICT` (never overwrite)** when a different payload targets an existing opId. Proven: commit→client-timeout→**identical replay = exactly one, unchanged**; same opId + changed amount ⇒ **OPID_CONFLICT, original financial record unchanged**.
- **B3 — cleanup failure surfaces recovery-required:** `_removePending` now returns success/failure; after remote durable ack but local cleanup read/write failure, `guardedSaleWrite` returns `{ok:false, remoteCommitted:true, recoveryRequired:true, opId}` (no false success). `flushPendingSales` surfaces `recoveryRequired` and does not report the item cleared. Proven: storage read-failure-after-ack and write-failure-after-ack both ⇒ recovery-required; flush cleanup failure ⇒ recoveryRequired, flushed=0.
- **Hardening:** strict RTDB key validation (`isValidKey`) for roomCode/nonce/opId (rejects empty/oversized/`. $ # [ ] /`/control chars); reject malformed and multi-dot tokens (exactly 2 parts). maxInstances remains the immediate cost guard; **no automatic billing kill-switch introduced this round** (budget alerts are notifications only — see §9.3).

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
- **R2 (LOCAL) suite: 30/30 PASS, exit 0** (`p0_r2_results.txt`) — incl. all B1/B2/B3 + hardening cases above, plus audit-no-secrets, tamper/expired/room-mismatch/replay DENY, already_bound + owner-unchanged, verifier, and end-to-end bound-owner → `guardedSaleWrite` → exactly one sale.
- **R1 Auth suite: 24/24 PASS** (updated module: crypto.randomUUID opId + recovery-required surfacing).
- **P0 Rules: 213/213** · **M2: 209/209** · **M0/M1: 95/95** — frozen `.14 d806e672…` / `.13 523df939…` unchanged, rules unchanged.
- **negative_tests: 7 fired / 0 missed** — run on June's machine at commit time.

## §9.3 preflight
See `p0_93_billing_preflight.md`: current plans + billing isolation, Node 20 / `asia-southeast1`, cost/quotas/maxInstances(3–5)/rollback, **budget alerts are NOT hard caps**, **Blaze NOT activated**.

## Files (committed under `security/p0/backend/`)
`p0_r2_owner_binding.js` · `p0_r2_tests.js` · `p0_r2_results.txt` · `p0_93_billing_preflight.md` · this doc · `p0_r2_SHA256_manifest.txt`. Updated `security/p0/auth/stallmate_auth.js` (crypto.randomUUID + pendingHealth/recoveryRequired).

**Return:** SECURITY P0 R2 LOCAL HOLD-1 CORRECTED — READY_FOR_ROOM00

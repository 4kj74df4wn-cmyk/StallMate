# SECURITY P0 R3 — RULES INTEGRATION (LOCAL/EMULATOR ONLY) — EVIDENCE

**Authorization:** Room 00 — R3 RULES INTEGRATION, local/emulator only. NO Blaze · NO staging/production deploy · NO live binding · NO merge main · NO M3.
**Date:** 4 Sep 2026. **Emulator + synthetic only. Frozen app (.14) and all rules unchanged.**

## What R3 proves
Integrates the R1 client-auth + R2 owner-binding with the **tightened Rules B**, with the rules **actually enforced** by the RTDB emulator via `@firebase/rules-unit-testing` **client contexts** (NOT the Admin SDK, which bypasses rules). Owner authority is resolved by reading `roomOwners/$roomCode` under the rules; the deterministic writer runs as a **client transaction** subject to the rules.

## Results — `p0_r3_rules_integration_tests.js` → **R3 SUITE: 20/20 PASS, exit 0** (`p0_r3_results.txt`)
Legitimate owner operations (bound owner, Rules B enforced):
- create MODERN sale ALLOW · create LEGACY sale ALLOW · update session ALLOW · read own `roomOwners` ALLOW
Denials (rules-enforced):
- anonymous create sale DENY · authed **unbound** user create DENY · **wrong-owner** (OTHER→BBMANN) DENY
- owner hard-delete sale DENY · owner whole-room delete DENY · owner null a money field DENY
- owner cannot rewrite `roomOwners` (takeover) DENY · stranger cannot claim `roomOwners` (takeover) DENY · stranger cannot read others' `roomOwners` DENY
Financial idempotency / conflict UNDER rules (client transaction):
- identical replay ⇒ **exactly one** (opDet1) · same opId + changed amount ⇒ **OPID_CONFLICT** · original financial record **unchanged**
Integrated pending recovery:
- bound owner authorized (verifier reads `roomOwners` under rules) · guarded owner sale write ok · sale persisted at deterministic opId key · **unauthenticated** guarded write blocked+queued (rules also deny)

## Consolidated regression (HQ sandbox, emulator + synthetic)
- **R3: 20/20** · **R2: 30/30** · **R1: 24/24** · **P0 Rules: 213/213** · **M2: 209/209** · **M0/M1: 95/95**
- Frozen baselines unchanged: `.14 d806e672…` · `.13 523df939…` · rules files unchanged · negative_tests 7/0 (June's machine at commit).

## Files (committed under `security/p0/backend/`)
`p0_r3_rules_integration_tests.js` · `p0_r3_results.txt` · this doc · `p0_r3_SHA256_manifest.txt`. (Reuses `../auth/stallmate_auth.js`, `p0_r2_owner_binding.js`, `p0_rulesB_secure_fallback.rules.json`.)

**Return:** SECURITY P0 R3 RULES INTEGRATION — READY_FOR_ROOM00

# P0 Phase 2A — Emulator Test Matrix (STAGING / EMULATOR ONLY)

> **Superseded by the executable suite:** this file is the human-readable spec. The authoritative, RUN evidence is `p0_emulator_tests.js` → `p0_emulator_results.txt` (**183/183 PASS, exit 0**, HOLD-4), which additionally covers financial field-integrity (`.validate`) cases: delete a nested money field, replace a sale with an incomplete object, null a required field, delete nested session/checkin fields, delete branch trial/menu, delete staff protected field, and multi-location updates with a nested null — all DENY; plus modern+legacy sale create/edit — ALLOW.


**Runs against:** Firebase Local Emulator Suite (RTDB + Auth) on staging config. **NO live project. NO real production data — synthetic fixtures or sanitized copy only.** Executes Rules A, Rules B, and forward-fix rules; every case asserts an expected ALLOW/DENY.

**Fixtures (synthetic):** `roomOwners/BBMANN = OWNER_UID`; a bound owner session `OWNER_UID`; a member/staff session `STAFF_UID`; an admin/backend context; an attacker session `ATTACKER_UID` (arbitrary or anonymous) who *knows the room code BBMANN*; a seeded `licenses/CODE1 {redeemed:false}` and `licenses/CODE2 {redeemed:true, boundTo:OWNER_UID}`.

## Role × path assertions

| # | Role / session | Operation | Path | Rules A | Rules B | Fwd-fix |
|---|---|---|---|---|---|---|
| 1 | anonymous (auth==null) | read | `rooms/BBMANN/salesRecords` | DENY | DENY | DENY |
| 2 | anonymous | write (create) | `rooms/BBMANN/salesRecords/x` | DENY | DENY | DENY |
| 3 | anonymous | delete (newData=null) | `rooms/BBMANN/salesRecords/x` | DENY | DENY | DENY |
| 4 | anonymous | delete whole room | `rooms/BBMANN` | DENY | DENY | DENY |
| 5 | attacker (knows BBMANN, arb uid) | read | `rooms/BBMANN/**` | DENY | DENY | DENY |
| 6 | attacker | write | `rooms/BBMANN/salesRecords/x` | DENY | DENY | DENY |
| 7 | attacker | delete record | `rooms/BBMANN/salesRecords/x` | DENY | DENY | DENY |
| 8 | attacker | delete whole room | `rooms/BBMANN` | **DENY** | **DENY** | **DENY** |
| 9 | attacker | direct write redeem | `licenses/CODE1` | DENY | DENY | DENY |
| 10 | attacker | enumerate | `licenses` (parent read) | DENY | DENY | DENY |
| 11 | attacker | write | `shopProfiles/OWNER_UID` | DENY | DENY | DENY |
| 12 | attacker | write config | `config/teamPricingEra` | DENY | DENY | DENY |
| 13 | **owner** (bound) | read | `rooms/BBMANN/**` | ALLOW | ALLOW | ALLOW |
| 14 | owner | create sale | `rooms/BBMANN/salesRecords/x` | ALLOW | ALLOW | DENY* |
| 15 | owner | update sale | `rooms/BBMANN/salesRecords/x` | ALLOW | ALLOW | DENY* |
| 16 | owner | **hard-delete sale** | `rooms/BBMANN/salesRecords/x` | **DENY** | **DENY** | **DENY** |
| 17 | owner | append void ledger | `rooms/BBMANN/deletedSales/x` | ALLOW | ALLOW | DENY* |
| 18 | owner | mutate existing void ledger entry | `rooms/BBMANN/deletedSales/x` | DENY | DENY | DENY |
| 19 | owner | delete whole room | `rooms/BBMANN` | DENY | DENY | DENY |
| 20 | owner | write own trial | `rooms/BBMANN/trial` | ALLOW | ALLOW | DENY* |
| 21 | owner | delete branch | `rooms/BBMANN/branches/b1` | ALLOW | DENY | DENY |
| 22 | owner | read/redeem own license | `licenses/CODE2` (read) | ALLOW | ALLOW | ALLOW |
| 23 | owner | direct client write license | `licenses/CODE2` | DENY | DENY | DENY |
| 24 | owner-of-A | access other business | `rooms/OTHER/**` | DENY | DENY | DENY |
| 25 | member/staff (TEAM frozen) | any sensitive write | `rooms/BBMANN/**` | DENY | DENY | DENY |
| 26 | admin/backend (Admin SDK) | write binding | `roomOwners/BBMANN` | ALLOW(SDK) | ALLOW(SDK) | ALLOW(SDK) |
| 27 | admin/backend | redeem license (txn) | `licenses/CODE1` | ALLOW(SDK) | ALLOW(SDK) | ALLOW(SDK) |

\* Forward-fix is deny-all-writes containment: owner keeps **read** so the shop is not blind, but all writes are frozen while Rules A is repaired. This is intended and asserted (rows 14,15,17,20).
Admin SDK (row 26–27) bypasses rules by design; asserted separately in the Functions unit tests, not as a client-rule outcome.

## Delete-bypass focus (Room 00 item 7)
Rows 3, 8, 16, 19 explicitly prove the historic weakness is closed: `.validate` is skipped on delete, so deletion is denied by `.write` predicates using `newData.exists()` at each child path — **not** by a broad grant at `rooms/$roomCode` (which cannot revoke child deletes because parent grants cascade). Whole-room delete (rows 4, 8, 19) is denied because `rooms/$roomCode` has **no** `.write` grant at all in every rule set.

## Positive-flow regression (owner not locked out)
Rows 13–15, 17, 20, 22 confirm the live SOLO owner keeps working under Rules A/B. Owner recovery re-link flow: after re-auth as the permanent owner, rows 13–15 must ALLOW again on the new device session.

## Expected result
Every row's actual emulator outcome must equal the table. Any deviation blocks R3. Output (per-row actual ALLOW/DENY, per rule set) is saved to `02_TEST_EVIDENCE` as the attacker/positive test evidence before any production gate.

**No live Firebase change. No real-data test. Emulator/staging only.**

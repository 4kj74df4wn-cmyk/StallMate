# SECURITY P0 PHASE 2A FOUNDATION — HOLD-5 CORRECTED — READY_FOR_ROOM00

**By:** Claude DEV HQ · **Date:** 3 Sep 2026
**Authorization:** Room 00 — SECURITY P0 PHASE 2A AUTHORIZED (branch/staging only); this revision closes HOLD-5 on top of HOLD-4/HOLD-3. **Foundation has NOT passed the gate** — it remains under Room 00 review.
**§9 status:** NOT executed — per Room 00 ("June §9 remains paused"). No staging/billing/backup/credentials work performed. §9 remains a documented plan only.

## HOLD-5 correction — trialRegistry ownership takeover — closed
Room 00 HOLD-5 finding: the trial write predicate checked only `newData.child('boundUid').val() === auth.uid`, so any authenticated user could overwrite an existing `trialRegistry/$deviceId` and set `boundUid` to their own UID (ownership takeover). Fixed in **Rules A and Rules B**:
```
auth != null && newData.exists() && newData.child('boundUid').val() === auth.uid
&& ( !data.exists() || data.child('boundUid').val() === auth.uid )
```
This allows CREATE only when unclaimed and bound to self, allows UPDATE only by the current owner of the record, forbids `boundUid` reassignment, and denies whole-record delete and nested `boundUid` delete (`newData.exists()` + predicate). Proven by new executable cases (all in `p0_emulator_results.txt`):
- owner updates own trial record = ALLOW; attacker overwrites owner device + changes boundUid = DENY; attacker modifies owner device preserving owner boundUid = DENY; owner changes boundUid to another UID = DENY; authenticated user creates new unclaimed device bound to self = ALLOW; anonymous create/update/delete = DENY; whole-record delete = DENY; nested boundUid delete = DENY.
- Full suite re-run: **213/213 PASS (71×3), exit 0**; SHA-256 manifest regenerated.



## HOLD-4 corrections (C1–C5) — closed
Room 00 HOLD-4 finding: record-level `.write` with only `newData.exists()` still cascades to descendants, so an owner could delete a nested financial field (e.g. `salesRecords/$id/cashSatang`) or replace a sale with an incomplete object while the record still "exists" — destructive corruption counted as ALLOW. Fixed:
- **C1 — schema-aware `.validate` at sale/session/checkin record boundaries.** Added `.validate` requiring the record to keep its total (`total` or `totalSatang`) AND a **no-field-drop** invariant: any money/audit field that existed must survive (`!data.hasChild(f) || newData.hasChild(f)`). Ancestor `.validate` **does** fire on child-delete (empirically confirmed on the emulator), so deleting `cashSatang`, nulling `total`, or replacing with an incomplete object now DENY. Accepts both **modern (satang)** and **legacy (float)** shapes — legacy fields never present are unconstrained, so valid legacy records are NOT rejected.
- **C2 — branches & staff nested protection.** Added `.validate` no-drop for protected children (branch: `meta/menu/trial/markets/sellers`; staff: `active/secondaryPasswordHash/name/id`), so deleting `branches/$id/trial`, `branches/$id/menu`, or a staff protected field DENY, while replace/update and soft-deactivate (value change) ALLOW. `config` child delete already denied via leaf `newData.exists()`.
- **C3 — executable tests extended** with every Room 00 destructive case: delete `salesRecords/$id/cashSatang`, replace sale with incomplete object, set required money field null, delete nested session field, delete nested checkin field, delete `branches/$id/trial`, delete `branches/$id/menu`, delete staff protected field, and multi-location updates containing a nested null. All DENY. Fixtures are **re-seeded fresh before each case**.
- **C4 — positive tests for legitimate ops** (modern + legacy): create modern sale, create legacy float-only sale, edit modern keeping all fields, edit legacy keeping fields, single-leaf value update, append deletedSales, update session, write checkin, update branch menu, soft-deactivate staff/branch. All ALLOW under Rules A (B allows the sell-critical subset; F denies all writes). No valid legacy record is rejected.
- **C5 — outputs + manifest regenerated** after the corrected runner passed A/B/forward-fix: **183/183 PASS (61×3), exit 0** (`p0_emulator_results.txt`), new SHA-256 manifest.



## HOLD-3 corrections (C1–C5) — closed
- **C1 (Rules B ancestor-write delete bypass):** removed all generic `$child`/`$grandchild` write grants. Rules B now enumerates specific paths with delete predicates at the exact record boundary (`salesRecords/$saleId`, etc.). Proven: owner hard-delete sale = DENY, delete branch/staff/session/checkin/config-child = DENY, whole-room delete = DENY (emulator, Rules B).
- **C2 (matrix was spec, not test):** added a **real executable emulator suite** (`p0_emulator_tests.js`) run on the actual Firebase RTDB emulator (`firebase-database-emulator-v4.11.2.jar`, Java 11) via `@firebase/rules-unit-testing` 5.0.2 + `firebase` 10.14.1, with synthetic fixtures, per-role assertions, separate results for Rules A / B / forward-fix, and **non-zero process exit on any mismatch**. Result: **141/141 PASS (47×3), exit 0** — output in `p0_emulator_results.txt` (+ `_raw`). Includes all Room 00-required negative cases: delete salesRecords/$saleId, sessions, nested checkin, config child, staff, branch, unknown room child, multi-location update with one forbidden path, whole-room update/delete.
- **C3 (trialRegistry cross-device read):** Rules A/B/forward-fix now require `auth!=null && data.child('boundUid').val()===auth.uid` to read `trialRegistry/$deviceId`. Proven: owner-own-device read ALLOW, other-authenticated-device read DENY.
- **C4 (write-path inventory):** complete source-derived inventory in `p0_path_inventory.md` from `.14` + `owner_daily.html` + `stallmate_admin.html`, every op mapped to a Rules A/B predicate, unknown room children default DENY, and a flagged list of current hard-delete flows that must become soft-delete in R1.
- **C5 (claims match artifact state):** corrected below. Executable runner + real output now exist. **Auth/bootstrap/Cloud Functions are SPEC only — no such code is written yet** (that is R1/R2 implementation, not Phase 2A). §9 evidence is intentionally blank (not executed).

## Honest artifact state (C5)
- **Present & verified now:** Rules A/B/forward-fix (JSON) · executable emulator runner + fixtures · real emulator output 141/141 · path inventory · SHA-256 manifest · frozen-file proof · regression 209/209 + 95/95.
- **Spec only (NOT yet code):** permanent-owner auth client, secure-bootstrap Cloud Function, licensing Function, owner-recovery, readiness-telemetry client. These are designed in §3/§5/§6 but **not implemented** — they belong to R1–R4 and each needs its own Room 00 gate.
- **Not done (by authorization):** branch creation, staging project, billing, production backup, any live change (§9).

---

**By:** Claude DEV HQ · **Date:** 3 Sep 2026
**Authorization:** Room 00 — SECURITY P0 PHASE 2A AUTHORIZED (branch/staging only)
**Authoritative design:** `02_TEST_EVIDENCE/StallMate_SECURITY_P0_Phase1_HOLD2_CORRECTED.md` (HOLD-1 superseded, not for implementation)
**Constraints honored:** NO production client deploy · NO live Firebase Auth/rules/function change · NO live owner binding · NO production data migration · NO BBMANN rotation · NO merge to main · NO M3 · NO destructive real-data testing. Each R1–R6 needs a separate Room 00 gate before any production step.

---

## 0. Execution split (important — same as the Git cutover)
HQ (Cowork) **cannot** push git, create a Firebase project, enable billing, or export production data (no credentials/console access). This package therefore separates:
- **(A) HQ-produced now** — all branch/staging *design + code + rules + test specs + regression + frozen proof* (this document + the artifact files listed in §1).
- **(B) June-executed** on her machine/accounts (Claude Code + Firebase console) — the items that need credentials/real data; commands + fill-in fields provided in §9. Their evidence is completed by June and appended before the package is final for Room 00.

This is not a gap in the work; it is the only correct division given HQ holds no credentials. Nothing in (B) is a production change — branch creation, a *separate* staging project, and an owner-authorized backup are all non-production.

## 1. Evidence completeness map (Room 00 required list)
| Room 00 required evidence | Status | Where |
|---|---|---|
| corrected Rules B (C1) | ✅ HQ | `p0_rulesB_secure_fallback.rules.json` |
| corrected trialRegistry rules (C3) | ✅ HQ | Rules A/B/forward-fix |
| complete source-derived path inventory (C4) | ✅ HQ | `p0_path_inventory.md` |
| executable emulator tests (C2) | ✅ HQ | `p0_emulator_tests.js` |
| synthetic fixtures | ✅ HQ | seeded in `p0_emulator_tests.js` |
| actual local emulator output | ✅ HQ (213/213, exit 0) | `p0_emulator_results.txt` (+`_raw`) |
| financial field-integrity (`.validate`) proof | ✅ HQ (HOLD-4) | Rules A/B `.validate`; results incl. delete-field / incomplete-replace = DENY |
| trialRegistry no-takeover proof | ✅ HQ (HOLD-5) | Rules A/B trial write predicate; attacker takeover = DENY |
| SHA-256 manifest of all artifacts | ✅ HQ | `p0_SHA256_manifest.txt` |
| Rules A / forward-fix rules | ✅ HQ | 2 JSON files |
| Auth/bootstrap/recovery **specification** (code = R1/R2, not yet) | ✅ spec / ⏳ code | §3 |
| proof index.html/main/.13/M2 baseline unchanged | ✅ HQ | §2 |
| M2 209/209 + M0/M1 95/95 regression | ✅ HQ (run today) | §2 |
| exact proposed production rollout steps (do not execute) | ✅ HQ | §7 |
| branch + commit SHA / clean git status | ⏸ deferred (Room 00 HOLD-3) | §9.1 (not executed) |
| staging project identity + isolation | ⏸ deferred | §9.2 (not executed) |
| billing/preflight (Blaze approval) | ⏸ deferred | §9.3 (not executed) |
| encrypted backup + restore/reconciliation | ⏸ deferred | §9.4 (not executed) |

**Artifact files in `02_TEST_EVIDENCE/` (see `p0_SHA256_manifest.txt`):** `p0_rulesA_secure_transitional.rules.json` · `p0_rulesB_secure_fallback.rules.json` · `p0_rules_forwardfix_denyallwrites.rules.json` · `p0_emulator_tests.js` · `p0_emulator_results.txt` · `p0_emulator_results_raw.txt` · `p0_path_inventory.md` · `p0_emulator_test_matrix.md` · `p0_SHA256_manifest.txt` · this document.

**§9 (June-executed) is DEFERRED** per Room 00 HOLD-3 — no staging, billing, or real-data backup work until these HQ artifacts pass static review. §9 below is retained as a plan only; it has NOT been run.

## 2. Frozen-file proof + regression (HQ-run, 3 Sep 2026)
Computed on the real Drive-synced files (Protocol v1 §5), node v22:
- `stallmate_v7.9.8.13.html` (live pilot baseline) SHA-256 = `523df939fae65166c30fce6394f12a7b780927cdcee4a3e02836a3388a9cb58e` — **unchanged** ✅
- `stallmate_v7.9.8.14.html` (M2 baseline) SHA-256 = `d806e672b4409bbefb4f0b57980580720e291f69c268c8b74d08834a7f227a11` — **unchanged** ✅
- Regression on `.14`: **M2 209/209 PASS · M0+M1 95/95 PASS** (harnesses `StallMate_BuildA_M2_SplitSatangEdit_Harness.js`, `StallMate_BuildA_M0_SafetyTest_Harness.js`).
- `origin/main` = `83b2ca7…` and repo `index.html` = `.13` `523df939…` are **not touched** by Phase 2A (2A lives on a new branch off `migration/git-system-of-record` `e0a7ad35…`; no merge to main). M2 baseline tag `m2-baseline` = `5b6a42f3…` unchanged. **To be confirmed by June when §9.1 runs (branch not yet created — §9.1 authorized but not executed).**

Phase 2A adds NO code to the frozen POS logic; the client auth changes (§3) are spec-only and will land on the branch in R1 (not Phase 2A); §9.1 will re-run the same harnesses on the branch working file and is expected to reproduce 209/209 + 95/95 (not yet executed).

## 3. Auth / bootstrap / recovery specification (branch + staging design)

### 3.1 Permanent owner authentication + device-link rule (Room 00 item 6 — exact)
- Ownership is a **permanent Firebase Auth credential** (email or phone/OAuth). Authorization **always** uses the resulting **permanent owner `auth.uid`**.
- **First device / account creation:** the app may `linkWithCredential` to upgrade the current anonymous session to a **new permanent credential** *only* when that action is **creating the owner account** (first-time owner sign-up). The linked uid becomes the permanent owner uid.
- **Additional devices:** must **sign in to the existing permanent owner account** (email/phone/OAuth sign-in). They do **not** link a fresh anonymous account to the owner credential.
- **Never** attempt to link multiple anonymous accounts to the same credential (Firebase rejects it and it is not an ownership mechanism).
- Result: every authorized device presents the **same** permanent owner uid. Device/anonymous uids are telemetry only (readiness gate §HOLD2-E, monitoring §HOLD2-I) and never appear in a grant predicate.

### 3.2 Secure owner bootstrap (no trust in code/PIN/device)
- Initial `roomOwners/BBMANN = OWNER_UID` is written **only** by a Cloud Function (Admin SDK), triggered by June's **independently verified** account, via **admin-controlled manual assignment** OR a **signed single-use claim token** (short-TTL, one-time, issued out-of-band, server-verified).
- The function writes the binding **exactly once** and refuses if already bound (no silent rebind). It trusts **no** room code, staff PIN, PIN hash, device ID, or public-source secret.
- Client rules give `roomOwners` **no** write (see Rules A) — binding cannot originate on the client.

### 3.3 Owner recovery (branch/staging design)
- **Browser reset / new browser:** sign in again with the permanent account → authority restored (data lives under `rooms/BBMANN` bound to the uid, not the browser).
- **Lost phone / replacement device:** sign in on the new device with the permanent account (Firebase Auth email/phone recovery) → authority restored; old device tokens revocable.
- **Last-resort (permanent account lost):** admin Cloud Function re-points `roomOwners/BBMANN` to a re-verified account — audited, manual, never automatic, requires independent verification.
- Recovery **never** re-derives ownership from room code/PIN/device.

## 4. Rules A / Rules B / forward-fix (Room 00 item 7 compliant)
Full JSON in the three `p0_rules*.json` files; all three parse-validated. Design guarantees:
- **No broad `.write` at `rooms/$roomCode`** in any set. WRITE is granted only at specific child paths; READ may be at room level for the bound owner (read-cascade is intended, write-cascade is the danger).
- **Delete denial via `.write` + `newData.exists()`** at each child path where deletion must be blocked (`.validate` is skipped on delete, so it cannot be relied on). `salesRecords` hard-delete = DENY; `deletedSales` = append-only (create-only); whole-room delete = DENY (no room-level write).
- **licenses:** no parent read (no enumeration), no client write anywhere; redeem only via Cloud Function; a caller may read only a code bound to them.
- **config / affiliateConfig / pilotOverrides:** backend/admin-only write (not merely `auth!=null`).
- **Rules A** = intended secure transitional state. **Rules B** = conservative still-secure retreat (no deletes anywhere, owner create/update only). **Forward-fix** = deny-all-writes containment (owner keeps read so the shop is not blind) — used only if both A and B fail; it is **secure** and is **not** the insecure `1339b716` break-glass.
- Emulator proof of all of the above: `p0_emulator_test_matrix.md` (27 assertions × 3 rule sets, incl. the four delete-bypass rows 3/8/16/19).

## 5. Monitoring definitions (from HOLD-2 §I, carried into 2A)
Sources: Firebase Auth logs, RTDB permission-denied metrics (Cloud Monitoring), client sync/sale-write telemetry (non-PII node). Baseline captured over the 7-day pre-R3 window. Thresholds: **sales write/read failure = halt on first occurrence** (P0, no tolerance); sync stop > 15 min market-hours = halt; owner-op permission-denied sustained (> 0 after one re-auth) = halt; auth-failure > 5% over rolling 15 min or ≥ 3 consecutive owner sign-in failures = halt. Alerts → June. **Auto-halt at rollout-step level only** (freeze progression; do not auto-mutate live rules). Rollback vs forward-fix per HOLD-2 §I.5.

## 6. Backup / restore procedure (spec; execution = June §9.4)
1. **Owner-authorized production export** (June): `firebase database:get / --project stallmate-9caac -o backup_YYYYMMDD.json` (or Console → RTDB → Export JSON). HQ never sees credentials or data.
2. **Encrypt + access-restrict** the export at rest; **never** store unencrypted on shared Drive. Record **export SHA-256 + timestamp** in a manifest that lists sizes/paths/counts **without exposing record contents**.
3. **Tested restore into staging/emulator ONLY** — never write back to production. HQ supplies the reconciliation method: compare **record counts** (rooms, salesRecords, per subtree), **financial totals** (Σ sale totals per period), and **content hashes** of copied subtrees (source vs restored). All three must match.
4. Restore-to-live is documented but used only on a rollback trigger — not part of 2A.

## 7. Proposed PRODUCTION rollout steps (DO NOT EXECUTE — each needs its own Room 00 gate)
Independently reversible releases (HOLD-2 §J), staging-proven before any live step:
- **R1** ship auth-capable backward-compatible client (anon session + permanent owner sign-in). No rule change. Revert = prior client.
- **R2** deploy owner-binding Cloud Function; bind `roomOwners/BBMANN` for June. Rules not yet dependent. Revert = remove binding.
- **R3** deploy Rules A (Rules B + forward-fix staged ready) — **only after the §E readiness gate returns PASS**. Revert target = Rules B (never `1339b716`). After R3 stable, capture `rules_lastknownsecure_<ts>.json` + SHA.
- **R4** move licensing to Cloud Function; `licenses` rules backend-only. Rollback fail-closed (keeps client writes denied; can pause redemption; never restores client redeem; never mutates redeemed licenses).
- **R5** copy `rooms/BBMANN`→`businesses/$bizId`, reconcile (counts/totals/hashes), cut client over; source retained. Revert = point client back to `rooms/*`.
- **R6** rotate/retire BBMANN — only after R5 verified + emulator attacker-test (known BBMANN) = DENY. Revert = keep code active.
- App Check added defense-in-depth after R3–R4.
Preconditions before ANY R: backup+restore rehearsal ✅, dedicated staging ✅, permanent owner auth ✅, secure binding ✅, readiness gate PASS ✅, billing confirmed (Blaze for Functions) with June approval.

## 8. Scope guards re-affirmed
- TEAM join/approval/role-management remain **frozen** (D5). No `members/$uid` model is shipped in Phase 2A; the emulator "member/staff" row is a negative assertion only.
- `businesses/*` target schema (§M) is a later release (R5), not built into 2A rules beyond design intent.
- No live Firebase change, no real-data destructive test, no M3.

## 9. June-executed steps (commands + fill-in fields)

### 9.1 Create Phase 2A branch (Claude Code, on June's machine)
```bash
cd StallMate
git fetch origin
git rev-parse origin/main                 # expect 83b2ca7… (must be unchanged)
git rev-parse migration/git-system-of-record   # expect e0a7ad35…
git checkout -b security/p0-containment migration/git-system-of-record
git rev-parse HEAD                         # record branch HEAD
# (auth client changes will be committed here in later R1 work — 2A foundation only creates the branch)
./verify.sh stallmate_v7.9.8.14.html      # expect VERIFY OK, 209/209 + 95/95
bash tests/negative_tests.sh              # expect 7 fired / 0 missed
git status                                 # expect clean (or only intended 2A files)
git push origin security/p0-containment
git rev-parse origin/security/p0-containment
git rev-parse origin/main                  # expect STILL 83b2ca7… (main untouched)
```
Fill back: branch HEAD `______` · remote branch SHA `______` · git status clean `______` · verify `VERIFY OK / 209/209 / 95/95` `______` · negative `7 fired / 0 missed` `______` · origin/main still `83b2ca7…` `______`.

### 9.2 Dedicated staging project + isolation proof (Firebase console)
- Create a **separate** Firebase project (e.g. `stallmate-staging`) — distinct project id from live `stallmate-9caac`.
- Isolation proof: staging `databaseURL` ≠ live; screenshot/text of both project ids; confirm emulator points at staging config, never `stallmate-9caac`.
- Load the three `p0_rules*.json` into the emulator and run `p0_emulator_test_matrix.md`; export the actual per-row ALLOW/DENY outputs into `02_TEST_EVIDENCE`.
Fill back: staging project id `______` · staging databaseURL `______` · isolation confirmed `______` · emulator matrix result (A/B/fwd-fix all rows match) `______`.

### 9.3 Billing / preflight — **APPROVAL GATE**
- Cloud Functions require the **Blaze (pay-as-you-go)** plan. Emulator + rules testing do **not** need Blaze. So Blaze is needed only when Functions deploy (R2/R4), not for 2A emulator work.
- **Room 00 + HQ constraint:** enabling Blaze (which can incur charges) requires **June's explicit approval before enabling**. HQ will not and cannot enable billing.
- Preflight to record (no charge to check): confirm billing account available, intended function region `asia-southeast1` (match RTDB), a rough cost estimate, and that Anonymous + email/phone(OAuth) Auth providers are enabled.
Fill back: Blaze needed at R2/R4 only `______` · June approval to enable Blaze (Y/N + date) `______` · region `asia-southeast1` `______` · auth providers enabled `______`.

### 9.4 Owner-authorized backup + tested restore (no production write-back)
```bash
# owner creds only; HQ never sees these
firebase database:get / --project stallmate-9caac -o backup_YYYYMMDD.json
sha256sum backup_YYYYMMDD.json            # record in manifest (no data contents in manifest)
# encrypt at rest (e.g. gpg/age); store OFF the shared Drive
# restore into STAGING/EMULATOR ONLY, then reconcile counts/totals/hashes vs source
```
Fill back: export SHA-256 `______` · timestamp `______` · encrypted+off-Drive `______` · restore-into-staging done `______` · reconciliation (counts/totals/hashes match) `______`. **No write-back to production.**

---
**RETURN:** SECURITY P0 PHASE2A FOUNDATION — READY_FOR_ROOM00 (HQ portion complete; §9 items to be completed by June before the package is final).
**NOT DONE (by design/authorization):** production client deploy · live Firebase Auth/rules/function change · live owner binding · production data migration · BBMANN rotation · merge to main · M3 · destructive real-data testing.

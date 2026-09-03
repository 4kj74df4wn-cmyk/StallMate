# SECURITY P0 PHASE 1 — CONTAINMENT DESIGN — HOLD-2 CORRECTED — READY_FOR_ROOM00

**By:** Claude DEV HQ · **Date:** 3 Sep 2026 · **Severity:** CRITICAL / P0 CONFIRMED — DO NOT ACCEPT RISK
**Supersedes:** `StallMate_SECURITY_P0_Phase1_HOLD1_CORRECTED.md`
**Scope of this revision:** ONLY the 6 gaps in Room 00 HOLD-2. Approved sections (D1–D5, current-schema-first, no-TrackB-dropin, bootstrap-trusts-nothing, mandatory staging, copy+reconcile, backup+restore rehearsal, break-glass-only, App Check, BBMANN-rotation-last) are unchanged.
**Constraints honored:** NO live Firebase change · NO real-data destructive test · NO Phase 2 implementation · NO M3 · design only. Phase 2 remains HOLD.
**Live rules canonical SHA-256 (Room 00-supplied):** `1339b716d12b1914689ab8fe43e9451b74515a9c3b3030aef7d3947c207eee7e`
**Do NOT drop-in TrackB rules** (assume `businesses/*`; live app uses `rooms/*` → would break live).

---

## HOLD-2 change log (the 6 corrections)
1. **§A rewritten** — device identity ≠ owner identity; permanent owner UID used directly; device ID = telemetry only; multi-device rule; no auto-elevation.
2. **§E rewritten** — readiness gate made measurable (inventory, exact window, cutoff, telemetry fields, certifier, denominator, lost/retired handling).
3. **§H + §J-R3 rewritten** — R3 gets a real secure rollback target (secure A + secure fallback B, both emulator-passed) with deny-all forward-fix; insecure `1339b716` is never "last-known-secure".
4. **§J-R4 rewritten** — license rollback is fail-closed; never restores client-side redeem.
5. **§L clarified** — Phase 2 = SOLO owner session only; all of June's devices sign in as the *same* permanent owner; non-authenticating devices removed before the gate; no TEAM membership created via P0.
6. **§I rewritten** — monitoring/stop-triggers given baseline, thresholds, windows, source, recipient, auto-halt level, rollback-vs-forward-fix split, and sales-failure = halt on first.

---

## Room 00 decisions adopted (D1–D5) — unchanged
- **D1 Auth = HYBRID identity.** Owner = **permanent authenticated identity** (email/phone/OAuth via Firebase Auth). **Anonymous Auth = transitional/device identity only**; an anonymous UID must **never** be the sole permanent owner identity.
- **D2 Transition = current-schema first.** Introduce `roomOwners/$roomCode → ownerUid` on the **existing `rooms/*` schema first**. **Do NOT migrate to `businesses/*` in the same release.**
- **D3 Backend approved in principle** (Cloud Functions) for secure owner/membership binding · license redemption · privileged administration. **Binding must NEVER trust room code, staff PIN, stored PIN hash, device ID, or any public-source secret.** Initial June binding = **independently verified account** + **manual/admin assignment** OR a **signed single-use claim**.
- **D4 Order (locked):** 1) Backup + restore rehearsal → 2) dedicated staging project → 3) permanent June owner auth → 4) secure owner binding → 5) auth-capable backward-compatible client → 6) verify all active devices → 7) tighten current `rooms/*` rules → 8) move licensing to Cloud Function → 9) observe + stabilize → 10) migrate to `businesses/*` (separate release) → 11) rotate + retire BBMANN.
- **D5 Freeze override scope:** P0 overrides the TEAM freeze **only** for Firebase Auth, SOLO owner binding, `roomOwners`, security rules, Cloud Functions, and owner recovery. **TEAM join / approval / role-management remain frozen.**

## Live effective-access assessment (Room 00, canonical rules `1339b716…`) — unchanged
Root `.read=false/.write=false` does NOT cancel deeper grants. Anonymous (auth==null) currently can:
- `rooms/$roomCode/**` — **read + write + DELETE** (salesRecords, deletedSales, sessions, checkins, branches, staff, config, trial); whole-room/per-record deletion; `.validate` skipped on delete (newData==null).
- `trialRegistry/$deviceId` — read + non-null write (delete denied by `newData.exists()`).
- `config` — read; `latestVersion`/`teamPricingEra` write requires only `auth!=null`.
- `licenses` — parent read (enumerable); unredeemed → anonymously `redeemed=true`; no boundTo/field-preservation.
- `pilotOverrides` — any authed r/w; no role. `affiliates`/`referrals` — anon create absent id; authed modify. `affiliateConfig` — authed write. `shopProfiles/$ownerId` — anon write/delete. `dailyLoads` — authed read-all; anon node write.

**Root cause:** no Firebase Auth (room code+PIN ≠ `auth.uid`); deeper `true` overrides false root; `.validate` skipped on delete; client-trusted licensing.

---

## §A. Authentication & authorization model (D1) — CORRECTION 1 (identity mechanics)
The design distinguishes three things that HOLD-1 blurred:

**A.1 Owner identity (authorization).** Ownership is established **only** by a **permanent Firebase Auth account** (email or phone/OAuth). The owner's authenticated session carries that **permanent owner UID directly** — the app authorizes owner operations off `auth.uid === roomOwners/$roomCode`. There is no indirection through any device identifier.

**A.2 Device identity (telemetry only).** A per-device identifier (existing `deviceId`, or the anonymous-auth UID if used) is a **telemetry / observability identifier only**. It is used for the readiness-gate inventory (§E), monitoring (§I), and session bookkeeping. **It is never an authorization identity** and never appears in any rule predicate that grants read/write. A device ID or any device-bound mapping is **never** promoted to owner authority automatically.

**A.3 How a device becomes authorized (no silent elevation).** A device gains owner authority **only** when the person on it signs in to the permanent owner account on that device. Concretely:
- Preferred model (cleanest): **each of June's devices signs in to the same permanent owner account.** All authorized devices therefore present the **same permanent owner UID**. There is no "merge many anonymous UIDs into one owner UID" step — because owner authority is never derived from an anonymous/device UID in the first place.
- If anonymous auth is used at app start (to remove `auth==null`), the anonymous UID stays device-scoped telemetry until the owner signs in; `linkWithCredential` is a convenience to attach the owner credential to that session, **not** a mechanism that turns the old anonymous UID into the owner. Authorization always resolves to the permanent owner UID, never the pre-link anonymous UID.

**A.4 Multi-device rule (explicit).** For any business:
- **Owner devices** = devices signed in to the permanent owner account → carry the owner UID → authorized.
- **Transitional / unauthenticated devices** = any device not yet signed in to the owner account → telemetry only → **no** data authority after rules tighten. They must either sign in as owner or be removed before the §E gate (see §L).
- No device is ever elevated to owner by possessing a room code, PIN, PIN-hash, device ID, or a device→owner mapping. Elevation requires an interactive sign-in to the permanent owner account.

**A.5 Authorization predicate (rules).** Owner ops require `auth.uid === root.child('roomOwners/'+$roomCode).val()`. `auth!=null` alone is never sufficient (fixes config/pilotOverrides/affiliateConfig).

## §B. Secure bootstrap (unchanged from HOLD-1)
- **BBMANN + PIN grant nothing.** Room code and any PIN/PIN-hash are public/guessable and establish no ownership.
- **Initial June owner binding (one-time):** Cloud Function (Admin SDK) triggered by June's **independently verified** Firebase account, using **admin-controlled manual assignment** OR a **signed single-use claim token** (short-TTL, one-time, out-of-band, server-verified). Writes `roomOwners/BBMANN = June's uid` exactly once; refuses if already bound (no silent rebind).
- No bootstrap path trusts room code, staff PIN, PIN hash, device ID, or any public-source secret.

## §C. Owner recovery (unchanged from HOLD-1)
- Recovery re-establishes the **permanent owner identity**, then the new device signs in to it — never re-derives ownership from room code/PIN/device.
- **Browser reset / new browser:** sign in again with permanent account → authority restored (data lives under `rooms/BBMANN` bound to the uid, not the browser).
- **Lost phone / replacement device:** sign in on new device with permanent account (Firebase Auth email/phone recovery) → authority restored; old sessions revocable (token revocation).
- **Last-resort:** admin Cloud Function can re-point `roomOwners/$roomCode` to a re-verified account (audited, manual, never automatic) if the permanent account itself is lost.

## §D. Staging environment (unchanged from HOLD-1) — MANDATORY
- A **dedicated staging Firebase project** (separate project id, e.g. `stallmate-staging`) is **required, not optional**, for all rule/Function/auth iteration; Emulator Suite runs against staging config. Live project is **never** used for testing. Seeded with sanitized export copy or synthetic fixtures. No test ever writes to live.

## §E. Measurable device-readiness gate — CORRECTION 2 (now PASS/FAIL-decidable)
Rules tightening (D4 step 7 / R3) proceeds **only** when this gate returns **PASS** by the fixed criteria below. No prose approximations.

**E.1 Device inventory (the denominator).** June (owner) produces a **named, enumerated list** of the production devices that operate BBMANN — e.g. `{ร้านหมึกเว้ยเฮ้ย-phone, ป-ประทีป-ลำปาง-phone, …}`, each with its `deviceId`. This list is the **authoritative active set**. Certified by: **June as owner** (sign-off recorded in `02_TEST_EVIDENCE`). No device outside this certified list is expected to authenticate; if an unknown device appears in telemetry it is investigated before the gate (possible attacker or forgotten device).

**E.2 Telemetry fields (written by authed clients, read-only for the gate).** Each device writes to a readiness/audit node: `deviceId`, `boundOwnerUid` (the `auth.uid` after owner sign-in), `authProvider`, `appVersion`, `lastSeenAt` (server timestamp). No sales/PII in this node.

**E.3 Observation window (exact).** **7 consecutive calendar days** ending at the gate evaluation instant. (Chosen so a shop that rests one market day still appears; adjustable only by a recorded Room 00/owner decision, not by DEV.)

**E.4 Inactivity cutoff.** A device whose `lastSeenAt` is **> 7 days** before evaluation is **inactive** and excluded from the denominator **only after** June explicitly reclassifies it as retired/lost (E.6). Until reclassified, a certified-active device that is silent counts as **NOT ready** → gate FAIL.

**E.5 PASS criterion (the 100% rule).** Gate = **PASS** iff, for **every** device in the E.1 certified-active set (minus E.6 reclassified devices), within the E.3 window: `boundOwnerUid === roomOwners/BBMANN` AND `lastSeenAt` within window AND `appVersion ≥ auth-capable build`. Denominator = certified-active set after E.6 removals. **100% required** — any single unbound or unseen active device → **FAIL**, do not tighten.

**E.6 Lost / retired / never-seen handling.** A certified device that will not authenticate (sold, broken, decommissioned, or June chooses to stop using it) is **removed from the active set by an explicit owner reclassification** (recorded), and its sessions/tokens revoked. It cannot be silently dropped to force a PASS. A device that reappears later must re-authenticate as owner before regaining authority.

**E.7 Evidence.** Gate evaluation output (device list, per-device bound/last-seen, PASS/FAIL, reclassifications, owner sign-off) is saved to `02_TEST_EVIDENCE` before R3.

## §F. rooms → businesses copy / reconciliation (unchanged from HOLD-1)
- **Copy, never move.** Copy `rooms/BBMANN/**` → `businesses/$bizId/**`, source preserved.
- **Reconcile before cutover:** record counts + financial totals (sum of sale totals per period) + content hashes (source vs destination) must all reconcile exactly.
- **Source retained** until reconciliation passes AND a stabilization window on the new schema passes; only then retire `rooms/*` (separate release, D4-10).

## §G. Backup / export + tested restore (unchanged from HOLD-1)
- Owner-authorized full RTDB export **before any change**; **encrypted + access-restricted**, never unencrypted on shared Drive; record export SHA-256 + timestamp.
- **Tested restore** into staging/emulator, diff counts/totals vs source → prove fidelity before trusting. Restore-to-live only on a rollback trigger.

## §H. Rollback model — CORRECTION 3 (real secure targets; break-glass ≠ rollback)
- **Insecure rules `1339b716…` = EMERGENCY BREAK-GLASS ONLY**, time-boxed, with a tracked remediation deadline. Reverting to it **reopens the P0**, so it is **never** the normal rollback target and is **never** labelled "last-known-secure".
- **The first tighten (R3) does NOT rely on a pre-existing secure production rules file** (none exists yet — current live is the insecure set). Instead R3 ships **two secure rule sets, both emulator-passed (§N) before deploy:**
  - **Rules A = secure transitional rules** (owner-gated `rooms/*`, §L) — the intended state.
  - **Rules B = secure fallback** — a **more conservative, still-secure** set that keeps anonymous fully denied. Minimum viable B = **owner-read/write only with all mutations to sensitive paths denied except the bound owner**, i.e. if A misbehaves for the owner, B is the safe retreat that is still closed to attackers. If even B cannot keep the live owner working, the retreat is **deny-all-writes containment** (fail-closed: reads for bound owner may remain, writes denied) as a **forward-fix** posture while A is repaired in staging — **not** a revert to `1339b716`.
- After R3 is live and stable, the currently-deployed secure rules become the captured **last-known-secure artifact** (`rules_lastknownsecure_<ts>.json` + SHA in `02_TEST_EVIDENCE`) for subsequent releases (R4+). So "last-known-secure" exists from R3 onward, and it is always a *secure* set.
- Firebase rules are versioned/instant-revert; data preserved (copy-not-move) → no data loss on rollback.

## §I. Monitoring + stop triggers — CORRECTION 6 (quantified)
**I.1 Sources.** Firebase Auth logs (auth success/failure), RTDB rule-evaluation metrics / permission-denied counts (Cloud Monitoring), and the client's own sync/sale-write success/failure telemetry (written to the readiness/audit node, not sales data).

**I.2 Baseline.** Captured over the **7-day observation window (§E.3) immediately before R3** on staging-mirrored + live-read metrics: baseline permission-denied rate for owner ops (expected ≈ 0 for legit owner), baseline auth-failure rate, baseline sync success rate (expected ~100% for the active shop), baseline sales-write success (expected 100%).

**I.3 Thresholds + windows (auto-halt rollout on breach).**
- **Sales write/read failure for the live shop: halt on the FIRST occurrence** (1 failed sale persist or read that is not resolved by the app's own recoverable-journal retry). Sales integrity is P0 — no tolerance band.
- **Sync stop:** no successful sync from a certified-active device for **> 15 minutes** during market hours → halt.
- **Permission-denied on legit owner ops:** **> 0 sustained** (any owner-op deny that repeats after one client re-auth attempt) → halt. (A single transient deny that clears on token refresh is logged, not halted.)
- **Auth-failure spike:** owner-account auth failure rate **> 5% over a rolling 15-minute window**, or **≥ 3 consecutive** owner sign-in failures on a certified device → halt + investigate (possible misconfig or lockout).

**I.4 Alert recipient + halt level.** Alerts go to **June (owner)** immediately (channel June designates — email/push). **Automatic halt operates at the ROLLOUT-STEP level** (freeze progression to the next release; do not auto-mutate live rules). Rule reversion is an **explicit owner-approved action**, not automatic, to avoid a flapping auto-rollback.

**I.5 Rollback vs forward-fix decision.**
- **Live shop is impacted** (sales failing, owner locked out, sync stopped) → **roll back to last-known-secure** (§H) immediately on owner approval; if R3 (no prior secure artifact) → retreat to Rules B, else deny-all-writes forward-fix; investigate in staging.
- **Attacker/anomaly signal but live shop unaffected** (e.g., permission-denied spike from unknown UIDs = rules working) → **forward-fix / hold**, do not roll back (rolling back would reopen exposure). Tighten/patch in staging, redeploy.

## §J. Independently reversible releases — CORRECTION 4 (R4 fail-closed) + R3 (Correction 3)
Phase 2 = independently reversible releases; each has its own verify + rollback artifact and can be reverted without undoing prior ones or reopening a security control:
- **R1** client anonymous-auth + owner-account sign-in (no rule change) — revert = ship prior client.
- **R2** owner-binding backend + `roomOwners` write — revert = remove binding (rules not yet dependent).
- **R3** tighten `rooms/*` rules (after §E PASS) — ships **Rules A + secure fallback Rules B**, both emulator-passed; revert target = **Rules B** (still secure), or deny-all-writes forward-fix; **never** `1339b716`. After R3 stable, capture last-known-secure artifact.
- **R4** licensing → Cloud Function + `licenses` rules backend-only. **Rollback is fail-closed:** the revert set **keeps all client `licenses/*` writes denied**, can **pause redemption entirely (fail-closed: no new redemptions succeed)** if the Function is unhealthy, **never restores client-side redeem**, and **never mutates or loses already-redeemed licenses** (redeemed state is read-preserved; no field rewrite on rollback). I.e. worst case = redemption temporarily unavailable, not redemption reopened to anonymous clients.
- **R5** `rooms→businesses` copy + client cutover (separate release) — revert = point client back to `rooms/*` (source retained).
- **R6** rotate/retire BBMANN — revert = keep code active (only after R5 verified).
- App Check added as defense-in-depth after R3–R4 correct.

## §K. Billing / deployment prerequisites (unchanged from HOLD-1)
- Verify **before implementation:** Cloud Functions require Firebase **Blaze**; confirm billing enabled, deploy region (asia-southeast1), quotas, cost estimate; Anonymous Auth + owner providers enabled; staging billing confirmed. Gate precedes any code.

## §L. Transitional `rooms/*` rules (current-schema, D2) — CORRECTION 5 (device coverage locked)
**L.1 Phase-2 authorization surface = SOLO owner session ONLY.** After tightening, `rooms/BBMANN/**` read/write/delete is allowed **only** for `auth.uid === roomOwners/BBMANN`. There is **no** member/staff authorization path in Phase 2 (that would require TEAM membership, which stays frozen — D5).
- **All of June's production devices operate as the same permanent owner** (§A.4): each signs in to the one owner account, so all present the owner UID and all keep working after tighten. Multiple devices ≠ multiple identities.
- **Devices that cannot/will not sign in as owner are removed before the §E gate** (E.6 reclassification + token revocation). There is no anonymous or device-bound write path left open to "cover" them.
- **No TEAM membership is created via Security P0.** The `members/$uid` model, staff roles, join/approval — all remain out of scope and are **not** introduced here. The emulator "member(staff)" case in §N is a **negative/forward-looking** assertion (staff has no P0 authority), not a feature being shipped.

**L.2 Rule intent (design):**
- Replace every deeper `true` with grants requiring `auth!=null` AND `auth.uid === root.child('roomOwners/'+$roomCode).val()` for read/write.
- **Delete protection via `.write` predicate** (NOT `.validate`, skipped on delete): deletes require owner; block whole-room delete.
- `trialRegistry/$deviceId`: require auth + device bound to owner uid.
- `licenses`: remove all client write (redeem via Function §J-R4); remove parent `.read` (no enumeration); allow only the requester's own code claim.
- `shopProfiles/$ownerId`: `auth.uid===$ownerId` write/delete.
- `affiliates`/`referrals`/`dailyLoads`: require ownership; remove anon create. `affiliateConfig`/`pilotOverrides`/`config` writes = backend/admin-only.
- Root stays false; no broad `true` anywhere (fixes cascade).

## §M. Target `businesses/*` rules (separate later release, D2/D4-10) — unchanged
`businesses/$bizId` with `members/$uid` authorization, per-node validate, delete-guards via `.write`, no enumerable parents. Adapted to actual live node shapes — **not** TrackB drop-in. Supersedes transitional `roomOwners` after migration (§F). (Membership model belongs to this later, post-freeze release — not Phase 2.)

## §N. Emulator test matrix (staging only, no live, no real-data destructive test) — unchanged
Per path assert ALLOW/DENY for **anonymous / member / owner / admin / attacker**:
- **anonymous:** all sensitive read/write/delete → DENY (incl. `rooms/$roomCode` delete-bypasses-validate, newData=null).
- **member(staff):** no P0 authority (negative assertion; TEAM frozen) → sensitive ops DENY.
- **owner:** full own-business r/w; other business DENY.
- **admin:** role ops (config/pilotOverrides/licenses redeem via Function) ALLOW; cross-tenant DENY.
- **attacker (knows BBMANN + arbitrary/anon uid):** rooms/* r/w/delete DENY; license direct-write/redeem DENY; whole-room delete DENY; shopProfiles/$other write/delete DENY; enumeration DENY.
- **positive:** live SOLO owner flows (bound uid) ALLOW (sale sync, trial); recovery re-link ALLOW after re-auth. **Rules A and Rules B (§H) both run the full matrix before R3.**

## §O. Production rollout sequence (D4, availability-preserving) — unchanged intent
backup+restore rehearsal → staging project → June permanent auth → secure owner binding → auth-capable backward-compat client → **§E readiness gate (PASS required)** → R3 tighten rooms/* (Rules A, fallback B ready) → R4 licensing Function → observe/stabilize → R5 migrate businesses/* (separate release) → R6 rotate/retire BBMANN. Rules tighten **only after** §E PASS (no lockout window). Each step = independently reversible release (§J) with monitoring/stop-triggers (§I) and secure rollback (§H).

## §P. BBMANN rotation timing — unchanged
Rotate/retire BBMANN **only when:** owner uid bound ✅ + transitional rules live ✅ + client reads by bound id ✅ + `rooms/BBMANN` migrated+reconciled (§F) ✅ + emulator attacker-test (known BBMANN) = DENY ✅. Never before.

## §Q. App Check — unchanged
Defense-in-depth ONLY; never a substitute for auth/authorization. Added after R3–R4 correct; required before mass/TEAM scale, not a P0 control by itself.

---
**No live Firebase change performed. No real-data test. No Phase 2 implementation. No M3.** Phase 2 remains HOLD pending Room 00 approval of this HOLD-2 corrected design.

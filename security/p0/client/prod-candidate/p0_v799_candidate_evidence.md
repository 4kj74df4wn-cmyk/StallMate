# P0 — v7.9.9 PRODUCTION CLIENT CANDIDATE — BUILD + VERIFY EVIDENCE (HARDENED FALLBACK)

**วันที่:** 10 ก.ย. 2026 · **Room 00:** CODE-PACKAGE REVIEW PASS → hardened fallback + Full-Chromium smoke prep
**ห้าม:** production deploy · Blaze/billing · Function deploy · live binding · Rules deploy · merge main · M3
**สถานะ:** `READY_FOR_ROOM00_CODE_REVIEW` (hardened) + Full-Chromium smoke harness พร้อมให้ June/CI รัน

## Baseline → candidate
- Baseline: `stallmate_v7.9.8.14.html` SHA `d806e672…` (frozen, verify ยืนยัน unchanged)
- **Hardened candidate:** `stallmate_v7.9.9_hardened.html` (= v7.9.9) SHA **`58deedc362c470320e126e2c82dcd943221d54968f1064a7374f0974b849db4b`**
  (ไฟล์ชื่อ `stallmate_v7.9.9.html` เดิม = pre-hardening `fe38853a`; ตัว hardened ใช้ชื่อ _hardened เพราะ Drive ล็อกไฟล์เดิมชั่วคราว — June คัดตัว _hardened ทับเป็น v7.9.9)
- Build = additive จาก .14: main app + 11 protected fns **byte-identical** · เพิ่ม firebase-auth-compat + APP_VERSION 7.9.9 + auth layer (`<script>` block แยก)

## HARDENED backward-compatible fallback (ปิด 7 เงื่อนไข Room 00 เด็ดขาด)
1. **fallback เฉพาะ PRE_BINDING ที่ยืนยันแล้ว** — legacy fires เฉพาะเมื่อ `roomOwners/BBMANN` ยืนยันว่า**ไม่มี** (bound===false) เท่านั้น
2. **auth/network/callable error ไม่เปิด legacy** — indeterminate (อ่าน binding ไม่ได้/ยังไม่รู้) → **queue** ผ่าน guardedSaleWrite ไม่ silent legacy
3. **bound → latch off ถาวร** — พอเคยเห็น binding (roomOwners exists) ครั้งเดียว → `__fallbackLatchOff=true` ตลอด session, legacy ปิดถาวร (ไม่ re-open แม้ sign-out)
4. **ทุก fallback มี telemetry นับได้** — `fallbackCount` + `lastFallbackAt` เขียน `readiness/audit/{deviceId}`
5. **หลัง Rules B legacy bypass ไม่ได้** — bound ⇒ latch off (Rules B ต้องมี binding) + ถึง fire ก็โดน Rules B deny
6. **un-writable sale → queue** — guardedSaleWrite persist snapshot immutable ก่อน network, dedup by opId, quarantine conflict → ยอดไม่เปลี่ยน ไม่หาย ไม่ซ้ำ
7. **ทุก sale path เข้า guarded writer** — override ทั้ง `updateSaleInFirebase` (real-time) และ `pushToFirebase('sales'|'all')` (import/restore) → ไม่มี whole-array bypass

## Verify (sandbox, node v22)
- syntax OK (2 blocks) · **M2 209/209** · **M0/M1 95/95** · **protected-scope OK (11 fns)** · frozen .14 `d806e672` unchanged · origin/main ไม่ขยับ
- **HARDENED integration smoke (jsdom + mock firebase/RTDB, synthetic): 14/14 PASS** — config guard accept/refuse · anon bootstrap · §E telemetry v7.9.9 · **PRE_BINDING legacy fires + fallbackCount telemetry** · bound+authed deterministic write **NO legacy** · OPID_CONFLICT ยอดเดิมคงไว้ · **bound-then-unauthorized: legacy latched off, queued** · un-writable **queued (no loss/dup)** · **pushToFirebase(all) → guarded writer, NO whole-array** · **indeterminate(read error) → NO silent legacy, queued**

## Full-Chromium LOCAL/CONTROLLED smoke (ให้ June/CI รัน)
- Harness `p0_v799_fullchromium_harness.html` (SHA `3f0e8524…`) — ห่อ **auth layer ตัวเดียวกับ candidate** ชี้ **emulator** (spoof projectId 9caac, ไม่แตะ production) + UI 10-point + RTDB/Auth emulator
- Runbook `p0_v799_fullchromium_README.md` — 10-point checklist (unbound pre-binding ขายได้ · anon · sign-in/re-auth · auth-fail→queue ไม่ silent · reconnect flush · idempotent · quarantine · bound→legacy disabled · telemetry ถูก · console 0 defect + record ไม่เปลี่ยน)
- HQ sandbox arm64 รัน Chromium เต็มไม่ได้ → HQ รัน jsdom 14/14 (อัตโนมัติ, ครอบ logic ทั้ง 10 จุด) · Full-Chromium click-through = ขั้น June/CI (เหมือน SR1)

## Dependency ก่อน production cutover (gate แยก)
production Spark + ไม่มี prod bindOwner → ก่อนผูก owner จริงต้อง: Blaze 9caac → prod secret แยก → deploy prod bindOwner → smoke synthetic · rollback สองช่วง (ก่อน Rules B = client .14; หลัง Rules B = rollback rules ก่อนแล้ว .14)

## Files / SHA
- candidate `stallmate_v7.9.9_hardened.html` = `58deedc3…`
- `p0_v799_auth_layer.js` = `1e50e806…` · `p0_v799_candidate_smoke.js` = `1c3556e7…` (14/14)
- `p0_v799_fullchromium_harness.html` = `3f0e8524…` · `p0_v799_fullchromium_README.md`
- `p0_v799_verify_result_hardened.txt` = `04ef2062…` · `p0_v799_build_candidate.js`

**Return → Room 00:** SECURITY P0 — v7.9.9 candidate HARDENED — fallback ปิด 7 เงื่อนไข (PRE_BINDING-only, error→queue, bound→permanent latch off, telemetry-counted, no-Rules-bypass, queue-no-loss/dup, all-paths-guarded) · verify M2 209/209 + M0/M1 95/95 + protected-scope OK + jsdom hardened smoke 14/14 · frozen/origin-main unchanged · candidate SHA 58deedc3 · Full-Chromium controlled harness + 10-point runbook prepared for June/CI · READY_FOR_ROOM00_CODE_REVIEW. Still HOLD: production deploy · Blaze · Function · binding · Rules · merge main · M3.

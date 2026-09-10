# P0 — v7.9.9 PRODUCTION CLIENT CANDIDATE — BUILD + VERIFY EVIDENCE

**วันที่:** 10 ก.ย. 2026 · **Room 00:** BUILD PRODUCTION CLIENT CANDIDATE v7.9.9 — AUTHORIZED (build+verify only)
**ห้าม:** production deploy · Blaze/billing · Function deploy · live binding · Rules deploy · merge main · M3
**สถานะ:** `READY_FOR_ROOM00_CODE_REVIEW`

## Baseline → candidate
- Baseline: `stallmate_v7.9.8.14.html` SHA `d806e672…` (frozen, **ไม่แตะ** — verify ยืนยัน unchanged)
- Candidate: **`stallmate_v7.9.9.html`** SHA `fe38853a31d9189cf6624ccaefd42f3aef7d10a0e5a71d16d73bb1a7378ffc1b`
- Build = additive: +15,001 bytes (766,965) — main app script + 11 protected fns **byte-identical**; เพิ่ม (1) `firebase-auth-compat.js` SDK tag (2) `APP_VERSION='v7.9.9'` (3) **auth layer** เป็น `<script>` block แยกก่อน `</body>` · reproducible ผ่าน `p0_v799_build_candidate.js`

## Included changes (Room 00 items)
- **Production config guard:** allowlist `stallmate-9caac` เท่านั้น; ปฏิเสธ staging/emulator/unknown (banner หยุด, ไม่เปิด auth)
- **R1 controller** (จาก verified `stallmate_auth.js`, R1 24/24 · SR1 16/16): anonymous bootstrap (device identity) + owner sign-in (permanent) + `isOwnerAuthorized` (อ่าน `roomOwners/BBMANN`, identity≠authority, re-verify ทุก write)
- **Deterministic writer:** `salesRecords/{opId}` transaction create-only + canonical-equal + **OPID_CONFLICT quarantine/no-auto-retry**
- **guarded override `updateSaleInFirebase`:** owner-authed → deterministic guarded write; pre-binding → fallback ของเดิม (backward-compatible เพราะ rules ยัง permissive จน production R3)
- **§E telemetry:** `readiness/audit/{deviceId}` = {deviceId, boundOwnerUid, authProvider, appVersion:'7.9.9', lastSeenAt} — no PII/sales
- **No direct `roomOwners` write** (binding = callable `bindOwner`, ต้องมี production Function ก่อน — gate แยก) · **ไม่ฝัง secret**
- build/version banner + deviceId display (กันสลับผิดเครื่อง/รุ่น)

## Verify (sandbox, node v22)
- **syntax:** OK (2 script blocks — main + auth layer, ทั้งคู่ parse ผ่าน)
- **financial regression M2:** **209/209 PASS** · **M0/M1:** **95/95 PASS** (ฟังก์ชันการเงินไม่ regress)
- **protected-scope:** OK — 11 protected fns (`computeBillStats/isValidOrderId/billCountLabel/avgPerOrderLabel/sessionBillCountLabel/renderStatKPI/collectBackupData/applyBackupData/backup/restore/clearAll`) byte-identical vs snapshot
- **frozen `.14`:** `d806e672…` **unchanged** · **origin/main:** ไม่ขยับ (candidate เป็นไฟล์ใหม่บน branch, ยังไม่ push)
- **integration smoke (jsdom + mock firebase/RTDB, synthetic):** **8/8 PASS** — config guard accept-9caac/refuse-staging · controller exposed · anon bootstrap · §E telemetry v7.9.9 · owner authorized after bind · deterministic guarded write · same-opId+changed-amount → original unchanged (OPID_CONFLICT)
  - offline/reconnect/idempotency: R1 `guardedSaleWrite`/`flushPendingSales`/OPID_CONFLICT = โค้ดเดียวกับ R1 24/24 + SR1 16/16 + SR3 18/18 (inlined)
- **หมายเหตุตรงไปตรงมา:** full-Chromium click-through บนเครื่องจริง (โหลด candidate จาก CDN firebase + emulator) เป็นขั้น canary/real-device ของ June/CI ต่อไป (ตาม prep §6) — sandbox arm64 รัน Chromium เต็มไม่ได้; รอบนี้พิสูจน์ integration ผ่าน jsdom + mock (เหมือนแนวทาง SR1)

## Dependency ก่อน production cutover (ยังไม่ทำ — gate แยก)
production `stallmate-9caac` ยัง **Spark** + **ยังไม่มี production `bindOwner`** → candidate ผูก owner จริงไม่ได้จนกว่า: June อนุมัติ Blaze 9caac → prod secret แยก → deploy bindOwner (gate แยก) → smoke synthetic prod fixture · **rollback สองช่วง** (ก่อน Rules B = client .14; หลัง Rules B = rollback rules ก่อนแล้วค่อย .14)

## Files (จะ commit เข้า `security/p0/client/prod-candidate/`)
`stallmate_v7.9.9.html` (`fe38853a…`) · `p0_v799_auth_layer.js` (`0d078dc8…`) · `p0_v799_build_candidate.js` · `p0_v799_candidate_smoke.js` (`92f63e9d…`) · `p0_v799_verify_result.txt` (`61d9b7c6…`) · `p0_v799_candidate_evidence.md`

**Return → Room 00:** SECURITY P0 — v7.9.9 PRODUCTION CLIENT CANDIDATE · built additive from .14 (protected 11 fns + main app byte-identical) · config guard 9caac-only · R1 auth + deterministic OPID_CONFLICT writer + §E telemetry · no direct roomOwners write · verify: M2 209/209 + M0/M1 95/95 + protected-scope OK + syntax OK + integration smoke 8/8 · frozen .13/.14 + origin/main unchanged · **READY_FOR_ROOM00_CODE_REVIEW**. Still HOLD: production deploy · Blaze · Function · binding · Rules · merge main · M3.

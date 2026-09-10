# P0 — v7.9.8.15-rc.1 FULL-CHROMIUM LOCAL/CONTROLLED SMOKE — RUNBOOK (June/CI)

**Room 00:** FULL-CHROMIUM LOCAL/CONTROLLED SMOKE AUTHORIZED · **local emulator เท่านั้น · ไม่แตะ production · synthetic**
**เป้าหมาย:** พิสูจน์ candidate `v7.9.8.15-rc.1` auth layer (โดยเฉพาะ **hardened backward-compatible fallback**) บน Chromium จริง

## ทำไมต้อง controlled harness
candidate `stallmate_v7.9.8.15-rc.1.html` ฝัง production config (`stallmate-9caac` + RTDB จริง) + config guard ล็อก → ถ้าเปิดตรง ๆ จะยิง production จริง (ห้าม) · harness `p0_v79815rc1_fullchromium_harness.html` ห่อ **auth layer ตัวเดียวกัน** (byte-identical) แต่ชี้ **emulator** spoof projectId เป็น `stallmate-9caac` → ทดสอบ logic เดียวกันโดยไม่แตะ production (แนวเดียวกับ SR1 staging-app)

## วิธีรัน
1. เปิด emulator: `firebase emulators:start --only auth,database --project stallmate-9caac` (Auth 9099 + RTDB 9000)
2. เปิด Auth emulator รองรับ Email/Password + Anonymous (emulator เปิดให้อยู่แล้ว)
3. เสิร์ฟ harness: `python3 -m http.server 8080` ในโฟลเดอร์ที่มี harness
4. เปิด Chrome: `http://127.0.0.1:8080/p0_v79815rc1_fullchromium_harness.html?emulator=1`
5. เปิด DevTools Console (Cmd+Option+J)

## 12-point checklist (กดปุ่มในหน้า + ดู log)
1. **Existing unbound device ขายต่อได้ (pre-binding):** ยังไม่ Seed roomOwners → Record sale → log `LEGACY write` (fallback) · ✅ ขายได้
2. **Anonymous bootstrap:** โหลดหน้า → แถบล่าง `device(anon)` · ✅
3. **Permanent sign-in:** Create test owner → Owner sign-in → permanent=true · ✅
4. **Sign-out / re-auth:** Sign out → Re-auth → permanent=true · ✅
5. **Auth failure → queue, no silent fallback:** (bound แล้ว) sign out → Record sale → **queued** ไม่มี LEGACY · ✅
6. **Offline/reconnect → exactly-once flush:** Toggle offline → Record sale (queued) → online → Reconnect flush → เขียนครั้งเดียว pending=0 · ✅
7. **Same opId / same amount → idempotent success:** Record sale opId เดิม ยอดเดิม → 1 record · ✅
8. **Same opId / different amount → quarantine:** เปลี่ยนยอด opId เดิม → `opid_conflict` quarantine ยอดเดิมคงไว้ · ✅
9. **Bound device → legacy fallback disabled:** หลัง Seed roomOwners → sign out → Record sale → ไม่มี LEGACY (latch off) queued · ✅
10. **Correct bound/seen/appVersion:** RTDB UI `readiness/audit/{deviceId}` = boundOwnerUid/appVersion `7.9.8.15-rc.1`/lastSeenAt (+fallbackCount) · ✅
11. **Console defect = 0:** ไม่มี error แดง (ยกเว้น permission_denied ที่คาดไว้) · ✅
12. **Original financial record unchanged:** record เดิมไม่ถูกทับ · ✅

## เก็บผลส่ง HQ (redacted)
Browser/version · ผลข้อ 1-12 · console defect count · opid_conflict แสดงจริง · legacy fallback เฉพาะ pre-binding + latch off หลัง bound · queued sale ยอดไม่เปลี่ยน · telemetry ครบ (appVersion 7.9.8.15-rc.1)

## หมายเหตุ
HQ sandbox (arm64) รัน Chromium เต็มไม่ได้ → HQ รัน **jsdom hardened integration smoke 14/14** (อัตโนมัติ ครอบ logic ทั้ง 12 จุด + 10 เงื่อนไข fallback) เป็นหลักฐาน HQ-run · Full-Chromium click-through = ขั้น June/CI

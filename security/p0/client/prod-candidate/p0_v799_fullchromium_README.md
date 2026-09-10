# P0 — v7.9.9 FULL-CHROMIUM LOCAL/CONTROLLED SMOKE — RUNBOOK (June/CI)

**Room 00:** FULL-CHROMIUM LOCAL/CONTROLLED SMOKE AUTHORIZED · **local emulator เท่านั้น · ไม่แตะ production · synthetic**
**เป้าหมาย:** พิสูจน์ candidate v7.9.9 auth layer (โดยเฉพาะ **backward-compatible fallback** ที่ hardened แล้ว) บน Chromium จริง

## ทำไมต้อง controlled harness (ไม่รัน candidate ตรง ๆ)
candidate `stallmate_v7.9.9.html` ฝัง production config (`stallmate-9caac` + RTDB จริง) และ config guard ล็อกไว้ → ถ้าเปิดตรง ๆ จะยิง **production จริง** (ห้าม) · harness `p0_v799_fullchromium_harness.html` จึงห่อ **auth layer ตัวเดียวกัน** (byte-identical กับใน candidate) แต่ชี้ **emulator** โดย spoof projectId เป็น `stallmate-9caac` (emulator รับ project id ใดก็ได้) → ทดสอบ logic เดียวกันโดยไม่แตะ production (แนวเดียวกับ SR1 staging-app)

## วิธีรัน
1. เปิด emulator (Auth 9099 + RTDB 9000) — ใช้ run-kit เดิม (`firebase emulators:start --only auth,database --project stallmate-9caac`) หรือ jar
2. เปิด Authentication emulator ให้รองรับ Email/Password + Anonymous (emulator เปิดให้อยู่แล้ว)
3. เสิร์ฟ harness: `cd <folder ที่มี harness>; python3 -m http.server 8080`
4. เปิด Chrome: `http://127.0.0.1:8080/p0_v799_fullchromium_harness.html?emulator=1`
5. เปิด DevTools Console (Cmd+Option+J) ไว้ดู error

## 10-point checklist (ทำตามปุ่มในหน้า + ดู log)
1. **Existing unbound device ขายต่อได้ (pre-binding):** ยังไม่ seed roomOwners → กด **Record sale** → log ขึ้น `fallback:true` (legacy) + sale เขียน `legacySales` · ✅ ถ้าขายได้
2. **Anonymous bootstrap:** โหลดหน้า → แถบล่างขึ้น `device(anon)` · ✅
3. **Permanent sign-in + re-auth:** Create test owner → Owner sign-in (permanent) → Sign out → Re-auth · ✅ แถบขึ้น `owner`
4. **Auth failure → queue ไม่ silent fallback:** (สถานะ bound แล้ว) sign out → Record sale → ต้อง **queued** (pending+1) **ไม่มี** legacy call · ✅
5. **Reconnect → flush ครั้งเดียว:** Toggle offline → Record sale (queued) → Toggle online → Reconnect flush → เขียนครั้งเดียว pending=0 · ✅
6. **Same opId / same amount → idempotent success:** Record sale opId เดิม ยอดเดิม → สำเร็จ ไม่ซ้ำ (1 record) · ✅
7. **Same opId / different amount → quarantine:** Record sale opId เดิม เปลี่ยนยอด → `opid_conflict` + quarantine, ยอดเดิมคงไว้ · ✅
8. **Bound device → legacy fallback disabled:** หลัง Seed roomOwners (bind) → Record sale ตอน sign-out → **ไม่มี** legacy (latch off) queued แทน · ✅
9. **Telemetry ถูกต้อง:** ดู RTDB emulator UI `readiness/audit/{deviceId}` = boundOwnerUid/appVersion `7.9.9`/lastSeenAt (+ fallbackCount ถ้ามี fallback) · ✅
10. **Console defect = 0 + original financial record unchanged:** Console ไม่มี error แดง (ยกเว้น permission_denied ที่คาดไว้), record เดิมไม่ถูกทับ · ✅

## เก็บผลส่ง HQ (redacted)
Browser/version · ผลแต่ละข้อ 1-10 · console defect count · `opid_conflict` แสดงจริง · legacy fallback เกิดเฉพาะ pre-binding + latch off หลัง bound · queued sale ยอดไม่เปลี่ยน · telemetry ครบ

## หมายเหตุ
HQ sandbox (arm64) รัน Chromium เต็มไม่ได้ → HQ รัน **jsdom hardened integration smoke 14/14** (อัตโนมัติ ครอบ logic ทั้ง 10 จุด + 7 เงื่อนไข fallback) เป็นหลักฐาน HQ-run · Full-Chromium click-through นี้คือขั้น June/CI (เหมือน SR1)

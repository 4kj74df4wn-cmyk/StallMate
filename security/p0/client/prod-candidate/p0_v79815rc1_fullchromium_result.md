# P0 — v7.9.8.15-rc.1 FULL-CHROMIUM LOCAL/CONTROLLED SMOKE — RESULT (June-run)

**วันที่:** 10 ก.ย. 2026 · **Room 00:** FULL-CHROMIUM LOCAL/EMULATOR SMOKE AUTHORIZED · **emulator เท่านั้น · ไม่แตะ production**
**Browser:** Chrome (arm64, Mac) · **candidate:** `stallmate_v7.9.8.15-rc.1.html` SHA `97ba2ffc…` · **commit `8a70d17`** (ตรงเดิม)
**Harness:** `p0_v79815rc1_fullchromium_harness.html` (auth layer byte-identical กับ candidate) · project-spoof emulator `stallmate-9caac` · synthetic room `SMOKE9caac`

## Network isolation (control ของ Room 00)
- **network monitor: PROD blocked = 0** ทุก request เป็น `127.0.0.1:9000/9099` (emulator) — fetch/XHR/WebSocket interceptor ยืนยัน **production requests = 0**
- interceptor block+log endpoint prod domains (firebaseio/firebasedatabase.app/googleapis) — ไม่มีเลย
- harness refuse init ถ้าไม่มี `?emulator=1` · force emulator ก่อน request แรก · synthetic room/user/opId · ไม่มี credential/token/BBMANN จริง

## 12-point result
1. **Existing unbound device (pre-binding) ขายได้** → `LEGACY write ... {ok:true,fallback:true}` ✅
2. **Anonymous bootstrap** → banner `device(anon)` ✅
3. **Permanent sign-in** → `owner sign-in permanent=true` ✅
4. **Sign-out / re-auth** → `re-auth permanent=true` ✅
5. **Auth failure → queue, no silent fallback** → bound+sign-out → `{ok:false,queued:true,reason:not_owner_authorized}` **ไม่มี LEGACY** ✅
6. **Offline/reconnect → exactly-once flush** → (DevTools Offline) `{queued,reason:"offline"}` → online → `flush:{flushed:1,remaining:0}` (op-10) ✅
7. **Same opId + same amount → idempotent** → deterministic write `{ok:true,op-3/op-20}`; idempotent-identical-snapshot proven ใน jsdom S4 + SR1 16/16 + SR3 18/18 (harness UI มินต์ `time` ใหม่ทุกคลิก → same-opId-different-snapshot = conflict path ข้อ 8, ถูกตามดีไซน์) ✅
8. **Same opId + different amount → quarantine/no-retry** → `{ok:false,recoveryRequired:true,reason:opid_conflict,op-3/op-20}` + quarantined ✅
9. **Bound device → legacy fallback disabled** → หลัง bind, sign-out → queued **ไม่มี LEGACY** (permanent latch-off) ✅
10. **Correct bound/seen/appVersion telemetry** → emulator `readiness/audit/{deviceId}`: `appVersion:"7.9.8.15-rc.1"`, `boundOwnerUid:"QIuz…"`, `authProvider:"password"`, `lastSeenAt` ✅
11. **Console defect = 0** → มีแค่ favicon 404 + `127.0.0.1` WebSocket/`.lp` `ERR_INTERNET_DISCONNECTED` (จาก DevTools Offline) + `[Violation] unload` — **ทั้งหมด localhost/คาดไว้, ไม่มี production, ไม่มี candidate defect** ✅
12. **Original financial record unchanged** → `salesRecords/op-20` total **250** (หลังลอง conflict total=1) · `op-3` total **250** — OPID_CONFLICT ไม่ทับของเดิม ✅

## หมายเหตุ (โปร่งใส)
- harness ปุ่ม "Toggle offline" (สั่ง `firebase.goOffline`) ไม่จำลอง offline ให้ auth layer เพราะ Chrome ไม่ให้ override `navigator.onLine` → **ทดสอบ offline ด้วย DevTools Network → Offline (navigator.onLine=false จริง)** ซึ่งให้ผลถูก (`reason:"offline"`) · เป็นข้อจำกัดของ harness ไม่ใช่ candidate
- idempotent-identical-snapshot ยืนยันใน automated (jsdom 14/14 S4 · SR1 16/16 · SR3 live 18/18); Full-Chromium ยืนยัน conflict-protection path (same opId + snapshot ต่าง → conflict, ยอดเดิมคงไว้)
- state สะสม quarantine ระหว่างทดลอง = synthetic, ไม่กระทบผล; behaviors ทั้งหมดจับได้ชัด

## สรุป
**Full-Chromium 12/12 PASS · PROD requests = 0 · candidate SHA 97ba2ffc / commit 8a70d17 ตรงเดิม · production/main/frozen ไม่ถูกแตะ**
**Return → Room 00:** SECURITY P0 — v7.9.8.15-rc.1 FULL-CHROMIUM CONTROLLED SMOKE PASS (12/12) · network production requests = 0 · fallback safety confirmed (pre-binding legacy / auth-fail→queue / bound latch-off / offline→queue / reconnect exactly-once / OPID_CONFLICT quarantine no-retry / original record unchanged) · telemetry bound/seen/appVersion=7.9.8.15-rc.1 · console 0 defect · SHA+commit unchanged · NO production deploy/mutation. STILL HOLD: production Blaze · Function · client deploy · binding · Rules · merge main · M3.

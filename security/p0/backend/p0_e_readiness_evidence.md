# P0 — §E DEVICE-READINESS GATE — VERIFICATION EVIDENCE (mechanism only)

**วันที่:** 8 ก.ย. 2026 · **Room 00 authorized:** §E DEVICE-READINESS VERIFICATION ONLY · **ไม่ deploy · ไม่แตะ production · synthetic เท่านั้น**
**อ้างอิงนิยาม:** HOLD-2 CORRECTED §E (E.1–E.7)

## ขอบเขต (สำคัญ — อ่านก่อน)
gate นี้เป็น **precondition ก่อน SR3/R3** (tighten rules) เพราะการเข้มกฎจะล็อกเครื่องที่ยังไม่ผูกเจ้าของ · แต่ production ยัง**ไม่ได้ลง auth-capable client** (ยังรันแอป frozen) เครื่องจริงจึงยังเขียน telemetry ไม่ได้ → **ยังวัด §E จริงกับเครื่องจริงไม่ได้ตอนนี้** · ดังนั้นรอบนี้ = **พิสูจน์กลไก (mechanism) ว่าตัดสิน PASS/FAIL ถูกต้องตาม E.1–E.7** ด้วย synthetic ไม่ใช่การประกาศ production READY

**§E PASS จริง (ก่อน production R3) ยังต้องมี:** (1) June รับรอง inventory เครื่อง BBMANN จริง (E.1) (2) auth-capable client ถูก deploy ลงเครื่องจริงจน telemetry ครบ (3) รัน evaluator นี้กับข้อมูลจริง แล้วได้ PASS 100% — ทั้งหมดเป็น gate production แยกภายหลัง

## กลไกที่สร้าง
`p0_e_readiness_gate.js` — evaluator บริสุทธิ์ (dependency-injected): รับ certified inventory + telemetry snapshot + reclassifications + evaluation instant + min auth-capable version → คืน `{pass, denominator, readyCount, devices[], unknowns[], reasons[]}`
- **E.1** denominator = certified − reclassified · เครื่องแปลกใน telemetry (ไม่อยู่ใน certified/reclassified) = flag สอบสวน → block PASS
- **E.2** อ่าน telemetry (`deviceId/boundOwnerUid/authProvider/appVersion/lastSeenAt`) — no PII/sales
- **E.3** window 7 วันพอดี · **E.4** เครื่อง certified ที่เงียบ/last seen > 7 วัน (ยังไม่ reclassify) = NOT ready → FAIL
- **E.5** PASS iff ทุกเครื่อง active: `boundOwnerUid===roomOwners/BBMANN` AND lastSeenAt ใน window AND `appVersion≥auth-build` — **100% เท่านั้น**
- **E.6** reclassify retired/lost = ตัดออกจาก denominator · **E.7** output = หลักฐาน (ไฟล์ผล)

## ผลการพิสูจน์ (synthetic; no prod)
- **Logic suite** `p0_e_readiness_tests.js` → **13/13 PASS, exit 0** (`p0_e_readiness_result.txt`): all-ready PASS · unbound FAIL · silent(no telemetry) FAIL · out-of-window FAIL · reclassified excluded PASS · appVersion<build FAIL · unknown device flagged FAIL · no-owner-bound FAIL · empty-denominator FAIL · window-boundary PASS · cmpVersion correct · 3/3 PASS · 2/3 FAIL (100% rule)
- **Read-path (E.2)** `p0_e_readpath_test.js` vs RTDB emulator → **3/3 PASS, exit 0** (`p0_e_readpath_result.txt`): gate อ่าน telemetry จาก `readiness/audit` จริง → both-ready PASS · device rebinds elsewhere → FAIL · unknown device in RTDB → flagged FAIL · cleanup
- **รวม §E VERIFICATION: 16/16 PASS**

## SHA
- `p0_e_readiness_gate.js` = `88b8630a…`
- `p0_e_readiness_tests.js` = `7a5d2d5b…` · result `0da8a405…`
- `p0_e_readpath_test.js` = `abf82db2…` · result `2242783…`

## สถานะ / คง HOLD
- **§E gate mechanism VERIFIED (16/16)** — พร้อมใช้เป็น gate ก่อน SR3/R3
- ไม่ deploy · ไม่แตะ production · frozen .13/.14 ไม่เกี่ยว · origin/main ไม่ขยับ
- คง HOLD: **SR3 Rules deploy · production · merge main · M3** · §E PASS จริงกับเครื่องจริง = gate production แยก (ต้องมี auth-capable client บน production + June certify inventory ก่อน)

**Return → Room 00:** SECURITY P0 — §E DEVICE-READINESS GATE mechanism VERIFIED (16/16 PASS: 13 logic + 3 RTDB read-path, synthetic). Evaluator is PASS/FAIL-decidable per E.1–E.7. No deploy/production. Real §E PASS remains a separate production gate (needs auth-capable client on prod devices + June-certified inventory). Still HOLD: SR3 · production · merge main · M3.

# P0 — SR3 RULES B STAGING DEPLOY — EVIDENCE (SR3 COMPLETE)

**วันที่:** 10 ก.ย. 2026 · **Authorized by Room 00** · รันบนเครื่อง June (feelgood2511) · **staging RTDB rules only**
**Target:** `stallmate-staging-2026-5f39f` · artifact `database.rules.B.json` (SHA `78fcd088…`) · **ไม่แตะ production**

## PRE-DEPLOY checks (Room 00) — ผ่านครบ
guard OK (target staging ไม่ใช่ prod) · RulesB `78fcd088…` ✓ · firebase.staging.json `aed363fb…` ✓ · firebase.rollback.json `46a7b673…` ✓ · forwardfix `a297d2f9…` ✓ · config ชี้ `database.rules.B.json` ✓ · rollback command ยืนยันพร้อม (deploy forwardfix ผ่าน firebase.rollback.json)

## DEPLOY
`firebase deploy --only database --project stallmate-staging-2026-5f39f --config firebase.staging.json` → **rules syntax valid → released successfully → Deploy complete!** · database rules only (ไม่มี functions/hosting) · deployed rules = Rules B (SHA `78fcd088…`)

## POST-DEPLOY LIVE RULES SMOKE (Rules B enforced, synthetic) — 18/18 PASS
`p0_sr3_rules_smoke_live.js` (client SDK + real Auth + deployed bindOwner + staging RTDB under Rules B):
- **ALLOW:** owner bound via callable · owner writes salesRecords · owner reads rooms/$room · owner reads roomOwners/$room · idempotent replay (same canonical) · owner re-auth (recovery) read + write
- **DENY:** anonymous write/read/takeover · non-owner authed write/read/takeover · owner hard-delete salesRecord · owner field-drop (validate no-field-drop)
- **Financial integrity:** same opId + changed amount → OPID_CONFLICT, original record unchanged
- **cleanup PASS** — rooms/roomOwners/nonces/audit/test users removed on staging (never production)
- **ผล: 18/18 PASS, 0 FAIL, exit 0** (`p0_sr3_rules_smoke_result.txt`, SHA `7474d1ac…`)

## ปัญหาที่เจอ + แก้ (โปร่งใส)
1. รอบแรก cleanup ล้ม (ยังไม่ได้ดาวน์โหลด SA key) → 17/18 (enforcement ถูกครบ)
2. รอบสอง bindOwner ล้ม = **nonce ซ้ำ (replay)** เพราะ smoke hardcode nonce `n1` + รอบแรกไม่ได้ลบ nonce → 9/18 (rule DENY ยังถูก, owner ops denied เพราะไม่ผูก)
3. แก้ smoke: **nonce unique ต่อรอบ** + cleanup ลบ nonce ด้วย `_claimId` (sha256) ที่ถูกต้อง → รอบสาม **18/18 PASS**
4. sweep ข้อมูล synthetic ค้าง (`p0_staging_synthetic_sweep.js`, staging-guarded) → ลบ rooms 1/roomOwners 1/nonces 1/audit 1/users 2 → staging สะอาด

## Regression + monitoring/cost + production
- frozen guard `verify.sh stallmate_v7.9.8.14.html` → **209/209 + 95/95, snapshots/index/protected-scope OK** · negative tests **7 fired/0 missed** · frozen .14/.13 ไม่ขยับ
- cost: RTDB rules deploy = **ไม่มีค่า compute** · smoke ใช้ bindOwner ไม่กี่ครั้ง อยู่ใต้ free-tier · Blaze Free Trial credit คงเดิม
- **production `stallmate-9caac` ไม่ถูกแตะ** (คนละ project/บัญชี, deploy ยิง staging เท่านั้น)
- SA key ที่ดาวน์โหลดมา ลบแล้ว (ความปลอดภัย)

## Rollback (พร้อม ถ้าต้องถอย)
`firebase deploy --only database --project stallmate-staging-2026-5f39f --config firebase.rollback.json` (→ `database.rules.forwardfix.json` deny-all-writes secure)

## SHA manifest
- `p0_sr3_rules_smoke_live.js` = `b59125b5…`
- `p0_sr3_rules_smoke_result.txt` = `7474d1ace121531c57a19905486d40db5aae9a08b35b8b2f1a0782ab6e408a9c`
- `p0_staging_synthetic_sweep.js` = `b4aa9471…`
- deployed rules `database.rules.B.json` = `78fcd0882c73085bf1f32d5ccf7a73869c54f95c2c9731010110b99ac9431850`

## สถานะ / คง HOLD
- **SR3 COMPLETE** (live rules smoke 18/18 + cleanup PASS + regression green + production untouched)
- คง HOLD: **production Rules · production client rollout · merge main · M3**
- **NEXT gate (Room 00):** Production Device Inventory Gate — เครื่อง BBMANN จริง `bound + seen + appVersion` ครบ **100%** ใน 7-day window + June รับรอง inventory → แล้วขออนุมัติ production R3 เป็น gate ใหม่

**Return → Room 00:** SECURITY P0 — SR3 RULES B STAGING DEPLOY: Rules B (78fcd088) released to staging RTDB · live rules smoke 18/18 PASS (owner ALLOW; anon/non-owner/unbound/takeover/delete/field-drop DENY; financial idempotency+integrity; recovery ALLOW; cleanup PASS) · regression 209/209+95/95, negative 7/0 · production untouched · SA key deleted → **SR3 COMPLETE**. Still HOLD: production Rules · client rollout · merge main · M3.

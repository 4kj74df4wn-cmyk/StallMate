# P0 — PRODUCTION R2 + BILLING PREPARATION (CANONICAL, HOLD-2 CORRECTED)

**วันที่:** 10 ก.ย. 2026 · **สถานะ:** PREPARATION ONLY — NO MUTATION · ไม่เปิด Blaze · ไม่เปลี่ยน billing · ไม่ deploy · ไม่แตะ production
**เอกสารนี้คือ runbook เดียวที่ authoritative** — ไม่มี "ส่วนแก้ท้ายเอกสาร" มาหักล้างด้านบน. ชื่อไฟล์/SHA/คำสั่งด้านล่างคือชุดจริงที่ commit.

Repo: branch `security/p0-containment` · ทุก path อ้างจาก **`security/p0/`**

---

## Repo layout (ชุด canonical เดียว)

```
security/p0/firebase.production.json          # deploy config (source "functions") — วางที่ระดับ security/p0
security/p0/prod/ensure_prod_target_9caac.sh  # exact-target guard
security/p0/prod/verify_prod_functions_sha.sh # reproducibility guard
security/p0/functions/index.js                # bindOwner callable
security/p0/functions/p0_r2_owner_binding.js  # reviewed handler (TRACKED)
security/p0/functions/package.json
security/p0/evidence/…                         # เอกสาร + smoke + guard results + manifest
```

**firebase.production.json** (วางที่ `security/p0/`, source สัมพัทธ์ = `functions`):
```json
{ "functions": { "source": "functions", "runtime": "nodejs20" } }
```

---

## 1. Target (project + Google account)
- production project id (exact): **`stallmate-9caac`** · region `asia-southeast1`
- production Google account: **`pkorn1968@gmail.com`**
- staging (คนละใบ): `stallmate-staging-2026-5f39f` ใต้ `feelgood2511@gmail.com`

## 2. Canonical deploy — target ผูกกับ guard เป็นบริบทเดียว (B1 fix)
รันจาก `security/p0` เท่านั้น. guard, config, และ `--project` ใช้ **exact project id เดียวกัน** — ไม่พึ่ง alias `prod`:

```bash
cd security/p0

# gate ก่อน deploy (ทั้งสองต้องผ่าน)
./prod/ensure_prod_target_9caac.sh stallmate-9caac      # PASS เฉพาะ 9caac
./prod/verify_prod_functions_sha.sh functions           # handler+index SHA ตรง + tracked

firebase deploy \
  --only functions:bindOwner \
  --project stallmate-9caac \
  --config firebase.production.json
```
- `--project stallmate-9caac` = exact id (ไม่ใช้ alias) · `--only functions:bindOwner` เท่านั้น · config source `functions` สัมพัทธ์กับ cwd `security/p0` → resolve บริบทเดียว
- **ไม่มี** `.firebaserc`/alias ในเส้นทางนี้ (ตัด alias-resolution ambiguity ทิ้ง)

## 3. Rollback — exact project id เช่นกัน (ห้าม alias)
R2 ไม่มี bindOwner เดิมใน production → rollback = ลบฟังก์ชัน:
```bash
firebase functions:delete bindOwner --region asia-southeast1 --project stallmate-9caac --force
```

## 4. Cost control — ถ้อยคำที่ถูกต้อง (B4 fix)
> **Budget Alert เป็น notification เท่านั้น** และ **`maxInstances=1` เป็น concurrency / cost-risk guard ไม่ใช่ hard spending cap** — request สามารถเข้าต่อเนื่องทีละ 1 และก่อค่าใช้จ่ายได้. **ไม่มี hard monetary cap ใน configuration นี้.**

- cost guard ที่ตั้ง (ยืนยันใน `functions/index.js`): `maxInstances=1` · `concurrency=1` · `timeoutSeconds=30` · region `asia-southeast1`
- ประมาณการ: bindOwner ถูกเรียกเฉพาะตอน bind เครื่อง owner (หลักหน่วย–สิบครั้งตลอด SOLO rollout) → คาดอยู่ใน free tier (~0฿) แต่ **ไม่รับประกันด้วย config** — ต้องดู Budget Alert + usage หลัง deploy
- ตั้ง Budget เช่น 1 USD/เดือน เตือน 50/90/100% (notify-only)

## 5. Secret Manager (ไม่โชว์ค่า)
- ผูกผ่าน `defineSecret('OWNER_BIND_SECRET')` + `.value()` runtime (ไม่ฝังในซอร์ส)
- set (หลัง Blaze, ก่อน deploy; June พิมพ์ค่าเอง): `printf '%s' '<ค่า>' | firebase functions:secrets:set OWNER_BIND_SECRET --data-file - --project stallmate-9caac`
- verify (metadata เท่านั้น): `firebase functions:secrets:get OWNER_BIND_SECRET --project stallmate-9caac`
- **ค่า secret ไม่ปรากฏในแพ็กเกจนี้** · production secret เป็นค่าใหม่แยกจาก staging

## 6. Billing isolation (identifiers redacted)
- production `stallmate-9caac` (pkorn1968) ยัง **Spark** ณ ตอนนี้ = สถานะเริ่มต้นก่อนเปิด Blaze
- staging Blaze อยู่คนละบัญชี (feelgood2511, billing account redacted)
- หลักฐานภาพจริง (billing account id ของ 9caac ≠ staging) เก็บ *ตอนเปิด Blaze production* → `p0_prod_billing_isolation_evidence.md` (ขั้นถัดไป)

## 7. Post-deploy smoke — executable end-to-end (B1+B2 fix)
`security/p0/evidence/p0_prod_r2_postdeploy_smoke.js`:
- **import ข้ามโฟลเดอร์ถูกต้อง (B1):** `require('../functions/p0_r2_owner_binding.js')` (smoke อยู่ evidence/, handler อยู่ functions/)
- authenticate **synthetic Firebase user จริง** (custom token → provider `custom`, ไม่ anonymous)
- forge claim ด้วย `signClaim()` จาก handler ตัวจริง (format ตรง backend เป๊ะ)
- เรียก **httpsCallable('bindOwner') จริง** (region asia-southeast1) → ตรวจ `data.ok/roomCode/uid`
- ตรวจ **RTDB จริง**: `roomOwners/<ROOM>===uid` และ `ownerBindClaimsUsed/<nonce>` exists (ตรงกับที่ backend เขียนจริง)
- replay → ต้องถูกปฏิเสธ (`replayed`)
- **cleanup แยกผลจาก smoke (B2):** รายงาน `SMOKE PASS/FAIL` และ `CLEANUP PASS/FAIL` แยกกัน · ถ้า RTDB cleanup หรือ `deleteUser()` ล้มเหลว → **exit non-zero** (ไม่กลืน error) · เมื่อ cleanup ล้มเหลว print synthetic identifiers แบบ redacted (`room`, `noncePrefix`, `uid`) สำหรับ manual sweep
- exit codes: `0`=SMOKE+CLEANUP PASS · `1`=SMOKE FAIL · `4`=SMOKE PASS แต่ CLEANUP FAIL · `3`=abort
- room = `SMOKEPROD*` (abort ถ้าชน BBMANN) · abort ถ้า project≠stallmate-9caac · SA key + secret อ่านจาก env ไม่ print
- **deps ตอน gate (reproducible):** `cd functions && npm ci` จาก committed `package-lock.json` — **ห้าม `npm i`** (กัน dependency drift)

## 8. SHA manifest + full-artifact-set guard (B4 fix)
- `security/p0/evidence/p0_prod_r2_sha_manifest.json` — full sha256 ของ deploy artifact set ทั้ง 5 ไฟล์
- `verify_prod_functions_sha.sh` ตอนนี้คุม **ครบชุด deploy artifact**: `firebase.production.json`, `functions/index.js`, `functions/p0_r2_owner_binding.js`, `functions/package.json`, `functions/package-lock.json` (fail-closed ทุกไฟล์)
  - `firebase.production.json` = `3a041f54e73f9d69…c71f`
  - `functions/package.json` = `787a5c7eaa069e53…207c`
  - `functions/package-lock.json` = `e03ede776e099310…4323`
- `security/p0/evidence/p0_prod_r2_guard_results.txt` — target guard 1 PASS/6 FAIL · reproducibility guard: order-proof (config→package ผ่าน, gate ที่ lock) + negatives (tampered index / tampered config / missing handler ทั้งหมด BLOCKED). Full 5/5 PASS ยืนยันบนเครื่อง June ด้วย committed lockfile

## 9. Stop conditions (abort ทันที)
target≠stallmate-9caac · account≠pkorn1968 · 9caac ยังไม่เปิด Blaze/billing ชนกับ staging · secret ไม่ผูก/version ผิด · region≠asia-southeast1 · SHA ไม่ตรง manifest · guard exit≠0

## 10. ยืนยันสิ่งที่ยังไม่ถูกแตะ + baseline SHA mapping (B4 fix)
- **`.13` (`v7.9.8.13`) = `523df939…`** · **`.14` (`v7.9.8.14`) = `d806e672…`** — ทั้งคู่ frozen ไม่ถูกแตะ
- origin/main = `83b2ca7…` — ไม่ merge/ไม่แก้
- production RTDB Rules — ไม่ถูกแตะ (R2 deploy functions เท่านั้น)
- production client — candidate `v7.9.8.15-rc.1` ยังไม่ deploy

## เอกสารเก่าที่ถูกแทน (B3 fix — single source of truth)
`p0_93_billing_preflight.md` (3 ก.ย., ระบุ maxInstances 3–5 + redeemLicense) = **SUPERSEDED**. แก้ให้เหลือ **ตำแหน่งเดียว**: mark หัวเอกสารจริงที่ **`security/p0/backend/p0_93_billing_preflight.md`** (ต้นฉบับเดิม) เป็น SUPERSEDED · **ลบสำเนาซ้ำใน `evidence/`** ทิ้ง (ไม่สร้างสำเนาใหม่แล้วปล่อยต้นฉบับเก่าใช้งานได้). รอบนี้ scope = **`bindOwner` เท่านั้น**, ไม่มี `redeemLicense`.

---

## STILL HOLD
production Blaze · Function deploy · client deploy · live owner binding · production Rules · production data mutation · merge main · M3

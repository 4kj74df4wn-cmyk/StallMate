# P0 — PRODUCTION R2 + BILLING PREPARATION REVIEW (DEV → Room 00)

> **HOLD-1 CORRECTED (2026-09-10).** Room 00 Artifact Verification HOLD-1: แพ็กเกจยังไม่ถูก push เข้า branch + deploy artifact ยังไม่ reproducible. แก้แล้ว — ดู **"HOLD-1 CORRECTED — 14-item map"** ท้ายเอกสาร และ **commit runbook** (`p0_prod_r2_commit_runbook.md`). ไฟล์ deploy ใช้ชื่อ repo-มาตรฐาน: `firebase.production.json`, `.firebaserc`, `ensure_prod_target_9caac.sh`, `verify_prod_functions_sha.sh`, `security/p0/functions/{index.js, p0_r2_owner_binding.js, package.json}` (handler **tracked** ไม่ gitignore). ยังไม่เปิด Blaze / ไม่เปลี่ยน billing / ไม่ deploy / ไม่แตะ production.


**วันที่:** 10 ก.ย. 2026 · **สถานะ:** PREPARATION ONLY — NO MUTATION · ยังไม่เปิด Blaze production · ยังไม่ deploy · ยังไม่แตะ data
**Room 00 authorization:** "PRODUCTION R2 + BILLING PREPARATION REVIEW — AUTHORIZED PREPARATION ONLY — NO MUTATION"
**ลำดับที่ต้องเดิน (ยังไม่ข้าม):** รีวิวแพ็กเกจนี้ → June อนุมัติค่าใช้จ่ายชัดเจน → เปิด Blaze **เฉพาะ production** (ยังไม่ deploy) → ตรวจ billing isolation → ขอ **R2 Deploy Gate แยกต่างหาก**
**ห้ามรวม** "เปิด Blaze + Deploy Function" เป็นคำสั่งเดียว

---

## 1. Target ที่ถูกต้อง (project + Google account)

- **Production project:** `stallmate-9caac` (region `asia-southeast1`)
- **Production Google account:** `pkorn1968@gmail.com` (ป ประทีป ลำปาง / owner ของ 9caac)
- **Staging (คนละใบ):** `stallmate-staging-2026-5f39f` ใต้บัญชี `feelgood2511@gmail.com`
- ก่อนคำสั่งใด ๆ ต้องยืนยัน `firebase projects:list` แสดง 9caac และ `gcloud config get account` = pkorn1968 — ถ้าไม่ตรง **abort**

## 2. Billing แยกจาก staging + ยังไม่ถูกเปลี่ยน (หลักฐาน ณ prep)

- staging เปิด Blaze แล้วบนบัญชี feelgood2511 (billing account คนละใบ) — หลักฐานเดิม `p0_blaze_billing_isolation_evidence.md`
- production 9caac **ยังเป็น Spark ณ ตอนนี้** (ยังไม่เปิด Blaze) → นี่คือสภาพ "ยังไม่ถูกเปลี่ยน" ที่ต้องบันทึกก่อนเปิด
- **หลักฐาน billing isolation ตัวจริง** จะเก็บ *ตอนเปิด Blaze production* (ขั้นถัดไป หลัง June อนุมัติค่าใช้จ่าย): screenshot billing account ID ของ 9caac ≠ ของ staging, และ project แต่ละใบ map คนละ billing account — เก็บเป็น `p0_prod_billing_isolation_evidence.md` แยก
- ณ prep นี้ **ยังไม่แตะ billing** — แค่ยืนยันสถานะเริ่มต้น = production ยัง Spark, staging Blaze แยกใบ

## 3. Cost estimate + cost guard

**Cost guard (ยืนยันในซอร์สฟังก์ชัน `p0_functions_index.js` SHA `ab88abb9…`):**

- `maxInstances = 1` · `concurrency = 1` · `timeoutSeconds = 30` · region `asia-southeast1`
- ผล: ต่อให้ถูกยิงถล่ม ก็รันได้ทีละ 1 instance × 1 request → เพดาน compute ถูกล็อกเชิงโครงสร้าง ไม่ auto-scale

**ประมาณการค่าใช้จ่าย R2 (bindOwner):**

- bindOwner ถูกเรียก *เฉพาะตอน bind เครื่อง owner* (ครั้งเดียวต่อเครื่อง) — ปริมาณจริงระดับ **หลักหน่วย–สิบครั้ง** ตลอด rollout SOLO (2 ร้าน, ไม่กี่เครื่อง)
- 2nd-gen function invocation + compute ระดับนี้ = **อยู่ใน free tier ทั้งหมด (~0฿/เดือน)**
- Blaze เปิดเพื่อ "ปลดล็อกให้ deploy 2nd-gen function ได้" ไม่ใช่เพราะปริมาณเกิน Spark — ค่าใช้จ่ายคาดหมาย ≈ 0฿ ตราบใดที่ยังไม่มี traffic นอกเหนือ bind
- ความเสี่ยงค่าใช้จ่ายบานปลายถูกกันด้วย maxInstances=1 + Budget Alert (ข้อ 4)

## 4. Budget Alert = แจ้งเตือนอย่างเดียว (ไม่ใช่ hard cap)

- ตั้ง Cloud Billing Budget บน 9caac เช่น **1 USD/เดือน** → ส่งอีเมลเตือนที่ 50/90/100%
- **สำคัญ:** Budget Alert ของ GCP **ไม่ตัดบริการ** — เป็น notify-only เท่านั้น การป้องกันค่าใช้จ่ายจริงมาจาก `maxInstances=1` (ข้อ 3) ไม่ใช่จาก budget
- ตั้ง budget = ขั้นตอนหลังเปิด Blaze (ยังไม่ทำใน prep) — ระบุไว้ให้ Room 00 เห็นแผน

## 5. Secret Manager binding ของ OWNER_BIND_SECRET (ไม่โชว์ค่า secret)

- ฟังก์ชันผูก secret ผ่าน `defineSecret('OWNER_BIND_SECRET')` (2nd-gen) — ค่าอยู่ใน Secret Manager ของ 9caac ไม่ฝังในโค้ด
- ขั้น set (หลัง Blaze, ก่อน deploy): `printf '%s' '<ค่า>' | firebase functions:secrets:set OWNER_BIND_SECRET --data-file - --project prod`
  - ใช้ `printf '%s'` กัน trailing newline (เคยทำให้ bad_signature ตอน staging)
  - **ค่า secret จะไม่ถูกแสดงในแพ็กเกจนี้และไม่ถูก echo** — June พิมพ์เอง
- ยืนยันว่าผูกแล้ว (ไม่เปิดเผยค่า): `firebase functions:secrets:get OWNER_BIND_SECRET --project prod` แสดง version/metadata เท่านั้น
- **production secret เป็นค่าใหม่แยกจาก staging** — ไม่ reuse secret ข้ามใบ

## 6. Production Firebase config + fail-closed guard

- **config:** `p0_prod_firebase.json` (SHA `09425fa5…`) — `functions.source="functions"`, runtime nodejs20, **ไม่มี database/hosting** (production Rules เป็น gate แยกทีหลัง)
- **alias:** `.firebaserc` (`p0_prod_firebaserc.json` SHA `58d93dcb…`) — `prod → stallmate-9caac`
- **guard:** `p0_prod_ensure_9caac_guard.sh` (SHA `e21db2f8…`) — fail-closed *ตรงข้ามกับ staging guard*: staging guard ปฏิเสธถ้าเจอ production; **prod guard ปฏิเสธทุกอย่างที่ไม่ใช่ 9caac** (staging id / emulator / demo-* / alias ไม่ตรง → exit≠0)
- ต้องรัน guard ผ่านก่อนทุกคำสั่ง deploy — ไม่ผ่าน = ไม่ deploy

## 7. Deploy command = functions:bindOwner เท่านั้น

```
firebase deploy --only functions:bindOwner --project prod --config firebase.prod.json
```

- `--only functions:bindOwner` เท่านั้น → **ไม่แตะ** Rules / Hosting / ฟังก์ชันอื่น / client
- ยังไม่รันใน prep นี้ — เก็บไว้รันใน **R2 Deploy Gate** หลัง Room 00 อนุมัติแยก

## 8. SHA manifest (config / function source / rollback / candidate)

ดู `p0_prod_r2_sha_manifest.json`. สรุป (sha256 16 ตัวแรก):

| artifact | ไฟล์ | sha256(16) |
|---|---|---|
| guard ensure-9caac | p0_prod_ensure_9caac_guard.sh | `e21db2f8c82324b4` |
| prod deploy config | p0_prod_firebase.json | `09425fa529b1b249` |
| prod alias | p0_prod_firebaserc.json | `58d93dcbfa83097a` |
| post-deploy smoke | p0_prod_r2_postdeploy_smoke.js | `ca99dab8ee372fb2` |
| function source (bindOwner) | p0_functions_index.js | `ab88abb9705f359a` |
| candidate client | stallmate_v7.9.8.15-rc.1.html | `97ba2ffcfa5a08a9` |
| auth layer | p0_v79815rc1_auth_layer.js | `febd82bae731a1a0` |
| provenance | p0_v79815rc1_provenance.json | `cab7d5cbaaf79185` |

June รัน `sha256sum` ก่อน deploy เพื่อยืนยัน digest เต็มตรงกับตาราง

## 9. Function rollback command (ระบุ region + non-interactive confirm)

- R2 ไม่มี bindOwner เดิมใน production มาก่อน → **rollback = ลบฟังก์ชัน** (กลับสู่สภาพไม่มีฟังก์ชัน) ไม่ใช่ redeploy ตัวเก่า

```
firebase functions:delete bindOwner --region asia-southeast1 --project prod --force
```

- ระบุ `--region asia-southeast1` ชัดเจน · `--force` = non-interactive confirm
- ผลของ rollback: production กลับไปสภาพก่อน R2 (client candidate ยังไม่ deploy อยู่แล้ว → ระบบเดิมทำงานปกติ ไม่กระทบ)

## 10. Post-deploy synthetic smoke + cleanup + cost/usage inspection plan

- `p0_prod_r2_postdeploy_smoke.js` (SHA `ca99dab8…`) — **synthetic เท่านั้น**:
  - room = `SMOKEPROD<rand>` (abort ถ้าชนกับ BBMANN), unique nonce/claimId ต่อรัน
  - เทสต์ accept → replay-reject (single-use) บนฟังก์ชันที่ deploy จริง
  - **cleanup** ลบทุก synthetic node ที่สร้าง (roomOwners/SMOKEPROD*, claims/*, audit) — **ไม่แตะ BBMANN**
  - abort ถ้า project ≠ stallmate-9caac
- **Cost/usage inspection หลัง smoke:** ดู Cloud Functions metrics (invocation count ควร = จำนวน call ของ smoke), Secret Manager access count, และ Billing report ยืนยัน ≈ 0฿ / อยู่ใน free tier
- secret + SA key อ่านจาก env ไม่ถูก print

## 11. Stop conditions (abort ทันที)

Abort ถ้าเจอข้อใดข้อหนึ่งก่อน/ระหว่าง deploy:

- **target mismatch:** project ≠ `stallmate-9caac` หรือ account ≠ pkorn1968
- **billing mismatch:** 9caac ยังไม่เปิด Blaze หรือ billing account ไปชนกับ staging
- **secret mismatch:** OWNER_BIND_SECRET ไม่ถูกผูก / version ผิด / (ถ้า verify แล้ว) signature ไม่ผ่าน
- **region mismatch:** region ≠ asia-southeast1
- **SHA mismatch:** function source / config / candidate digest ไม่ตรง manifest ข้อ 8
- guard `p0_prod_ensure_9caac_guard.sh` exit≠0 → หยุด

## 12. ยืนยันสิ่งที่ยังไม่ถูกแตะ

- **.13 / .14 baseline:** `v7.9.8.14` = `d806e672` (frozen) — ไม่ถูกแก้
- **origin/main:** `83b2ca7` (frozen) — ไม่ merge, ไม่แก้
- **production RTDB Rules:** ไม่ถูกแตะ (R2 deploy functions เท่านั้น; Rules เป็น gate แยก)
- **production client:** candidate `v7.9.8.15-rc.1` **ยังไม่ deploy** — production ยังเสิร์ฟตัวเดิม

---

## STILL HOLD (ยังไม่อนุมัติ — รอ gate แยกทั้งหมด)

production Blaze activation · production Function deploy · production client deploy · live owner binding · production Rules deploy · production data mutation · merge main · M3

---

## HOLD-1 CORRECTED — 14-item map (Room 00 Artifact Verification)

1. **Full commit SHA + parent** — ให้หลัง June commit+push (ดู `p0_prod_r2_commit_runbook.md`); return จะกรอก `<new_sha>` + parent `30dc074`.
2. **firebase.production.json — functions:bindOwner only** — `security/p0/prod/firebase.production.json` SHA `f31887ab…`; deploy ใช้ `--only functions:bindOwner`; ไม่มี db/hosting/ฟังก์ชันอื่น.
3. **production exact-target guard** — `ensure_prod_target_9caac.sh` SHA `83baf031…`: PASS เฉพาะ `stallmate-9caac`; staging/emulator/unknown/empty = FAIL (ผลจริงใน `p0_prod_r2_guard_results.txt`).
4. **deployable p0_r2_owner_binding.js + SHA** — **tracked** ที่ `security/p0/functions/p0_r2_owner_binding.js` SHA `084f93cecc59b655…` (แก้ HOLD-1: เลิก build-copy/gitignore); `verify_prod_functions_sha.sh` (SHA `25762bbd…`) fail-closed ถ้า handler หาย/ถูกแก้.
5. **maxInstances=1 / concurrency=1 / timeout=30** — ยืนยันใน `security/p0/functions/index.js` SHA `3e3cd662…`.
6. **region asia-southeast1** — เดียวกัน (explicit ใน onCall).
7. **Secret Manager binding proof; no secret value** — `defineSecret('OWNER_BIND_SECRET')` + `.value()` runtime; set ผ่าน `firebase functions:secrets:set` (June พิมพ์ค่าเอง); verify ด้วย `functions:secrets:get` (แสดง metadata/version ไม่แสดงค่า). **ค่าไม่ปรากฏที่ใดในแพ็กเกจ.**
8. **billing-isolation evidence (redacted ok)** — production `stallmate-9caac`/บัญชี pkorn1968 ยัง **Spark**; staging Blaze คนละบัญชี (feelgood2511, billing `017D1F-…` redacted). หลักฐานภาพจริงเก็บ *ตอนเปิด Blaze production* (ขั้นถัดไป) เป็น `p0_prod_billing_isolation_evidence.md`.
9. **budget alert NOT a hard cap** — GCP Budget = notify-only (50/90/100%) ไม่ตัดบริการ; การกันค่าใช้จ่ายจริง = `maxInstances=1`.
10. **exact deploy + rollback** —
    - deploy: `firebase deploy --only functions:bindOwner --project prod --config security/p0/prod/firebase.production.json`
    - rollback: `firebase functions:delete bindOwner --region asia-southeast1 --project prod --force`
11. **production synthetic smoke + cleanup** — `p0_prod_r2_postdeploy_smoke.js` SHA `ca99dab8…`: room `SMOKEPROD*` (abort ถ้าชน BBMANN), accept→replay-reject, cleanup ลบทุก synthetic node, abort ถ้า project≠9caac.
12. **SHA manifest + negative guard results** — `p0_prod_r2_sha_manifest.json` + `p0_prod_r2_guard_results.txt` (target guard 1 PASS/6 FAIL; reproducibility guard 1 PASS/2 FAIL).
13. **confirm no Blaze/billing/deploy/production mutation** — ยืนยัน: ไม่เปิด Blaze, ไม่เปลี่ยน billing, ไม่ deploy, ไม่แตะ production data/rules/client. เอกสารเก่า `p0_93_billing_preflight.md` (maxInstances 3–5, redeemLicense) ถูก mark **SUPERSEDED**.
14. **origin/main + frozen .13/.14 unchanged** — origin/main `83b2ca7`; baseline `v7.9.8.14` `d806e672` — ไม่ถูกแตะ (การแก้อยู่บน branch `security/p0-containment` เท่านั้น).

---

## Return → Room 00

**SECURITY P0 — PRODUCTION R2 + BILLING PREPARATION REVIEW COMPLETE (PREPARATION ONLY — NO MUTATION).**
แพ็กเกจครบ 12 ข้อ: target 9caac/pkorn1968 · billing isolation (production ยัง Spark, staging Blaze แยกใบ; หลักฐานจริงเก็บตอนเปิด Blaze) · cost ≈0฿ + guard maxInstances1/concurrency1/timeout30/asia-southeast1 · Budget Alert notify-only · secret ผูกผ่าน Secret Manager (ไม่โชว์ค่า) · prod config + fail-closed ensure-9caac guard · deploy `--only functions:bindOwner` เท่านั้น · SHA manifest ครบ · rollback = functions:delete --region asia-southeast1 --force · synthetic post-deploy smoke + cleanup (ไม่แตะ BBMANN) + cost inspection · stop conditions ครบ · ยืนยัน .13/.14 + origin/main 83b2ca7 + production Rules + production client ไม่ถูกแตะ.
**ขอลำดับถัดไป:** June อนุมัติค่าใช้จ่าย → เปิด Blaze production (ไม่ deploy) → เก็บ billing isolation evidence → ขอ **R2 Deploy Gate แยก**. ไม่รวมเปิด Blaze+deploy เป็นคำสั่งเดียว.

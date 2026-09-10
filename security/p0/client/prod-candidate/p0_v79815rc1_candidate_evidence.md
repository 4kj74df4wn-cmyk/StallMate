# P0 — v7.9.8.15-rc.1 PRODUCTION CLIENT CANDIDATE — VERSION CORRECTED — EVIDENCE

**วันที่:** 10 ก.ย. 2026 · **Room 00:** VERSION PROVENANCE CORRECTION + candidate reissue · **สถานะ:** `READY_FOR_ROOM00_CODE_REVIEW`
**ห้าม:** production deploy · Blaze/billing · Function deploy · live binding · Rules deploy · merge main · M3 · production mutation

## 1. Authoritative version lineage
| | version | SHA |
|---|---|---|
| previous frozen | `v7.9.8.13` | `523df939…` |
| **authoritative baseline** | `v7.9.8.14` | `d806e672b4409bbefb4f0b57980580720e291f69c268c8b74d08834a7f227a11` |
| **Security P0 candidate (นี้)** | `v7.9.8.15-rc.1` | `97ba2ffcfa5a08a9645648799e8c20fc69351fdc5ddcceaa471edf3fc29215e4` |
| intended prod release (หลังทุก gate ผ่าน) | `v7.9.8.15` | (ยังไม่มี) |
| **reserved future feature** | `v7.9.9` | (สงวนไว้ ห้ามใช้กับงาน P0 นี้) |
> candidate = **additive Security-P0 hardening จาก `.14`** ไม่ใช่ feature ใหม่ · `v7.9.9` สงวนไว้ feature release หลัง P0 + production stabilization · ก่อนหน้านี้ candidate ถูกตั้งชื่อกำกวมเป็น v7.9.9 (SHA `fe38853a`, commit `2955f56`) — รอบนี้แก้ version identity ให้ถูก (ไม่ได้เปลี่ยน logic)

## 2. Source provenance (พิสูจน์)
1. สร้างแบบ **additive จาก frozen v7.9.8.14** (build script + baseline-SHA guard) ✓
2. baseline SHA = `d806e672…` (ตรง) — **baseline-SHA guard fail-closed** (ถ้า source ≠ .14 → build abort exit 9; negative test FIRED) ✓
3. ไม่ได้เริ่มจาก .13/7.9.7/7.9.8 เก่า/ไฟล์อื่น — build อ่าน baseline เดียว + assert SHA ✓
4. main app + **11 protected fns byte-identical** (protected-scope OK) ✓
5. frozen .13/.14 ไม่ถูกแก้ (.14 = `d806e672` unchanged) ✓
6. `origin/main = 83b2ca7e1055378177f8a39509e4d7fc6501422f` ไม่เปลี่ยน ✓
7. ไม่มี cherry-pick/รวมโค้ดนอกขอบเขต P0 (candidate = .14 + auth-compat tag + APP_VERSION + auth-layer block เท่านั้น) ✓

## 3. Version metadata correction (candidate artifacts เท่านั้น)
`v7.9.9` → **`v7.9.8.15-rc.1`** ที่: internal `APP_VERSION='v7.9.8.15-rc.1'` · auth-layer `AUTH_BUILD='7.9.8.15-rc.1'` · diagnostics/banner · **appVersion telemetry** (`readiness/audit/{deviceId}`) · smoke assertion · provenance manifest · evidence/README/runbook · device-inventory expected version · rollback docs · **ไม่แตะ** frozen builds/historical records/ข้อความที่ระบุ `v7.9.9 = reserved` · browser-title-no-version policy คงไว้ (diagnostics + telemetry รายงาน v7.9.8.15-rc.1 ชัดเจน)

## 4. SHA handling
- old candidate (v7.9.9 metadata): `fe38853a…` / commit `2955f56` — **ไม่ใช่** SHA ของ candidate ใหม่
- **new candidate SHA:** `97ba2ffcfa5a08a9645648799e8c20fc69351fdc5ddcceaa471edf3fc29215e4`
- baseline SHA: `d806e672…` · parent commit: `2955f56` · new commit SHA: (June push แล้วเติม)
- **changed-file list (version correction round):** candidate HTML (v7.9.9→v7.9.8.15-rc.1 metadata + rename) · auth_layer (`AUTH_BUILD`) · smoke (assertion/marker/filename) · + new: provenance.json · verify_result · harness/README (version) · evidence
- **proof logic ไม่เปลี่ยนโดยไม่ตั้งใจ:** protected-scope OK (11 fns byte-identical) + M2 209/209 + M0/M1 95/95 + jsdom 14/14 เหมือนก่อนแก้ version (เปลี่ยนเฉพาะ version strings)

## 5. Provenance manifest (machine-readable) — `p0_v79815rc1_provenance.json`
`baselineVersion=v7.9.8.14` · `candidateVersion=v7.9.8.15-rc.1` · `baselineSha256=d806e672…` · `candidateSha256=97ba2ffc…` · `releaseChannel=production-candidate` · `parentCommit=2955f56` · `productionProjectId=stallmate-9caac` · `deploymentStatus=NOT_DEPLOYED` · `rulesStatus=NOT_DEPLOYED` · `frozenArtifactsUnchanged=true` · **validator FAIL** ถ้า projectId เป็น staging/emulator/unknown (negative test FIRED)

## 6. Security capabilities (คงครบตาม review)
config allowlist `stallmate-9caac` เท่านั้น · reject staging/emulator/unknown · R1 auth controller · deterministic financial writer · OPID_CONFLICT surfaced + quarantine + **no auto-retry** · original record unchanged · §E telemetry (bound/seen/appVersion) · **no embedded secret** · **no direct client write to roomOwners** · owner binding ผ่าน callable เท่านั้น · prod R2 Function dependency ระบุชัด · two-phase rollback · canary safeguards · no production mutation

## 7. Legacy fallback safety (10 ข้อ — jsdom 14/14)
(1) explicit PRE_BINDING เท่านั้น (bound===false) (2) auth error ไม่เปิด legacy (3) network error ไม่เปิด (4) callable failure ไม่เปิด → ทุกกรณี error/indeterminate = **queue** (5) bound → legacy ปิด (permanent latch) (6) ทุก fallback มี telemetry (`fallbackCount`) (7) หลัง Rules B bypass ไม่ได้ (bound⇒latch + Rules deny) (8) write failure → queue ยอดไม่หาย/ไม่เปลี่ยน (9) **ทุก internal sale-write ผ่าน guarded writer** (updateSaleInFirebase + pushToFirebase import/restore) (10) ไม่มีเส้นทางเก่าเรียก unguarded writer ตรง

## 8. Verification (sandbox node v22) — ผล
syntax OK (2 blocks) · **M2 209/209** · **M0/M1 95/95** · **protected-scope OK (11 fns)** · **jsdom hardened integration smoke 14/14** · baseline-SHA negative FIRED · wrong-project/staging/emulator rejection FIRED · manifest VALID (+staging→reject) · frozen .13/.14 unchanged · origin/main unchanged · ผลเต็ม: `p0_v79815rc1_verify_result.txt`
**Full-Chromium 12-point smoke:** harness `p0_v79815rc1_fullchromium_harness.html` + runbook (emulator, project-spoof 9caac, ไม่แตะ production) — HQ sandbox arm64 รัน Chromium ไม่ได้ → June/CI รัน click-through (เหมือน SR1); jsdom 14/14 = HQ automated coverage ของ logic ทั้ง 12 จุด

## 9. Two-phase rollback (PREPARED, ห้าม execute)
**A. ก่อน production Rules B:** rollback client = republish `.14` (`d806e672`):
`cp stallmate_v7.9.8.14.html <ghpages>/index.html && git commit -m "rollback client to v7.9.8.14" && git push` · abort-if: sha(index)≠d806e672 หลัง publish
**B. หลัง production Rules B:** `.14` ไม่มี Auth → **ห้าม** rollback client อย่างเดียว · ลำดับบังคับ: (1) rollback **Rules** ก่อน → `firebase deploy --only database --project stallmate-9caac --config <prod firebase.rollback.json → database.rules.forwardfix.json (a297d2f9…)>` (verify SHA ก่อน) (2) **แล้วจึง** rollback client เป็น .14 ถ้าจำเป็น · abort-if: rules SHA ไม่ตรง / target ≠ stallmate-9caac / guard fail

## 10. Authorization / HOLD
AUTHORIZED: version provenance correction · reissue v7.9.8.15-rc.1 · local/jsdom/emulator/Full-Chromium verify (ไม่แตะ production) · เตรียม evidence+commands
**NOT AUTHORIZED / คง HOLD:** production Blaze · billing · Function deploy · client deploy · live binding · Rules deploy · production mutation · merge main · M3
> `v7.9.8.15` จะประกาศเป็น production release ได้ก็ต่อเมื่อ prod Function + device inventory + canary + Rules + final production verification ผ่าน gate ครบทุกด่าน

## Files (commit → `security/p0/client/prod-candidate/`, แทนที่ชุด v7.9.9 เดิม)
`stallmate_v7.9.8.15-rc.1.html` (`97ba2ffc…`) · `p0_v79815rc1_auth_layer.js` (`febd82ba…`) · `p0_v79815rc1_candidate_smoke.js` (`1f8a0384…`) · `p0_v79815rc1_build_candidate.js` · `p0_v79815rc1_verify_result.txt` (`e72c9274…`) · `p0_v79815rc1_provenance.json` (`cab7d5cb…`) · `p0_v79815rc1_fullchromium_harness.html` (`4578ab0e…`) · `p0_v799_fullchromium_README.md` (version-updated) · `p0_v79815rc1_candidate_evidence.md`

# SECURITY P0 PHASE 2A — §9.2 STAGING ISOLATION — DURABLE EVIDENCE

**Status:** Room 00 §9.2 PASS. This document records the execution output (Room 00 item 12: commit 85ee6c contained tooling only). No secrets, no production data.
**Date:** 3 Sep 2026 · **Executed by:** June (Claude Code / Terminal), CLI account `STAGING_ACCOUNT`.

## 1. Dedicated staging project (≠ production)
`firebase projects:list` (account STAGING_ACCOUNT):
```
Project Display Name    Project ID                     Project Number   Resource Location ID
stallmate-staging-2026  stallmate-staging-2026-5f39f    795209858161     [Not specified]
1 project(s) total.
```
- Staging project id: **`stallmate-staging-2026-5f39f`** — differs from production **`stallmate-9caac`**.
- Account isolation: staging is under **STAGING_ACCOUNT**; production `stallmate-9caac` is under **PROD_ACCOUNT**. The working CLI account (STAGING_ACCOUNT) has **no access to production** — `projects:list` returns only staging. Production is not reachable by the staging account by design.

## 2. Isolated local alias (production alias untouched)
`security/p0/staging/.firebaserc`:
```json
{ "projects": { "staging": "stallmate-staging-2026-5f39f", "default": "demo-stallmate-staging" } }
```
- Default alias = **`demo-stallmate-staging`** (`demo-*` is offline-only in firebase-tools — cannot connect to any real Google backend).
- Production id `stallmate-9caac` is **absent** from this file.
- `firebase use` active alias: `default (demo-stallmate-staging)`.

## 3. Guard proof — commands cannot target production
`./guard_no_prod.sh`:
```
✅ default alias 'demo-stallmate-staging' is demo-* (emulator-only, cannot reach production)
✅ GUARD OK: no reference to production (stallmate-9caac) detected.
```
`./guard_no_prod.sh stallmate-9caac`:
```
❌ GUARD BLOCKED: production id 'stallmate-9caac' passed as argument
exit=2
```

## 4. Constraints honored
Synthetic fixtures only · no production data copied/exported · no Auth/Rules/Functions/Hosting deployed · `origin/main` = `83b2ca7e1055378177f8a39509e4d7fc6501422f` unchanged · tooling committed at `85ee6c079ca2115605a599db24c07d6a32bad233` on `security/p0-containment`.

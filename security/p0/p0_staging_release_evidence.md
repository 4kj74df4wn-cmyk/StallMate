# SECURITY P0 — STAGING RELEASE-PACKAGE PREPARATION — EVIDENCE (NOT EXECUTED)

**Authorization:** Room 00 — authorized *local staging release-package preparation only*. **Blaze NOT authorized. No billing activated. Nothing deployed.** Awaiting `BLAZE ACTIVATION — STAGING PROJECT ONLY AUTHORIZED`.
**Date:** 5 Sep 2026.

## What was prepared (deployable, unused)
- **Cloud Function wrapper** `functions/index.js` — callable `bindOwner` (2nd-gen, region `asia-southeast1`, `maxInstances:5`) wrapping the reviewed R2 handler; secret `OWNER_BIND_SECRET` injected via secret manager at deploy (never in source/repo). `node --check` = **SYNTAX OK**.
- **`functions/package.json`** — Node 20, firebase-functions ^5 / firebase-admin ^12 (valid JSON).
- **Staging deploy config** `staging/firebase.staging.json` — functions + database rules; `--project staging` only; production id absent.
- **Staging release runbook** `p0_staging_release_runbook.md` — SR1 (client) → SR2 (Function, needs Blaze) → SR3 (tighten Rules B after §E gate), each independently reversible with precondition / deploy command / verify / rollback / monitoring; STAGING ONLY; production never targeted; guard_no_prod before each. Handler is copied into `functions/` at deploy (build step, gitignored) — no committed duplicate.

## Constraints honored
- No Blaze activation · no billing · no deploy · no live binding · no production mutation · no merge main · no M3.
- Production `stallmate-9caac` never referenced; staging `stallmate-staging-2026-5f39f` only.
- Frozen `.14 d806e672…` / `.13 523df939…` unchanged; Rules B unchanged; `origin/main` `83b2ca7…` unchanged.
- All R1/R2/R3 local suites remain green (R1 24/24 · R2 30/30 · R3 20/20 · Rules 213/213 · M2 209/209 · M0/M1 95/95).

## Files (committed under `security/p0/`)
`functions/index.js` · `functions/package.json` · `staging/firebase.staging.json` · `p0_staging_release_runbook.md` · this doc · `p0_staging_release_SHA256_manifest.txt`.

**Return:** SECURITY P0 STAGING RELEASE-PACKAGE PREPARED — READY_FOR_ROOM00 (awaiting Blaze authorization)

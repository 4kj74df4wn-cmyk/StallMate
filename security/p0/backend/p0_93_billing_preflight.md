# SECURITY P0 §9.3 — BILLING PREFLIGHT (DOCUMENT ONLY — Blaze NOT activated)

**Authorization:** Room 00 — §9.3 PREFLIGHT ONLY. **Do NOT activate or upgrade Blaze.** No deploy, no live binding.
**Date:** 3 Sep 2026.

## 1. Current Firebase plans + billing isolation
| Project | Purpose | Account (label) | Plan (to confirm) | Billing |
|---|---|---|---|---|
| `stallmate-9caac` (prod, asia-southeast1) | production | PROD_ACCOUNT | Spark (current) — June to confirm | none until Blaze |
| `stallmate-staging-2026-5f39f` (staging) | R2/R3 testing | STAGING_ACCOUNT | Spark (free) | none |
- **Isolation:** staging and production are **different projects under different Google accounts** → separate billing scopes; the staging account cannot see/charge production. No shared billing account is required for R2 local work (emulator only).
- R2 was validated **entirely on emulators** (RTDB + Auth); **no Blaze needed for R2 LOCAL**. Blaze is required only when a Cloud Function is actually **deployed** (a later, separately gated step).

## 2. Functions runtime + region (proposed, not deployed)
- **Runtime:** Node.js 20 (2nd-gen Cloud Functions) — LTS, supported.
- **Region:** `asia-southeast1` — **must match** the RTDB location of `stallmate-9caac` (asia-southeast1) to minimize latency and avoid cross-region egress.
- Functions in scope (future deploy): `bindOwner` (owner binding), `redeemLicense` (R4). Both callable/HTTPS, Admin SDK.

## 3. Expected cost / quotas / maxInstances / rollback
- **Cost estimate:** owner-binding is a **rare** operation (≈ once per shop onboarding) and license redemption is low-volume. Expected monthly invocations are far below the Blaze **free-tier allotment** (2M invocations, 400K GB-s, 200K CPU-s). **Expected incremental cost ≈ $0**; only egress/Cloud Build for deploys are marginal.
- **maxInstances:** set a **low cap (e.g., 3–5)** per function to bound cost and prevent runaway scaling; concurrency low. minInstances = 0 (no idle cost).
- **Quotas:** default Cloud Functions quotas are ample for this volume; no quota increase needed.
- **Rollback:** disabling/deleting the Function reverts to "no backend" — clients can no longer bind (existing `roomOwners` bindings persist untouched). Rules rollback is independent (Rules B / last-known-secure per HOLD-2 §H). Client rollback = ship prior client (R1 reversible).

## 4. Budget alerts are NOT hard spending caps (explicit)
- GCP **budget alerts only notify** (email/pub-sub) at thresholds; **they do NOT stop or cap spending.** Spending continues past an alert.
- A true hard cap requires an **explicit kill-switch** (e.g., a Cloud Function subscribed to the budget Pub/Sub topic that programmatically **disables billing** on breach) — optional, to be decided before deploy. Without it, cost control relies on `maxInstances` + low invocation volume + monitoring.

## 5. Preflight status
- **Blaze NOT activated / NOT upgraded.** This document records the plan only.
- June to confirm: production project current plan, and whether a hard-cap kill-switch is wanted before any Function deploy.
- **No production mutation · no Firebase deploy · no live owner binding · no merge main · no M3.**

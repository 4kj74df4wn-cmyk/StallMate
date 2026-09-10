/**
 * StallMate P0 — PRODUCTION Cloud Functions entry (DEPLOYABLE, NOT YET DEPLOYED).
 * Repo path: security/p0/functions/index.js
 * Callable `bindOwner` wrapping the reviewed R2 owner-binding handler.
 *
 * NOT DEPLOYED. Gated on: Room 00 R2 Deploy Gate + production Blaze (separate gates).
 * Deploy target locked to stallmate-9caac by ensure_prod_target_9caac.sh (fail-closed).
 *
 * Reproducibility (Room 00 HOLD-1 fix):
 *  - p0_r2_owner_binding.js is a TRACKED sibling file in this directory (NOT build-copied, NOT gitignored).
 *  - verify_prod_functions_sha.sh checks handler+index SHA against reviewed bytes before deploy.
 *
 * Controls:
 *  - Secret via Firebase Secret Manager: defineSecret + onCall({secrets:[...]}) + .value() (NOT raw process.env).
 *  - Cost guard: maxInstances 1, concurrency 1, timeoutSeconds 30, region asia-southeast1 (explicit).
 *  - Only bindOwner is exported here. No redeemLicense in this round.
 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { createOwnerBindingHandler } = require('./p0_r2_owner_binding.js'); // TRACKED sibling (reviewed SHA-guarded)

admin.initializeApp();

// Secret Manager binding — value materialized only inside the Function at runtime, never in source/repo.
const OWNER_BIND_SECRET = defineSecret('OWNER_BIND_SECRET');

exports.bindOwner = onCall(
  {
    region: 'asia-southeast1',
    secrets: [OWNER_BIND_SECRET],
    maxInstances: 1,      // cost guard (authorized: 1)
    concurrency: 1,       // explicit
    timeoutSeconds: 30,   // explicit
  },
  async (request) => {
    const secret = OWNER_BIND_SECRET.value();
    if (!secret) throw new HttpsError('failed-precondition', 'owner-bind secret not configured');
    const handler = createOwnerBindingHandler({ db: admin.database(), secret, now: () => Date.now() });
    const context = { auth: request.auth ? {
      uid: request.auth.uid,
      token: { firebase: { sign_in_provider: request.auth.token && request.auth.token.firebase && request.auth.token.firebase.sign_in_provider } }
    } : null };
    const res = await handler.bindOwner(request.data || {}, context);
    if (!res.ok) throw new HttpsError('permission-denied', res.code || 'bind_denied');
    return res;
  }
);

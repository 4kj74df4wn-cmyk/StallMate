/**
 * StallMate P0 — Cloud Functions entry (DEPLOYABLE, NOT YET DEPLOYED). HOLD-1 CORRECTED.
 * Repo path (staging): security/p0/functions/index.js
 * Callable `bindOwner` wrapping the reviewed R2 owner-binding handler.
 *
 * NOT DEPLOYED. Gated on: Blaze activation (staging only) + Room 00 authorization.
 *
 * HOLD-1 fixes:
 *  - Secret via Firebase Secret Manager: defineSecret + onCall({secrets:[...]}) + .value() (NOT raw process.env).
 *  - Cost guard: maxInstances 1, concurrency 1, timeoutSeconds 30, region asia-southeast1 (explicit).
 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { createOwnerBindingHandler } = require('./p0_r2_owner_binding.js'); // build-copied at deploy (gitignored)

admin.initializeApp();

// Secret Manager binding — value materialized only inside the Function at runtime, never in source/repo.
const OWNER_BIND_SECRET = defineSecret('OWNER_BIND_SECRET');

exports.bindOwner = onCall(
  {
    region: 'asia-southeast1',
    secrets: [OWNER_BIND_SECRET],
    maxInstances: 1,      // cost guard (authorization: 1)
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

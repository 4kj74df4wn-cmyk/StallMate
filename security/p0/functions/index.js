/**
 * StallMate P0 — Cloud Functions entry (DEPLOYABLE, NOT YET DEPLOYED).
 * Repo path (staging): security/p0/functions/index.js
 * Wraps the reviewed R2 owner-binding handler as a callable Function (2nd-gen, region asia-southeast1).
 *
 * NOT DEPLOYED. Deploy is gated on: Blaze activation (staging) + Room 00 authorization (§9.3 / R2 release).
 * The HMAC claim secret is read from Functions config/secret (NEVER hardcoded, never committed).
 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { createOwnerBindingHandler } = require('./p0_r2_owner_binding.js'); // colocated copy at deploy time

admin.initializeApp();
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 5 }); // cost guard: bounded instances

// Secret is injected via environment/secret manager at deploy time — NEVER in source.
function bindingSecret(){
  const s = process.env.OWNER_BIND_SECRET;
  if (!s) throw new HttpsError('failed-precondition', 'owner-bind secret not configured');
  return s;
}

// callable: bindOwner({ roomCode, claimToken }) — context.auth provided by the verified caller.
exports.bindOwner = onCall(async (request) => {
  const handler = createOwnerBindingHandler({ db: admin.database(), secret: bindingSecret(), now: () => Date.now() });
  // adapt v2 onCall request -> handler contract (data + context.auth incl provider)
  const context = { auth: request.auth ? {
    uid: request.auth.uid,
    token: { firebase: { sign_in_provider: request.auth.token && request.auth.token.firebase && request.auth.token.firebase.sign_in_provider } }
  } : null };
  const res = await handler.bindOwner(request.data || {}, context);
  if (!res.ok) throw new HttpsError('permission-denied', res.code || 'bind_denied');
  return res;
});

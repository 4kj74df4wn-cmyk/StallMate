/**
 * StallMate P0 — PRODUCTION R2 post-deploy END-TO-END smoke (PREPARED, NOT RUN).
 * Runs ONLY after an authorized R2 Deploy Gate, against the deployed bindOwner callable
 * on stallmate-9caac, using a SYNTHETIC Auth user + SYNTHETIC room. NEVER touches BBMANN.
 *
 * Repo path: security/p0/evidence/p0_prod_r2_postdeploy_smoke.js
 * Handler:   security/p0/functions/p0_r2_owner_binding.js  (sibling ../functions — B1 fix)
 *
 * B2 (HOLD-3): SMOKE result and CLEANUP result are separate. If RTDB cleanup OR the
 * synthetic Auth-user deletion fails, the process exits NON-ZERO (cleanup errors are NOT
 * swallowed) and prints redacted synthetic identifiers for a manual sweep.
 *
 * Deps at gate time (reproducible): run  `npm ci`  in security/p0/functions using the
 * committed package-lock.json (do NOT `npm i` — that can drift dependencies).
 * Env (never printed):
 *   GCLOUD_PROJECT=stallmate-9caac
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/prod-sa-key.json  (downloaded at gate, deleted after)
 *   OWNER_BIND_SECRET=<value>                                 (to forge a valid signed claim)
 *   RTDB_URL=https://<db>.asia-southeast1.firebasedatabase.app
 *   FIREBASE_API_KEY=<prod web api key>                       (public web key, not a secret)
 *
 * Exit codes: 0 = SMOKE PASS + CLEANUP PASS · 1 = SMOKE FAIL · 4 = SMOKE PASS but CLEANUP FAIL · 3 = abort.
 */
'use strict';
const crypto = require('crypto');
const admin  = require('firebase-admin');
const { signClaim } = require('../functions/p0_r2_owner_binding.js'); // B1: correct cross-folder path

const PROJECT = process.env.GCLOUD_PROJECT || '';
const SECRET  = process.env.OWNER_BIND_SECRET || '';
const RTDB    = process.env.RTDB_URL || '';
const APIKEY  = process.env.FIREBASE_API_KEY || '';
const REGION  = 'asia-southeast1';

function abort(m){ console.error('SMOKE ABORT:', m); process.exit(3); }
if (PROJECT !== 'stallmate-9caac') abort('project != stallmate-9caac (got "'+PROJECT+'")');
if (!SECRET) abort('OWNER_BIND_SECRET not set (needed to forge test claim; never printed)');
if (!RTDB)   abort('RTDB_URL not set');
if (!APIKEY) abort('FIREBASE_API_KEY not set (public web key)');

const ROOM  = 'SMOKEPROD' + crypto.randomBytes(3).toString('hex').toUpperCase();
if (/BBMANN/i.test(ROOM)) abort('synthetic room collided with BBMANN — refuse');
const UID   = 'smoke-' + crypto.randomBytes(4).toString('hex');
const nonce = crypto.randomBytes(16).toString('hex');
const exp   = Date.now() + 60 * 1000;
const noncePrefix = nonce.slice(0, 6) + '…'; // redacted for manual-sweep reporting

admin.initializeApp({ credential: admin.credential.applicationDefault(), databaseURL: RTDB });
const adb = admin.database();

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithCustomToken, signOut } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');

let clientApp = null;
let smokePass = false;
const results = {};

(async () => {
  try {
    const customToken = await admin.auth().createCustomToken(UID);
    clientApp = initializeApp({ apiKey: APIKEY, projectId: PROJECT, databaseURL: RTDB, authDomain: PROJECT + '.firebaseapp.com' });
    const auth = getAuth(clientApp);
    const cred = await signInWithCustomToken(auth, customToken);
    if (cred.user.uid !== UID) throw new Error('sign-in uid mismatch');

    const claimToken = signClaim({ roomCode: ROOM, intendedUid: UID, nonce, exp }, SECRET);
    const fns  = getFunctions(clientApp, REGION);
    const call = httpsCallable(fns, 'bindOwner');

    const first = await call({ roomCode: ROOM, claimToken });
    results.first = first.data;
    const okFirst = first.data && first.data.ok === true && first.data.roomCode === ROOM && first.data.uid === UID;

    const ownerSnap = await adb.ref('roomOwners/' + ROOM).once('value');
    const usedSnap  = await adb.ref('ownerBindClaimsUsed/' + nonce).once('value');
    const rtdbOk = ownerSnap.val() === UID && usedSnap.exists();
    results.rtdb = { roomOwnerMatches: ownerSnap.val() === UID, nonceRecorded: usedSnap.exists() };

    let replayRejected = false;
    try { await call({ roomCode: ROOM, claimToken }); }
    catch (e) { replayRejected = /replayed|already/i.test((e && (e.message || e.code)) || ''); results.replayErr = e && (e.message || e.code); }
    results.replayRejected = replayRejected;

    smokePass = !!(okFirst && rtdbOk && replayRejected);
  } catch (e) {
    results.smokeError = e && (e.message || String(e));
    smokePass = false;
  } finally {
    // ---- CLEANUP (separate pass/fail; errors NOT swallowed) ----
    const problems = [];
    try { await adb.ref('roomOwners/' + ROOM).remove(); }
    catch (e) { problems.push('roomOwners: ' + (e && e.message)); }
    try { await adb.ref('ownerBindClaimsUsed/' + nonce).remove(); }
    catch (e) { problems.push('ownerBindClaimsUsed: ' + (e && e.message)); }
    try {
      const auditSnap = await adb.ref('ownerBindAudit').orderByChild('roomCode').equalTo(ROOM).once('value');
      const updates = {};
      auditSnap.forEach(ch => { updates['ownerBindAudit/' + ch.key] = null; });
      if (Object.keys(updates).length) await adb.ref().update(updates);
    } catch (e) { problems.push('ownerBindAudit: ' + (e && e.message)); }
    try { await admin.auth().deleteUser(UID); }               // B2: NOT swallowed
    catch (e) { problems.push('deleteUser: ' + (e && e.message)); }
    if (clientApp) { try { await signOut(getAuth(clientApp)); } catch (_) {} }

    const cleanupPass = problems.length === 0;

    console.log(JSON.stringify({ room: ROOM, uid: UID, noncePrefix, ...results }, null, 2));
    console.log('SMOKE '  + (smokePass  ? 'PASS' : 'FAIL'));
    console.log('CLEANUP ' + (cleanupPass ? 'PASS' : 'FAIL'));
    if (!cleanupPass) {
      console.error('CLEANUP FAIL — manual sweep needed for (redacted): room=' + ROOM +
        ' noncePrefix=' + noncePrefix + ' uid=' + UID);
      console.error('cleanup problems: ' + problems.join(' | '));
    }
    // exit: 0 only if BOTH pass; cleanup failure => non-zero even when smoke passed
    const code = (smokePass && cleanupPass) ? 0 : (smokePass ? 4 : 1);
    process.exit(code);
  }
})();

/**
 * StallMate P0 — PRODUCTION R2 post-deploy END-TO-END smoke (PREPARED, NOT RUN).
 * Runs ONLY after an authorized R2 Deploy Gate, against the deployed bindOwner callable
 * on stallmate-9caac, using a SYNTHETIC Auth user + SYNTHETIC room. NEVER touches BBMANN.
 *
 * B2 fixes (Room 00 HOLD-2): authenticates a real synthetic Firebase user, calls the real
 * httpsCallable, verifies real RTDB writes (roomOwners + ownerBindClaimsUsed), and performs
 * REAL cleanup in finally (deletes synthetic RTDB nodes + audit + the synthetic Auth user).
 *
 * Deps (install at gate time, functions dir or a scratch dir):
 *   npm i firebase-admin firebase
 * Env (never printed):
 *   GCLOUD_PROJECT=stallmate-9caac
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/prod-sa-key.json   (downloaded at gate, deleted after)
 *   OWNER_BIND_SECRET=<value>                                  (to forge a valid signed claim)
 *   RTDB_URL=https://<db>.asia-southeast1.firebasedatabase.app
 *   FIREBASE_API_KEY=<prod web api key>                        (public web key, not a secret)
 *
 * Uses signClaim() from the SAME reviewed handler so the claim format always matches backend.
 */
'use strict';
const crypto = require('crypto');
const admin  = require('firebase-admin');
const { signClaim } = require('./p0_r2_owner_binding.js'); // tracked sibling; identical claim format

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

admin.initializeApp({ credential: admin.credential.applicationDefault(), databaseURL: RTDB });
const adb = admin.database();
const claimIdShort = crypto.createHash('sha256').update(String(nonce)).digest('hex').slice(0, 16);

// firebase client (modular v9)
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithCustomToken, signOut } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');

let clientApp, results = {};
(async () => {
  try {
    // 1) synthetic Auth user (custom token => provider 'custom', not anonymous)
    const customToken = await admin.auth().createCustomToken(UID);
    clientApp = initializeApp({ apiKey: APIKEY, projectId: PROJECT, databaseURL: RTDB, authDomain: PROJECT + '.firebaseapp.com' });
    const auth = getAuth(clientApp);
    const cred = await signInWithCustomToken(auth, customToken);
    if (cred.user.uid !== UID) throw new Error('sign-in uid mismatch');

    // 2) valid signed claim (exact backend format via signClaim)
    const claimToken = signClaim({ roomCode: ROOM, intendedUid: UID, nonce, exp }, SECRET);

    // 3) call the REAL deployed callable
    const fns  = getFunctions(clientApp, REGION);
    const call = httpsCallable(fns, 'bindOwner');
    const first = await call({ roomCode: ROOM, claimToken });
    results.first = first.data;
    const okFirst = first.data && first.data.ok === true && first.data.roomCode === ROOM && first.data.uid === UID;

    // 4) verify REAL RTDB writes
    const ownerSnap = await adb.ref('roomOwners/' + ROOM).once('value');
    const usedSnap  = await adb.ref('ownerBindClaimsUsed/' + nonce).once('value');
    const rtdbOk = ownerSnap.val() === UID && usedSnap.exists();
    results.rtdb = { roomOwner: ownerSnap.val(), nonceUsed: usedSnap.exists() };

    // 5) replay must be rejected (single-use nonce)
    let replayRejected = false;
    try { await call({ roomCode: ROOM, claimToken }); }
    catch (e) { replayRejected = /replayed|already/i.test(e && (e.message || e.code) || ''); results.replayErr = e && (e.message || e.code); }
    results.replayRejected = replayRejected;

    const pass = okFirst && rtdbOk && replayRejected;
    results.pass = pass;
    console.log(JSON.stringify({ room: ROOM, uid: UID, claimIdShort, ...results }, null, 2));
    process.exitCode = pass ? 0 : 1;
  } catch (e) {
    console.error('SMOKE ERROR:', e && (e.message || String(e)));
    process.exitCode = 1;
  } finally {
    // 6) REAL cleanup — remove every synthetic node + audit + the synthetic Auth user
    try {
      await adb.ref('roomOwners/' + ROOM).remove();
      await adb.ref('ownerBindClaimsUsed/' + nonce).remove();
      const auditSnap = await adb.ref('ownerBindAudit').orderByChild('roomCode').equalTo(ROOM).once('value');
      const updates = {};
      auditSnap.forEach(ch => { updates['ownerBindAudit/' + ch.key] = null; });
      if (Object.keys(updates).length) await adb.ref().update(updates);
      await admin.auth().deleteUser(UID).catch(() => {});
      if (clientApp) { try { await signOut(getAuth(clientApp)); } catch (_) {} }
      console.log('CLEANUP OK: removed roomOwners/' + ROOM + ', ownerBindClaimsUsed/' + nonce + ', synthetic audit, synthetic user ' + UID + ' (BBMANN untouched)');
    } catch (ce) {
      console.error('CLEANUP WARNING (manual sweep may be needed):', ce && (ce.message || String(ce)), '| synthetic room=' + ROOM + ' nonce=' + nonce + ' uid=' + UID);
    }
    process.exit(process.exitCode || 0);
  }
})();

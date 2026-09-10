/**
 * StallMate P0 — SR3 POST-DEPLOY LIVE RULES SMOKE (Rules B enforced on staging).
 * Repo: security/p0/backend/p0_sr3_rules_smoke_live.js
 * DO NOT RUN until Rules B deployed to staging. Live staging: real Auth (synthetic identities) +
 * deployed bindOwner callable + real staging RTDB under Rules B. Redacted. Exit non-zero on any fail.
 * NO production data/secret. Synthetic rooms/users only. Admin (staging SA) used for cleanup + seeding-free.
 *
 * Env (NOT committed): STAGING_API_KEY, STAGING_AUTH_DOMAIN, STAGING_PROJECT_ID, STAGING_DATABASE_URL,
 *   OWNER_BIND_SECRET (out-of-band, same value as deployed function secret), GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Verifies Room 00 SR3 criteria under Rules B:
 *  - bound owner permitted paths ALLOW; owner read/write + legitimate recovery ALLOW
 *  - anonymous DENY; wrong-uid/non-owner authed DENY; unbound authed DENY
 *  - takeover/change roomOwners DENY; hard-delete salesRecord DENY; field-drop validate DENY
 *  - financial idempotency + original-record integrity preserved (deterministic writer + OPID_CONFLICT)
 */
'use strict';
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const { getDatabase, ref, get, set, runTransaction } = require('firebase/database');
const admin = require('firebase-admin');
const { signClaim, canon, _claimId } = require(path.join(__dirname, 'p0_r2_owner_binding.js'));

const STAGING_PROJECT = 'stallmate-staging-2026-5f39f';
const PROD = 'stallmate-9caac';
const REGION = 'asia-southeast1';
function need(v, n) { if (!v) { console.error('missing env ' + n); process.exit(3); } return v; }
const CFG = {
  apiKey: need(process.env.STAGING_API_KEY, 'STAGING_API_KEY'),
  authDomain: need(process.env.STAGING_AUTH_DOMAIN, 'STAGING_AUTH_DOMAIN'),
  projectId: need(process.env.STAGING_PROJECT_ID, 'STAGING_PROJECT_ID'),
  databaseURL: need(process.env.STAGING_DATABASE_URL, 'STAGING_DATABASE_URL')
};
const SECRET = need(process.env.OWNER_BIND_SECRET, 'OWNER_BIND_SECRET');

// strict staging allowlist (never production)
if (CFG.projectId !== STAGING_PROJECT) { console.error('REFUSING: projectId not staging allowlist'); process.exit(2); }
if (CFG.projectId === PROD) { console.error('REFUSING: production project'); process.exit(2); }
if (!/^https:\/\//.test(CFG.databaseURL) || CFG.databaseURL.indexOf(PROD) !== -1
  || !(CFG.databaseURL.indexOf(STAGING_PROJECT) !== -1 && /(firebasedatabase\.app|firebaseio\.com)/.test(CFG.databaseURL))) {
  console.error('REFUSING: STAGING_DATABASE_URL not a verified staging RTDB'); process.exit(2);
}

let pass = 0, fail = 0; function ok(c, l) { console.log((c ? '  PASS ' : '  FAIL ') + l); if (c) pass++; else fail++; }
const mkEmail = () => 'sr3_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '@example.com';
async function denied(fn) { try { await fn(); return false; } catch (e) { return /permission|PERMISSION|denied/.test((e && (e.message || e.code)) || ''); } }
async function allowed(fn) { try { await fn(); return true; } catch (e) { return false; } }

// deterministic client writer (create-only + canonical-equal + OPID_CONFLICT) — same contract as SR1/R2
function writer(db, room) {
  return async (snap, opId) => {
    const t = canon(snap);
    const r = await runTransaction(ref(db, `rooms/${room}/salesRecords/${opId}`), cur => {
      if (cur === null) return snap; if (canon(cur) === t) return cur; return;
    });
    if (!r.committed) { const e = new Error('OPID_CONFLICT'); e.code = 'OPID_CONFLICT'; throw e; }
    return { ok: true };
  };
}
const sale = (over = {}) => ({ id: 's1', orderId: 'o1', time: 1, total: 250, totalSatang: 25000, cashAmount: 250, cashSatang: 25000, ...over });
const claim = (room, nonce, uid, ttl = 60000) => signClaim({ roomCode: room, intendedUid: uid, nonce, exp: Date.now() + ttl }, SECRET);

const created = { uids: new Set(), rooms: new Set(), nonces: new Set() };
function track(uid, room, nonce) { if (uid) created.uids.add(uid); if (room) created.rooms.add(room); if (nonce) created.nonces.add(nonce); }

(async () => {
  console.log('=== P0 SR3 LIVE RULES SMOKE (Rules B enforced; synthetic; no prod) ===');
  const app = initializeApp(CFG, 'sr3_' + Date.now());
  const auth = getAuth(app); const fns = getFunctions(app, REGION); const db = getDatabase(app);
  const ROOM = 'SR3_' + Date.now().toString(36);
  const NONCE = 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2); // unique per run (no replay collision)
  let adminApp = null, adb = null;
  try {
    adminApp = admin.initializeApp({ databaseURL: CFG.databaseURL, projectId: CFG.projectId }, 'sr3_admin');
    if (admin.app('sr3_admin').options.projectId !== STAGING_PROJECT) throw new Error('admin project mismatch');
    adb = admin.database(adminApp);
  } catch (e) { console.error('admin init failed (cleanup limited):', e.message); }

  try {
    // owner sign-in + bind via callable (SR2 function; admin-side write to roomOwners)
    const em = mkEmail(); await createUserWithEmailAndPassword(auth, em, 'pw123456'); const ownerUid = auth.currentUser.uid; track(ownerUid, ROOM, NONCE);
    const bindRes = await httpsCallable(fns, 'bindOwner')({ roomCode: ROOM, claimToken: claim(ROOM, NONCE, ownerUid) }).then(() => true).catch(() => false);
    ok(bindRes === true, 'owner bound via callable (roomOwners set by admin)');

    const w = writer(db, ROOM);
    // owner ALLOW: create sale under Rules B
    ok(await allowed(() => w(sale({ __opId: 'op1' }), 'op1')), 'bound owner writes salesRecords => ALLOW');
    // owner ALLOW: read own room + roomOwners
    ok(await allowed(() => get(ref(db, 'rooms/' + ROOM))), 'bound owner reads rooms/$room => ALLOW');
    ok(await allowed(() => get(ref(db, 'roomOwners/' + ROOM))), 'bound owner reads roomOwners/$room => ALLOW');

    // financial idempotency + integrity: replay same canonical => idempotent (exactly one), changed amount => OPID_CONFLICT, original unchanged
    ok(await allowed(() => w(sale({ __opId: 'op1' }), 'op1')), 'idempotent replay (same canonical) => ALLOW/idempotent');
    let conflict = false, orig = null;
    try { await w(sale({ __opId: 'op1', total: 1, totalSatang: 100 }), 'op1'); } catch (e) { conflict = (e.code === 'OPID_CONFLICT'); }
    try { orig = (await get(ref(db, 'rooms/' + ROOM + '/salesRecords/op1'))).val(); } catch (e) {}
    ok(conflict === true, 'same opId + changed amount => OPID_CONFLICT (financial idempotency)');
    ok(orig && orig.total === 250 && orig.totalSatang === 25000, 'original financial record unchanged after conflict');

    // validate no-field-drop: owner writes update dropping total => DENY
    ok(await denied(() => set(ref(db, 'rooms/' + ROOM + '/salesRecords/op1'), { id: 's1', orderId: 'o1', time: 1, cashAmount: 250 })),
      'owner update dropping total/totalSatang => DENY (validate no-field-drop)');
    // hard-delete salesRecord => DENY (newData.exists() required)
    ok(await denied(() => set(ref(db, 'rooms/' + ROOM + '/salesRecords/op1'), null)), 'owner hard-delete salesRecord => DENY');

    // anonymous DENY
    await signOut(auth); await signInAnonymously(auth); track(auth.currentUser.uid);
    ok(await denied(() => set(ref(db, 'rooms/' + ROOM + '/salesRecords/anonop'), sale())), 'anonymous writes salesRecords => DENY');
    ok(await denied(() => get(ref(db, 'rooms/' + ROOM))), 'anonymous reads rooms/$room => DENY');
    ok(await denied(() => set(ref(db, 'roomOwners/' + ROOM), auth.currentUser.uid)), 'anonymous takeover roomOwners => DENY');

    // non-owner authed DENY
    await signOut(auth); const em2 = mkEmail(); await createUserWithEmailAndPassword(auth, em2, 'pw123456'); const attacker = auth.currentUser.uid; track(attacker);
    ok(await denied(() => set(ref(db, 'rooms/' + ROOM + '/salesRecords/attop'), sale())), 'non-owner authed writes salesRecords => DENY');
    ok(await denied(() => get(ref(db, 'rooms/' + ROOM))), 'non-owner authed reads rooms/$room => DENY');
    ok(await denied(() => set(ref(db, 'roomOwners/' + ROOM), attacker)), 'authed takeover/change roomOwners => DENY');

    // legitimate recovery: owner re-auth => read/write still ALLOW
    await signOut(auth); await signInWithEmailAndPassword(auth, em, 'pw123456');
    ok(await allowed(() => get(ref(db, 'rooms/' + ROOM))), 'owner re-auth (recovery) reads own room => ALLOW');
    ok(await allowed(() => w(sale({ __opId: 'op2', orderId: 'o2' }), 'op2')), 'owner re-auth writes new sale => ALLOW');
    await signOut(auth);
  } finally {
    let cok = true;
    try {
      if (adb && admin.app('sr3_admin').options.projectId === STAGING_PROJECT) {
        for (const room of created.rooms) { await adb.ref('rooms/' + room).remove(); await adb.ref('roomOwners/' + room).remove(); }
        for (const n of created.nonces) { try { await adb.ref('ownerBindClaimsUsed/' + _claimId(n)).remove(); } catch (e) {} }
        const aud = await adb.ref('ownerBindAudit').once('value'); const val = aud.val() || {};
        for (const k of Object.keys(val)) { if (created.rooms.has(val[k] && val[k].roomCode)) await adb.ref('ownerBindAudit/' + k).remove(); }
        for (const uid of created.uids) { try { await admin.auth(adminApp).deleteUser(uid); } catch (e) {} }
      } else { cok = false; console.error('cleanup skipped: admin not on staging'); }
    } catch (e) { cok = false; console.error('cleanup error:', e.message); }
    ok(cok, 'cleanup (rooms/roomOwners/nonces/audit/test users) removed on staging (never production)');
  }
  console.log('\n=== SR3 LIVE RULES SMOKE: ' + pass + '/' + (pass + fail) + ' PASS, ' + fail + ' FAIL ===');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('RUNNER ERROR', e && e.message || e); process.exit(2); });

/**
 * StallMate P0 — SR1 STAGING CLIENT BUILD (separate from frozen .13/.14).
 * Wires R1 client-auth (security/p0/auth/stallmate_auth.js) with the Firebase client SDK, targeting the
 * staging project ONLY. Exercises: anonymous bootstrap, permanent sign-in, sign-out/re-auth,
 * offline/pending recovery. Synthetic data only. No Blaze, no Function/Rules deploy, no production.
 *
 * Local verification (now): runs against Auth emulator (9099) + RTDB emulator (9000) as a staging proxy.
 *   (DB jar started separately; auth via `firebase emulators:exec --only auth`.)
 * Staging (later): inject the staging web config + connect to the live staging project.
 * Exit 0 iff all flows pass.
 */
'use strict';
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, onIdTokenChanged } = require('firebase/auth');
const { getDatabase, connectDatabaseEmulator, ref, set, get, runTransaction } = require('firebase/database');
let createAuthController;
try { ({ createAuthController } = require(path.join(__dirname,'../auth/stallmate_auth.js'))); }
catch(e){ ({ createAuthController } = require(path.join(__dirname,'stallmate_auth.js'))); }

const STAGING_PROJECT = 'stallmate-staging-2026-5f39f';
let pass=0, fail=0; function ok(c,l){ console.log((c?'  PASS ':'  FAIL ')+l); if(c)pass++; else fail++; }
function memStorage(){ const m=new Map(); return { getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k) }; }
const sale=()=>({ id:'s1', orderId:'o1', time:1, total:250, totalSatang:25000, cashAmount:250, cashSatang:25000 });

// build the staging client (config injected). Local run uses emulator; staging run uses real config.
function buildClient(){
  const emulator = process.env.SR1_EMULATOR === '1';
  const cfg = emulator
    ? { apiKey:'demo', authDomain:'localhost', projectId:'demo-sr1', databaseURL:'http://127.0.0.1:9000?ns=demo-sr1' }
    : { apiKey:process.env.STAGING_API_KEY, authDomain:process.env.STAGING_AUTH_DOMAIN, projectId:process.env.STAGING_PROJECT_ID, databaseURL:process.env.STAGING_DATABASE_URL };
  if (!emulator && cfg.projectId !== STAGING_PROJECT){ console.error('REFUSING: not the staging project'); process.exit(2); }
  const app = initializeApp(cfg,'sr1_'+Date.now());
  const auth = getAuth(app); const db = getDatabase(app);
  if (emulator){ connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true}); connectDatabaseEmulator(db,'127.0.0.1',9000); }
  return { app, auth, db };
}

function clientWriter(db, room){
  return async (snap, opId) => {
    const r = await runTransaction(ref(db, `rooms/${room}/salesRecords/${opId}`), cur => (cur===null? snap : cur));
    if (!r.committed) { const e=new Error('OPID_CONFLICT'); e.code='OPID_CONFLICT'; throw e; }
    return { ok:true };
  };
}

(async () => {
  console.log('=== P0 SR1 STAGING CLIENT BUILD (R1 auth wired; synthetic; no prod) ===');
  const { auth, db } = buildClient();
  const storage = memStorage(); let online = true;
  const ctrl = createAuthController({
    auth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged, onIdTokenChanged,
    storage, isOnline:()=>online, genOpId:()=>'sr1op',
    verifyOwnerBinding: async(uid)=>{ try { const s=await get(ref(db,'roomOwners/BBMANN')); return s.exists() && s.val()===uid; } catch(e){ return false; } }
  });
  ctrl.init();

  // 1. anonymous bootstrap
  let id = await ctrl.signInAnon();
  ok(id.signedIn && id.isAnonymous && id.permanentIdentity===false, 'anonymous bootstrap = device identity (not owner)');
  ok((await ctrl.isOwnerAuthorized())===false, 'anonymous not owner-authorized');

  // 2. permanent sign-in
  await ctrl.signOut();
  const em='sr1_'+Date.now()+'@example.com'; await createUserWithEmailAndPassword(auth, em, 'pw123456');
  id = await ctrl.signInOwner(em, 'pw123456');
  ok(id.permanentIdentity===true && id.isAnonymous===false, 'permanent sign-in = permanent identity');

  // 3. sign-out / re-auth
  await ctrl.signOut();
  ok(ctrl.getIdentity().signedIn===false, 'sign-out clears identity');
  id = await ctrl.reAuthOwner(em, 'pw123456');
  ok(id.permanentIdentity===true, 're-auth restores permanent identity');

  // simulate a bound owner (staging: via SR2 Function; here: seed roomOwners on the emulator)
  const ownerUid = auth.currentUser.uid;
  await set(ref(db,'roomOwners/BBMANN'), ownerUid);
  ok((await ctrl.isOwnerAuthorized())===true, 'bound owner => owner-authorized');

  // 4. offline / pending recovery
  online = false;
  const w = clientWriter(db,'BBMANN');
  let r = await ctrl.guardedSaleWrite({...sale(), __opId:'sr1op'}, w);
  ok(r.ok===false && r.reason==='offline' && ctrl.pendingCount()===1, 'offline sale queued (not written)');
  online = true;
  const res = await ctrl.flushPendingSales(w);
  ok(res.flushed===1 && ctrl.pendingCount()===0, 'reconnect + flush writes queued sale');
  const one = (await get(ref(db,'rooms/BBMANN/salesRecords/sr1op'))).exists();
  ok(one===true, 'exactly one sale persisted at deterministic opId key');

  console.log('\n=== SR1 CLIENT: '+pass+'/'+(pass+fail)+' PASS, '+fail+' FAIL ===');
  process.exit(fail===0?0:1);
})().catch(e => { console.error('RUNNER ERROR', e && e.stack || e); process.exit(2); });

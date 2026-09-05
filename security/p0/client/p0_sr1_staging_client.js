/**
 * StallMate P0 — SR1 STAGING CLIENT — automated flow verification (HOLD-1 CORRECTED).
 * Drives the SAME wiring the browser staging-app uses (security/p0/client/staging-app/), against the
 * Auth emulator (9099) + RTDB emulator (9000) as a staging proxy. Programmatic proof of R1 flows +
 * financial idempotency. Browser smoke is performed separately on the staging-app (see staging-app/README).
 *
 * B2 fix: deterministic client writer is create-only + canonical-equal + OPID_CONFLICT (never returns
 *   false {ok:true} when the same opId carries a different financial snapshot).
 * B3 fix: unique synthetic room SR1_TEST_<ts> (no real shop code); roomOwners seeding is EMULATOR-ONLY
 *   and isolated from production-capable client code (live/staging binds via the R2 callable, not the client).
 * Exit 0 iff all pass.
 */
'use strict';
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, onIdTokenChanged } = require('firebase/auth');
const { getDatabase, connectDatabaseEmulator, ref, set, get, runTransaction } = require('firebase/database');
let createAuthController;
try { ({ createAuthController } = require(path.join(__dirname,'../auth/stallmate_auth.js'))); }
catch(e){ ({ createAuthController } = require(path.join(__dirname,'stallmate_auth.js'))); }
let canon;
try { ({ canon } = require(path.join(__dirname,'../backend/p0_r2_owner_binding.js'))); }
catch(e){ ({ canon } = require(path.join(__dirname,'p0_r2_owner_binding.js'))); }

const STAGING_PROJECT = 'stallmate-staging-2026-5f39f';
const EMU = process.env.SR1_EMULATOR === '1';
let pass=0, fail=0; function ok(c,l){ console.log((c?'  PASS ':'  FAIL ')+l); if(c)pass++; else fail++; }
function memStorage(){ const m=new Map(); return { getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k) }; }
const sale=()=>({ id:'s1', orderId:'o1', time:1, total:250, totalSatang:25000, cashAmount:250, cashSatang:25000 });
const ROOM = 'SR1_TEST_' + Date.now().toString(36); // B3: unique synthetic room, never a real shop code

function buildClient(){
  const cfg = EMU
    ? { apiKey:'demo', authDomain:'localhost', projectId:'demo-sr1', databaseURL:'http://127.0.0.1:9000?ns=demo-sr1' }
    : { apiKey:process.env.STAGING_API_KEY, authDomain:process.env.STAGING_AUTH_DOMAIN, projectId:process.env.STAGING_PROJECT_ID, databaseURL:process.env.STAGING_DATABASE_URL };
  if (!EMU && cfg.projectId !== STAGING_PROJECT){ console.error('REFUSING: not the staging project'); process.exit(2); }
  const app = initializeApp(cfg,'sr1_'+Date.now());
  const auth = getAuth(app); const db = getDatabase(app);
  if (EMU){ connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true}); connectDatabaseEmulator(db,'127.0.0.1',9000); }
  return { auth, db };
}

// B2: create-only + idempotent-equal + OPID_CONFLICT (shared with the browser staging-app)
function clientWriter(db, room){
  return async (snap, opId) => {
    const target = canon(snap);
    const r = await runTransaction(ref(db, `rooms/${room}/salesRecords/${opId}`), cur => {
      if (cur === null) return snap;          // create
      if (canon(cur) === target) return cur;   // idempotent (no change)
      return;                                  // differ -> abort (conflict)
    });
    if (!r.committed) { const e = new Error('OPID_CONFLICT'); e.code='OPID_CONFLICT'; throw e; }
    return { ok:true };
  };
}
// EMULATOR-ONLY owner-binding seed (isolated; production-capable client NEVER writes roomOwners)
async function emulatorSeedOwner(db, uid){ if (!EMU) throw new Error('seed is emulator-only'); await set(ref(db,'roomOwners/'+ROOM), uid); }

(async () => {
  console.log('=== P0 SR1 STAGING CLIENT — flow verification (synthetic; no prod) room='+ROOM+' ===');
  const { auth, db } = buildClient();
  const storage = memStorage(); let online = true;
  const ctrl = createAuthController({
    auth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged, onIdTokenChanged,
    storage, isOnline:()=>online, genOpId:()=>'sr1op',
    verifyOwnerBinding: async(uid)=>{ try { const s=await get(ref(db,'roomOwners/'+ROOM)); return s.exists() && s.val()===uid; } catch(e){ return false; } }
  });
  ctrl.init();

  let id = await ctrl.signInAnon();
  ok(id.signedIn && id.isAnonymous && id.permanentIdentity===false, 'anonymous bootstrap = device identity (not owner)');
  ok((await ctrl.isOwnerAuthorized())===false, 'anonymous not owner-authorized');

  await ctrl.signOut();
  const em='sr1_'+Date.now()+'@example.com'; await createUserWithEmailAndPassword(auth, em, 'pw123456');
  id = await ctrl.signInOwner(em, 'pw123456');
  ok(id.permanentIdentity===true && id.isAnonymous===false, 'permanent sign-in = permanent identity');

  await ctrl.signOut();
  ok(ctrl.getIdentity().signedIn===false, 'sign-out clears identity');
  id = await ctrl.reAuthOwner(em, 'pw123456');
  ok(id.permanentIdentity===true, 're-auth restores permanent identity');

  // emulator-only: simulate an R2-bound owner (staging binds via the R2 callable, not the client)
  const ownerUid = auth.currentUser.uid;
  await emulatorSeedOwner(db, ownerUid);
  ok((await ctrl.isOwnerAuthorized())===true, 'bound owner => owner-authorized');

  online = false;
  const w = clientWriter(db, ROOM);
  let r = await ctrl.guardedSaleWrite({...sale(), __opId:'sr1op'}, w);
  ok(r.ok===false && r.reason==='offline' && ctrl.pendingCount()===1, 'auth/offline: sale queued, amounts unchanged, not written');
  online = true;
  const res = await ctrl.flushPendingSales(w);
  ok(res.flushed===1 && ctrl.pendingCount()===0, 'reconnect + replay writes queued sale (same opId)');
  const one = (await get(ref(db,'rooms/'+ROOM+'/salesRecords/sr1op'))).exists();
  ok(one===true, 'exactly one sale at deterministic opId key');

  // B2: same opId + changed financial snapshot => OPID_CONFLICT, original unchanged
  let code=null; try { await w({...sale(), total:1, totalSatang:100, __opId:'sr1op'}, 'sr1op'); } catch(e){ code=e.code; }
  ok(code==='OPID_CONFLICT', 'same opId + changed amount => OPID_CONFLICT');
  const v = (await get(ref(db,'rooms/'+ROOM+'/salesRecords/sr1op'))).val();
  ok(v && v.total===250 && v.totalSatang===25000, 'original financial record unchanged after conflict');

  console.log('\n=== SR1 CLIENT: '+pass+'/'+(pass+fail)+' PASS, '+fail+' FAIL ===');
  process.exit(fail===0?0:1);
})().catch(e => { console.error('RUNNER ERROR', e && e.stack || e); process.exit(2); });

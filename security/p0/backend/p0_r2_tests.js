/**
 * StallMate P0 R2 (LOCAL) test suite — owner-binding backend + deterministic RTDB writer.
 * Runs against the RTDB emulator (firebase-database-emulator jar) via firebase-admin:
 *   FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 node p0_r2_tests.js
 * Auth identity is injected as the Functions runtime would provide context.auth (Auth-verified).
 * Exit 0 iff all pass.
 */
'use strict';
const path = require('path');
const admin = require('firebase-admin');
const {
  signClaim, verifyClaim, createOwnerBindingHandler, createOwnerVerifier, createRtdbSaleWriter
} = require(path.join(__dirname, 'p0_r2_owner_binding.js'));
const { createAuthController } = require(path.join(__dirname, 'p0_r1_stallmate_auth.js'));

let pass = 0, fail = 0;
const fs = require('fs');
const PROG = process.env.R2_PROG || '';
function ok(c, label){ const line = (c?'  PASS ':'  FAIL ') + label; if (c) pass++; else fail++; console.log(line); if (PROG){ try{ fs.appendFileSync(PROG, line+'\n'); }catch(e){} } }
function mark(m){ if (PROG){ try{ fs.appendFileSync(PROG, '.. '+m+'\n'); }catch(e){} } }

let appN = 0;
const APP = admin.initializeApp({ databaseURL:'http://127.0.0.1:9000?ns=demo-r2', projectId:'demo-r2' }, 'r2app');
const DB = admin.database(APP);
async function newDb(){ await DB.ref('/').set(null); return DB; } // single app; reset state per test (avoids multi-app hang)
const SECRET = 'r2-test-secret';
const ctx = (uid, provider) => ({ auth: { uid, token:{ firebase:{ sign_in_provider: provider } } } });
const validClaim = (roomCode, nonce, ttlMs=60000, now=Date.now()) => signClaim({ roomCode, nonce, exp: now+ttlMs }, SECRET);
const sale = () => ({ id:'s1', orderId:'o1', time:1, total:250, totalSatang:25000, cashAmount:250, cashSatang:25000 });
const memStorage=()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};

(async () => {
  console.log('=== StallMate P0 R2 (LOCAL) — owner-binding + deterministic writer ===');

  // 1. anonymous denied
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    const r=await h.bindOwner({roomCode:'BBMANN', claimToken:validClaim('BBMANN','n1')}, ctx('anonUid','anonymous'));
    ok(r.ok===false && r.code==='anonymous_denied', 'anonymous identity => bind DENIED'); }

  // 2. unauthenticated denied
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    const r=await h.bindOwner({roomCode:'BBMANN', claimToken:validClaim('BBMANN','n2')}, {});
    ok(r.ok===false && r.code==='unauthenticated', 'unauthenticated => bind DENIED'); }

  // 3. valid permanent owner + valid claim => bound
  { mark('t3-start'); const db=await newDb(); mark('t3-db'); const h=createOwnerBindingHandler({db,secret:SECRET});
    const r=await h.bindOwner({roomCode:'BBMANN', claimToken:validClaim('BBMANN','n3')}, ctx('ownerA','password')); mark('t3-bound '+JSON.stringify(r));
    ok(r.ok===true && r.uid==='ownerA', 'valid owner+claim => bound');
    const snap=await db.ref('roomOwners/BBMANN').once('value');
    ok(snap.val()==='ownerA', 'roomOwners/BBMANN = ownerA');
    const aud=await db.ref('ownerBindAudit').once('value'); const entries=Object.values(aud.val()||{});
    const e=entries[0]||{};
    ok(entries.length===1 && e.event==='owner_bound' && e.uid==='ownerA' && e.roomCode==='BBMANN', 'audit event recorded');
    ok(!('token' in e) && !('claimToken' in e) && !('secret' in e) && !('pin' in e) && !('nonce' in e) && typeof e.claimId==='string',
       'audit has NO token/secret/pin/nonce (claimId=hash only)'); }

  // 4. tampered claim
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    let t=validClaim('BBMANN','n4'); t=t.slice(0,-2)+(t.slice(-2)==='aa'?'bb':'aa'); // flip sig tail
    const r=await h.bindOwner({roomCode:'BBMANN', claimToken:t}, ctx('ownerA','password'));
    ok(r.ok===false && r.code==='claim_bad_signature', 'tampered claim => DENIED'); }

  // 5. expired claim
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    const expired=signClaim({roomCode:'BBMANN', nonce:'n5', exp: Date.now()-1000}, SECRET);
    const r=await h.bindOwner({roomCode:'BBMANN', claimToken:expired}, ctx('ownerA','password'));
    ok(r.ok===false && r.code==='claim_expired', 'expired claim => DENIED'); }

  // 6. room mismatch
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    const other=validClaim('OTHER','n6');
    const r=await h.bindOwner({roomCode:'BBMANN', claimToken:other}, ctx('ownerA','password'));
    ok(r.ok===false && r.code==='claim_room_mismatch', 'claim for another room => DENIED'); }

  // 7. replay (same nonce twice)
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    const c=validClaim('BBMANN','n7');
    const r1=await h.bindOwner({roomCode:'BBMANN', claimToken:c}, ctx('ownerA','password'));
    const r2=await h.bindOwner({roomCode:'BBMANN', claimToken:c}, ctx('ownerA','password'));
    ok(r1.ok===true && r2.ok===false && r2.code==='replayed', 'replayed claim (same nonce) => DENIED'); }

  // 8/9. already bound + takeover attempt by another uid with a fresh valid claim
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    await h.bindOwner({roomCode:'BBMANN', claimToken:validClaim('BBMANN','n8a')}, ctx('ownerA','password'));
    const r=await h.bindOwner({roomCode:'BBMANN', claimToken:validClaim('BBMANN','n8b')}, ctx('attackerB','password'));
    ok(r.ok===false && r.code==='already_bound', 'second bind on owned room => already_bound (no reassignment)');
    const snap=await db.ref('roomOwners/BBMANN').once('value');
    ok(snap.val()==='ownerA', 'owner unchanged after takeover attempt (no silent takeover)'); }

  // 10. owner verifier (for R1)
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    await h.bindOwner({roomCode:'BBMANN', claimToken:validClaim('BBMANN','n10')}, ctx('ownerA','password'));
    const verify=createOwnerVerifier(db,'BBMANN');
    ok((await verify('ownerA'))===true, 'verifier: bound uid => true');
    ok((await verify('someoneElse'))===false, 'verifier: wrong uid => false'); }

  // 11. deterministic writer: commit -> client timeout -> replay same opId => exactly one
  { const db=await newDb(); const writer=createRtdbSaleWriter(db,'BBMANN'); const opId='op-fixed-1';
    const commitThenTimeout=async(snap,op)=>{ await writer(snap,op); throw new Error('client timeout after commit'); };
    let threw=false; try{ await commitThenTimeout(sale(),opId); }catch(e){ threw=true; }
    ok(threw, 'writer commit-then-timeout surfaced to client');
    await writer(sale(), opId); // replay SAME opId/key
    const snap=await db.ref('rooms/BBMANN/salesRecords').once('value'); const kids=snap.val()||{};
    ok(Object.keys(kids).length===1 && kids[opId] && kids[opId].totalSatang===25000, 'replay same opId => EXACTLY ONE sale'); }

  // 12. restart + replay still exactly one
  { const db=await newDb(); const writer=createRtdbSaleWriter(db,'BBMANN'); const opId='op-fixed-2';
    try{ await writer(sale(),opId); throw new Error('x'); }catch(e){}
    // "restart": fresh writer over the SAME namespace/data (persisted), replay same opId
    const writer2 = createRtdbSaleWriter(db, 'BBMANN');
    await writer2(sale(), opId);
    const snap=await db.ref('rooms/BBMANN/salesRecords').once('value');
    ok(Object.keys(snap.val()||{}).length===1, 'restart + replay => still exactly one'); }

  // 13. end-to-end: bound owner -> R1 guardedSaleWrite -> deterministic rtdb writer -> exactly one
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    await h.bindOwner({roomCode:'BBMANN', claimToken:validClaim('BBMANN','n13')}, ctx('ownerA','password'));
    const verify=createOwnerVerifier(db,'BBMANN');
    const writer=createRtdbSaleWriter(db,'BBMANN');
    const ctrl=createAuthController({
      auth:{ currentUser:{ uid:'ownerA', isAnonymous:false, providerData:[{providerId:'password'}] } },
      onAuthStateChanged:(a,cb)=>{cb(a.currentUser);return()=>{};}, signOut:async()=>{},
      signInAnonymously:async()=>({}), signInWithEmailAndPassword:async()=>({}),
      storage:memStorage(), isOnline:()=>true, verifyOwnerBinding:verify, genOpId:()=> 'op-e2e-1'
    });
    ctrl.init();
    ok((await ctrl.isOwnerAuthorized())===true, 'e2e: bound owner authorized');
    const r=await ctrl.guardedSaleWrite(sale(), writer);
    ok(r.ok===true, 'e2e: guarded sale write ok');
    const snap=await db.ref('rooms/BBMANN/salesRecords').once('value');
    ok(Object.keys(snap.val()||{}).length===1, 'e2e: exactly one sale persisted at opId key'); }

  console.log('\n=== R2 SUITE: ' + pass + '/' + (pass+fail) + ' PASS, ' + fail + ' FAIL ===');
  process.exit(fail===0 ? 0 : 1);
})().catch(e => { console.error('RUNNER ERROR', e); process.exit(2); });

/**
 * StallMate P0 R2 (LOCAL) suite — HOLD-1 CORRECTED. Runs against RTDB emulator via firebase-admin:
 *   FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 node p0_r2_tests.js
 * Covers B1 (claim bound to intendedUid), B2 (create-only + idempotent + OPID_CONFLICT),
 * B3 (cleanup failure => recovery-required), + key/token hardening. Synthetic only.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const {
  signClaim, verifyClaim, createOwnerBindingHandler, createOwnerVerifier, createRtdbSaleWriter, isValidKey
} = require(path.join(__dirname, 'p0_r2_owner_binding.js'));
const { createAuthController } = require(path.join(__dirname, 'p0_r1_stallmate_auth.js'));

let pass = 0, fail = 0;
const PROG = process.env.R2_PROG || '';
function ok(c, label){ const line=(c?'  PASS ':'  FAIL ')+label; if(c)pass++; else fail++; console.log(line); if(PROG){try{fs.appendFileSync(PROG,line+'\n');}catch(e){}} }

const APP = admin.initializeApp({ databaseURL:'http://127.0.0.1:9000?ns=demo-r2', projectId:'demo-r2' }, 'r2app');
const DB = admin.database(APP);
async function newDb(){ await DB.ref('/').set(null); return DB; }
const SECRET = 'r2-test-secret';
const ctx = (uid, provider) => ({ auth: { uid, token:{ firebase:{ sign_in_provider: provider } } } });
const claim = (room, nonce, uid, ttl=60000, now=Date.now()) => signClaim({ roomCode:room, intendedUid:uid, nonce, exp:now+ttl }, SECRET);
const sale = () => ({ id:'s1', orderId:'o1', time:1, total:250, totalSatang:25000, cashAmount:250, cashSatang:25000 });
const memStorage=()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};

(async () => {
  console.log('=== StallMate P0 R2 (LOCAL) HOLD-1 CORRECTED ===');

  // identity gates
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    const r=await h.bindOwner({roomCode:'BBMANN',claimToken:claim('BBMANN','n1','ownerA')}, ctx('ownerA','anonymous'));
    ok(r.ok===false && r.code==='anonymous_denied', 'anonymous => DENY'); }
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    const r=await h.bindOwner({roomCode:'BBMANN',claimToken:claim('BBMANN','n2','ownerA')}, {});
    ok(r.ok===false && r.code==='unauthenticated', 'unauthenticated => DENY'); }

  // B1: claim bound to intendedUid
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    const r=await h.bindOwner({roomCode:'BBMANN',claimToken:claim('BBMANN','n3','ownerA')}, ctx('ownerA','password'));
    ok(r.ok===true && r.uid==='ownerA', 'B1: valid claim + intended UID => ALLOW');
    ok((await db.ref('roomOwners/BBMANN').once('value')).val()==='ownerA', 'roomOwners=ownerA'); }
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    // claim was minted for ownerA, but a DIFFERENT permanent user tries to redeem it first
    const r=await h.bindOwner({roomCode:'BBMANN',claimToken:claim('BBMANN','n4','ownerA')}, ctx('attackerB','password'));
    ok(r.ok===false && r.code==='claim_uid_mismatch', 'B1: same claim + different permanent UID => DENY');
    ok((await db.ref('roomOwners/BBMANN').once('value')).val()===null, 'B1: owner remains unchanged (no binding created)'); }

  // audit content (no secrets)
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    await h.bindOwner({roomCode:'BBMANN',claimToken:claim('BBMANN','n5','ownerA')}, ctx('ownerA','password'));
    const e=Object.values((await db.ref('ownerBindAudit').once('value')).val()||{})[0]||{};
    ok(e.event==='owner_bound'&&e.uid==='ownerA'&&!('token'in e)&&!('secret'in e)&&!('pin'in e)&&!('nonce'in e)&&typeof e.claimId==='string','audit has no token/secret/pin/nonce'); }

  // claim tamper / expired / room mismatch / replay
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    let t=claim('BBMANN','n6','ownerA'); t=t.slice(0,-2)+(t.slice(-2)==='aa'?'bb':'aa');
    ok((await h.bindOwner({roomCode:'BBMANN',claimToken:t},ctx('ownerA','password'))).code==='claim_bad_signature','tampered => DENY'); }
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    const exp=signClaim({roomCode:'BBMANN',intendedUid:'ownerA',nonce:'n7',exp:Date.now()-1},SECRET);
    ok((await h.bindOwner({roomCode:'BBMANN',claimToken:exp},ctx('ownerA','password'))).code==='claim_expired','expired => DENY'); }
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    ok((await h.bindOwner({roomCode:'BBMANN',claimToken:claim('OTHER','n8','ownerA')},ctx('ownerA','password'))).code==='claim_room_mismatch','room mismatch => DENY'); }
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    const c=claim('BBMANN','n9','ownerA');
    const a=await h.bindOwner({roomCode:'BBMANN',claimToken:c},ctx('ownerA','password'));
    const b=await h.bindOwner({roomCode:'BBMANN',claimToken:c},ctx('ownerA','password'));
    ok(a.ok===true && b.code==='replayed','replay (same nonce) => DENY'); }

  // already bound / no takeover
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    await h.bindOwner({roomCode:'BBMANN',claimToken:claim('BBMANN','n10a','ownerA')},ctx('ownerA','password'));
    const r=await h.bindOwner({roomCode:'BBMANN',claimToken:claim('BBMANN','n10b','attackerB')},ctx('attackerB','password'));
    ok(r.code==='already_bound','already-bound => DENY');
    ok((await db.ref('roomOwners/BBMANN').once('value')).val()==='ownerA','owner unchanged (no takeover)'); }

  // hardening: malformed / multi-dot token, invalid room key
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    ok((await h.bindOwner({roomCode:'BBMANN',claimToken:'a.b.c'},ctx('ownerA','password'))).code==='claim_malformed','multi-dot token => DENY');
    ok((await h.bindOwner({roomCode:'BBMANN',claimToken:'noDotToken'},ctx('ownerA','password'))).code==='claim_malformed','no-dot token => DENY');
    ok((await h.bindOwner({roomCode:'bad/room',claimToken:claim('bad/room','n11','ownerA')},ctx('ownerA','password'))).code==='bad_request','invalid room key => DENY');
    ok(isValidKey('BBMANN')===true && isValidKey('a.b')===false && isValidKey('a/b')===false && isValidKey('')===false,'isValidKey rejects Firebase-invalid keys'); }

  // verifier
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    await h.bindOwner({roomCode:'BBMANN',claimToken:claim('BBMANN','n12','ownerA')},ctx('ownerA','password'));
    const v=createOwnerVerifier(db,'BBMANN');
    ok((await v('ownerA'))===true && (await v('x'))===false,'verifier true/false'); }

  // B2: create-only + idempotent + conflict
  { const db=await newDb(); const writer=createRtdbSaleWriter(db,'BBMANN'); const opId='op-fixed-1';
    let threw=false; try{ await writer(sale(),opId); throw new Error('client timeout'); }catch(e){ threw=e.message==='client timeout'; }
    ok(threw,'writer commit-then-timeout surfaced');
    const rep=await writer(sale(),opId); // identical replay
    ok(rep.ok===true,'B2: identical replay => idempotent success');
    const kids=(await db.ref('rooms/BBMANN/salesRecords').once('value')).val()||{};
    ok(Object.keys(kids).length===1 && kids[opId].total===250,'B2: exactly one sale, unchanged'); }
  { const db=await newDb(); const writer=createRtdbSaleWriter(db,'BBMANN'); const opId='op-fixed-2';
    await writer(sale(),opId);
    const bad=sale(); bad.total=1; bad.totalSatang=100; bad.cashSatang=100; // changed amount, same opId
    let code=null; try{ await writer(bad,opId); }catch(e){ code=e.code; }
    ok(code==='OPID_CONFLICT','B2: same opId + changed amount => OPID_CONFLICT');
    const v=(await db.ref('rooms/BBMANN/salesRecords/'+opId).once('value')).val();
    ok(v.total===250 && v.totalSatang===25000,'B2: original financial record unchanged'); }
  { const db=await newDb(); const writer=createRtdbSaleWriter(db,'BBMANN');
    let code=null; try{ await writer(sale(),'bad/op'); }catch(e){ code=e.code; }
    ok(code==='INVALID_OPID','B2: invalid opId key => rejected'); }

  // B3: cleanup failure => recovery-required (no false success). Uses R1 controller.
  function ctrlWith(storage){ const c=createAuthController({
      auth:{currentUser:{uid:'ownerA',isAnonymous:false,providerData:[{providerId:'password'}]}},
      onAuthStateChanged:(a,cb)=>{cb(a.currentUser);return()=>{};}, signOut:async()=>{},
      signInAnonymously:async()=>({}), signInWithEmailAndPassword:async()=>({}),
      storage, isOnline:()=>true, verifyOwnerBinding:async()=>true, genOpId:()=>'op-b3' }); c.init(); return c; }

  { // read failure AFTER remote ack
    let failRead=false; const m=new Map();
    const store={ getItem:k=>{ if(failRead) throw new Error('READ_FAIL'); return m.has(k)?m.get(k):null; }, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k) };
    const ctrl=ctrlWith(store);
    const r=await ctrl.guardedSaleWrite(sale(), async()=>{ failRead=true; }); // remote ack ok, then cleanup read fails
    ok(r.ok===false && r.remoteCommitted===true && r.recoveryRequired===true,'B3: cleanup READ failure after ack => recovery-required (not false success)'); }
  { // write failure AFTER remote ack
    let failWrite=false; const m=new Map();
    const store={ getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>{ if(failWrite && k==='sm_pending_sale_writes') throw new Error('WRITE_FAIL'); m.set(k,String(v)); }, removeItem:k=>m.delete(k) };
    const ctrl=ctrlWith(store);
    const r=await ctrl.guardedSaleWrite(sale(), async()=>{ failWrite=true; });
    ok(r.ok===false && r.remoteCommitted===true && r.recoveryRequired===true,'B3: cleanup WRITE failure after ack => recovery-required'); }
  { // flush cleanup failure surfaces recoveryRequired and does NOT report cleared
    let failWrite=false; const m=new Map();
    const store={ getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>{ if(failWrite && k==='sm_pending_sale_writes') throw new Error('WRITE_FAIL'); m.set(k,String(v)); }, removeItem:k=>m.delete(k) };
    const ctrl=ctrlWith(store);
    // queue one while offline-like (writeFn not called): force queue by making writeFn reject once
    await ctrl.guardedSaleWrite(sale(), async()=>{ throw new Error('offline'); });
    failWrite=true;
    const res=await ctrl.flushPendingSales(async()=>{ /* remote ok */ });
    ok(res.recoveryRequired===true && res.flushed===0,'B3: flush cleanup failure => recoveryRequired, not reported cleared'); }

  // end-to-end: bound owner -> guardedSaleWrite -> deterministic writer -> exactly one
  { const db=await newDb(); const h=createOwnerBindingHandler({db,secret:SECRET});
    await h.bindOwner({roomCode:'BBMANN',claimToken:claim('BBMANN','n20','ownerA')},ctx('ownerA','password'));
    const verify=createOwnerVerifier(db,'BBMANN'); const writer=createRtdbSaleWriter(db,'BBMANN');
    const ctrl=createAuthController({ auth:{currentUser:{uid:'ownerA',isAnonymous:false,providerData:[{providerId:'password'}]}},
      onAuthStateChanged:(a,cb)=>{cb(a.currentUser);return()=>{};}, signOut:async()=>{}, signInAnonymously:async()=>({}), signInWithEmailAndPassword:async()=>({}),
      storage:memStorage(), isOnline:()=>true, verifyOwnerBinding:verify, genOpId:()=>'op-e2e' }); ctrl.init();
    ok((await ctrl.isOwnerAuthorized())===true,'e2e: bound owner authorized');
    const r=await ctrl.guardedSaleWrite(sale(), writer);
    ok(r.ok===true,'e2e: guarded write ok');
    ok(Object.keys((await db.ref('rooms/BBMANN/salesRecords').once('value')).val()||{}).length===1,'e2e: exactly one sale'); }

  console.log('\n=== R2 SUITE: ' + pass + '/' + (pass+fail) + ' PASS, ' + fail + ' FAIL ===');
  process.exit(fail===0 ? 0 : 1);
})().catch(e => { console.error('RUNNER ERROR', e && e.stack || e); process.exit(2); });

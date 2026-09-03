/**
 * StallMate P0 R1 — Auth emulator suite. Runs against the Firebase Auth emulator.
 *   firebase emulators:exec --only auth --project demo-p0 "node p0_r1_auth_tests.js"
 * Exercises the client-auth foundation (p0_r1_stallmate_auth.js). Synthetic only; no prod, no rules.
 * Exit 0 iff all pass.
 */
'use strict';
const path = require('path');
const { initializeApp, deleteApp } = require('firebase/app');
const {
  getAuth, connectAuthEmulator, signInAnonymously, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged, onIdTokenChanged
} = require('firebase/auth');
const { createAuthController, withTimeout } = require(path.join(__dirname, 'p0_r1_stallmate_auth.js'));

let pass = 0, fail = 0;
function ok(cond, label){ if (cond){ pass++; console.log('  PASS ' + label); } else { fail++; console.log('  FAIL ' + label); } }

function memStorage(){ const m = new Map(); return {
  getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k), _m:m }; }

let appN = 0;
function newController(opts){
  opts = opts || {};
  const app = initializeApp({ apiKey:'demo-key', projectId:'demo-p0', authDomain:'localhost' }, 'app'+(++appN));
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings:true });
  const storage = opts.storage || memStorage();
  let online = opts.online !== undefined ? opts.online : true;
  const ctrl = createAuthController({
    auth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged, onIdTokenChanged,
    storage, isOnline:()=>online, now:()=>Date.now(), genOpId:()=> 'op_'+(++appN)+'_'+Date.now(),
    timeoutMs: opts.timeoutMs || 15000
  });
  ctrl.init();
  return { ctrl, auth, app, storage, setOnline:(v)=>{online=v;} };
}

const sale = () => ({ id:'s1', orderId:'o1', time:1, total:250, totalSatang:25000, cashAmount:250, cashSatang:25000 });

(async () => {
  console.log('=== StallMate P0 R1 — Auth emulator suite ===');

  // 1. anonymous = transitional device identity, NOT owner
  {
    const { ctrl } = newController();
    const id = await ctrl.signInAnon();
    ok(id.signedIn && id.isAnonymous && id.permanentOwnerIdentity === false, 'anonymous sign-in = signed-in, isAnonymous, NOT permanent owner');
    ok(ctrl.isPermanentOwnerIdentity() === false, 'anonymous is not permanent owner identity');
    ok(ctrl.assertNotOwnerAuthority('anonymous') === false
       && ctrl.assertNotOwnerAuthority('deviceId') === false
       && ctrl.assertNotOwnerAuthority('roomCode') === false
       && ctrl.assertNotOwnerAuthority('pin') === false, 'anon/device/roomCode/PIN never confer owner authority');
  }

  // 2. permanent owner sign-in pathway
  let ownerEmail = 'owner+'+Date.now()+'@example.com', ownerPw = 'ownerPass123';
  {
    const { ctrl, auth } = newController();
    await createUserWithEmailAndPassword(auth, ownerEmail, ownerPw); // provision in emulator
    const id = await ctrl.signInOwner(ownerEmail, ownerPw);
    ok(id.signedIn && id.isAnonymous === false && id.permanentOwnerIdentity === true, 'owner sign-in = permanent owner identity');
    ok(ctrl.isPermanentOwnerIdentity() === true, 'isPermanentOwnerIdentity true for owner');
  }

  // 3. sign-out + re-auth
  {
    const { ctrl, auth } = newController();
    const em='reauth+'+Date.now()+'@example.com';
    await createUserWithEmailAndPassword(auth, em, 'pw123456');
    await ctrl.signInOwner(em, 'pw123456');
    await ctrl.signOut();
    ok(ctrl.getIdentity().signedIn === false, 'sign-out clears identity');
    const id2 = await ctrl.reAuthOwner(em, 'pw123456');
    ok(id2.permanentOwnerIdentity === true, 're-authentication restores permanent owner identity');
  }

  // 4. auth timeout (DI hang) — surfaced, not swallowed
  {
    const storage = memStorage();
    const hang = createAuthController({
      auth:{currentUser:null}, signInAnonymously:()=>new Promise(()=>{}), signInWithEmailAndPassword:()=>new Promise(()=>{}),
      signOut:async()=>{}, onAuthStateChanged:()=>()=>{}, storage, isOnline:()=>true, timeoutMs:150
    });
    hang.init();
    let threw=false; try { await hang.signInAnon(); } catch(e){ threw = /AUTH_TIMEOUT/.test(e.message); }
    ok(threw, 'auth timeout rejects with AUTH_TIMEOUT (not silent)');
  }

  // 5. OFFLINE: sale must be QUEUED, never dropped or altered
  {
    const { ctrl, auth, storage, setOnline } = newController();
    const em='off+'+Date.now()+'@example.com'; await createUserWithEmailAndPassword(auth, em,'pw123456'); await ctrl.signInOwner(em,'pw123456');
    setOnline(false);
    const written=[]; const s=sale();
    const r = await ctrl.guardedSaleWrite(s, async(x)=>{ written.push(x); });
    ok(r.ok===false && r.queued===true && r.reason==='offline', 'offline sale = queued, not written');
    ok(written.length===0 && ctrl.pendingCount()===1, 'offline sale not durably written; 1 pending');
  }

  // 6. NOT permanent owner (anonymous) sale write cannot silently drop
  {
    const { ctrl } = newController();
    await ctrl.signInAnon();
    const written=[]; const r = await ctrl.guardedSaleWrite(sale(), async(x)=>{ written.push(x); });
    ok(r.ok===false && r.queued===true && r.reason==='not_permanent_owner', 'anon sale write blocked+queued (not dropped)');
    ok(written.length===0 && ctrl.pendingCount()===1, 'anon sale not written; queued');
  }

  // 7. durable write FAILS -> fail-closed queue (not dropped)
  {
    const { ctrl, auth } = newController();
    const em='wf+'+Date.now()+'@example.com'; await createUserWithEmailAndPassword(auth, em,'pw123456'); await ctrl.signInOwner(em,'pw123456');
    const r = await ctrl.guardedSaleWrite(sale(), async()=>{ throw new Error('rtdb down'); });
    ok(r.ok===false && r.queued===true && r.reason==='write_failed', 'write failure = queued fail-closed');
    ok(ctrl.pendingCount()===1, 'failed sale retained in queue');
  }

  // 8. success path
  {
    const { ctrl, auth } = newController();
    const em='okk+'+Date.now()+'@example.com'; await createUserWithEmailAndPassword(auth, em,'pw123456'); await ctrl.signInOwner(em,'pw123456');
    const written=[]; const r = await ctrl.guardedSaleWrite(sale(), async(x)=>{ written.push(x); });
    ok(r.ok===true && written.length===1 && ctrl.pendingCount()===0, 'authed+online+durable success writes once, no queue');
  }

  // 9. expired/sign-out then flush after re-auth; financial invariants preserved
  {
    const { ctrl, auth, setOnline } = newController();
    const em='flush+'+Date.now()+'@example.com'; await createUserWithEmailAndPassword(auth, em,'pw123456'); await ctrl.signInOwner(em,'pw123456');
    setOnline(false);
    const s1=sale(); s1.id='sa'; s1.__opId='opA';
    const s2=sale(); s2.id='sb'; s2.__opId='opB'; s2.total=99.5; s2.totalSatang=9950; s2.cashAmount=99.5; s2.cashSatang=9950;
    await ctrl.guardedSaleWrite(s1, async()=>{});
    await ctrl.guardedSaleWrite(s2, async()=>{});
    ok(ctrl.pendingCount()===2, 'two offline sales queued');
    // expiry simulation: sign out while queued
    await ctrl.signOut();
    const blocked = await ctrl.flushPendingSales(async()=>{});
    ok(blocked.flushed===0 && blocked.blocked==='not_permanent_owner', 'flush blocked while not owner (no silent write)');
    // re-auth + online + flush
    await ctrl.reAuthOwner(em,'pw123456'); setOnline(true);
    const written=[];
    const res = await ctrl.flushPendingSales(async(x)=>{ written.push(JSON.parse(JSON.stringify(x))); });
    ok(res.flushed===2 && res.remaining===0 && ctrl.pendingCount()===0, 'flush after re-auth writes all queued, none dropped');
    const byId = Object.fromEntries(written.map(w=>[w.id,w]));
    ok(byId.sa && byId.sa.totalSatang===25000 && byId.sa.cashSatang===25000, 'financial invariant preserved on flush (sa)');
    ok(byId.sb && byId.sb.totalSatang===9950 && byId.sb.total===99.5, 'financial invariant preserved on flush (sb, no mutation)');
  }

  // 10. dedupe by opId (double submit) — write once
  {
    const { ctrl, auth, setOnline } = newController();
    const em='dup+'+Date.now()+'@example.com'; await createUserWithEmailAndPassword(auth, em,'pw123456'); await ctrl.signInOwner(em,'pw123456');
    setOnline(false);
    const s=sale(); s.__opId='dupOp';
    await ctrl.guardedSaleWrite(s, async()=>{});
    await ctrl.guardedSaleWrite(s, async()=>{});
    ok(ctrl.pendingCount()===1, 'duplicate opId enqueued once');
    setOnline(true); await ctrl.reAuthOwner(em,'pw123456');
    const written=[]; const res = await ctrl.flushPendingSales(async(x)=>{written.push(x);});
    ok(res.flushed===1 && written.length===1, 'dedupe: flushed once');
  }

  console.log('\n=== R1 AUTH SUITE: ' + pass + '/' + (pass+fail) + ' PASS, ' + fail + ' FAIL ===');
  process.exit(fail===0 ? 0 : 1);
})().catch(e => { console.error('RUNNER ERROR', e); process.exit(2); });

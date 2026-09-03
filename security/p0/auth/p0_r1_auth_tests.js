/**
 * StallMate P0 R1 — Auth emulator suite (HOLD-1 CORRECTED). Runs against the Firebase Auth emulator:
 *   firebase emulators:exec --only auth --project demo-p0 "node p0_r1_auth_tests.js"
 * Covers BLOCKER-1 (identity != owner authority via injected verifier) and BLOCKER-2 (durable
 * idempotency: writeFn(snapshot,opId) deterministic key, queue-first, exactly-once). Synthetic only.
 */
'use strict';
const path = require('path');
const { initializeApp } = require('firebase/app');
const {
  getAuth, connectAuthEmulator, signInAnonymously, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged, onIdTokenChanged
} = require('firebase/auth');
const { createAuthController } = require(path.join(__dirname, 'p0_r1_stallmate_auth.js'));

let pass = 0, fail = 0;
function ok(c, label){ if (c){ pass++; console.log('  PASS ' + label); } else { fail++; console.log('  FAIL ' + label); } }
function memStorage(){ const m = new Map(); return { getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k), _m:m }; }

let n = 0;
function newController(opts){
  opts = opts || {};
  const app = initializeApp({ apiKey:'demo-key', projectId:'demo-p0', authDomain:'localhost' }, 'app'+(++n));
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings:true });
  const storage = opts.storage || memStorage();
  let online = opts.online !== undefined ? opts.online : true;
  const authz = opts.authz || { boundUids: new Set() };
  const ctrl = createAuthController({
    auth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged, onIdTokenChanged,
    storage, isOnline:()=>online, now:()=>Date.now(), genOpId:()=>'op_'+(++n)+'_'+Date.now(), timeoutMs:15000,
    verifyOwnerBinding: opts.noVerifier ? undefined : async (uid)=> authz.boundUids.has(uid)
  });
  ctrl.init();
  return { ctrl, auth, storage, authz, setOnline:(v)=>{online=v;} };
}
const sale = () => ({ id:'s1', orderId:'o1', time:1, total:250, totalSatang:25000, cashAmount:250, cashSatang:25000 });
const mkUser = async (auth) => { const em='u'+(++n)+'_'+Date.now()+'@ex.com'; await createUserWithEmailAndPassword(auth, em, 'pw123456'); return em; };

(async () => {
  console.log('=== StallMate P0 R1 — Auth emulator suite (HOLD-1 CORRECTED) ===');

  // ---------- identity ----------
  { const { ctrl } = newController();
    const id = await ctrl.signInAnon();
    ok(id.signedIn && id.isAnonymous && id.permanentIdentity===false, 'anonymous = permanentIdentity false');
    ok(ctrl.assertNotOwnerAuthority('anonymous')===false && ctrl.assertNotOwnerAuthority('deviceId')===false
       && ctrl.assertNotOwnerAuthority('roomCode')===false && ctrl.assertNotOwnerAuthority('pin')===false,
       'anon/device/roomCode/PIN never confer owner authority'); }

  { const { ctrl, auth } = newController();
    const em = await mkUser(auth); const id = await ctrl.signInOwner(em,'pw123456');
    ok(id.permanentIdentity===true && id.isAnonymous===false, 'owner sign-in = permanentIdentity true'); }

  // ---------- BLOCKER-1: identity != owner authority ----------
  { const { ctrl } = newController();
    await ctrl.signInAnon();
    ok((await ctrl.isOwnerAuthorized())===false, 'B1: anonymous identity => ownerAuthorized DENY'); }

  { const { ctrl, auth } = newController(); // verifier present, but uid not bound
    const em = await mkUser(auth); await ctrl.signInOwner(em,'pw123456');
    ok((await ctrl.isOwnerAuthorized())===false, 'B1: arbitrary permanent UNBOUND user => DENY'); }

  { const { ctrl, auth, authz } = newController();
    authz.boundUids.add('some-other-uid'); // binding exists but for a different uid
    const em = await mkUser(auth); await ctrl.signInOwner(em,'pw123456');
    ok((await ctrl.isOwnerAuthorized())===false, 'B1: wrong permanent UID => DENY'); }

  { const { ctrl, auth, authz } = newController();
    const em = await mkUser(auth); const id = await ctrl.signInOwner(em,'pw123456');
    authz.boundUids.add(id.uid);
    ok((await ctrl.isOwnerAuthorized())===true, 'B1: bound permanent owner => ALLOW'); }

  { const { ctrl, auth, authz } = newController();
    const em = await mkUser(auth); const id = await ctrl.signInOwner(em,'pw123456');
    authz.boundUids.add(id.uid);
    ok((await ctrl.isOwnerAuthorized())===true, 'B1: bound owner initially ALLOW');
    authz.boundUids.delete(id.uid); // binding revoked after prior success
    ok((await ctrl.isOwnerAuthorized())===false, 'B1: binding revoked after success => DENY (no indefinite cache)'); }

  { const { ctrl, auth, authz } = newController();
    const em = await mkUser(auth); const id = await ctrl.signInOwner(em,'pw123456'); authz.boundUids.add(id.uid);
    ok((await ctrl.isOwnerAuthorized())===true, 'B1: owner authorized before sign-out');
    await ctrl.signOut();
    ok((await ctrl.isOwnerAuthorized())===false, 'B1: sign-out clears owner authority'); }

  // pre-R2: no verifier injected => always DENY
  { const { ctrl, auth } = newController({ noVerifier:true });
    const em = await mkUser(auth); await ctrl.signInOwner(em,'pw123456');
    ok((await ctrl.isOwnerAuthorized())===false, 'B1: no verifier (pre-R2) => ownerAuthorized defaults false'); }

  // guardedSaleWrite requires owner authorization
  { const { ctrl, auth } = newController();
    const em = await mkUser(auth); await ctrl.signInOwner(em,'pw123456'); // permanent but unbound
    const db = new Map(); const r = await ctrl.guardedSaleWrite(sale(), async(s,op)=>db.set(op,s));
    ok(r.ok===false && r.reason==='not_owner_authorized' && db.size===0, 'B1: unbound owner sale write DENIED+queued (not written)'); }

  // ---------- BLOCKER-2: durable idempotency ----------
  // deterministic key = opId; remote commit succeeds but client sees timeout -> replay -> exactly one
  { const { ctrl, auth, authz, storage } = newController();
    const em = await mkUser(auth); const id = await ctrl.signInOwner(em,'pw123456'); authz.boundUids.add(id.uid);
    const db = new Map();
    const writerCommitThenTimeout = async (snap, op) => { db.set(op, snap); throw new Error('client timeout after commit'); };
    const r1 = await ctrl.guardedSaleWrite(sale(), writerCommitThenTimeout);
    ok(r1.ok===false && r1.queued===true && db.size===1, 'B2: commit-then-timeout => queued, db has 1 (same key)');
    const opId = r1.opId;
    // replay uses SAME opId/key
    const writerOk = async (snap, op) => { db.set(op, snap); };
    let replayKey=null; const res = await ctrl.flushPendingSales(async(snap,op)=>{ replayKey=op; return writerOk(snap,op); });
    ok(replayKey===opId, 'B2: replay uses same deterministic key (opId)');
    ok(db.size===1 && res.flushed===1 && ctrl.pendingCount()===0, 'B2: after replay exactly ONE sale, queue cleared'); }

  // refresh/restart then replay still exactly one (new controller, same storage + same key)
  { const { ctrl, auth, authz, storage } = newController();
    const em = await mkUser(auth); const id = await ctrl.signInOwner(em,'pw123456'); authz.boundUids.add(id.uid);
    const db = new Map();
    const r1 = await ctrl.guardedSaleWrite(sale(), async(s,op)=>{ db.set(op,s); throw new Error('timeout'); });
    ok(db.size===1 && ctrl.pendingCount()===1, 'B2: pre-restart committed once, still queued');
    // simulate restart: new controller reusing SAME storage + authz
    const restart = newController({ storage, authz });
    const id2 = await restart.ctrl.signInOwner(em,'pw123456'); // authz.boundUids already has id.uid (same account)
    const res = await restart.ctrl.flushPendingSales(async(s,op)=>{ db.set(op,s); });
    ok(db.size===1 && res.flushed===1, 'B2: restart + replay => still exactly one sale'); }

  // mutated caller object cannot alter queued snapshot
  { const { ctrl, auth, authz, storage, setOnline } = newController();
    const em = await mkUser(auth); const id = await ctrl.signInOwner(em,'pw123456'); authz.boundUids.add(id.uid);
    setOnline(false);
    const s = sale();
    const r = await ctrl.guardedSaleWrite(s, async()=>{});
    s.total = 99999; s.totalSatang = 9999900; s.id = 'HACKED'; // mutate AFTER queueing
    const q = JSON.parse(storage.getItem(ctrl._PENDING_KEY));
    const snap = q.find(e=>e.opId===r.opId).snapshot;
    ok(snap.total===250 && snap.totalSatang===25000 && snap.id==='s1', 'B2: mutated caller object cannot alter queued snapshot'); }

  // storage failure surfaced and write NOT attempted
  { const failStore = { getItem:()=>null, setItem:()=>{ throw new Error('DISK_FULL'); }, removeItem:()=>{} };
    const { ctrl, auth, authz } = newController({ storage: failStore });
    const em = await mkUser(auth); const id = await ctrl.signInOwner(em,'pw123456'); authz.boundUids.add(id.uid);
    let attempted=false, threw=false;
    try { await ctrl.guardedSaleWrite(sale(), async()=>{ attempted=true; }); } catch(e){ threw=true; }
    ok(threw===true && attempted===false, 'B2: storage failure surfaced, network write NOT attempted'); }

  // success path (bound owner, online) writes once to deterministic key
  { const { ctrl, auth, authz } = newController();
    const em = await mkUser(auth); const id = await ctrl.signInOwner(em,'pw123456'); authz.boundUids.add(id.uid);
    const db = new Map(); const s = sale(); s.__opId='fixedKey1';
    const r = await ctrl.guardedSaleWrite(s, async(snap,op)=>db.set(op,snap));
    ok(r.ok===true && db.has('fixedKey1') && db.size===1 && ctrl.pendingCount()===0, 'B2: success writes once at opId key, queue empty'); }

  // offline queue + financial invariants preserved on flush
  { const { ctrl, auth, authz, setOnline } = newController();
    const em = await mkUser(auth); const id = await ctrl.signInOwner(em,'pw123456'); authz.boundUids.add(id.uid);
    setOnline(false);
    const s2 = sale(); s2.__opId='fk2'; s2.total=99.5; s2.totalSatang=9950; s2.cashSatang=9950;
    await ctrl.guardedSaleWrite(s2, async()=>{});
    ok(ctrl.pendingCount()===1, 'offline sale queued');
    setOnline(true);
    const db=new Map(); const res = await ctrl.flushPendingSales(async(snap,op)=>db.set(op,snap));
    ok(res.flushed===1 && db.get('fk2').totalSatang===9950 && db.get('fk2').total===99.5, 'financial invariant preserved on flush'); }

  // auth timeout surfaced (DI hang)
  { const storage = memStorage();
    const hang = createAuthController({ auth:{currentUser:null}, signInAnonymously:()=>new Promise(()=>{}),
      signInWithEmailAndPassword:()=>new Promise(()=>{}), signOut:async()=>{}, onAuthStateChanged:()=>()=>{},
      storage, isOnline:()=>true, timeoutMs:150 });
    hang.init(); let threw=false; try{ await hang.signInAnon(); }catch(e){ threw=/AUTH_TIMEOUT/.test(e.message); }
    ok(threw, 'auth timeout rejects AUTH_TIMEOUT (surfaced)'); }

  console.log('\n=== R1 AUTH SUITE: ' + pass + '/' + (pass+fail) + ' PASS, ' + fail + ' FAIL ===');
  process.exit(fail===0 ? 0 : 1);
})().catch(e => { console.error('RUNNER ERROR', e); process.exit(2); });

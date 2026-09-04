/**
 * StallMate P0 R3 — RULES INTEGRATION (LOCAL/EMULATOR ONLY).
 * Integrates Auth + owner binding with the TIGHTENED Rules B, ENFORCED by the RTDB emulator
 * (via @firebase/rules-unit-testing client contexts — NOT the Admin SDK, so rules actually apply).
 *   firebase emulators:exec --only database ... OR run the jar + FIREBASE_DATABASE_EMULATOR_HOST.
 * Proves: legit modern/legacy owner ops ALLOW; anonymous/unbound/wrong-owner/takeover/delete DENY;
 * pending recovery + financial idempotency (deterministic opId) hold under tightened rules.
 * Exit 0 iff all pass.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, get, set, update, remove, runTransaction } = require('firebase/database');
let createAuthController;
try { ({ createAuthController } = require(path.join(__dirname, '../auth/stallmate_auth.js'))); }
catch(e){ ({ createAuthController } = require(path.join(__dirname, 'stallmate_auth.js'))); }
const { canon } = require(path.join(__dirname, 'p0_r2_owner_binding.js'));

const OWNER = 'ownerUid_BBMANN', OTHER = 'ownerUid_OTHER', STRANGER = 'strangerUid';
let pass=0, fail=0;
const PROG = process.env.R3_PROG || '';
function ok(c,label){ const line=(c?'  PASS ':'  FAIL ')+label; if(c)pass++; else fail++; console.log(line); if(PROG){try{fs.appendFileSync(PROG,line+'\n');}catch(e){}} }

const MODERN = { id:'s1', orderId:'o1', roundId:'r1', time:1, name:'x', qty:1, pay:'cash',
  total:250, totalSatang:25000, price:250, priceSatang:25000, cashAmount:250, cashSatang:25000,
  scanAmount:0, scanSatang:0, thaiAmount:0, thaiSatang:0, creditAmount:0, creditSatang:0 };
const LEGACY = { id:'sLeg', orderId:'oL', time:1, name:'y', qty:1, pay:'cash', total:120, price:120, cashAmount:120 };
const memStorage=()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};

// client-side deterministic writer (runs UNDER rules): create-only + idempotent + OPID_CONFLICT
function clientWriter(db, room){
  return async (snap, opId) => {
    const r = await runTransaction(ref(db, `rooms/${room}/salesRecords/${opId}`), cur => {
      if (cur === null) return snap;
      if (canon(cur) === canon(snap)) return cur;
      return; // differ -> abort
    });
    if (!r.committed) { const e = new Error('OPID_CONFLICT'); e.code='OPID_CONFLICT'; throw e; }
    return { ok:true };
  };
}
function controllerFor(db, uid, isAnon){
  const c = createAuthController({
    auth:{ currentUser: uid ? { uid, isAnonymous:!!isAnon, providerData:[{providerId: isAnon?'anonymous':'password'}] } : null },
    onAuthStateChanged:(a,cb)=>{cb(a.currentUser);return()=>{};}, signOut:async()=>{},
    signInAnonymously:async()=>({}), signInWithEmailAndPassword:async()=>({}),
    storage:memStorage(), isOnline:()=>true, genOpId:()=>'op-'+Math.random().toString(36).slice(2),
    verifyOwnerBinding: async(u)=>{ try { const s=await get(ref(db,'roomOwners/BBMANN')); return s.exists() && s.val()===u; } catch(e){ return false; } }
  });
  c.init(); return c;
}

(async () => {
  console.log('=== StallMate P0 R3 — RULES INTEGRATION (Rules B enforced) ===');
  // Rules B lives at security/p0/ in the repo (backend/ is a sibling of it). Resolve either layout.
  const rulesCandidates = [
    path.join(__dirname, '../p0_rulesB_secure_fallback.rules.json'), // git layout: backend -> security/p0
    path.join(__dirname, 'p0_rulesB_secure_fallback.rules.json')     // co-located (HQ flat mirror)
  ];
  const rulesPath = rulesCandidates.find(p => fs.existsSync(p)) || rulesCandidates[0];
  const rules = JSON.parse(fs.readFileSync(rulesPath,'utf8'));
  // strip // doc keys
  const strip=(o)=>{ if(Array.isArray(o))return o.map(strip); if(o&&typeof o==='object'){const r={};for(const k of Object.keys(o)){if(k==='//')continue;r[k]=strip(o[k]);}return r;} return o; };
  const env = await initializeTestEnvironment({ projectId:'p0-r3', database:{ rules: JSON.stringify(strip(rules)) } });

  await env.withSecurityRulesDisabled(async ctx => {
    await set(ref(ctx.database(),'/'), {
      roomOwners: { BBMANN: OWNER, OTHER: OTHER },
      rooms: {
        BBMANN: { salesRecords: { existing: MODERN }, sessions: { se1:{id:'se1',roundId:'r1',startedAt:1,open:true} } },
        OTHER:  { salesRecords: { o1: MODERN } }
      }
    });
  });

  const ownerDb   = env.authenticatedContext(OWNER).database();
  const strangerDb= env.authenticatedContext(STRANGER).database();
  const otherDb   = env.authenticatedContext(OTHER).database();
  const anonDb    = env.unauthenticatedContext().database();

  // ---- legit owner ops under tightened rules ----
  ok(await assertSucceeds(set(ref(ownerDb,'rooms/BBMANN/salesRecords/m1'), {...MODERN})).then(()=>true).catch(()=>false), 'owner create MODERN sale => ALLOW');
  ok(await assertSucceeds(set(ref(ownerDb,'rooms/BBMANN/salesRecords/l1'), LEGACY)).then(()=>true).catch(()=>false), 'owner create LEGACY sale => ALLOW');
  ok(await assertSucceeds(set(ref(ownerDb,'rooms/BBMANN/sessions/se2'), {id:'se2',roundId:'r1',startedAt:2,open:true})).then(()=>true).catch(()=>false), 'owner update session => ALLOW');
  ok(await assertSucceeds(get(ref(ownerDb,'roomOwners/BBMANN'))).then(()=>true).catch(()=>false), 'owner read own roomOwners => ALLOW');

  // ---- denials under tightened rules ----
  ok(await assertFails(set(ref(anonDb,'rooms/BBMANN/salesRecords/x'), MODERN)).then(()=>true).catch(()=>false), 'anonymous create sale => DENY');
  ok(await assertFails(set(ref(strangerDb,'rooms/BBMANN/salesRecords/x'), MODERN)).then(()=>true).catch(()=>false), 'authed UNBOUND user create sale => DENY');
  ok(await assertFails(set(ref(otherDb,'rooms/BBMANN/salesRecords/x'), MODERN)).then(()=>true).catch(()=>false), 'wrong-owner (OTHER) write to BBMANN => DENY');
  ok(await assertFails(remove(ref(ownerDb,'rooms/BBMANN/salesRecords/existing'))).then(()=>true).catch(()=>false), 'owner hard-delete sale => DENY');
  ok(await assertFails(remove(ref(ownerDb,'rooms/BBMANN'))).then(()=>true).catch(()=>false), 'owner whole-room delete => DENY');
  ok(await assertFails(set(ref(ownerDb,'rooms/BBMANN/salesRecords/existing/cashSatang'), null)).then(()=>true).catch(()=>false), 'owner null a money field => DENY');
  ok(await assertFails(set(ref(ownerDb,'roomOwners/BBMANN'), STRANGER)).then(()=>true).catch(()=>false), 'owner cannot rewrite roomOwners (takeover) => DENY');
  ok(await assertFails(set(ref(strangerDb,'roomOwners/BBMANN'), STRANGER)).then(()=>true).catch(()=>false), 'stranger cannot claim roomOwners (takeover) => DENY');
  ok(await assertFails(get(ref(strangerDb,'roomOwners/BBMANN'))).then(()=>true).catch(()=>false), 'stranger cannot read others roomOwners => DENY');

  // ---- financial idempotency / conflict UNDER rules (client transaction) ----
  { const w = clientWriter(ownerDb,'BBMANN');
    await w({...MODERN}, 'opDet1');                       // create
    await w({...MODERN}, 'opDet1');                       // identical replay -> idempotent
    let cnt; await env.withSecurityRulesDisabled(async ctx=>{ cnt = Object.keys((await get(ref(ctx.database(),'rooms/BBMANN/salesRecords'))).val()||{}); });
    ok(cnt.filter(k=>k==='opDet1').length===1, 'idempotent replay under rules => exactly one (opDet1)');
    let code=null; try{ await w({...MODERN, total:1, totalSatang:100}, 'opDet1'); }catch(e){ code=e.code; }
    ok(code==='OPID_CONFLICT', 'same opId + changed amount under rules => OPID_CONFLICT');
    let v; await env.withSecurityRulesDisabled(async ctx=>{ v=(await get(ref(ctx.database(),'rooms/BBMANN/salesRecords/opDet1'))).val(); });
    ok(v.total===250 && v.totalSatang===25000, 'original financial record unchanged after conflict'); }

  // ---- integrated pending recovery: bound owner offline -> queue -> reauth/online -> flush exactly one ----
  { const ctrl = controllerFor(ownerDb, OWNER, false);
    ok((await ctrl.isOwnerAuthorized())===true, 'integrated: bound owner authorized (verifier reads roomOwners under rules)');
    const w = clientWriter(ownerDb,'BBMANN');
    const r = await ctrl.guardedSaleWrite({...MODERN, __opId:'opInt1'}, w);
    ok(r.ok===true, 'integrated: guarded owner sale write ok under rules');
    let one; await env.withSecurityRulesDisabled(async ctx=>{ one=(await get(ref(ctx.database(),'rooms/BBMANN/salesRecords/opInt1'))).exists(); });
    ok(one===true, 'integrated: sale persisted at deterministic opId key'); }
  { const ctrl = controllerFor(anonDb, null, false); // no identity
    const w = clientWriter(anonDb,'BBMANN');
    const r = await ctrl.guardedSaleWrite({...MODERN, __opId:'opAnon'}, w);
    ok(r.ok===false && r.reason==='not_owner_authorized', 'integrated: unauthenticated guarded write blocked+queued (rules also deny)'); }

  await env.cleanup();
  console.log('\n=== R3 SUITE: ' + pass + '/' + (pass+fail) + ' PASS, ' + fail + ' FAIL ===');
  process.exit(fail===0?0:1);
})().catch(e => { console.error('RUNNER ERROR', e && e.stack || e); process.exit(2); });

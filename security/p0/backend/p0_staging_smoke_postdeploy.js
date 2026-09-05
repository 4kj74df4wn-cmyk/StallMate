/**
 * StallMate P0 — POST-DEPLOY STAGING SMOKE (PREPARED — DO NOT RUN until SR2 deployed). PRE-SR2 CORRECTED.
 * Runs against LIVE staging: real Firebase Auth (synthetic identities) + deployed `bindOwner` callable
 * + real staging RTDB. Redacted output. Exit non-zero on any failure. NO production data/secret/token.
 *
 * Env (NOT committed): STAGING_API_KEY, STAGING_AUTH_DOMAIN, STAGING_PROJECT_ID, STAGING_DATABASE_URL,
 *   OWNER_BIND_SECRET (out-of-band). Cleanup uses firebase-admin against staging (GOOGLE_APPLICATION_CREDENTIALS,
 *   limited-privilege staging service account) — required to delete fixtures/test users under tightened rules.
 * Usage (post-SR2, June's machine): node p0_staging_smoke_postdeploy.js
 * PREPARED: no PASS result until a real staging deploy. Pre-deploy local logic = p0_staging_smoke_test.js (7/7).
 */
'use strict';
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const { getDatabase, ref, get } = require('firebase/database');
const admin = require('firebase-admin');
const { signClaim } = require(path.join(__dirname, 'p0_r2_owner_binding.js'));

const STAGING_PROJECT = 'stallmate-staging-2026-5f39f';   // exact allowlist
const PROD = 'stallmate-9caac';
function need(v,n){ if(!v){console.error('missing env '+n);process.exit(3);} return v; }
const CFG = {
  apiKey: need(process.env.STAGING_API_KEY,'STAGING_API_KEY'),
  authDomain: need(process.env.STAGING_AUTH_DOMAIN,'STAGING_AUTH_DOMAIN'),
  projectId: need(process.env.STAGING_PROJECT_ID,'STAGING_PROJECT_ID'),
  databaseURL: need(process.env.STAGING_DATABASE_URL,'STAGING_DATABASE_URL')
};
const SECRET = need(process.env.OWNER_BIND_SECRET,'OWNER_BIND_SECRET');
const REGION = 'asia-southeast1';

// ---- strict staging allowlist (exact id + real staging RTDB URL) ----
if (CFG.projectId !== STAGING_PROJECT) { console.error('REFUSING: projectId is not the staging allowlist'); process.exit(2); }
if (CFG.projectId === PROD) { console.error('REFUSING: production project'); process.exit(2); }
if (!/^https:\/\//.test(CFG.databaseURL) || CFG.databaseURL.indexOf(PROD) !== -1
    || !(CFG.databaseURL.indexOf(STAGING_PROJECT) !== -1 && /(firebasedatabase\.app|firebaseio\.com)/.test(CFG.databaseURL))) {
  console.error('REFUSING: STAGING_DATABASE_URL is not a verified staging RTDB instance'); process.exit(2);
}

let pass=0, fail=0; function ok(c,l){ console.log((c?'  PASS ':'  FAIL ')+l); if(c)pass++; else fail++; }
const claim=(room,nonce,uid,ttl=60000,now=Date.now())=>signClaim({roomCode:room,intendedUid:uid,nonce,exp:now+ttl},SECRET);
async function callBind(fns,data){ try{ const r=await httpsCallable(fns,'bindOwner')(data); return {ok:true,data:r.data}; }catch(e){ return {ok:false,code:(e&&e.message)||'error'}; } }
const mkEmail=()=>'smoke_'+Date.now()+'_'+Math.random().toString(36).slice(2)+'@example.com';

const created = { uids:new Set(), rooms:new Set(), nonces:new Set() };
function track(uid,room,nonce){ if(uid)created.uids.add(uid); if(room)created.rooms.add(room); if(nonce)created.nonces.add(nonce); }

(async () => {
  console.log('=== P0 POST-DEPLOY STAGING SMOKE (live callable; synthetic; no prod) ===');
  const app = initializeApp(CFG,'smoke_pd_'+Date.now());
  const auth = getAuth(app); const fns = getFunctions(app,REGION); const db = getDatabase(app);
  const ROOM = 'SMOKEPD_'+Date.now().toString(36);
  // admin (staging only) for cleanup + privileged verification
  let adminApp=null, adb=null;
  try { adminApp = admin.initializeApp({ databaseURL: CFG.databaseURL, projectId: CFG.projectId }, 'smoke_admin');
        if (admin.app('smoke_admin').options.projectId !== STAGING_PROJECT) throw new Error('admin project mismatch');
        adb = admin.database(adminApp); } catch(e){ console.error('admin init failed (cleanup limited):', e.message); }

  try {
    // valid: owner signs in, intended claim -> bind
    const em=mkEmail(); await createUserWithEmailAndPassword(auth,em,'pw123456'); const ownerUid=auth.currentUser.uid; track(ownerUid,ROOM,'n1');
    let r=await callBind(fns,{roomCode:ROOM,claimToken:claim(ROOM,'n1',ownerUid)});
    ok(r.ok===true,'valid owner + intended claim => ALLOW');
    let bound=false; try{ bound=(await get(ref(db,'roomOwners/'+ROOM))).val()===ownerUid; }catch(e){}
    ok(bound,'roomOwners == owner uid (owner-context read)');

    // replay same nonce
    r=await callBind(fns,{roomCode:ROOM,claimToken:claim(ROOM,'n1',ownerUid)});
    ok(r.ok===false && /replayed|already_bound/.test(r.code),'replay => DENY');

    // wrong UID
    await signOut(auth); const em2=mkEmail(); await createUserWithEmailAndPassword(auth,em2,'pw123456'); track(auth.currentUser.uid,ROOM+'_x','n2');
    r=await callBind(fns,{roomCode:ROOM+'_x',claimToken:claim(ROOM+'_x','n2',ownerUid)});
    ok(r.ok===false && /uid_mismatch/.test(r.code),'wrong UID => DENY');

    // anonymous
    await signOut(auth); await signInAnonymously(auth); track(auth.currentUser.uid,ROOM+'_a','n3');
    r=await callBind(fns,{roomCode:ROOM+'_a',claimToken:claim(ROOM+'_a','n3',auth.currentUser.uid)});
    ok(r.ok===false && /anonymous_denied/.test(r.code),'anonymous => DENY');

    // expired / tampered (permanent user)
    await signOut(auth); const em3=mkEmail(); await createUserWithEmailAndPassword(auth,em3,'pw123456'); const u3=auth.currentUser.uid; track(u3,ROOM+'_e','n4'); track(u3,ROOM+'_t','n5');
    r=await callBind(fns,{roomCode:ROOM+'_e',claimToken:signClaim({roomCode:ROOM+'_e',intendedUid:u3,nonce:'n4',exp:Date.now()-1},SECRET)});
    ok(r.ok===false && /expired/.test(r.code),'expired => DENY');
    let t=claim(ROOM+'_t','n5',u3); t=t.slice(0,-2)+(t.slice(-2)==='aa'?'bb':'aa');
    r=await callBind(fns,{roomCode:ROOM+'_t',claimToken:t});
    ok(r.ok===false && /bad_signature/.test(r.code),'tampered => DENY');

    // already-bound + no takeover — read roomOwners AS ORIGINAL OWNER (rules allow only owner), not the attacker
    const emB=mkEmail(); await signOut(auth); await createUserWithEmailAndPassword(auth,emB,'pw123456'); const u4=auth.currentUser.uid; track(u4,ROOM+'_b','n6a');
    await callBind(fns,{roomCode:ROOM+'_b',claimToken:claim(ROOM+'_b','n6a',u4)});
    await signOut(auth); const emC=mkEmail(); await createUserWithEmailAndPassword(auth,emC,'pw123456'); const u5=auth.currentUser.uid; track(u5,ROOM+'_b','n6b');
    r=await callBind(fns,{roomCode:ROOM+'_b',claimToken:claim(ROOM+'_b','n6b',u5)});
    ok(r.ok===false && /already_bound/.test(r.code),'already-bound => DENY');
    // re-auth as original owner u4 to legitimately read the binding (rules permit owner)
    await signOut(auth); await signInWithEmailAndPassword(auth,emB,'pw123456');
    let owner_b=null; try{ owner_b=(await get(ref(db,'roomOwners/'+ROOM+'_b'))).val(); }catch(e){}
    ok(owner_b===u4,'owner unchanged after takeover attempt (owner-context read)');
    await signOut(auth);
  } finally {
    // ---- cleanup (staging only; never production) — report PASS/FAIL ----
    let cok=true;
    try {
      if (adb && admin.app('smoke_admin').options.projectId === STAGING_PROJECT) {
        for (const room of created.rooms){ await adb.ref('roomOwners/'+room).remove(); }
        for (const n of created.nonces){ await adb.ref('ownerBindClaimsUsed/'+n).remove(); }
        // prune audit entries for these rooms
        const aud = await adb.ref('ownerBindAudit').once('value'); const val=aud.val()||{};
        for (const k of Object.keys(val)){ if (created.rooms.has(val[k] && val[k].roomCode)) await adb.ref('ownerBindAudit/'+k).remove(); }
        for (const uid of created.uids){ try { await admin.auth(adminApp).deleteUser(uid); } catch(e){ /* anon/uid may be gone */ } }
      } else { cok=false; console.error('cleanup skipped: admin not on staging'); }
    } catch(e){ cok=false; console.error('cleanup error:', e.message); }
    ok(cok,'cleanup (test users/roomOwners/nonces/audit) removed on staging (never production)');
  }

  console.log('\n=== POST-DEPLOY STAGING SMOKE: '+pass+'/'+(pass+fail)+' PASS, '+fail+' FAIL ===');
  process.exit(fail===0?0:1);
})().catch(e => { console.error('RUNNER ERROR', e && e.message || e); process.exit(2); });

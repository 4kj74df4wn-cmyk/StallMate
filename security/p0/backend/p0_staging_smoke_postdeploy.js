/**
 * StallMate P0 — POST-DEPLOY STAGING SMOKE (PREPARED — DO NOT RUN until SR2 deployed).
 * Runs against the LIVE staging project: real Firebase Auth (synthetic test identities) + the
 * deployed `bindOwner` callable + real staging RTDB. Redacted output. Exit non-zero on any failure.
 * NO production data/secret/token is used or printed.
 *
 * Config via environment (NOT committed):
 *   STAGING_API_KEY, STAGING_AUTH_DOMAIN, STAGING_PROJECT_ID (=stallmate-staging-2026-5f39f),
 *   STAGING_DATABASE_URL, OWNER_BIND_SECRET (out-of-band; same secret the Function holds).
 * Usage (post-SR2, on June's machine): node p0_staging_smoke_postdeploy.js
 *
 * NOTE: This script is committed as PREPARED. No PASS result is generated until a real staging deploy.
 * Pre-deploy local logic is separately proven by p0_staging_smoke_test.js (PRE-DEPLOY LOCAL SMOKE 7/7).
 */
'use strict';
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
const { getDatabase, ref, get } = require('firebase/database');
const { signClaim } = require(path.join(__dirname, 'p0_r2_owner_binding.js'));

function need(v, name){ if (!v) { console.error('missing env ' + name); process.exit(3); } return v; }
const CFG = {
  apiKey: need(process.env.STAGING_API_KEY, 'STAGING_API_KEY'),
  authDomain: need(process.env.STAGING_AUTH_DOMAIN, 'STAGING_AUTH_DOMAIN'),
  projectId: need(process.env.STAGING_PROJECT_ID, 'STAGING_PROJECT_ID'),
  databaseURL: need(process.env.STAGING_DATABASE_URL, 'STAGING_DATABASE_URL')
};
const SECRET = need(process.env.OWNER_BIND_SECRET, 'OWNER_BIND_SECRET');
const REGION = 'asia-southeast1';
if (CFG.projectId === 'stallmate-9caac') { console.error('REFUSING: production project'); process.exit(2); }

let pass=0, fail=0;
function ok(c,l){ console.log((c?'  PASS ':'  FAIL ')+l); if(c)pass++; else fail++; }
const claim = (room,nonce,uid,ttl=60000,now=Date.now()) => signClaim({ roomCode:room, intendedUid:uid, nonce, exp:now+ttl }, SECRET);
async function callBind(fns, data){ try { const r = await httpsCallable(fns,'bindOwner')(data); return { ok:true, data:r.data }; } catch(e){ return { ok:false, code:(e && e.message) || 'error' }; } }
const mkEmail = () => 'smoke_'+Date.now()+'_'+Math.random().toString(36).slice(2)+'@example.com';

(async () => {
  console.log('=== P0 POST-DEPLOY STAGING SMOKE (live callable; synthetic; no prod) ===');
  const app = initializeApp(CFG, 'smoke_pd_'+Date.now());
  const auth = getAuth(app); const fns = getFunctions(app, REGION); const db = getDatabase(app);
  const ROOM = 'SMOKEPD_' + Date.now().toString(36);

  // valid: owner signs in, intended claim -> bind; verify roomOwners == uid
  const em = mkEmail(); await createUserWithEmailAndPassword(auth, em, 'pw123456');
  const ownerUid = auth.currentUser.uid;
  let r = await callBind(fns, { roomCode:ROOM, claimToken:claim(ROOM,'n1',ownerUid) });
  ok(r.ok===true, 'valid owner + intended claim => ALLOW');
  let bound=false; try { bound = (await get(ref(db,'roomOwners/'+ROOM))).val()===ownerUid; } catch(e){}
  ok(bound, 'roomOwners == owner uid (staging RTDB)');

  // replay same nonce -> denied
  r = await callBind(fns, { roomCode:ROOM, claimToken:claim(ROOM,'n1',ownerUid) });
  ok(r.ok===false && /replayed|already_bound/.test(r.code), 'replay/already => DENY');

  // wrong UID: different signed-in user, claim minted for ownerUid
  await signOut(auth); const em2=mkEmail(); await createUserWithEmailAndPassword(auth, em2, 'pw123456');
  r = await callBind(fns, { roomCode: ROOM+'_x', claimToken: claim(ROOM+'_x','n2',ownerUid) });
  ok(r.ok===false && /uid_mismatch/.test(r.code), 'wrong UID => DENY');

  // anonymous
  await signOut(auth); await signInAnonymously(auth);
  r = await callBind(fns, { roomCode: ROOM+'_a', claimToken: claim(ROOM+'_a','n3', auth.currentUser.uid) });
  ok(r.ok===false && /anonymous_denied/.test(r.code), 'anonymous => DENY');

  // expired / tampered (re-auth as a permanent user)
  await signOut(auth); const em3=mkEmail(); await createUserWithEmailAndPassword(auth, em3, 'pw123456'); const u3=auth.currentUser.uid;
  r = await callBind(fns, { roomCode: ROOM+'_e', claimToken: signClaim({roomCode:ROOM+'_e',intendedUid:u3,nonce:'n4',exp:Date.now()-1}, SECRET) });
  ok(r.ok===false && /expired/.test(r.code), 'expired => DENY');
  let t = claim(ROOM+'_t','n5',u3); t = t.slice(0,-2)+(t.slice(-2)==='aa'?'bb':'aa');
  r = await callBind(fns, { roomCode: ROOM+'_t', claimToken: t });
  ok(r.ok===false && /bad_signature/.test(r.code), 'tampered => DENY');

  // already-bound + no takeover
  const em4=mkEmail(); await signOut(auth); await createUserWithEmailAndPassword(auth, em4, 'pw123456'); const u4=auth.currentUser.uid;
  await callBind(fns, { roomCode: ROOM+'_b', claimToken: claim(ROOM+'_b','n6a',u4) });
  await signOut(auth); const em5=mkEmail(); await createUserWithEmailAndPassword(auth, em5, 'pw123456'); const u5=auth.currentUser.uid;
  r = await callBind(fns, { roomCode: ROOM+'_b', claimToken: claim(ROOM+'_b','n6b',u5) });
  ok(r.ok===false && /already_bound/.test(r.code), 'already-bound => DENY');
  let owner_b=null; try{ owner_b=(await get(ref(db,'roomOwners/'+ROOM+'_b'))).val(); }catch(e){}
  ok(owner_b===u4, 'owner unchanged after takeover attempt');

  console.log('\n=== POST-DEPLOY STAGING SMOKE: ' + pass + '/' + (pass+fail) + ' PASS, ' + fail + ' FAIL ===');
  process.exit(fail===0 ? 0 : 1);
})().catch(e => { console.error('RUNNER ERROR', e && e.message || e); process.exit(2); });

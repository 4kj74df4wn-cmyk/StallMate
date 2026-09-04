/**
 * StallMate P0 — STAGING SMOKE TEST (post-deploy verification). HOLD-1 item 6.
 * Validates the owner-binding contract with NO production data.
 *   Pre-deploy (now): runs the handler against the RTDB emulator (proves smoke logic) —
 *     FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 node p0_staging_smoke_test.js
 *   Post-deploy (SR2, staging): the SAME assertions run against the deployed callable via
 *     firebase httpsCallable('bindOwner') using the staging client + a signed test claim.
 * Redacted output only (codes/booleans). Exit 0 iff all pass.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const { signClaim, createOwnerBindingHandler } = require(path.join(__dirname, 'p0_r2_owner_binding.js'));

let pass=0, fail=0; const PROG=process.env.SMOKE_PROG||'';
function ok(c,l){const line=(c?'  PASS ':'  FAIL ')+l;if(c)pass++;else fail++;console.log(line);if(PROG){try{fs.appendFileSync(PROG,line+'\n');}catch(e){}}}

const APP = admin.initializeApp({ databaseURL:'http://127.0.0.1:9000?ns=demo-smoke', projectId:'demo-smoke' }, 'smoke');
const DB = admin.database(APP);
const SECRET = 'staging-smoke-secret';
async function reset(){ await DB.ref('/').set(null); }
const ctx=(uid,prov)=>({auth:{uid,token:{firebase:{sign_in_provider:prov}}}});
const claim=(room,nonce,uid,ttl=60000,now=Date.now())=>signClaim({roomCode:room,intendedUid:uid,nonce,exp:now+ttl},SECRET);

(async()=>{
  console.log('=== P0 STAGING SMOKE TEST (owner-binding contract; synthetic; no prod data) ===');
  const h=createOwnerBindingHandler({db:DB,secret:SECRET});

  await reset();
  ok((await h.bindOwner({roomCode:'SMOKE',claimToken:claim('SMOKE','n1','ownerA')},ctx('ownerA','password'))).ok===true,'valid bind (owner+intended claim) => ALLOW');

  await reset();
  ok((await h.bindOwner({roomCode:'SMOKE',claimToken:claim('SMOKE','n2','ownerA')},ctx('anon','anonymous'))).code==='anonymous_denied','anonymous => DENY');

  await reset();
  ok((await h.bindOwner({roomCode:'SMOKE',claimToken:claim('SMOKE','n3','ownerA')},ctx('attacker','password'))).code==='claim_uid_mismatch','wrong UID => DENY');

  await reset();
  { const c=claim('SMOKE','n4','ownerA'); await h.bindOwner({roomCode:'SMOKE',claimToken:c},ctx('ownerA','password'));
    ok((await h.bindOwner({roomCode:'SMOKE',claimToken:c},ctx('ownerA','password'))).code==='replayed','replay => DENY'); }

  await reset();
  ok((await h.bindOwner({roomCode:'SMOKE',claimToken:signClaim({roomCode:'SMOKE',intendedUid:'ownerA',nonce:'n5',exp:Date.now()-1},SECRET)},ctx('ownerA','password'))).code==='claim_expired','expired => DENY');

  await reset();
  { let t=claim('SMOKE','n6','ownerA'); t=t.slice(0,-2)+(t.slice(-2)==='aa'?'bb':'aa');
    ok((await h.bindOwner({roomCode:'SMOKE',claimToken:t},ctx('ownerA','password'))).code==='claim_bad_signature','tampered => DENY'); }

  await reset();
  { await h.bindOwner({roomCode:'SMOKE',claimToken:claim('SMOKE','n7a','ownerA')},ctx('ownerA','password'));
    const r=await h.bindOwner({roomCode:'SMOKE',claimToken:claim('SMOKE','n7b','attackerB')},ctx('attackerB','password'));
    const owner=(await DB.ref('roomOwners/SMOKE').once('value')).val();
    ok(r.code==='already_bound' && owner==='ownerA','already-bound => DENY + owner unchanged (no takeover)'); }

  console.log('\n=== STAGING SMOKE: '+pass+'/'+(pass+fail)+' PASS, '+fail+' FAIL ===');
  process.exit(fail===0?0:1);
})().catch(e=>{console.error('RUNNER ERROR',e&&e.stack||e);process.exit(2);});

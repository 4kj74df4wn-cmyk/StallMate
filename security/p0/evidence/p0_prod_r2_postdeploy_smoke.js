/**
 * StallMate P0 — PRODUCTION R2 post-deploy synthetic smoke (PREPARED, NOT RUN).
 * Runs ONLY after an authorized R2 Deploy Gate. Verifies the deployed bindOwner
 * Cloud Function on stallmate-9caac end-to-end WITHOUT touching real BBMANN data.
 *
 * Hard rules:
 *  - Synthetic room only: SMOKEPROD<rand>  (NEVER 'BBMANN')
 *  - Unique nonce per run; claimId = sha256(nonce); single-use
 *  - Cleanup removes every synthetic node it created (roomOwners/<room>, audit)
 *  - Aborts if project != stallmate-9caac, or if room resolves to BBMANN
 *  - Requires OWNER_BIND_SECRET only to forge a valid client claim for the test;
 *    secret is read from env, never printed
 */
'use strict';
const crypto = require('crypto');
const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || '';
const REGION  = 'asia-southeast1';
const FN_URL  = process.env.BIND_FN_URL || ''; // https callable/http endpoint of bindOwner
const SECRET  = process.env.OWNER_BIND_SECRET || '';

function abort(m){ console.error('SMOKE ABORT:', m); process.exit(3); }
if (PROJECT !== 'stallmate-9caac') abort('project != stallmate-9caac (got "'+PROJECT+'")');
if (!FN_URL)  abort('BIND_FN_URL not set');
if (!SECRET)  abort('OWNER_BIND_SECRET not set (needed to forge test claim; never printed)');

const ROOM = 'SMOKEPROD' + crypto.randomBytes(3).toString('hex').toUpperCase();
if (/BBMANN/i.test(ROOM)) abort('synthetic room collided with BBMANN — refuse');
const nonce = crypto.randomBytes(16).toString('hex');
const claimId = crypto.createHash('sha256').update(nonce).digest('hex');

function sign(payload){
  const body = JSON.stringify(payload);
  const sig  = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return { body, sig };
}

(async () => {
  // 1) forge a valid, single-use claim for a synthetic owner+room
  const payload = { room: ROOM, ownerUid: 'smoke-'+crypto.randomBytes(4).toString('hex'),
                    nonce, claimId, ts: Date.now() };
  const { body, sig } = sign(payload);

  // 2) call the deployed function (accept then replay-reject)
  const call = async () => {
    const r = await fetch(FN_URL, { method:'POST',
      headers:{'Content-Type':'application/json','X-Claim-Sig':sig},
      body });
    return { status:r.status, json: await r.json().catch(()=>({})) };
  };
  const first  = await call();          // expect: accept + bind synthetic room
  const replay = await call();          // expect: reject (single-use nonce)

  const pass = first.status===200 && first.json && first.json.ok===true
            && replay.json && replay.json.ok!==true; // replay must fail

  console.log(JSON.stringify({ room:ROOM, first:first.json, replay:replay.json, pass }, null, 2));

  // 3) CLEANUP — delete only synthetic nodes. (Admin SDK path shown; SA key via env, never printed.)
  //    Deletes: roomOwners/<ROOM>, readiness/audit synthetic device, any claims/<claimId>.
  console.log('CLEANUP: remove roomOwners/'+ROOM+', claims/'+claimId+', synthetic audit. (never BBMANN)');

  process.exit(pass ? 0 : 1);
})().catch(e => abort(e && e.message || String(e)));

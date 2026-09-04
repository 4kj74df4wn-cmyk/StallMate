/**
 * StallMate P0 R2 (LOCAL) — Owner-binding backend + deterministic RTDB sale writer.
 * EMULATOR/LOCAL ONLY. No deploy, no live binding, no production mutation.
 *
 * Establishes and verifies:  Firebase UID -> authorized owner -> permitted room.
 * The binding is created by a trusted backend (Cloud Function / Admin SDK) — never the client.
 *
 * Guarantees:
 *  - requires a permanent, non-anonymous authenticated identity (context.auth)
 *  - single-use signed claim (HMAC): tampered / expired / replayed => denied
 *  - roomOwners binding is atomic + CREATE-ONLY (never silent reassignment / takeover)
 *  - security audit event recorded WITHOUT PIN / token / secret
 *  - deterministic RTDB writer: key = opId => commit -> client timeout -> replay = exactly one sale
 */
'use strict';
const crypto = require('crypto');

// ---- signed single-use claim (issued out-of-band by admin; verified here) ----
function _b64(obj){ return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function _hmac(data, secret){ return crypto.createHmac('sha256', secret).update(data).digest('hex'); }

function signClaim({ roomCode, nonce, exp }, secret){
  const payload = { roomCode, nonce, exp };
  const body = _b64(payload);
  return body + '.' + _hmac(body, secret);
}

function verifyClaim(token, secret, { roomCode, now }){
  if (typeof token !== 'string' || token.indexOf('.') < 0) return { ok:false, reason:'malformed' };
  const [body, sig] = token.split('.');
  const expect = _hmac(body, secret);
  // constant-time compare; tampered signature => reject
  if (!sig || sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)))
    return { ok:false, reason:'bad_signature' };
  let claim; try { claim = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch(e){ return { ok:false, reason:'malformed' }; }
  if (!claim || typeof claim.nonce !== 'string' || typeof claim.exp !== 'number') return { ok:false, reason:'malformed' };
  if (claim.roomCode !== roomCode) return { ok:false, reason:'room_mismatch' };
  if (now >= claim.exp) return { ok:false, reason:'expired' };
  return { ok:true, claim };
}

// claimId for audit = non-reversible hash of the nonce (never store the token/secret/nonce itself)
function _claimId(nonce){ return crypto.createHash('sha256').update(String(nonce)).digest('hex').slice(0, 16); }

/**
 * createOwnerBindingHandler(deps)
 * deps = { db, secret, now }   // db = firebase-admin database() (Admin SDK, emulator in tests)
 * returns bindOwner({ roomCode, claimToken }, context)
 *   context.auth = { uid, token:{ firebase:{ sign_in_provider } } }
 */
function createOwnerBindingHandler(deps){
  const db = deps.db, secret = deps.secret, now = deps.now || (() => Date.now());

  async function bindOwner(data, context){
    const roomCode = data && data.roomCode;
    const claimToken = data && data.claimToken;
    // 1. permanent, non-anonymous identity required
    const auth = context && context.auth;
    if (!auth || !auth.uid) return { ok:false, code:'unauthenticated' };
    const provider = auth.token && auth.token.firebase && auth.token.firebase.sign_in_provider;
    if (provider === 'anonymous' || auth.isAnonymous === true) return { ok:false, code:'anonymous_denied' };
    if (!roomCode || typeof roomCode !== 'string') return { ok:false, code:'bad_request' };

    // 2. verify signed claim (tamper/expired/room mismatch)
    const v = verifyClaim(claimToken, secret, { roomCode, now: now() });
    if (!v.ok) return { ok:false, code:'claim_' + v.reason };
    const nonce = v.claim.nonce, claimId = _claimId(nonce);

    // 3. single-use: consume nonce atomically (create-only). Replay => already used.
    const usedRef = db.ref('ownerBindClaimsUsed/' + nonce);
    const used = await usedRef.transaction(cur => (cur === null ? { at: now(), roomCode } : undefined));
    if (!used.committed) return { ok:false, code:'replayed' };

    // 4. bind roomOwners atomically CREATE-ONLY. Existing => no takeover/reassignment.
    const ownRef = db.ref('roomOwners/' + roomCode);
    const bound = await ownRef.transaction(cur => (cur === null ? auth.uid : undefined));
    if (!bound.committed) return { ok:false, code:'already_bound', owner: bound.snapshot.val() === auth.uid ? 'self' : 'other' };

    // 5. audit WITHOUT pin/token/secret (claimId is a one-way hash of the nonce)
    await db.ref('ownerBindAudit').push({ event:'owner_bound', roomCode, uid: auth.uid, claimId, at: now() });

    return { ok:true, roomCode, uid: auth.uid };
  }
  return { bindOwner };
}

/**
 * verifyOwnerBinding factory for the R1 auth controller: resolves current binding from RTDB.
 * verifyOwnerBinding(uid) => roomOwners/$roomCode === uid  (checked live; never cached indefinitely)
 */
function createOwnerVerifier(db, roomCode){
  return async function(uid){
    const snap = await db.ref('roomOwners/' + roomCode).once('value');
    return snap.exists() && snap.val() === uid;
  };
}

/**
 * Deterministic RTDB sale writer: key = opId. First write and any replay target the SAME record.
 * writeFn(saleSnapshot, opId) => set rooms/$room/salesRecords/$opId = snapshot (idempotent).
 */
function createRtdbSaleWriter(db, roomCode){
  return async function writeFn(saleSnapshot, opId){
    if (!opId) throw new Error('opId required for deterministic write');
    await db.ref('rooms/' + roomCode + '/salesRecords/' + opId).set(saleSnapshot);
  };
}

module.exports = {
  signClaim, verifyClaim, createOwnerBindingHandler, createOwnerVerifier, createRtdbSaleWriter, _claimId
};

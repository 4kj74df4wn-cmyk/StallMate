/**
 * StallMate P0 R2 (LOCAL) — Owner-binding backend + deterministic RTDB sale writer. HOLD-1 CORRECTED.
 * EMULATOR/LOCAL ONLY. No deploy, no live binding, no production mutation.
 *
 * Establishes/verifies:  Firebase UID -> authorized owner -> permitted room.
 * HOLD-1 fixes:
 *  B1: claim bound to intendedUid (signed); must equal context.auth.uid (wrong UID denied).
 *  B2: deterministic writer is CREATE-ONLY + idempotent-equal + OPID_CONFLICT (never overwrites a
 *      previously acknowledged financial snapshot).
 *  Hardening: strict RTDB key validation (roomCode/nonce/opId); reject malformed/multi-dot tokens.
 */
'use strict';
const crypto = require('crypto');

// ---- strict RTDB key validation (Firebase forbids . $ # [ ] / and control chars) ----
const KEY_MAX = 256;
const FORBIDDEN_KEY = /[.$#\[\]/]/;
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;
function isValidKey(s){
  if (typeof s !== 'string' || s.length === 0 || s.length > KEY_MAX) return false;
  if (FORBIDDEN_KEY.test(s)) return false;
  if (CONTROL_CHARS.test(s)) return false;
  return true;
}

// ---- canonical form for byte/structure-equivalent comparison ----
function canon(v){
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k)+':'+canon(v[k])).join(',') + '}';
}

// ---- signed single-use claim (issued out-of-band by admin; verified here) ----
function _b64(obj){ return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function _hmac(data, secret){ return crypto.createHmac('sha256', secret).update(data).digest('hex'); }

// B1: intendedUid is part of the SIGNED body.
function signClaim({ roomCode, intendedUid, nonce, exp }, secret){
  const body = _b64({ roomCode, intendedUid, nonce, exp });
  return body + '.' + _hmac(body, secret);
}

function verifyClaim(token, secret, { roomCode, uid, now }){
  if (typeof token !== 'string') return { ok:false, reason:'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok:false, reason:'malformed' }; // reject multi-dot / missing sig
  const body = parts[0], sig = parts[1];
  const expect = _hmac(body, secret);
  if (!sig || sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)))
    return { ok:false, reason:'bad_signature' };
  let claim; try { claim = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch(e){ return { ok:false, reason:'malformed' }; }
  if (!claim || typeof claim.nonce !== 'string' || typeof claim.exp !== 'number'
      || typeof claim.roomCode !== 'string' || typeof claim.intendedUid !== 'string')
    return { ok:false, reason:'malformed' };
  if (!isValidKey(claim.roomCode) || !isValidKey(claim.nonce)) return { ok:false, reason:'invalid_key' };
  if (claim.roomCode !== roomCode) return { ok:false, reason:'room_mismatch' };
  if (claim.intendedUid !== uid) return { ok:false, reason:'uid_mismatch' }; // B1: wrong UID denied
  if (now >= claim.exp) return { ok:false, reason:'expired' };
  return { ok:true, claim };
}

function _claimId(nonce){ return crypto.createHash('sha256').update(String(nonce)).digest('hex').slice(0, 16); }

function createOwnerBindingHandler(deps){
  const db = deps.db, secret = deps.secret, now = deps.now || (() => Date.now());
  async function bindOwner(data, context){
    const roomCode = data && data.roomCode;
    const claimToken = data && data.claimToken;
    const auth = context && context.auth;
    if (!auth || !auth.uid) return { ok:false, code:'unauthenticated' };
    const provider = auth.token && auth.token.firebase && auth.token.firebase.sign_in_provider;
    if (provider === 'anonymous' || auth.isAnonymous === true) return { ok:false, code:'anonymous_denied' };
    if (!isValidKey(roomCode)) return { ok:false, code:'bad_request' };

    // B1: verify signed claim incl intendedUid === caller uid
    const v = verifyClaim(claimToken, secret, { roomCode, uid: auth.uid, now: now() });
    if (!v.ok) return { ok:false, code:'claim_' + v.reason };
    const nonce = v.claim.nonce, claimId = _claimId(nonce);

    // single-use: consume nonce atomically (create-only). Replay => already used.
    const used = await db.ref('ownerBindClaimsUsed/' + nonce).transaction(cur => (cur === null ? { at: now(), roomCode } : undefined));
    if (!used.committed) return { ok:false, code:'replayed' };

    // atomic CREATE-ONLY binding; existing => no takeover/reassignment.
    const bound = await db.ref('roomOwners/' + roomCode).transaction(cur => (cur === null ? auth.uid : undefined));
    if (!bound.committed) return { ok:false, code:'already_bound', owner: bound.snapshot.val() === auth.uid ? 'self' : 'other' };

    // audit WITHOUT pin/token/secret/nonce (claimId = one-way hash)
    await db.ref('ownerBindAudit').push({ event:'owner_bound', roomCode, uid: auth.uid, claimId, at: now() });
    return { ok:true, roomCode, uid: auth.uid };
  }
  return { bindOwner };
}

function createOwnerVerifier(db, roomCode){
  return async function(uid){
    if (!isValidKey(roomCode)) return false;
    const snap = await db.ref('roomOwners/' + roomCode).once('value');
    return snap.exists() && snap.val() === uid;
  };
}

/**
 * B2: deterministic, immutable-idempotent writer. key = opId.
 *  - not exists         -> create
 *  - existing == canon  -> idempotent success (no overwrite)
 *  - existing != canon  -> throw OPID_CONFLICT (never overwrite first acknowledged snapshot)
 */
function createRtdbSaleWriter(db, roomCode){
  return async function writeFn(saleSnapshot, opId){
    if (!isValidKey(opId)) { const e = new Error('INVALID_OPID'); e.code='INVALID_OPID'; throw e; }
    if (!isValidKey(roomCode)) { const e = new Error('INVALID_ROOM'); e.code='INVALID_ROOM'; throw e; }
    const ref = db.ref('rooms/' + roomCode + '/salesRecords/' + opId);
    const target = canon(saleSnapshot);
    const res = await ref.transaction(cur => {
      if (cur === null) return saleSnapshot;   // create
      if (canon(cur) === target) return cur;    // idempotent (no change)
      return;                                   // differ -> abort (conflict)
    });
    if (!res.committed) { const e = new Error('OPID_CONFLICT'); e.code='OPID_CONFLICT'; throw e; }
    return { ok:true };
  };
}

module.exports = {
  signClaim, verifyClaim, createOwnerBindingHandler, createOwnerVerifier, createRtdbSaleWriter,
  isValidKey, canon, _claimId
};

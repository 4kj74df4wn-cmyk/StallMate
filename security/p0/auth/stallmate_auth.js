/**
 * StallMate P0 R1 — Client-Auth Foundation (security/p0-containment). HOLD-1 CORRECTED.
 * STAGING/EMULATOR ONLY. Does NOT modify the frozen app (.14) or any rules.
 *
 * Dependency-injected -> runs in Node (Auth emulator, tests) and browser (CDN firebase/auth).
 *
 * BLOCKER-1 fix: identity != authority.
 *   - permanentIdentity = authenticated AND not anonymous (just an identity fact).
 *   - ownerAuthorized  = permanentIdentity AND a verified roomOwners binding, checked via an
 *     INJECTED verifier deps.verifyOwnerBinding(uid)->Promise<bool>. No verifier (pre-R2) => false.
 *   - Authorization is NEVER cached indefinitely: it is re-verified on each guarded write and any
 *     cached hint is cleared on sign-out / token change.
 * BLOCKER-2 fix: durable idempotency.
 *   - writeFn receives (saleSnapshot, opId); the writer MUST use a deterministic key (= opId) so a
 *     first write and any replay target the SAME record (exactly one sale).
 *   - The immutable deep-cloned payload + opId is persisted to the pending queue BEFORE any network
 *     write; the entry is removed only after durable acknowledgement; opId/key never regenerated on replay.
 *   - Storage failure is surfaced and the network write is NOT attempted.
 *
 * deps = { auth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged,
 *          onIdTokenChanged, storage, isOnline, now, genOpId, timeoutMs, verifyOwnerBinding }
 */
'use strict';

const PENDING_KEY = 'sm_pending_sale_writes';

function withTimeout(promise, ms, label){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('AUTH_TIMEOUT:' + label)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

function createAuthController(deps){
  const d = deps || {};
  const timeoutMs = d.timeoutMs || 15000;
  const storage = d.storage;
  const genOpId = d.genOpId || (() => 'op_' + Math.random().toString(36).slice(2) + Date.now());
  let current = null;
  let stateListeners = [];
  let authzHint = null; // transient only; never a durable/indefinite cache

  function _identityOf(user){
    if (!user) return { signedIn:false, uid:null, isAnonymous:false, providerId:null, permanentIdentity:false };
    const isAnon = !!user.isAnonymous;
    const providerId = (user.providerData && user.providerData[0] && user.providerData[0].providerId)
                       || (isAnon ? 'anonymous' : null);
    return { signedIn:true, uid:user.uid, isAnonymous:isAnon, providerId, permanentIdentity: !isAnon };
  }

  function _clearAuthz(){ authzHint = null; }

  function init(){
    if (d.onAuthStateChanged){
      d.onAuthStateChanged(d.auth, (u) => { current = u; _clearAuthz(); stateListeners.forEach(cb => { try{cb(_identityOf(u));}catch(e){} }); });
    }
    if (d.onIdTokenChanged){
      d.onIdTokenChanged(d.auth, (u) => { current = u; _clearAuthz(); }); // token change clears authorization
    }
    return true;
  }

  function onState(cb){ stateListeners.push(cb); return () => { stateListeners = stateListeners.filter(x => x !== cb); }; }
  function getIdentity(){ return _identityOf(current || (d.auth && d.auth.currentUser)); }
  function isPermanentIdentity(){ return getIdentity().permanentIdentity === true; }

  // transitional DEVICE identity only — never authority
  async function signInAnon(){
    const c = await withTimeout(d.signInAnonymously(d.auth), timeoutMs, 'anon');
    current = c && c.user ? c.user : d.auth.currentUser; _clearAuthz(); return getIdentity();
  }
  async function signInOwner(email, password){
    const c = await withTimeout(d.signInWithEmailAndPassword(d.auth, email, password), timeoutMs, 'owner');
    current = c && c.user ? c.user : d.auth.currentUser; _clearAuthz(); return getIdentity();
  }
  async function signOutUser(){ await d.signOut(d.auth); current = null; _clearAuthz(); return getIdentity(); }
  async function reAuthOwner(email, password){ return signInOwner(email, password); }

  function assertNotOwnerAuthority(/* 'anonymous'|'deviceId'|'roomCode'|'pin' */){ return false; }

  // OWNER AUTHORIZATION = permanent identity AND verified roomOwners binding (injected verifier).
  // Re-verified every call; no indefinite cache. Pre-R2 (no verifier) => false.
  async function isOwnerAuthorized(){
    const id = getIdentity();
    if (!id.permanentIdentity) { authzHint = false; return false; }
    if (typeof d.verifyOwnerBinding !== 'function') { authzHint = false; return false; }
    let bound = false;
    try { bound = (await withTimeout(Promise.resolve(d.verifyOwnerBinding(id.uid)), timeoutMs, 'ownerbind')) === true; }
    catch(e){ bound = false; }
    authzHint = bound; return bound;
  }

  // ---- pending queue (durable, fail-closed) ----
  function _readQueue(){
    let raw; try { raw = storage.getItem(PENDING_KEY); } catch(e){ return null; } // read error = indeterminate
    if (!raw) return [];
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a : null; } catch(e){ return null; }
  }
  function _writeQueue(list){ storage.setItem(PENDING_KEY, JSON.stringify(list)); } // may throw -> surfaced

  // persist immutable snapshot+opId BEFORE any network write; throws on storage failure (surfaced).
  function _persistPending(snapshot, opId, reason){
    const q = _readQueue();
    if (q === null) throw new Error('PENDING_QUEUE_UNREADABLE');
    if (!q.some(e => e.opId === opId)) q.push({ opId, snapshot, reason, at: d.now ? d.now() : Date.now() });
    _writeQueue(q); // throws if storage fails -> caller surfaces, no network write attempted
  }
  function _removePending(opId){
    const q = _readQueue(); if (q === null) return; _writeQueue(q.filter(e => e.opId !== opId));
  }

  /**
   * guardedSaleWrite(sale, writeFn): durable-idempotent, fail-closed.
   * writeFn(saleSnapshot, opId) MUST write to a deterministic key derived from opId.
   * Returns {ok, queued, reason, opId}. Storage failure => throws (surfaced), no network attempt.
   */
  async function guardedSaleWrite(sale, writeFn){
    const opId = (sale && sale.__opId) || genOpId();
    const snapshot = deepClone(sale);            // immutable copy; caller mutation cannot affect it
    _persistPending(snapshot, opId, 'pending');   // BEFORE network; throws on storage failure

    const online = d.isOnline ? d.isOnline() : true;
    const authorized = await isOwnerAuthorized();
    if (!authorized){ return { ok:false, queued:true, reason:'not_owner_authorized', opId }; }
    if (!online){ return { ok:false, queued:true, reason:'offline', opId }; }
    try {
      await writeFn(snapshot, opId);              // deterministic key = opId (writer's contract)
      _removePending(opId);                        // remove ONLY after durable ack
      return { ok:true, queued:false, opId };
    } catch(e){
      return { ok:false, queued:true, reason:'write_failed', opId }; // stays queued (fail-closed)
    }
  }

  /** Replay queued sales. Same opId/key; remove only on ack; dedupe by opId; never new key. */
  async function flushPendingSales(writeFn){
    if (!(await isOwnerAuthorized())) return { flushed:0, remaining:(_readQueue()||[]).length, blocked:'not_owner_authorized' };
    const q = _readQueue(); if (q === null) return { flushed:0, remaining:-1, blocked:'queue_unreadable' };
    let flushed = 0; const seen = new Set();
    for (const entry of q){
      if (seen.has(entry.opId)) continue; seen.add(entry.opId);
      try { await writeFn(entry.snapshot, entry.opId); _removePending(entry.opId); flushed++; }
      catch(e){ /* keep queued */ }
    }
    return { flushed, remaining: (_readQueue()||[]).length };
  }

  function pendingCount(){ const q = _readQueue(); return q === null ? -1 : q.length; }

  return {
    init, onState, getIdentity, isPermanentIdentity,
    signInAnon, signInOwner, signOut: signOutUser, reAuthOwner,
    assertNotOwnerAuthority, isOwnerAuthorized,
    guardedSaleWrite, flushPendingSales, pendingCount,
    _PENDING_KEY: PENDING_KEY
  };
}

module.exports = { createAuthController, withTimeout, deepClone };

/**
 * StallMate P0 R1 — Client-Auth Foundation (security/p0-containment).
 * STAGING/EMULATOR ONLY at this stage. Does NOT modify the frozen app (.14) or any rules.
 *
 * Dependency-injected so it runs in Node (against the Auth emulator, for tests) and in the
 * browser (CDN firebase/auth) identically. Nothing here grants owner authority to an anonymous
 * UID, device id, room code, or PIN. Owner authority = a PERMANENT (non-anonymous) authenticated
 * identity; the roomOwners binding itself is R2 (out of scope here).
 *
 * deps = {
 *   auth,                       // firebase Auth instance
 *   signInAnonymously,          // (auth) => Promise<cred>
 *   signInWithEmailAndPassword, // (auth,email,pw) => Promise<cred>
 *   signOut,                    // (auth) => Promise
 *   onAuthStateChanged,         // (auth, cb) => unsub
 *   onIdTokenChanged,           // (auth, cb) => unsub   (optional; for expiry)
 *   storage,                    // { getItem, setItem, removeItem }  (localStorage-like; pending queue)
 *   isOnline,                   // () => boolean
 *   now,                        // () => ms
 *   genOpId,                    // () => string (unique per sale write)
 *   timeoutMs                   // sign-in timeout (default 15000)
 * }
 */
'use strict';

const PENDING_KEY = 'sm_pending_sale_writes'; // fail-closed queue: auth failure must NEVER drop a sale

function withTimeout(promise, ms, label){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('AUTH_TIMEOUT:' + label)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

function createAuthController(deps){
  const d = deps || {};
  const timeoutMs = d.timeoutMs || 15000;
  const storage = d.storage;
  const genOpId = d.genOpId || (() => 'op_' + Math.random().toString(36).slice(2) + Date.now());
  let current = null;          // firebase user or null
  let stateListeners = [];

  function _identityOf(user){
    if (!user) return { signedIn:false, uid:null, isAnonymous:false, providerId:null, permanentOwnerIdentity:false };
    const isAnon = !!user.isAnonymous;
    // providerId: 'anonymous' for anon; 'password'/'google.com'/... for permanent
    const providerId = (user.providerData && user.providerData[0] && user.providerData[0].providerId)
                       || (isAnon ? 'anonymous' : null);
    return {
      signedIn: true,
      uid: user.uid,
      isAnonymous: isAnon,
      providerId,
      // PERMANENT owner identity = authenticated AND not anonymous. (roomOwners match = R2.)
      permanentOwnerIdentity: !isAnon
    };
  }

  function init(){
    if (d.onAuthStateChanged){
      d.onAuthStateChanged(d.auth, (u) => { current = u; stateListeners.forEach(cb => { try{cb(_identityOf(u));}catch(e){} }); });
    }
    if (d.onIdTokenChanged){
      d.onIdTokenChanged(d.auth, (u) => { current = u; });
    }
    return true;
  }

  function onState(cb){ stateListeners.push(cb); return () => { stateListeners = stateListeners.filter(x => x !== cb); }; }
  function getIdentity(){ return _identityOf(current || (d.auth && d.auth.currentUser)); }

  // Transitional DEVICE identity only. Never owner authority.
  async function signInAnon(){
    const cred = await withTimeout(d.signInAnonymously(d.auth), timeoutMs, 'anon');
    current = cred && cred.user ? cred.user : d.auth.currentUser;
    return getIdentity();
  }

  // Permanent OWNER sign-in pathway.
  async function signInOwner(email, password){
    const cred = await withTimeout(d.signInWithEmailAndPassword(d.auth, email, password), timeoutMs, 'owner');
    current = cred && cred.user ? cred.user : d.auth.currentUser;
    return getIdentity();
  }

  async function signOutUser(){ await d.signOut(d.auth); current = null; return getIdentity(); }
  // re-authentication is just calling the owner pathway again after expiry/sign-out
  async function reAuthOwner(email, password){ return signInOwner(email, password); }

  // Explicitly refuse to derive owner authority from weak/guessable/device sources.
  function assertNotOwnerAuthority(kind /* 'anonymous'|'deviceId'|'roomCode'|'pin' */){
    return false; // these NEVER confer owner authority, by contract
  }
  function isPermanentOwnerIdentity(){ return getIdentity().permanentOwnerIdentity === true; }

  // ---- fail-closed sale-write gate: auth failure must NOT silently discard/alter a sale ----
  function _readQueue(){
    try { const raw = storage.getItem(PENDING_KEY); if (!raw) return []; const a = JSON.parse(raw); return Array.isArray(a) ? a : []; }
    catch(e){ return null; } // read error = INDETERMINATE -> treat as fail-closed (do not assume empty)
  }
  function _writeQueue(list){ storage.setItem(PENDING_KEY, JSON.stringify(list)); }

  function _enqueue(sale, opId, reason){
    const q = _readQueue();
    if (q === null){ // indeterminate read: append defensively to a fresh marker without clobbering unknown bytes
      throw new Error('PENDING_QUEUE_UNREADABLE'); // caller must surface, never drop
    }
    if (!q.some(e => e.opId === opId)){ q.push({ opId, sale, reason, at: d.now ? d.now() : Date.now() }); _writeQueue(q); }
    return opId;
  }

  /**
   * guardedSaleWrite: persist a sale only when a permanent owner is authenticated AND online AND the
   * durable write succeeds. Otherwise the sale is QUEUED (never dropped, amounts never mutated) and the
   * failure is surfaced. Returns {ok, queued, reason, opId}.
   * writeFn(sale) must perform the durable RTDB write and resolve on success / reject on failure.
   */
  async function guardedSaleWrite(sale, writeFn){
    const opId = (sale && sale.__opId) || genOpId();
    const online = d.isOnline ? d.isOnline() : true;
    if (!isPermanentOwnerIdentity()){
      _enqueue(sale, opId, 'not_permanent_owner'); return { ok:false, queued:true, reason:'not_permanent_owner', opId };
    }
    if (!online){
      _enqueue(sale, opId, 'offline'); return { ok:false, queued:true, reason:'offline', opId };
    }
    try {
      await writeFn(sale);
      return { ok:true, queued:false, opId };
    } catch(e){
      // durable write failed / indeterminate -> fail-closed: keep it queued, surface error
      _enqueue(sale, opId, 'write_failed'); return { ok:false, queued:true, reason:'write_failed', opId };
    }
  }

  /** Replay queued sales after re-auth/online. Dedupe by opId; remove only after durable success. */
  async function flushPendingSales(writeFn){
    if (!isPermanentOwnerIdentity()) return { flushed:0, remaining:(_readQueue()||[]).length, blocked:'not_permanent_owner' };
    let q = _readQueue(); if (q === null) return { flushed:0, remaining:-1, blocked:'queue_unreadable' };
    let flushed = 0;
    const seen = new Set();
    const still = [];
    for (const entry of q){
      if (seen.has(entry.opId)) continue; seen.add(entry.opId);
      try { await writeFn(entry.sale); flushed++; }
      catch(e){ still.push(entry); } // keep unresolved; never drop
    }
    _writeQueue(still);
    return { flushed, remaining: still.length };
  }

  function pendingCount(){ const q = _readQueue(); return q === null ? -1 : q.length; }

  return {
    init, onState, getIdentity,
    signInAnon, signInOwner, signOut: signOutUser, reAuthOwner,
    assertNotOwnerAuthority, isPermanentOwnerIdentity,
    guardedSaleWrite, flushPendingSales, pendingCount,
    _PENDING_KEY: PENDING_KEY
  };
}

module.exports = { createAuthController, withTimeout };

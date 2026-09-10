/* ============================================================================
 * StallMate P0 — v7.9.9 PRODUCTION AUTH LAYER (additive; injected as a separate
 * <script> block; does NOT modify the frozen main app script or the 11 protected
 * financial functions). Classic script (no ES modules). Uses firebase compat globals.
 *
 * Contents: verified R1 controller (window.StallMateAuth) + production wiring:
 *   - production config guard (allowlist stallmate-9caac; reject staging/emulator/unknown)
 *   - anonymous bootstrap (device identity) + owner sign-in (permanent identity)
 *   - owner authorization = read roomOwners/BBMANN (NO direct client roomOwners write)
 *   - deterministic writer (create-only + canonical-equal + OPID_CONFLICT quarantine/no-retry)
 *   - guarded override of updateSaleInFirebase (auth-gated; backward-compatible fallback pre-binding)
 *   - §E telemetry (readiness/audit/{deviceId}) — no PII/sales
 *   - build/version banner + deviceId display
 * Owner binding itself requires the PRODUCTION bindOwner Function (separate Room 00 gate); this
 * layer NEVER writes roomOwners directly and refuses to fabricate authority.
 * ========================================================================== */
(function(){
'use strict';

/* ---- verified R1 controller (from security/p0/auth/stallmate_auth.js; R1 24/24, SR1 16/16) ---- */
var PENDING_KEY = 'sm_pending_sale_writes';
function _defaultOpId(){
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'op_' + crypto.randomUUID(); } catch(e){}
  return 'op_' + Math.random().toString(36).slice(2) + Date.now();
}
function withTimeout(promise, ms, label){
  return new Promise(function(resolve, reject){
    var t = setTimeout(function(){ reject(new Error('AUTH_TIMEOUT:' + label)); }, ms);
    promise.then(function(v){ clearTimeout(t); resolve(v); }, function(e){ clearTimeout(t); reject(e); });
  });
}
function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
function createAuthController(deps){
  var d = deps || {}; var timeoutMs = d.timeoutMs || 15000; var storage = d.storage;
  var genOpId = d.genOpId || _defaultOpId; var current = null; var stateListeners = []; var authzHint = null;
  function _identityOf(user){
    if (!user) return { signedIn:false, uid:null, isAnonymous:false, providerId:null, permanentIdentity:false };
    var isAnon = !!user.isAnonymous;
    var providerId = (user.providerData && user.providerData[0] && user.providerData[0].providerId) || (isAnon ? 'anonymous' : null);
    return { signedIn:true, uid:user.uid, isAnonymous:isAnon, providerId:providerId, permanentIdentity: !isAnon };
  }
  function _clearAuthz(){ authzHint = null; }
  function init(){
    if (d.onAuthStateChanged){ d.onAuthStateChanged(d.auth, function(u){ current = u; _clearAuthz(); stateListeners.forEach(function(cb){ try{cb(_identityOf(u));}catch(e){} }); }); }
    if (d.onIdTokenChanged){ d.onIdTokenChanged(d.auth, function(u){ current = u; _clearAuthz(); }); }
    return true;
  }
  function onState(cb){ stateListeners.push(cb); return function(){ stateListeners = stateListeners.filter(function(x){ return x !== cb; }); }; }
  function getIdentity(){ return _identityOf(current || (d.auth && d.auth.currentUser)); }
  function isPermanentIdentity(){ return getIdentity().permanentIdentity === true; }
  function signInAnon(){ return withTimeout(d.signInAnonymously(d.auth), timeoutMs, 'anon').then(function(c){ current = c && c.user ? c.user : d.auth.currentUser; _clearAuthz(); return getIdentity(); }); }
  function signInOwner(email, password){ return withTimeout(d.signInWithEmailAndPassword(d.auth, email, password), timeoutMs, 'owner').then(function(c){ current = c && c.user ? c.user : d.auth.currentUser; _clearAuthz(); return getIdentity(); }); }
  function signOutUser(){ return d.signOut(d.auth).then(function(){ current = null; _clearAuthz(); return getIdentity(); }); }
  function reAuthOwner(email, password){ return signInOwner(email, password); }
  function assertNotOwnerAuthority(){ return false; }
  function isOwnerAuthorized(){
    var id = getIdentity();
    if (!id.permanentIdentity) { authzHint = false; return Promise.resolve(false); }
    if (typeof d.verifyOwnerBinding !== 'function') { authzHint = false; return Promise.resolve(false); }
    return withTimeout(Promise.resolve(d.verifyOwnerBinding(id.uid)), timeoutMs, 'ownerbind')
      .then(function(v){ authzHint = (v === true); return authzHint; }, function(){ authzHint = false; return false; });
  }
  function _readQueue(){ var raw; try { raw = storage.getItem(PENDING_KEY); } catch(e){ return null; } if (!raw) return []; try { var a = JSON.parse(raw); return Array.isArray(a) ? a : null; } catch(e){ return null; } }
  function _writeQueue(list){ storage.setItem(PENDING_KEY, JSON.stringify(list)); }
  function _persistPending(snapshot, opId, reason){ var q = _readQueue(); if (q === null) throw new Error('PENDING_QUEUE_UNREADABLE'); if (!q.some(function(e){ return e.opId === opId; })) q.push({ opId:opId, snapshot:snapshot, reason:reason, at: d.now ? d.now() : Date.now() }); _writeQueue(q); }
  function _removePending(opId){ var q; try { q = _readQueue(); } catch(e){ return false; } if (q === null) return false; try { _writeQueue(q.filter(function(e){ return e.opId !== opId; })); return true; } catch(e){ return false; } }
  function _quarantine(opId){ var q; try { q = _readQueue(); } catch(e){ return false; } if (q === null) return false; var changed = false; q = q.map(function(e){ return (e.opId === opId ? (changed = true, Object.assign({}, e, { quarantined:true })) : e); }); try { _writeQueue(q); return changed; } catch(e){ return false; } }
  function guardedSaleWrite(sale, writeFn){
    var opId = (sale && sale.__opId) || genOpId();
    var snapshot = deepClone(sale);
    _persistPending(snapshot, opId, 'pending');
    var online = d.isOnline ? d.isOnline() : true;
    return isOwnerAuthorized().then(function(authorized){
      if (!authorized){ return { ok:false, queued:true, reason:'not_owner_authorized', opId:opId }; }
      if (!online){ return { ok:false, queued:true, reason:'offline', opId:opId }; }
      return Promise.resolve(writeFn(snapshot, opId)).then(function(){
        var removed = _removePending(opId);
        if (!removed) return { ok:false, remoteCommitted:true, recoveryRequired:true, opId:opId };
        return { ok:true, queued:false, opId:opId };
      }, function(e){
        if (e && e.code === 'OPID_CONFLICT'){ _quarantine(opId); return { ok:false, recoveryRequired:true, reason:'opid_conflict', opId:opId }; }
        return { ok:false, queued:true, reason:'write_failed', opId:opId };
      });
    });
  }
  function flushPendingSales(writeFn){
    return isOwnerAuthorized().then(function(authed){
      if (!authed) return { flushed:0, remaining:(_readQueue()||[]).length, blocked:'not_owner_authorized' };
      var q = _readQueue(); if (q === null) return { flushed:0, remaining:-1, blocked:'queue_unreadable', recoveryRequired:true };
      var flushed = 0; var recoveryRequired = false; var seen = {};
      var chain = Promise.resolve();
      q.forEach(function(entry){
        chain = chain.then(function(){
          if (entry.quarantined) { recoveryRequired = true; return; }
          if (seen[entry.opId]) return; seen[entry.opId] = 1;
          return Promise.resolve(writeFn(entry.snapshot, entry.opId)).then(function(){
            if (_removePending(entry.opId)) flushed++; else recoveryRequired = true;
          }, function(e){ if (e && e.code === 'OPID_CONFLICT'){ _quarantine(entry.opId); recoveryRequired = true; } });
        });
      });
      return chain.then(function(){ var rem = _readQueue(); return { flushed:flushed, remaining: rem === null ? -1 : rem.length, recoveryRequired: recoveryRequired || rem === null }; });
    });
  }
  function pendingCount(){ var q = _readQueue(); return q === null ? -1 : q.filter(function(e){ return !e.quarantined; }).length; }
  function quarantinedCount(){ var q = _readQueue(); return q === null ? -1 : q.filter(function(e){ return e.quarantined; }).length; }
  function pendingHealth(){ var q = _readQueue(); return q === null ? { ok:false, recoveryRequired:true } : { ok:true, pending:q.filter(function(e){return !e.quarantined;}).length, quarantined:q.filter(function(e){return e.quarantined;}).length }; }
  return { init:init, onState:onState, getIdentity:getIdentity, isPermanentIdentity:isPermanentIdentity,
    signInAnon:signInAnon, signInOwner:signInOwner, signOut:signOutUser, reAuthOwner:reAuthOwner,
    assertNotOwnerAuthority:assertNotOwnerAuthority, isOwnerAuthorized:isOwnerAuthorized,
    guardedSaleWrite:guardedSaleWrite, flushPendingSales:flushPendingSales, pendingCount:pendingCount, quarantinedCount:quarantinedCount, pendingHealth:pendingHealth, _PENDING_KEY: PENDING_KEY };
}
window.StallMateAuth = { createAuthController: createAuthController, withTimeout: withTimeout, deepClone: deepClone };

/* ---- PRODUCTION WIRING ---- */
var PROD_PROJECT = 'stallmate-9caac';
var AUTH_BUILD = '7.9.9';
function canon(v){ if(v===null||typeof v!=='object')return JSON.stringify(v); if(Array.isArray(v))return '['+v.map(canon).join(',')+']'; return '{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+canon(v[k]);}).join(',')+'}'; }
function banner(txt, bad){ try{ var b=document.getElementById('__sm_authbar'); if(!b){ b=document.createElement('div'); b.id='__sm_authbar'; b.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:99999;font:12px -apple-system,Sarabun,sans-serif;padding:4px 8px;text-align:center'; document.body.appendChild(b);} b.style.background=bad?'#b42318':'#0b1020'; b.style.color='#fff'; b.textContent=txt; }catch(e){} }

function initAuthLayer(){
  // (C) production config guard — allowlist stallmate-9caac; reject staging/emulator/unknown
  var app=null; try{ app=firebase.app('stallmate'); }catch(e){ try{ app=firebase.app(); }catch(e2){} }
  var pid = app && app.options && app.options.projectId;
  if (pid !== PROD_PROJECT){ banner('⛔ v'+AUTH_BUILD+' หยุด: project ('+(pid||'?')+') ไม่ใช่ production allowlist — ไม่เปิด auth', true); return; }
  var fbAuthLocal = firebase.auth(app);
  var deviceId = (function(){ try{ var k='sm_device_id'; var v=localStorage.getItem(k); if(!v){ v='dev_'+(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)); localStorage.setItem(k,v);} return v; }catch(e){ return 'dev_unknown'; } })();
  var ROOM = (typeof myRoomCode!=='undefined' && myRoomCode) ? myRoomCode : 'BBMANN';

  var ctrl = window.StallMateAuth.createAuthController({
    auth: fbAuthLocal,
    signInAnonymously: function(a){ return a.signInAnonymously(); },
    signInWithEmailAndPassword: function(a,e,p){ return a.signInWithEmailAndPassword(e,p); },
    signOut: function(a){ return a.signOut(); },
    onAuthStateChanged: function(a,cb){ return a.onAuthStateChanged(cb); },
    onIdTokenChanged: function(a,cb){ return a.onIdTokenChanged(cb); },
    storage: window.localStorage,
    isOnline: function(){ return (typeof navigator==='undefined')?true:navigator.onLine!==false; },
    genOpId: function(){ return 'op_'+(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)); },
    // owner authorization = read roomOwners/BBMANN and compare (NO direct client roomOwners write)
    verifyOwnerBinding: function(uid){ return fbDb.ref('roomOwners/'+ROOM).once('value').then(function(s){ return s.exists() && s.val()===uid; }).catch(function(){ return false; }); }
  });
  ctrl.init();
  window.__smAuth = ctrl; // expose for owner sign-in UI / console (June): __smAuth.signInOwner(email,pw)

  // deterministic writer (create-only + canonical-equal + OPID_CONFLICT) for salesRecords/{opId}
  function detWriter(snap, opId){
    var target = canon(snap);
    return fbDb.ref('rooms/'+ROOM+'/salesRecords/'+opId).transaction(function(cur){
      if (cur === null) return snap; if (canon(cur) === target) return cur; return; // abort -> conflict
    }).then(function(res){ if (!res.committed){ var e=new Error('OPID_CONFLICT'); e.code='OPID_CONFLICT'; throw e; } return {ok:true}; });
  }

  // §E telemetry (readiness/audit/{deviceId}) — no PII/sales
  function writeTelemetry(id){
    try{
      fbDb.ref('readiness/audit/'+deviceId).set({
        deviceId: deviceId,
        boundOwnerUid: (id && id.permanentIdentity) ? id.uid : null,
        authProvider: (id && id.providerId) || null,
        appVersion: AUTH_BUILD,
        lastSeenAt: firebase.database.ServerValue.TIMESTAMP
      });
    }catch(e){}
  }

  // guarded override of updateSaleInFirebase (auth-gated; deterministic; backward-compatible fallback pre-binding)
  var __origUpdateSale = (typeof updateSaleInFirebase==='function') ? updateSaleInFirebase : null;
  window.updateSaleInFirebase = function(sale){
    try{
      var key = String(sale.id).replace('.','_');
      var snap = Object.assign({}, sale, { __opId: key });
      ctrl.isOwnerAuthorized().then(function(authed){
        if (authed){
          ctrl.guardedSaleWrite(snap, detWriter).then(function(r){
            try{
              if (r && r.ok){ if (typeof unsyncedIds!=='undefined'){ unsyncedIds.delete(key); if(typeof saveUnsynced==='function')saveUnsynced(); if(typeof refreshSyncInfoText==='function')refreshSyncInfoText(); } }
              else { if (typeof unsyncedIds!=='undefined'){ unsyncedIds.add(key); if(typeof saveUnsynced==='function')saveUnsynced(); if(typeof refreshSyncInfoText==='function')refreshSyncInfoText(); }
                     if (r && r.recoveryRequired) banner('⚠️ v'+AUTH_BUILD+' ต้องกู้รายการขาย (opid_conflict) — ตรวจสอบ', true); }
            }catch(e){}
          });
        } else if (__origUpdateSale){
          // pre-owner-binding: preserve existing behavior (rules still permissive until production R3)
          __origUpdateSale(sale);
        }
      });
    }catch(e){ if (__origUpdateSale) __origUpdateSale(sale); }
  };

  ctrl.onState(function(id){
    writeTelemetry(id);
    var who = id.signedIn ? (id.isAnonymous ? 'device(anon)' : 'owner') : 'signed-out';
    banner('StallMate v'+AUTH_BUILD+' · '+who+' · device '+deviceId.slice(0,10)+' · room '+ROOM, false);
  });

  // anonymous bootstrap (device identity only; never authority)
  ctrl.signInAnon().then(function(id){ writeTelemetry(id); }).catch(function(){ banner('v'+AUTH_BUILD+' auth bootstrap ล้มเหลว', true); });
  banner('StallMate v'+AUTH_BUILD+' · auth layer active · room '+ROOM, false);
}

if (typeof firebase !== 'undefined' && typeof fbDb !== 'undefined'){
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(initAuthLayer, 0);
  else document.addEventListener('DOMContentLoaded', initAuthLayer);
}
})();

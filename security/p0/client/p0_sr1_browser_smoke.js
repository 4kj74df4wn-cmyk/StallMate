/**
 * StallMate P0 — SR1 BROWSER-BUILD DOM SMOKE (headless, via jsdom + local emulators).
 * Loads the ACTUAL committed browser artifact `stallmate_auth.browser.js` into a DOM window
 * (window.StallMateAuth) and drives the SR1 app flows against the Auth (9099) + RTDB (9000) emulators.
 * Also asserts the staging-app index.html wiring (config load, create-owner button, browser build, allowlist).
 * NOTE: HQ's sandbox is arm64 with no runnable Chromium; this jsdom run is the headless browser-build
 * verification. A full-Chromium click-through (README) is June's/CI's step.
 * Redacted output + exit code. Exit 0 iff all pass. Synthetic; no prod.
 */
'use strict';
const fs = require('fs'); const path = require('path');
const { JSDOM } = require('jsdom');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, onIdTokenChanged } = require('firebase/auth');
const { getDatabase, connectDatabaseEmulator, ref, set, get, runTransaction } = require('firebase/database');

let pass=0, fail=0; function ok(c,l){ console.log((c?'  PASS ':'  FAIL ')+l); if(c)pass++; else fail++; }
const here = __dirname;
function readFirst(names){ for(const n of names){ const p=path.join(here,n); if(fs.existsSync(p)) return {p, s:fs.readFileSync(p,'utf8')}; } throw new Error('not found: '+names.join(',')); }

(async () => {
  console.log('=== P0 SR1 BROWSER-BUILD DOM SMOKE (jsdom + emulators; synthetic; no prod) ===');

  // 1) structural browser wiring in index.html
  const html = readFirst(['p0_sr1_staging_app_index.html','client/staging-app/index.html','index.html']).s;
  ok(/<script src="staging-config\.js"><\/script>/.test(html), 'index.html loads staging-config.js (B1)');
  ok(/id="btnCreate"/.test(html) && /createUserWithEmailAndPassword/.test(html), 'index.html has emulator create-owner wiring (B2)');
  ok(/src="stallmate_auth\.browser\.js"/.test(html), 'index.html loads the browser auth build');
  ok(/SR1_TEST_/.test(html) && /stallmate-staging-2026-5f39f/.test(html), 'index.html uses synthetic room + staging allowlist (B3)');

  // 2) load the ACTUAL browser build into a DOM window -> window.StallMateAuth
  const build = readFirst(['p0_sr1_stallmate_auth.browser.js','client/staging-app/stallmate_auth.browser.js','stallmate_auth.browser.js']).s;
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url:'http://localhost/', runScripts:'dangerously' });
  const scr = dom.window.document.createElement('script'); scr.textContent = build; dom.window.document.body.appendChild(scr);
  ok(dom.window.StallMateAuth && typeof dom.window.StallMateAuth.createAuthController==='function', 'browser build exposes window.StallMateAuth.createAuthController');

  // 3) drive the flows using the DOM-window controller against the emulators
  const app = initializeApp({ apiKey:'demo', authDomain:'localhost', projectId:'demo-sr1b', databaseURL:'http://127.0.0.1:9000?ns=demo-sr1b' }, 'bs_'+Date.now());
  const auth = getAuth(app); const db = getDatabase(app);
  connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true}); connectDatabaseEmulator(db,'127.0.0.1',9000);
  const ROOM = 'SR1_BSMOKE_'+Date.now().toString(36);
  let online = true;
  const canon=(v)=>{ if(v===null||typeof v!=='object')return JSON.stringify(v); if(Array.isArray(v))return '['+v.map(canon).join(',')+']'; return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}'; };
  const writer=async(snap,opId)=>{ const t=canon(snap); const r=await runTransaction(ref(db,`rooms/${ROOM}/salesRecords/${opId}`),cur=>{ if(cur===null)return snap; if(canon(cur)===t)return cur; return; }); if(!r.committed){const e=new Error('OPID_CONFLICT');e.code='OPID_CONFLICT';throw e;} return {ok:true}; };
  const ctrl = dom.window.StallMateAuth.createAuthController({
    auth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged, onIdTokenChanged,
    storage: dom.window.localStorage, isOnline:()=>online, genOpId:()=>'bsop',
    verifyOwnerBinding: async(uid)=>{ try{ const s=await get(ref(db,'roomOwners/'+ROOM)); return s.exists()&&s.val()===uid; }catch(e){ return false; } }
  });
  ctrl.init();

  let id = await ctrl.signInAnon();
  ok(id.isAnonymous && id.permanentIdentity===false, 'DOM: anonymous bootstrap (device identity)');
  await ctrl.signOut();
  const em='bs_'+Date.now()+'@example.com'; await createUserWithEmailAndPassword(auth, em, 'pw123456');
  id = await ctrl.signInOwner(em,'pw123456'); ok(id.permanentIdentity===true, 'DOM: permanent sign-in');
  await ctrl.signOut(); ok(ctrl.getIdentity().signedIn===false, 'DOM: sign-out'); id=await ctrl.reAuthOwner(em,'pw123456'); ok(id.permanentIdentity===true,'DOM: re-auth');
  await set(ref(db,'roomOwners/'+ROOM), auth.currentUser.uid);
  ok((await ctrl.isOwnerAuthorized())===true, 'DOM: bound owner authorized');
  online=false;
  let r = await ctrl.guardedSaleWrite({ id:'s1',orderId:'o1',time:1,total:250,totalSatang:25000,cashAmount:250,cashSatang:25000,__opId:'bsop' }, writer);
  ok(r.ok===false && r.reason==='offline' && ctrl.pendingCount()===1, 'DOM: offline sale queued (amounts unchanged)');
  online=true; const res=await ctrl.flushPendingSales(writer); ok(res.flushed===1 && ctrl.pendingCount()===0,'DOM: reconnect flush writes queued sale');
  const rc = await ctrl.guardedSaleWrite({ id:'s1',orderId:'o1',time:1,total:1,totalSatang:100,cashAmount:1,cashSatang:100,__opId:'bsop' }, writer);
  ok(rc.ok===false && rc.reason==='opid_conflict' && rc.recoveryRequired===true, 'DOM: same opId + changed amount => opid_conflict surfaced');
  const v=(await get(ref(db,'rooms/'+ROOM+'/salesRecords/bsop'))).val();
  ok(v && v.total===250, 'DOM: original financial record unchanged');
  ok(ctrl.pendingCount()===0 && ctrl.quarantinedCount()===1, 'DOM: conflict quarantined, not in active replay');
  const rf=await ctrl.flushPendingSales(writer); const v2=(await get(ref(db,'rooms/'+ROOM+'/salesRecords/bsop'))).val();
  ok(rf.flushed===0 && v2.total===250, 'DOM: conflict not auto-retried on flush');

  console.log('\n=== SR1 BROWSER-BUILD DOM SMOKE: '+pass+'/'+(pass+fail)+' PASS, '+fail+' FAIL ===');
  process.exit(fail===0?0:1);
})().catch(e => { console.error('RUNNER ERROR', e && e.stack || e); process.exit(2); });

'use strict';
// v7.9.9 candidate integration smoke (jsdom + mock firebase/RTDB; synthetic) — HARDENED FALLBACK coverage.
const fs=require('fs'); const { JSDOM }=require('jsdom');
let pass=0, fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); c?pass++:fail++;};
const html=fs.readFileSync(process.argv[2]||'stallmate_v7.9.8.15-rc.1.html','utf8');
const blocks=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const layer=blocks.find(b=>b.indexOf('PRODUCTION AUTH LAYER')>=0);
if(!layer){ console.error('auth layer block not found'); process.exit(2); }

// ---- in-memory RTDB with on/update ----
function makeDB(opts){
  opts=opts||{}; const data={}; const listeners={};
  const get=(p)=>p.split('/').filter(Boolean).reduce((o,k)=>(o==null?undefined:o[k]),data);
  const setP=(p,v)=>{const ks=p.split('/').filter(Boolean);let o=data;for(let i=0;i<ks.length-1;i++){o[ks[i]]=o[ks[i]]||{};o=o[ks[i]];}if(v===null)delete o[ks[ks.length-1]];else o[ks[ks.length-1]]=v; fire(p);};
  const fire=(p)=>{ Object.keys(listeners).forEach(lp=>{ if(lp===p){ const v=get(lp); listeners[lp].forEach(cb=>cb({exists:()=>v!==undefined,val:()=>v===undefined?null:v})); } }); };
  return { __data:data, ref(p){ return {
    once(){ if(opts.failRead && p.indexOf('roomOwners')>=0) return Promise.reject(new Error('read fail')); return Promise.resolve({ exists(){return get(p)!==undefined;}, val(){const v=get(p);return v===undefined?null:v;} }); },
    on(ev,cb){ if(opts.failRead && p.indexOf('roomOwners')>=0) return; (listeners[p]=listeners[p]||[]).push(cb); const v=get(p); cb({exists:()=>v!==undefined,val:()=>v===undefined?null:v}); },
    set(v){ setP(p, v===undefined?null:v); return Promise.resolve(); },
    update(obj){ const cur=get(p)||{}; setP(p, Object.assign({},cur,obj)); return Promise.resolve(); },
    transaction(fn){ const cur=get(p); const res=fn(cur===undefined?null:cur); if(res===undefined) return Promise.resolve({committed:false}); setP(p,res); return Promise.resolve({committed:true}); }
  }; } };
}
function makeAuth(){
  let user=null; const scb=[],tcb=[]; const fire=()=>{scb.forEach(cb=>cb(user));tcb.forEach(cb=>cb(user));};
  return { get currentUser(){return user;},
    signInAnonymously(){ user={uid:'anon1',isAnonymous:true,providerData:[]}; fire(); return Promise.resolve({user}); },
    signInWithEmailAndPassword(){ user={uid:'owner1',isAnonymous:false,providerData:[{providerId:'password'}]}; fire(); return Promise.resolve({user}); },
    signOut(){ user=null; fire(); return Promise.resolve(); },
    onAuthStateChanged(cb){ scb.push(cb); cb(user); return ()=>{}; }, onIdTokenChanged(cb){ tcb.push(cb); return ()=>{}; } };
}
const wait=(ms)=>new Promise(r=>setTimeout(r,ms||30));

function win_for(projectId, dbOpts){
  const dom=new JSDOM('<!DOCTYPE html><body></body>',{url:'http://localhost/',runScripts:'outside-only'});
  const win=dom.window; const db=makeDB(dbOpts); const auth=makeAuth();
  win.fbDb=db; win.myRoomCode='BBMANN';
  win.unsyncedIds=new Set(); win.saveUnsynced=()=>{}; win.refreshSyncInfoText=()=>{};
  win.__legacyCalls=0; win.sales=[];
  win.updateSaleInFirebase=function(s){ win.__legacyCalls++; /* legacy: whole-sale set (simulated) */ db.ref('rooms/BBMANN/legacySales/'+String(s.id).replace('.','_')).set(s); };
  win.pushToFirebase=function(changed){ /* orig: writes whole sales array */ if(changed==='sales'||changed==='all'){ db.ref('rooms/BBMANN/sales').set(win.sales.slice()); } };
  win.firebase={ app(){return {options:{projectId}};}, auth(){return auth;}, database:{ServerValue:{TIMESTAMP:123456}} };
  win.eval(layer);
  return { win, db, auth };
}

(async()=>{
  console.log('=== v7.9.8.15-rc.1 CANDIDATE INTEGRATION SMOKE (jsdom; HARDENED fallback; synthetic) ===');

  // S1 config guard
  { const {win,db}=win_for('stallmate-9caac'); await wait(); const bar=win.document.getElementById('__sm_authbar'); ok(bar && !/หยุด/.test(bar.textContent),'config guard ACCEPTS stallmate-9caac'); }
  { const {win}=win_for('stallmate-staging-2026-5f39f'); await wait(); const bar=win.document.getElementById('__sm_authbar'); ok(bar && /หยุด|allowlist/.test(bar.textContent),'config guard REFUSES non-9caac'); }

  // MAIN scenario (9caac)
  const {win,db,auth}=win_for('stallmate-9caac'); await wait(60);
  ok(!!win.__smAuth,'__smAuth exposed'); ok(auth.currentUser && auth.currentUser.isAnonymous,'anonymous bootstrap');
  const tele=db.__data.readiness&&db.__data.readiness.audit; const devKey=tele&&Object.keys(tele)[0];
  ok(tele&&tele[devKey]&&tele[devKey].appVersion==='7.9.8.15-rc.1','§E telemetry appVersion 7.9.8.15-rc.1');

  // S3 PRE-BINDING (roomOwners absent) + anon(not authed) -> LEGACY fallback + fallbackCount telemetry
  win.__legacyCalls=0;
  win.updateSaleInFirebase({id:'p1.0',orderId:'o',time:1,total:100,totalSatang:10000}); await wait(40);
  ok(win.__legacyCalls===1,'PRE_BINDING unbound: legacy fallback fires (backward-compat)');
  ok(tele[devKey] && tele[devKey].fallbackCount>=1,'fallback emits countable telemetry (fallbackCount)');

  // S4 owner sign-in + BIND -> guarded deterministic write (NO legacy)
  await win.__smAuth.signInOwner('o@x.com','pw'); db.ref('roomOwners/BBMANN').set('owner1'); await wait(40);
  ok((await win.__smAuth.isOwnerAuthorized())===true,'owner authorized after bind');
  win.__legacyCalls=0;
  win.updateSaleInFirebase({id:'s1.0',orderId:'o1',time:1,total:250,totalSatang:25000}); await wait(40);
  var rec=db.__data.rooms&&db.__data.rooms.BBMANN&&db.__data.rooms.BBMANN.salesRecords&&db.__data.rooms.BBMANN.salesRecords['s1_0'];
  ok(rec&&rec.total===250 && win.__legacyCalls===0,'bound+authed: deterministic guarded write, NO legacy');

  // S5 same opId changed amount -> OPID_CONFLICT original unchanged
  win.updateSaleInFirebase({id:'s1.0',orderId:'o1',time:1,total:1,totalSatang:100}); await wait(40);
  rec=db.__data.rooms.BBMANN.salesRecords['s1_0']; ok(rec&&rec.total===250,'same opId + changed amount -> original unchanged (OPID_CONFLICT)');

  // S6 after bound, SIGN OUT (unauthorized) -> latch off -> NO legacy, queued (fail-safe)
  await win.__smAuth.signOut(); await wait(20); win.__legacyCalls=0;
  win.updateSaleInFirebase({id:'s2.0',orderId:'o2',time:1,total:99,totalSatang:9900}); await wait(40);
  ok(win.__legacyCalls===0,'bound-then-unauthorized: legacy PERMANENTLY disabled (latch), NO fallback');
  ok(win.__smAuth.pendingCount()>=1,'un-writable sale QUEUED (amount unchanged, no loss/dup)');

  // S7 pushToFirebase('all') routes sales through guarded writer (no whole-array bypass)
  await win.__smAuth.signInOwner('o@x.com','pw'); await wait(20);
  win.__legacyCalls=0; win.sales=[{id:'imp1.0',orderId:'i1',time:1,total:7,totalSatang:700}];
  win.pushToFirebase('all'); await wait(40);
  var impRec=db.__data.rooms.BBMANN.salesRecords&&db.__data.rooms.BBMANN.salesRecords['imp1_0'];
  var wholeArr=db.__data.rooms.BBMANN.sales;
  ok(impRec&&impRec.total===7 && !wholeArr,'pushToFirebase(all): sales via guarded writer, NO whole-array write');

  // S8 indeterminate (roomOwners read fails) -> NO legacy, queued
  const s8=win_for('stallmate-9caac',{failRead:true}); await wait(60);
  s8.win.__legacyCalls=0;
  s8.win.updateSaleInFirebase({id:'x1.0',orderId:'x',time:1,total:5,totalSatang:500}); await wait(40);
  ok(s8.win.__legacyCalls===0,'indeterminate binding (read error): NO silent legacy (queued)');

  console.log('\n=== CANDIDATE SMOKE (hardened): '+pass+'/'+(pass+fail)+' PASS, '+fail+' FAIL ===');
  process.exit(fail===0?0:1);
})().catch(e=>{console.error('RUNNER ERROR',e&&e.stack||e);process.exit(2);});

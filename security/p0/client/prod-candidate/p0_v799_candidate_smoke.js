'use strict';
const fs=require('fs'); const { JSDOM }=require('jsdom');
let pass=0, fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); c?pass++:fail++;};

// extract the injected auth-layer <script> block from the candidate (the one containing our marker)
const html=fs.readFileSync('stallmate_v7.9.9.html','utf8');
const blocks=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const layer=blocks.find(b=>b.indexOf('v7.9.9 PRODUCTION AUTH LAYER')>=0);
if(!layer){ console.error('auth layer block not found'); process.exit(2); }

// ---- in-memory RTDB (compat-ish) ----
function makeDB(){
  const data={};
  const get=(p)=>p.split('/').filter(Boolean).reduce((o,k)=>(o==null?undefined:o[k]),data);
  const setP=(p,v)=>{const ks=p.split('/').filter(Boolean);let o=data;for(let i=0;i<ks.length-1;i++){o[ks[i]]=o[ks[i]]||{};o=o[ks[i]];}if(v===null)delete o[ks[ks.length-1]];else o[ks[ks.length-1]]=v;};
  return { __data:data, ref(p){ return {
    once(){ return Promise.resolve({ exists(){return get(p)!==undefined;}, val(){const v=get(p);return v===undefined?null:v;} }); },
    set(v){ setP(p, v===undefined?null:v); return Promise.resolve(); },
    transaction(fn){ const cur=get(p); const res=fn(cur===undefined?null:cur); if(res===undefined) return Promise.resolve({committed:false}); setP(p,res); return Promise.resolve({committed:true}); }
  }; } };
}
// ---- mock firebase compat ----
function makeAuth(projectId){
  let user=null; const stateCbs=[], tokCbs=[]; const fire=()=>{stateCbs.forEach(cb=>cb(user));tokCbs.forEach(cb=>cb(user));};
  return { currentUser:null,
    signInAnonymously(){ user={uid:'anon1',isAnonymous:true,providerData:[]}; this.currentUser=user; fire(); return Promise.resolve({user}); },
    signInWithEmailAndPassword(e,p){ user={uid:'owner1',isAnonymous:false,providerData:[{providerId:'password'}]}; this.currentUser=user; fire(); return Promise.resolve({user}); },
    signOut(){ user=null; this.currentUser=null; fire(); return Promise.resolve(); },
    onAuthStateChanged(cb){ stateCbs.push(cb); cb(user); return ()=>{}; },
    onIdTokenChanged(cb){ tokCbs.push(cb); return ()=>{}; } };
}
async function runScenario(projectId, expectBlocked){
  const dom=new JSDOM('<!DOCTYPE html><body></body>',{url:'http://localhost/',runScripts:'outside-only'});
  const win=dom.window;
  const db=makeDB(); const auth=makeAuth(projectId);
  win.fbDb=db; win.myRoomCode='BBMANN';
  win.unsyncedIds=new Set(); win.saveUnsynced=()=>{}; win.refreshSyncInfoText=()=>{};
  let origCalled=0; win.updateSaleInFirebase=function(){origCalled++;};
  win.firebase={ app(){return {options:{projectId}};}, auth(){return auth;}, database:{ServerValue:{TIMESTAMP:123456}} };
  // load the auth layer into the window
  win.eval(layer);
  await new Promise(r=>setTimeout(r,50)); // let init + anon bootstrap settle
  const bar=win.document.getElementById('__sm_authbar');
  if(expectBlocked){ ok(bar && /หยุด|allowlist/.test(bar.textContent), 'config guard REFUSES non-9caac project ('+projectId+')'); return; }
  ok(bar && !/หยุด/.test(bar.textContent), 'config guard ACCEPTS stallmate-9caac');
  const ctrl=win.__smAuth; ok(!!ctrl,'__smAuth controller exposed');
  await new Promise(r=>setTimeout(r,20));
  ok(auth.currentUser && auth.currentUser.isAnonymous,'anonymous bootstrap (device identity)');
  // telemetry written for device
  const tele=db.__data.readiness && db.__data.readiness.audit; const devKey=tele&&Object.keys(tele)[0];
  ok(tele && tele[devKey] && tele[devKey].appVersion==='7.9.9','§E telemetry written (appVersion 7.9.9)');
  // owner sign-in + bind + guarded write
  await ctrl.signInOwner('o@x.com','pw');
  db.ref('roomOwners/BBMANN').set('owner1'); // seed binding (admin/callable in prod; here to test authorized path)
  ok((await ctrl.isOwnerAuthorized())===true,'owner authorized after roomOwners bind');
  // override write: owner authed -> deterministic write to salesRecords
  win.updateSaleInFirebase({id:'s1.0',orderId:'o1',time:1,total:250,totalSatang:25000});
  await new Promise(r=>setTimeout(r,30));
  let rec=db.__data.rooms&&db.__data.rooms.BBMANN&&db.__data.rooms.BBMANN.salesRecords&&db.__data.rooms.BBMANN.salesRecords['s1_0'];
  ok(rec && rec.total===250,'owner guarded write -> salesRecords/{opId} (deterministic)');
  // same opId changed amount -> conflict, original unchanged
  win.updateSaleInFirebase({id:'s1.0',orderId:'o1',time:1,total:1,totalSatang:100});
  await new Promise(r=>setTimeout(r,30));
  rec=db.__data.rooms.BBMANN.salesRecords['s1_0'];
  ok(rec && rec.total===250,'same opId + changed amount -> original unchanged (OPID_CONFLICT)');
}
(async()=>{
  console.log('=== v7.9.9 CANDIDATE INTEGRATION SMOKE (jsdom + mock firebase/RTDB; synthetic) ===');
  await runScenario('stallmate-9caac', false);
  await runScenario('stallmate-staging-2026-5f39f', true);
  console.log('\n=== CANDIDATE SMOKE: '+pass+'/'+(pass+fail)+' PASS, '+fail+' FAIL ===');
  process.exit(fail===0?0:1);
})().catch(e=>{console.error('RUNNER ERROR',e&&e.stack||e);process.exit(2);});

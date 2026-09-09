/**
 * §E READ-PATH integration (E.2): device telemetry written to RTDB readiness/audit node,
 * gate reads it via admin and evaluates. RTDB emulator only; synthetic; no prod.
 */
'use strict';
const admin = require('firebase-admin');
const { evaluateReadinessGate } = require('/tmp/etest/p0_e_readiness_gate.js');
let pass=0, fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); c?pass++:fail++;};
const OWNER='ownerUID_permanent_001'; const NOW=Date.now(); const DAY=864e5; const MINV='7.9.9';
const app=admin.initializeApp({databaseURL:'http://127.0.0.1:9000?ns=demo-e'});
const db=admin.database(app);
async function readTelemetry(){ const s=await db.ref('readiness/audit').once('value'); return s.val()||{}; }
(async()=>{
  console.log('=== §E READ-PATH (RTDB emulator; synthetic) ===');
  // devices write telemetry (E.2)
  await db.ref('readiness/audit').set({
    devA:{deviceId:'devA',boundOwnerUid:OWNER,authProvider:'password',appVersion:'7.9.9',lastSeenAt:NOW-DAY},
    devB:{deviceId:'devB',boundOwnerUid:OWNER,authProvider:'password',appVersion:'7.9.9',lastSeenAt:NOW-2*DAY}
  });
  const inv=[{deviceId:'devA',label:'A'},{deviceId:'devB',label:'B'}];
  let tel=await readTelemetry();
  let r=evaluateReadinessGate({certifiedInventory:inv,telemetry:tel,roomOwnerUid:OWNER,minAuthVersion:MINV,now:NOW});
  ok(r.pass===true && r.readyCount===2,'gate reads RTDB telemetry, both ready => PASS');
  // break one: devB unbinds (writes a different owner)
  await db.ref('readiness/audit/devB/boundOwnerUid').set('attackerUID');
  tel=await readTelemetry();
  r=evaluateReadinessGate({certifiedInventory:inv,telemetry:tel,roomOwnerUid:OWNER,minAuthVersion:MINV,now:NOW});
  ok(r.pass===false && r.devices.find(x=>x.deviceId==='devB').why.includes('not_bound_to_owner'),'devB rebinds elsewhere => gate reads => FAIL');
  // unknown authed device appears
  await db.ref('readiness/audit/devB/boundOwnerUid').set(OWNER); // fix devB
  await db.ref('readiness/audit/ghostX').set({deviceId:'ghostX',boundOwnerUid:OWNER,authProvider:'password',appVersion:'7.9.9',lastSeenAt:NOW});
  tel=await readTelemetry();
  r=evaluateReadinessGate({certifiedInventory:inv,telemetry:tel,roomOwnerUid:OWNER,minAuthVersion:MINV,now:NOW});
  ok(r.pass===false && r.unknowns.some(u=>u.deviceId==='ghostX'),'unknown device in RTDB telemetry => flagged => FAIL');
  await db.ref('readiness').remove(); // cleanup
  console.log('\n=== §E READ-PATH: '+pass+'/'+(pass+fail)+' PASS, '+fail+' FAIL ===');
  process.exit(fail===0?0:1);
})().catch(e=>{console.error('RUNNER ERROR',e&&e.stack||e);process.exit(2);});

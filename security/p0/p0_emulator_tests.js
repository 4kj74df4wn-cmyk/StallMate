/**
 * StallMate P0 Phase 2A — EXECUTABLE Firebase RTDB rules test suite (Phase 2A Foundation PASS; HOLD-3/4/5 closed).
 * Real Firebase RTDB emulator (firebase-database-emulator-v4.11.2.jar, Java 11)
 * + @firebase/rules-unit-testing 5.0.2 + firebase 10.14.1.
 * Synthetic fixtures; per-role, per-rule-set (A/B/forward-fix) assertions; exit non-zero on ANY mismatch.
 * HOLD-4: proves schema-aware .validate blocks field-deletion / incomplete-replacement of financial+audit
 * data, while still ALLOWing legitimate modern AND legacy sale create/edit. No live project, no real data.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, get, set, update, remove } = require('firebase/database');

const OWNER = 'ownerUid_BBMANN';
const OTHEROWNER = 'ownerUid_OTHER';
const ATTACKER = 'attackerUid_x';
const RULES_DIR = process.env.RULES_DIR || __dirname;

// A=RulesA, B=RulesB, F=forward-fix
const SETS = [
  { id: 'p0rulesa', key:'A', label: 'RULES A (secure transitional)', file: 'p0_rulesA_secure_transitional.rules.json' },
  { id: 'p0rulesb', key:'B', label: 'RULES B (secure fallback)',      file: 'p0_rulesB_secure_fallback.rules.json' },
  { id: 'p0fwdfix', key:'F', label: 'FORWARD-FIX (deny-all-writes)',  file: 'p0_rules_forwardfix_denyallwrites.rules.json' },
];

const MODERN_SALE = { id:'s1', orderId:'o1', roundId:'r1', time:1, name:'x', qty:1, pay:'cash',
  total:250, totalSatang:25000, price:250, priceSatang:25000,
  cashAmount:250, cashSatang:25000, scanAmount:0, scanSatang:0, thaiAmount:0, thaiSatang:0, creditAmount:0, creditSatang:0 };
const LEGACY_SALE = { id:'sLeg', orderId:'oL', time:1, name:'y', qty:1, pay:'cash', total:120, price:120, cashAmount:120 };

let totalFail = 0, totalPass = 0; const summary = [];
const R = (db,p)=>ref(db,p);

function dbFor(env, role){
  if (role==='anon') return env.unauthenticatedContext().database();
  if (role==='attacker') return env.authenticatedContext(ATTACKER).database();
  if (role==='owner') return env.authenticatedContext(OWNER).database();
  throw new Error('bad role');
}

async function seed(env){
  await env.withSecurityRulesDisabled(async (ctx)=>{
    const db = ctx.database();
    await set(R(db,'/'), {
      roomOwners: { BBMANN: OWNER, OTHER: OTHEROWNER },
      rooms: {
        BBMANN: {
          salesRecords: { s1: MODERN_SALE, sLeg: LEGACY_SALE },
          deletedSales: { d1: { total: 100, voidedAt: 1 } },
          sessions: { se1: { id:'se1', roundId:'r1', startedAt: 10, open: true } },
          checkins: { '2026-09-03': { c1: { deviceId:'dev1', at: 5 } } },
          config: { maxBranches: 3 },
          staff: { st1: { id:'st1', active: true, name:'a', secondaryPasswordHash:'h' } },
          branches: { b1: { meta:{active:true}, menu:[{n:'a'}], trial:{status:'active'}, markets:{m1:true}, sellers:{s:true} } }
        },
        OTHER: { salesRecords: { o1: { total:1 } } }
      },
      trialRegistry: { dev1: { boundUid: OWNER, state:'active' }, dev2: { boundUid:'someoneElse' } },
      licenses: { CODE1:{redeemed:false}, CODE2:{redeemed:true, boundTo:OWNER} },
      shopProfiles: { [OWNER]:{firstSeenAt:1}, someoneElse:{firstSeenAt:1} },
      config: { latestVersion:'7.9.8.14', teamPricingEra:'v2' },
      affiliateConfig: { commissionPerReferralTHB:50 },
      affiliates: { a1:{ownerId:OWNER} }, referrals: { r1:{refereeId:OWNER} },
      dailyLoads: { '2026-09-03': { [OWNER]:{n:1} } },
      pilotOverrides: { BBMANN:{flag:true} }
    });
  });
}

// each case: role, desc, {A,B,F} expected 'ALLOW'|'DENY', fn(db)
function cases(){
  const L=[]; const add=(role,desc,exp,fn)=>L.push({role,desc,exp,fn});
  const ALL_DENY={A:'DENY',B:'DENY',F:'DENY'};

  // ---------- ANON: everything DENY ----------
  add('anon','read rooms/BBMANN/salesRecords',ALL_DENY,db=>get(R(db,'rooms/BBMANN/salesRecords')));
  add('anon','write salesRecords/x',ALL_DENY,db=>set(R(db,'rooms/BBMANN/salesRecords/x'),MODERN_SALE));
  add('anon','delete salesRecords/s1',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/salesRecords/s1')));
  add('anon','delete whole room',ALL_DENY,db=>remove(R(db,'rooms/BBMANN')));
  add('anon','read licenses/CODE2',ALL_DENY,db=>get(R(db,'licenses/CODE2')));
  add('anon','read trialRegistry/dev1',ALL_DENY,db=>get(R(db,'trialRegistry/dev1')));

  // ---------- ATTACKER: everything DENY ----------
  add('attacker','read rooms/BBMANN/salesRecords',ALL_DENY,db=>get(R(db,'rooms/BBMANN/salesRecords')));
  add('attacker','write salesRecords/x',ALL_DENY,db=>set(R(db,'rooms/BBMANN/salesRecords/x'),MODERN_SALE));
  add('attacker','delete salesRecords/s1',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/salesRecords/s1')));
  add('attacker','delete salesRecords/s1/cashSatang',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/salesRecords/s1/cashSatang')));
  add('attacker','delete session field',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/sessions/se1/roundId')));
  add('attacker','delete checkin field',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/checkins/2026-09-03/c1/at')));
  add('attacker','delete branch trial',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/branches/b1/trial')));
  add('attacker','delete staff field',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/staff/st1/secondaryPasswordHash')));
  add('attacker','write unknown room child',ALL_DENY,db=>set(R(db,'rooms/BBMANN/evil'),{x:1}));
  add('attacker','delete whole room',ALL_DENY,db=>remove(R(db,'rooms/BBMANN')));
  add('attacker','direct redeem licenses/CODE1',ALL_DENY,db=>set(R(db,'licenses/CODE1'),{redeemed:true,boundTo:ATTACKER}));
  add('attacker','enumerate licenses',ALL_DENY,db=>get(R(db,'licenses')));
  add('attacker','write shopProfiles/OWNER',ALL_DENY,db=>set(R(db,'shopProfiles/'+OWNER),{x:1}));
  add('attacker','write global config child',ALL_DENY,db=>set(R(db,'config/teamPricingEra'),'hacked'));
  add('attacker','read other-device trial',ALL_DENY,db=>get(R(db,'trialRegistry/dev1')));

  // ---------- OWNER: reads ----------
  add('owner','read rooms/BBMANN',{A:'ALLOW',B:'ALLOW',F:'ALLOW'},db=>get(R(db,'rooms/BBMANN')));
  add('owner','read OTHER business',ALL_DENY,db=>get(R(db,'rooms/OTHER')));
  add('owner','read own license CODE2',{A:'ALLOW',B:'ALLOW',F:'ALLOW'},db=>get(R(db,'licenses/CODE2')));
  add('owner','read own trial dev1',{A:'ALLOW',B:'ALLOW',F:'ALLOW'},db=>get(R(db,'trialRegistry/dev1')));
  add('owner','read other trial dev2',ALL_DENY,db=>get(R(db,'trialRegistry/dev2')));

  // ---------- HOLD-5: trialRegistry ownership (create vs update; no boundUid takeover) ----------
  const trialWrite={A:'ALLOW',B:'ALLOW',F:'DENY'};
  add('owner','update own trial preserve boundUid',trialWrite,db=>set(R(db,'trialRegistry/dev1'),{boundUid:OWNER,state:'renewed'}));
  add('attacker','overwrite owner device + change boundUid',ALL_DENY,db=>set(R(db,'trialRegistry/dev1'),{boundUid:ATTACKER,state:'hijack'}));
  add('attacker','modify owner device preserving owner boundUid',ALL_DENY,db=>set(R(db,'trialRegistry/dev1'),{boundUid:OWNER,state:'tamper'}));
  add('owner','change own trial boundUid to another uid',ALL_DENY,db=>set(R(db,'trialRegistry/dev1'),{boundUid:OTHEROWNER,state:'x'}));
  add('attacker','create new unclaimed device bound to self',trialWrite,db=>set(R(db,'trialRegistry/devNewAtt'),{boundUid:ATTACKER,state:'active'}));
  add('anon','create trial device bound to self',ALL_DENY,db=>set(R(db,'trialRegistry/devAnon'),{boundUid:'anon',state:'active'}));
  add('anon','update owner trial device',ALL_DENY,db=>set(R(db,'trialRegistry/dev1'),{boundUid:OWNER,state:'x'}));
  add('anon','delete owner trial device',ALL_DENY,db=>remove(R(db,'trialRegistry/dev1')));
  add('owner','whole-record delete own trial device',ALL_DENY,db=>remove(R(db,'trialRegistry/dev1')));
  add('owner','nested delete trial boundUid',ALL_DENY,db=>remove(R(db,'trialRegistry/dev1/boundUid')));

  // ---------- OWNER: legitimate sale create/edit (ALLOW in A&B, DENY in F) ----------
  const AB_notF={A:'ALLOW',B:'ALLOW',F:'DENY'};
  add('owner','create MODERN sale',AB_notF,db=>set(R(db,'rooms/BBMANN/salesRecords/sNew'),{...MODERN_SALE,id:'sNew',orderId:'oNew'}));
  add('owner','create LEGACY sale',AB_notF,db=>set(R(db,'rooms/BBMANN/salesRecords/sLegNew'),{...LEGACY_SALE,id:'sLegNew',orderId:'oLNew'}));
  add('owner','edit MODERN sale keep all fields',AB_notF,db=>set(R(db,'rooms/BBMANN/salesRecords/s1'),{...MODERN_SALE,total:260,totalSatang:26000}));
  add('owner','edit LEGACY sale keep all fields',AB_notF,db=>set(R(db,'rooms/BBMANN/salesRecords/sLeg'),{...LEGACY_SALE,total:130}));
  add('owner','update single leaf cashSatang value',AB_notF,db=>set(R(db,'rooms/BBMANN/salesRecords/s1/cashSatang'),12345));
  add('owner','append deletedSales/x',AB_notF,db=>set(R(db,'rooms/BBMANN/deletedSales/x'),{total:1,voidedAt:2}));
  add('owner','update session keep fields',AB_notF,db=>set(R(db,'rooms/BBMANN/sessions/se1'),{id:'se1',roundId:'r1',startedAt:10,open:false}));
  add('owner','write new checkin',AB_notF,db=>set(R(db,'rooms/BBMANN/checkins/2026-09-03/c2'),{deviceId:'dev1',at:9}));
  add('owner','write own shopProfile',AB_notF,db=>set(R(db,'shopProfiles/'+OWNER),{firstSeenAt:2}));

  // ---------- OWNER: HOLD-4 destructive on financial/audit — DENY in ALL sets ----------
  add('owner','HARD-DELETE sale s1',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/salesRecords/s1')));
  add('owner','delete salesRecords/s1/cashSatang',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/salesRecords/s1/cashSatang')));
  add('owner','set salesRecords/s1/cashSatang=null',ALL_DENY,db=>set(R(db,'rooms/BBMANN/salesRecords/s1/cashSatang'),null));
  add('owner','set salesRecords/s1/total=null (required money)',ALL_DENY,db=>set(R(db,'rooms/BBMANN/salesRecords/s1/total'),null));
  add('owner','replace sale s1 with incomplete object',ALL_DENY,db=>set(R(db,'rooms/BBMANN/salesRecords/s1'),{totalSatang:9999}));
  add('owner','delete legacy money field cashAmount',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/salesRecords/sLeg/cashAmount')));
  add('owner','mutate existing deletedSales/d1',ALL_DENY,db=>set(R(db,'rooms/BBMANN/deletedSales/d1'),{total:2}));
  add('owner','delete nested session field roundId',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/sessions/se1/roundId')));
  add('owner','delete nested checkin field at',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/checkins/2026-09-03/c1/at')));
  add('owner','delete session se1 (whole)',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/sessions/se1')));
  add('owner','delete checkin c1 (whole)',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/checkins/2026-09-03/c1')));
  add('owner','delete config child',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/config/maxBranches')));
  add('owner','delete whole room',ALL_DENY,db=>remove(R(db,'rooms/BBMANN')));
  add('owner','write unknown room child',ALL_DENY,db=>set(R(db,'rooms/BBMANN/evil'),{x:1}));
  add('owner','client write license CODE2',ALL_DENY,db=>set(R(db,'licenses/CODE2'),{redeemed:true,boundTo:OWNER}));
  // multi-location update containing a nested null (delete) -> DENY all sets
  add('owner','multi-loc update w/ nested null (sale field)',ALL_DENY,db=>update(R(db,'rooms/BBMANN'),{'sessions/se1/open':false,'salesRecords/s1/cashSatang':null}));
  add('owner','multi-loc update w/ nested null (session field)',ALL_DENY,db=>update(R(db,'rooms/BBMANN'),{'salesRecords/s1/total':260,'sessions/se1/roundId':null}));

  // ---------- OWNER: branch/staff/config — A allows valid edit, B read-only DENY, F DENY ----------
  const A_only={A:'ALLOW',B:'DENY',F:'DENY'};
  add('owner','update branch menu (replace)',A_only,db=>update(R(db,'rooms/BBMANN/branches/b1'),{menu:[{n:'b'}],menuTs:1}));
  add('owner','soft-deactivate branch meta/active=false',A_only,db=>set(R(db,'rooms/BBMANN/branches/b1/meta/active'),false));
  add('owner','update config child maxBranches',A_only,db=>set(R(db,'rooms/BBMANN/config/maxBranches'),5));
  add('owner','soft-deactivate staff active=false',A_only,db=>set(R(db,'rooms/BBMANN/staff/st1/active'),false));
  // branch/staff nested deletion — DENY all sets (A via validate, B/F via no-write)
  add('owner','delete branches/b1/trial',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/branches/b1/trial')));
  add('owner','delete branches/b1/menu',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/branches/b1/menu')));
  add('owner','delete branch b1 (whole)',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/branches/b1')));
  add('owner','delete staff protected field secondaryPasswordHash',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/staff/st1/secondaryPasswordHash')));
  add('owner','delete staff st1 (whole)',ALL_DENY,db=>remove(R(db,'rooms/BBMANN/staff/st1')));

  return L;
}

(async () => {
  const stripComments = (o) => {
    if (Array.isArray(o)) return o.map(stripComments);
    if (o && typeof o==='object'){ const out={}; for (const k of Object.keys(o)){ if (k==='//') continue; out[k]=stripComments(o[k]); } return out; }
    return o;
  };
  const CASES = cases();
  for (const s of SETS){
    const raw = JSON.parse(fs.readFileSync(path.join(RULES_DIR, s.file),'utf8'));
    const rules = JSON.stringify(stripComments(raw));
    const env = await initializeTestEnvironment({ projectId: s.id, database: { rules } });
    let pass=0, fail=0;
    console.log('\n==================== '+s.label+' ====================');
    for (const c of CASES){
      await seed(env); // fresh state per case (isolates destructive attempts)
      const expect = c.exp[s.key];
      const db = dbFor(env, c.role);
      let ok;
      try {
        const p = c.fn(db);
        if (expect==='ALLOW'){ await assertSucceeds(p); ok=true; } else { await assertFails(p); ok=true; }
      } catch(e){ ok=false; }
      if (ok){ pass++; totalPass++; console.log(`  PASS [${c.role}] ${c.desc} = ${expect}`); }
      else { fail++; totalFail++; console.log(`  FAIL [${c.role}] ${c.desc} — expected ${expect}`); }
    }
    console.log(`  ---- ${s.label}: ${pass}/${pass+fail} PASS ----`);
    summary.push(`${s.label}: ${pass}/${pass+fail}`);
    await env.cleanup();
  }
  console.log('\n==================== SUMMARY ====================');
  summary.forEach(l=>console.log('  '+l));
  console.log(`  TOTAL: ${totalPass}/${totalPass+totalFail} PASS, ${totalFail} FAIL`);
  process.exit(totalFail===0?0:1);
})().catch(e=>{ console.error('RUNNER ERROR', e); process.exit(2); });

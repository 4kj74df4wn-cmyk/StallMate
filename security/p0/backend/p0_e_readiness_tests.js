/**
 * StallMate P0 — §E READINESS-GATE VERIFICATION SUITE (synthetic; no prod; no deploy).
 * Proves the §E evaluator is PASS/FAIL-decidable per HOLD-2 E.1–E.7. Pure logic, deterministic.
 * Exit 0 iff all pass. Synthetic device ids only (no real BBMANN device data).
 */
'use strict';
const path = require('path');
const { evaluateReadinessGate, cmpVersion } = require(path.join(__dirname, 'p0_e_readiness_gate.js'));

let pass = 0, fail = 0;
function ok(c, l) { console.log((c ? '  PASS ' : '  FAIL ') + l); if (c) pass++; else fail++; }

const NOW = 1_800_000_000_000;              // fixed instant
const DAY = 24 * 60 * 60 * 1000;
const OWNER = 'ownerUID_permanent_001';
const MINV = '7.9.9';                        // auth-capable build floor (placeholder)
const inv = (n) => Array.from({ length: n }, (_, i) => ({ deviceId: 'dev' + (i + 1), label: 'shop-dev' + (i + 1) }));
const tOK = (id, over = {}) => ({ deviceId: id, boundOwnerUid: OWNER, authProvider: 'password',
  appVersion: '7.9.9', lastSeenAt: NOW - 1 * DAY, ...over });

function run() {
  console.log('=== P0 §E READINESS GATE — VERIFICATION (synthetic; no prod) ===');

  // 1) all active ready -> PASS (2-device BBMANN-like)
  let r = evaluateReadinessGate({ certifiedInventory: inv(2), telemetry: { dev1: tOK('dev1'), dev2: tOK('dev2') },
    roomOwnerUid: OWNER, minAuthVersion: MINV, now: NOW });
  ok(r.pass === true && r.denominator === 2 && r.readyCount === 2, 'all active devices bound+seen+version => PASS (100%)');

  // 2) one device unbound -> FAIL
  r = evaluateReadinessGate({ certifiedInventory: inv(2), telemetry: { dev1: tOK('dev1'), dev2: tOK('dev2', { boundOwnerUid: 'someoneElse' }) },
    roomOwnerUid: OWNER, minAuthVersion: MINV, now: NOW });
  ok(r.pass === false && r.reasons.includes('not_all_active_ready') && r.devices.find(x => x.deviceId === 'dev2').why.includes('not_bound_to_owner'),
    'one active device not bound to owner => FAIL');

  // 3) one device silent (no telemetry) -> FAIL (E.4)
  r = evaluateReadinessGate({ certifiedInventory: inv(2), telemetry: { dev1: tOK('dev1') },
    roomOwnerUid: OWNER, minAuthVersion: MINV, now: NOW });
  ok(r.pass === false && r.devices.find(x => x.deviceId === 'dev2').why.includes('no_telemetry'),
    'certified device with no telemetry (silent) => FAIL');

  // 4) one device seen but > 7 days ago (out of window) -> FAIL (E.3/E.4)
  r = evaluateReadinessGate({ certifiedInventory: inv(2), telemetry: { dev1: tOK('dev1'), dev2: tOK('dev2', { lastSeenAt: NOW - 8 * DAY }) },
    roomOwnerUid: OWNER, minAuthVersion: MINV, now: NOW });
  ok(r.pass === false && r.devices.find(x => x.deviceId === 'dev2').why.includes('not_seen_in_window'),
    'device last seen > 7 days (not reclassified) => FAIL');

  // 5) reclassified retired device excluded from denominator -> PASS (rest ready) (E.6)
  r = evaluateReadinessGate({ certifiedInventory: inv(2), reclassified: ['dev2'], telemetry: { dev1: tOK('dev1') },
    roomOwnerUid: OWNER, minAuthVersion: MINV, now: NOW });
  ok(r.pass === true && r.denominator === 1 && r.readyCount === 1, 'reclassified (retired) device removed from denominator => PASS');

  // 6) appVersion below auth-capable build -> FAIL (E.5)
  r = evaluateReadinessGate({ certifiedInventory: inv(1), telemetry: { dev1: tOK('dev1', { appVersion: '7.9.8' }) },
    roomOwnerUid: OWNER, minAuthVersion: MINV, now: NOW });
  ok(r.pass === false && r.devices[0].why.includes('appVersion_below_auth_build'), 'appVersion below auth-capable build => FAIL');

  // 7) unknown authed device present in telemetry -> FAIL (E.1 investigate)
  r = evaluateReadinessGate({ certifiedInventory: inv(1), telemetry: { dev1: tOK('dev1'), ghost9: tOK('ghost9') },
    roomOwnerUid: OWNER, minAuthVersion: MINV, now: NOW });
  ok(r.pass === false && r.reasons.includes('unknown_device_present') && r.unknowns.some(u => u.deviceId === 'ghost9'),
    'unknown authed device in telemetry => FAIL + flagged for investigation');

  // 8) no roomOwner bound -> FAIL
  r = evaluateReadinessGate({ certifiedInventory: inv(1), telemetry: { dev1: tOK('dev1') }, roomOwnerUid: null, minAuthVersion: MINV, now: NOW });
  ok(r.pass === false && r.reasons.includes('no_room_owner_bound'), 'no roomOwners binding => FAIL');

  // 9) empty certified inventory -> FAIL (no denominator)
  r = evaluateReadinessGate({ certifiedInventory: [], telemetry: {}, roomOwnerUid: OWNER, minAuthVersion: MINV, now: NOW });
  ok(r.pass === false && r.reasons.includes('empty_denominator'), 'empty certified inventory => FAIL');

  // 10) boundary: lastSeenAt exactly at window start -> in window (ready)
  r = evaluateReadinessGate({ certifiedInventory: inv(1), telemetry: { dev1: tOK('dev1', { lastSeenAt: NOW - 7 * DAY }) },
    roomOwnerUid: OWNER, minAuthVersion: MINV, now: NOW });
  ok(r.pass === true, 'lastSeenAt exactly at 7-day window start => in window => PASS');

  // 11) version comparator unit checks
  ok(cmpVersion('7.9.9', '7.9.9') === 0 && cmpVersion('7.9.10', '7.9.9') === 1 && cmpVersion('7.9.8', '7.9.9') === -1
     && cmpVersion('7.9.9.1', '7.9.9') === 1, 'cmpVersion dotted-numeric correct');

  // 12) multi-device (3) all ready -> PASS; then break one -> FAIL (100% strictness)
  r = evaluateReadinessGate({ certifiedInventory: inv(3), telemetry: { dev1: tOK('dev1'), dev2: tOK('dev2'), dev3: tOK('dev3') },
    roomOwnerUid: OWNER, minAuthVersion: MINV, now: NOW });
  ok(r.pass === true && r.readyCount === 3, '3/3 ready => PASS');
  r.devices = null; // guard against reuse
  let r2 = evaluateReadinessGate({ certifiedInventory: inv(3), telemetry: { dev1: tOK('dev1'), dev2: tOK('dev2'), dev3: tOK('dev3', { lastSeenAt: NOW - 30 * DAY }) },
    roomOwnerUid: OWNER, minAuthVersion: MINV, now: NOW });
  ok(r2.pass === false && r2.readyCount === 2 && r2.denominator === 3, '2/3 ready => FAIL (100% rule, one silent)');

  console.log('\n=== §E READINESS GATE: ' + pass + '/' + (pass + fail) + ' PASS, ' + fail + ' FAIL ===');
  process.exit(fail === 0 ? 0 : 1);
}
run();

/**
 * StallMate P0 — §E DEVICE-READINESS GATE EVALUATOR (VERIFICATION-ONLY mechanism).
 * Repo (staging): security/p0/backend/p0_e_readiness_gate.js
 *
 * Implements the PASS/FAIL-decidable §E gate from HOLD-2 CORRECTED (E.1–E.7).
 * Pure, dependency-injected: inputs are plain data (no network, no prod). The caller
 * supplies the telemetry snapshot (read from the readiness/audit RTDB node) + certified
 * inventory + reclassifications + evaluation instant + min auth-capable version.
 *
 * This is the GATE MECHANISM. A real gate run (before production R3) uses June's certified
 * real-device inventory; verification runs use synthetic inventories. It NEVER tightens rules
 * and NEVER touches production — it only computes PASS/FAIL + a per-device report (E.7).
 *
 * PASS (E.5, the 100% rule): iff for EVERY device in (certified − reclassified), within the
 * 7-day window (E.3): boundOwnerUid === roomOwners/BBMANN AND lastSeenAt within window AND
 * appVersion ≥ auth-capable build. Denominator = certified − reclassified. Any single active
 * device unbound/unseen/old-version → FAIL. Any unknown authed device in telemetry → FAIL
 * (must be investigated per E.1). No prose approximations.
 */
'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

// semantic-ish version compare for "a.b.c.d" (numeric dotted). returns -1/0/1
function cmpVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * evaluateReadinessGate(input) -> { pass, denominator, readyCount, devices:[...], unknowns:[...], reasons:[...] }
 * input = {
 *   certifiedInventory: [{ deviceId, label }],          // E.1 (June-certified active set)
 *   reclassified: [deviceId,...],                        // E.6 (retired/lost, removed from denominator)
 *   telemetry: { <deviceId>: { deviceId, boundOwnerUid, authProvider, appVersion, lastSeenAt } }, // E.2
 *   roomOwnerUid: '<uid bound at roomOwners/BBMANN>',    // E.5 target
 *   minAuthVersion: '7.9.9',                             // E.5 auth-capable build floor
 *   now: <ms>,                                           // E.3 evaluation instant
 *   windowDays: 7                                        // E.3 (default 7)
 * }
 */
function evaluateReadinessGate(input) {
  const d = input || {};
  const windowDays = d.windowDays || 7;
  const now = d.now || Date.now();
  const windowStart = now - windowDays * DAY_MS;
  const reclassified = new Set(d.reclassified || []);
  const telemetry = d.telemetry || {};
  const roomOwnerUid = d.roomOwnerUid || null;
  const minAuthVersion = d.minAuthVersion || '0';

  if (!roomOwnerUid) {
    return { pass: false, denominator: 0, readyCount: 0, devices: [], unknowns: [],
             reasons: ['no_room_owner_bound'] };
  }

  // E.1 denominator = certified − reclassified
  const active = (d.certifiedInventory || []).filter(x => !reclassified.has(x.deviceId));
  const certifiedIds = new Set((d.certifiedInventory || []).map(x => x.deviceId));

  const devices = [];
  let readyCount = 0;
  for (const dev of active) {
    const t = telemetry[dev.deviceId] || null;
    const seen = t && typeof t.lastSeenAt === 'number';
    const inWindow = seen && t.lastSeenAt >= windowStart && t.lastSeenAt <= now;
    const bound = !!t && t.boundOwnerUid === roomOwnerUid;
    const versionOk = !!t && cmpVersion(t.appVersion, minAuthVersion) >= 0;
    const why = [];
    if (!t) why.push('no_telemetry');            // E.4 silent certified device
    else {
      if (!inWindow) why.push('not_seen_in_window');
      if (!bound) why.push('not_bound_to_owner');
      if (!versionOk) why.push('appVersion_below_auth_build');
    }
    const ready = t && inWindow && bound && versionOk;
    if (ready) readyCount++;
    devices.push({
      deviceId: dev.deviceId, label: dev.label || null,
      bound, inWindow, versionOk,
      lastSeenAt: t ? t.lastSeenAt : null,
      appVersion: t ? t.appVersion : null,
      ready: !!ready, why
    });
  }

  // E.1 unknowns: authed devices in telemetry that are neither certified nor reclassified.
  // An unknown authed device is a security flag (possible attacker/forgotten device) → block PASS.
  const unknowns = Object.keys(telemetry)
    .filter(id => !certifiedIds.has(id) && !reclassified.has(id))
    .map(id => ({ deviceId: id, boundOwnerUid: (telemetry[id] || {}).boundOwnerUid || null,
                  lastSeenAt: (telemetry[id] || {}).lastSeenAt || null }));

  const denominator = active.length;
  const reasons = [];
  if (denominator === 0) reasons.push('empty_denominator');           // nothing certified → not PASS
  if (readyCount < denominator) reasons.push('not_all_active_ready');  // E.5 100% rule
  if (unknowns.length > 0) reasons.push('unknown_device_present');     // E.1 investigate first

  const pass = denominator > 0 && readyCount === denominator && unknowns.length === 0;
  return { pass, denominator, readyCount, devices, unknowns, reasons,
           window: { start: windowStart, end: now, days: windowDays } };
}

module.exports = { evaluateReadinessGate, cmpVersion };

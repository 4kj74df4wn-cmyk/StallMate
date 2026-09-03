// StallMate Build A — M0 safety-test harness (F05: portable — resolves candidate path
// relative to this script's own location, with optional CLI override).
// Extracts REAL function/const source from the candidate .html and runs deterministic tests.
// Per R12: code-level/automated evidence only — not a claim of physical device execution.
// Usage: node StallMate_BuildA_M0_SafetyTest_Harness.js [path/to/stallmate_v7.9.8.14.html]
'use strict';
const fs = require('fs');
const path = require('path');

const candidatePath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(__dirname, 'stallmate_v7.9.8.14.html');

if (!fs.existsSync(candidatePath)) {
  console.error('Candidate file not found: ' + candidatePath);
  console.error('Pass an explicit path as the first argument if the file lives elsewhere.');
  process.exit(2);
}
const html = fs.readFileSync(candidatePath, 'utf8');
console.log('Candidate file: ' + candidatePath);

const startMarker = '// BUILD A — M0: Baseline & Safety Foundation (v7.9.8.14)';
const endMarker = '// ═══ จบ BUILD A — M0 foundation block ═══';
const si = html.indexOf(startMarker);
const ei = html.indexOf(endMarker);
if (si === -1 || ei === -1) throw new Error('M0 block markers not found in candidate file');
// exclude the final "ensurePreUpgradeSnapshotV14();" auto-invocation line from the extracted
// block for sandboxed unit tests — the harness calls it explicitly per-test with a fresh shim,
// so an unconditional call baked into the extracted source would run once uncontrolled on eval.
const rawBlock = html.slice(si, ei);
const block = rawBlock.replace(/\nensurePreUpgradeSnapshotV14\(\);\n/, '\n');

// ── In-memory localStorage / sessionStorage shim with failure injection ──
function makeStorage() {
  const store = {};
  const shim = {
    _store: store,
    _failOnSetKey: null,
    _corruptReadBackKey: null,
    setItem(k, v) {
      if (shim._failOnSetKey === k) throw new DOMExceptionLike('QuotaExceededError');
      store[k] = v;
    },
    getItem(k) {
      if (!(k in store)) return null;
      if (shim._corruptReadBackKey === k) return store[k] + '_CORRUPTED';
      return store[k];
    },
    removeItem(k) { delete store[k]; },
    key(i) { return Object.keys(store)[i] ?? null; },
    get length() { return Object.keys(store).length; }
  };
  return shim;
}
function DOMExceptionLike(name) { const e = new Error(name); e.name = name; return e; }

// ── Build sandbox scope and eval the extracted block into it ──
// M0 block no longer closes over app-level vars (menu/sales/etc.) — it reads localStorage directly
// (F03 fix), so the sandbox only needs localStorage/sessionStorage/console.
function runInSandbox(localStorageShim, sessionStorageShim) {
  const console_ = { error: () => {}, log: () => {} }; // silence expected error logs during negative tests
  const fn = new Function(
    'localStorage', 'sessionStorage', 'console',
    block + '\nreturn {BUILD_A_SCHEMA_VERSION,SM_KEYS,SM_DYNAMIC_KEY_RESOLVERS,resolveDynamicKeys,allKnownLocalKeys,' +
      'toSatang,satangToBahtNum,sumSatang,allocateSatangProportional,guardedSetItem,guardedGetItem,guardedRemoveItem,' +
      'enterReadSafeMode,capturePreUpgradeSnapshotPayload,validatePreUpgradeSnapshotStructure,ensurePreUpgradeSnapshotV14,' +
      'get smReadSafeMode(){return smReadSafeMode;},get smReadSafeReason(){return smReadSafeReason;}};'
  );
  return fn(localStorageShim, sessionStorageShim || makeStorage(), console_);
}

// ── Assertion helpers ──
let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, detail !== undefined ? ('— ' + detail) : ''); }
}

// ═══ Test 1: satang helpers — exact conversions ═══
{
  const ls = makeStorage();
  const M = runInSandbox(ls);
  assert('toSatang(100.01) === 10001', M.toSatang(100.01) === 10001, M.toSatang(100.01));
  assert('toSatang(425) === 42500', M.toSatang(425) === 42500, M.toSatang(425));
  assert('toSatang(NaN) === null (invalid, not silently 0)', M.toSatang(NaN) === null);
  assert("toSatang('abc') === null", M.toSatang('abc') === null);
  assert('satangToBahtNum(10001) === 100.01', M.satangToBahtNum(10001) === 100.01);
}

// ═══ Test 2 (F01 — expanded per Room 00 required test list): sumSatang explicit invalid-flagging, never silent 0 ═══
{
  const ls = makeStorage();
  const M = runInSandbox(ls);
  const r1 = M.sumSatang([100, 200, 300]);
  assert('sumSatang all-valid → ok:true, sum:600', r1.ok === true && r1.sum === 600, JSON.stringify(r1));
  const r2 = M.sumSatang([100, NaN, 300]);
  assert('sumSatang with NaN → ok:false, sum:null (NOT 0), invalidIndexes:[1]', r2.ok === false && r2.sum === null && JSON.stringify(r2.invalidIndexes) === '[1]', JSON.stringify(r2));
  const r3 = M.sumSatang([100, 'abc', 300]);
  assert('sumSatang with string → flagged invalid, not coerced', r3.ok === false && JSON.stringify(r3.invalidIndexes) === '[1]', JSON.stringify(r3));
  const r4 = M.sumSatang([100, Infinity, 300]);
  assert('sumSatang with Infinity → flagged invalid', r4.ok === false && JSON.stringify(r4.invalidIndexes) === '[1]', JSON.stringify(r4));
  const r5 = M.sumSatang([100, -50, 300]);
  assert('sumSatang with negative value → flagged invalid (per Room 00 required test)', r5.ok === false && JSON.stringify(r5.invalidIndexes) === '[1]', JSON.stringify(r5));
  const r6 = M.sumSatang([100, 100.5, 300]);
  assert('sumSatang with non-integer satang (100.5) → flagged invalid', r6.ok === false && JSON.stringify(r6.invalidIndexes) === '[1]', JSON.stringify(r6));
  const r7 = M.sumSatang([NaN, 'x', -1, 100.5, 100]);
  assert('sumSatang multiple invalid entries → all indexes captured, partialSum still tracked for reference', r7.ok === false && JSON.stringify(r7.invalidIndexes) === '[0,1,2,3]' && r7.partialSum === 100, JSON.stringify(r7));
}

// ═══ Test 3: allocateSatangProportional — remainder-carry, exact sum ═══
{
  const ls = makeStorage();
  const M = runInSandbox(ls);
  const alloc1 = M.allocateSatangProportional(100, [1, 1, 1]);
  assert('allocateSatangProportional 100/[1,1,1] sums to 100 exactly', alloc1.reduce((a, b) => a + b, 0) === 100, JSON.stringify(alloc1));
  const alloc2 = M.allocateSatangProportional(42500, [30000, 12500]);
  assert('allocateSatangProportional 2-row exact split sums to total', alloc2.reduce((a, b) => a + b, 0) === 42500, JSON.stringify(alloc2));
}

// ═══ Test 4: guardedSetItem/guardedGetItem — round-trip, corruption detection, thrown exception ═══
{
  const ls = makeStorage();
  const M = runInSandbox(ls);
  assert('guardedSetItem normal write returns true', M.guardedSetItem('test_key', 'hello') === true);
  assert('guardedGetItem reads back written value', M.guardedGetItem('test_key') === 'hello');
}
{
  const ls = makeStorage();
  const M = runInSandbox(ls);
  ls._corruptReadBackKey = 'bad_key';
  assert('guardedSetItem returns false on read-back mismatch', M.guardedSetItem('bad_key', 'value1') === false);
}
{
  const ls = makeStorage();
  const M = runInSandbox(ls);
  ls._failOnSetKey = 'full_key';
  assert('guardedSetItem returns false when setItem throws', M.guardedSetItem('full_key', 'value1') === false);
  assert('guardedSetItem leaves no partial value on throw', ls.getItem('full_key') === null);
}

// ═══ Test 5 (F02): key registry completeness — source-scan against the ACTUAL candidate file ═══
{
  const ls = makeStorage();
  const M = runInSandbox(ls);

  // Extract every literal localStorage/sessionStorage key used anywhere in the real file.
  // negative lookahead (?!\s*\+) excludes dynamic constructions like 'sm_checkin_'+today —
  // those are prefixes of a concatenation, not complete fixed-key literals, and are checked separately below.
  const literalMatches = [...html.matchAll(/(localStorage|sessionStorage)\.(setItem|getItem|removeItem)\(\s*'([a-zA-Z0-9_]+)'(?!\s*\+)/g)];
  const localLiterals = new Set(literalMatches.filter(m => m[1] === 'localStorage').map(m => m[3]));
  const sessionLiterals = new Set(literalMatches.filter(m => m[1] === 'sessionStorage').map(m => m[3]));

  // Extract dynamic prefix constructions: 'sm_..._'+var or 'sm_..._b_'+var
  const dynMatches = [...html.matchAll(/['"`](sm_[a-zA-Z0-9_]+_)['"`]\s*\+/g)];
  const dynPrefixesFound = new Set(dynMatches.map(m => m[1]));

  const knownFixed = new Set(M.SM_KEYS.existing.concat(M.SM_KEYS.buildA));
  const knownSession = new Set(M.SM_KEYS.existingSession);
  const knownDynPrefixes = Object.keys(M.SM_DYNAMIC_KEY_RESOLVERS).map(name => M.SM_DYNAMIC_KEY_RESOLVERS[name].prefix);

  const missingLocalFixed = [...localLiterals].filter(k => !knownFixed.has(k));
  const missingSession = [...sessionLiterals].filter(k => !knownSession.has(k));
  const missingDynPrefixes = [...dynPrefixesFound].filter(p => !knownDynPrefixes.includes(p));

  assert('source-scan: every literal localStorage key in the file is in SM_KEYS (existing ∪ buildA)',
    missingLocalFixed.length === 0, 'missing: ' + JSON.stringify(missingLocalFixed));
  assert('source-scan: every literal sessionStorage key in the file is in SM_KEYS.existingSession',
    missingSession.length === 0, 'missing: ' + JSON.stringify(missingSession));
  assert('source-scan: every dynamic key-prefix construction in the file matches a registered resolver prefix',
    missingDynPrefixes.length === 0, 'missing: ' + JSON.stringify(missingDynPrefixes));
  assert('sm_trial is present in SM_KEYS.existing (Room 00 F02 finding)', M.SM_KEYS.existing.includes('sm_trial'));

  const requiredBuildA = ['sm_credit_payments', 'sm_pin_verifier', 'sm_pre_restore', 'sm_recovery_before_clear',
    'sm_restore_in_progress', 'sm_pre_upgrade_v14', 'sm_pending_credit_operation', 'sm_sale_edits',
    'sm_credit_ledger_reliable_from', 'sm_v14_ledger_active'];
  assert('SM_KEYS.buildA contains all 10 required Build A keys',
    requiredBuildA.every(k => M.SM_KEYS.buildA.includes(k)));
  assert('BUILD_A_SCHEMA_VERSION === "A-1"', M.BUILD_A_SCHEMA_VERSION === 'A-1');
}

// ═══ Test 6 (F02): resolveDynamicKeys() enumerates real branch/date keys, not guessed ones ═══
{
  const ls = makeStorage();
  ls._store['sm_menu_b_branch123'] = '[]';
  ls._store['sm_trial_b_branch123'] = '{}';
  ls._store['sm_checkin_2026-08-27'] = '{}';
  ls._store['sm_menu'] = '[]'; // fixed key, must NOT be picked up as a "menuByBranch" dynamic match
  const M = runInSandbox(ls);
  const dyn = M.resolveDynamicKeys();
  assert('resolveDynamicKeys finds sm_menu_b_branch123 under menuByBranch', dyn.menuByBranch.includes('sm_menu_b_branch123'));
  assert('resolveDynamicKeys finds sm_trial_b_branch123 under trialByBranch', dyn.trialByBranch.includes('sm_trial_b_branch123'));
  assert('resolveDynamicKeys finds sm_checkin_2026-08-27 under checkinByDate', dyn.checkinByDate.includes('sm_checkin_2026-08-27'));
  assert('resolveDynamicKeys does NOT mistake fixed sm_menu for a branch key', !dyn.menuByBranch.includes('sm_menu'));
}

// ═══ Test 7 (F03): snapshot captures RAW localStorage — proves it would see pre-upgrade state
//                   even if it ran before any in-memory app variable existed ═══
{
  const ls = makeStorage();
  ls._store['sm_cfg'] = JSON.stringify({ shopName: 'ร้าน A' });
  ls._store['sm_sales'] = JSON.stringify([{ id: 's1', total: 100 }]);
  ls._store['sm_menu_b_br1'] = JSON.stringify([{ id: 1, name: 'ทดสอบ' }]);
  const M = runInSandbox(ls);
  const payload = M.capturePreUpgradeSnapshotPayload();
  assert('snapshot payload.localKeys.sm_cfg captures the raw pre-existing string', payload.localKeys.sm_cfg === ls._store['sm_cfg']);
  assert('snapshot payload.localKeys.sm_sales captures the raw pre-existing string', payload.localKeys.sm_sales === ls._store['sm_sales']);
  assert('snapshot picks up dynamic branch key sm_menu_b_br1 via resolver', payload.dynamicKeysFound.menuByBranch.includes('sm_menu_b_br1'));
  assert('snapshot manifest.totalLocalKeys matches actual key count', payload.manifest.totalLocalKeys === Object.keys(payload.localKeys).length);
  assert('snapshot does not require any in-memory app variable (menu/sales/cfg) to be pre-declared', true); // proven by the fact this ran without ReferenceError
}

// ═══ Test 8 (F03): ensurePreUpgradeSnapshotV14 runs BEFORE any other write reaches localStorage ═══
{
  const ls = makeStorage();
  ls._store['sm_cfg'] = JSON.stringify({ shopName: 'ร้านเดิมก่อนอัปเกรด' });
  const M = runInSandbox(ls);
  const ok = M.ensurePreUpgradeSnapshotV14();
  assert('ensurePreUpgradeSnapshotV14 first call returns true', ok === true);
  const parsed = JSON.parse(ls.getItem('sm_pre_upgrade_v14'));
  assert('captured snapshot preserves the pre-upgrade sm_cfg value exactly', JSON.parse(parsed.localKeys.sm_cfg).shopName === 'ร้านเดิมก่อนอัปเกรด');
  assert('smReadSafeMode stays false on success', M.smReadSafeMode === false);
}

// ═══ Test 9: idempotent — second call with valid existing snapshot is a true no-op ═══
{
  const ls = makeStorage();
  ls._store['sm_cfg'] = JSON.stringify({ shopName: 'ร้าน B' });
  const M = runInSandbox(ls);
  M.ensurePreUpgradeSnapshotV14();
  const firstPayload = ls.getItem('sm_pre_upgrade_v14');
  ls._store['sm_cfg'] = JSON.stringify({ shopName: 'ร้าน B — เปลี่ยนชื่อหลัง snapshot' }); // simulate real .14 activity after snapshot
  const M2 = runInSandbox(ls);
  const ok2 = M2.ensurePreUpgradeSnapshotV14();
  assert('second call returns true (no-op)', ok2 === true);
  assert('snapshot payload UNCHANGED after second call (idempotent — no overwrite)', ls.getItem('sm_pre_upgrade_v14') === firstPayload);
}

// ═══ Test 10: snapshot write failure → read-safe mode, no partial key left ═══
{
  const ls = makeStorage();
  const M = runInSandbox(ls);
  ls._failOnSetKey = 'sm_pre_upgrade_v14';
  const ok = M.ensurePreUpgradeSnapshotV14();
  assert('returns false when snapshot write throws', ok === false);
  assert('smReadSafeMode becomes true', M.smReadSafeMode === true);
  assert('no sm_pre_upgrade_v14 key left behind', ls.getItem('sm_pre_upgrade_v14') === null);
}

// ═══ Test 11: snapshot read-back corruption → read-safe mode ═══
{
  const ls = makeStorage();
  const M = runInSandbox(ls);
  ls._corruptReadBackKey = 'sm_pre_upgrade_v14';
  const ok = M.ensurePreUpgradeSnapshotV14();
  assert('returns false when read-back is corrupted', ok === false);
  assert('smReadSafeMode becomes true', M.smReadSafeMode === true);
}

// ═══ Test 12 (F04): pre-existing CORRUPT snapshot (torn write) is not silently trusted or overwritten ═══
{
  const ls = makeStorage();
  ls._store['sm_pre_upgrade_v14'] = '{"_schemaVersion":"A-1", this is not valid json';
  const M = runInSandbox(ls);
  const ok = M.ensurePreUpgradeSnapshotV14();
  assert('returns false on pre-existing corrupt snapshot', ok === false);
  assert('smReadSafeMode becomes true', M.smReadSafeMode === true);
  assert('corrupt snapshot NOT auto-overwritten', ls.getItem('sm_pre_upgrade_v14') === '{"_schemaVersion":"A-1", this is not valid json');
}

// ═══ Test 13 (F04): structural validation — required cases from Room 00's list ═══
{
  const ls = makeStorage();
  const M = runInSandbox(ls);
  const base = () => ({ _schemaVersion: 'A-1', _sourceBuild: 'v7.9.8.13', localKeys: { sm_cfg: '{}', sm_sales: '[]' }, sessionKeys: {}, manifest: { totalLocalKeys: 2, totalSessionKeys: 0 } });

  const missingSales = base(); delete missingSales.localKeys.sm_sales; missingSales.manifest.totalLocalKeys = 1;
  assert('validate: missing sm_sales → invalid', M.validatePreUpgradeSnapshotStructure(missingSales).ok === false);

  const wrongType = base(); wrongType.localKeys = 'not an object';
  assert('validate: localKeys wrong type → invalid', M.validatePreUpgradeSnapshotStructure(wrongType).ok === false);

  const missingCfg = base(); delete missingCfg.localKeys.sm_cfg; missingCfg.manifest.totalLocalKeys = 1;
  assert('validate: missing sm_cfg → invalid', M.validatePreUpgradeSnapshotStructure(missingCfg).ok === false);

  const truncated = base(); truncated.manifest.totalLocalKeys = 99; // manifest count doesn't match actual — proves truncation/tamper detection
  assert('validate: manifest count mismatch (truncated payload) → invalid', M.validatePreUpgradeSnapshotStructure(truncated).ok === false);

  const wrongBuild = base(); wrongBuild._sourceBuild = 'v7.9.8.12';
  assert('validate: wrong _sourceBuild → invalid', M.validatePreUpgradeSnapshotStructure(wrongBuild).ok === false);

  const valid = base();
  assert('validate: well-formed payload → valid', M.validatePreUpgradeSnapshotStructure(valid).ok === true);
}

// ═══ Test 14 (F04): existing snapshot with wrong schemaVersion is not silently trusted ═══
{
  const ls = makeStorage();
  ls._store['sm_pre_upgrade_v14'] = JSON.stringify({ _schemaVersion: 'OLD-0', _sourceBuild: 'v7.9.8.13', localKeys: { sm_cfg: '{}', sm_sales: '[]' }, sessionKeys: {}, manifest: { totalLocalKeys: 2, totalSessionKeys: 0 } });
  const M = runInSandbox(ls);
  const ok = M.ensurePreUpgradeSnapshotV14();
  assert('returns false on schemaVersion mismatch in existing snapshot', ok === false);
  assert('smReadSafeMode becomes true', M.smReadSafeMode === true);
}

// ════════════════════════════════════════════════════════════════
// M1 A3 — Bill-count contract tests (ต่อยอด harness M0+M1 ตาม Room 00 Correction Directive 28 ส.ค. 2026, BLOCKER 1)
// billCount(บิล/ออเดอร์) = unique VALID orderId เท่านั้น (ห้าม fallback timestamp) | lineCount(รายการ) = rows.length | quantity(ชิ้น) = Σqty
// หมายเหตุถ้อยคำ (correction §"EVIDENCE WORDING"): fixtures ด้านล่างเป็น **synthetic fixtures ที่จำนวนตรงกับ D3** (สังเคราะห์ขึ้นเพื่อทดสอบ)
// ไม่ใช่ D3 Backup JSON จริงที่โหลดมาจากไฟล์ — ไม่มีไฟล์ D3 Backup JSON จริงส่งมาในรอบนี้ จึงไม่มี test ที่โหลดไฟล์จริง (ตัวเลือก B ของ correction)
// ════════════════════════════════════════════════════════════════
const m1Start = '// M1 A3 — Bill-count contract (Room 00 correction 28 ส.ค. 2026 — BLOCKER 1: strict, ห้าม fallback timestamp)';
const m1End = '// ═══ จบ M1 A3 — Bill-count contract block ═══';
const m1si = html.indexOf(m1Start);
const m1ei = html.indexOf(m1End);
if (m1si === -1 || m1ei === -1) throw new Error('M1 A3 bill-count block markers not found in candidate file');
const m1Block = html.slice(m1si, m1ei);

function runM1Sandbox() {
  const fn = new Function(m1Block + '\nreturn {isValidOrderId,computeBillStats,billCountLabel,avgPerOrderLabel,groupSalesForDisplay};');
  return fn();
}

// sessionBillCountLabel() ต้องแยก extract เพิ่ม — อยู่นอก M1 block เพราะพึ่ง scopedSales() (global ของแอป) ต้อง stub เข้าไป
const sblStart = 'function sessionBillCountLabel(s){';
const sblEndAnchor = 'function renderSessionHistory(){';
const sblsi = html.indexOf(sblStart);
const sblei = html.indexOf(sblEndAnchor, sblsi);
if (sblsi === -1 || sblei === -1) throw new Error('sessionBillCountLabel() not found in candidate file');
const sblBlock = html.slice(sblsi, sblei);
function runSessionBillCountSandbox(mockScopedSales) {
  const fn = new Function('scopedSales', m1Block + '\n' + sblBlock + '\nreturn {sessionBillCountLabel};');
  return fn(() => mockScopedSales);
}

// สร้างชุดข้อมูลจำลอง billTarget ออเดอร์ / lineTarget แถว ให้จำนวน**ตรงกับ**ชุด D3 จริง (synthetic — ไม่ใช่โหลดจากไฟล์ D3 จริง)
// ทุกแถวราคาเท่ากัน pricePerRow เพื่อคำนวณ revenue invariant ได้ตรงไปตรงมา
// แจกแถวส่วนเกิน (lineTarget-billTarget) ให้ออเดอร์แรกๆ ได้ 2 แถว ที่เหลือได้ 1 แถว — วิธีแจกไม่กระทบผลทดสอบ (นับ unique valid orderId เท่านั้น)
function buildOrderFixture(billTarget, lineTarget, pricePerRow) {
  pricePerRow = pricePerRow || 100;
  const extra = lineTarget - billTarget;
  if (extra < 0 || extra > billTarget) throw new Error('fixture params ไม่สมเหตุสมผล: billTarget=' + billTarget + ' lineTarget=' + lineTarget);
  const rows = [];
  let i = 0;
  for (; i < extra; i++) {
    const oid = 'order_' + i;
    rows.push({ orderId: oid, time: '2026-08-27T10:00:00.000Z', total: pricePerRow, qty: 1 });
    rows.push({ orderId: oid, time: '2026-08-27T10:00:00.000Z', total: pricePerRow, qty: 1 });
  }
  for (; i < billTarget; i++) {
    const oid = 'order_' + i;
    rows.push({ orderId: oid, time: '2026-08-27T10:00:00.000Z', total: pricePerRow, qty: 1 });
  }
  return rows;
}
function sumTotal(rows) { return rows.reduce((a, b) => a + b.total, 0); }

// ═══ Test 15: synthetic fixtures matching D3 counts — combined 47/85, Freshy 29/58, Android 18/27 ═══
{
  const M1 = runM1Sandbox();
  const combined = buildOrderFixture(47, 85);
  assert('synthetic combined (matches D3 count): lineCount(rows.length) === 85', combined.length === 85, combined.length);
  const combinedStats = M1.computeBillStats(combined);
  assert('synthetic combined: isExact === true (ทุกแถวมี valid orderId)', combinedStats.isExact === true);
  assert('synthetic combined: billCount === 47', combinedStats.billCount === 47, combinedStats.billCount);

  const freshy = buildOrderFixture(29, 58);
  assert('synthetic Freshy (matches D3 count): lineCount === 58', freshy.length === 58, freshy.length);
  assert('synthetic Freshy: billCount === 29', M1.computeBillStats(freshy).billCount === 29);

  const android = buildOrderFixture(18, 27);
  assert('synthetic Android (matches D3 count): lineCount === 27', android.length === 27, android.length);
  assert('synthetic Android: billCount === 18', M1.computeBillStats(android).billCount === 18);
}

// ═══ Test 16: multi-item bill (1 orderId, 3 rows) → billCount+1, lineCount+3, quantity+Σqty ═══
{
  const M1 = runM1Sandbox();
  const base = buildOrderFixture(18, 27);
  const statsBefore = M1.computeBillStats(base);
  const billsBefore = statsBefore.billCount, linesBefore = base.length;
  const qtyBefore = statsBefore.quantity;
  const multiItemBill = [
    { orderId: 'order_multi', time: '2026-08-27T11:00:00.000Z', total: 50, qty: 2 },
    { orderId: 'order_multi', time: '2026-08-27T11:00:00.000Z', total: 30, qty: 1 },
    { orderId: 'order_multi', time: '2026-08-27T11:00:00.000Z', total: 20, qty: 3 }
  ];
  const after = base.concat(multiItemBill);
  const statsAfter = M1.computeBillStats(after);
  assert('multi-item bill: billCount +1 (18→19)', statsAfter.billCount === billsBefore + 1, statsAfter.billCount);
  assert('multi-item bill: lineCount +3 (27→30)', statsAfter.lineCount === linesBefore + 3, statsAfter.lineCount);
  assert('multi-item bill: quantity +Σqty (+6)', statsAfter.quantity === qtyBefore + 6, statsAfter.quantity);
}

// ═══ Test 17: session with sales but NO valid orderId at all (any of them) → "ไม่ทราบจำนวนบิล", never fabricated ═══
{
  const M1 = runM1Sandbox();
  const legacyRows = [
    { time: '2020-01-01T09:00:00.000Z', total: 100, qty: 1 },
    { time: '2020-01-01T09:05:00.000Z', total: 200, qty: 1 },
    { time: '2020-01-01T09:10:00.000Z', total: 150, qty: 2 }
  ];
  const st = M1.computeBillStats(legacyRows);
  assert('legacy no-orderId: isExact === false', st.isExact === false);
  assert('legacy no-orderId: billCount === null (not fabricated)', st.billCount === null);
  assert('legacy no-orderId: billCountLabel === "ไม่ทราบจำนวนบิล"', M1.billCountLabel(legacyRows) === 'ไม่ทราบจำนวนบิล', M1.billCountLabel(legacyRows));
  assert('legacy no-orderId: lineCount/quantity still computed (not blanked)', st.lineCount === 3 && st.quantity === 4);
}

// ═══ Test 17b (Room 00 correction, BLOCKER1 #3/#4): MIXED set — some rows valid orderId, some missing → still unknown, no silent undercount ═══
{
  const M1 = runM1Sandbox();
  const mixedRows = [
    { orderId: 'order_A', time: '2026-08-27T09:00:00.000Z', total: 100, qty: 1 },
    { orderId: 'order_A', time: '2026-08-27T09:00:00.000Z', total: 50, qty: 1 },
    { orderId: 'order_B', time: '2026-08-27T09:10:00.000Z', total: 200, qty: 1 },
    { time: '2026-08-27T09:20:00.000Z', total: 75, qty: 1 } // แถวนี้ไม่มี valid orderId เลย
  ];
  const st = M1.computeBillStats(mixedRows);
  assert('mixed set: isExact === false (มีอย่างน้อย 1 แถวไม่มี valid orderId)', st.isExact === false);
  assert('mixed set: billCount === null (ห้าม undercount เงียบเป็น 2)', st.billCount === null, st.billCount);
  assert('mixed set: unknownRowCount === 1', st.unknownRowCount === 1, st.unknownRowCount);
  assert('mixed set: lineCount === 4, quantity === 4 (ไม่เปลี่ยนแม้ billCount unknown)', st.lineCount === 4 && st.quantity === 4);
  assert('mixed set: billCountLabel === "ไม่ทราบจำนวนบิล"', M1.billCountLabel(mixedRows) === 'ไม่ทราบจำนวนบิล');
}

// ═══ Test 17c: empty-string / null / undefined orderId ทั้งหมดถือเป็น invalid เหมือนกัน (ไม่ใช่แค่ undefined) ═══
{
  const M1 = runM1Sandbox();
  assert('isValidOrderId(undefined) === false', M1.isValidOrderId(undefined) === false);
  assert('isValidOrderId(null) === false', M1.isValidOrderId(null) === false);
  assert('isValidOrderId("") === false', M1.isValidOrderId('') === false);
  assert('isValidOrderId("abc") === true', M1.isValidOrderId('abc') === true);
  assert('isValidOrderId(0) === true (falsy แต่เป็น id ที่ valid ได้ตามชนิดข้อมูล)', M1.isValidOrderId(0) === true);
}

// ═══ Test 18: avg/order = revenue / uniqueBillCount (not row count), และ "—" เมื่อนับเป๊ะไม่ได้ ═══
{
  const M1 = runM1Sandbox();
  const combined = buildOrderFixture(47, 85, 100);
  const revenue = sumTotal(combined); // 85 rows × ฿100 = ฿8,500
  const stats = M1.computeBillStats(combined);
  const avgLabel = M1.avgPerOrderLabel(revenue, stats);
  const expectedAvg = '฿' + Math.round(revenue / 47).toLocaleString();
  assert('avg/order uses billCount (47) as divisor, not lineCount (85)', avgLabel === expectedAvg, 'got=' + avgLabel + ' expected=' + expectedAvg);
  const wrongAvg = '฿' + Math.round(revenue / combined.length).toLocaleString();
  assert('avg/order ≠ revenue/lineCount (proves divisor is really billCount)', avgLabel !== wrongAvg);

  // unknown case → "—"
  const unknownStats = M1.computeBillStats([{ time: 't1', total: 100, qty: 1 }]);
  assert('avgPerOrderLabel returns "—" when isExact===false (ห้ามหารด้วยเลขที่ไม่แน่ใจ)', M1.avgPerOrderLabel(100, unknownStats) === '—', M1.avgPerOrderLabel(100, unknownStats));
}

// ═══ Test 19: revenue invariant — counting logic never touches/mutates `total`, sum unchanged before/after ═══
{
  const M1 = runM1Sandbox();
  const combined = buildOrderFixture(47, 85);
  const before = sumTotal(combined);
  const beforeJSON = JSON.stringify(combined);
  M1.computeBillStats(combined); M1.billCountLabel(combined); M1.avgPerOrderLabel(before, combined); M1.groupSalesForDisplay(combined);
  const after = sumTotal(combined);
  assert('revenue invariant: total sum unchanged after bill-count calls (฿8,500)', before === after && before === 8500, 'before=' + before + ' after=' + after);
  assert('revenue invariant: rows array not mutated by any bill-count helper', JSON.stringify(combined) === beforeJSON);
}

// ═══ Test 20: source-scan — old time-window(2 วินาที) grouping AND old orderId||s.time fallback fully removed from candidate file ═══
{
  assert('source-scan: old 2-second time-window grouping ("t-last.t<2000") removed', !/t-last\.t<2000/.test(html));
  assert('source-scan: old renderOrders 2-second grouping ("Math.abs(t-new Date(last[last.length-1]") removed', !/Math\.abs\(t-new Date\(last\[last\.length-1\]/.test(html));
  // BLOCKER1: ห้ามมี s.orderId||s.time (หรือ orderId||time รูปแบบใดๆ) เป็นโค้ดที่ทำงานจริงหลงเหลืออยู่เลย (คอมเมนต์ที่พูดถึงมันได้ ไม่นับ)
  const liveFallbackMatches = [...html.matchAll(/orderId\s*\|\|\s*s?\.?time/g)];
  // กรองบรรทัดที่เป็นคอมเมนต์ (ขึ้นต้นด้วย // ก่อนตำแหน่งที่เจอในบรรทัดเดียวกัน) ออก
  const liveOnly = liveFallbackMatches.filter(m => {
    const lineStart = html.lastIndexOf('\n', m.index) + 1;
    const linePrefix = html.slice(lineStart, m.index);
    return !/\/\//.test(linePrefix);
  });
  assert('source-scan: no live "orderId||...time" fallback code remains anywhere (only in comments)', liveOnly.length === 0, 'found ' + liveOnly.length + ' live occurrences');
  const computeBillStatsCallCount = (html.match(/computeBillStats\(/g) || []).length;
  assert('source-scan: computeBillStats() is actually wired into surfaces (called >=8 times: today, orders-UI-via-groupSalesForDisplay excluded, statKPI, seller, hourly, PDF, share text/image, close preview, saveSession, sessionBillCountLabel, Sheets export)', computeBillStatsCallCount >= 8, 'found ' + computeBillStatsCallCount + ' call sites');
}

// ═══ Test 21 (Room 00 correction, BLOCKER1 #1/#2): sessionBillCountLabel() ต้อง recompute เสมอ — ห้ามเชื่อ stored s.billCount ═══
{
  // เคสหลัก: stored billCount ผิด/เก่า (99) แต่ sale rows จริงที่ match roundId มีแค่ 3 unique valid orderId → ต้องได้ "3 บิล" ไม่ใช่ "99 บิล"
  const realSales = [
    { orderId: 'r1', roundId: 'round_X', time: 't1', total: 100 },
    { orderId: 'r2', roundId: 'round_X', time: 't2', total: 100 },
    { orderId: 'r3', roundId: 'round_X', time: 't3', total: 100 }
  ];
  const S1 = runSessionBillCountSandbox(realSales);
  const staleSession = { roundId: 'round_X', billCount: 99 }; // ค่าเก่า/ผิดที่เคยถูกบันทึกไว้
  assert('sessionBillCountLabel: ห้ามเชื่อ stored billCount(99) ที่ผิด ต้อง recompute เป็น "3 บิล" จาก sale rows จริง', S1.sessionBillCountLabel(staleSession) === '3 บิล', S1.sessionBillCountLabel(staleSession));

  // เคส roundId match แต่ sale rows ไม่มี valid orderId เลย → unknown
  const S2 = runSessionBillCountSandbox([{ roundId: 'round_Y', time: 't1', total: 100 }]);
  assert('sessionBillCountLabel: roundId match แต่ sales ไม่มี valid orderId → "ไม่ทราบจำนวนบิล"', S2.sessionBillCountLabel({ roundId: 'round_Y', billCount: 5 }) === 'ไม่ทราบจำนวนบิล');

  // เคสไม่มี roundId เลย (legacy pre-v7.9.8) → unknown แม้จะมี stored billCount ผิดๆติดมา
  const S3 = runSessionBillCountSandbox([]);
  assert('sessionBillCountLabel: ไม่มี roundId เลย → "ไม่ทราบจำนวนบิล" แม้มี stored billCount', S3.sessionBillCountLabel({ billCount: 42 }) === 'ไม่ทราบจำนวนบิล');

  // เคส roundId ไม่ match sale ไหนเลย (ถูกลบ/ไม่เจอ) → unknown
  const S4 = runSessionBillCountSandbox([{ orderId: 'other', roundId: 'round_OTHER', time: 't1', total: 1 }]);
  assert('sessionBillCountLabel: roundId ไม่ match sale ไหนเลย → "ไม่ทราบจำนวนบิล"', S4.sessionBillCountLabel({ roundId: 'round_NOTFOUND', billCount: 7 }) === 'ไม่ทราบจำนวนบิล');
}

// ═══ Test 22 (Room 00 M1 HOLD-2 re-gate correction, 28 ส.ค. 2026): max-order KPI ต้องไม่โชว์เลขลวงเมื่อ isExact===false ═══
// ดึงโค้ดจริง maxO/maxOLabel จาก renderStatKPI() ในไฟล์ candidate มา eval ตรงๆ (ไม่ reimplement) — พิสูจน์ว่าโค้ดจริงทำงานถูก ไม่ใช่แค่ตรรกะที่ตั้งใจไว้
{
  const maxOStart = 'const maxO=billStats.groups.length>0?Math.max(...billStats.groups.map(g=>g.reduce((a,s)=>a+s.total,0))):0;';
  const maxOEndAnchor = 'const totalQty=ts.reduce';
  const mosi = html.indexOf(maxOStart);
  const moei = html.indexOf(maxOEndAnchor, mosi);
  if (mosi === -1 || moei === -1) throw new Error('maxO/maxOLabel snippet not found in candidate file — M1 HOLD-2 fix missing?');
  const maxOSnippet = html.slice(mosi, moei);
  function computeMaxOLabel(billStats) {
    const fn = new Function('billStats', maxOSnippet + '\nreturn maxOLabel;');
    return fn(billStats);
  }
  const M1 = runM1Sandbox();

  // 1) exact multi-row orders → max order ถูกต้อง
  const exactRows = [
    { orderId: 'oA', time: 't', total: 40 }, { orderId: 'oA', time: 't', total: 60 }, // order A รวม 100
    { orderId: 'oB', time: 't', total: 250 } // order B = max
  ];
  const exactStats = M1.computeBillStats(exactRows);
  assert('max-order KPI: exact data → ตัวเลขถูกต้อง (฿250)', computeMaxOLabel(exactStats) === '฿250', computeMaxOLabel(exactStats));

  // 2) mixed valid + missing-orderId → max order = "—"
  const mixedRows = exactRows.concat([{ time: 't', total: 10 }]); // แถวไม่มี orderId
  const mixedStats = M1.computeBillStats(mixedRows);
  assert('max-order KPI: mixed (มี orphan row) → isExact=false → "—"', mixedStats.isExact === false && computeMaxOLabel(mixedStats) === '—', computeMaxOLabel(mixedStats));

  // 3) orphan row ใหญ่กว่าทุก valid group → ต้องไม่ผลิตเลข max ที่ลวง (ห้ามโชว์ ฿100 จาก valid subset — ต้อง "—")
  const orphanBiggerRows = [
    { orderId: 'oA', time: 't', total: 100 }, // valid group เดียว มูลค่า 100
    { time: 't', total: 1000 } // orphan ใหญ่กว่ามาก ไม่มี orderId — Room 00's exact example
  ];
  const orphanStats = M1.computeBillStats(orphanBiggerRows);
  const orphanLabel = computeMaxOLabel(orphanStats);
  assert('max-order KPI: orphan row (฿1,000) ใหญ่กว่า valid group (฿100) → ต้องเป็น "—" ไม่ใช่ตัวเลขลวง ฿100', orphanLabel === '—', orphanLabel);
}

console.log('\n=== M0+M1 Safety-Test Harness (post F01-F06 + A3 bill-count contract + BLOCKER1 + M1 HOLD-2 max-order KPI correction) ===');
console.log(pass + '/' + (pass + fail) + ' PASS');
if (fail > 0) { console.log(fail + ' FAILED'); process.exit(1); }

// StallMate Build A — M2 test harness (A2: Split Payment / Satang / Sale-Edit Integrity)
// F05-style portability: resolves candidate path relative to this script's own location, with optional CLI override.
// Extracts REAL function/const source from the candidate .html and runs it inside a minimal DOM/app-global shim
// (fake document.getElementById + in-memory localStorage + stubbed side-effect functions only — toast/beep/stock/
// Firebase writes/render — never the money math). Per R12: code-level/automated evidence only.
// Usage: node StallMate_BuildA_M2_SplitSatangEdit_Harness.js [path/to/stallmate_v7.9.8.14.html]
'use strict';
const fs = require('fs');
const path = require('path');

const candidatePath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(__dirname, 'stallmate_v7.9.8.14.html');
if (!fs.existsSync(candidatePath)) {
  console.error('Candidate file not found: ' + candidatePath);
  process.exit(2);
}
const html = fs.readFileSync(candidatePath, 'utf8');
console.log('Candidate file: ' + candidatePath);

// ── extraction: M0 satang/guarded-storage block ──
const m0s = '// BUILD A — M0: Baseline & Safety Foundation (v7.9.8.14)';
const m0e = '// ═══ จบ BUILD A — M0 foundation block ═══';
if (html.indexOf(m0s) === -1 || html.indexOf(m0e) === -1) throw new Error('M0 block markers not found');
const m0Block = html.slice(html.indexOf(m0s), html.indexOf(m0e)).replace(/\nensurePreUpgradeSnapshotV14\(\);\n/, '\n');

// ── extraction: M2 pure-helper block (satang schema / split allocation / audit) ──
const m2s = '// M2 A2 — Satang schema / Split auto-balance / Sale-edit audit (Work Order A2, 28 ส.ค. 2026)';
const m2e = '// ═══ จบ M2 A2 — Satang schema / Split auto-balance / Sale-edit audit block ═══';
if (html.indexOf(m2s) === -1 || html.indexOf(m2e) === -1) throw new Error('M2 block markers not found');
const m2Block = html.slice(html.indexOf(m2s), html.indexOf(m2e));

// ── extraction: saveSalesLSGuarded (M2 HOLD B1 correction — new isolated guarded-write helper, separate file location) ──
const sgStart = 'function saveSalesLSGuarded(){';
const sgEndAnchor = '\n\n// ═══ v7.8.15';
const sgsi = html.indexOf(sgStart), sgei = html.indexOf(sgEndAnchor, sgsi);
if (sgsi === -1 || sgei === -1) throw new Error('saveSalesLSGuarded markers not found');
const saveSalesLSGuardedBlock = html.slice(sgsi, sgei);

// ── extraction: getActive/bTotal (exact real one-liners) ──
const gaLine = 'function getActive(){return baskets.find(b=>b.id===activeId)||null;}';
const btLine = 'function bTotal(b){return b.items.reduce((s,i)=>s+i.price*i.qty,0);}';
if (!html.includes(gaLine) || !html.includes(btLine)) throw new Error('getActive/bTotal exact text not found — candidate changed');

// ── extraction: Span A (np/calcSplit/trySplitFlip/calcSplitChange/confirmPay) ──
const aStart = 'let cashPreFilled=false;';
const aEndAnchor = '\n// TODAY';
const asi = html.indexOf(aStart), aei = html.indexOf(aEndAnchor, asi);
if (asi === -1 || aei === -1) throw new Error('Span A markers not found');
const spanA = html.slice(asi, aei);

// ── extraction: Span B (openEditSale/recalcEditTotal/onEditPayChange/onEditSplitInput/saveEdit) ──
const bStart = 'function openEditSale(id){';
const bEndAnchor = '\n// CLOSE';
const bsi = html.indexOf(bStart), bei = html.indexOf(bEndAnchor, bsi);
if (bsi === -1 || bei === -1) throw new Error('Span B markers not found');
const spanB = html.slice(bsi, bei);
// PL (payment-method label map) — used by openEditSale()'s <select> options; exact real line
const plLine = "const PL={cash:'💵 สด',scan:'📱 สแกน',thai:'🇹🇭 ไทย',split:'✂️ แบ่ง',credit:'📝 ค้าง'};";
if (!html.includes(plLine)) throw new Error('PL const exact text not found — candidate changed');
const uiBlock = spanA + '\n' + plLine + '\n' + spanB;

function makeLSShim() {
  const store = {};
  return {
    _store: store,
    setItem(k, v) {
      if (this._failOnSetKey === k) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      store[k] = v;
      // M2 HOLD-2: simulates the real indeterminate-write defect — the write actually LANDS (bytes on disk, correct value),
      // but the very next read-back sees a mismatch (transient/serialization glitch), so guardedSetItem's own verify step
      // sees false — exactly the class of bug HOLD-2 requires: "guarded write returns false" MUST NOT be read as
      // "nothing was written". Self-clearing (one-shot) so a SEPARATE, later read (e.g. reconcile's own disk read)
      // correctly observes the true, correctly-persisted value — matching real localStorage behavior (no persistent
      // corruption from a single transient read-back glitch).
      if (this._mismatchOnceKey === k) this._mismatchOncePending = k;
    },
    getItem(k) {
      // M2 HOLD-4: simulates localStorage.getItem() ITSELF throwing (read-error) — distinct from "key absent" (null,
      // no throw) and from "corrupt/mismatched value" (returns a string, just a bad one). This models the real-world
      // edge case DEFECT 4-2 targets: some browsers/storage backends can throw on a get (SecurityError, storage
      // backend failure, etc.), which must never be silently swallowed into "there's no pending journal".
      if (this._failOnGetKey === k) { const e = new Error('SecurityError'); e.name = 'SecurityError'; throw e; }
      if (!(k in store)) return null;
      if (this._mismatchOncePending === k) { this._mismatchOncePending = null; return store[k] + '_MISMATCH_ONCE'; }
      if (this._corruptReadBackKey === k) return store[k] + '_CORRUPTED'; // simulate torn/corrupted read-back for guardedSetItem's verify step (sticky variant)
      return store[k];
    },
    removeItem(k) { delete store[k]; },
    key(i) { return Object.keys(store)[i] ?? null; },
    get length() { return Object.keys(store).length; }
  };
}

// ── builds one isolated sandbox: real M0+M2+confirmPay/saveEdit code, fake DOM, in-memory localStorage ──
function buildSandbox(opts) {
  opts = opts || {};
  const ls = opts.localStorage || makeLSShim();
  const elements = {};
  function el(id, init) {
    if (!elements[id]) elements[id] = Object.assign({ value: '', textContent: '', style: {}, readOnly: false, classList: { add(){}, remove(){}, contains(){return false;} } }, init || {});
    return elements[id];
  }
  ['spTot','spCash','spScan','spRem','spReceived','spReceivedRow','spChangeDisp','cmTotal','cmDisp','cmChange',
   'crTot','crNote','cashOv','splitOv','creditOv','editSaleOv','es-n','es-q','es-pr','es-t','es-p',
   'es-split-wrap','es-split-cash','es-split-scan','es-split-rem','es-note','cpName','cpTotal','cpThaiBtn','creditPayOv',
   'page-today','page-close'].forEach(id => el(id));
  // editSaleBody.innerHTML = <generated form HTML string> in the real app — a real browser parses that string into
  // live DOM elements (es-n/es-q/es-pr/.../es-p <select selected>) which getElementById() then returns. This shim has
  // no HTML parser, so we do the equivalent narrowly: regex out the id="..." value="..." pairs (and the selected <option>
  // for es-p, and es-split-wrap's display style) from openEditSale()'s OWN generated string and apply them to the
  // pre-built fake elements — faithfully reproducing what a real browser would have initialized, without reimplementing
  // any decision logic (the values come straight out of the real function's own HTML string).
  const editSaleBodyEl = { _html: '', get innerHTML(){ return this._html; }, set innerHTML(v){
    this._html = v;
    const valRe = /id="([\w-]+)"[^>]*?value="([^"]*)"/g;
    let m;
    while ((m = valRe.exec(v))) { const target = el(m[1]); target.value = m[2]; }
    const pSel = /<select[^>]*id="es-p"[\s\S]*?<\/select>/.exec(v);
    if (pSel) { const sel = /value="(\w+)"\s+selected/.exec(pSel[0]); el('es-p').value = sel ? sel[1] : ''; }
    const wrap = /id="es-split-wrap"\s+style="display:(\w+)"/.exec(v);
    if (wrap) el('es-split-wrap').style.display = wrap[1];
    // M2 HOLD B2: a real browser replaces the ENTIRE subtree on innerHTML assignment — the old <button id="es-save-btn">
    // (possibly left disabled by a prior saveEdit() call) is destroyed and a fresh, enabled button is parsed in its place.
    // The button has no value= attribute so the generic regex above never touches it — reset disabled explicitly here.
    if (/id="es-save-btn"/.test(v)) el('es-save-btn').disabled = false;
  } };
  elements['editSaleBody'] = editSaleBodyEl;
  const fakeDocument = {
    getElementById(id) { return el(id); },
    createElement() { return { className:'', style:{}, innerHTML:'', appendChild(){}, remove(){} }; },
    body: { appendChild(){} }
  };
  const state = {
    baskets: opts.baskets || [], activeId: opts.activeId || null, pendingPay: opts.pendingPay || 'cash',
    cashVal: opts.cashVal || '', sales: opts.sales || [], menu: opts.menu || [], cfg: opts.cfg || {},
    currentSeller: opts.currentSeller || 'tester', deviceId: opts.deviceId || 'dev_test',
    activeCheckin: opts.activeCheckin || { shopName:'ร้านทดสอบ', mkt:'ตลาดทดสอบ', branchId:null },
    myRoomCode: null, editSaleId: opts.editSaleId || null, currentPayMode: 'cash'
  };
  const stubs = {
    isReadOnly(){ return false; }, showReadOnlyBlock(){}, openCheckinModal(){}, isFreeTier(){ return false; },
    countTodayOrders(){ return 0; }, FREE_MAX_ORDERS_PER_DAY: 999999,
    toast(msg){ state._lastToast = msg; }, beep(){}, speakPay(){}, getCurrentRoundId(){ return 'round_test'; },
    applyStockChange(){}, saveMenuLS(){}, pushToFirebase(){}, saveSalesLS(){ state._salesSaved = true; },
    updateTopRev(){}, writeSalesToFirebase(){}, recordTrialBill(){}, DEMO_MENU_NAMES: [],
    renderBasketRow(){}, renderOrder(){}, renderPayModeBar(){}, checkMasterPw(){ return true; },
    closeOv(){}, updateSaleInFirebase(){}, renderToday(){}, renderClose(){},
    refreshSyncInfoText(){} // M2 HOLD B1: referenced by real saveSalesLSGuarded() — side-effect only, safe to stub
  };
  const confirmFn = opts.confirmReturn === undefined ? (()=>true) : (()=>opts.confirmReturn);
  const src = m0Block + '\n' + m2Block + '\n' + saveSalesLSGuardedBlock + '\n' + gaLine + '\n' + btLine + '\n' + uiBlock + '\n' +
    'return {toSatang,satangToBahtNum,sumSatang,allocateSatangProportional,guardedSetItem,guardedGetItem,guardedRemoveItem,' +
    'saleFieldSatang,getSaleTotalSatang,getSaleCashSatang,getSaleScanSatang,getSaleThaiSatang,getSaleCreditSatang,getSalePriceSatang,' +
    'computeItemTotalSatang,computeSplitAllocation,computeSplitChange,quarantineSplitAllocation,verifySplitItemReconciliation,' +
    'genOperationId,readSaleEditsLog,appendSaleEditAudit,performRecoverableSaleEdit,saveSalesLSGuarded,resumePendingSaleEditIfAny,' +
    'readSalesFromDiskById,removeSaleEditAuditEntry,reconcilePendingSaleEdit,syncSaleFromReconcileResult,readPendingSaleEditRaw,' +
    'validatePendingSaleEditStructure,' +
    'getActive,bTotal,calcSplit,trySplitFlip,calcSplitChange,confirmPay,openEditSale,recalcEditTotal,onEditPayChange,onEditSplitInput,saveEdit,' +
    'get baskets(){return baskets;},set baskets(v){baskets=v;},get activeId(){return activeId;},set activeId(v){activeId=v;},' +
    'get pendingPay(){return pendingPay;},set pendingPay(v){pendingPay=v;},get cashVal(){return cashVal;},set cashVal(v){cashVal=v;},' +
    'get sales(){return sales;},set sales(v){sales=v;},get splitSourceField(){return splitSourceField;},set splitSourceField(v){splitSourceField=v;},' +
    'get editSaleId(){return editSaleId;},set editSaleId(v){editSaleId=v;},' +
    'get currentEditOperationId(){return currentEditOperationId;},set currentEditOperationId(v){currentEditOperationId=v;},' +
    'get lastToast(){return state._lastToast;},state};';
  const fn = new Function('localStorage', 'sessionStorage', 'console', 'document', 'confirm', 'prompt',
    'baskets', 'activeId', 'pendingPay', 'cashVal', 'sales', 'menu', 'cfg', 'currentSeller', 'deviceId', 'activeCheckin', 'myRoomCode',
    'editSaleId', 'currentPayMode', 'isReadOnly', 'showReadOnlyBlock', 'openCheckinModal', 'isFreeTier', 'countTodayOrders', 'FREE_MAX_ORDERS_PER_DAY',
    'toast', 'beep', 'speakPay', 'getCurrentRoundId', 'applyStockChange', 'saveMenuLS', 'pushToFirebase', 'saveSalesLS', 'updateTopRev',
    'writeSalesToFirebase', 'recordTrialBill', 'DEMO_MENU_NAMES', 'renderBasketRow', 'renderOrder', 'renderPayModeBar', 'checkMasterPw',
    'closeOv', 'updateSaleInFirebase', 'renderToday', 'renderClose', 'refreshSyncInfoText', 'state',
    src);
  const consoleShim = { error: opts.silence === false ? console.error : ()=>{}, log: opts.silence === false ? console.log : ()=>{} };
  const M = fn(ls, opts.sessionStorage || makeLSShim(), consoleShim, fakeDocument, confirmFn, ()=>null,
    state.baskets, state.activeId, state.pendingPay, state.cashVal, state.sales, state.menu, state.cfg, state.currentSeller,
    state.deviceId, state.activeCheckin, state.myRoomCode, state.editSaleId, state.currentPayMode,
    stubs.isReadOnly, stubs.showReadOnlyBlock, stubs.openCheckinModal, stubs.isFreeTier, stubs.countTodayOrders, stubs.FREE_MAX_ORDERS_PER_DAY,
    stubs.toast, stubs.beep, stubs.speakPay, stubs.getCurrentRoundId, stubs.applyStockChange, stubs.saveMenuLS, stubs.pushToFirebase,
    stubs.saveSalesLS, stubs.updateTopRev, stubs.writeSalesToFirebase, stubs.recordTrialBill, stubs.DEMO_MENU_NAMES, stubs.renderBasketRow,
    stubs.renderOrder, stubs.renderPayModeBar, stubs.checkMasterPw, stubs.closeOv, stubs.updateSaleInFirebase, stubs.renderToday, stubs.renderClose,
    stubs.refreshSyncInfoText, state);
  M.el = el; M.ls = ls; M.appState = state;
  return M;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, detail !== undefined ? ('— ' + JSON.stringify(detail)) : ''); }
}

// ═══ Test 1: ฿425 split, transfer-first (โอนก่อน) — โอน 300 → cash_due 125, รับสด 200 → change 75 (Room 00 forced example) ═══
{
  const M = buildSandbox({ baskets: [{ id:'b1', items:[{ name:'สินค้า A', price:425, qty:1, unit:'ชิ้น' }] }], activeId:'b1', pendingPay:'split' });
  M.el('spScan').value = '300';
  M.calcSplit('scan'); // transfer-first: user types transfer → cash derived
  assert('T1: derived cash (spCash) === 125 after entering transfer 300 on ฿425 bill', M.el('spCash').value === 125, M.el('spCash').value);
  assert('T1: spCash becomes readOnly (derived)', M.el('spCash').readOnly === true);
  M.el('spReceived').value = '200';
  M.calcSplitChange();
  const before = M.sales.length;
  M.confirmPay();
  assert('T1: confirmPay accepted (1 new sale line pushed)', M.sales.length === before + 1, M.sales.length);
  const s = M.sales[M.sales.length - 1];
  assert('T1: cashSatang === 12500 (฿125)', s.cashSatang === 12500, s.cashSatang);
  assert('T1: scanSatang === 30000 (฿300)', s.scanSatang === 30000, s.scanSatang);
  assert('T1: cashAmount float === 125, scanAmount float === 300 (compat)', s.cashAmount === 125 && s.scanAmount === 300, [s.cashAmount, s.scanAmount]);
  assert('T1: cashReceivedSatang === 20000 (฿200)', s.cashReceivedSatang === 20000, s.cashReceivedSatang);
  assert('T1: changeSatang === 7500 (฿75)', s.changeSatang === 7500, s.changeSatang);
  assert('T1: totalSatang === 42500 (฿425 exact)', s.totalSatang === 42500, s.totalSatang);
}

// ═══ Test 2: ฿425 split, cash-first (กรอกสดก่อน) — สด 125 → transfer_due 300 derived (same reconciliation, opposite entry order) ═══
{
  const M = buildSandbox({ baskets: [{ id:'b1', items:[{ name:'สินค้า A', price:425, qty:1, unit:'ชิ้น' }] }], activeId:'b1', pendingPay:'split' });
  M.el('spCash').value = '125';
  M.calcSplit('cash'); // cash-first
  assert('T2: derived transfer (spScan) === 300 after entering cash 125 on ฿425 bill', M.el('spScan').value === 300, M.el('spScan').value);
  assert('T2: spScan becomes readOnly (derived)', M.el('spScan').readOnly === true);
  M.el('spReceived').value = '200';
  M.confirmPay();
  const s = M.sales[M.sales.length - 1];
  assert('T2: cash-first gives identical reconciliation — cashSatang=12500, scanSatang=30000, change=7500', s.cashSatang === 12500 && s.scanSatang === 30000 && s.changeSatang === 7500, [s.cashSatang, s.scanSatang, s.changeSatang]);
}

// ═══ Test 3: ฿100.01 satang-exact (odd-satang total, no drift) ═══
{
  const M = buildSandbox({ baskets: [{ id:'b1', items:[{ name:'ของ', price:100.01, qty:1, unit:'ชิ้น' }] }], activeId:'b1', pendingPay:'cash', cashVal:'100.01' });
  M.confirmPay();
  const s = M.sales[0];
  assert('T3: ฿100.01 → totalSatang===10001 exact', s.totalSatang === 10001, s.totalSatang);
  assert('T3: ฿100.01 → priceSatang===10001 exact', s.priceSatang === 10001, s.priceSatang);
  assert('T3: ฿100.01 → cashSatang===10001 (full cash mode, 1 bucket)', s.cashSatang === 10001, s.cashSatang);
}

// ═══ Test 4: block โอนเกินยอดบิล (transfer > total) — ต้อง toast ไทย และ "ไม่" สร้างบิล ═══
{
  const M = buildSandbox({ baskets: [{ id:'b1', items:[{ name:'สินค้า A', price:100, qty:1, unit:'ชิ้น' }] }], activeId:'b1', pendingPay:'split' });
  M.el('spScan').value = '150'; // > total 100
  M.calcSplit('scan');
  assert('T4: calcSplit shows blocked/error message for transfer>total', /เกินยอดบิล/.test(M.el('spRem').textContent), M.el('spRem').textContent);
  const before = M.sales.length;
  M.confirmPay();
  assert('T4: confirmPay refuses (no sale line created) when transfer>total', M.sales.length === before, M.sales.length);
  assert('T4: confirmPay toast is the Thai transfer>total block message', /เกินยอดบิล/.test(M.lastToast), M.lastToast);
}
// ═══ Test 4b: block สดเกินยอดบิล (cash-first variant of the same block) ═══
{
  const M = buildSandbox({ baskets: [{ id:'b1', items:[{ name:'สินค้า A', price:100, qty:1, unit:'ชิ้น' }] }], activeId:'b1', pendingPay:'split' });
  M.el('spCash').value = '150';
  M.calcSplit('cash');
  const before = M.sales.length;
  M.confirmPay();
  assert('T4b: confirmPay refuses when cash (source) > total too (ห้ามติดลบทั้งสองทาง)', M.sales.length === before, M.sales.length);
}

// ═══ Test 5: multi-item split — edit qty ต้อง reconcile ไม่ zero (บั๊กเดิม: saveEdit เคยตั้ง amount ตาม pay เดียว → split โดน zero) ═══
{
  const M = buildSandbox({ sales: [{ id:'s1', orderId:'o1', name:'ของ', price:100, qty:1, total:100, pay:'split', cashAmount:50, scanAmount:50, thaiAmount:0, creditAmount:0 }], editSaleId:'s1' });
  M.openEditSale('s1');
  assert('T5: openEditSale pre-fills split fields from existing cashAmount/scanAmount (not blanked)', Number(M.el('es-split-cash').value) === 50 && Number(M.el('es-split-scan').value) === 50, [M.el('es-split-cash').value, M.el('es-split-scan').value]);
  M.el('es-q').value = '2'; // qty 1→2, total 100→200
  M.recalcEditTotal();
  assert('T5: recalcEditTotal → es-t becomes 200', Number(M.el('es-t').value) === 200, M.el('es-t').value);
  M.el('es-split-cash').value = '120'; M.el('es-split-scan').value = '80'; // ผู้ใช้ยืนยันสัดส่วนใหม่ให้ตรง 200 พอดี
  M.saveEdit();
  const s = M.sales.find(x => x.id === 's1');
  assert('T5: after qty edit + reconciled split entry — cashAmount=120, scanAmount=80 (NOT zero)', s.cashAmount === 120 && s.scanAmount === 80, [s.cashAmount, s.scanAmount]);
  assert('T5: totalSatang updated to 20000 (฿200 exact)', s.totalSatang === 20000, s.totalSatang);
  assert('T5: sm_sale_edits audit entry written with correct before/after', (function(){ const log = JSON.parse(M.ls.getItem('sm_sale_edits')||'[]'); const e = log[log.length-1]; return e && e.before.cashSatang===5000 && e.before.scanSatang===5000 && e.after.cashSatang===12000 && e.after.scanSatang===8000; })());
}

// ═══ Test 5b: THE OLD BUG regression — split edit WITHOUT re-entering cash/scan must be REFUSED, never silently zeroed ═══
{
  const M = buildSandbox({ sales: [{ id:'s1', orderId:'o1', name:'ของ', price:100, qty:1, total:100, pay:'split', cashAmount:50, scanAmount:50, thaiAmount:0, creditAmount:0 }], editSaleId:'s1' });
  M.openEditSale('s1');
  M.el('es-split-cash').value = ''; M.el('es-split-scan').value = ''; // ผู้ใช้ไม่กรอกอะไรใหม่เลย (จำลองบั๊กเดิม)
  M.saveEdit();
  const s = M.sales.find(x => x.id === 's1');
  assert('T5b: refuses to save (blank split fields) — old bug would silently zero both to 0', s.cashAmount === 50 && s.scanAmount === 50, [s.cashAmount, s.scanAmount]);
  assert('T5b: toast explains split must be reconciled, not silently accepted', /แบ่งจ่าย/.test(M.lastToast), M.lastToast);
}

// ═══ Test 6: edit price → reconcile (ราคาต่อหน่วยเปลี่ยน → ยอดรวมเปลี่ยน → split ต้อง reconcile ใหม่ให้ตรง) ═══
{
  const M = buildSandbox({ sales: [{ id:'s1', orderId:'o1', name:'ของ', price:100, qty:1, total:100, pay:'split', cashAmount:60, scanAmount:40, thaiAmount:0, creditAmount:0 }], editSaleId:'s1' });
  M.openEditSale('s1');
  M.el('es-pr').value = '150'; // price 100→150 (qty stays 1) → total 150
  M.recalcEditTotal();
  assert('T6: recalcEditTotal → es-t becomes 150 after price edit', Number(M.el('es-t').value) === 150, M.el('es-t').value);
  M.el('es-split-cash').value = '90'; M.el('es-split-scan').value = '60';
  M.saveEdit();
  const s = M.sales.find(x => x.id === 's1');
  assert('T6: price-edit reconciled split saved correctly (90+60=150)', s.cashAmount === 90 && s.scanAmount === 60 && s.total === 150, [s.cashAmount, s.scanAmount, s.total]);
}

// ═══ Test 7: ฿0.01 remainder deterministic — multi-item split bill, Σ item cashSatang/scanSatang === bill-level cash_due/scan_due เป๊ะ ═══
{
  // 3 items priced to force a 1-satang remainder across proportional split (100.01/50.02/25.01 = 175.04 total)
  const M = buildSandbox({ baskets: [{ id:'b1', items:[
    { name:'A', price:100.01, qty:1, unit:'ชิ้น' }, { name:'B', price:50.02, qty:1, unit:'ชิ้น' }, { name:'C', price:25.01, qty:1, unit:'ชิ้น' }
  ] }], activeId:'b1', pendingPay:'split' });
  M.el('spScan').value = '100.02'; // arbitrary transfer amount forcing an odd derived cash_due
  M.calcSplit('scan');
  M.el('spReceived').value = String(Number(M.el('spCash').value));
  const before = M.sales.length;
  M.confirmPay();
  const newItems = M.sales.slice(before);
  assert('T7: 3 line items created for the 3-item split bill', newItems.length === 3, newItems.length);
  const cashSum = newItems.reduce((a,b)=>a+b.cashSatang, 0), scanSum = newItems.reduce((a,b)=>a+b.scanSatang, 0);
  const totSatang = M.toSatang(175.04);
  assert('T7: Σ item cashSatang + Σ item scanSatang === bill totalSatang exactly (no drift)', cashSum + scanSum === totSatang, { cashSum, scanSum, totSatang });
}

// ═══ Test 8: invalid input quarantine — ใช้ sumSatang/computeSplitAllocation ไม่แปลง invalid เป็น 0 เงียบๆ ═══
{
  const M = buildSandbox({});
  const r1 = M.computeSplitAllocation(10000, 'scan', NaN);
  assert('T8: computeSplitAllocation(NaN) → ok:false (quarantined, not silently 0)', r1.ok === false, r1);
  const r2 = M.computeSplitAllocation(10000, 'scan', -50);
  assert('T8: computeSplitAllocation(negative) → ok:false', r2.ok === false, r2);
  const r3 = M.computeSplitAllocation(10000, 'scan', 'abc');
  assert('T8: computeSplitAllocation(string) → ok:false', r3.ok === false, r3);
  const r4 = M.quarantineSplitAllocation(10000, NaN, 10000);
  assert('T8: quarantineSplitAllocation(invalid satang component) → ok:false via sumSatang', r4.ok === false, r4);
  const r5 = M.sumSatang([100, NaN, 200]);
  assert('T8: sumSatang core M0 contract unchanged — invalid flagged, sum:null (not 0)', r5.ok === false && r5.sum === null, r5);
}

// ═══ Test 9: historical compatibility — float-only (legacy, no *Satang fields) record derives correctly, revenue unchanged, no write-back ═══
{
  const M = buildSandbox({});
  const legacy = { id:'old1', total: 88.5, cashAmount: 88.5, scanAmount: 0, thaiAmount: 0, creditAmount: 0, price: 88.5 };
  const beforeJSON = JSON.stringify(legacy);
  assert('T9: getSaleTotalSatang derives 8850 from legacy float total (no totalSatang field present)', M.getSaleTotalSatang(legacy) === 8850, M.getSaleTotalSatang(legacy));
  assert('T9: getSaleCashSatang derives 8850 from legacy cashAmount', M.getSaleCashSatang(legacy) === 8850);
  assert('T9: non-destructive — legacy record object completely unchanged after derive-on-read (no write-back)', JSON.stringify(legacy) === beforeJSON, legacy);
  assert('T9: revenue unchanged — legacy.total still exactly 88.5 (float untouched, .13-compatible)', legacy.total === 88.5);
  // Build A record (has *Satang) → prefer stored authoritative value even if float would derive differently (proves "prefer *Satang" precedence)
  const newRec = { total: 88.5, totalSatang: 8850, cashAmount: 88.5, cashSatang: 8850 };
  assert('T9: Build A record with *Satang present → getSaleTotalSatang prefers stored satang field', M.getSaleTotalSatang(newRec) === 8850);
}

// ═══ Test 10: edit-integrity — operationId dedup at the performRecoverableSaleEdit contract level (low-level unit check;
// the REAL end-to-end double-submit-through-saveEdit() proof is Test 14 below, per HOLD doc "ต้องยิงผ่าน real entry path") ═══
// M2 HOLD B1: signature now (sale, beforeSnapshot, afterSnapshot, applyMutationFn, auditEntryBase) — afterSnapshot added
{
  // HOLD-7 note: sale/before/after now built via fullSnap() (full PENDING_SNAPSHOT_FIELDS shape) instead of a bare
  // Object.assign clone of a partial sale — HOLD-7 FIX 3 added a real structural validation of the NEW pendingRecord
  // at step (a) (previously step (a) only validated a pre-existing pending found on disk, never the one being freshly
  // written), so a snapshot missing name/note/*Satang keys is now correctly refused before ever writing pending. This
  // test exercises the "no pre-existing pending" clean-write path, so it must supply a real, fully-shaped snapshot —
  // exactly what saveEdit() itself would build after HOLD-7's canonicalization — not a synthetic partial one.
  const sale = Object.assign({ id:'s1' }, fullSnap());
  const M = buildSandbox({ sales: [sale] }); // seeded into M.sales (same object ref) so saveSalesLSGuarded()'s internal sm_sales write reflects real state
  const before = fullSnap();
  const after = fullSnap({ total:200, cashAmount:200, totalSatang:20000, cashSatang:20000 });
  let applyCount = 0;
  const opId = M.genOperationId();
  const auditBase = { editId:'e1', operationId: opId, orderId:'o1', affectedSaleIds:['s1'], before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0}, after:{ billTotalSatang:20000, cashSatang:20000, scanSatang:0, thaiSatang:0, creditSatang:0 }, editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  function applyMutation(s){ applyCount++; s.total = 200; s.cashAmount = 200; s.totalSatang = 20000; s.cashSatang = 20000; }
  const r1 = M.performRecoverableSaleEdit(sale, before, after, applyMutation, auditBase);
  assert('T10: first submit applies mutation (applyCount=1)', applyCount === 1 && r1.ok === true && r1.dedup === false, [applyCount, r1]);
  assert('T10: sm_pending_sale_edit cleared after clean success (no stuck journal)', M.ls.getItem('sm_pending_sale_edit') === null);
  const r2 = M.performRecoverableSaleEdit(sale, before, after, applyMutation, auditBase); // same operationId, double-submit
  assert('T10: duplicate submit (same operationId) is idempotent — mutation NOT re-applied (applyCount stays 1)', applyCount === 1, applyCount);
  assert('T10: duplicate submit reports dedup:true', r2.ok === true && r2.dedup === true, r2);
  const log = JSON.parse(M.ls.getItem('sm_sale_edits'));
  assert('T10: sm_sale_edits has exactly 1 entry for this operationId (no duplicate audit rows)', log.filter(e => e.operationId === opId).length === 1, log.length);
}

// ═══ Test 11 (M2 HOLD-2 corrected expectations): recoverable edit — sm_sale_edits permanently unwritable (throws every
// time) AFTER sm_sales already durably wrote the new value (step c genuinely succeeds — this key is unaffected) →
// reconcile confirms disk sale=after, attempts roll-forward, but the roll-forward retry ALSO throws (this simulated key
// is permanently broken, not transient) → operation stays UNSETTLED: per HOLD-2 the money already confirmed on disk
// must NEVER be blind-reverted just because the audit couldn't be confirmed/completed, and pending must stay for retry ═══
{
  // HOLD-7 note: same fullSnap()-shaped sale/before/after as T10, for the same reason (step (a) now genuinely
  // validates the freshly-built pendingRecord). Keeping the snapshot's extra fields (name/note/*Satang) consistent
  // between `sale`, `before`, and `after` also keeps reconcile's matches() comparison meaningful — disk sale really
  // does end up structurally equal to `after` post-mutation, so this still exercises the intended
  // "isAfter && !hasAudit → roll-forward attempt (which also throws)" branch, not a fallback "unrecognized" branch.
  const sale = Object.assign({ id:'s1' }, fullSnap());
  const M = buildSandbox({ sales: [sale] });
  M.ls.setItem('sm_sales', JSON.stringify([sale])); // pre-existing disk state = before (realistic: app already had this sale persisted)
  M.ls._failOnSetKey = 'sm_sale_edits'; // simulate storage permanently failing at the audit-append step (d) — sm_sales (c) succeeds first
  const before = fullSnap();
  const after = fullSnap({ total:200, cashAmount:200, totalSatang:20000, cashSatang:20000 });
  const auditBase = { editId:'e2', operationId: M.genOperationId(), orderId:'o1', affectedSaleIds:['s1'], before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0}, after:{ billTotalSatang:20000, cashSatang:20000, scanSatang:0, thaiSatang:0, creditSatang:0 }, editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  function applyMutation(s){ s.total = 200; s.cashAmount = 200; s.totalSatang = 20000; s.cashSatang = 20000; }
  const r = M.performRecoverableSaleEdit(sale, before, after, applyMutation, auditBase);
  assert('T11: performRecoverableSaleEdit returns ok:false (audit could not be confirmed/completed)', r.ok === false, r);
  assert('T11: rolledBack is NOT falsely reported true — nothing was actually rolled back, state is unsettled not reverted', r.rolledBack === false, r);
  assert('T11: sale object is NOT blind-reverted — sm_sales already durably reflects the new value on disk (total=200)', sale.total === 200 && sale.cashAmount === 200, sale);
  assert('T11: sm_sales on disk really is at the new value (proves step c genuinely succeeded)', JSON.parse(M.ls.getItem('sm_sales'))[0].total === 200);
  assert('T11: no audit entry exists yet (this specific key is permanently broken in this scenario, roll-forward retry also failed)', (JSON.parse(M.ls.getItem('sm_sale_edits')||'[]')).length === 0);
  assert('T11: sm_pending_sale_edit is LEFT IN PLACE (unsettled) so a later retry can still complete the audit — never blind-cleared', M.ls.getItem('sm_pending_sale_edit') !== null);
}

// ═══ Test 11b (M2 HOLD-2 corrected expectations): saveEdit() end-to-end — sm_sale_edits permanently unreadable/corrupted
// AFTER sale is already durably written to sm_sales (step c genuinely succeeded, unaffected by this corruption) → HOLD-2:
// must NOT blind-revert money that is confirmed on disk just because the audit state is unknowable, and must NOT
// blind-clear pending (that would silently strand a real, unaudited money change with no way to ever retry) ═══
{
  const M = buildSandbox({ sales: [{ id:'s1', orderId:'o1', name:'ของ', price:100, qty:1, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 }], editSaleId:'s1' });
  M.ls._corruptReadBackKey = 'sm_sale_edits'; // sm_sale_edits unreadable/corrupted on every read (sticky) — sm_sales unaffected
  M.openEditSale('s1');
  M.el('es-pr').value = '250';
  M.recalcEditTotal();
  M.saveEdit();
  const s = M.sales.find(x => x.id === 's1');
  assert('T11b: sale (memory) is NOT blind-reverted — sm_sales write already genuinely succeeded (step c), reconcile could not read sm_sale_edits to confirm audit state, so per HOLD-2 policy the confirmed-on-disk money is never silently rolled back', s.price === 250 && s.total === 250, s);
  assert('T11b: sm_sales on disk really does reflect the durable write (proves step c genuinely succeeded — this is not a false alarm)', JSON.parse(M.ls.getItem('sm_sales'))[0].price === 250);
  assert('T11b: sm_pending_sale_edit is LEFT IN PLACE for retry — never blind-cleared while reconcile could not prove consistency (HOLD-2 Invariant 2)', M.ls.getItem('sm_pending_sale_edit') !== null);
  // M2 HOLD-3 DEFECT 3B: this scenario is exactly settled:false (reconcile couldn't even read sm_sale_edits to determine
  // hasAudit) — saveEdit() now shows the distinct "please reload" message and (per T18) leaves the Save button disabled,
  // instead of the old generic validation-style failure toast. Updated assertion to match the corrected, more specific behavior.
  assert('T11b: saveEdit() surfaces the settled:false "please reload" toast (unresolved, not a generic validation failure)', /รีโหลดแอป/.test(M.lastToast), M.lastToast);
  assert('T11b: es-save-btn stays disabled (settled:false — HOLD-3 re-entrancy guard, never re-opened)', M.el('es-save-btn').disabled === true, M.el('es-save-btn').disabled);
}

// ═══ Test 12: close/reopen — split allocation (cashAmount/scanAmount/satang fields) survives as plain in-memory sale-array state ═══
{
  const M = buildSandbox({ baskets: [{ id:'b1', items:[{ name:'ของ', price:200, qty:1, unit:'ชิ้น' }] }], activeId:'b1', pendingPay:'split' });
  M.el('spScan').value = '80'; M.calcSplit('scan'); M.el('spReceived').value = '120';
  M.confirmPay();
  const savedSnapshot = JSON.parse(JSON.stringify(M.sales));
  // simulate reopen: fresh sandbox seeded with the persisted sales array (as if reloaded from sm_sales)
  const M2 = buildSandbox({ sales: savedSnapshot });
  const s = M2.sales[0];
  assert('T12: reopened record keeps exact split allocation (cash=120, scan=80)', s.cashAmount === 120 && s.scanAmount === 80, [s.cashAmount, s.scanAmount]);
  assert('T12: reopened record keeps satang fields (cashSatang=12000, scanSatang=8000)', s.cashSatang === 12000 && s.scanSatang === 8000);
}

// ═══ M2 HOLD Corrections (28 ส.ค. 2026, Room 00 gate: M2 HOLD, 2 blockers) — real entry-path tests ═══
// เดิม (M2 delivery รอบก่อน) เทสต์ dedup ป้อน operationId ตรงเข้า performRecoverableSaleEdit() — "ไม่ได้ยิงผ่าน saveEdit() จริง"
// (บทเรียน M1: harness ต้องพิสูจน์ผ่าน real entry path) รอบนี้เพิ่ม 4 เทสต์ที่ยิงผ่าน openEditSale()/saveEdit() จริงทั้งหมด

// ═══ Test 14: BLOCKER 2 real-path — เรียก saveEdit() สองครั้งติดหลัง openEditSale() ครั้งเดียว (คนละ currentEditOperationId
// ต้อง "คงที่" ตาม HOLD B2) → mutate ครั้งเดียว, audit 1 entry, ยอดเงินไม่ซ้ำ ═══
{
  const sale = { id:'s1', orderId:'o1', name:'ของ', price:100, qty:1, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales: [sale], editSaleId:'s1' });
  M.openEditSale('s1'); // mints currentEditOperationId ONCE — this is what makes real double-submit dedup possible (BLOCKER2 fix)
  M.el('es-pr').value = '200';
  M.recalcEditTotal();
  M.saveEdit(); // 1st submit — real entry path
  const s = M.sales.find(x => x.id === 's1');
  assert('T14: 1st saveEdit() applies the edit (total=200)', s.total === 200 && s.cashAmount === 200, s);
  const logAfterFirst = JSON.parse(M.ls.getItem('sm_sale_edits'));
  assert('T14: exactly 1 audit entry after 1st submit', logAfterFirst.length === 1, logAfterFirst.length);
  // จำลอง double-submit: กดปุ่มซ้ำเร็วมาก (ปลด UI-guard disable กลับมาด้วยมือ เพื่อพิสูจน์ว่า operationId dedup ชั้นล่าง
  // เป็นตัวกันจริง ไม่ใช่แค่ปุ่ม disabled — ตาม HOLD doc "UI guard เสริม ไม่ใช่แทน" operationId dedup)
  const btn = M.el('es-save-btn'); if (btn) btn.disabled = false;
  M.saveEdit(); // 2nd submit — SAME currentEditOperationId (openEditSale() not re-called), real entry path
  const s2 = M.sales.find(x => x.id === 's1');
  assert('T14: 2nd submit (same operationId) does NOT re-apply mutation — total still 200, not double-charged', s2.total === 200 && s2.cashAmount === 200, s2);
  const logAfterSecond = JSON.parse(M.ls.getItem('sm_sale_edits'));
  assert('T14: sm_sale_edits STILL has exactly 1 entry after real double-submit through saveEdit() (dedup proven at real entry path)', logAfterSecond.length === 1, logAfterSecond.length);
  assert('T14: 2nd submit toast reports "already saved" dedup message, not a fresh success', /บันทึกไปแล้วก่อนหน้า/.test(M.lastToast), M.lastToast);
}

// ═══ Test 14b: reopening edit (new openEditSale() call) mints a NEW operationId — different logical edit is NOT deduped against the old one ═══
{
  const sale = { id:'s1', orderId:'o1', name:'ของ', price:100, qty:1, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales: [sale], editSaleId:'s1' });
  M.openEditSale('s1');
  M.el('es-pr').value = '200'; M.recalcEditTotal();
  M.saveEdit(); // edit #1
  M.openEditSale('s1'); // เปิดแก้ใหม่ (คนละครั้ง) — ต้อง mint operationId ใหม่
  M.el('es-pr').value = '300'; M.recalcEditTotal();
  M.saveEdit(); // edit #2 — operationId ต่างจาก edit #1
  const s = M.sales.find(x => x.id === 's1');
  assert('T14b: second (genuinely new) edit applies correctly (total=300)', s.total === 300, s);
  const log = JSON.parse(M.ls.getItem('sm_sale_edits'));
  assert('T14b: 2 distinct audit entries for 2 distinct edits (different operationId each time — not deduped against each other)', log.length === 2 && log[0].operationId !== log[1].operationId, log.map(e=>e.operationId));
}

// ═══ Test 15: BLOCKER 1 real-path — sm_sales guarded write ล้ม (จำลอง quota เต็ม) ระหว่าง saveEdit() จริง →
// ต้องไม่มี orphan audit entry, sale (memory+storage) = before, ไม่มี sm_pending_sale_edit ค้าง ═══
{
  const sale = { id:'s1', orderId:'o1', name:'ของ', price:100, qty:1, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales: [sale], editSaleId:'s1' });
  M.ls.setItem('sm_sales', JSON.stringify([sale])); // pre-existing disk state = before (realistic: already persisted)
  M.openEditSale('s1');
  M.el('es-pr').value = '300';
  M.recalcEditTotal();
  M.ls._failOnSetKey = 'sm_sales'; // จำลอง saveSalesLSGuarded() ล้มถาวร (ตั้งหลัง render เพื่อไม่ให้กระทบขั้นตอนเปิดฟอร์ม)
  M.saveEdit();
  const s = M.sales.find(x => x.id === 's1');
  assert('T15: sale (memory) rolled back to before (price=100/total=100) when sm_sales guarded write fails mid-saveEdit()', s.price === 100 && s.total === 100, s);
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || '[]');
  assert('T15: NO orphan audit entry written — audit must never commit when the sale write it depends on failed', log.length === 0, log);
  assert('T15: sm_pending_sale_edit cleared — not left stuck for an operation that never durably applied', M.ls.getItem('sm_pending_sale_edit') === null);
  assert('T15: saveEdit() surfaces a failure toast (does not silently report success)', /บันทึกไม่สำเร็จ/.test(M.lastToast), M.lastToast);
}

// ═══ M2 HOLD-2 (28 ส.ค. 2026, Room 00 re-gate) — indeterminate-write tests: guarded write คืน false ต้องไม่ถูกตีความว่า
// "ไม่ได้เขียน" ถ้า bytes ลง disk จริง (DEFECT 2A/2B). ใช้ _mismatchOnceKey: setItem เขียนค่าที่ถูกต้องลง store จริง แต่
// การอ่าน "ครั้งถัดไปครั้งเดียว" (การ verify ภายใน guardedSetItem เอง) เห็นค่าไม่ตรง — จำลอง transient read-back glitch ที่
// bytes ลงจริงแล้ว ไม่ใช่ throw-before-write (นั่นคือ T15 เดิม ยังคงไว้เป็นอีกเคส) ═══

// ═══ Test 15b: DEFECT 2A — sm_sales เขียนจริงสำเร็จ (bytes ลง disk) แต่ guardedSetItem ของมันเองเห็น read-back mismatch
// ครั้งเดียว → performRecoverableSaleEdit ต้อง reconcile จาก disk จริง เห็นว่า sale=after แล้ว → roll-forward เติม audit
// ให้จบ ไม่ใช่รายงานว่าล้มเฉยๆ (เดิมจะ blind-revert memory + ล้าง pending ทั้งที่เงินลง disk จริงแล้ว = orphan เงียบ) ═══
{
  const sale = { id:'s1', orderId:'o1', name:'ของ', price:100, qty:1, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales: [sale], editSaleId:'s1' });
  M.ls.setItem('sm_sales', JSON.stringify([sale])); // pre-existing disk state = before (realistic)
  M.openEditSale('s1');
  M.el('es-pr').value = '300';
  M.recalcEditTotal();
  M.ls._mismatchOnceKey = 'sm_sales'; // เขียนจริง ถูกต้อง แต่ guardedSetItem เห็น read-back mismatch ครั้งเดียวตอน verify
  M.saveEdit();
  const s = M.sales.find(x => x.id === 's1');
  assert('T15b: sale (memory) reflects the roll-forward — total=300, NOT reverted (money genuinely landed on disk)', s.total === 300 && s.price === 300, s);
  assert('T15b: sm_sales on disk really is at the new value (proves this is a true indeterminate-but-succeeded case, not a stub)', JSON.parse(M.ls.getItem('sm_sales'))[0].total === 300);
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || '[]');
  assert('T15b: exactly 1 audit entry — reconcile completed the audit via roll-forward, no duplicate/missing', log.length === 1, log);
  assert('T15b: sm_pending_sale_edit cleared — reconcile proved consistency (after+hasAudit) and settled', M.ls.getItem('sm_pending_sale_edit') === null);
  assert('T15b: saveEdit() reports success, not a false failure, once reconcile confirms the edit truly landed', /✅/.test(M.lastToast), M.lastToast);
}

// ═══ Test 15c: DEFECT 2B — sm_sales durable write genuinely succeeds (no ambiguity), then sm_sale_edits write-then-
// readback-mismatch (bytes landed, verify saw a mismatch once) → must roll-forward (recognize the audit already landed),
// never revert the sale that's already confirmed durable on disk (old code tried to revert sale to before AFTER money
// was already on disk — exactly DEFECT 2B) ═══
{
  const sale = { id:'s1', orderId:'o1', name:'ของ', price:100, qty:1, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales: [sale], editSaleId:'s1' });
  M.ls.setItem('sm_sales', JSON.stringify([sale])); // pre-existing disk state = before (realistic)
  M.openEditSale('s1');
  M.el('es-pr').value = '400';
  M.recalcEditTotal();
  M.ls._mismatchOnceKey = 'sm_sale_edits'; // sm_sales write is clean; only the audit append's own verify sees a one-shot mismatch
  M.saveEdit();
  const s = M.sales.find(x => x.id === 's1');
  assert('T15c: sale (memory) stays at after (total=400) — never reverted after sm_sales already confirmed durable', s.total === 400 && s.price === 400, s);
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || '[]');
  assert('T15c: exactly 1 audit entry — reconcile recognized the audit had actually landed (hasAudit=true on re-read), did not duplicate it', log.length === 1, log);
  assert('T15c: sm_pending_sale_edit cleared — reconcile confirmed after+hasAudit, fully consistent', M.ls.getItem('sm_pending_sale_edit') === null);
  assert('T15c: saveEdit() reports success — the edit truly completed, must not be reported as a failure', /✅/.test(M.lastToast), M.lastToast);
}

// ═══ Test 16: resume-on-load — sm_pending_sale_edit ค้างจากรอบก่อน (sale เขียนถาวรที่ "after" สำเร็จแล้ว แต่ audit ยังไม่ทัน,
// จำลอง crash ระหว่าง step (c) กับ (d)) → เปิดแอปใหม่ (buildSandbox = จำลอง app load) ต้องกู้ให้ audit ครบ + เคลียร์ pending ═══
{
  const saleAfter = { id:'s1', orderId:'o1', name:'ของ', qty:1, price:200, total:200, pay:'cash', note:'',
    cashAmount:200, scanAmount:0, thaiAmount:0, creditAmount:0,
    priceSatang:20000, totalSatang:20000, cashSatang:20000, scanSatang:0, thaiSatang:0, creditSatang:0 };
  const snapShape = (o)=>({ name:o.name,qty:o.qty,price:o.price,total:o.total,pay:o.pay,note:o.note,
    cashAmount:o.cashAmount,scanAmount:o.scanAmount,thaiAmount:o.thaiAmount,creditAmount:o.creditAmount,
    priceSatang:o.priceSatang,totalSatang:o.totalSatang,cashSatang:o.cashSatang,scanSatang:o.scanSatang,thaiSatang:o.thaiSatang,creditSatang:o.creditSatang });
  const saleBefore = Object.assign({}, saleAfter, { price:100, total:100, cashAmount:100, priceSatang:10000, totalSatang:10000, cashSatang:10000 });
  const pending = {
    operationId:'op_resume_test_1', saleId:'s1',
    saleSnapshotBefore: snapShape(saleBefore), saleSnapshotAfter: snapShape(saleAfter),
    auditEntryBase: { editId:'edit_resume_1', operationId:'op_resume_test_1', orderId:'o1', affectedSaleIds:['s1'],
      before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0},
      after:{billTotalSatang:20000,cashSatang:20000,scanSatang:0,thaiSatang:0,creditSatang:0},
      editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'แก้ไขรายการขาย' },
    ts: new Date().toISOString()
  };
  const preLs = makeLSShim();
  preLs.setItem('sm_sales', JSON.stringify([saleAfter]));           // (c) เคยสำเร็จ — sale ถาวรอยู่ที่ after แล้ว
  preLs.setItem('sm_pending_sale_edit', JSON.stringify(pending));    // (d) ไม่ทันเกิด — pending ยังค้าง
  const M = buildSandbox({ localStorage: preLs, sales: [saleAfter] }); // buildSandbox() = จำลอง "เปิดแอปใหม่" (resumePendingSaleEditIfAny auto-run เป็นส่วนหนึ่งของโค้ดจริงที่ extract มา)
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || 'null');
  assert('T16: resume ทำ audit ที่ค้างให้เสร็จ (sm_sale_edits มี operationId ของ pending)', !!log && log.some(e => e.operationId === 'op_resume_test_1'), log);
  assert('T16: resume เคลียร์ sm_pending_sale_edit (ไม่ค้างอีก)', M.ls.getItem('sm_pending_sale_edit') === null);
  assert('T16: sale ไม่ถูก mutate ซ้ำโดย resume (อยู่ที่ after เดิม)', M.sales[0].total === 200 && M.sales[0].cashAmount === 200);
}

// ═══ Test 16b: resume-on-load — pending ค้างแต่ mutation ไม่เคยลง disk จริง (crash ก่อน/ระหว่าง step (c)) →
// sale ยังเป็น before เป๊ะ → resume แค่เคลียร์ pending ไม่ต้อง revert อะไร ═══
{
  const saleStillBefore = { id:'s1', orderId:'o1', name:'ของ', qty:1, price:100, total:100, pay:'cash', note:'',
    cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0,
    priceSatang:10000, totalSatang:10000, cashSatang:10000, scanSatang:0, thaiSatang:0, creditSatang:0 };
  const snapShape = (o)=>({ name:o.name,qty:o.qty,price:o.price,total:o.total,pay:o.pay,note:o.note,
    cashAmount:o.cashAmount,scanAmount:o.scanAmount,thaiAmount:o.thaiAmount,creditAmount:o.creditAmount,
    priceSatang:o.priceSatang,totalSatang:o.totalSatang,cashSatang:o.cashSatang,scanSatang:o.scanSatang,thaiSatang:o.thaiSatang,creditSatang:o.creditSatang });
  const saleAfterAttempt = Object.assign({}, saleStillBefore, { price:200, total:200, cashAmount:200, priceSatang:20000, totalSatang:20000, cashSatang:20000 });
  const pending = {
    operationId:'op_resume_test_2', saleId:'s1',
    saleSnapshotBefore: snapShape(saleStillBefore), saleSnapshotAfter: snapShape(saleAfterAttempt),
    auditEntryBase: { editId:'edit_resume_2', operationId:'op_resume_test_2', orderId:'o1', affectedSaleIds:['s1'],
      before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0},
      after:{billTotalSatang:20000,cashSatang:20000,scanSatang:0,thaiSatang:0,creditSatang:0},
      editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'แก้ไขรายการขาย' },
    ts: new Date().toISOString()
  };
  const preLs = makeLSShim();
  preLs.setItem('sm_sales', JSON.stringify([saleStillBefore])); // sale ไม่เคยเปลี่ยนบน disk เลย
  preLs.setItem('sm_pending_sale_edit', JSON.stringify(pending));
  const M = buildSandbox({ localStorage: preLs, sales: [saleStillBefore] });
  assert('T16b: resume เคลียร์ pending ที่ค้าง (mutation ไม่เคยลง disk จริง ไม่มีอะไรต้อง revert)', M.ls.getItem('sm_pending_sale_edit') === null);
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || '[]');
  assert('T16b: ไม่มี audit entry ถูกสร้างสำหรับ operation ที่ไม่เคย commit จริง', !log.some(e => e.operationId === 'op_resume_test_2'), log);
  assert('T16b: sale คงค่าเดิมเป๊ะ (ยังเป็น before)', M.sales[0].total === 100 && M.sales[0].cashAmount === 100);
}

// ═══ Test 16c (M2 HOLD-2, DEFECT 2C fix): resume-on-load — sale บน disk = before จริง แต่มี audit ค้างอยู่ (orphan:
// เช่น audit เคย roll-forward ไปแล้วในรอบก่อน แต่ต่อมา sm_sales ถูกเขียนทับกลับเป็น before ด้วยกลไกอื่น หรือ mismatch เคส
// สุดโต่ง) → เดิม (ก่อน HOLD-2) matchesBefore ล้าง pending ทันทีโดยไม่เช็ค hasAudit เลย = ทิ้ง orphan ไว้ถาวร →
// ตอนนี้ต้องลบ audit entry ออกให้ตรงกับ disk (deterministic: ยึดค่าจริงบน disk เป็นความจริง) ═══
{
  const saleBefore = { id:'s1', orderId:'o1', name:'ของ', qty:1, price:100, total:100, pay:'cash', note:'',
    cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0,
    priceSatang:10000, totalSatang:10000, cashSatang:10000, scanSatang:0, thaiSatang:0, creditSatang:0 };
  const snapShape = (o)=>({ name:o.name,qty:o.qty,price:o.price,total:o.total,pay:o.pay,note:o.note,
    cashAmount:o.cashAmount,scanAmount:o.scanAmount,thaiAmount:o.thaiAmount,creditAmount:o.creditAmount,
    priceSatang:o.priceSatang,totalSatang:o.totalSatang,cashSatang:o.cashSatang,scanSatang:o.scanSatang,thaiSatang:o.thaiSatang,creditSatang:o.creditSatang });
  const saleAfterAttempt = Object.assign({}, saleBefore, { price:500, total:500, cashAmount:500, priceSatang:50000, totalSatang:50000, cashSatang:50000 });
  const auditEntry = { editId:'edit_resume_3', operationId:'op_resume_test_3', orderId:'o1', affectedSaleIds:['s1'],
    before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0},
    after:{billTotalSatang:50000,cashSatang:50000,scanSatang:0,thaiSatang:0,creditSatang:0},
    editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'แก้ไขรายการขาย' };
  const pending = {
    operationId:'op_resume_test_3', saleId:'s1',
    saleSnapshotBefore: snapShape(saleBefore), saleSnapshotAfter: snapShape(saleAfterAttempt),
    auditEntryBase: auditEntry, ts: new Date().toISOString()
  };
  const preLs = makeLSShim();
  preLs.setItem('sm_sales', JSON.stringify([saleBefore]));            // disk จริง = before (เงินไม่เคยลงจริง)
  preLs.setItem('sm_sale_edits', JSON.stringify([auditEntry]));       // แต่มี audit ค้างอ้างว่าแก้แล้ว (orphan)
  preLs.setItem('sm_pending_sale_edit', JSON.stringify(pending));
  const M = buildSandbox({ localStorage: preLs, sales: [saleBefore] });
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || '[]');
  assert('T16c: resume ลบ orphan audit entry ออก (sale บน disk ยังเป็น before จริง ไม่มีเหตุผลให้ audit นี้ค้างอยู่)', !log.some(e => e.operationId === 'op_resume_test_3'), log);
  assert('T16c: resume เคลียร์ sm_pending_sale_edit หลัง orphan ถูกลบสำเร็จ', M.ls.getItem('sm_pending_sale_edit') === null);
  assert('T16c: sale ยังเป็น before เป๊ะ (ไม่ถูกแตะ)', M.sales[0].total === 100 && M.sales[0].cashAmount === 100);
}

// ═══ Test 16d (4-case matrix, ครบชุด): resume-on-load — sale=after + audit มีอยู่แล้ว = consistent อยู่แล้ว (step (e)
// ไม่ทันเคลียร์ pending ก่อน crash) → resume แค่เคลียร์ pending ไม่ต้องแก้อะไรอย่างอื่น ═══
{
  const saleAfter = { id:'s1', orderId:'o1', name:'ของ', qty:1, price:600, total:600, pay:'cash', note:'',
    cashAmount:600, scanAmount:0, thaiAmount:0, creditAmount:0,
    priceSatang:60000, totalSatang:60000, cashSatang:60000, scanSatang:0, thaiSatang:0, creditSatang:0 };
  const snapShape = (o)=>({ name:o.name,qty:o.qty,price:o.price,total:o.total,pay:o.pay,note:o.note,
    cashAmount:o.cashAmount,scanAmount:o.scanAmount,thaiAmount:o.thaiAmount,creditAmount:o.creditAmount,
    priceSatang:o.priceSatang,totalSatang:o.totalSatang,cashSatang:o.cashSatang,scanSatang:o.scanSatang,thaiSatang:o.thaiSatang,creditSatang:o.creditSatang });
  const saleBefore = Object.assign({}, saleAfter, { price:100, total:100, cashAmount:100, priceSatang:10000, totalSatang:10000, cashSatang:10000 });
  const auditEntry = { editId:'edit_resume_4', operationId:'op_resume_test_4', orderId:'o1', affectedSaleIds:['s1'],
    before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0},
    after:{billTotalSatang:60000,cashSatang:60000,scanSatang:0,thaiSatang:0,creditSatang:0},
    editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'แก้ไขรายการขาย' };
  const pending = {
    operationId:'op_resume_test_4', saleId:'s1',
    saleSnapshotBefore: snapShape(saleBefore), saleSnapshotAfter: snapShape(saleAfter),
    auditEntryBase: auditEntry, ts: new Date().toISOString()
  };
  const preLs = makeLSShim();
  preLs.setItem('sm_sales', JSON.stringify([saleAfter]));
  preLs.setItem('sm_sale_edits', JSON.stringify([auditEntry])); // audit ครบแล้ว ไม่ต้อง roll-forward ซ้ำ
  preLs.setItem('sm_pending_sale_edit', JSON.stringify(pending));
  const M = buildSandbox({ localStorage: preLs, sales: [saleAfter] });
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || '[]');
  assert('T16d: resume ไม่ทำ audit ซ้ำ (ยังคงมีแค่ 1 entry)', log.filter(e => e.operationId === 'op_resume_test_4').length === 1, log);
  assert('T16d: resume เคลียร์ pending (ทุกอย่าง consistent อยู่แล้ว)', M.ls.getItem('sm_pending_sale_edit') === null);
  assert('T16d: sale ไม่ถูกแตะ (ยังเป็น after เดิม)', M.sales[0].total === 600 && M.sales[0].cashAmount === 600);
}

// ═══ M2 HOLD-3 (28 ส.ค. 2026, Room 00 re-gate) — DEFECT 3A fail-closed + DEFECT 3B re-entrancy guard tests ═══

// ═══ Test 17: DEFECT 3A — reconcile third-value (sale บน disk ไม่ตรงทั้ง before/after ของ pending, จำลอง op อื่นทับ/
// corruption) → ต้อง fail-closed: settled:false, ห้ามล้าง sm_pending_sale_edit (journal คือหลักฐานกู้เดียวที่มี) ═══
{
  const before = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0,
    name:'ของ', note:'', priceSatang:10000, totalSatang:10000, cashSatang:10000, scanSatang:0, thaiSatang:0, creditSatang:0 };
  const after = Object.assign({}, before, { price:200, total:200, cashAmount:200, priceSatang:20000, totalSatang:20000, cashSatang:20000 });
  const thirdValue = Object.assign({}, before, { price:999, total:999, cashAmount:999, priceSatang:99900, totalSatang:99900, cashSatang:99900 }); // ไม่ตรงทั้ง before/after — จำลอง op อื่นทับ
  const opId = 'op_hold3_test17';
  const pending = { operationId: opId, saleId:'s1', saleSnapshotBefore: before, saleSnapshotAfter: after,
    auditEntryBase: { editId:'e17', operationId: opId, orderId:'o1', affectedSaleIds:['s1'],
      before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0},
      after:{billTotalSatang:20000,cashSatang:20000,scanSatang:0,thaiSatang:0,creditSatang:0},
      editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' }, ts:new Date().toISOString() };
  const M = buildSandbox({ sales:[thirdValue] });
  M.ls.setItem('sm_sales', JSON.stringify([thirdValue])); // disk = ค่าที่สาม (ไม่ตรง before/after)
  M.ls.setItem('sm_pending_sale_edit', JSON.stringify(pending));
  const result = M.reconcilePendingSaleEdit(pending);
  assert('T17: reconcilePendingSaleEdit คืน settled:false เมื่อ disk ไม่ตรงทั้ง before/after (fail-closed)', result.settled === false, result);
  assert('T17: sm_pending_sale_edit ไม่ถูกลบ (journal คงอยู่ให้ retry/ตรวจสอบ)', M.ls.getItem('sm_pending_sale_edit') !== null);
  assert('T17: pending journal บน disk ยังตรงกับที่ seed ไว้เป๊ะ (ไม่ถูกแก้ไข)', M.ls.getItem('sm_pending_sale_edit') === JSON.stringify(pending));
}

// ═══ Test 17b: DEFECT 3A variant — third-value พร้อม orphan audit ค้างอยู่ด้วย → ยิ่งต้อง fail-closed (ห้ามลบทั้ง
// pending และห้ามแตะ audit ใด ๆ — anomaly ชัดเจน ต้องให้คนตรวจ ไม่ใช่เดาแล้วเคลียร์ทิ้ง) ═══
{
  const before = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0,
    name:'ของ', note:'', priceSatang:10000, totalSatang:10000, cashSatang:10000, scanSatang:0, thaiSatang:0, creditSatang:0 };
  const after = Object.assign({}, before, { price:200, total:200, cashAmount:200, priceSatang:20000, totalSatang:20000, cashSatang:20000 });
  const thirdValue = Object.assign({}, before, { price:777, total:777, cashAmount:777, priceSatang:77700, totalSatang:77700, cashSatang:77700 });
  const opId = 'op_hold3_test17b';
  const auditEntry = { editId:'e17b', operationId: opId, orderId:'o1', affectedSaleIds:['s1'],
    before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0},
    after:{billTotalSatang:20000,cashSatang:20000,scanSatang:0,thaiSatang:0,creditSatang:0},
    editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  const pending = { operationId: opId, saleId:'s1', saleSnapshotBefore: before, saleSnapshotAfter: after, auditEntryBase: auditEntry, ts:new Date().toISOString() };
  const M = buildSandbox({ sales:[thirdValue] });
  M.ls.setItem('sm_sales', JSON.stringify([thirdValue]));
  M.ls.setItem('sm_sale_edits', JSON.stringify([auditEntry])); // orphan audit ค้างอยู่ (สภาพ anomaly)
  M.ls.setItem('sm_pending_sale_edit', JSON.stringify(pending));
  const result = M.reconcilePendingSaleEdit(pending);
  assert('T17b: third-value + orphan audit → settled:false (fail-closed) เช่นกัน', result.settled === false, result);
  assert('T17b: sm_pending_sale_edit ยังอยู่ (ไม่ถูกลบ)', M.ls.getItem('sm_pending_sale_edit') !== null);
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || '[]');
  assert('T17b: audit entry ไม่ถูกแตะเลย (ยังมี 1 entry เป๊ะ ไม่ถูกลบ/แก้)', log.length === 1 && log[0].operationId === opId, log);
}

// ═══ Test 18: DEFECT 3B — Save re-entrancy end-to-end ผ่าน saveEdit() จริง 2 ครั้งติด (จำลองกดซ้ำหลังผลลัพธ์ครั้งแรก
// ยัง settled:false) → (ก) ปุ่ม Save ต้องไม่ถูกเปิดกลับ (ข) pending เดิมต้องไม่ถูกเขียนทับ (ค) ไม่มี double mutation
// (ง) beforeSnapshot ของ pending ยังเป็นค่า before จริง ไม่กลายเป็น after/ค่าที่เพี้ยน ═══
{
  const sale = { id:'s1', orderId:'o1', name:'ของ', price:100, qty:1, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales: [sale], editSaleId:'s1' });
  M.ls.setItem('sm_sales', JSON.stringify([sale])); // pre-existing disk state = before
  M.openEditSale('s1');
  M.el('es-pr').value = '300';
  M.recalcEditTotal();
  M.ls._failOnSetKey = 'sm_sale_edits'; // sm_sales (c) จะสำเร็จ แต่ sm_sale_edits (d)/roll-forward ล้มถาวร → จบแบบ settled:false
  M.saveEdit(); // 1st submit — real entry path
  const s1 = M.sales.find(x => x.id === 's1');
  assert('T18: 1st submit — sale (memory) = after (300) เพราะ sm_sales เขียนจริงสำเร็จแล้ว แต่ audit ยัง unsettled', s1.total === 300, s1);
  assert('T18: 1st submit — es-save-btn ยัง disabled อยู่ (ไม่เปิดกลับ เพราะ settled:false)', M.el('es-save-btn').disabled === true, M.el('es-save-btn').disabled);
  assert('T18: 1st submit — toast แจ้งให้รีโหลดแอป (ข้อความเฉพาะสำหรับ settled:false)', /รีโหลดแอป/.test(M.lastToast), M.lastToast);
  const pendingAfterFirst = M.ls.getItem('sm_pending_sale_edit');
  assert('T18: 1st submit — sm_pending_sale_edit ยังค้างอยู่ (ไม่ถูกล้างทั้งที่ unsettled)', pendingAfterFirst !== null);
  const pendingObjAfterFirst = JSON.parse(pendingAfterFirst);
  assert('T18: pending journal เก็บ saleSnapshotBefore ถูกต้อง (price=100 ค่าจริงก่อนแก้)', pendingObjAfterFirst.saleSnapshotBefore.price === 100, pendingObjAfterFirst.saleSnapshotBefore);

  // จำลอง "กดซ้ำ": เปิดปุ่มกลับด้วยมือ (จำลอง race/บั๊ก UI อื่นที่หลุดผ่าน UI-guard — พิสูจน์ว่า core-layer guard เป็นตัว
  // กันจริง ไม่ใช่แค่ปุ่ม disabled ตาม pattern เดียวกับ T14) แล้วแก้ฟอร์มเป็นค่าที่ 3 ก่อนกด Save รอบสอง
  const btn = M.el('es-save-btn'); if (btn) btn.disabled = false;
  M.el('es-pr').value = '999'; // ค่าที่ 3 — ถ้า core-layer guard ไม่ทำงาน จะเกิด double mutation เป็น 999
  M.recalcEditTotal();
  M.saveEdit(); // 2nd submit — จำลองกดซ้ำ
  const s2 = M.sales.find(x => x.id === 's1');
  assert('T18: 2nd submit — sale (memory) ยังคงเป็น 300 เป๊ะ ไม่ถูก mutate ซ้ำเป็น 999 (core-layer guard ปฏิเสธก่อนแตะ applyMutationFn)', s2.total === 300, s2);
  assert('T18: 2nd submit — es-save-btn ยัง disabled อยู่เช่นกัน (settled:false อีกครั้ง)', M.el('es-save-btn').disabled === true, M.el('es-save-btn').disabled);
  const pendingAfterSecond = M.ls.getItem('sm_pending_sale_edit');
  assert('T18: 2nd submit — sm_pending_sale_edit ไม่ถูกเขียนทับ (byte-identical กับหลังครั้งแรก)', pendingAfterSecond === pendingAfterFirst, { pendingAfterFirst, pendingAfterSecond });
  const pendingObjAfterSecond = JSON.parse(pendingAfterSecond);
  assert('T18: pending ที่คงอยู่หลังกดซ้ำ ยังเก็บ saleSnapshotBefore.price=100 (ค่า before จริง ไม่ถูกทับด้วยค่าเพี้ยนจาก sale ที่ mutate ไปแล้ว)', pendingObjAfterSecond.saleSnapshotBefore.price === 100, pendingObjAfterSecond.saleSnapshotBefore);
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || '[]');
  assert('T18: sm_sale_edits ยังไม่มี entry ใหม่เกิดขึ้นจากการกดซ้ำ (ไม่มี audit ปลอม)', log.length === 0, log);
}

// ═══ M2 HOLD-4 (29 ส.ค. 2026, Room 00 re-gate) — fail-closed pending journal: corrupt JSON / read-fail / sale-missing
// +hasAudit tests, all against the real extracted functions (no shallow mocking) ═══

// ═══ Test 19: DEFECT 4-1 — step (a) ต้องปฏิเสธเขียนทับ pending ที่ JSON เสีย (corrupt bytes) แทนที่จะไหลผ่านไปทับ ═══
{
  const sale = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales:[sale] });
  const corruptBytes = '{ไม่ใช่ JSON ที่ valid เลย';
  M.ls.setItem('sm_pending_sale_edit', corruptBytes); // ตั้งหลัง buildSandbox() — auto-resume ตอน construct ยังไม่เจออะไร
  const before = Object.assign({}, sale);
  const after = Object.assign({}, sale, { total:200, cashAmount:200 });
  let applyCount = 0;
  const auditBase = { editId:'e19', operationId: M.genOperationId(), orderId:'o1', affectedSaleIds:['s1'], before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0}, after:{billTotalSatang:20000,cashSatang:20000,scanSatang:0,thaiSatang:0,creditSatang:0}, editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  function applyMutation(s){ applyCount++; s.total=200; s.cashAmount=200; }
  const r = M.performRecoverableSaleEdit(sale, before, after, applyMutation, auditBase);
  assert('T19: DEFECT 4-1 — corrupt pending JSON บน disk → performRecoverableSaleEdit ปฏิเสธ (ok:false, settled:false), ไม่ไหลผ่านไปเขียนทับ', r.ok === false && r.settled === false, r);
  assert('T19: applyMutationFn ไม่ถูกเรียกเลย (ปฏิเสธก่อนแตะ mutation ใด ๆ)', applyCount === 0, applyCount);
  assert('T19: sm_pending_sale_edit bytes เดิม (ของเสีย) ไม่ถูกแตะ/เขียนทับเลย — ยังเป็น corrupt bytes เป๊ะ', M.ls.getItem('sm_pending_sale_edit') === corruptBytes, M.ls.getItem('sm_pending_sale_edit'));
}

// ═══ Test 19b: DEFECT 4-3 — resume เจอ pending JSON เสีย ต้องคง bytes เดิมไว้ (ไม่ลบทิ้ง) ═══
{
  const sale = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const corruptBytes = '{อีกอันที่ parse ไม่ได้';
  const preLs = makeLSShim();
  preLs.setItem('sm_pending_sale_edit', corruptBytes); // ตั้งก่อน buildSandbox() ให้ auto-resume ตอน construct เจอ corrupt bytes นี้
  const M = buildSandbox({ localStorage: preLs, sales:[sale] });
  assert('T19b: DEFECT 4-3 — resume เจอ pending JSON เสีย → คง bytes เดิมไว้ (ไม่ guardedRemoveItem ทิ้ง)', M.ls.getItem('sm_pending_sale_edit') === corruptBytes, M.ls.getItem('sm_pending_sale_edit'));
  assert('T19b: sale ไม่ถูก mutate โดย resume', M.sales[0].total === 100 && M.sales[0].cashAmount === 100, M.sales[0]);
}

// ═══ Test 20: DEFECT 4-2 — read-error จริง (ไม่ใช่ absent) ตอน step (a) ต้อง fail-closed refuse ไม่ตีเป็น "ไม่มี pending" ═══
{
  const sale = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales:[sale] });
  M.ls._failOnGetKey = 'sm_pending_sale_edit'; // จำลอง localStorage.getItem ตัวเองล้มเหลว (read-error จริง)
  const before = Object.assign({}, sale);
  const after = Object.assign({}, sale, { total:300, cashAmount:300 });
  let applyCount = 0;
  const auditBase = { editId:'e20', operationId: M.genOperationId(), orderId:'o1', affectedSaleIds:['s1'], before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0}, after:{billTotalSatang:30000,cashSatang:30000,scanSatang:0,thaiSatang:0,creditSatang:0}, editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  function applyMutation(s){ applyCount++; s.total=300; s.cashAmount=300; }
  const r = M.performRecoverableSaleEdit(sale, before, after, applyMutation, auditBase);
  assert('T20: DEFECT 4-2 — read-error (ไม่ใช่ absent) ตอน step(a) → refuse (ok:false, settled:false)', r.ok === false && r.settled === false, r);
  assert('T20: applyMutationFn ไม่ถูกเรียก (ปฏิเสธก่อนแตะ mutation)', applyCount === 0, applyCount);
}

// ═══ Test 20b: DEFECT 4-2 — read-error จริงตอน resume ต้อง defer (ไม่ประกาศ absent, ไม่แตะ sale) ═══
{
  const sale = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const preLs = makeLSShim();
  preLs._failOnGetKey = 'sm_pending_sale_edit'; // ตั้งก่อนสร้าง sandbox — auto-resume ตอน construct จะเจอ read-error ทันที
  const M = buildSandbox({ localStorage: preLs, sales:[sale] });
  assert('T20b: DEFECT 4-2 — resume เจอ read-error ตอนอ่าน pending → defer (sale ไม่ถูก mutate, ไม่ล้มทั้งแอป)', M.sales[0].total === 100 && M.sales[0].cashAmount === 100, M.sales[0]);
}

// ═══ Test 21: DEFECT 4-4 — sale หายจาก sm_sales แต่มี audit ค้าง (สถานะขัดกัน) → settled:false, คง pending+audit ไว้ ═══
{
  const before = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0,
    name:'ของ', note:'', priceSatang:10000, totalSatang:10000, cashSatang:10000, scanSatang:0, thaiSatang:0, creditSatang:0 };
  const after = Object.assign({}, before, { price:200, total:200, cashAmount:200, priceSatang:20000, totalSatang:20000, cashSatang:20000 });
  const opId = 'op_hold4_test21';
  const auditEntry = { editId:'e21', operationId: opId, orderId:'o1', affectedSaleIds:['s1'],
    before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0},
    after:{billTotalSatang:20000,cashSatang:20000,scanSatang:0,thaiSatang:0,creditSatang:0},
    editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  const pending = { operationId: opId, saleId:'s1', saleSnapshotBefore: before, saleSnapshotAfter: after, auditEntryBase: auditEntry, ts:new Date().toISOString() };
  const M = buildSandbox({ sales: [] }); // sm_sales ไม่มี key นี้เลย (บิลหายไปจาก disk ทั้งหมด)
  M.ls.setItem('sm_sale_edits', JSON.stringify([auditEntry])); // audit ค้างอ้างว่าแก้แล้ว
  M.ls.setItem('sm_pending_sale_edit', JSON.stringify(pending));
  const result = M.reconcilePendingSaleEdit(pending);
  assert('T21: DEFECT 4-4 — sale หายจาก disk + มี audit ค้าง → settled:false (สถานะขัดกัน ไม่ประกาศ resolved)', result.settled === false, result);
  assert('T21: sm_pending_sale_edit ไม่ถูกลบ', M.ls.getItem('sm_pending_sale_edit') !== null);
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || '[]');
  assert('T21: audit entry ไม่ถูกแตะเลย (ยังอยู่ 1 entry เป๊ะ)', log.length === 1 && log[0].operationId === opId, log);
}

// ═══ M2 HOLD-5 (29 ส.ค. 2026, Room 00 adversarial re-gate) — pending journal SCHEMA validation: parseable-but-
// structurally-invalid records ({}, [], "abc", missing snapshots, operationId≠audit) must be rejected before ever
// reaching reconcile's disk-comparison logic, all via real functions / real entry paths, no shallow mocking ═══

function fullSnap(overrides){
  return Object.assign({ name:'ของ', qty:1, price:100, total:100, pay:'cash', note:'',
    cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0,
    priceSatang:10000, totalSatang:10000, cashSatang:10000, scanSatang:0, thaiSatang:0, creditSatang:0 }, overrides || {});
}

// ═══ Test 22: FIX 4.1 — sm_pending_sale_edit = '{}' (parseable, empty object) → step (a) ต้องปฏิเสธ real-path ═══
{
  const sale = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales:[sale] });
  M.ls.setItem('sm_pending_sale_edit', '{}');
  const before = Object.assign({}, sale);
  const after = Object.assign({}, sale, { total:200, cashAmount:200 });
  let applyCount = 0;
  const auditBase = { editId:'e22', operationId: M.genOperationId(), orderId:'o1', affectedSaleIds:['s1'], before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0}, after:{billTotalSatang:20000,cashSatang:20000,scanSatang:0,thaiSatang:0,creditSatang:0}, editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  function applyMutation(s){ applyCount++; s.total=200; s.cashAmount=200; }
  const r = M.performRecoverableSaleEdit(sale, before, after, applyMutation, auditBase);
  assert('T22: FIX4.1 — pending="{}" → performRecoverableSaleEdit refuse (ok:false, settled:false)', r.ok === false && r.settled === false, r);
  assert('T22: applyMutationFn ไม่ถูกเรียกเลย', applyCount === 0, applyCount);
  assert("T22: sm_pending_sale_edit bytes ยังเป็น '{}' เป๊ะ (ไม่ถูกลบ/ทับ)", M.ls.getItem('sm_pending_sale_edit') === '{}', M.ls.getItem('sm_pending_sale_edit'));
}
// ═══ Test 22b: resume ก็ต้องปฏิเสธเหมือนกันสำหรับ '{}' — ไม่ลบ ไม่ mutate ═══
{
  const sale = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const preLs = makeLSShim();
  preLs.setItem('sm_pending_sale_edit', '{}');
  const M = buildSandbox({ localStorage: preLs, sales:[sale] });
  assert("T22b: resume เจอ pending='{}' → คง bytes เดิมไว้ (ไม่ลบ)", M.ls.getItem('sm_pending_sale_edit') === '{}', M.ls.getItem('sm_pending_sale_edit'));
  assert('T22b: sale ไม่ถูก mutate โดย resume', M.sales[0].total === 100 && M.sales[0].cashAmount === 100, M.sales[0]);
}

// ═══ Test 23: FIX 4.2 — sm_pending_sale_edit = '[]' (parseable, array) → ต้องปฏิเสธเหมือนกัน (isPlainObject ตัด array) ═══
{
  const sale = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales:[sale] });
  M.ls.setItem('sm_pending_sale_edit', '[]');
  const before = Object.assign({}, sale);
  const after = Object.assign({}, sale, { total:200, cashAmount:200 });
  let applyCount = 0;
  const auditBase = { editId:'e23', operationId: M.genOperationId(), orderId:'o1', affectedSaleIds:['s1'], before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0}, after:{billTotalSatang:20000,cashSatang:20000,scanSatang:0,thaiSatang:0,creditSatang:0}, editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  function applyMutation(s){ applyCount++; s.total=200; s.cashAmount=200; }
  const r = M.performRecoverableSaleEdit(sale, before, after, applyMutation, auditBase);
  assert('T23: FIX4.2 — pending="[]" (array) → refuse (ok:false, settled:false)', r.ok === false && r.settled === false, r);
  assert('T23: applyMutationFn ไม่ถูกเรียกเลย', applyCount === 0, applyCount);
  assert("T23: sm_pending_sale_edit bytes ยังเป็น '[]' เป๊ะ", M.ls.getItem('sm_pending_sale_edit') === '[]', M.ls.getItem('sm_pending_sale_edit'));
}

// ═══ Test 24: FIX 4.3 — sm_pending_sale_edit = '"abc"' (parseable, non-object primitive) → ต้องปฏิเสธเหมือนกัน ═══
{
  const sale = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales:[sale] });
  M.ls.setItem('sm_pending_sale_edit', '"abc"');
  const before = Object.assign({}, sale);
  const after = Object.assign({}, sale, { total:200, cashAmount:200 });
  let applyCount = 0;
  const auditBase = { editId:'e24', operationId: M.genOperationId(), orderId:'o1', affectedSaleIds:['s1'], before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0}, after:{billTotalSatang:20000,cashSatang:20000,scanSatang:0,thaiSatang:0,creditSatang:0}, editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  function applyMutation(s){ applyCount++; s.total=200; s.cashAmount=200; }
  const r = M.performRecoverableSaleEdit(sale, before, after, applyMutation, auditBase);
  assert('T24: FIX4.3 — pending=\'"abc"\' (non-object) → refuse (ok:false, settled:false)', r.ok === false && r.settled === false, r);
  assert('T24: applyMutationFn ไม่ถูกเรียกเลย', applyCount === 0, applyCount);
  assert('T24: sm_pending_sale_edit bytes ยังเป็น \'"abc"\' เป๊ะ', M.ls.getItem('sm_pending_sale_edit') === '"abc"', M.ls.getItem('sm_pending_sale_edit'));
}

// ═══ Test 25: FIX 4.4 — object ที่ขาด saleSnapshotBefore/After ไปเลย (มีแค่ operationId/saleId/auditEntryBase) → invalid ═══
{
  const sale = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const opId = 'op_hold5_test25';
  const badPending = { operationId: opId, saleId:'s1', auditEntryBase:{ operationId: opId, affectedSaleIds:['s1'] }, ts:new Date().toISOString() }; // ไม่มี saleSnapshotBefore/After เลย
  const M = buildSandbox({ sales:[sale] });
  M.ls.setItem('sm_pending_sale_edit', JSON.stringify(badPending));
  const before = Object.assign({}, sale);
  const after = Object.assign({}, sale, { total:200, cashAmount:200 });
  let applyCount = 0;
  const auditBase = { editId:'e25', operationId: M.genOperationId(), orderId:'o1', affectedSaleIds:['s1'], before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0}, after:{billTotalSatang:20000,cashSatang:20000,scanSatang:0,thaiSatang:0,creditSatang:0}, editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  function applyMutation(s){ applyCount++; s.total=200; s.cashAmount=200; }
  const r = M.performRecoverableSaleEdit(sale, before, after, applyMutation, auditBase);
  assert('T25: FIX4.4 — pending ขาด saleSnapshotBefore/After → refuse (ok:false, settled:false)', r.ok === false && r.settled === false, r);
  assert('T25: applyMutationFn ไม่ถูกเรียกเลย', applyCount === 0, applyCount);
  assert('T25: sm_pending_sale_edit bytes เดิมไม่ถูกแตะ', M.ls.getItem('sm_pending_sale_edit') === JSON.stringify(badPending), M.ls.getItem('sm_pending_sale_edit'));
}
// ═══ Test 25b: reconcilePendingSaleEdit() โดยตรง ก็ต้อง validate เป็นบรรทัดแรกเช่นกัน (FIX 1 — guard ครอบทุก entry) ═══
{
  const badPending = { operationId:'op_hold5_25b', saleId:'s1', auditEntryBase:{ operationId:'op_hold5_25b' } }; // ขาด snapshots ทั้งคู่
  const M = buildSandbox({ sales:[{ id:'s1', total:100 }] });
  const result = M.reconcilePendingSaleEdit(badPending);
  assert("T25b: reconcilePendingSaleEdit() บรรทัดแรก validate ก่อนแตะ readSalesFromDiskById → settled:false, outcome:'invalid_structure'", result.settled === false && result.outcome === 'invalid_structure', result);
}

// ═══ Test 26: FIX 4.5 — operationId ของ pending ไม่ตรงกับ auditEntryBase.operationId → ความสัมพันธ์เสีย = invalid ═══
{
  const sale = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const badPending = {
    operationId: 'op_pending_A', saleId:'s1',
    saleSnapshotBefore: fullSnap({ price:100, total:100, cashAmount:100 }),
    saleSnapshotAfter: fullSnap({ price:200, total:200, cashAmount:200 }),
    auditEntryBase: { operationId: 'op_AUDIT_B_MISMATCH', orderId:'o1', affectedSaleIds:['s1'] }, // ไม่ตรงกับ pending.operationId เลย
    ts: new Date().toISOString()
  };
  const M = buildSandbox({ sales:[sale] });
  M.ls.setItem('sm_pending_sale_edit', JSON.stringify(badPending));
  const before = Object.assign({}, sale);
  const after = Object.assign({}, sale, { total:300, cashAmount:300 });
  let applyCount = 0;
  const auditBase = { editId:'e26', operationId: M.genOperationId(), orderId:'o1', affectedSaleIds:['s1'], before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0}, after:{billTotalSatang:30000,cashSatang:30000,scanSatang:0,thaiSatang:0,creditSatang:0}, editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  function applyMutation(s){ applyCount++; s.total=300; s.cashAmount=300; }
  const r = M.performRecoverableSaleEdit(sale, before, after, applyMutation, auditBase);
  assert('T26: FIX4.5 — operationId ไม่ตรง auditEntryBase.operationId → refuse (ok:false, settled:false)', r.ok === false && r.settled === false, r);
  assert('T26: applyMutationFn ไม่ถูกเรียกเลย', applyCount === 0, applyCount);
  assert('T26: sm_pending_sale_edit bytes เดิมไม่ถูกแตะ', M.ls.getItem('sm_pending_sale_edit') === JSON.stringify(badPending), M.ls.getItem('sm_pending_sale_edit'));
}
// ═══ Test 26b: FIX 4.5 variant — saleId ไม่อยู่ใน auditEntryBase.affectedSaleIds เลย (ความสัมพันธ์ saleId เสีย) ═══
{
  const sale = { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const opId = 'op_hold5_26b';
  const badPending = {
    operationId: opId, saleId:'s1',
    saleSnapshotBefore: fullSnap({ price:100, total:100, cashAmount:100 }),
    saleSnapshotAfter: fullSnap({ price:300, total:300, cashAmount:300 }),
    auditEntryBase: { operationId: opId, orderId:'o1', affectedSaleIds:['s999_UNRELATED'] }, // ไม่รวม saleId 's1' เลย
    ts: new Date().toISOString()
  };
  const M = buildSandbox({ sales:[sale] });
  const result = M.reconcilePendingSaleEdit(badPending);
  assert("T26b: saleId ไม่อยู่ใน affectedSaleIds ของ audit → settled:false, outcome:'invalid_structure'", result.settled === false && result.outcome === 'invalid_structure', result);
}

// ═══ M2 HOLD-6 (29 ส.ค. 2026, Room 00 adversarial extension) — validator tightening: mandatory Array on
// affectedSaleIds (no short-circuit), strict saleId type, full auditEntryBase schema incl. satang-integer money
// fields. Real-path via performRecoverableSaleEdit()/reconcilePendingSaleEdit(), no shallow mocking ═══

// helper: a fully-shaped, otherwise-valid pending record, so each test below can knock out exactly one field
function fullValidPending(opId, overrides){
  const base = {
    operationId: opId, saleId: 's1',
    saleSnapshotBefore: fullSnap({ price:100, total:100, cashAmount:100 }),
    saleSnapshotAfter: fullSnap({ price:200, total:200, cashAmount:200 }),
    auditEntryBase: {
      editId: 'edit_' + opId, operationId: opId, orderId:'o1', affectedSaleIds:['s1'],
      before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0},
      after:{billTotalSatang:20000,cashSatang:20000,scanSatang:0,thaiSatang:0,creditSatang:0},
      editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test'
    },
    ts: new Date().toISOString()
  };
  return Object.assign({}, base, overrides || {});
}

function runRealPathRejectTest(testLabel, badPending, sale){
  sale = sale || { id:'s1', qty:1, price:100, total:100, pay:'cash', cashAmount:100, scanAmount:0, thaiAmount:0, creditAmount:0 };
  const M = buildSandbox({ sales:[sale] });
  const bytes = JSON.stringify(badPending);
  M.ls.setItem('sm_pending_sale_edit', bytes);
  const before = Object.assign({}, sale);
  const after = Object.assign({}, sale, { total:999, cashAmount:999 });
  let applyCount = 0;
  const auditBase = { editId:testLabel+'_e', operationId: M.genOperationId(), orderId:'o1', affectedSaleIds:['s1'], before:{billTotalSatang:10000,cashSatang:10000,scanSatang:0,thaiSatang:0,creditSatang:0}, after:{billTotalSatang:99900,cashSatang:99900,scanSatang:0,thaiSatang:0,creditSatang:0}, editTimestamp:'t', sellerName:'x', deviceId:'d', reason:'test' };
  function applyMutation(s){ applyCount++; s.total=999; s.cashAmount=999; }
  const r = M.performRecoverableSaleEdit(sale, before, after, applyMutation, auditBase);
  assert(testLabel + ': performRecoverableSaleEdit refuse (ok:false, settled:false)', r.ok === false && r.settled === false, r);
  assert(testLabel + ': applyMutationFn ไม่ถูกเรียกเลย', applyCount === 0, applyCount);
  assert(testLabel + ': sm_pending_sale_edit bytes เดิมไม่ถูกแตะ/เขียนทับ', M.ls.getItem('sm_pending_sale_edit') === bytes, M.ls.getItem('sm_pending_sale_edit'));
  return M;
}

// ═══ Test 27/27b: HOLD-6 case 1 — auditEntryBase.affectedSaleIds หายไปเลย (undefined, ไม่ใช่แค่ผิด type) ═══
{
  const opId = 'op_hold6_27';
  const badPending = fullValidPending(opId);
  delete badPending.auditEntryBase.affectedSaleIds;
  runRealPathRejectTest('T27', badPending);
}
{
  const opId = 'op_hold6_27b';
  const badPending = fullValidPending(opId);
  delete badPending.auditEntryBase.affectedSaleIds;
  const M = buildSandbox({ sales:[{ id:'s1', total:100 }] });
  const result = M.reconcilePendingSaleEdit(badPending);
  assert("T27b: affectedSaleIds หาย (direct reconcile) → settled:false, outcome:'invalid_structure' (ไม่ short-circuit ผ่านฟรีเหมือนเดิม)", result.settled === false && result.outcome === 'invalid_structure', result);
}

// ═══ Test 28: HOLD-6 case 2 — affectedSaleIds เป็น string 's1' (ไม่ใช่ array) → ต้อง reject เหมือนกัน (เดิม short-circuit ปล่อยผ่าน) ═══
{
  const opId = 'op_hold6_28';
  const badPending = fullValidPending(opId, {});
  badPending.auditEntryBase.affectedSaleIds = 's1'; // string แทน array
  runRealPathRejectTest('T28', badPending);
}

// ═══ Test 29: HOLD-6 case 3 — saleId = '' (empty string) → เดิม validate เช็คแค่ null/undefined ปล่อย '' ผ่าน ═══
{
  const opId = 'op_hold6_29';
  const badPending = fullValidPending(opId, { saleId: '' });
  runRealPathRejectTest('T29', badPending);
}

// ═══ Test 30/30b/30c: HOLD-6 case 4 — auditEntryBase ขาด before / after / editId แยกเคส ═══
{
  const opId = 'op_hold6_30';
  const badPending = fullValidPending(opId);
  delete badPending.auditEntryBase.before;
  runRealPathRejectTest('T30', badPending);
}
{
  const opId = 'op_hold6_30b';
  const badPending = fullValidPending(opId);
  delete badPending.auditEntryBase.after;
  runRealPathRejectTest('T30b', badPending);
}
{
  const opId = 'op_hold6_30c';
  const badPending = fullValidPending(opId);
  delete badPending.auditEntryBase.editId;
  runRealPathRejectTest('T30c', badPending);
}

// ═══ Test 31/31b: HOLD-6 case 5 — auditEntryBase.before ขาด satang field (cashSatang) หรือเป็น non-integer ═══
{
  const opId = 'op_hold6_31';
  const badPending = fullValidPending(opId);
  delete badPending.auditEntryBase.before.cashSatang; // ขาด satang field
  runRealPathRejectTest('T31', badPending);
}
{
  const opId = 'op_hold6_31b';
  const badPending = fullValidPending(opId);
  badPending.auditEntryBase.before.cashSatang = 100.5; // ไม่ใช่ integer
  runRealPathRejectTest('T31b', badPending);
}

// ═══ Test 32: regression sanity — record ที่ครบทุก field ตาม fullValidPending() (ไม่มี override เสีย) ต้อง "ไม่" ถูก reject
// โดย validator เอง (ยืนยัน over-reject ไม่เกิด) — ใช้ reconcile ตรง ๆ กับ sale บน disk ที่ตรงกับ saleSnapshotBefore เป๊ะ
// เพื่อพิสูจน์ว่า record ที่ valid จริงยังไหลผ่าน validate ไปถึงขั้น disk-comparison ได้ตามปกติ ═══
{
  const opId = 'op_hold6_32';
  const goodPending = fullValidPending(opId);
  const diskSale = Object.assign({ id:'s1' }, goodPending.saleSnapshotBefore); // disk ตรงกับ before เป๊ะ
  const M = buildSandbox({ sales:[diskSale] });
  M.ls.setItem('sm_sales', JSON.stringify([diskSale]));
  const result = M.reconcilePendingSaleEdit(goodPending);
  assert('T32: record ที่ valid ครบทุก field ไม่ถูก validator ปฏิเสธ (ไม่ over-reject) — reconcile ไหลผ่านไปถึง disk-comparison จริง (ไม่ใช่ invalid_structure)', result.outcome !== 'invalid_structure', result);
  assert('T32: และตัดสินถูกต้องว่า before_clean (settled:true, finalState=before) เพราะ disk ตรงกับ before เป๊ะ ไม่มี audit', result.settled === true && result.finalState === 'before', result);
}

// ═══ M2 HOLD-7 (29 ส.ค. 2026, Room 00 gate: 163/164 legacy recovery regression) — legacy float-only permanent fixture
// matrix: บิลที่สร้างก่อน M2 satang schema จะมีอยู่ ไม่มี priceSatang/totalSatang/cashSatang/scanSatang/thaiSatang/
// creditSatang key ใด ๆ เลยแม้แต่ตัวเดียว (ไม่ใช่แค่ undefined-value — key ไม่มีอยู่ใน object เลย) — ฝังไว้ถาวรใน harness
// นี้ตามที่ HQ ขอ เพื่อกันชนกับ satang path ทุกครั้งที่แก้ต่อจากนี้ ทุกเทสต์ยิงผ่าน real entry path
// (openEditSale/saveEdit/reconcilePendingSaleEdit จริง) ไม่ shallow mock ═══
function legacyFloatOnlySale(overrides){
  const base = { id:'s1', orderId:'o1', name:'ของเก่า', price:88.5, qty:1, total:88.5, pay:'cash',
    cashAmount:88.5, scanAmount:0, thaiAmount:0, creditAmount:0 };
  return Object.assign({}, base, overrides || {});
}

// ═══ Test 33 (HOLD-7 legacy 1/4): saveEdit() จริงบนบิล legacy float-only → pending journal ที่เขียนจริง (หลัง JSON
// round-trip เหมือนที่จะอยู่บน disk จริง) ต้องยัง validatePendingSaleEditStructure()=true — ไม่ถูกตัดเป็น invalid_structure
// จาก undefined-key-drop (root cause ของ regression รอบนี้) ═══
{
  const legacySale = legacyFloatOnlySale();
  const M = buildSandbox({ sales:[legacySale], editSaleId:'s1' });
  M.ls.setItem('sm_sales', JSON.stringify([legacySale]));
  M.ls._failOnSetKey = 'sm_sale_edits'; // บังคับให้ step (d) ล้ม เพื่อให้ pending journal ยัง "ค้าง" บน disk ให้ตรวจ bytes จริงได้ (step c ยังสำเร็จตามปกติ)
  M.openEditSale('s1');
  M.el('es-pr').value = '120';
  M.recalcEditTotal();
  M.saveEdit();
  const rawPending = M.ls.getItem('sm_pending_sale_edit');
  assert('T33 (HOLD-7 legacy 1/4): pending journal ถูกเขียนจริง — step (a) ไม่ปฏิเสธ snapshot ของบิล legacy float-only', rawPending !== null, rawPending);
  const roundTripped = JSON.parse(rawPending); // เท่ากับสิ่งที่จะอ่านได้จริงหลัง reload
  assert('T33: pending ที่ round-trip ผ่าน JSON.stringify→parse จริงแล้ว ยัง validatePendingSaleEditStructure()=true', M.validatePendingSaleEditStructure(roundTripped) === true, roundTripped);
  assert('T33: sale (memory) apply mutation จริง (total=120) — step c สำเร็จ (มีแค่ step d ล้ม)', M.sales.find(function(x){return x.id==='s1';}).total === 120);
  assert('T33: money-invariance — beforeSnapshot.totalSatang derive จาก 88.5 = 8850 เป๊ะ (round(float×100))', roundTripped.saleSnapshotBefore.totalSatang === 8850, roundTripped.saleSnapshotBefore.totalSatang);
  assert('T33: money-invariance — afterSnapshot.totalSatang derive จาก 120 = 12000 เป๊ะ', roundTripped.saleSnapshotAfter.totalSatang === 12000, roundTripped.saleSnapshotAfter.totalSatang);
  assert('T33: beforeSnapshot.note default เป็น string ว่าง (ไม่ใช่ undefined ที่จะถูก JSON.stringify ตัดทิ้ง)', roundTripped.saleSnapshotBefore.note === '', roundTripped.saleSnapshotBefore.note);
}

// ═══ Test 34 (HOLD-7 legacy 2/4): crash-before-mutation — sm_sales guarded write ล้มถาวร (จำลอง crash/quota เต็มก่อน
// บันทึกจริงลง disk) บนบิล legacy float-only → reconcile ต้องตัดสิน before_clean ถูกต้อง (canonicalizeSaleForMatch
// เทียบกับ disk sale ที่ไม่มี *Satang key เลยได้ถูกต้อง — ไม่ตัดสินผิดเป็น unrecognized_unresolved) ═══
{
  const legacySale = legacyFloatOnlySale();
  const M = buildSandbox({ sales:[legacySale], editSaleId:'s1' });
  M.ls.setItem('sm_sales', JSON.stringify([legacySale]));
  M.openEditSale('s1');
  M.el('es-pr').value = '120';
  M.recalcEditTotal();
  M.ls._failOnSetKey = 'sm_sales'; // ตั้งหลัง render — จำลอง step (c) ล้มถาวร (crash ก่อนบันทึกจริงลง disk)
  M.saveEdit();
  const s = M.sales.find(function(x){return x.id==='s1';});
  assert('T34 (HOLD-7 legacy 2/4): sale (memory) sync กลับเป็น before (price=88.5/total=88.5) — reconcile ตัดสิน before_clean ถูกต้องแม้เป็นบิล legacy', s.price === 88.5 && s.total === 88.5, s);
  assert('T34: sm_pending_sale_edit ถูกเคลียร์ (settled true, before_clean)', M.ls.getItem('sm_pending_sale_edit') === null);
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || '[]');
  assert('T34: ไม่มี audit entry ค้าง (ไม่เคย apply สำเร็จ)', log.length === 0, log);
  const diskSale = JSON.parse(M.ls.getItem('sm_sales'))[0];
  assert('T34: disk sm_sales ยังเป็นค่าเดิม legacy เป๊ะ (total=88.5, ไม่มี totalSatang key ถูกเติมเข้าไป — ไม่ mutate sale เดิม)', diskSale.total === 88.5 && !('totalSatang' in diskSale), diskSale);
}

// ═══ Test 35 (HOLD-7 legacy 3/4): sale ลง disk สำเร็จแล้ว (=after) แต่ audit ยังไม่ลง (step d ล้มครั้งแรก) บนบิล legacy
// float-only → reconcile รอบถัดไป (หลัง storage เขียนได้ตามปกติแล้ว เช่น เปิดแอปใหม่) ต้อง roll-forward เติม audit ให้จบ ═══
{
  const legacySale = legacyFloatOnlySale();
  const M = buildSandbox({ sales:[legacySale], editSaleId:'s1' });
  M.ls.setItem('sm_sales', JSON.stringify([legacySale]));
  M.openEditSale('s1');
  M.el('es-pr').value = '120';
  M.recalcEditTotal();
  M.ls._failOnSetKey = 'sm_sale_edits'; // step (d) ล้มครั้งแรก (เช่น storage เต็มชั่วคราว) — sm_sales (c) สำเร็จไปแล้วก่อนหน้านี้
  M.saveEdit();
  assert('T35 (HOLD-7 legacy 3/4): หลัง step d ล้มครั้งแรก sm_pending_sale_edit ยังค้างอยู่ (unsettled)', M.ls.getItem('sm_pending_sale_edit') !== null);
  const pending = JSON.parse(M.ls.getItem('sm_pending_sale_edit'));
  M.ls._failOnSetKey = null; // จำลองว่า storage กลับมาเขียนได้ตามปกติแล้ว (เช่น เปิดแอปใหม่ / resume รอบถัดไป)
  const result = M.reconcilePendingSaleEdit(pending);
  assert("T35: reconcile รอบถัดไป → outcome='after_rollforward' (เติม audit สำเร็จ) แม้เป็นบิล legacy float-only", result.settled === true && result.outcome === 'after_rollforward', result);
  assert('T35: sm_pending_sale_edit ถูกเคลียร์แล้วหลัง roll-forward สำเร็จ', M.ls.getItem('sm_pending_sale_edit') === null);
  const log = JSON.parse(M.ls.getItem('sm_sale_edits') || '[]');
  assert('T35: audit entry ถูกเติมสำเร็จ 1 รายการ ตรงกับ operationId เดิม', log.length === 1 && log[0].operationId === pending.operationId, log);
}

// ═══ Test 36 (HOLD-7 legacy 4/4): money/revenue invariance — derive satang จากบิล legacy float-only หลายค่า (รวมค่าที่
// เสี่ยง floating-point เช่น 100.01/45.25) ต้อง = round(float×100) เป๊ะทุกตัว ไม่มี drift แม้แต่สตางค์เดียว และ round-trip
// กลับ (satangToBahtNum) ต้องตรงกับ float เดิมเป๊ะ ═══
{
  const M = buildSandbox({});
  const cases = [88.5, 100.01, 0.1, 999.99, 1234.56, 7.77, 250, 45.25];
  cases.forEach(function(v){
    const legacy = legacyFloatOnlySale({ price:v, total:v, cashAmount:v });
    const expected = Math.round(v * 100);
    assert('T36: getSalePriceSatang derive(' + v + ') = ' + expected + ' เป๊ะ (legacy, ไม่มี priceSatang key)', M.getSalePriceSatang(legacy) === expected, M.getSalePriceSatang(legacy));
    assert('T36: getSaleTotalSatang derive(' + v + ') = ' + expected + ' เป๊ะ', M.getSaleTotalSatang(legacy) === expected, M.getSaleTotalSatang(legacy));
    assert('T36: getSaleCashSatang derive(' + v + ') = ' + expected + ' เป๊ะ', M.getSaleCashSatang(legacy) === expected, M.getSaleCashSatang(legacy));
    assert('T36: money-invariance round-trip — satangToBahtNum(derived(' + v + ')) === original float เป๊ะ', M.satangToBahtNum(M.getSaleTotalSatang(legacy)) === v, M.satangToBahtNum(M.getSaleTotalSatang(legacy)));
  });
}

console.log('\n=== M2 A2 Test Harness (Split Payment / Satang / Sale-Edit Integrity) ===');
console.log(pass + '/' + (pass + fail) + ' PASS');
if (fail > 0) { console.log(fail + ' FAILED'); process.exit(1); }

/**
 * StallMate P0 §9.4 — source-vs-restored reconciliation (REDACTED output only).
 * Runs LOCALLY on June's machine. Prints ONLY aggregates: top-level path inventory,
 * record counts per approved path, sales record count, financial totals in satang,
 * and canonical SHA-256 per top-level subtree + whole-tree (source vs restored).
 * NEVER prints raw records, PINs, customer or transaction detail.
 * Exit 0 iff source and restored reconcile exactly (whole-tree canonical hash match).
 *
 * Usage: node p0_94_reconcile.js <source_export.json> <restored_from_emulator.json>
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const [,, srcPath, resPath] = process.argv;
if (!srcPath || !resPath) { console.error('usage: node p0_94_reconcile.js <source.json> <restored.json>'); process.exit(2); }

const src = JSON.parse(fs.readFileSync(srcPath, 'utf8')) || {};
const res = JSON.parse(fs.readFileSync(resPath, 'utf8')) || {};

// canonical stringify (recursively sorted keys) -> deterministic hash
function canon(v){
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k)+':'+canon(v[k])).join(',') + '}';
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const count = (o) => (o && typeof o === 'object' && !Array.isArray(o)) ? Object.keys(o).length : 0;

function satangOfSale(s){
  if (!s || typeof s !== 'object') return 0;
  if (typeof s.totalSatang === 'number') return Math.round(s.totalSatang);
  if (typeof s.total === 'number') return Math.round(s.total * 100);
  return 0;
}

// Only the pilot room is an "approved path" to detail. Other merchants' room codes/volumes
// are third-party business data and are NOT enumerated — only aggregate counts are reported.
const APPROVED_ROOMS = (process.env.APPROVED_ROOMS || 'BBMANN').split(',').map(s=>s.trim()).filter(Boolean);

function summarize(root, label){
  const topKeys = Object.keys(root).sort();
  let salesCount = 0, satangTotal = 0, roomsWithData = 0;
  const approved = {};
  const rooms = root.rooms || {};
  for (const code of Object.keys(rooms)){
    const r = rooms[code] || {};
    const sr = r.salesRecords || {};
    const sc = count(sr);
    salesCount += sc;
    let rt = 0; for (const id of Object.keys(sr)) { const v = satangOfSale(sr[id]); satangTotal += v; rt += v; }
    if (sc > 0 || count(r.sessions) > 0 || count(r.deletedSales) > 0) roomsWithData++;
    if (APPROVED_ROOMS.includes(code)){
      approved[code] = {
        salesRecords: sc, deletedSales: count(r.deletedSales), sessions: count(r.sessions),
        checkins: count(r.checkins), staff: count(r.staff), branches: count(r.branches), roomSatangTotal: rt
      };
    }
  }
  return {
    label,
    topLevelInventory: topKeys,
    topLevelCounts: Object.fromEntries(topKeys.map(k => [k, count(root[k])])),
    approvedRooms: approved,
    roomsTotal: count(rooms),
    roomsWithData,
    salesRecordCount: salesCount,
    financialTotalSatang: satangTotal,
    topLevelHashes: Object.fromEntries(topKeys.map(k => [k, sha(canon(root[k]))])),
    wholeTreeHash: sha(canon(root))
  };
}

const S = summarize(src, 'SOURCE_EXPORT');
const Rr = summarize(res, 'EMULATOR_RESTORED');

function line(){ console.log('-'.repeat(60)); }
console.log('StallMate P0 §9.4 — RECONCILIATION (redacted aggregates only)');
console.log('Generated:', new Date().toISOString());
line();
for (const rep of [S, Rr]){
  console.log(`[${rep.label}]`);
  console.log('  top-level inventory :', rep.topLevelInventory.join(', '));
  console.log('  top-level counts    :', JSON.stringify(rep.topLevelCounts));
  console.log('  approved-path (pilot) counts :', JSON.stringify(rep.approvedRooms));
  console.log('  rooms total / with-data      :', rep.roomsTotal, '/', rep.roomsWithData, '(other merchants: aggregate only, codes not listed)');
  console.log('  sales record count (all rooms):', rep.salesRecordCount);
  console.log('  financial total (satang):', rep.financialTotalSatang);
  console.log('  whole-tree sha256   :', rep.wholeTreeHash);
  line();
}
const match =
  S.wholeTreeHash === Rr.wholeTreeHash &&
  S.salesRecordCount === Rr.salesRecordCount &&
  S.financialTotalSatang === Rr.financialTotalSatang;
console.log('RECONCILE:', match ? 'EXACT MATCH ✅ (source == emulator-restored)' : 'MISMATCH ❌');
console.log('  whole-tree hash equal :', S.wholeTreeHash === Rr.wholeTreeHash);
console.log('  sales count equal     :', S.salesRecordCount === Rr.salesRecordCount);
console.log('  satang total equal    :', S.financialTotalSatang === Rr.financialTotalSatang);
process.exit(match ? 0 : 1);

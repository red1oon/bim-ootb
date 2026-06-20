/**
 * test_shop_scurve.js — W-SHOP-SCURVE (§E2b TM shopfloor playback).
 *
 * ISSUE PROVEN: the stacked S-curve must (1) accrue cost elements monotonically (never decreases);
 *   (2) end at exactly 100% when all orders are done; (3) carry Material/Labor/Burden/Overhead keys
 *   at each point; (4) batch-light: ALL elements of an order accrue at the same finish timestamp
 *   (not during); (5) fall back to op-count curve when no shopfloor data; (6) §SCURVE_COMPUTE log
 *   reports stacked=true, order count, grand total.
 *
 * Whitebox: slices §SF_ELEMS / computeSCurve from time_machine.js, stubs _shopfloor/_ops/_projectStart/_projectEnd.
 * Run: node tests/test_shop_scurve.js   (from /tmp/wt-360)
 */
'use strict';
const fs  = require('fs');
const vm  = require('vm');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  🟢 ' + msg); }
  else       { fail++; console.log('  🔴 FAIL: ' + msg); }
}

// ── Slice computeSCurve + _SF_ELEMS from time_machine.js ──
const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'time_machine.js'), 'utf8');
const A_MARK = '// §E2b — STACKED S-curve:';
const B_MARK = '  function drawSCurve()';
const ai = src.indexOf(A_MARK), bi = src.indexOf(B_MARK, ai);
if (ai < 0 || bi < 0) { console.error('§TEST FAIL: markers not found'); process.exit(1); }
const logic = src.slice(ai, bi);
const EXPOSE = '\n;globalThis.__computeSCurve = computeSCurve;\n;globalThis.__ELEMS = _SF_ELEMS;';

// ── sandbox factory ──
const BASE_TS = Date.parse('2026-06-13T00:00:00Z');
const DAY = 86400000;

function mkSandbox(over) {
  const logs = [];
  const sb = Object.assign({
    _ops: [], _projectStart: BASE_TS, _projectEnd: BASE_TS + 365 * DAY,
    _shopfloor: null, _cursor: BASE_TS,
    _sCurveData: null,
    console: { log: (m) => logs.push(String(m)), warn: () => {} },
    __logs: logs
  }, over || {});
  vm.runInNewContext(logic + EXPOSE, sb);
  return sb;
}

// ── Minimal shopfloor: 2 orders, 3 phases
// Order A: June–July (Substructure), Material=1000, Labor=500, Burden=100, Overhead=50
// Order B: July–Dec  (Superstructure), Material=5000, Labor=3000, Burden=900, Overhead=450
const ORDER_A_END = BASE_TS + 23 * DAY;  // July 6
const ORDER_B_END = BASE_TS + 155 * DAY; // Nov 15 approx
const SF = {
  building: 'Hospital',
  orders: [
    { start: BASE_TS, end: ORDER_A_END, elements: { Material: 1000, Labor: 500, Burden: 100, Overhead: 50 } },
    { start: ORDER_A_END, end: ORDER_B_END, elements: { Material: 5000, Labor: 3000, Burden: 900, Overhead: 450 } }
  ]
};
const GRAND_TOTAL = (1000 + 500 + 100 + 50) + (5000 + 3000 + 900 + 450); // 11000

// ══════════════════════════════════════════════════
console.log('\n── W-SHOP-SCURVE: stacked keys present ──');
{
  const ops = [{ start_ts: BASE_TS, end_ts: BASE_TS + 100 * DAY }];
  const sb = mkSandbox({ _shopfloor: SF, _ops: ops, _projectEnd: BASE_TS + 200 * DAY });
  vm.runInContext('__computeSCurve()', sb);
  const pts = sb._sCurveData;
  assert(pts && pts.length > 0, 'W-SHOP-SCURVE-1: _sCurveData is non-empty');
  assert(pts && pts[0] && 'Material' in pts[0], 'W-SHOP-SCURVE-1: points have Material key');
  assert(pts && pts[0] && 'Labor' in pts[0], 'W-SHOP-SCURVE-1: points have Labor key');
  assert(pts && pts[0] && 'Burden' in pts[0], 'W-SHOP-SCURVE-1: points have Burden key');
  assert(pts && pts[0] && 'Overhead' in pts[0], 'W-SHOP-SCURVE-1: points have Overhead key');
}

console.log('\n── W-SHOP-SCURVE: monotonic accrual ──');
{
  const ops = [{ start_ts: BASE_TS, end_ts: BASE_TS + 100 * DAY }];
  const sb = mkSandbox({ _shopfloor: SF, _ops: ops, _projectEnd: BASE_TS + 200 * DAY });
  vm.runInContext('__computeSCurve()', sb);
  const pts = sb._sCurveData;
  // Sum all elements per point to get total accrual pct
  const totals = pts.map(function(p) { return (p.Material || 0) + (p.Labor || 0) + (p.Burden || 0) + (p.Overhead || 0); });
  let mono = true;
  for (let i = 1; i < totals.length; i++) { if (totals[i] < totals[i-1] - 0.001) { mono = false; break; } }
  assert(mono, 'W-SHOP-SCURVE-2: total accrual is monotonically non-decreasing');
  const lastTotal = totals[totals.length - 1];
  assert(Math.abs(lastTotal - 100) < 0.01, 'W-SHOP-SCURVE-2: ends at 100% (lastTotal=' + lastTotal.toFixed(2) + '%)');
}

console.log('\n── W-SHOP-SCURVE: batch lighting (all elements accrue together) ──');
{
  const ops = [{ start_ts: BASE_TS, end_ts: BASE_TS + 100 * DAY }];
  const projEnd = BASE_TS + 200 * DAY;
  const sb = mkSandbox({ _shopfloor: SF, _ops: ops, _projectEnd: projEnd });
  vm.runInContext('__computeSCurve()', sb);
  const pts = sb._sCurveData;

  // Find a point just BEFORE Order A's finish
  const ptBefore = pts.find(p => p.day * DAY + BASE_TS < ORDER_A_END - DAY);
  // Find a point just AFTER Order A's finish
  const ptAfter = pts.find(p => p.day * DAY + BASE_TS > ORDER_A_END + DAY);

  if (ptBefore && ptAfter) {
    const totalBefore = (ptBefore.Material || 0) + (ptBefore.Labor || 0) + (ptBefore.Burden || 0) + (ptBefore.Overhead || 0);
    const totalAfter  = (ptAfter.Material  || 0) + (ptAfter.Labor  || 0) + (ptAfter.Burden  || 0) + (ptAfter.Overhead  || 0);
    const orderAPct = (1000 + 500 + 100 + 50) / GRAND_TOTAL * 100;

    assert(totalBefore < 0.01, 'W-SHOP-SCURVE-3: before Order A finishes → 0% accrued');
    assert(Math.abs(totalAfter - orderAPct) < 0.1, 'W-SHOP-SCURVE-3: after Order A finishes → batch accrues as one (' + totalAfter.toFixed(2) + '% ≈ ' + orderAPct.toFixed(2) + '%)');
  } else {
    assert(false, 'W-SHOP-SCURVE-3: could not find before/after points — check step size');
  }
}

console.log('\n── W-SHOP-SCURVE: element proportions correct ──');
{
  const ops = [{ start_ts: BASE_TS, end_ts: BASE_TS + 100 * DAY }];
  const projEnd = BASE_TS + 200 * DAY;
  const sb = mkSandbox({ _shopfloor: SF, _ops: ops, _projectEnd: projEnd });
  vm.runInContext('__computeSCurve()', sb);
  const lastPt = sb._sCurveData[sb._sCurveData.length - 1];
  const mat = lastPt.Material, lab = lastPt.Labor, bur = lastPt.Burden, ovh = lastPt.Overhead;
  // Expected: material=(1000+5000)/11000*100=54.5%, labor=(500+3000)/11000*100=31.8%
  const expMat = (1000 + 5000) / GRAND_TOTAL * 100;
  const expLab = (500 + 3000) / GRAND_TOTAL * 100;
  assert(Math.abs(mat - expMat) < 0.1, 'W-SHOP-SCURVE-4: Material pct=' + mat.toFixed(2) + '≈' + expMat.toFixed(2) + '%');
  assert(Math.abs(lab - expLab) < 0.1, 'W-SHOP-SCURVE-4: Labor pct=' + lab.toFixed(2) + '≈' + expLab.toFixed(2) + '%');
  console.log('  Material=' + mat.toFixed(1) + '% Labor=' + lab.toFixed(1) + '% Burden=' + bur.toFixed(1) + '% Overhead=' + ovh.toFixed(1) + '%');
}

console.log('\n── W-SHOP-SCURVE: fallback when no shopfloor ──');
{
  const totalDays = 200, nOps = 10;
  const ops = Array.from({length: nOps}, (_, i) => ({
    start_ts: BASE_TS, end_ts: BASE_TS + Math.round((i + 1) * totalDays / nOps) * DAY
  }));
  const sb = mkSandbox({ _shopfloor: null, _ops: ops, _projectEnd: BASE_TS + totalDays * DAY });
  vm.runInContext('__computeSCurve()', sb);
  const pts = sb._sCurveData;
  assert(pts && pts.length > 0, 'W-SHOP-SCURVE-5: fallback generates points');
  assert(!('Material' in (pts[0] || {})), 'W-SHOP-SCURVE-5: fallback points have no Material key (count-based)');
  assert('pct' in (pts[0] || {}), 'W-SHOP-SCURVE-5: fallback points have pct key');
  const last = pts[pts.length - 1];
  assert(Math.abs(last.pct - 100) < 0.1, 'W-SHOP-SCURVE-5: fallback ends at 100% (' + last.pct.toFixed(1) + '%)');
}

console.log('\n── W-SHOP-SCURVE: §SCURVE_COMPUTE log ──');
{
  const ops = [{ start_ts: BASE_TS, end_ts: BASE_TS + 100 * DAY }];
  const sb = mkSandbox({ _shopfloor: SF, _ops: ops, _projectEnd: BASE_TS + 200 * DAY });
  vm.runInContext('__computeSCurve()', sb);
  const computeLog = sb.__logs.find(l => l.includes('§SCURVE_COMPUTE'));
  assert(!!computeLog, 'W-SHOP-SCURVE-6: §SCURVE_COMPUTE log emitted');
  assert(computeLog && computeLog.includes('stacked=true'), 'W-SHOP-SCURVE-6: log shows stacked=true');
  assert(computeLog && computeLog.includes('orders=2'), 'W-SHOP-SCURVE-6: log shows orders=2');
  assert(computeLog && computeLog.includes('grandTotal=' + Math.round(GRAND_TOTAL)), 'W-SHOP-SCURVE-6: log shows grandTotal=' + Math.round(GRAND_TOTAL));
  console.log('  ' + computeLog);
}

// ── Summary ──
console.log('\n§SHOP_SCURVE WITNESS ' + (pass + fail) + ' checks — ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('FAILED'); process.exit(1); }
console.log('W-SHOP-SCURVE ALL PASS');

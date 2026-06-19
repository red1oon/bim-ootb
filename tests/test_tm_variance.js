/**
 * test_tm_variance.js — W-TM-VARIANCE: the budget-vs-actual variance logic in time_machine.js.
 * Whitebox (§-log first): extracts the PURE variance functions (no DOM/3D) from time_machine.js and runs them
 * on synthetic planned ops, proving: over-budget + late drama, Superstructure marquee blow-out, deterministic
 * (identical across runs), and _buildActualOps shifts every op later. Spec: GW_HOSPITAL_SHOWCASE_SPEC §ACTUAL.
 * Run: node tests/test_tm_variance.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  🟢 ' + msg); } else { fail++; console.log('  🔴 FAIL: ' + msg); } }

const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'time_machine.js'), 'utf8');
// slice the pure-logic span: from `var _DAY_MS` up to (but not including) `function _recomputeBounds`
const a = src.indexOf('var _DAY_MS = 86400000;');
const b = src.indexOf('function _recomputeBounds()');
if (a < 0 || b < 0 || b < a) { console.log('§TEST FAIL: could not locate variance logic span'); process.exit(1); }
const logic = src.slice(a, b);

// LABOR_RATES from rates.js (real cost basis) — same as the running app
const ratesSandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates.js'), 'utf8'), ratesSandbox);

const DAY = 86400000;
const base = new Date('2026-06-13T00:00:00Z').getTime();
// synthetic PLANNED ops — Hospital-like 6 phases, Superstructure the largest (many steel ops)
const PH = [
  ['Substructure', 'CONCRETE_GANG', 0, 90, 60],
  ['Superstructure', 'STEEL_ERECTOR', 90, 1100, 800],   // the big one
  ['MEP Rough-in', 'MEP_CREW', 1100, 1900, 300],
  ['Architecture', 'FINISHING_CREW', 1900, 2300, 250],
  ['MEP Final', 'MEP_CREW', 2300, 2420, 80],
  ['Finishes', 'FINISHING_CREW', 2420, 2480, 120],
];
const ops = [];
PH.forEach(function (p) {
  var name = p[0], res = p[1], d0 = p[2], d1 = p[3], cnt = p[4];
  for (var i = 0; i < cnt; i++) {
    var s = base + (d0 + (d1 - d0) * (i / cnt)) * DAY;
    ops.push({ start_ts: s, end_ts: s + 10 * DAY, op_type: 'ELEMENT_PLACE', parameters: { phase: name, resource: res, storey: 'L' + (i % 4) } });
  }
});

const sandbox = {
  window: { LABOR_RATES: ratesSandbox.LABOR_RATES || {} },
  _ops: ops, _opsPlanned: null, _projectStart: base, _projectEnd: base + 2480 * DAY,
  console: console,
};
vm.runInNewContext(logic + '\n; globalThis.__V = _computeVariance(); globalThis.__buildActual = _buildActualOps;', sandbox);
const V = sandbox.__V;
const actual = sandbox.__buildActual();

console.log('\n§TM_VARIANCE plannedCost=' + V.tP + ' actualCost=' + V.tA + ' over=' + V.pctOver + '% lateDays=' + V.lateDays + ' phases=' + V.phases.length + '\n');

assert(V.phases.length === 6, 'all 6 phases aggregated (' + V.phases.length + ')');
assert(V.tA > V.tP && V.pctOver > 0, 'OVER budget — drama (' + V.pctOver + '% over, +' + (V.tA - V.tP) + ')');
assert(V.lateDays > 0, 'finish runs LATE (' + V.lateDays + ' days)');
var sup = V.phases.find(function (p) { return p.phase === 'Superstructure'; });
assert(sup && sup.marquee === true, 'Superstructure flagged marquee');
var biggest = V.phases.slice().sort(function (x, y) { return y.dCost - x.dCost; })[0];
assert(biggest.phase === 'Superstructure', 'Superstructure is the biggest cost blow-out (+' + biggest.dCost + ')');
assert(V.phases.every(function (p) { return p.aStart >= p.pStart && p.aEnd >= p.pEnd; }), 'every phase actual ≥ planned (late, never early)');

// determinism — recompute and compare
const s2 = { window: sandbox.window, _ops: ops, _opsPlanned: null, _projectStart: base, _projectEnd: base + 2480 * DAY, console: { log: function () {} } };
vm.runInNewContext(logic + '\n; globalThis.__V2 = _computeVariance();', s2);
assert(s2.__V2.tA === V.tA && s2.__V2.tP === V.tP && s2.__V2.lateDays === V.lateDays, 'DETERMINISTIC — identical across runs');

// _buildActualOps shifts every op later, preserves count
assert(actual.length === ops.length, '_buildActualOps preserves op count (' + actual.length + ')');
assert(actual.every(function (o, i) { return o.start_ts > ops[i].start_ts && o.end_ts > ops[i].end_ts; }), '_buildActualOps shifts every op later');

console.log('\nphase breakdown:');
V.phases.forEach(function (p) { console.log('  ' + (p.marquee ? '⚠ ' : '  ') + p.phase.padEnd(15) + ' Δ' + p.dDays + 'd  Δcost=' + p.dCost); });

console.log('\nW-TM-VARIANCE ' + pass + '/' + (pass + fail));
fs.writeFileSync(path.join(__dirname, 'test_tm_variance.log'),
  '§TM_VARIANCE plannedCost=' + V.tP + ' actualCost=' + V.tA + ' over=' + V.pctOver + '% lateDays=' + V.lateDays + '\nW-TM-VARIANCE ' + pass + '/' + (pass + fail) + '\n');
process.exit(fail === 0 ? 0 : 1);

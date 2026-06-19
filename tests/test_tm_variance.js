/**
 * test_tm_variance.js — W-PC-TWIN-SOURCE + W-PC-DRAWER (TM_4D5D_VARIANCE_LANE §S1).
 *
 * ISSUE PROVEN: the ⚖ variance drawer must show the STORED twin (iDempiere C_Project/C_ProjectPhase
 *   PlannedAmt→CommittedAmt from erp/ad_seed.db), NOT a runtime recompute. The old WIP recomputed planned
 *   (LABOR_RATES×days) and actual (a hash variant) → it only CORRELATED with the records. This test reads the
 *   real stored numbers via sqlite3 (dependency-free), feeds them into the pure _computeVariance() sliced out
 *   of viewer/time_machine.js, and FALSIFIES drift: drawer total must equal the stored CommittedAmt EXACTLY.
 *
 * Whitebox (§-log first); no DOM/3D. Run: node tests/test_tm_variance.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  🟢 ' + msg); } else { fail++; console.log('  🔴 FAIL: ' + msg); } }

const ERP = path.join(__dirname, '..', 'erp', 'ad_seed.db');
function q(sql) { return execSync('sqlite3 -separator "|" "' + ERP + '" ' + JSON.stringify(sql), { encoding: 'utf8' }).trim(); }

// ── 1. Read the STORED twin straight from the seed (the source of truth the drawer must echo) ──
const projRow = q("SELECT C_Project_ID,PlannedAmt,CommittedAmt FROM C_Project WHERE Value='Hospital'").split('|');
const projId = Number(projRow[0]), storedPlanned = Number(projRow[1]), storedCommitted = Number(projRow[2]);
const phaseRows = q("SELECT Name,SeqNo,StartDate,EndDate,PlannedAmt,CommittedAmt FROM C_ProjectPhase WHERE C_Project_ID=" + projId + " AND Name<>'Unsequenced' ORDER BY SeqNo")
  .split('\n').filter(Boolean).map(function (l) {
    const c = l.split('|');
    return { name: c[0], seqno: Number(c[1]), start: Date.parse(c[2]), end: Date.parse(c[3]), planned: Number(c[4]), committed: Number(c[5]) };
  });
console.log('\n§TWIN_READ project=' + projId + ' planned=' + storedPlanned + ' committed=' + storedCommitted + ' phases=' + phaseRows.length);

// ── 2. Synthetic _ops covering the same phases (supplies the cursor-axis windows _computeVariance joins to) ──
const DAY = 86400000, base = Date.parse('2026-06-13T00:00:00Z');
const PHWIN = [
  ['Substructure', 0, 90], ['Superstructure', 90, 1100], ['MEP Rough-in', 1100, 1900],
  ['Architecture', 1900, 2300], ['MEP Final', 2300, 2420], ['Finishes', 2420, 2480],
];
// Sequential, non-overlapping windows — the typical injectGantt shape (phases run one after another). Each
// op stays inside its phase band so winEnd < next phase winStart (where windows DO overlap, the earlier
// seqno wins the phase-under-cursor lookup, by design — deterministic).
const ops = [];
PHWIN.forEach(function (p) {
  const span = p[2] - p[1], step = span / 20;
  for (let i = 0; i < 20; i++) {
    const s = base + (p[1] + step * i) * DAY;
    ops.push({ start_ts: s, end_ts: s + step * 0.8 * DAY, op_type: 'ELEMENT_PLACE', parameters: { phase: p[0] } });
  }
});

// ── 3. Slice the pure variance logic and run _computeVariance with the twin injected ──
const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'time_machine.js'), 'utf8');
const a = src.indexOf('var _DAY_MS = 86400000;');
const b = src.indexOf('function _recomputeBounds()');
if (a < 0 || b < 0 || b < a) { console.log('§TEST FAIL: could not locate variance logic span'); process.exit(1); }
const logic = src.slice(a, b);

function run() {
  const sandbox = {
    window: {}, A: function () { return null; }, fetch: undefined, Promise: Promise,
    _ops: ops, _opsPlanned: null, _projectStart: base, _projectEnd: base + 2480 * DAY,
    _cursor: base, console: { log: function () {} },
  };
  vm.runInNewContext(logic +
    '\n; _twin = { building:"Hospital", projectId:' + projId + ', planned:' + storedPlanned + ', committed:' + storedCommitted +
    ', phases:' + JSON.stringify(phaseRows) + ' };' +
    '\n; globalThis.__V = _computeVariance();', sandbox);
  return sandbox.__V;
}
const V = run();
console.log('§TM_VARIANCE source=twin plannedCost=' + V.tP + ' committedCost=' + V.tA + ' over=' + V.pctOver + '% phases=' + V.phases.length + '\n');

// ── W-PC-TWIN-SOURCE — the FALSIFIER: drawer numbers == stored records EXACTLY (not correlated) ──
assert(V.tA === storedCommitted, 'W-PC-TWIN-SOURCE: total == C_Project.CommittedAmt EXACTLY (' + V.tA + ' == ' + storedCommitted + ')');
assert(V.tP === storedPlanned, 'total planned == C_Project.PlannedAmt EXACTLY (' + V.tP + ' == ' + storedPlanned + ')');
const sumA = phaseRows.reduce(function (s, p) { return s + p.committed; }, 0);
assert(sumA === storedCommitted, 'Σ phase CommittedAmt rolls up to project total (' + sumA + ')');
assert(V.phases.every(function (p) {
  const tp = phaseRows.find(function (x) { return x.name === p.phase; });
  return tp && p.aCost === tp.committed && p.pCost === tp.planned;
}), 'every phase shows its STORED committed/planned (no recompute)');

// honest, realistic mixed signs — this is records, not a fabricated always-over drama
const sup = V.phases.find(function (p) { return p.phase === 'Superstructure'; });
assert(sup && sup.marquee === true && sup.dCost > 0, 'Superstructure is the marquee blow-out (+' + sup.pct + '%, +' + sup.dCost + ')');
const mep = V.phases.find(function (p) { return p.phase === 'MEP Rough-in'; });
const fin = V.phases.find(function (p) { return p.phase === 'Finishes'; });
assert(mep && mep.dCost < 0, 'MEP Rough-in is UNDER budget — honest mixed sign (' + mep.pct + '%)');
assert(fin && fin.dCost < 0, 'Finishes is UNDER budget — honest mixed sign (' + fin.pct + '%)');
assert(!V.phases.every(function (p) { return p.dCost > 0; }), 'NOT every phase over — proves these are records, not a hash variant');

// determinism — same input → identical output
const V2 = run();
assert(V2.tA === V.tA && V2.tP === V.tP && V2.phases.length === V.phases.length, 'DETERMINISTIC — identical across runs');

// ── W-PC-DRAWER — the cursor-tracking data: every phase has a usable window; cursor maps to its phase ──
assert(V.phases.every(function (p) { return isFinite(p.winStart) && isFinite(p.winEnd) && p.winStart <= p.winEnd; }), 'W-PC-DRAWER: every phase carries a finite gantt window (winStart ≤ winEnd)');
function phaseAt(cursor) { for (let i = 0; i < V.phases.length; i++) { const p = V.phases[i]; if (cursor >= p.winStart && cursor <= p.winEnd) return p.phase; } return null; }
const midSup = (sup.winStart + sup.winEnd) / 2;
assert(phaseAt(midSup) === 'Superstructure', 'cursor inside Superstructure window resolves to Superstructure (phase-under-cursor)');
assert(phaseAt(fin.winStart) === 'Finishes', 'tap-to-jump target (winStart) lands inside its own phase');
assert(V.phases.every(function (p) { return phaseAt(p.winStart) === p.phase; }), 'every phase winStart maps back to that phase (reciprocal tap)');

console.log('\nphase breakdown (from records):');
V.phases.forEach(function (p) { console.log('  ' + (p.marquee ? '⚠ ' : '  ') + p.phase.padEnd(15) + ' planned=' + p.pCost + ' committed=' + p.aCost + '  Δ=' + (p.dCost >= 0 ? '+' : '') + p.dCost + ' (' + (p.pct >= 0 ? '+' : '') + p.pct + '%)'); });

console.log('\nW-PC-TWIN-SOURCE + W-PC-DRAWER ' + pass + '/' + (pass + fail));
fs.writeFileSync(path.join(__dirname, 'test_tm_variance.log'),
  '§TM_VARIANCE source=twin plannedCost=' + V.tP + ' committedCost=' + V.tA + ' over=' + V.pctOver + '%\n' +
  'W-PC-TWIN-SOURCE + W-PC-DRAWER ' + pass + '/' + (pass + fail) + '\n');
process.exit(fail === 0 ? 0 : 1);

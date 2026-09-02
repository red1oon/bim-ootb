// witness_gantt_ops_blackbox.js — headless, no browser. The "black box output log" requested
// 2026-08-04: dump the deterministic Gantt op population in build order (first pile knocked, last
// thing built) so a session can READ what the chart will draw instead of screenshotting it.
//
// Regression guard for §GANTT_OPS_BOOKKEEPING_LEAK, found by reading source (not guessed), chain:
//   1. streaming.js:812   commitOp(db,'BUILDING_OPEN',{name,count},[])  — no ts passed
//   2. kernel_ops.js:83   commitOp defaults stamp = Date.now() when ts is omitted — REAL wall-clock,
//      not a simulated construction date
//   3. time_machine.js loadOps() intentionally has NO op_type filter (copyGuids(false) legitimately
//      wants the full mixed kernel_ops history — picks, GRID_*, etc. — so the fix does not belong
//      in the query)
//   4. Pre-fix, computeDays()/buildGanttTasks() consumed that full mixed _ops directly: a missing
//      storey/phase defaulted to '_UNKNOWN'/'Architecture' (the exact bucket the live session traced
//      as "the one outlier bar" behind §GANTT_AXIS_OUTLIER, PR #1175), and Math.max over ALL ops'
//      end_ts let BUILDING_OPEN's real-wall-clock timestamp define _projectEnd — the REAL playback
//      bounds (scrubbing, "every element must eventually build"), not just the display axis #1175
//      qualified.
//
// This witness slices `_placeOps`+`computeDays` OUT OF THE SHIPPED FILE (same idiom as
// tests/test_tm_broadcast.js) and runs the REAL function against a synthetic op population — not a
// re-implementation. G-3/G-4 below fail if the filter is ever removed from computeDays().
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const src = fs.readFileSync(path.join(__dirname, 'viewer', 'time_machine.js'), 'utf8');
const a = src.indexOf('function _placeOps()');
const b = src.indexOf('\n  }', src.indexOf('function computeDays()')) + 4;
if (a < 0 || b < a) { console.log('§BLACKBOX FAIL: could not locate _placeOps/computeDays span'); process.exit(1); }
const logic = src.slice(a, b);

const DAY = 86400000, base = Date.parse('2023-09-20T00:00:00Z');
// Real construction ops — same shape loadOps() returns for op_type='ELEMENT_PLACE' rows.
const realOps = [];
for (let i = 0; i < 40; i++) {
  const s = base + i * 8 * DAY;
  realOps.push({ op_type: 'ELEMENT_PLACE', output_guid: 'G' + i, start_ts: s, end_ts: s + 8 * DAY,
    parameters: { storey: 'Level ' + (1 + (i % 5)), phase: 'Superstructure' } });
}
const realProjectEnd = Math.max.apply(null, realOps.map(o => o.end_ts));

// The exact shape streaming.js:812's commitOp('BUILDING_OPEN', {name,count}, []) produces once
// loadOps() reads it back: no storey/phase, real wall-clock timestamp (here fixed, not Date.now(),
// so the witness stays reproducible — same class of value, chosen far past any building's
// simulated window, same as the live symptom).
const bookkeepingOp = { op_type: 'BUILDING_OPEN', output_guid: null,
  start_ts: Date.parse('2026-08-04T05:00:00Z'), end_ts: Date.parse('2026-08-04T05:01:00Z'),
  parameters: {} };

function mkSandbox(ops) {
  const s = { _ops: ops, _days: [], _projectStart: 0, _projectEnd: 0, _ganttAxisStart: 0, _ganttAxisEnd: 0,
    Object: Object, Math: Math, Date: Date };
  vm.runInNewContext(logic + '\n; globalThis.__placeOps=_placeOps; globalThis.__computeDays=computeDays; ' +
    'globalThis.__get=function(){return {ps:_projectStart,pe:_projectEnd,as:_ganttAxisStart,ae:_ganttAxisEnd,days:_days.length};};', s);
  return s;
}

// ── G-1: bounds are correct with construction-only ops (baseline, no pollution) ──
const sbClean = mkSandbox(realOps.slice());
sbClean.__computeDays();
const clean = sbClean.__get();
assert(clean.pe === realProjectEnd, 'G-1 clean _projectEnd equals the real construction max end_ts');

// ── G-2/G-3: bounds are UNCHANGED by a bookkeeping op mixed in — THE regression gate ──
const pollutedList = realOps.slice(); pollutedList.push(bookkeepingOp);
pollutedList.sort((x, y) => x.start_ts - y.start_ts);
const sbPolluted = mkSandbox(pollutedList);
sbPolluted.__computeDays();
const polluted = sbPolluted.__get();
assert(polluted.pe === realProjectEnd,
  'G-2 _projectEnd (REAL playback bounds) ignores BUILDING_OPEN — was ' +
  (polluted.pe === bookkeepingOp.end_ts ? 'WRONGLY equal to the bookkeeping op\'s wall-clock end' : 'correct') +
  ` (real=${new Date(realProjectEnd).toISOString().slice(0,10)} got=${new Date(polluted.pe).toISOString().slice(0,10)})`);
assert(polluted.ae <= realProjectEnd,
  'G-3 _ganttAxisEnd (DISPLAY axis) also ignores it — axis=' + new Date(polluted.ae).toISOString().slice(0,10));
assert(polluted.days === clean.days,
  'G-4 _days (DAY-mode slider granularity) unaffected by the bookkeeping op — days=' + polluted.days);

// ── G-5: _placeOps itself is the actual filter mechanism, not a side effect ──
const filtered = sbPolluted.__placeOps();
assert(filtered.length === realOps.length && filtered.every(o => o.op_type === 'ELEMENT_PLACE'),
  'G-5 _placeOps() returns exactly the ELEMENT_PLACE subset — n=' + filtered.length);

// ── G-6 static: loadOps() itself still has NO op_type filter — the fix must stay scoped to
// computeDays/buildGanttTasks, not the query (copyGuids(false) legitimately needs the full history).
const loadOpsSrc = src.slice(src.indexOf('function loadOps()'), src.indexOf('function computeDays()'));
assert(/FROM kernel_ops WHERE undone = 0 ORDER BY timestamp/.test(loadOpsSrc),
  'G-6 loadOps() query stays unfiltered — copyGuids(false) still sees the full op history');

// ── G-7 static: buildGanttTasks() carries the same guard (not sliced — needs buildTaskIndex/app.db) ──
const bgtSrc = src.slice(src.indexOf('function buildGanttTasks()'), src.indexOf('function buildGanttTasks()') + 800);
assert(/op\.op_type !== 'ELEMENT_PLACE'/.test(bgtSrc),
  'G-7 buildGanttTasks() skips non-ELEMENT_PLACE ops before grouping into bars');

console.log('\n--- black-box build order (polluted population, as loadOps() actually returns it) ---');
pollutedList.forEach((o, i) => {
  const flag = o.op_type !== 'ELEMENT_PLACE' ? '  <-- NOT A CONSTRUCTION OP' : '';
  console.log(`  #${i + 1} ${o.op_type} guid=${o.output_guid || '(none)'} ` +
    `storey=${(o.parameters||{}).storey || '_UNKNOWN'} start=${new Date(o.start_ts).toISOString().slice(0,10)}${flag}`);
});

console.log(`\n§BLACKBOX SUMMARY pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

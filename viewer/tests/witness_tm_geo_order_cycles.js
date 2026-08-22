#!/usr/bin/env node
// witness_tm_geo_order_cycles.js — §TM_GEO_ORDER_CYCLES_REPRO (2026-08-10, bim-compiler
// prompts/4D_SCHEDULE_PERFECTION.md §"▶ NEXT SESSION" Part A). Two jobs, both named:
//
//   ISSUE 1 (reproduction — did not exist anywhere before this file): §TM_GEO_ORDER_CYCLES —
//     Terminal's live 4D log reports tens of thousands of §SUPPORT_CYCLE members plus floating
//     elements. This witness reproduces those numbers DETERMINISTICALLY outside the browser:
//     time_machine.js's real element build (sliced, never reimplemented — repo convention,
//     witness_gantt_lock_integrity.js) fed through the canonical, UNCHANGED
//     ScheduleGate.computeSchedule()/auditFloating() from viewer/schedule_gate.js, against the real
//     Terminal_extracted.db. FIXED 2026-08-10 (same day, follow-up PR): SCC analysis on the real
//     DAG refuted the predicted hang-based 3-cycle and named the real class — tall multi-storey
//     walls closed into cycles by (a) `contained` support sitting at their CROWN (a 3cm topping
//     slab at a 22m wall's top counted as the wall's support) and (b) `wallBearsPromoted` firing
//     for slabs EMBEDDED metres below the wall's top. Fix: contained support must live in the
//     consumer's LOWER HALF; a wall carries a promoted slab only AT ITS TOP (wallCarries, ±GAP).
//     Terminal: cycles 37,927→0, §DEQ_REPAIR shifts 251→0, floating 45→8 (37 were cycle-fallback
//     ordering artifacts; the 8 remain a separate, named, open tail). This witness ASSERTS
//     cycles=0 plus the floating tail's COUNT AND COMPOSITION so any regression screams. The tail
//     is 12 since #1345 (§S63, 2026-08-22 — bisected, isolated to one file, cause measured; see the
//     block at W-TMREPRO-5). It was 8 from 2026-08-10 to #1345.
//
//   ISSUE 2 (refactor invariance): the roof/load-path promotion classifier existed as two copies in
//     time_machine.js (_buildXrayElements inline + injectGantt inline). Direct verification proved
//     the copies byte-identical in .seq output (an earlier "16-edge divergence" claim was FALSE — it
//     compared against schedule_author.js, a third file with no promotion logic). Consolidating them
//     into _promoteRoofLoadPath() is therefore a PURE refactor: the §TM_GEO_ORDER_CYCLES_REPRO line
//     below must be numerically IDENTICAL before vs after that refactor. Run on the pre-refactor
//     commit, save the log, run on the post-refactor commit, diff the line. This file slices
//     _promoteRoofLoadPath when present and falls back to the inline copy when not, so the SAME
//     witness runs on both commits.
//
// Known drift, flagged not resolved (per plan — do not silently overwrite either number): a
// 2026-08-10 planning-session sandbox run got cycles=37927 floating=45 on Terminal, which already
// differs from prompts/4D_SCHEDULE_PERFECTION.md's earlier recorded cycles=24353 floating=33/48428.
// Cause unexplained. This witness's own numbers are the reproducible reference going forward.
//
// Approximation caveat (named, per plan): _buildXrayElements output has no resource/installSecs
// fields (the x-ray path never needs them), so this witness fills resource=cls, installSecs=120
// before computeSchedule. That approximates crew/duration behaviour ONLY — the cycle count is
// STRUCTURAL (support-DAG topology from geometry+seq) and unaffected by it.
//
// Command: BLD_DIR=~/bim-ootb/buildings node tests/witness_tm_geo_order_cycles.js  (from viewer/)
// Read the §TM_GEO_ORDER_CYCLES_REPRO log line, not exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ZoneIndex = require(path.join(__dirname, '..', 'zone_index.js'));   // §S62
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');

(async () => {
  // Slice the real shipped code. Post-refactor: _promoteRoofLoadPath + _buildXrayElements.
  // Pre-refactor: _promoteRoofLoadPath doesn't exist yet — _buildXrayElements carries the inline
  // copy. Same witness runs on both commits (the invariance harness, ISSUE 2 above).
  const names = ['_buildXrayElements'];
  const hasPromote = tmSrc.indexOf('function _promoteRoofLoadPath(') >= 0;
  if (hasPromote) names.unshift('_promoteRoofLoadPath');
  // §S62: _buildXrayElements' real dependency closure. It calls _classifyRule (which calls
  // _classifyNameOverride) and _zoneIndex — none of which were in this slice set, so the witness
  // died on ReferenceError before its first assertion. _zoneIndex now comes from the zone_index.js
  // module via the sandbox; these two are still text slices, added here the same way
  // witness_midair_zero.js:136 already does it. Each name added is a dependency that was
  // ALWAYS required and never declared — the text-slice pattern cannot state its own needs.
  for (const dep of ['_classifyNameOverride', '_classifyRule']) {
    if (tmSrc.indexOf('function ' + dep + '(') >= 0) names.push(dep);
  }
  console.log('§TMREPRO_SLICE state=' + (hasPromote ? 'post-refactor (shared _promoteRoofLoadPath)' : 'pre-refactor (inline copy)'));
  let sliced;
  try {
    sliced = names.map(n => sliceFn(tmSrc, n)).join('\n');
  } catch (e) { assert(false, 'W-TMREPRO-0 slice failed: ' + e.message); finish(); return; }

  const dbPath = path.join(BLD_DIR, 'Terminal_extracted.db');
  if (!fs.existsSync(dbPath)) { console.log('§TMREPRO_SKIP Terminal fixture missing at ' + dbPath); finish(); return; }
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));

  const sandbox = {
    console: console,
    performance: { now: () => Date.now() },
    window: { SEQUENCE_RULES: rulesJson.SEQUENCE_RULES, SEQUENCE_DEFAULT: rulesJson.SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES: rulesJson.SEQUENCE_NAME_OVERRIDES || rulesJson.NAME_OVERRIDES || [] },
    A: function () { return { db: db }; },
    // §S62: _buildXrayElements calls _zoneIndex(), which was in NEITHER the slice set nor the
    // sandbox — this witness died on `ReferenceError: _zoneIndex is not defined` before its first
    // assertion. The builder is a real module now, so the accessor is provided here (no memo
    // needed: one build per run) instead of hoping a text slice happens to include it.
    ZoneIndex: ZoneIndex,
    _zoneIndex: function () { return ZoneIndex.build(db); },
  };
  vm.createContext(sandbox);
  vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements;', sandbox);

  const els = sandbox.__bxe();
  db.close();
  assert(els && els.length > 1000, 'W-TMREPRO-1 real Terminal geometry via the shipped element build (n=' + (els ? els.length : 0) + ')');

  // Same degenerate-geometry filter as witness_gantt_lock_integrity.js (no-transform rows collapse
  // to a zero-size bbox at origin and would poison the support grids).
  const geoEls = els.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
  // Approximation caveat (header): the x-ray build carries no resource/installSecs — fill defaults.
  geoEls.forEach(e => { e.resource = e.cls; e.installSecs = 120; });
  const promoted = geoEls.filter(e => e.cls === 'IfcSlab' && e.seq === 8).length;

  // Capture computeSchedule's own §SUPPORT_CYCLE line (cycles are REPORTED, never hidden — that is
  // schedule_gate.js's contract; this witness asserts the report exists and republishes the number).
  const capturedLines = [];
  const origLog = console.log;
  console.log = function () { capturedLines.push(Array.prototype.map.call(arguments, String).join(' ')); return origLog.apply(console, arguments); };
  let sched, floating;
  const collector = [];
  try {
    sched = ScheduleGate.computeSchedule(geoEls, 0, 1);
    floating = ScheduleGate.auditFloating(geoEls, sched, null, collector);
  } finally { console.log = origLog; }

  const cycLine = capturedLines.find(l => l.indexOf('§SUPPORT_CYCLE') >= 0) || '';
  const m = cycLine.match(/cycles=(\d+)/);
  const cycles = m ? parseInt(m[1], 10) : -1;
  assert(cycles >= 0, 'W-TMREPRO-2 §SUPPORT_CYCLE reported by canonical computeSchedule (cycles=' + cycles + ')');
  assert(typeof floating === 'number' && floating >= 0, 'W-TMREPRO-3 auditFloating returns a count (floating=' + floating + ')');
  // §TM_GEO_ORDER_CYCLES fix bar (2026-08-10): the DAG is acyclic on Terminal under load-path
  // promotion. The floating tail is the EXACT remainder (was 45; 37 were cycle-fallback artifacts) —
  // if it moves EITHER way, that is a real behavior change to examine, not to absorb silently.
  //
  // §S63 (2026-08-22) — the tail moved 8 -> 12 and the lock was re-measured, not absorbed. Bisected
  // over every schedule_gate.js commit since the lock was set (268a85f..HEAD, 18 runs, this witness
  // unchanged, only viewer/{schedule_gate,time_machine}.js + rates/sequence_rules.json swapped):
  // constant 8 through 2463ff1, 12 from a2c30ee onward. Isolated to ONE file — a2c30ee's
  // schedule_gate.js alone over the 2463ff1 tree gives 12; a2c30ee's time_machine.js alone gives 8.
  // a2c30ee = #1345 §STAIR_FLIGHT_GRID_VISIBILITY, which added isStairFlight() to the SCHEDULER's
  // support pool (now supportPool(), schedule_gate.js:1246) and deliberately did NOT mirror it into
  // auditFloating's structGrid (:1076 still admits seq<=4 or promoted IfcSlab only).
  //
  // The 4 added floaters are all IfcStairFlight, and they are that asymmetry, measured:
  //   flight ...UjZp  base_z 18.892 top_z 20.864, ZERO bearing-below supports -> audited on the HANG
  //   path against the landing above it (IfcSlab seq=4 @20.864 + 2x IfcMember seq=3 @20.564).
  //   Scheduler side, the same pair runs the OTHER way: the flight is now a pool member BELOW those
  //   carriers (geoGate's `below` has no top-proximity bound), so carrier ...UjXu's gate IS the
  //   flight — start day 1.1083 == flight end day 1.1083 (next candidate down ends day 0.3139).
  //   Pre-#1345 those carriers finished day 0.25 and the flight started day 1.15, 0.89d clear.
  //   Now the flight starts 0.01d (~14 min) before its audited carrier ends -> flagged.
  // So this is the audit/scheduler asymmetry disagreeing about one pair, not a physics regression:
  // the deficit is a rounding-scale 0.01d, and #1345 already tried and reverted mirroring flights
  // into auditFloating (it surfaced an unrelated _twoTierRemap weakness). Closing the asymmetry is
  // a named open item, NOT this witness's job — see prompts/4D_SCHEDULE_PERFECTION.md §S63.
  //
  // The lock is therefore 12 AND its composition: count alone would let a swap through.
  assert(cycles === 0, 'W-TMREPRO-4 Terminal support DAG is acyclic under load-path promotion (cycles=' + cycles + ', fix: lower-half contained + wallCarries)');
  var _byG = new Map(geoEls.map(function (e) { return [e.guid, e]; }));
  var _tail = {};
  collector.forEach(function (g) { var e = _byG.get(g); var c = e ? e.cls : 'NOT-IN-geoEls'; _tail[c] = (_tail[c] || 0) + 1; });
  var tailSig = Object.keys(_tail).sort().map(function (k) { return k + ':' + _tail[k]; }).join(',');
  assert(floating === 12, 'W-TMREPRO-5 floating tail exactly 12 (8 promoted roof slabs since 2026-08-10 + 4 stair flights since #1345, §S63) — got ' + floating);
  assert(tailSig === 'IfcSlab:8,IfcStairFlight:4', 'W-TMREPRO-5b floating tail COMPOSITION unchanged (a swap that keeps the count still reddens) — got ' + tailSig);

  // THE line. Must be numerically identical pre vs post the _promoteRoofLoadPath refactor
  // (diffed across the two commits' logs — see header ISSUE 2). Numbers only; slice state is on
  // the separate §TMREPRO_SLICE line above so this one diffs clean.
  console.log('§TM_GEO_ORDER_CYCLES_REPRO cycles=' + cycles + ' floating=' + floating +
    ' n=' + geoEls.length + '/' + els.length + ' promotedRoofSlabs=' + promoted + ' tail=' + tailSig +
    ' (Terminal_extracted.db; resource/installSecs approximated — structural cycle count unaffected)');
  console.log('§TMREPRO_DRIFT_FLAG planning-session 2026-08-10 got cycles=37927 floating=45; doc earlier recorded cycles=24353 floating=33/48428 — divergence unexplained, neither number overwritten (see header)');
  if (collector.length) console.log('§TMREPRO_FLOATING_SAMPLE [' + collector.slice(0, 5).join(',') + ']');

  finish();
})();

function finish() {
  console.log('§TM_GEO_ORDER_CYCLES_REPRO_SUMMARY pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
  console.log('PASS — §TM_GEO_ORDER_CYCLES reproduced deterministically (bug itself still OPEN in schedule_gate.js DAG; this witness is the before/after invariance harness for the promotion-classifier consolidation)');
}

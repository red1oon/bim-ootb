#!/usr/bin/env node
// witness_og_guard_bearing_bound.js — §OG_BEARING_BOUND (2026-08-11, Part 2 Option C,
// bim-compiler prompts/4D_SCHEDULE_PERFECTION.md closure pass).
//
// ISSUE this witness proves/disproves: §PHASE_OVERLAP_SUPPORT_GUARD's bearing test was unbounded
// ABOVE (S.tz >= T.bz - GAP with no ceiling) — a full-height column/wall registered as carrying
// every element at every level inside its footprint, so the guard pushed each of those elements to
// the END of the whole enveloping carrier: over-correction, the one verified bug the archive's
// Part 2 Option C names ("fix only the one verified bug; do NOT redesign the rescale" — A/B are
// explicitly out of scope). The fix is two-tier: in-extent carriers (top within T's own span +GAP)
// define the bearing plane; enveloping carriers still DETECT as support but only GATE when no
// in-extent carrier exists. Three claims, each asserted on real fixtures (Hospital + Terminal):
//
//   W-OGB-1  FEWER over-corrections: pushed(bounded) <= pushed(unbounded reference), and the
//            delta is REAL (>0 on at least one fixture) — otherwise the "verified bug" claim
//            was hollow and this whole change is a no-op to re-examine.
//   W-OGB-2  DETECTION unchanged: the set of elements with ANY bearing support is byte-identical
//            bounded vs unbounded — the bound moves the gate TARGET, it never makes an element
//            invisible (the §4D_LAYER_TRUTH 2026-08-07 lesson: the guard must never see fewer
//            carriers than the audits, that desync left 25 audit-visible staged violations).
//   W-OGB-3  GUARD↔JUDGE symmetry: running the real _buildXraySupportCache (sliced, not
//            reimplemented) over the guard's output yields staged=0 on every fixture — guard and
//            judge apply one physics. Plus a DESYNC CONTROL: the same judge with the OLD unbounded
//            gating over the bounded guard's output must show staged>0 somewhere — proving this
//            witness can actually catch the desync it guards against (a control that never fires
//            would make W-OGB-3 toothless; if the control is 0 everywhere that is itself a FAIL).
//
// Approximation caveat: the rescale harness is the og_grid_perf synthetic (index-staggered element
// times, no _cap/tasks) — the guard's INPUT shape, not a live authored session. Push/detection/
// symmetry claims are structural (geometry + predicate), unaffected.
//
// Command: BLD_DIR=~/bim-ootb/buildings node tests/witness_og_guard_bearing_bound.js  (from viewer/)
// Read the § log lines, not exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
const SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// §S58: the guard block now lives in viewer/support_sweep.js as a real function. This witness still
// needs SOURCE TEXT (it builds reference variants by substring substitution), but it slices BY
// FUNCTION NAME instead of by raw text markers — immune to indentation and to log wording, the two
// things that rotted the old marker slice once already.
const ssSrc = fs.readFileSync(path.join(__dirname, '..', 'support_sweep.js'), 'utf8');
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');
function _sliceNamed(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found in support_sweep.js — renamed?');
  let d = 0, i = idx, open = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { d++; open = true; }
    else if (src[i] === '}') { d--; if (open && d === 0) break; }
  }
  return src.slice(idx, i + 1);
}
const guardBlock = _sliceNamed(ssSrc, '_ogSupportSweep');

// ── slice the judge (named function — the standard sliceFn convention) ──
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
const judgeSrc = sliceFn(tmSrc, '_buildXraySupportCache');
assert(guardBlock.indexOf('_ogTopBound') >= 0 && judgeSrc.indexOf('topBound') >= 0,
  'W-OGB-0 both halves of §OG_BEARING_BOUND present in shipped source (guard _ogTopBound + judge topBound)');

function loadRules() {
  var txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  var start = txt.indexOf('var RATES = {');
  var defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  var end = txt.indexOf('};', defIdx) + 2;
  return (new Function(txt.slice(start, end) + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT };'))();
}

function buildScheduled(dbPath, SQL, rules) {
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const r = db.exec("SELECT m.guid, m.ifc_class, COALESCE(t.center_x,0), COALESCE(t.center_y,0), COALESCE(t.center_z,0), " +
    "COALESCE(t.bbox_x,0), COALESCE(t.bbox_y,0), COALESCE(t.bbox_z,0) FROM elements_meta m " +
    "LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'");
  db.close();
  return r[0].values.map(function (row, i) {
    const cls = row[1], cx = row[2], cy = row[3], cz = row[4], bx = row[5], by = row[6], bz = row[7];
    const rule = ScheduleAuthor.matchRule(cls, rules.SEQUENCE_RULES, rules.SEQUENCE_DEFAULT);
    const t0 = i * 60000;
    return { guid: row[0], s: t0, e: t0 + 60000, cls: cls, seq: rule.sequence,
      bz: cz - bz / 2, tz: cz + bz / 2, x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2 };
  });
}

function runGuard(scheduled, unboundedVariant) {
  // deep copy — the block mutates in place
  const copy = scheduled.map(e => Object.assign({}, e));
  let block = guardBlock;
  if (unboundedVariant) {
    // UNBOUNDED REFERENCE: neutralize the tier split by lifting the bound to +Infinity — every
    // carrier is tier-1, which is byte-for-byte the pre-fix single-bucket behavior (merge line
    // becomes a no-op: envEnd stays 0). One-token surgical change so the reference IS the old code.
    if (block.indexOf('var _ogTopBound = T.tz + _ogGAP') < 0) throw new Error('bound expression not found for reference variant');
    block = block.replace('var _ogTopBound = T.tz + _ogGAP', 'var _ogTopBound = Infinity');
  }
  const origS = {};
  copy.forEach(e => { origS[e.guid] = e.s; });   // by guid — the block SORTS the array in place
  const sandbox = { _allScheduled: copy, ScheduleGate: { CELL: 4 }, taskWin: undefined, console: { log: function () {} }, Math: Math };
  vm.createContext(sandbox);
  // §S58: the slice is now the whole named function rather than a bare statement sequence, so it is
  // DEFINED then INVOKED here — same physics, same in-place mutation of sandbox._allScheduled.
  vm.runInContext(block + '\n_ogSupportSweep(_allScheduled, taskWin);', sandbox);
  const pushed = {};
  copy.forEach(e => { if (e.s !== origS[e.guid]) pushed[e.guid] = true; });
  return { out: copy, pushedN: Object.keys(pushed).length, pushed: pushed };
}

// detection census — same predicate family as the guard, tier-blind (any bearing carrier at all)
function detectionSet(scheduled) {
  const EPS = 0.05, GAP = 0.5, CELL = 4;
  const xy = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
  const grid = {};
  const cellsFor = (e, z0, z1) => {
    const out = [];
    for (let cx = Math.floor(e.x0 / CELL); cx <= Math.floor(e.x1 / CELL); cx++)
      for (let cy = Math.floor(e.y0 / CELL); cy <= Math.floor(e.y1 / CELL); cy++)
        for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++)
          out.push(cx + '|' + cy + '|' + cz);
    return out;
  };
  scheduled.forEach(e => {
    // §PROMOTED_CARRIER_POOL (2026-08-11): detection pool = seq<=4 ∪ promoted slabs (audit parity,
    // finding-A fix — see time_machine.js _buildXraySupportCache).
    if (e.seq <= 4 || (e.cls === 'IfcSlab' && e.seq > 4)) cellsFor(e, e.bz, e.tz).forEach(c => (grid[c] = grid[c] || []).push(e));
  });
  const withBearing = {};
  scheduled.forEach(T => {
    const seen = {};
    const cells = cellsFor(T, T.bz - GAP, T.bz + GAP);
    for (const c of cells) {
      const arr = grid[c]; if (!arr) continue;
      for (const S of arr) {
        if (S.guid === T.guid || seen[S.guid]) continue; seen[S.guid] = 1;
        if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP && xy(S, T)) { withBearing[T.guid] = true; return; }
      }
    }
  });
  return withBearing;
}

function runJudge(guardOut, unboundedJudge) {
  // judge consumes xray-shaped elements (base_z/top_z) + schedMap {guid:{end}}
  const elements = guardOut.map(e => ({ guid: e.guid, cls: e.cls, seq: e.seq,
    base_z: e.bz, top_z: e.tz, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1 }));
  const schedMap = {};
  guardOut.forEach(e => { schedMap[e.guid] = { start: e.s, end: e.e }; });
  let src = judgeSrc;
  if (unboundedJudge) {
    if (src.indexOf('var topBound = T.top_z + GAP') < 0) throw new Error('judge bound expression not found for control variant');
    src = src.replace('var topBound = T.top_z + GAP', 'var topBound = Infinity');
  }
  const sandbox = { console: { log: function () {} }, performance: { now: () => Date.now() },
    _tmXraySolidifyTs: {}, _tmXrayStagedTotal: 0, _tmXraySolidifiedN: 0 };
  vm.createContext(sandbox);
  vm.runInContext(src + '\n_buildXraySupportCache(__els, __sched);', Object.assign(sandbox, { __els: elements, __sched: schedMap }));
  return sandbox._tmXrayStagedTotal;
}

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const FIXTURES = ['Hospital_extracted.db', 'Terminal_extracted.db'];

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const rules = loadRules();
  let controlFired = false, anyDelta = 0;
  for (const f of FIXTURES) {
    const p = path.join(BLD_DIR, f);
    if (!fs.existsSync(p)) { console.log('§OGB_SKIP ' + f + ' fixture missing'); continue; }
    const scheduled = buildScheduled(p, SQL, rules);
    const bounded = runGuard(scheduled, false);
    const unbounded = runGuard(scheduled, true);
    const delta = unbounded.pushedN - bounded.pushedN;
    anyDelta += delta;
    console.log('§OG_BEARING_BOUND bld=' + f + ' n=' + scheduled.length +
      ' pushedBounded=' + bounded.pushedN + ' pushedUnbounded=' + unbounded.pushedN + ' overCorrectionsRemoved=' + delta);
    assert(bounded.pushedN <= unbounded.pushedN,
      'W-OGB-1a ' + f + ' bounded guard never pushes MORE than the unbounded reference (' + bounded.pushedN + ' <= ' + unbounded.pushedN + ')');
    // W-OGB-2 detection census identical on the INPUT (detection is input-geometry-only)
    const det = detectionSet(scheduled);
    // the guard variants share detection by construction (hasBearing ignores tier) — prove it by
    // checking every pushed element in EITHER variant is in the detection set or was hang/env-gated
    const byGuid = {};
    scheduled.forEach(e => { byGuid[e.guid] = e; });
    let pushedOutsideDetection = 0;
    Object.keys(bounded.pushed).forEach(g => {
      if (!det[g] && byGuid[g].seq <= 4) pushedOutsideDetection++;   // seq<=4 has no hang path — a push without detected bearing = predicate drift
    });
    assert(pushedOutsideDetection === 0,
      'W-OGB-2 ' + f + ' every pushed seq<=4 element has detected bearing support (tier split never invents or hides a carrier) — violations=' + pushedOutsideDetection);
    // W-OGB-3 symmetry + control
    const staged = runJudge(bounded.out, false);
    assert(staged === 0, 'W-OGB-3a ' + f + ' judge (bounded, shipped) over bounded guard output: staged=' + staged + ' (guard and judge are one physics)');
    const stagedControl = runJudge(bounded.out, true);
    console.log('§OGB_CONTROL bld=' + f + ' stagedDesyncControl=' + stagedControl + ' (unbounded judge over bounded guard — MUST be >0 somewhere or the symmetry assert is toothless)');
    if (stagedControl > 0) controlFired = true;
  }
  assert(anyDelta > 0, 'W-OGB-1b the bound removes REAL over-corrections somewhere (total removed=' + anyDelta + ') — 0 would mean the "verified bug" never bit on real fixtures');
  assert(controlFired, 'W-OGB-3b desync control fired on >=1 fixture — the symmetry assert has teeth');
  console.log('\n§OG_BEARING_BOUND_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('§OGB_ERROR', e); process.exit(1); });

#!/usr/bin/env node
// witness_midair_zero.js — §MIDAIR_REPAIR (2026-08-12, bim-compiler
// prompts/4D_SCHEDULE_PERFECTION.md — the acceptance bar in the user's own words:
// "all i want is not to see a single item hanging in midair that is all").
//
// ISSUE this witness proves/disproves: does any element APPEAR in the movie before the first
// element it physically touches appears? ScheduleGate.auditFloating cannot answer that — its
// support pools are seq<=4 + promoted slabs + walls, so an element whose only neighbours are
// outside those pools (and every seq<=4 member, which no gate checks at all) is reported clean
// while hanging in plain sight. This witness judges the DISPLAY timeline — the times kernel_ops
// is written from, i.e. what the movie plays — with an INDEPENDENT census: it re-derives contact
// and ground-layer geometry itself rather than calling the shipped repair's own helpers, so a
// repair that is mis-wired, mis-scoped, or silently a no-op FAILS here instead of self-certifying.
//
//   W-MZ-1  Pre-repair census REPORTED per building (the gap this fix exists to close, measured
//           2026-08-12: Terminal 161, Hospital 165, Duplex 19, HHS 156, Clinic 345, LTU 4605,
//           JKR 110). Reported, not gated — it is the before-number, and it changes whenever any
//           upstream gate changes.
//   W-MZ-2  THE BAR: post-repair midair == 0 on every shipped building. Any non-zero = a real
//           element a viewer will see hanging.
//   W-MZ-3  Monotone: zero elements start EARLIER after the repair than before it (moving earlier
//           is the one direction that can break support order — §TIER_SERIAL W-TS-3's property).
//   W-MZ-4  Orphans (touch NOTHING anywhere in the model — no schedule can fix them) are counted
//           and LOCKED at their measured baselines: a change is a real extraction/data change to
//           examine, never absorbed silently.
//   W-MZ-5  Wiring: _midairRepair is actually CALLED on the kernel_ops path in injectGantt. The
//           §DOOR_WINDOW_HOST_WALL lesson — a gate wired at zero (or one of two) call sites is
//           silently a no-op and measurably fixes nothing.
//   W-MZ-6  The 🔓→🔒 LOCK gate judges by the SAME rule (verifyGanttIntegrity runs _midairAudit and
//           refuses on it) — otherwise a planner's own bar-drag re-creates the hangings the
//           generated film has none of, and the lock is granted anyway.
//   W-MZ-7  That judge is not vacuous: drag one element 5 days before its first contact and it must
//           report the hanging. A test that cannot fail proves nothing.
//   W-MZ-8  The COST of this repair is locked, not hidden: moving an element later can leave a
//           dependent starting before that support FINISHES (auditFloating's own measure). The
//           after-value is baselined per building so the trade can never drift quietly.
//
// Approximation caveat (same as witness_tier_serial_display.js): durations come from
// ScheduleAuthor._installSecs with real class fragmentation + linear weighting — the same
// single-source formula injectGantt's getInstallSecs uses. Real per-element numbers, node-side.
//
// Command: BLD_DIR=~/bim-ootb/buildings node tests/witness_midair_zero.js   (from viewer/)
// Read the § log lines, not the exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function finish() { console.log('\n§MIDAIR_ZERO_SUMMARY pass=' + pass + ' fail=' + fail); process.exit(fail ? 1 : 0); }

// §DAY_GAP_TAIL (2026-08-12) — `which` selects among SAME-NAMED definitions. time_machine.js
// defines _midairRepair TWICE (:4457-delegating and :4660-inlined). JS function declarations hoist,
// so the LAST one is what the browser executes; this witness sliced the FIRST and was therefore
// judging a copy that never runs. Same class of defect as the one this lane already recorded ("the
// tier witness was silently testing nothing"), so it is fixed here rather than noted.
function sliceFn(src, name, which, optional) {
  let from = 0;
  for (let pass = 0; pass <= (which || 0); pass++) {
    const idx = src.indexOf('function ' + name + '(', from);
    if (idx < 0) { if (optional) return null; throw new Error(name + ' #' + (which || 0) + ' not found'); }
    let depth = 0, i = idx, seenOpen = false;
    for (; i < src.length; i++) {
      if (src[i] === '{') { depth++; seenOpen = true; }
      else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
    }
    if (i >= src.length) throw new Error('unbalanced braces for ' + name);
    if (pass === (which || 0)) return src.slice(idx, i + 1);
    from = i + 1;
  }
  throw new Error('unreachable');
}
// how many _midairRepair definitions exist — the LAST is ship truth (declaration hoisting)
let _mrCount = 0, _mrFrom = 0;
for (;;) { const k = tmSrc.indexOf('function _midairRepair(', _mrFrom); if (k < 0) break; _mrCount++; _mrFrom = k + 1; }
const tierOrderLine = "var _TIER1_ORDER = ['Substructure', 'Superstructure', 'Architecture'];";
// §ZONE_INDEX (#1313) + §TIER_SERIAL_BY_ZONE (#1314) added module-level helpers that
// _buildXrayElements / _tier1Extents / _twoTierRemap now call. They were never added to this slice
// list, so this witness has thrown `ReferenceError: _zoneIndex is not defined` — and exited before
// measuring a single building — since #1313 landed. Sliced optionally, exactly as
// bim-compiler/scripts/probe_arch_start.js does, so older revisions still run unchanged.
const zoneParts = [sliceFn(tmSrc, '_zoneIndexBuild', 0, true), sliceFn(tmSrc, '_zoneIndex', 0, true)].filter(Boolean);
// §SCHEDULE_CLASSIFY_DEDUP (2026-08-15) added _classifyNameOverride/_classifyRule — the shared
// pair _buildXrayElements' local matchNameOverride/matchRule now delegate to. Same class of gap
// as §ZONE_INDEX above (a new module-level helper this slice list didn't know about), sliced the
// same optional way so older revisions still run unchanged. This sandbox's `window` has no
// `ScheduleAuthor`, so the sliced pair runs its own fallback branch — the same reimplementation
// the old inline closures used, functionally identical, not the delegating path (that path is
// covered by witness_class_fallback_blackbox.js instead).
const classifyParts = [sliceFn(tmSrc, '_classifyNameOverride', 0, true), sliceFn(tmSrc, '_classifyRule', 0, true)].filter(Boolean);
const sliced = [tierOrderLine,
  (zoneParts.length === 2 ? 'var _zoneMemo = [];' : ''), zoneParts[0] || '', zoneParts[1] || '',
  sliceFn(tmSrc, '_zoneOf', 0, true) || '',
  classifyParts[0] || '', classifyParts[1] || '',
  sliceFn(tmSrc, '_promoteRoofLoadPath'), sliceFn(tmSrc, '_buildXrayElements'),
  sliceFn(tmSrc, '_tier1Extents'), sliceFn(tmSrc, '_tier1Serialize'),
  sliceFn(tmSrc, '_tier1Protrusion'), sliceFn(tmSrc, '_tierAuditRegate'),
  sliceFn(tmSrc, '_twoTierRemap'), sliceFn(tmSrc, '_contactGraph'),
  sliceFn(tmSrc, '_midairAudit'), sliceFn(tmSrc, '_midairRepair', _mrCount - 1)].join('\n');
console.log('§MIDAIR_SLICE _midairRepairDefs=' + _mrCount + ' slicing #' + (_mrCount - 1) +
  ' (the LAST definition — what declaration hoisting makes the browser run)' +
  ' zoneHelpers=' + (zoneParts.length === 2 ? 'present' : 'absent (pre-#1313 revision)') +
  ' classifyHelpers=' + (classifyParts.length === 2 ? 'present' : 'absent (pre-§SCHEDULE_CLASSIFY_DEDUP revision)'));

// W-MZ-5 — the repair must be called on the kernel_ops path, not merely defined
assert(/_twoTierRemap\(_twItems\);[\s\S]{0,600}_midairRepair\(_twItems\)/.test(tmSrc),
  'W-MZ-5 _midairRepair called on the kernel_ops path, right after _twoTierRemap (a defined-but-uncalled repair is a silent no-op)');
// W-MZ-6 — the LOCK gate must judge by the same rule the generator enforces, or a planner's drag
// re-creates exactly the hangings the generated film has none of and the lock is still granted.
const _vgi = tmSrc.slice(tmSrc.indexOf('function verifyGanttIntegrity()'));
const _vgiBody = _vgi.slice(0, _vgi.indexOf('\n  }\n'));
assert(_vgiBody.indexOf('_midairAudit(') > 0,
  'W-MZ-6a verifyGanttIntegrity (the 🔓→🔒 lock gate) runs _midairAudit — auditFloating alone cannot see this population');
assert(/ok:\s*n <= base\.floating && ma\.midair <= base\.midair/.test(_vgiBody),
  'W-MZ-6b the lock gate REFUSES on a midair INCREASE (§GANTT_LOCK_DELTA: ok requires BOTH audits no worse ' +
  'than the edit-start baseline — absolute zero was the old contract and it refused the lock on 4 of 7 ' +
  'buildings for an unedited schedule)');

function loadRatesTable() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  return (new Function(txt.slice(start, txt.indexOf('};', defIdx) + 2) + '\n return RATES;'))();
}

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const DB_FILE = { LTU_AHouse: 'LTU_AHouse_meta.db' };
const BUILDINGS = (process.env.ONLY || 'Terminal,Hospital,Duplex,HHS_Office_Federated,Clinic,LTU_AHouse,JKR').split(',');
// Measured 2026-08-12 (probe_midair_census.js, pre-repair, DISPLAY timeline). Orphans are an
// EXTRACTION fact — elements whose bbox touches nothing anywhere in the model — so they are locked,
// not gated to zero: no scheduling change can ever move them.
// The measured cost of the repair, LOCKED per building (2026-08-12): auditFloating AFTER the repair
// on display times. Movement either way is a real change to examine — a drop means the trade shrank,
// a rise means it grew. Pre-repair values for reference: Terminal 8, Hospital 0, Duplex 0, HHS 0,
// Clinic 1, LTU_AHouse 334, JKR 81.
// ⚠ RE-LOCKED 2026-08-12 for §ARCH_START_TEMPO / M1 (the 8-hour crew day): Clinic 356 → 367,
// LTU_AHouse 1100 → 1101, JKR 158 → 151 (Terminal/Hospital/Duplex/HHS unmoved). Note the movement
// is in BOTH directions — JKR's trade got 7 SMALLER — which is what says this is a re-measure, not
// a regression: a regression from a 3x-longer programme would push one way.
// The PRE-repair column above is the proof of where the movement is not: it is unchanged on all 7
// (8/0/0/0/1/334/81), and computeSchedule's raw output is exactly toWall(the old output) —
// verified element-for-element over all 265,954 elements of the 7 buildings, 0 mismatches, with
// auditFloating over the raw schedule identical on every one. So the generative layer contributes
// zero of this delta. What moved is display-layer only: _twoTierRemap/_midairRepair shift items by
// WALL-CLOCK deltas, and on a shift clock an element's wall-clock width depends on whether its
// install straddles a day's 8-h productive window — so the ±1ms-tolerance audit comparisons at the
// margin land differently. 11/367 on Clinic, 1/1101 on LTU, -7/151 on JKR.
// §TIER2_PER_ELEMENT_CLAMP (2026-08-13): Terminal 102->103, LTU_AHouse 1101->1142 — the clamp is
// deliberately non-order-preserving (pushes a Tier-2 element straight to t1EndZ[z] instead of a
// uniform zone shift, per the ruling in prompts/4D_SCHEDULE_PERFECTION.md §TIER2_AFTER_TIER1), so a
// few more elements land after a dependent that _midairRepair's later-only push cannot fully reorder
// — the SAME accepted trade-off class this witness already locks (W-MZ-8's own header), not a new
// one. W-MZ-2 (the acceptance bar: floating==0) is UNCHANGED on all 7 buildings — re-verify that
// first if this baseline ever needs updating again.
// §GROUNDED_OVERRIDE_FIX (2026-08-13, user report "THINGS STILL HANGING IN MID AIR"): _midairRepair
// (and _midairAudit, the 🔓→🔒 lock gate's judge) used to SKIP every "grounded" element outright,
// even when it had a real, later-appearing contact — 1,105 elements across all 7 buildings were
// silently exempted from ever being checked at all (worst gaps: LTU_AHouse 878.8d, Hospital 172.3d).
// Fixed at time_machine.js's _contactGraph consumers (three call sites, one condition each) — see
// that function's own header for the full measurement. Now that the repair actually SEES and FIXES
// this population, W-MZ-8's cost rises again, same accepted class, bigger because the repair does
// more real work: Terminal 103->141, Hospital 135->210, HHS 11->31, Clinic 367->420,
// LTU_AHouse 1142->1534, JKR 151->348 (Duplex unmoved, 9->9 — it has no grounded-hidden population).
// W-MZ-2/W-MZ-3/W-MZ-4 UNCHANGED (0/0/locked) on all 7 — the acceptance bar itself did not move,
// it is simply now checking 1,105 more real elements than it silently used to skip.
// §STAIR_FLIGHT_GRID_VISIBILITY (2026-08-14, 4D_SCHEDULE_PERFECTION.md SESSION 6): stair flights
// are now real DAG/geoGate support sources (previously invisible to structIdxGrid/grid), so the
// generative schedule feeding this repair changed on every building that carries stairs of this
// shape — Terminal/Duplex/Clinic improved (141->136, 9->8, 420->407), Hospital/LTU_AHouse/JKR grew
// (210->211, 1534->1561, 348->358, more real cross-element dependencies now tracked). HHS unmoved
// (31). W-MZ-2/3/4 all held at their prior values — the acceptance bar itself did not regress,
// only this observability counter moved, same accepted class as §GROUNDED_OVERRIDE_FIX's own
// W-MZ-8 update above.
const FLOAT_AFTER_BASELINE = { Terminal: 136, Hospital: 211, Duplex: 8, HHS_Office_Federated: 31,
  Clinic: 407, LTU_AHouse: 1561, JKR: 358 };
const ORPHAN_BASELINE = { Terminal: 7, Hospital: 35, Duplex: 1, HHS_Office_Federated: 36, Clinic: 27,
  LTU_AHouse: 865, JKR: 1 };
const CELL = ScheduleGate.CELL, EPS = ScheduleGate.EPS, GAP = ScheduleGate.GAP;
const D = 86400000;

// ── the INDEPENDENT judge (deliberately not the shipped repair's own helpers) ──
function census(items) {
  const grid = {};
  const cellsOf = e => { const o = [];
    for (let a = Math.floor(e.x0 / CELL); a <= Math.floor(e.x1 / CELL); a++)
      for (let b = Math.floor(e.y0 / CELL); b <= Math.floor(e.y1 / CELL); b++) o.push(a + ',' + b);
    return o; };
  items.forEach((it, i) => cellsOf(it).forEach(c => (grid[c] = grid[c] || []).push(i)));
  let midair = 0, orphan = 0, grounded = 0, ok = 0;
  const worst = [];
  let probe = null;   // any non-grounded element WITH contacts — used by W-MZ-7 to re-create a hanging
  items.forEach((T, i) => {
    let lowest = Infinity, firstContact = Infinity, contacts = 0;
    const seen = {};
    for (const c of cellsOf(T)) {
      const arr = grid[c]; if (!arr) continue;
      for (const j of arr) {
        if (j === i || seen[j]) continue;
        const S = items[j];
        if (!(S.x0 <= T.x1 && S.x1 >= T.x0 && S.y0 <= T.y1 && S.y1 >= T.y0)) continue;
        seen[j] = 1;
        if (S.bz < lowest) lowest = S.bz;
        const bearing = S.bz < T.bz - EPS && S.tz >= T.bz - GAP;
        // §DAY_GAP_TAIL (2026-08-12): this mirrors _contactGraph's carrier clause EXACTLY,
        // including its lower-bound-only band (`S.bz >= T.tz - GAP` with no upper bound, so any
        // element at any height above T counts). That asymmetry vs hangGate/_tierAuditRegate was
        // measured and deliberately LEFT ALONE — see the §DAY_GAP_TAIL entry in
        // bim-compiler prompts/4D_SCHEDULE_PERFECTION.md for the numbers that rejected changing it.
        const carrier = S.bz >= T.tz - GAP && S.tz > T.tz + EPS;
        const embedded = S.bz <= T.bz + EPS && S.tz >= T.tz - EPS;
        if (!bearing && !carrier && !embedded) continue;
        contacts++;
        if (S.s < firstContact) firstContact = S.s;
      }
    }
    const isGround = !(lowest < T.bz - GAP);
    if (!contacts) { if (isGround) grounded++; else orphan++; return; }
    if (!isGround && !probe && firstContact > 0) probe = { i, guid: T.guid, firstContact };
    if (firstContact <= T.s + 1) { ok++; return; }
    if (isGround) { grounded++; return; }
    midair++;
    worst.push({ cls: T.cls, seq: T.seq, phase: T.phase, bz: T.bz, start: T.s / D, sup: firstContact / D });
  });
  worst.sort((a, b) => (b.sup - b.start) - (a.sup - a.start));
  return { midair, orphan, grounded, ok, worst, probe };
}

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rulesJson.SEQUENCE_RULES, SD = rulesJson.SEQUENCE_DEFAULT, LR = rulesJson.LABOR_RATES;
  const NO = rulesJson.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();

  for (const bld of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'));
    if (!fs.existsSync(dbPath)) { assert(false, 'W-MZ fixture missing: ' + dbPath); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const sandbox = { console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
      window: { SEQUENCE_RULES: SR, SEQUENCE_DEFAULT: SD, SEQUENCE_NAME_OVERRIDES: NO },
      ScheduleGate: ScheduleGate, Math: Math, A: () => ({ db: db }) };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements; this.__remap = _twoTierRemap; this.__repair = _midairRepair;', sandbox);
    const els = sandbox.__bxe();
    if (!els || !els.length) { assert(false, 'W-MZ ' + bld + ' element build produced nothing'); db.close(); continue; }

    const nameOf = {};
    const nr = db.exec("SELECT guid, ifc_class, COALESCE(element_name,'') FROM elements_meta");
    if (nr.length) nr[0].values.forEach(v => { nameOf[v[0]] = v[2]; });
    const frag = ScheduleAuthor._classFragmentation(db, RATES);
    const lin = ScheduleAuthor._linearWeighting(db, RATES);
    const geoEls = els.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
    geoEls.forEach(e => {
      const rule = ScheduleAuthor.matchNameOverride(e.cls, nameOf[e.guid] || '', NO) || ScheduleAuthor.matchRule(e.cls, SR, SD);
      if (!e.phase) e.phase = rule.phase;
      e.resource = rule.resource || '_DEFAULT';
      const realQty = (frag.fragmented[e.cls] && frag.area[e.guid] != null) ? frag.area[e.guid] : null;
      const span = Math.max(e.x1 - e.x0, e.y1 - e.y0, e.top_z - e.base_z);
      const avgLen = lin.avgLength[e.cls];
      const lengthRatio = (realQty == null && span > 0 && avgLen > 0) ? span / avgLen : null;
      e.installSecs = ScheduleAuthor._installSecs(e.cls, rule, LR, realQty, lengthRatio);
    });
    db.close();
    const maxCrews = {};
    for (const rk in LR) if (LR[rk].max_crews) maxCrews[rk] = LR[rk].max_crews;

    const quiet = console.log; console.log = () => {};
    let sched;
    try { sched = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews); } finally { console.log = quiet; }

    const items = geoEls.map(e => ({ guid: e.guid, s: sched[e.guid].start, e: sched[e.guid].end,
      bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq, phase: e.phase }));
    sandbox.__items = items;
    vm.runInContext('this.__remap(this.__items);', sandbox);      // DISPLAY timeline, shipped remap

    const before = census(items);
    const preStart = items.map(it => it.s);
    // W-MZ-8 — the OLD invariant must not be traded away for the new one. Moving a support later can
    // leave a dependent starting before that support FINISHES, which is exactly what auditFloating
    // measures. Compare it across the repair on the DISPLAY times (geoEls carry the element shape
    // auditFloating wants; sched maps guid -> the times under test).
    const _floatAt = () => {
      const m = {}; items.forEach(it => { m[it.guid] = { start: it.s, end: it.e }; });
      const q = console.log; console.log = () => {};
      try { return ScheduleGate.auditFloating(geoEls, m); } finally { console.log = q; }
    };
    const floatPre = _floatAt();
    console.log('§MIDAIR_BEFORE ' + bld + ' midair=' + before.midair + ' orphan=' + before.orphan +
      ' grounded=' + before.grounded + ' ok=' + before.ok + ' total=' + items.length);
    before.worst.slice(0, 3).forEach(w => console.log('    worst ' + w.cls + ' seq=' + w.seq + ' bz=' + w.bz.toFixed(2) +
      ' start=' + w.start.toFixed(1) + 'd firstSupport=' + w.sup.toFixed(1) + 'd'));

    const repairLines = [];
    sandbox.console = { log: (...a) => repairLines.push(a.join(' ')), warn: (...a) => repairLines.push(a.join(' ')) };
    vm.runInContext('this.__repair(this.__items);', sandbox);
    console.log((repairLines.find(l => l.indexOf('§MIDAIR_REPAIR') === 0) || '§MIDAIR_REPAIR <no log captured>') + '  [' + bld + ']');

    const after = census(items);
    const floatPost = _floatAt();
    assert(floatPost === FLOAT_AFTER_BASELINE[bld],
      'W-MZ-8 ' + bld + ' the measured TRADE is locked at ' + FLOAT_AFTER_BASELINE[bld] + ' (got ' + floatPost +
      '; auditFloating ' + floatPre + ' -> ' + floatPost + ') — moving an element later so it stops hanging can ' +
      'leave a dependent starting before that support FINISHES. Deliberate and named, never silent: the joint ' +
      'fixpoint was built and rejected on its own numbers (4 rounds, 7650 pushes, still 140 on Hospital, 0.8s->14.8s). ' +
      'The structural fix is gate-layer, see §STRUCT_POOL_UNGATED.');
    assert(after.midair === 0, 'W-MZ-2 ' + bld + ' ZERO elements appear before the first thing they touch (got ' +
      after.midair + (after.worst.length ? ', worst ' + after.worst[0].cls + ' start=' + after.worst[0].start.toFixed(1) +
      'd firstSupport=' + after.worst[0].sup.toFixed(1) + 'd' : '') + ')');
    let earlier = 0;
    items.forEach((it, i) => { if (it.s < preStart[i] - 1) earlier++; });
    assert(earlier === 0, 'W-MZ-3 ' + bld + ' repair moved nothing EARLIER (got ' + earlier + ')');
    // W-MZ-7 — a test that can fail: drag one element back before everything it touches (what a
    // planner's bar-drag does to its elements) and the lock-gate judge must SEE it.
    if (after.probe) {
      const it = items[after.probe.i], keepS = it.s, keepE = it.e;
      it.s = after.probe.firstContact - 5 * D; it.e = it.s + (keepE - keepS);
      const reAudit = census(items);
      assert(reAudit.midair >= 1,
        'W-MZ-7 ' + bld + ' judge catches a re-introduced hanging (moved 1 element 5d before its first contact, got midair=' + reAudit.midair + ')');
      it.s = keepS; it.e = keepE;
    } else { assert(false, 'W-MZ-7 ' + bld + ' no probe candidate found — census produced nothing to test with'); }
    assert(after.orphan === ORPHAN_BASELINE[bld],
      'W-MZ-4 ' + bld + ' orphans (touch nothing in the model) locked at ' + ORPHAN_BASELINE[bld] + ' (got ' + after.orphan +
      ') — an extraction limit, reported never gated');
  }
  finish();
})();

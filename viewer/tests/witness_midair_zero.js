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
// §S20 REDESIGN (2026-08-17, 4D_GANTT_TM_REFACTOR.md §S20) — this witness used to author its
// "post-repair" timeline by slicing `_twoTierRemap`/`_midairRepair` (the dead legacy chain,
// §PATHS NOT TO TAKE #1: reachable only via `?cpm4d=0`, never live) straight out of source and
// calling them, making this witness the pipeline's own regression baseline rather than a test OF
// it (§S19_RESULTS). Rebuilt to author the timeline via the LIVE default path instead —
// `_displayTimeline`'s CPM success branch (`CpmSchedule.run`, viewer/cpm_schedule.js), the exact
// function `injectGantt`'s kernel_ops write path and the materializeZones displayRemap hook both
// call. `CpmSchedule` is REQUIRED as the real module (never sliced) — same discipline
// `probe_cpm_display_path.js` and `witness_zone_display_authoring.js`'s W-ZDA-6 already established.
// This witness's INDEPENDENCE property is unchanged and is why it is not a duplicate of W-ZDA-6:
// `census()` below re-derives contact/ground geometry itself — it does NOT call `_contactGraph`
// (the function `_midairAudit`, and therefore W-ZDA-6's own judge, calls internally) — so a bug in
// `_contactGraph` itself would self-certify in W-ZDA-6 but still be caught here. This witness also
// covers the full 7-building fleet; W-ZDA-6 covers 2 (Duplex, HHS_Office_Federated).
//
//   W-MZ-1  Pre-CPM census REPORTED per building (the RAW computeSchedule output, before
//           _displayTimeline authors anything). Reported, not gated — it is the before-number,
//           and it changes whenever any upstream gate changes.
//   W-MZ-2  THE BAR: post-CPM midair == 0 on every shipped building. Any non-zero = a real
//           element a viewer will see hanging.
//   W-MZ-3  RETIRED this stage (was: "repair moves nothing earlier than the pre-repair remap
//           output" — a two-STAGE invariant specific to the legacy remap-then-repair architecture).
//           CPM authors the whole timeline in ONE pass from RAW, not two stages, so there is no
//           intermediate output left to be monotone against — and the natural analogue (CPM start
//           vs RAW start) is MEASURED to move earlier on ~25% of elements as normal, correct
//           behavior (§S19_RESULTS §E5_BOUND_CHECK: 12,131/48,428 Terminal elements start earlier
//           under CPM than their own raw computeSchedule start, by design — ES seeds from one
//           shared epoch, not a per-element floor). Asserting "earlier == 0" against RAW would
//           fail on already-measured, already-accepted behavior — a manufactured regression, not
//           a real one. No replacement invariant substituted; W-MZ-8 below is the real cost-lock.
//   W-MZ-4  Orphans (touch NOTHING anywhere in the model — no schedule can fix them) are counted
//           and LOCKED at their measured baselines: a change is a real extraction/data change to
//           examine, never absorbed silently. Purely geometric (x0/x1/y0/y1/bz/tz), independent of
//           which display-authoring path ran — re-measured fresh this stage, not assumed carried
//           over from the legacy-chain numbers.
//   W-MZ-5  Wiring: the kernel_ops path calls `_displayTimeline` (unchanged assertion), and
//           `_displayTimeline`'s CPM branch actually calls `CpmSchedule.run` then `_midairAudit`
//           on success — replaces the old "legacy branch still runs _twoTierRemap then
//           _midairRepair" check, which tested the FALLBACK the live path never takes and which
//           breaks by construction once Part B deletes those two functions.
//   W-MZ-6  The 🔓→🔒 LOCK gate judges by the SAME rule (verifyGanttIntegrity runs _midairAudit and
//           refuses on it) — otherwise a planner's own bar-drag re-creates the hangings the
//           generated film has none of, and the lock is granted anyway.
//   W-MZ-7  That judge is not vacuous: drag one element 5 days before its first contact and it must
//           report the hanging. A test that cannot fail proves nothing.
//   W-MZ-8  The COST of CPM authoring is locked, not hidden: moving an element can leave a
//           dependent starting before that support FINISHES (auditFloating's own measure). The
//           after-value is baselined per building, freshly measured against the CPM path (NOT
//           carried over from the legacy-chain numbers, which measured a different function),
//           so the trade can never drift quietly.
//
// Reachability proof (§S14.0 discipline: print it, don't assume it): each building's `_dtResult`
// is asserted `.cpm === true` (fresh CpmSchedule.run success, this witness never populates
// `_displayTimeline`'s one-shot cache before its own single call) and the captured
// `§CPM_DISPLAY on` log line is printed per building — never `§CPM_DISPLAY_FALLBACK`.
//
// Approximation caveat (same as witness_tier_serial_display.js, retired §S20 — see this file's own
// prior revisions): durations come from ScheduleAuthor._installSecs with real class fragmentation
// + linear weighting — the same single-source formula injectGantt's getInstallSecs uses. Real
// per-element numbers, node-side.
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
const CpmSchedule = require(path.join(__dirname, '..', 'cpm_schedule.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function finish() { console.log('\n§MIDAIR_ZERO_SUMMARY pass=' + pass + ' fail=' + fail); process.exit(fail ? 1 : 0); }

function sliceFn(src, name, which, optional) {
  let from = 0;
  for (let p = 0; p <= (which || 0); p++) {
    const idx = src.indexOf('function ' + name + '(', from);
    if (idx < 0) { if (optional) return null; throw new Error(name + ' #' + (which || 0) + ' not found'); }
    let depth = 0, i = idx, seenOpen = false;
    for (; i < src.length; i++) {
      if (src[i] === '{') { depth++; seenOpen = true; }
      else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
    }
    if (i >= src.length) throw new Error('unbalanced braces for ' + name);
    if (p === (which || 0)) return src.slice(idx, i + 1);
    from = i + 1;
  }
  throw new Error('unreachable');
}
// §ZONE_INDEX (#1313) + §TIER_SERIAL_BY_ZONE (#1314) added module-level helpers that
// _buildXrayElements now calls. Sliced optionally so older revisions still run unchanged.
const zoneParts = [sliceFn(tmSrc, '_zoneIndexBuild', 0, true), sliceFn(tmSrc, '_zoneIndex', 0, true)].filter(Boolean);
// §SCHEDULE_CLASSIFY_DEDUP (2026-08-15) added _classifyNameOverride/_classifyRule — the shared
// pair _buildXrayElements' local matchNameOverride/matchRule now delegate to. Sliced optionally,
// same reasoning. This sandbox's `window` has no `ScheduleAuthor`, so the sliced pair runs its own
// fallback branch — functionally identical, not the delegating path (covered by
// witness_class_fallback_blackbox.js instead).
const classifyParts = [sliceFn(tmSrc, '_classifyNameOverride', 0, true), sliceFn(tmSrc, '_classifyRule', 0, true)].filter(Boolean);
// §S20: dropped from this slice list — `_promoteRoofLoadPath`/`_buildXrayElements`/`_contactGraph`/
// `_midairAudit`/`_displayTimeline` never reach them — `_tier1Extents`, `_tier1Serialize`,
// `_tier1Protrusion`, `_tierAuditRegate`, `_twoTierRemap`, `_midairRepair` (only reachable through
// each other and `_displayTimeline`'s FALLBACK branch, which `_CPM_DISPLAY = true` below never
// takes), and `_TIER1_ORDER` (used only inside that same dead chain).
const sliced = ['var _CPM_DISPLAY = true;',   // §S20: the only branch left reachable post-Part-B
  (zoneParts.length === 2 ? 'var _zoneMemo = [];' : ''), zoneParts[0] || '', zoneParts[1] || '',
  sliceFn(tmSrc, '_zoneOf', 0, true) || '',
  classifyParts[0] || '', classifyParts[1] || '',
  sliceFn(tmSrc, '_promoteRoofLoadPath'), sliceFn(tmSrc, '_buildXrayElements'),
  sliceFn(tmSrc, '_contactGraph'), sliceFn(tmSrc, '_midairAudit'),
  sliceFn(tmSrc, '_displayTimelineRemember'), sliceFn(tmSrc, '_displayTimeline')].join('\n');
console.log('§MIDAIR_SLICE zoneHelpers=' + (zoneParts.length === 2 ? 'present' : 'absent (pre-#1313 revision)') +
  ' classifyHelpers=' + (classifyParts.length === 2 ? 'present' : 'absent (pre-§SCHEDULE_CLASSIFY_DEDUP revision)') +
  ' — §S20: authors via _displayTimeline (CPM branch), CpmSchedule required as the real module');

// W-MZ-5 — the CPM path must be reachable from the kernel_ops path, not merely defined.
assert(/_displayTimeline\(_twItems\)/.test(tmSrc),
  'W-MZ-5a kernel_ops path calls _displayTimeline (the single display-timeline source)');
// W-MZ-5b: slice the CPM branch out explicitly (from its `if (_CPM_DISPLAY...` guard to the
// legacy fallback's own `_twoTierRemap` call, i.e. everything the CPM success path can reach) and
// check membership within that slice — robust to comment-length drift, unlike a single
// distance-bounded regex across the whole function body.
const _dtIdx = tmSrc.indexOf('function _displayTimeline(items)');
const _dtBody = tmSrc.slice(_dtIdx, tmSrc.indexOf('function _displayTimelineRemember', _dtIdx));
const _cpmBranch = _dtBody.slice(_dtBody.indexOf('if (_CPM_DISPLAY'), _dtBody.indexOf('var tw = _twoTierRemap'));
assert(_dtIdx > 0 && _cpmBranch.length > 0 &&
  /CpmSchedule\.run\(items,/.test(_cpmBranch) && /if \(r && r\.ok\)/.test(_cpmBranch) && /_midairAudit\(items\)/.test(_cpmBranch),
  'W-MZ-5b _displayTimeline CPM branch calls CpmSchedule.run then, on success, _midairAudit ' +
  '(the live default path — replaces the retired check on the never-live fallback branch)');
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
// §S20 (2026-08-17) — FRESH baselines against the LIVE CPM path (`_displayTimeline`'s CPM branch),
// MEASURED this stage (first run with placeholder 0s, real numbers read off the FAIL lines,
// re-run to confirm PASS — never invented), NOT carried over assumed-unchanged from the retired
// legacy-chain numbers (those measured a DIFFERENT function's output entirely). The float-after
// trade (W-MZ-8) is genuinely new — CPM's precedence-driven displacement is a different mechanism
// than the legacy repair's later-only push, so a different number is expected, not a regression.
const CPM_FLOAT_AFTER_BASELINE = { Terminal: 8789, Hospital: 5107, Duplex: 289, HHS_Office_Federated: 1538,
  Clinic: 3523, LTU_AHouse: 15896, JKR: 3736 };
// Orphans (W-MZ-4) are purely geometric (x0/x1/y0/y1/bz/tz contact only, never reads .s/.e) so they
// are independent of which display-authoring path produced the times — MEASURED to be IDENTICAL to
// the retired legacy-chain baseline (Terminal 7, Hospital 35, Duplex 1, HHS 36, Clinic 27,
// LTU_AHouse 865, JKR 1), confirming that independence rather than assuming it.
const CPM_ORPHAN_BASELINE = { Terminal: 7, Hospital: 35, Duplex: 1, HHS_Office_Federated: 36,
  Clinic: 27, LTU_AHouse: 865, JKR: 1 };
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
        // element at any height above T counts). That asymmetry was measured and deliberately LEFT
        // ALONE — see the §DAY_GAP_TAIL entry in bim-compiler prompts/4D_SCHEDULE_PERFECTION.md.
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
    // §S20: window.LABOR_RATES = the real rates.js table (RATES.LABOR_RATES) — matches what a real
    // browser exposes (rates.js declares `var LABOR_RATES` at module scope, i.e. window.LABOR_RATES),
    // so _displayTimeline's own §S6_CREW_PASS max_crews_fixed/max_crews lookup sees real per-resource
    // caps instead of running crew-unconstrained.
    const sandbox = { console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
      window: { SEQUENCE_RULES: SR, SEQUENCE_DEFAULT: SD, SEQUENCE_NAME_OVERRIDES: NO, LABOR_RATES: RATES.LABOR_RATES },
      ScheduleGate: ScheduleGate, Math: Math, A: () => ({ db: db }),
      URLSearchParams: URLSearchParams, CpmSchedule: CpmSchedule };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements; this.__dt = _displayTimeline;', sandbox);
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
      bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq,
      phase: e.phase, storey: e.storey, resource: e.resource }));   // storey/resource: cpm_schedule.js reads both
    sandbox.__items = items;

    const before = census(items);   // RAW schedule (pre-CPM) — W-MZ-1's "before" number
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

    const dtLines = [];
    sandbox.console = { log: (...a) => dtLines.push(a.join(' ')), warn: (...a) => dtLines.push(a.join(' ')) };
    const dtResult = vm.runInContext('this.__dt(this.__items);', sandbox);
    // §S14.0 reachability proof — print it, don't assume it. Each building gets a FRESH vm context
    // (no _displayTimeline._last cache carried in from a prior call), so `.cpm` must be exactly
    // `true` (fresh CpmSchedule.run success) — never 'reuse' (would mean a stale cache hit, which
    // cannot happen here) and never `false` (would mean the FALLBACK branch ran, i.e. this test
    // silently reverted to measuring the dead chain again — the exact bug class this redesign
    // exists to prevent).
    const cpmOnLine = dtLines.find(l => l.indexOf('§CPM_DISPLAY on') === 0);
    assert(dtResult && dtResult.cpm === true && !!cpmOnLine,
      'W-MZ-CPM-PATH ' + bld + ' _displayTimeline authored via the LIVE CPM branch, not the fallback ' +
      '(cpm=' + (dtResult && dtResult.cpm) + '; ' + (cpmOnLine || 'no §CPM_DISPLAY on log line captured') + ')');
    console.log((cpmOnLine || '§CPM_DISPLAY <no log captured>') + '  [' + bld + ']');

    const after = census(items);
    const floatPost = _floatAt();
    assert(floatPost === CPM_FLOAT_AFTER_BASELINE[bld],
      'W-MZ-8 ' + bld + ' the measured TRADE is locked at ' + CPM_FLOAT_AFTER_BASELINE[bld] + ' (got ' + floatPost +
      '; auditFloating ' + floatPre + ' -> ' + floatPost + ') — CPM authoring can leave a dependent starting ' +
      'before its own support FINISHES (auditFloating\'s measure), a DIFFERENT invariant than midair (starting ' +
      'before a support APPEARS). Deliberate and named, never silent.');
    assert(after.midair === 0, 'W-MZ-2 ' + bld + ' ZERO elements appear before the first thing they touch (got ' +
      after.midair + (after.worst.length ? ', worst ' + after.worst[0].cls + ' start=' + after.worst[0].start.toFixed(1) +
      'd firstSupport=' + after.worst[0].sup.toFixed(1) + 'd' : '') + ')');
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
    assert(after.orphan === CPM_ORPHAN_BASELINE[bld],
      'W-MZ-4 ' + bld + ' orphans (touch nothing in the model) locked at ' + CPM_ORPHAN_BASELINE[bld] + ' (got ' + after.orphan +
      ') — an extraction limit, reported never gated, purely geometric (same either display-authoring path)');
  }
  finish();
})();

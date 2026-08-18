#!/usr/bin/env node
// witness_kernel_ops_sched_version.js — §KERNEL_OPS_SCHED_VERSION (2026-08-11).
//
// ISSUE this witness proves/disproves: a building whose kernel_ops ELEMENT_PLACE rows were
// materialized under an OLDER schedule-generation algorithm (e.g. before §TIER2_AFTER_TIER1's
// tier2Shift existed) gets those stale rows silently REUSED forever — _activateAsync only
// regenerates when kernel_ops is completely EMPTY (viewer/time_machine.js, near "No cache — try
// loading existing kernel_ops"). _GANTT_CACHE_VERSION already gates the separate IndexedDB 'gantt'
// JSON cache but never this table, so a fixed algorithm never reaches an already-opened building.
//
// Reported live: HHS_Office_Federated kept showing MEP Rough-in starting BEFORE Architecture
// finished — a stale kernel_ops table materialized before a schedule-generation fix landed would
// have kept showing it forever without this witness's predicate.
//
//   W-KOS-1  _kernelOpsSchedStale flags ops with NO _genVersion field as stale — this is literally
//            what every kernel_ops row written before this fix looks like (the field did not exist).
//   W-KOS-2  _kernelOpsSchedStale flags ops with an OLDER numeric _genVersion as stale.
//   W-KOS-3  _kernelOpsSchedStale does NOT flag ops stamped with the CURRENT _GANTT_CACHE_VERSION —
//            a healthy building must not pay a regenerate cost on every single open.
//   W-KOS-4  Real magnitude, EVERY shipped building (not just HHS): the RAW (generative) schedule
//            vs the DISPLAYED (CPM-authored) schedule differ by a real, measured maxShiftDays. A
//            stale, pre-fix kernel_ops table (materialized with no _genVersion, at whatever
//            timestamps the OLD code wrote — RAW-equivalent, since no display authoring had run
//            yet) reused as-is would show that many real days of drift on the ACTUAL 3D reveal.
//            shiftDays>0 on a building is exactly the size of the regression this fix closes for it.
//
// §S20 REDESIGN (2026-08-17, 4D_GANTT_TM_REFACTOR.md §S20) — a genuine gap in §S19_RESULTS's own
// audit table, found while executing this stage (not named in the brief's Part A scope, but the
// SAME dependency class it exists to fix): W-KOS-4/W-KOS-5 used to measure the magnitude by slicing
// `_twoTierRemap` (the dead legacy chain, §PATHS NOT TO TAKE #1: reachable only via `?cpm4d=0`,
// never live) out of source and calling it directly for its `tier2ShiftDays` stat — the exact
// slice-and-call pattern §S19/§S20 exist to retire, just missed by the original grep pass. Rebuilt
// to measure the SAME magnitude against the LIVE CPM path instead — `_displayTimeline`'s CPM branch
// (`CpmSchedule.run`, viewer/cpm_schedule.js), the exact function `injectGantt`'s kernel_ops write
// path and the materializeZones displayRemap hook both call. There is no `tier2ShiftDays` stat on
// the CPM path (no Tier-1/Tier-2 staged-repair concept under a single-pass DAG solve), so the
// witness now computes the directly analogous quantity itself: the MAX absolute |CPM start - RAW
// start| across all elements, in days — the same "worst-case single-element shift" `tier2Shift`
// (time_machine.js:4788, `if (d > tier2Shift) tier2Shift = d;`) measured for the legacy chain.
//
// Command: BLD_DIR=~/bim-ootb/buildings node viewer/tests/witness_kernel_ops_sched_version.js
// Read the § log lines, not exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function finish() {
  console.log('\n§KERNEL_OPS_SCHED_VERSION_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}

const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const CpmSchedule = require(path.join(__dirname, '..', 'cpm_schedule.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

// §DAY_GAP_TAIL discipline, applied here 2026-08-12 (§ARCH_START_TEMPO / M1): `optional` lets a
// helper that a newer time_machine.js introduced be sliced without breaking on a revision that
// predates it — same shape witness_midair_zero.js and bim-compiler/scripts/probe_arch_start.js use.
function sliceFn(src, name, optional) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) { if (optional) return null; throw new Error(name + ' not found'); }
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

// The version-check clause in _activateAsync must call this EXACT function name — assert wired,
// not just present, so a future refactor that silently drops the call still fails this witness.
if (tmSrc.indexOf('_kernelOpsSchedStale(_placeOps, _GANTT_CACHE_VERSION)') < 0) {
  assert(false, 'W-KOS-0 _activateAsync calls _kernelOpsSchedStale(_placeOps, _GANTT_CACHE_VERSION)');
  finish();
}
const genVersionLine = '_genVersion:_GANTT_CACHE_VERSION';
if (tmSrc.indexOf(genVersionLine) < 0) {
  assert(false, 'W-KOS-0b materialize path stamps _genVersion:_GANTT_CACHE_VERSION on every ELEMENT_PLACE op');
  finish();
}

// ⚠ #1313 (§ZONE_INDEX) moved _buildXrayElements' storey banding into the shared _zoneIndex, and
// this slice list was never updated — so from W-KOS-4 onward this witness has thrown
// `ReferenceError: _zoneIndex is not defined` and certified NOTHING about the live materialize path
// since. Exactly the dead-witness failure §DAY_GAP_TAIL found in witness_midair_zero.js the same
// day. Found 2026-08-12 while landing §ARCH_START_TEMPO / M1 — which bumps the very constant this
// witness guards, so a dead one here is not something to leave for later.
const zoneParts = [sliceFn(tmSrc, '_zoneIndexBuild', true), sliceFn(tmSrc, '_zoneIndex', true)].filter(Boolean);
// §SCHEDULE_CLASSIFY_DEDUP (2026-08-15): same class of gap as §ZONE_INDEX above — a new
// module-level helper (_classifyNameOverride/_classifyRule) _buildXrayElements now delegates to
// that this slice list didn't know about. Sliced the same optional way.
const classifyParts = [sliceFn(tmSrc, '_classifyNameOverride', true), sliceFn(tmSrc, '_classifyRule', true)].filter(Boolean);
// §S20: dropped from this slice list (and the W-KOS-0c check that used to require its presence) —
// `_TIER1_ORDER`, `_tier1Extents`, `_tier1Serialize`, `_tier1Protrusion`, `_tierAuditRegate`,
// `_twoTierRemap` are only reachable through each other and `_displayTimeline`'s FALLBACK branch,
// which `_CPM_DISPLAY = true` below never takes.
const sliced = ['var _CPM_DISPLAY = true;',   // §S20: the only branch left reachable post-Part-B
  (zoneParts.length === 2 ? 'var _zoneMemo = [];' : ''), zoneParts[0] || '', zoneParts[1] || '',
  sliceFn(tmSrc, '_zoneOf', true) || '',
  classifyParts[0] || '', classifyParts[1] || '',
  sliceFn(tmSrc, '_kernelOpsSchedStale'),
  sliceFn(tmSrc, '_promoteRoofLoadPath'),
  sliceFn(tmSrc, '_buildXrayElements'),
  sliceFn(tmSrc, '_contactGraph'), sliceFn(tmSrc, '_designatedSupport'), sliceFn(tmSrc, '_midairAudit'),
  sliceFn(tmSrc, '_displayTimelineRemember'), sliceFn(tmSrc, '_displayTimeline')
].join('\n');

// ── W-KOS-1/2/3: the predicate in isolation, no DB, no window ──
const sandbox0 = { console: console };
vm.createContext(sandbox0);
vm.runInContext(sliceFn(tmSrc, '_kernelOpsSchedStale') + '\nthis.__stale = _kernelOpsSchedStale;', sandbox0);
const stale = sandbox0.__stale;

const CUR = 9;
const D = 86400000;   // §S20: ms/day, for maxShiftDays
assert(stale([{ parameters: { cls: 'IfcSlab' } }], CUR) === true,
  'W-KOS-1 ops with no _genVersion field (every pre-fix row) flagged stale');
assert(stale([{ parameters: { cls: 'IfcSlab', _genVersion: 8 } }], CUR) === true,
  'W-KOS-2 ops with OLDER _genVersion=8 (current=' + CUR + ') flagged stale');
assert(stale([{ parameters: { cls: 'IfcSlab', _genVersion: CUR } }], CUR) === false,
  'W-KOS-3 ops correctly stamped _genVersion=' + CUR + ' NOT flagged (no needless regenerate)');
assert(stale([], CUR) === false, 'W-KOS-3b empty ops array NOT flagged (nothing to invalidate yet)');

// ── W-KOS-4: real per-building magnitude, against the live CPM display-authoring path ──
const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const DB_FILE = { LTU_AHouse: 'LTU_AHouse_meta.db' };
const BUILDINGS = ['Terminal', 'Hospital', 'Duplex', 'HHS_Office_Federated', 'Clinic', 'LTU_AHouse', 'JKR'];

function loadRatesTable() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  const end = txt.indexOf('};', defIdx) + 2;
  return (new Function(txt.slice(start, end) + '\n return RATES;'))();
}

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rulesJson.SEQUENCE_RULES, SD = rulesJson.SEQUENCE_DEFAULT, LR = rulesJson.LABOR_RATES;
  const NO = rulesJson.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();
  let anyRealOverlap = false;

  for (const bld of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'));
    if (!fs.existsSync(dbPath)) { assert(false, 'W-KOS-4 fixture missing: ' + dbPath); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPath));

    // §S20: window.LABOR_RATES = the real rates.js table (RATES.LABOR_RATES) — matches what a real
    // browser exposes, so _displayTimeline's §S6_CREW_PASS max_crews_fixed/max_crews lookup sees
    // real per-resource caps instead of running crew-unconstrained.
    const sandbox = {
      console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
      window: { SEQUENCE_RULES: SR, SEQUENCE_DEFAULT: SD, SEQUENCE_NAME_OVERRIDES: NO, LABOR_RATES: RATES.LABOR_RATES },
      ScheduleGate: ScheduleGate, Math: Math, A: () => ({ db: db }),
      URLSearchParams: URLSearchParams, CpmSchedule: CpmSchedule
    };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements; this.__dt = _displayTimeline;', sandbox);
    const els = sandbox.__bxe();
    if (!els || !els.length) { assert(false, 'W-KOS-4 ' + bld + ' element build produced nothing'); db.close(); continue; }

    const nameOf = {};
    const nr = db.exec("SELECT guid, ifc_class, COALESCE(element_name,'') FROM elements_meta");
    if (nr.length) nr[0].values.forEach(v => { nameOf[v[0]] = v[2]; });
    const frag = ScheduleAuthor._classFragmentation(db, RATES);
    const lin = ScheduleAuthor._linearWeighting(db, RATES);
    db.close();

    const geoEls = els.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
    geoEls.forEach(e => {
      const cls = e.cls, name = nameOf[e.guid] || '';
      const rule = ScheduleAuthor.matchNameOverride(cls, name, NO) || ScheduleAuthor.matchRule(cls, SR, SD);
      if (!e.phase) e.phase = rule.phase;
      e.resource = rule.resource || '_DEFAULT';
      const realQty = (frag.fragmented[cls] && frag.area[e.guid] != null) ? frag.area[e.guid] : null;
      const span = Math.max(e.x1 - e.x0, e.y1 - e.y0, e.top_z - e.base_z);
      const avgLen = lin.avgLength[cls];
      const lengthRatio = (realQty == null && span > 0 && avgLen > 0) ? span / avgLen : null;
      e.installSecs = ScheduleAuthor._installSecs(cls, rule, LR, realQty, lengthRatio);
    });
    const maxCrews = {};
    for (const rk in LR) if (LR[rk].max_crews) maxCrews[rk] = LR[rk].max_crews;

    const quiet = console.log; console.log = () => {};
    let sched;
    try { sched = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews); } finally { console.log = quiet; }

    const items = geoEls.map(e => ({ guid: e.guid, s: sched[e.guid].start, e: sched[e.guid].end,
      bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq,
      phase: e.phase, storey: e.storey, resource: e.resource }));   // storey/resource: cpm_schedule.js's crew pass reads both
    const rawS = items.map(it => it.s);   // §S20: snapshot RAW starts before _displayTimeline mutates .s in place
    sandbox.console = { log: () => {}, warn: () => {} };
    sandbox.__items = items;
    const dtLines = [];
    sandbox.console = { log: (...a) => dtLines.push(a.join(' ')), warn: (...a) => dtLines.push(a.join(' ')) };
    const dtResult = vm.runInContext('this.__dt(this.__items);', sandbox);
    // §S14.0 reachability proof — print it, don't assume it. Fresh vm context per building, so
    // `.cpm` must be exactly `true` (fresh CpmSchedule.run success), never the FALLBACK branch —
    // the exact bug class this redesign exists to prevent (silently measuring the dead chain again).
    const cpmOnLine = dtLines.find(l => l.indexOf('§CPM_DISPLAY on') === 0);
    const cpmReached = !!(dtResult && dtResult.cpm === true && cpmOnLine);
    if (!cpmReached) assert(false, 'W-KOS-CPM-PATH ' + bld + ' _displayTimeline reached the LIVE CPM branch (cpm=' +
      (dtResult && dtResult.cpm) + '; ' + (cpmOnLine || 'no §CPM_DISPLAY on log line captured') + ')');
    else assert(true, 'W-KOS-CPM-PATH ' + bld + ' _displayTimeline reached the LIVE CPM branch (' + cpmOnLine + ')');

    // A materialize BEFORE this fix wrote raw computeSchedule() times straight into kernel_ops (no
    // display authoring had run) — stamp those OLD-style rows (no _genVersion) and confirm the
    // predicate flags them, tying the abstract predicate to this building's REAL data shape.
    const oldStyleOps = [{ parameters: { cls: geoEls[0].cls, phase: geoEls[0].phase } }];
    assert(stale(oldStyleOps, CUR) === true,
      'W-KOS-4 ' + bld + ' OLD-style materialized op (no _genVersion) flagged stale — would regenerate');

    // §S20: maxShiftDays = MAX |CPM start - RAW start| across all elements — the same "worst-case
    // single-element shift" quantity `tier2Shift` measured for the legacy chain (time_machine.js
    // :4788), now measured against what actually authors the display timeline live.
    let maxShiftDays = 0;
    items.forEach((it, i) => { const d = Math.abs(it.s - rawS[i]) / D; if (d > maxShiftDays) maxShiftDays = d; });
    console.log('§KERNEL_OPS_SCHED_VERSION_MAGNITUDE bld=' + bld +
      ' maxShiftDaysIfStaleOpsWereReused=' + maxShiftDays.toFixed(1) +
      ' (0=no real regression for this building, >0=days of drift a stale' +
      ' kernel_ops table would show on the actual 3D reveal until this fix regenerates it)');
    if (maxShiftDays > 0) anyRealOverlap = true;
  }

  assert(anyRealOverlap, 'W-KOS-5 at least one shipped building has maxShiftDays>0 — proves this is a real, non-hypothetical regression, not just a theoretical predicate');
  finish();
})();

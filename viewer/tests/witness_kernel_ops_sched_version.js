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
// finished — §TIER_SERIAL's own witness (witness_tier_serial_display.js) could not have caught this
// because it calls _twoTierRemap directly in-memory, never through kernel_ops materialize-or-reuse.
//
//   W-KOS-1  _kernelOpsSchedStale flags ops with NO _genVersion field as stale — this is literally
//            what every kernel_ops row written before this fix looks like (the field did not exist).
//   W-KOS-2  _kernelOpsSchedStale flags ops with an OLDER numeric _genVersion as stale.
//   W-KOS-3  _kernelOpsSchedStale does NOT flag ops stamped with the CURRENT _GANTT_CACHE_VERSION —
//            a healthy building must not pay a regenerate cost on every single open.
//   W-KOS-4  Real magnitude, EVERY shipped building (not just HHS): using the SAME real element
//            build + computeSchedule + _twoTierRemap pipeline witness_tier_serial_display.js already
//            proves correct, the RAW (pre-remap) generative schedule vs the DISPLAYED (remapped)
//            schedule differ by _twoTierRemap's own reported tier2ShiftDays. A stale, pre-fix
//            kernel_ops table (materialized with no _genVersion, at whatever timestamps the OLD
//            code wrote — RAW-equivalent since no shift existed yet) reused as-is would show that
//            many real days of Architecture/MEP overlap on the ACTUAL 3D reveal. shiftDays>0 on a
//            building is exactly the size of the regression this fix closes for it.
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

const tierOrderLine = "var _TIER1_ORDER = ['Substructure', 'Superstructure', 'Architecture'];";
if (tmSrc.indexOf(tierOrderLine) < 0) { assert(false, 'W-KOS-0c _TIER1_ORDER constant found in time_machine.js'); finish(); }

const sliced = [
  tierOrderLine,
  sliceFn(tmSrc, '_kernelOpsSchedStale'),
  sliceFn(tmSrc, '_promoteRoofLoadPath'),
  sliceFn(tmSrc, '_buildXrayElements'),
  sliceFn(tmSrc, '_tier1Extents'),
  sliceFn(tmSrc, '_tier1Serialize'),
  sliceFn(tmSrc, '_tier1Protrusion'),
  sliceFn(tmSrc, '_tierAuditRegate'),
  sliceFn(tmSrc, '_twoTierRemap')
].join('\n');

// ── W-KOS-1/2/3: the predicate in isolation, no DB, no window ──
const sandbox0 = { console: console };
vm.createContext(sandbox0);
vm.runInContext(sliceFn(tmSrc, '_kernelOpsSchedStale') + '\nthis.__stale = _kernelOpsSchedStale;', sandbox0);
const stale = sandbox0.__stale;

const CUR = 9;
assert(stale([{ parameters: { cls: 'IfcSlab' } }], CUR) === true,
  'W-KOS-1 ops with no _genVersion field (every pre-fix row) flagged stale');
assert(stale([{ parameters: { cls: 'IfcSlab', _genVersion: 8 } }], CUR) === true,
  'W-KOS-2 ops with OLDER _genVersion=8 (current=' + CUR + ') flagged stale');
assert(stale([{ parameters: { cls: 'IfcSlab', _genVersion: CUR } }], CUR) === false,
  'W-KOS-3 ops correctly stamped _genVersion=' + CUR + ' NOT flagged (no needless regenerate)');
assert(stale([], CUR) === false, 'W-KOS-3b empty ops array NOT flagged (nothing to invalidate yet)');

// ── W-KOS-4: real per-building magnitude, same pipeline witness_tier_serial_display.js proves ──
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

    const sandbox = {
      console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
      window: { SEQUENCE_RULES: SR, SEQUENCE_DEFAULT: SD, SEQUENCE_NAME_OVERRIDES: NO },
      ScheduleGate: ScheduleGate, Math: Math, A: () => ({ db: db })
    };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements; this.__remap = _twoTierRemap;', sandbox);
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
      bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq, phase: e.phase }));
    sandbox.console = { log: () => {}, warn: () => {} };
    vm.runInContext('this.__items = null; this.__lastStats = null;', sandbox);
    sandbox.__items = items;
    vm.runInContext('this.__lastStats = this.__remap(this.__items);', sandbox);
    const stats = sandbox.__lastStats;

    // A materialize BEFORE this fix wrote raw computeSchedule() times straight into kernel_ops (no
    // remap existed) — stamp those OLD-style rows (no _genVersion) and confirm the predicate flags
    // them, tying the abstract predicate to this building's REAL data shape.
    const oldStyleOps = [{ parameters: { cls: geoEls[0].cls, phase: geoEls[0].phase } }];
    assert(stale(oldStyleOps, CUR) === true,
      'W-KOS-4 ' + bld + ' OLD-style materialized op (no _genVersion) flagged stale — would regenerate');

    const shiftDays = stats ? stats.tier2ShiftDays : 0;
    console.log('§KERNEL_OPS_SCHED_VERSION_MAGNITUDE bld=' + bld +
      ' tier2ShiftDaysIfStaleOpsWereReused=' + shiftDays.toFixed(1) +
      ' (0=no real regression for this building, >0=days of Architecture/MEP overlap a stale' +
      ' kernel_ops table would show on the actual 3D reveal until this fix regenerates it)');
    if (shiftDays > 0) anyRealOverlap = true;
  }

  assert(anyRealOverlap, 'W-KOS-5 at least one shipped building has tier2ShiftDays>0 — proves this is a real, non-hypothetical regression, not just a theoretical predicate');
  finish();
})();

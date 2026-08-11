#!/usr/bin/env node
// probe_bars_vs_ops.js — does §MIDAIR_REPAIR pull elements outside their own authored Gantt bar?
// (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md — planner question: "is the resulting
// 4D JSON still P6/MPP quality?")
//
// ISSUE this probe exposes: the planner-facing artefacts (`tasks` + `task_sequences`, written by
// schedule_author.js materializeZones from the RAW computeSchedule times) and the movie's element
// times (`kernel_ops`, written by time_machine.js from the two-tier remap + §MIDAIR_REPAIR) are two
// different layers. The repair moves elements LATER on the display layer only. So the honest
// question is not "did the JSON change" (it provably cannot — schedule_author.js is untouched) but
// "how far can an element now play outside the bar that owns it".
//
// Command (from viewer/): BLD=HHS_Office_Federated BLD_DIR=~/bim-ootb/buildings node tests/probe_bars_vs_ops.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));
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
const sliced = ["var _TIER1_ORDER = ['Substructure', 'Superstructure', 'Architecture'];",
  sliceFn(tmSrc, '_promoteRoofLoadPath'), sliceFn(tmSrc, '_buildXrayElements'),
  sliceFn(tmSrc, '_tier1Extents'), sliceFn(tmSrc, '_tier1Serialize'),
  sliceFn(tmSrc, '_tier1Protrusion'), sliceFn(tmSrc, '_tierAuditRegate'),
  sliceFn(tmSrc, '_twoTierRemap'), sliceFn(tmSrc, '_contactGraph'),
  sliceFn(tmSrc, '_midairAudit'), sliceFn(tmSrc, '_midairRepair')].join('\n');

function loadRatesTable() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  return (new Function(txt.slice(start, txt.indexOf('};', defIdx) + 2) + '\n return RATES;'))();
}

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const DB_FILE = { LTU_AHouse: 'LTU_AHouse_meta.db' };
const bld = process.env.BLD || 'HHS_Office_Federated';
const D = 86400000;

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rulesJson.SEQUENCE_RULES, SD = rulesJson.SEQUENCE_DEFAULT, LR = rulesJson.LABOR_RATES;
  const NO = rulesJson.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();
  const db = new SQL.Database(fs.readFileSync(path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'))));

  // ── the PLANNER's artefact: the shipped author path, unmodified ──
  const quiet = console.log; console.log = () => {};
  let auth;
  try {
    auth = ScheduleAuthor.materializeZones(db, SR,
      { start: '2026-01-01', laborRates: LR, scheduleGate: ScheduleGate, sequenceDefault: SD, nameOverrides: NO });
  } finally { console.log = quiet; }
  console.log('§BARS author ok=' + (auth && auth.ok) + (auth && auth.reason ? ' reason=' + auth.reason : '') +
    ' tasks=' + (auth && auth.tasks != null ? auth.tasks : '?') + ' edges=' + (auth && auth.edges != null ? auth.edges : '?'));
  const tRows = db.exec("SELECT t.task_id, t.schedule_start, t.schedule_finish, te.guid " +
    "FROM tasks t JOIN task_elements te ON te.task_id = t.task_id WHERE t.is_summary = 0");
  const bar = {};
  if (tRows.length) tRows[0].values.forEach(v => {
    const s = Date.parse(v[1] + 'T00:00:00Z'), f = Date.parse(v[2] + 'T00:00:00Z');
    if (!isNaN(s) && !isNaN(f)) bar[v[3]] = { id: v[0], s, f };
  });

  // ── the MOVIE's element times: remap + repair, exactly as injectGantt runs them ──
  const sandbox = { console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
    window: { SEQUENCE_RULES: SR, SEQUENCE_DEFAULT: SD, SEQUENCE_NAME_OVERRIDES: NO },
    ScheduleGate: ScheduleGate, Math: Math, A: () => ({ db: db }) };
  vm.createContext(sandbox);
  vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements; this.__remap = _twoTierRemap; this.__repair = _midairRepair;', sandbox);
  const els = sandbox.__bxe();
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
  let sched;
  const q2 = console.log; console.log = () => {};
  try { sched = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews); } finally { console.log = q2; }
  const items = geoEls.map(e => ({ guid: e.guid, s: sched[e.guid].start, e: sched[e.guid].end,
    bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq, phase: e.phase }));
  sandbox.__items = items;
  vm.runInContext('this.__remap(this.__items);', sandbox);
  const preRepair = {}; items.forEach(it => { preRepair[it.guid] = it.s; });
  vm.runInContext('this.__repair(this.__items);', sandbox);

  // Both layers live on their own calendars (author starts 2026-01-01; the display timeline is
  // relative). Compare in NORMALIZED position: each element's fraction of its own layer's span —
  // the same monotone mapping injectGantt's _cap applies when it lands ops in the authored window.
  let dMin = Infinity, dMax = -Infinity, bMin = Infinity, bMax = -Infinity;
  items.forEach(it => { if (it.s < dMin) dMin = it.s; if (it.e > dMax) dMax = it.e; });
  Object.keys(bar).forEach(g => { const b = bar[g]; if (b.s < bMin) bMin = b.s; if (b.f > bMax) bMax = b.f; });
  const dSpan = Math.max(1, dMax - dMin), bSpan = Math.max(1, bMax - bMin);
  const bDays = bSpan / D;

  let linked = 0, outside = 0, outsideMoved = 0, maxOutD = 0, movedOutsideOnly = 0;
  items.forEach(it => {
    const b = bar[it.guid]; if (!b) return;
    linked++;
    const posD = bMin + ((it.s - dMin) / dSpan) * bSpan;          // where the movie plays it, on the authored calendar
    const posPre = bMin + ((preRepair[it.guid] - dMin) / dSpan) * bSpan;
    const outNow = posD < b.s - D || posD > b.f + D;
    const outPre = posPre < b.s - D || posPre > b.f + D;
    if (outNow) {
      outside++;
      const d = Math.max(b.s - posD, posD - b.f) / D;
      if (d > maxOutD) maxOutD = d;
      if (!outPre) outsideMoved++;
    }
    if (it.s !== preRepair[it.guid]) movedOutsideOnly += (outNow && !outPre) ? 1 : 0;
  });
  console.log('§BARS_VS_OPS ' + bld + ' authoredSpan=' + bDays.toFixed(1) + 'd linkedElements=' + linked +
    ' playingOutsideOwnBar=' + outside + ' (' + (linked ? (100 * outside / linked).toFixed(2) : '0') + '%)' +
    ' newlyOutsideBecauseOfRepair=' + outsideMoved + ' maxOutsideDays=' + maxOutD.toFixed(1) +
    ' — tasks/task_sequences themselves are byte-identical (schedule_author.js untouched)');
})();

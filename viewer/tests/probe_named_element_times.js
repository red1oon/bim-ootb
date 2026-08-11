#!/usr/bin/env node
// probe_named_element_times.js — pre/post §MIDAIR_REPAIR display times for elements whose name
// matches a substring. Exists to answer a specific live report ("the glass roof comes on first",
// "the stairs hang in midair") with the two numbers that settle it, instead of a whole-building
// aggregate. Reuses the shipped functions by slicing, never reimplements them.
//
// Command (from viewer/):  BLD=Terminal NAMEQ="Basic Roof:Glass" BLD_DIR=~/bim-ootb/buildings \
//                          node tests/probe_named_element_times.js
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
const bld = process.env.BLD || 'Terminal';
const NAMEQ = (process.env.NAMEQ || 'Basic Roof:Glass').toLowerCase();
const D = 86400000;

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rulesJson.SEQUENCE_RULES, SD = rulesJson.SEQUENCE_DEFAULT, LR = rulesJson.LABOR_RATES;
  const NO = rulesJson.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();
  const db = new SQL.Database(fs.readFileSync(path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'))));
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
  const quiet = console.log; console.log = () => {};
  let sched;
  try { sched = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews); } finally { console.log = quiet; }
  const items = geoEls.map(e => ({ guid: e.guid, s: sched[e.guid].start, e: sched[e.guid].end,
    bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq, phase: e.phase }));
  sandbox.__items = items;
  vm.runInContext('this.__remap(this.__items);', sandbox);
  const before = {};
  items.forEach(it => { before[it.guid] = it.s; });
  vm.runInContext('this.__repair(this.__items);', sandbox);
  // why-diagnostics: the same contact/ground test §MIDAIR_REPAIR applies, printed per match
  const CELL = ScheduleGate.CELL, EPS = ScheduleGate.EPS, GAP = ScheduleGate.GAP;
  const cellsOf = e => { const o = [];
    for (let a = Math.floor(e.x0 / CELL); a <= Math.floor(e.x1 / CELL); a++)
      for (let b = Math.floor(e.y0 / CELL); b <= Math.floor(e.y1 / CELL); b++) o.push(a + ',' + b);
    return o; };
  const grid = {};
  items.forEach((it, i) => cellsOf(it).forEach(c => (grid[c] = grid[c] || []).push(i)));
  function diag(T, idx) {
    let lowest = Infinity, contacts = 0, first = Infinity, firstCls = '-', seen = {};
    for (const c of cellsOf(T)) { const arr = grid[c]; if (!arr) continue;
      for (const j of arr) { if (j === idx || seen[j]) continue; const S = items[j];
        if (!(S.x0 <= T.x1 && S.x1 >= T.x0 && S.y0 <= T.y1 && S.y1 >= T.y0)) continue;
        seen[j] = 1;
        if (S.bz < lowest) lowest = S.bz;
        if ((S.bz < T.bz - EPS && S.tz >= T.bz - GAP) || (S.bz >= T.tz - GAP && S.tz > T.tz + EPS) ||
            (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS)) {
          contacts++; if (S.s < first) { first = S.s; firstCls = S.cls + '@' + S.bz.toFixed(2); } } } }
    return { grounded: !(lowest < T.bz - GAP), lowest: lowest, contacts: contacts,
      first: first === Infinity ? null : first / D, firstCls: firstCls };
  }
  let n = 0;
  items.forEach((it, idx) => {
    if ((nameOf[it.guid] || '').toLowerCase().indexOf(NAMEQ) < 0) return;
    n++;
    const dg = diag(it, idx);
    console.log('  §NAMED_WHY grounded=' + dg.grounded + ' lowestInFootprint=' +
      (isFinite(dg.lowest) ? dg.lowest.toFixed(2) : 'none') + ' contacts=' + dg.contacts +
      ' firstContactStart=' + (dg.first == null ? 'n/a' : dg.first.toFixed(1) + 'd') + ' via=' + dg.firstCls);
    console.log('§NAMED ' + bld + ' ' + it.cls + ' seq=' + it.seq + ' phase=' + it.phase +
      ' bz=' + it.bz.toFixed(2) + ' beforeRepair=' + (before[it.guid] / D).toFixed(1) + 'd afterRepair=' +
      (it.s / D).toFixed(1) + 'd shift=' + ((it.s - before[it.guid]) / D).toFixed(1) + 'd "' + (nameOf[it.guid] || '').slice(0, 50) + '"');
  });
  console.log('§NAMED_TOTAL ' + bld + ' matched=' + n + ' for NAMEQ="' + NAMEQ + '"');
})();

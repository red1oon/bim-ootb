#!/usr/bin/env node
// witness_s50_cell_engine.js — §S50 (4D_GANTT_TM_REFACTOR.md §S50): does run() gate correctly per building,
// produce finite deterministic times on the cell path, and leave the graph path byte-identical?
// ISSUE proved/disproved: the cell path emits a real schedule (finite, duration-preserving) and
// the GRAPH fallback building's times are IDENTICAL to the pre-§S50 engine on the same inputs.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ZoneIndex = require(path.join(__dirname, '..', 'zone_index.js'));   // §S62: sliced _zoneIndexBuild delegates to it
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const CpmSchedule = require(path.join(__dirname, '..', 'cpm_schedule.js'));
globalThis.RoomWalker = require(path.join(__dirname, '..', 'lib', 'room_walker.js'));
globalThis.LevelDeriver = require(path.join(__dirname, '..', 'lib', 'level_deriver.js'));
globalThis.LocationAxis = require(path.join(__dirname, '..', 'location_axis.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

function sliceFn(src, name, which, optional) {
  let from = 0;
  for (let p = 0; p <= (which || 0); p++) {
    const idx = src.indexOf('function ' + name + '(', from);
    if (idx < 0) { if (optional) return null; throw new Error(name + ' not found'); }
    let depth = 0, i = idx, seenOpen = false;
    for (; i < src.length; i++) {
      if (src[i] === '{') { depth++; seenOpen = true; }
      else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
    }
    if (p === (which || 0)) return src.slice(idx, i + 1);
    from = i + 1;
  }
}
const zoneParts = [sliceFn(tmSrc, '_zoneIndexBuild', 0, true), sliceFn(tmSrc, '_zoneIndex', 0, true)].filter(Boolean);
const classifyParts = [sliceFn(tmSrc, '_classifyNameOverride', 0, true), sliceFn(tmSrc, '_classifyRule', 0, true)].filter(Boolean);
const sliced = ['var _CPM_DISPLAY = true;',
  (zoneParts.length === 2 ? 'var _zoneMemo = [];' : ''), zoneParts[0] || '', zoneParts[1] || '',
  sliceFn(tmSrc, '_zoneOf', 0, true) || '',
  classifyParts[0] || '', classifyParts[1] || '',
  sliceFn(tmSrc, '_promoteRoofLoadPath'), sliceFn(tmSrc, '_buildXrayElements')].join('\n');

function loadRatesTable() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  return (new Function(txt.slice(start, txt.indexOf('};', defIdx) + 2) + '\n return RATES;'))();
}

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
function resolveDbFile(bld) {
  const meta = path.join(BLD_DIR, bld + '_meta.db');
  if (fs.existsSync(meta)) return meta;
  return path.join(BLD_DIR, bld + '_extracted.db');
}
const BUILDINGS = (process.env.ONLY || 'Clinic,Duplex').split(',');

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rulesJson.SEQUENCE_RULES, SD = rulesJson.SEQUENCE_DEFAULT, LR = rulesJson.LABOR_RATES;
  const NO = rulesJson.SEQUENCE_NAME_OVERRIDES || rulesJson.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();
  let bad = 0;

  for (const bld of BUILDINGS) {
    const dbPath = resolveDbFile(bld);
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const sandbox = { console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
      window: { SEQUENCE_RULES: SR, SEQUENCE_DEFAULT: SD, SEQUENCE_NAME_OVERRIDES: NO, LABOR_RATES: RATES.LABOR_RATES },
      ZoneIndex: ZoneIndex,
      ScheduleGate: ScheduleGate, Math: Math, A: () => ({ db: db }), URLSearchParams: URLSearchParams };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements;', sandbox);
    const els = sandbox.__bxe();
    const geoEls = els.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
    const nameOf = {};
    const nr = db.exec("SELECT guid, COALESCE(element_name,'') FROM elements_meta");
    if (nr.length) nr[0].values.forEach(v => { nameOf[v[0]] = v[1]; });
    const frag = ScheduleAuthor._classFragmentation(db, RATES);
    const lin = ScheduleAuthor._linearWeighting(db, RATES);
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
    const maxCrews = {};
    for (const rk in LR) if (LR[rk].max_crews) maxCrews[rk] = LR[rk].max_crews;
    const quiet = console.log; console.log = () => {};
    let sched;
    try { sched = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews); } finally { console.log = quiet; }
    const mkItems = () => geoEls.map(e => ({ guid: e.guid, s: sched[e.guid].start, e: sched[e.guid].end,
      bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq,
      phase: e.phase, storey: e.storey, resource: e.resource }));

    // 1) new engine, WITH db (gated)
    const items = mkItems();
    const r = CpmSchedule.run(items, { maxCrews: maxCrews, db: db, label: bld });
    const gatePath = r.gate ? r.gate.path : 'GRAPH';
    let nonFinite = 0, durBroken = 0;
    for (let i = 0; i < items.length; i++) {
      const t = r.solution.times[i];
      if (!isFinite(t.s) || !isFinite(t.e)) nonFinite++;
      const d0 = Math.max(0, items[i].e - items[i].s);
      if (Math.abs((t.e - t.s) - d0) > 1) durBroken++;
    }
    console.log('§SMOKE_S50 ' + bld + ' path=' + gatePath + ' nonFinite=' + nonFinite +
      ' durBroken=' + durBroken + ' makespanDays=' + r.solution.makespanDays.toFixed(1));
    if (nonFinite || durBroken) bad++;

    // 2) determinism: run again, times must be identical
    const items2 = mkItems();
    const r2 = CpmSchedule.run(items2, { maxCrews: maxCrews, db: db, label: bld });
    let diff = 0;
    for (let i = 0; i < items.length; i++) {
      if (r.solution.times[i].s !== r2.solution.times[i].s || r.solution.times[i].e !== r2.solution.times[i].e) diff++;
    }
    console.log('§SMOKE_S50 ' + bld + ' determinism diffs=' + diff + ' (must be 0)');
    if (diff) bad++;

    // 3) graph-path identity: run WITHOUT db (legacy caller) vs pre-§S50 semantics — for a GRAPH
    // building the WITH-db result must equal the WITHOUT-db result too.
    if (gatePath === 'GRAPH') {
      const items3 = mkItems();
      const r3 = CpmSchedule.run(items3, { maxCrews: maxCrews });   // no db -> legacy graph path
      let gdiff = 0;
      for (let i = 0; i < items.length; i++) {
        if (r.solution.times[i].s !== r3.solution.times[i].s || r.solution.times[i].e !== r3.solution.times[i].e) gdiff++;
      }
      console.log('§SMOKE_S50 ' + bld + ' graphPathIdentity diffs=' + gdiff + ' (gated-GRAPH must equal legacy no-db run)');
      if (gdiff) bad++;
    }
    db.close();
  }
  console.log('§SMOKE_S50_SUMMARY bad=' + bad);
  process.exit(bad ? 1 : 0);
})();

#!/usr/bin/env node
// witness_s55_identity_vs_cell.js — §S55 (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S55):
// does AUTHORED TASK IDENTITY keep the §S51 cell win, or replace the cell grain?
//
// ISSUE this witness proves/disproves: §S51's "0 wide cells" (Hospital 0/451, Terminal 0/197,
// Clinic 0/255 — §S51.2) was measured at idx=null — every shipped DB carries tasks=0 /
// task_elements=0 (Terminal_meta.db has no such table at all), so no op ever resolved to a task.
// But gantt_model.js groupKeyOf is `tid ? 'T:'+tid : cellId ? 'C:'+cellId : storey|phase` — a real
// task id OUTRANKS the cell stamp. The authoring path (schedule_author.js materializeZones, :463+
// writes tasks/task_elements in-session) creates exactly that identity, and nobody has measured
// what a REAL authored index does to the §S51 grain. This witness runs the drawer's own model
// (GanttModel.buildTasks — required as the real module, never re-implemented) on the same items
// twice: idx=null (today's live state) and idx from a REAL materializeZones run (never a synthetic
// guid→task map — constraint §S55.2.1), and reports both grains plus the key split and coverage.
//
// DECLARED BEFORE THE RUN (§S55.1): PASS = wide stays 0 AND bar count stays at the CELL grain.
// FINDING (not a failure — expected if identity outranks the cell stamp, which the code says it
// does) = bar count collapses toward the TASK grain (Hospital ≈35, Terminal ≈72) and/or wide > 0.
// A FINDING is REPORTED, never "fixed" here — no engine file changes in this PR (§S55 constraint).
// The witness exit code judges INSTRUMENT INTEGRITY (the checks below), not PASS-vs-FINDING.
//
//   W-S55-0a  precondition per building: the SHIPPED db has NO authored schedule rows — proves
//             idx=null IS today's live state (the §S55 premise), not an assumption.
//   W-S55-0b  the building takes the CELL path (gate.path === 'CELL') — the fleet is the three
//             cell-path buildings; a GRAPH routing here would measure the wrong §S51 surface.
//   W-S55-1   idx=null reproduces the §S51 lock on this witness's own items: wide bars == 0
//             (the §S51.2 AFTER row, same instrument as witness_midair_zero's §S51_SCREEN).
//   W-S55-2   the authoring run is REAL: materializeZones ok AND tasks/task_elements rows exist in
//             THIS db afterwards — written by schedule_author.js:463+, not hand-made (§S55.2.1).
//   W-S55-3   accounting: identified+unidentified == ELEMENT_PLACE op count, and the T:/C:/
//             storey|phase bar split sums to the bar count — the split is the drawer's own output,
//             not an inference; a double-count or a dropped op would show here.
//   W-S55-4   non-vacuous: identified > 0 — the authored index actually covers ops; at 0 coverage
//             the T:-branch never runs and the §S55 question would be untested, green by absence.
//
// Instrument notes (why each choice is the LIVE path, not an approximation):
//   - items/times: same pipeline as witness_midair_zero — _buildXrayElements +
//     ScheduleAuthor classification + ScheduleGate.computeSchedule, then _displayTimeline's CPM
//     branch (the timeline kernel_ops is written from, i.e. what the drawer draws); cell stamps
//     from CpmSchedule's gate.cellKeys, exactly what injectGantt stamps as p._cell (§S51.2 link 2).
//   - the authoring call mirrors the real UI call site (time_machine.js buildTaskIndex regen,
//     :5722): start/laborRates/rates/scheduleGate/shiftHours(rates.js SHIFT_HOURS=24)/genVersion.
//     opts.displayRemap is omitted (legacy branch, byte-identical per materializeZones' own
//     comment): it only re-times task WINDOWS, and buildTasks takes bar spans from the OPS'
//     start_ts/end_ts and only taskId/name from the idx — it cannot move any number measured here.
//   - idx: buildTaskIndex-equivalent — the SAME two SQL shapes time_machine.js:5733/:5739 runs,
//     schedule_id = 'SCH_AUTHORED' (the id materializeZones just wrote — the row activeSchedule
//     would resolve).
//
// Command: BLD_DIR=~/bim-ootb/buildings node tests/witness_s55_identity_vs_cell.js  (from viewer/)
// Read the § log lines, not the exit code alone (Log Mandate).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ZoneIndex = require(path.join(__dirname, '..', 'zone_index.js'));   // §S62: sliced _zoneIndexBuild delegates to it
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const CpmSchedule = require(path.join(__dirname, '..', 'cpm_schedule.js'));
const SupportSweep = require(path.join(__dirname, '..', 'support_sweep.js'));   // §S58
const GanttModel = require(path.join(__dirname, '..', 'gantt_model.js'));   // the drawer's REAL model (§S53) — never re-implemented here
globalThis.RoomWalker = require(path.join(__dirname, '..', 'lib', 'room_walker.js'));
globalThis.LevelDeriver = require(path.join(__dirname, '..', 'lib', 'level_deriver.js'));
globalThis.LocationAxis = require(path.join(__dirname, '..', 'location_axis.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function finish() { console.log('\n§S55_SUMMARY pass=' + pass + ' fail=' + fail); process.exit(fail ? 1 : 0); }

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
    if (i >= src.length) throw new Error('unbalanced braces for ' + name);
    if (p === (which || 0)) return src.slice(idx, i + 1);
    from = i + 1;
  }
  throw new Error('unreachable');
}
// Same slice list as witness_midair_zero (§S20 discipline): _displayTimeline is the LIVE authoring
// of the display timeline; CpmSchedule/GanttModel are real modules, never sliced.
const zoneParts = [sliceFn(tmSrc, '_zoneIndexBuild', 0, true), sliceFn(tmSrc, '_zoneIndex', 0, true)].filter(Boolean);
const classifyParts = [sliceFn(tmSrc, '_classifyNameOverride', 0, true), sliceFn(tmSrc, '_classifyRule', 0, true)].filter(Boolean);
const sliced = ['var _CPM_DISPLAY = true;',
  (zoneParts.length === 2 ? 'var _zoneMemo = [];' : ''), zoneParts[0] || '', zoneParts[1] || '',
  sliceFn(tmSrc, '_zoneOf', 0, true) || '',
  classifyParts[0] || '', classifyParts[1] || '',
  sliceFn(tmSrc, '_promoteRoofLoadPath'), sliceFn(tmSrc, '_buildXrayElements'),
  'var _contactGraph = SupportSweep.contactGraph, _designatedSupport = SupportSweep.designatedSupport, _midairAudit = SupportSweep.midairAudit;',   // §S58: real module, not source-text slices
  sliceFn(tmSrc, '_displayTimelineRemember'), sliceFn(tmSrc, '_displayTimeline')].join('\n');

function loadRatesTable() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  return (new Function(txt.slice(start, txt.indexOf('};', defIdx) + 2) + '\n return RATES;'))();
}
// The genVersion the real UI call site passes (_GANTT_CACHE_VERSION) — read from source, not copied.
const _GCV = (tmSrc.match(/var _GANTT_CACHE_VERSION = (\d+);/) || [])[1];

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
// §S39/§S37-A2 rule: prefer <bld>_meta.db when it exists, else <bld>_extracted.db — and LOG it.
function resolveDbFile(bld) {
  const meta = path.join(BLD_DIR, bld + '_meta.db');
  if (fs.existsSync(meta)) return { path: meta, kind: 'meta' };
  return { path: path.join(BLD_DIR, bld + '_extracted.db'), kind: 'extracted' };
}
const BUILDINGS = (process.env.ONLY || 'Hospital,Terminal,Clinic').split(',');

function authoredRowCounts(db) {
  // Terminal_meta.db has NO tasks table at all — that IS the shipped state, count it as 0/0.
  const count = sql => { try { const r = db.exec(sql); return r.length ? r[0].values[0][0] : 0; } catch (e) { return 0; } };
  return { tasks: count('SELECT COUNT(*) FROM tasks'), taskElements: count('SELECT COUNT(*) FROM task_elements') };
}

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rulesJson.SEQUENCE_RULES, SD = rulesJson.SEQUENCE_DEFAULT, LR = rulesJson.LABOR_RATES;
  const NO = rulesJson.SEQUENCE_NAME_OVERRIDES || rulesJson.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();

  for (const bld of BUILDINGS) {
    const t0 = Date.now();
    const dbPick = resolveDbFile(bld);
    console.log('\n§S55_DBFILE ' + bld + ' using=' + path.basename(dbPick.path) + ' kind=' + dbPick.kind);
    if (!fs.existsSync(dbPick.path)) { assert(false, 'W-S55 ' + bld + ' fixture missing: ' + dbPick.path); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPick.path));
    try {
      // ── W-S55-0a: the shipped DB really has no authored schedule (the §S55 premise) ──
      const shipped = authoredRowCounts(db);
      assert(shipped.tasks === 0 && shipped.taskElements === 0,
        'W-S55-0a ' + bld + ' shipped DB has NO authored rows (tasks=' + shipped.tasks +
        ' task_elements=' + shipped.taskElements + ') — idx=null IS today\'s live state');

      // ── items + display timeline: same pipeline as witness_midair_zero ──
      const sandbox = { console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
        window: { SEQUENCE_RULES: SR, SEQUENCE_DEFAULT: SD, SEQUENCE_NAME_OVERRIDES: NO,
                  LABOR_RATES: RATES.LABOR_RATES, GanttModel: GanttModel },
        ZoneIndex: ZoneIndex,
        ScheduleGate: ScheduleGate, SupportSweep: SupportSweep, Math: Math, A: () => ({ db: db }),
        URLSearchParams: URLSearchParams, CpmSchedule: CpmSchedule };
      vm.createContext(sandbox);
      vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements; this.__dt = _displayTimeline;', sandbox);
      const els = sandbox.__bxe();
      if (!els || !els.length) { assert(false, 'W-S55 ' + bld + ' element build produced nothing'); db.close(); continue; }
      const nameOf = {};
      const nr = db.exec("SELECT guid, COALESCE(element_name,'') FROM elements_meta");
      if (nr.length) nr[0].values.forEach(v => { nameOf[v[0]] = v[1]; });
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
      const maxCrews = {};
      for (const rk in LR) if (LR[rk].max_crews) maxCrews[rk] = LR[rk].max_crews;
      let quiet = console.log; console.log = () => {};
      let sched;
      try { sched = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews); } finally { console.log = quiet; }
      const items = geoEls.map(e => ({ guid: e.guid, s: sched[e.guid].start, e: sched[e.guid].end,
        bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq,
        phase: e.phase, storey: e.storey, resource: e.resource }));
      sandbox.__items = items;
      globalThis.APP = { db: db };
      let dtResult;
      try { dtResult = vm.runInContext('this.__dt(this.__items);', sandbox); }
      finally { delete globalThis.APP; }
      const gate = dtResult && dtResult.stats && dtResult.stats.gate;
      // ── W-S55-0b: this building takes the CELL path (the surface §S51 locked) ──
      assert(gate && gate.path === 'CELL' && gate.cellKeys,
        'W-S55-0b ' + bld + ' routes to the CELL path with cellKeys (path=' + (gate ? gate.path : 'none') +
        ') — the §S51 surface this witness measures');
      if (!gate || !gate.cellKeys) { db.close(); continue; }

      // ── ops: what injectGantt writes — display times + the _cell stamp (§S51.2 links 1+2) ──
      const ops = items.map((it, i) => ({ op_type: 'ELEMENT_PLACE', start_ts: it.s, end_ts: it.e,
        output_guid: it.guid, parameters: { storey: it.storey || '_UNKNOWN',
          phase: it.phase || 'Architecture', _cell: gate.cellKeys[i] } }));
      let lo = Infinity, hi = -Infinity;
      items.forEach(it => { if (it.s < lo) lo = it.s; if (it.e > hi) hi = it.e; });
      const span = hi - lo;
      const wideOf = bars => bars.filter(b => span && (b.endTs - b.startTs) / span > 0.5).length;

      // ── grain 1: idx=null — today's live state (no authored schedule in any shipped DB) ──
      const rNull = GanttModel.buildTasks(ops, null, SR);
      const wideNull = wideOf(rNull.tasks);
      assert(wideNull === 0,
        'W-S55-1 ' + bld + ' idx=null reproduces the §S51 lock: wide bars=' + wideNull + '/' + rNull.tasks.length +
        ' (must be 0 — the §S51.2 AFTER row, same instrument)');

      // ── the REAL authoring run (schedule_author.js:463+ writes tasks/task_elements) ──
      const authLines = [];
      quiet = console.log; console.log = (...a) => { const s = a.join(' '); if (s[0] === '\u00a7') authLines.push(s); };
      let res;
      try {
        res = ScheduleAuthor.materializeZones(db, SR, { start: '2026-01-01',
          laborRates: RATES.LABOR_RATES, rates: RATES, scheduleGate: ScheduleGate,
          shiftHours: 24, genVersion: _GCV ? Number(_GCV) : undefined });   // rates.js SHIFT_HOURS=24; mirrors time_machine.js:5722
      } finally { console.log = quiet; }
      authLines.forEach(l => console.log('    ' + l));
      const after = authoredRowCounts(db);
      assert(res && res.ok && after.tasks > 0 && after.taskElements > 0,
        'W-S55-2 ' + bld + ' REAL authoring run wrote rows into THIS db (ok=' + !!(res && res.ok) +
        ' tasks=' + after.tasks + ' task_elements=' + after.taskElements + ') — never a synthetic map');

      // ── buildTaskIndex-equivalent lookup (same SQL shapes as time_machine.js:5733/:5739) ──
      const idx = { guidTask: {}, tasks: {} };
      const tr = db.exec("SELECT task_id, name FROM tasks WHERE schedule_id='SCH_AUTHORED' AND (is_summary IS NULL OR is_summary=0)");
      if (tr.length) tr[0].values.forEach(row => { idx.tasks[row[0]] = { id: row[0], name: row[1] }; });
      const er = db.exec("SELECT te.guid, te.task_id FROM task_elements te JOIN tasks t ON t.task_id = te.task_id WHERE t.schedule_id='SCH_AUTHORED'");
      if (er.length) er[0].values.forEach(row => { idx.guidTask[row[0]] = row[1]; });
      const taskN = Object.keys(idx.tasks).length;

      // ── grain 2: the SAME ops through the SAME drawer model, real idx ──
      const rReal = GanttModel.buildTasks(ops, idx, SR);
      const wideReal = wideOf(rReal.tasks);
      const tBars = rReal.tasks.filter(b => b.taskId).length;
      const cBars = rReal.tasks.filter(b => !b.taskId && b.cell).length;
      const spBars = rReal.tasks.length - tBars - cBars;

      // ── W-S55-3: the drawer's own accounting adds up (no dropped op, no double count) ──
      assert(rReal.identified + rReal.unidentified === ops.length && tBars + cBars + spBars === rReal.tasks.length,
        'W-S55-3 ' + bld + ' accounting: identified ' + rReal.identified + ' + unidentified ' + rReal.unidentified +
        ' == ops ' + ops.length + '; split ' + tBars + '+' + cBars + '+' + spBars + ' == bars ' + rReal.tasks.length);
      // ── W-S55-4: coverage is non-zero — the T:-branch actually ran ──
      assert(rReal.identified > 0,
        'W-S55-4 ' + bld + ' authored idx covers ops (identified=' + rReal.identified +
        ') — at 0 the §S55 question would be untested, green by absence');

      console.log('§S55_IDENTITY ' + bld + ' ops=' + ops.length + ' authoredTasks=' + taskN +
        ' | idxNull: bars=' + rNull.tasks.length + ' wide=' + wideNull +
        ' | realIdx: bars=' + rReal.tasks.length + ' wide=' + wideReal +
        ' split T:=' + tBars + ' C:=' + cBars + ' storey|phase=' + spBars +
        ' coverage identified=' + rReal.identified + ' unidentified=' + rReal.unidentified);
      // §S55.1 verdict — declared before the run: PASS = wide stays 0 AND the CELL grain holds.
      const verdict = (wideReal === 0 && rReal.tasks.length === rNull.tasks.length) ? 'PASS' : 'FINDING';
      console.log('§S55_VERDICT ' + bld + ' ' + verdict +
        (verdict === 'FINDING'
          ? ' — cell grain ' + rNull.tasks.length + ' bars -> ' + rReal.tasks.length +
            ' under authored identity (wide ' + wideNull + ' -> ' + wideReal + '); expected shape if tid outranks _cell; REPORTED, not fixed here (§S55.1)'
          : ' — authored identity preserved the §S51 cell grain (' + rNull.tasks.length + ' bars, 0 wide)'));
      console.log('§S55_TIMING ' + bld + ' ms=' + (Date.now() - t0));
    } catch (e) {
      assert(false, 'W-S55 ' + bld + ' run failed: ' + e.message);
    } finally { db.close(); }
  }
  finish();
})();

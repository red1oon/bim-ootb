#!/usr/bin/env node
// witness_gantt_native_generate.js — §GANTT_AUTHOR_ENTRY native (2026-08-05), updated for
// §GANTT_EDIT_LOCK (2026-08-05, same day): the drawer auto-materializes via the real engine
// directly, with NO button and NO ScheduleAuthorUI side panel left reachable at all any more — not
// even for a captured schedule (that fallback was removed on user ruling, "prefer to edit right in
// the gantt chart itself"). Proves the captured-schedule guard still prevents a synthetic schedule
// from being generated on top of a real imported (Bonsai/Revit/IFC-native) one, and that doing so
// never touches the old panel. Sliced by balanced braces from the real shipped function — same
// convention as commitGanttDrag/undoLastGanttEdit's witnesses, never reimplemented.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
const SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

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
// generateGanttSchedule references two module-level names this single-function slice lacks:
//   _GANTT_CACHE_VERSION (since §GANTT_SCHEDULE_STALE 2026-08-14 — this witness has thrown
//   ReferenceError and exited before asserting anything since then, verified on unmodified main
//   2026-08-16) — read the REAL value out of the source, never a hand-typed copy to drift; and
//   _tmDisplayRemap (§ZONE_DISPLAY_AUTHORING 2026-08-16) — stubbed to null here: the remap's own
//   behavior is witnessed end-to-end in witness_zone_display_authoring.js, this witness owns the
//   native-generate wiring only, and a null remap takes materializeZones' legacy branch.
const _verMatch = tmSrc.match(/var _GANTT_CACHE_VERSION = (\d+);/);
if (!_verMatch) throw new Error('_GANTT_CACHE_VERSION not found in time_machine.js');
const sliced = 'var _GANTT_CACHE_VERSION = ' + _verMatch[1] + ';\n' +
  'var _tmDisplayRemap = function () { return null; };\n' +
  sliceFn(tmSrc, 'generateGanttSchedule');

function loadRules() {
  var txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  var start = txt.indexOf('var RATES = {');
  var defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  var end = txt.indexOf('};', defIdx) + 2;
  var slice = txt.slice(start, end);
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, LABOR_RATES: LABOR_RATES, RATES: RATES };'))();
}

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BUILDING = process.argv[2] || 'Duplex';

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const dbPath = path.join(BLD_DIR, BUILDING + '_extracted.db');
  if (!fs.existsSync(dbPath)) { console.log('§SKIP ' + BUILDING + ' fixture missing'); return; }
  const rules = loadRules();

  // ── Scenario A: no schedule exists yet — native generate must actually create one ──
  {
    const db = new SQL.Database(fs.readFileSync(dbPath));
    var toggleCalled = 0, tipMsgs = [];
    const sandbox = {
      console: console, JSON: JSON, Date: Date, Math: Math, setTimeout: setTimeout,
      window: { ScheduleAuthor: ScheduleAuthor, ScheduleGate: ScheduleGate,
        SEQUENCE_RULES: rules.SEQUENCE_RULES, LABOR_RATES: rules.LABOR_RATES, RATES: rules.RATES,
        ScheduleAuthorUI: { toggle: function () { toggleCalled++; } },
        tmRefoldSchedule: function () { /* no-op in this headless harness — refresh path proven elsewhere */ } },
      A: function () { return { db: db }; },
      document: { getElementById: function () { return { textContent: '', style: {} }; } },
      invalidateGanttModel: function () {}, computeDays: function () {}, drawGanttMini: function () {}, renderAtTime: function () {}, _cursor: 0
    };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nglobalThis.__gen = generateGanttSchedule;', sandbox);
    sandbox.__gen();

    const tr = db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_id='SCH_AUTHORED'");
    const taskCount = tr.length ? tr[0].values[0][0] : 0;
    assert(taskCount > 0, 'Scenario A (' + BUILDING + ', no schedule yet): native generate created real SCH_AUTHORED tasks — count=' + taskCount);
    assert(toggleCalled === 0, 'Scenario A: the old ScheduleAuthorUI panel was NEVER opened — this is the native path, not a redirect');
    db.close();
  }

  // ── Scenario B: a captured (imported) schedule already exists — must NOT be clobbered ──
  {
    const db = new SQL.Database(fs.readFileSync(dbPath));
    // A real schedule under a non-SCH_AUTHORED id — the SAME real materializeZones call (real
    // columns, real write path), just a different scheduleId, standing in for a real Bonsai/Revit
    // import the same way activeSchedule() actually distinguishes one: schedule_id !== 'SCH_AUTHORED'.
    const seed = ScheduleAuthor.materializeZones(db, rules.SEQUENCE_RULES,
      { scheduleId: 'IMPORTED_1', start: '2026-01-01', laborRates: rules.LABOR_RATES, rates: rules.RATES, scheduleGate: ScheduleGate });
    if (!seed.ok) { console.log('§SKIP Scenario B — seed schedule failed: ' + JSON.stringify(seed)); db.close(); return; }

    var toggleCalled = 0;
    const sandbox = {
      console: console, JSON: JSON, Date: Date, Math: Math, setTimeout: setTimeout,
      window: { ScheduleAuthor: ScheduleAuthor, ScheduleGate: ScheduleGate,
        SEQUENCE_RULES: rules.SEQUENCE_RULES, LABOR_RATES: rules.LABOR_RATES, RATES: rules.RATES,
        ScheduleAuthorUI: { toggle: function () { toggleCalled++; } },
        tmRefoldSchedule: function () {} },
      A: function () { return { db: db }; },
      document: { getElementById: function () { return { textContent: '', style: {} }; } },
      invalidateGanttModel: function () {}, computeDays: function () {}, drawGanttMini: function () {}, renderAtTime: function () {}, _cursor: 0
    };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nglobalThis.__gen = generateGanttSchedule;', sandbox);
    sandbox.__gen();

    const tr = db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_id='SCH_AUTHORED'");
    const authoredCount = tr.length ? tr[0].values[0][0] : 0;
    assert(authoredCount === 0, 'Scenario B (captured schedule exists): materializeZones was NOT run — no SCH_AUTHORED tasks were created — count=' + authoredCount);
    assert(toggleCalled === 0, 'Scenario B: the old panel is NEVER opened any more (§GANTT_EDIT_LOCK, 2026-08-05) — a captured schedule is left as imported and edited via the drawer itself');
    const importedStillThere = db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_id='IMPORTED_1'")[0].values[0][0];
    const expected = seed.zoneCount + 1;   // + TASK_ROOT
    assert(importedStillThere === expected, 'Scenario B: the real imported schedule is completely untouched — expected=' + expected + ' actual=' + importedStillThere);
    db.close();
  }

  console.log('\n§W-NATIVE-GEN SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§NATIVE_GEN_ERROR', e); process.exit(1); });

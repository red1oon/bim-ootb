#!/usr/bin/env node
// WITNESS — W-S7-INJECT — viewer/schedule_inject.js `inject(A, opts)`.
// Spec: bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S7-INJECT / §S7-INJECT-WITNESS.
//
// ISSUE THIS PROVES OR DISPROVES: §S7-INJECT's whole reason for existing is "materialize the
// schedule ONCE, on the fly" — the user should never have to find ✎ Author before S7 works. That
// claim has three parts that must ALL hold or the feature either does nothing, does it twice, or
// silently fails to reach the template grain §S7-GRAIN requires: (1) on a real `schedules=0`
// building, ONE call creates EXACTLY one schedule via the CANONICAL template path (not the 7-phase
// `materializeDefault` §S7-GRAIN explicitly forbids for this leg); (2) `windowForGuid` — the SAME
// reader the panel/hover use — then resolves a real construction window for a guid that has a task,
// proving the injected schedule is actually usable, not just present; (3) calling `inject()` AGAIN
// on the SAME (now-scheduled) db is a no-op — it must not double-materialize, re-name, or touch a
// single row, or "once" would be a lie the second time a user (or a stray double-tap) triggers it.
// The start date is also checked byte-for-byte against the '2026-01-01' literal (Prime Directive:
// deterministic, never Date.now()).
//
// POPULATION: Duplex_extracted.db (9.6MB, real building, verified `schedules=0`) as the primary,
// fully-checked case, and JKR_extracted.db (~196MB, also verified `schedules=0`) as a second, larger
// real building for the same claims at a different scale — both from
// prompts/TM_4D5D_VARIANCE_LANE.md's TEST DATA section, neither fabricated. Each test loads its OWN
// fresh in-memory copy from the real file on disk; nothing here writes back to the file.
//
// Command: BLD_DIR=~/bim-ootb/buildings node viewer/tests/witness_s7_inject.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
// §SQLJS_MISSING (PR #1730's class of bug) — same fallback the other S7 witnesses use.
const initSqlJs = (function () {
  try { return require('sql.js'); } catch (e) {
    const alt = path.join(process.env.SQLJS_HOME || path.join(os.homedir(), 'bim-ootb'), 'node_modules', 'sql.js');
    try { return require(alt); } catch (e2) {
      console.log('§SQLJS_MISSING neither require("sql.js") nor ' + alt + ' resolved — set SQLJS_HOME');
      throw e2;
    }
  }
})();
const ScheduleAuthor = require('../schedule_author.js');
const ScheduleRead4D = require('../schedule_read_4d.js');
const ScheduleGate = require('../schedule_gate.js');
const ScheduleInject = require('../schedule_inject.js');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');

// Real rates.js globals, sliced the same way witness_gantt_native_generate.js does — never a
// hand-typed second copy of SEQUENCE_RULES/LABOR_RATES/SEQUENCE_DEFAULT.
function loadRules() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  const end = txt.indexOf('};', defIdx) + 2;
  const slice = txt.slice(start, end);
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, LABOR_RATES: LABOR_RATES, RATES: RATES };'))();
}
// The real, live-fetched-in-the-browser template (time_machine.js _load4DTemplate) — read from disk
// here exactly as other Node witnesses do (probe_tpl_model_stream.js etc.), never a second template.
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', '4D_template.json'), 'utf8'));

function loadDb(SQL, file) { return new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD_DIR, file)))); }
function tableCount(db, t) { try { const r = db.exec('SELECT COUNT(*) FROM ' + t); return r.length ? r[0].values[0][0] : 0; } catch (e) { return -1; } }

async function run(file, opts) {
  const SQL = await initSqlJs();
  const rules = loadRules();
  console.log('-- ' + file + ' --');

  const db = loadDb(SQL, file);
  const before = { schedules: tableCount(db, 'schedules'), tasks: tableCount(db, 'task_elements') };
  assert(before.schedules === 0, file + ': verified schedules=0 BEFORE injection (real no-schedule building, §S7-DATA-REALITY population)');

  const A = { db: db };   // no DB_URL — §S7-INJECT allows this (materialize succeeds, persist is skipped honestly, see witness_s7_inject_persist.js for the real save leg)
  const logs = [];
  const origLog = console.log;
  console.log = function (...a) { logs.push(a.join(' ')); origLog.apply(console, a); };
  let res;
  try { res = await ScheduleInject.inject(A, { scheduleAuthor: ScheduleAuthor, rules: rules.SEQUENCE_RULES, laborRates: rules.LABOR_RATES, scheduleGate: ScheduleGate, template: TEMPLATE }); }
  finally { console.log = origLog; }

  assert(!!(res && res.ok), file + ': inject() reports ok=true (reason=' + (res && res.reason) + ')');
  assert(logs.some(l => l.indexOf('§TPL_MODEL model=template') === 0 || l.indexOf('§TPL_MODEL model=template') > 0),
    file + ': materializeZones took the CANONICAL TEMPLATE path (§TPL_MODEL model=template), not the legacy 7-phase envelope §S7-GRAIN forbids for this leg');
  assert(logs.some(l => /§AUTHOR_TPL /.test(l)), file + ': the real template-instantiation writer (§AUTHOR_TPL) fired');

  const after = { schedules: tableCount(db, 'schedules'), tasks: tableCount(db, 'tasks') };
  assert(after.schedules === 1, file + ': EXACTLY ONE schedule row exists after injection (schedules=' + after.schedules + ')');
  assert(after.tasks > 1, file + ': real leaf tasks were written (tasks=' + after.tasks + ', includes TASK_ROOT)');   // §S7-GRAIN: many, not 7-8

  // ── determinism: the literal '2026-01-01', never Date.now() ────────────────────────────────────
  const rootRow = db.exec("SELECT schedule_start FROM tasks WHERE task_id='TASK_ROOT'");
  const rootStart = rootRow.length && rootRow[0].values.length ? rootRow[0].values[0][0] : null;
  assert(rootStart === '2026-01-01', file + ": TASK_ROOT.schedule_start is the '2026-01-01' LITERAL (got " + rootStart + '), never Date.now()');

  // ── windowForGuid resolves a real window for a member guid (the actual read path #info-4d uses) ─
  const gr = db.exec('SELECT te.guid FROM task_elements te LIMIT 1');
  const guid = gr.length && gr[0].values.length ? gr[0].values[0][0] : null;
  assert(!!guid, file + ': have a real member guid from the freshly-injected schedule');
  const win = guid ? ScheduleRead4D.windowForGuid(db, guid, { scheduleAuthor: ScheduleAuthor }) : null;
  assert(!!(win && win.startDate && win.finishDate), file + ': windowForGuid resolves a real window for that guid (' + JSON.stringify(win) + ')');

  // ── re-running injection on the NOW-scheduled db is a no-op ──────────────────────────────────────
  const exportBefore = Buffer.from(db.export());
  const res2 = await ScheduleInject.inject(A, { scheduleAuthor: ScheduleAuthor, rules: rules.SEQUENCE_RULES, laborRates: rules.LABOR_RATES, scheduleGate: ScheduleGate, template: TEMPLATE });
  const exportAfter = Buffer.from(db.export());
  assert(res2 && res2.ok === false && res2.reason === 'exists', file + ': re-running inject() is a documented no-op (reason=' + (res2 && res2.reason) + '), not a silent success or a second write');
  assert(exportBefore.equals(exportAfter), file + ": re-running inject() left the db BYTE-IDENTICAL (db.export() unchanged) — 'once' really means once");
  assert(tableCount(db, 'schedules') === 1, file + ': still exactly one schedule after the no-op re-run');

  db.close();
}

(async () => {
  await run('Duplex_extracted.db');
  await run('JKR_extracted.db');

  console.log('§WITNESS_S7_INJECT pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS — on a real schedules=0 building, inject() creates exactly one schedule via the ' +
    'canonical template path, windowForGuid resolves a real window off it, dates are the deterministic ' +
    "2026-01-01 literal, and re-running injection is a byte-identical no-op — the 'once' claim holds.");
})().catch((e) => { console.error('§WITNESS_S7_INJECT CRASHED ' + (e && e.stack || e)); process.exitCode = 2; });

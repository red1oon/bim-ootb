#!/usr/bin/env node
// WITNESS — W-S7-INJECT-GUARD — viewer/schedule_inject.js's NEVER OVERWRITE guard.
// Spec: bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S7-INJECT ("NEVER OVERWRITE") / §S7-INJECT-WITNESS.
//
// ISSUE THIS PROVES OR DISPROVES: §S7-INJECT is convenience bolted onto a feature that, done wrong,
// is a DATA-LOSS bug — auto-generating a schedule the instant one is missing would also fire on a
// building that has a real schedule for a reason the code cannot see (a captured Bonsai/Revit
// import, or the user's own edited-and-baselined draft). `ScheduleAuthor.activeSchedule(db)`'s own
// header states the rule this guard exists to enforce: a captured schedule "must not be auto-touched,
// full stop", and once a baseline is set the schedule "is their edited product and must not be
// silently discarded". This witness proves `inject()` refuses in BOTH those cases (not just the
// generic "a schedule already exists" case W-S7-INJECT already covers on a freshly-injected
// SCH_AUTHORED schedule) and that refusing means REFUSING — every row byte-identical afterwards, not
// just "no NEW schedule row" while something else quietly changed.
//
// POPULATION:
//   (1) Hospital_silent.db / HHS_Office_Federated_silent.db — the two REAL fleet DBs that ALREADY
//       carry a persisted schedule (prompts/TM_4D5D_VARIANCE_LANE.md TEST DATA: "already HAVE
//       schedules — use them for the never-overwrite guard"). Both are ordinary SCH_AUTHORED
//       schedules (verified below), so this leg proves the baseline "any active schedule refuses"
//       case on real, unmodified shipped data.
//   (2) CAPTURED: Duplex_extracted.db (real building, schedules=0) + the REAL materializeZones
//       writer, called with `scheduleId: 'IMPORTED_1'` — the SAME technique
//       viewer/tests/witness_gantt_native_generate.js already uses to stand in for a Bonsai/Revit
//       import ("the SAME real materializeZones call... standing in for a real import the same way
//       activeSchedule() actually distinguishes one: schedule_id !== 'SCH_AUTHORED'"). This is a
//       schema-shaped test fixture built by the REAL production writer, not fabricated schedule data.
//   (3) BASELINED: a fresh Duplex_extracted.db copy, materialized via the real SCH_AUTHORED path,
//       then `ScheduleAuthor.setBaseline(db, 'SCH_AUTHORED')` — the REAL ⚑ Set Baseline verb, not a
//       hand-written task_baseline row.
//
// Command: BLD_DIR=~/bim-ootb/buildings node viewer/tests/witness_s7_inject_guard.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
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
const ScheduleGate = require('../schedule_gate.js');
const ScheduleInject = require('../schedule_inject.js');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');

function loadRules() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  const end = txt.indexOf('};', defIdx) + 2;
  const slice = txt.slice(start, end);
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, LABOR_RATES: LABOR_RATES, RATES: RATES };'))();
}
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', '4D_template.json'), 'utf8'));

function loadDb(SQL, absOrRelPath) {
  const p = path.isAbsolute(absOrRelPath) ? absOrRelPath : path.join(BLD_DIR, absOrRelPath);
  return new SQL.Database(new Uint8Array(fs.readFileSync(p)));
}


// §CI_NO_UNDEF — digest, not Buffer. eslint.config.js lints viewer/tests/** with BROWSER globals plus
// the declared project set (eslint.globals.json carries require/process/__dirname; it deliberately does
// NOT carry Buffer, which is not a browser global). A `Buffer.from(db.export())` comparison therefore
// fails the repo's no-undef gate — the right fix is to stop reaching for a Node-only global in a
// browser-linted tree, not to widen the gate for every viewer/ runtime file. A sha256 over the exported
// bytes is also a STRONGER statement of "byte-identical" than .equals(): it names a value the log can
// carry, so a failure shows WHICH digest changed rather than just "not equal".
function _dbDigest(db) {
  return require('crypto').createHash('sha256').update(db.export()).digest('hex');
}

// Assert inject() refuses AND leaves the db byte-identical — the two halves of "never overwrite".
async function assertRefusesUntouched(label, db, rules) {
  const before = _dbDigest(db);
  const res = await ScheduleInject.inject({ db: db }, {
    scheduleAuthor: ScheduleAuthor, rules: rules.SEQUENCE_RULES, laborRates: rules.LABOR_RATES,
    scheduleGate: ScheduleGate, template: TEMPLATE
  });
  const after = _dbDigest(db);
  assert(res && res.ok === false && res.reason === 'exists', label + ': inject() REFUSED (reason=' + (res && res.reason) + '), never a fabricated schedule over an existing one');
  assert(before === after, label + ': every row is BYTE-IDENTICAL after the refused call (sha256 ' + before.slice(0, 12) + ' unchanged) — refusing means refusing, not "no new schedule row while something else moved"');
  return res;
}

(async () => {
  const SQL = await initSqlJs();
  const rules = loadRules();

  // ── (1) real shipped schedules — both ordinary SCH_AUTHORED, not captured, no baseline ───────────
  for (const file of ['Hospital_silent.db', 'HHS_Office_Federated_silent.db']) {
    console.log('-- ' + file + ' (real shipped schedule) --');
    const db = loadDb(SQL, file);
    const sched = ScheduleAuthor.activeSchedule(db);
    assert(!!(sched && sched.id), file + ': has a real active schedule (id=' + (sched && sched.id) + ', captured=' + (sched && sched.captured) + ')');
    const res = await assertRefusesUntouched(file, db, rules);
    assert(res.schedule && res.schedule.id === sched.id, file + ": inject()'s refusal reports the SAME schedule activeSchedule() itself sees (id=" + (res.schedule && res.schedule.id) + ')');
    db.close();
  }

  // ── (2) CAPTURED: a non-SCH_AUTHORED schedule, seeded by the REAL materializeZones writer ────────
  {
    console.log('-- Duplex_extracted.db + seeded IMPORTED_1 (captured) --');
    const db = loadDb(SQL, 'Duplex_extracted.db');
    const seed = ScheduleAuthor.materializeZones(db, rules.SEQUENCE_RULES,
      { scheduleId: 'IMPORTED_1', start: '2026-01-01', laborRates: rules.LABOR_RATES, scheduleGate: ScheduleGate, template: TEMPLATE });
    assert(!!(seed && seed.ok), 'seed: real materializeZones wrote a non-SCH_AUTHORED schedule (IMPORTED_1) ok=' + (seed && seed.ok));
    const sched = ScheduleAuthor.activeSchedule(db);
    assert(!!(sched && sched.captured === true), 'verified activeSchedule(db).captured === true for schedule_id=IMPORTED_1 (real distinguishing rule, not asserted by fiat)');
    await assertRefusesUntouched('Duplex+IMPORTED_1 (captured)', db, rules);
    db.close();
  }

  // ── (3) BASELINED: a real SCH_AUTHORED schedule + the REAL setBaseline() verb ─────────────────────
  {
    console.log('-- Duplex_extracted.db + materialized + real ⚑ Set Baseline --');
    const db = loadDb(SQL, 'Duplex_extracted.db');
    const seed = ScheduleAuthor.materializeZones(db, rules.SEQUENCE_RULES,
      { start: '2026-01-01', laborRates: rules.LABOR_RATES, scheduleGate: ScheduleGate, template: TEMPLATE });
    assert(!!(seed && seed.ok), 'seed: real materializeZones wrote a SCH_AUTHORED schedule ok=' + (seed && seed.ok));
    const baseline = ScheduleAuthor.setBaseline(db, seed.scheduleId || 'SCH_AUTHORED');
    assert(!!(baseline && baseline.ok), 'real ScheduleAuthor.setBaseline() wrote a task_baseline snapshot (taskCount=' + (baseline && baseline.taskCount) + ')');
    const br = db.exec('SELECT COUNT(*) FROM task_baseline');
    assert((br.length ? br[0].values[0][0] : 0) > 0, 'task_baseline table verified non-empty (real baseline present, not asserted by fiat)');
    await assertRefusesUntouched('Duplex+SCH_AUTHORED+baseline', db, rules);
    db.close();
  }

  console.log('§WITNESS_S7_INJECT_GUARD pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS — inject() refuses on every schedule-already-exists shape checked (real shipped ' +
    'SCH_AUTHORED, a seeded CAPTURED import, and a real BASELINED draft), and every refusal leaves the ' +
    'db byte-identical — convenience cannot eat a user\'s own schedule.');
})().catch((e) => { console.error('§WITNESS_S7_INJECT_GUARD CRASHED ' + (e && e.stack || e)); process.exitCode = 2; });

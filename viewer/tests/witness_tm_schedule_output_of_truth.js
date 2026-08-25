#!/usr/bin/env node
// WITNESS — tm_schedule_output_of_truth: the real persisted `tasks` table the TM schedule
// generates, edits, and reloads — not a derived number three steps removed from it.
// Spec: bim-compiler prompts/WITNESS_INTERFACE_FRAMEWORK.md §3.
//
// ISSUE THIS PROVES OR DISPROVES: the user's own question (2026-08-25) — "does any WITNESS confirm
// the actual JSON/DB output of truth the 4D schedule runs on — not just some derived number?"
// WITNESS_CONTRACT_AUDIT.md read all 221 witnesses audited to date and found: no. This is that
// witness, built on witness_kit (the first framework-authored one).
//
// POPULATION: real generated rows, not a fabricated fixture. No shipped on-disk building DB has a
// populated `tasks` table — verified across all 21 buildings/*.db + modeller/*_meta.db (2026-08-25):
// every one is either the legacy-thin schema with 0 rows, or has no tasks table at all. The real
// table only exists at runtime (generative fallback → IndexedDB), so this witness DRIVES the actual
// production generator — schedule_author.js's materializeDefault() + scheduleContiguous() +
// computeCpm(), the exact functions time_machine.js calls — against buildings/Duplex_extracted.db's
// real 1193-row elements_meta and rates.js's real SEQUENCE_RULES/LABOR_RATES (loaded via vm, since
// rates.js is a browser-global script with no module boundary — same vm.createContext pattern
// witness_gantt_bars_in_rect.js already uses in this codebase). Nothing here is invented: every rule,
// rate, and element is the shipped production data; every function call is the shipped production code.
//
// Command: node viewer/tests/witness_tm_schedule_output_of_truth.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('sql.js');
const SA = require('../schedule_author.js');
const { Witness } = require('../../witness_kit/contract');
const { Schedule4DTaskRow } = require('../../witness_kit/schemas/schedule_4d');
const { datesOrdered, noPre1970Dates, criticalFloatZero } = require('../../witness_kit/invariants/schedule');

const DB_PATH = path.join(__dirname, '..', '..', 'buildings', 'Duplex_extracted.db');
const RATES_PATH = path.join(__dirname, '..', 'rates.js');

function rowsFromResult(r) {
  if (!r.length) return [];
  return r[0].values.map(v => { const o = {}; r[0].columns.forEach((c, i) => o[c] = v[i]); return o; });
}

function loadRealRates() {
  const sandbox = { console, window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(RATES_PATH, 'utf8'), sandbox);
  return { rules: sandbox.SEQUENCE_RULES, labor: sandbox.LABOR_RATES, dflt: sandbox.SEQUENCE_DEFAULT };
}

async function generateRealTasksTable(dbPath) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  const { rules, labor, dflt } = loadRealRates();
  SA.materializeDefault(db, rules, { laborRates: labor, rates: {}, defaultRule: dflt });
  SA.scheduleContiguous(db, 'SCH_AUTHORED', { start: '2026-01-01' });
  SA.computeCpm(db, 'SCH_AUTHORED', {});
  const rows = rowsFromResult(db.exec('SELECT * FROM tasks'));
  db.close();
  return rows;
}

(async () => {
  const rows = await generateRealTasksTable(DB_PATH);

  Witness('tm_schedule_output_of_truth')
    .population(() => rows)
    .schema(Schedule4DTaskRow)
    .invariant('dates-ordered', rs => rs.every(datesOrdered))
    .invariant('no-1970-dates', rs => rs.every(noPre1970Dates))
    .invariant('critical-float-zero', criticalFloatZero)
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) c[0].schedule_start = '1970-01-05'; return c; })
    .run();
})();

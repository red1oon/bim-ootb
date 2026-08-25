// witness_kit/generators/schedule_4d.js — real schedule generation, factored out of
// witness_tm_schedule_output_of_truth.js so a second, multi-building black-box script
// (witness_tm_schedule_output_of_truth_all_buildings.js) can reuse it byte-for-byte instead of
// hand-copying it — the exact drift witness_kit exists to prevent (WITNESS_CONTRACT_AUDIT.md's
// #1 rot source: a predicate/procedure re-mirrored per file instead of imported once).
//
// WHY THIS EXISTS AT ALL, not a static fixture read: no shipped building DB has a populated `tasks`
// table on disk (verified across all 21 buildings/*.db + modeller/*_meta.db, 2026-08-25) — the real
// table only exists at runtime via the generative fallback. So this drives the actual production
// generator — schedule_author.js's materializeDefault() + scheduleContiguous() + computeCpm(), the
// same calls time_machine.js makes — against the building's real elements_meta and rates.js's real
// SEQUENCE_RULES/LABOR_RATES (loaded via vm.createContext, since rates.js is a browser-global script
// with no module boundary — the same pattern witness_gantt_bars_in_rect.js already uses).
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const initSqlJs = require('sql.js');

const SA = require(path.join(__dirname, '..', '..', 'viewer', 'schedule_author.js'));
const RATES_PATH = path.join(__dirname, '..', '..', 'viewer', 'rates.js');

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

// generateRealTasksTable(dbPath, opts) -> Promise<row[]>
// opts.scheduleId defaults to 'SCH_AUTHORED' (materializeDefault's own default); opts.start
// defaults to '2026-01-01' (scheduleContiguous's own default) — both left overridable, never
// hidden, so a caller can name a real reason to diverge instead of the default silently drifting.
async function generateRealTasksTable(dbPath, opts) {
  opts = opts || {};
  const scheduleId = opts.scheduleId || 'SCH_AUTHORED';
  const start = opts.start || '2026-01-01';

  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  const { rules, labor, dflt } = loadRealRates();
  SA.materializeDefault(db, rules, { laborRates: labor, rates: {}, defaultRule: dflt, scheduleId });
  SA.scheduleContiguous(db, scheduleId, { start });
  SA.computeCpm(db, scheduleId, {});
  const rows = rowsFromResult(db.exec('SELECT * FROM tasks'));
  db.close();
  return rows;
}

module.exports = { generateRealTasksTable };

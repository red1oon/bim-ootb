#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'viewer', 'schedule_author.js'));
function _slug(name) { return String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const ONLY = process.env.ONLY || 'Hospital_extracted';
const SHIFT_HOURS = process.env.SHIFT_HOURS ? Number(process.env.SHIFT_HOURS) : 24;

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const db = new SQL.Database(fs.readFileSync(path.join(BLD_DIR, ONLY + '.db')));
  const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc + '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();
  const elements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
    laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES, defaultRule: RATES.SEQUENCE_DEFAULT
  });
  const maxCrews = {};
  for (const res in RATES.LABOR_RATES) if (RATES.LABOR_RATES[res].max_crews) maxCrews[res] = RATES.LABOR_RATES[res].max_crews;
  const schedule = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews, SHIFT_HOURS);
  const rolled = ScheduleGate.deriveZones(elements, schedule);
  console.log('§ZONES_TOTAL n=' + rolled.zones.length);
  const byTid = {};
  rolled.zones.forEach(function (z) {
    const tid = 'TASK_' + _slug(z.phase) + '_' + _slug(z.storey);
    (byTid[tid] || (byTid[tid] = [])).push({ id: z.id, phase: z.phase, storey: z.storey, start: new Date(z.start).toISOString().slice(0,10), end: new Date(z.end).toISOString().slice(0,10), n: z.elementIds ? z.elementIds.length : undefined });
  });
  const collisions = Object.entries(byTid).filter(function (e) { return e[1].length > 1; });
  console.log('§TASKID_COLLISIONS count=' + collisions.length + ' of ' + Object.keys(byTid).length + ' distinct task ids');
  collisions.forEach(function (e) {
    console.log('§COLLISION tid=' + e[0]);
    e[1].forEach(function (z) { console.log('  zone.id=' + z.id + ' phase="' + z.phase + '" storey="' + z.storey + '" start=' + z.start + ' end=' + z.end + ' n=' + z.n); });
  });
}
main().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'viewer', 'schedule_author.js'));
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
  rolled.zones.forEach(z => { if (z.phase === 'Architecture' && z.storey === 'Level 4') console.log('§ZONE', JSON.stringify({id:z.id, phase:z.phase, storey:z.storey, start:new Date(z.start).toISOString().slice(0,10), end:new Date(z.end).toISOString().slice(0,10)})); });
  const target = rolled.zones.find(z => z.phase === 'Architecture' && z.storey === 'Level 4');
  const inEdges = rolled.edges.filter(e => e.succId === target.id);
  const outEdges = rolled.edges.filter(e => e.predId === target.id);
  console.log('§IN_EDGES ' + JSON.stringify(inEdges));
  console.log('§OUT_EDGES ' + JSON.stringify(outEdges));
  inEdges.forEach(e => {
    const p = rolled.zones.find(z => z.id === e.predId);
    if (p) console.log('§PRED', JSON.stringify({id:p.id, phase:p.phase, storey:p.storey, start:new Date(p.start).toISOString().slice(0,10), end:new Date(p.end).toISOString().slice(0,10)}));
  });

  // element-level: for the IfcMember/IfcPlate subset in this zone, what SEQ do they carry vs Wall/Door?
  const inZone = {};
  elements.forEach(el => {
    const zid = (el.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(el.storey);
    if (zid === target.id) { inZone[el.cls] = inZone[el.cls] || {seqs:new Set(), n:0, bzMin:Infinity, bzMax:-Infinity}; inZone[el.cls].seqs.add(el.seq); inZone[el.cls].n++; inZone[el.cls].bzMin=Math.min(inZone[el.cls].bzMin, el.base_z); inZone[el.cls].bzMax=Math.max(inZone[el.cls].bzMax, el.base_z); }
  });
  Object.entries(inZone).forEach(([cls, o]) => console.log('§CLASS_IN_ZONE', cls, 'n='+o.n, 'seqs='+[...o.seqs].join(','), 'bzRange=['+o.bzMin.toFixed(1)+','+o.bzMax.toFixed(1)+']'));
}
main().catch(e => { console.error(e); process.exit(1); });

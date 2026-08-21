#!/usr/bin/env node
// probe_proxy_carrier_classes.js — MEASURE (not guess) what IfcBuildingElementProxy's real
// geometric carriers are, before reclassifying anything. Per this project's rule: extract, never
// invent a regex. Pure geometry (_contactGraph), independent of any schedule/timeline — answers
// "what does each floating-candidate proxy actually touch" so a phase/sequence fix targets the
// real population, not a guess.
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'viewer', 'schedule_author.js'));
const SupportSweep = require(path.join(__dirname, '..', 'viewer', 'support_sweep.js'));   // §S58: required, never sliced
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'time_machine.js'), 'utf8');

function sliceFn(src, name) {
  const idx = src.lastIndexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}
const _contactGraph = SupportSweep.contactGraph;        // §S58: the real module, not a text slice

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const ONLY = process.env.ONLY || 'Hospital_extracted';

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const dbPath = path.join(BLD_DIR, ONLY + '.db');
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);
  // rates.js is a plain top-level-var script (browser global scope), not a CommonJS module — load
  // it the same way witness_midair_zero.js's loadRatesTable() does, via `new Function`.
  const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc +
    '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, ' +
    'SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();
  const rawItems = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
    laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES,
    defaultRule: RATES.SEQUENCE_DEFAULT
  });
  // _contactGraph reads bz/tz (time_machine.js's own call sites remap base_z/top_z -> bz/tz before
  // calling it, e.g. time_machine.js:5303) — _buildScheduleElements returns base_z/top_z, so remap.
  const items = rawItems.map(function (it) {
    return Object.assign({}, it, { bz: it.base_z, tz: it.top_z });
  });
  console.log('§PROBE_ITEMS total=' + items.length);

  const G = _contactGraph(items);
  console.log('§PROBE_CONTACT_GRAPH ok=' + G.ok + ' orphans=' + G.orphans + ' grounded=' + G.groundedN);

  // For every IfcBuildingElementProxy, what class(es) does it actually touch?
  const proxyIdx = [];
  for (let i = 0; i < items.length; i++) if (items[i].cls === 'IfcBuildingElementProxy') proxyIdx.push(i);
  console.log('§PROBE_PROXY_COUNT n=' + proxyIdx.length);

  const carrierClassCount = {}; // class of a real touching neighbour -> count of proxies touching it
  const proxyPhaseOfCarrierPhase = {}; // 'ArchitectureCarrier'|'MEPCarrier'|'orphan'|'groundedOnly' -> count
  const nameByBucket = { mep: {}, other: {}, orphanNames: {} };
  const MEP_CARRIER_CLASSES = /^Ifc(Duct|Pipe|Cable|FlowSegment|FlowFitting|FlowController|FlowMovingDevice|FlowStorageDevice|FlowTerminal|FlowTreatmentDevice|DistributionChamberElement|DistributionElement|DistributionControlElement|DistributionPort|Junction|EnergyConversionDevice|ElectricDistributionBoard)/;

  for (const i of proxyIdx) {
    const it = items[i];
    const list = G.contacts[i];
    let bucket;
    if (!list || !list.length) {
      bucket = G.grounded[i] ? 'grounded_no_contact' : 'orphan';
    } else {
      let sawMep = false, sawArch = false;
      for (const j of list) {
        const ccls = items[j].cls;
        carrierClassCount[ccls] = (carrierClassCount[ccls] || 0) + 1;
        if (MEP_CARRIER_CLASSES.test(ccls)) sawMep = true;
        else sawArch = true;
      }
      bucket = sawMep && !sawArch ? 'mep_only' : sawMep && sawArch ? 'mep_and_arch' : 'arch_only';
    }
    proxyPhaseOfCarrierPhase[bucket] = (proxyPhaseOfCarrierPhase[bucket] || 0) + 1;
    const nb = /boiler|valve|chiller|pump|ahu|vav|fcu|coil|tank|compressor|generator|transformer|panel|switchgear|duct|damper|diffuser|grille/i.test(it.name) ? 'mep' : 'other';
    nameByBucket[nb][it.name] = (nameByBucket[nb][it.name] || 0) + 1;
  }

  console.log('§PROBE_PROXY_BUCKETS ' + JSON.stringify(proxyPhaseOfCarrierPhase));
  console.log('§PROBE_CARRIER_CLASSES ' + JSON.stringify(carrierClassCount));
  console.log('§PROBE_NAME_SAMPLE_MEP_BUCKET top20=' + JSON.stringify(
    Object.entries(nameByBucket.mep).sort((a, b) => b[1] - a[1]).slice(0, 20)));
  console.log('§PROBE_NAME_SAMPLE_OTHER_BUCKET top20=' + JSON.stringify(
    Object.entries(nameByBucket.other).sort((a, b) => b[1] - a[1]).slice(0, 20)));
}
main().catch(e => { console.error(e); process.exit(1); });

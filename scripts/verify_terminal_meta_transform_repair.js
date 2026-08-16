#!/usr/bin/env node
// verify_terminal_meta_transform_repair.js — §S10_META_TRANSFORM_REPAIR verifier for
// oci_patch_gate.js (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S10). Runs against $GATE_DB
// (the SERVED Terminal_meta.db bytes with the patch applied by the gate itself — never a
// caller-chosen file). Self-contained: no extracted.db dependency (worktrees don't carry the
// gitignored DB binaries), only the repo's own recipe modules + constants written down at patch
// generation time.
//
// ISSUE it proves/disproves: Terminal_meta.db's per-element-corrupted transform rebase (2,074
// rows deviating >EPS from the modal rigid offset, walls to 11.3m) flipped bearing relations for
// the live scheduler (walls standing ON the ground plate sat 0.9m below it), capping
// §GROUNDWORK_SLAB at 29/233 members live. After the patch, the recipe on the served bytes must
// reclassify the FULL groundwork set and repaired spot-rows must sit at extracted-truth + modal
// offset.
'use strict';
const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '..');
const DB = process.env.GATE_DB;
if (!DB || !fs.existsSync(DB)) { console.error('§S10_VERIFY FAIL no $GATE_DB'); process.exit(1); }
const initSqlJs = require(path.join(repo, 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleAuthor = require(path.join(repo, 'viewer', 'schedule_author.js'));
require(path.join(repo, 'viewer', 'schedule_gate.js'));   // registers globalThis.ScheduleGate for the recipe

// Spot rows: expected center_z = extracted-truth + modal offset (−14.659), written by
// gen_terminal_meta_patch.js on 2026-08-16. Pre-patch served values were 13.0967 / 17.0967
// (≈4.09m too low — part of the corrupted tail).
const SPOT = [
  { guid: '0XfFSNafP5APj2WZXUWDV5', z: 13.188841 },
  { guid: '2B0$$pk5P4exV94gMWLrQY', z: 17.188841 }
];
const EXPECT_GW = 233;   // full groundwork membership, equal to the extracted-truth world

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(repo, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const RATES = (new Function(fs.readFileSync(path.join(repo, 'viewer', 'rates.js'), 'utf8') +
    '\nreturn {SEQUENCE_RULES, SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES, LABOR_RATES, RATES};'))();
  const db = new SQL.Database(fs.readFileSync(DB));
  let fail = 0;
  for (const s of SPOT) {
    const r = db.exec("SELECT center_z FROM element_transforms WHERE guid='" + s.guid.replace(/'/g, "''") + "'");
    const z = r.length ? r[0].values[0][0] : null;
    const ok = z !== null && Math.abs(z - s.z) < 0.001;
    console.log('§S10_VERIFY spot ' + s.guid.slice(0, 8) + ' z=' + (z === null ? 'MISSING' : z.toFixed(6)) +
      ' expect=' + s.z + ' ' + (ok ? 'PASS' : 'FAIL'));
    if (!ok) fail++;
  }
  const els = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
    laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES,
    defaultRule: RATES.SEQUENCE_DEFAULT });
  db.close();
  const gw = els.filter(e => (e.cls === 'IfcSlab' || e.cls === 'IfcBeam') &&
    e.phase === 'Substructure' && (e.seq === 3 || e.seq === 4)).length;
  const ok = gw === EXPECT_GW;
  console.log('§S10_VERIFY groundwork=' + gw + ' expect=' + EXPECT_GW + ' ' + (ok ? 'PASS' : 'FAIL'));
  if (!ok) fail++;
  console.log('§S10_VERIFY_SUMMARY fail=' + fail + ' ' + (fail === 0 ? 'PASS' : 'FAIL'));
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error('§S10_VERIFY ERR ' + (e && e.stack || e)); process.exit(1); });

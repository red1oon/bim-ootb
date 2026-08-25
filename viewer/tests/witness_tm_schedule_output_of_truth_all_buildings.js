#!/usr/bin/env node
// WITNESS — tm_schedule_output_of_truth_all_buildings: black-box, reusable, fleet-wide version of
// witness_tm_schedule_output_of_truth.js — same real generation + witness_kit contract, run per
// building instead of hand-verified on Duplex alone. Built on user request (2026-08-25): "test this
// on a HHS Office DB... a black box separate test script that we can reuse later" — checked first
// whether an equivalent already existed: witness_support_invariant_all_buildings.js is the one real
// precedent for a multi-building loop in this codebase, but it checks a DIFFERENT thing (an ephemeral
// ScheduleGate.computeSchedule() support invariant, never persisted) — nothing already exercises the
// real materializeDefault→scheduleContiguous→computeCpm path, persisted to `tasks`, across more than
// one building. This fills that gap; it does not replace the existing precedent.
//
// BUILDINGS — mirrors witness_support_invariant_all_buildings.js's own list and its explicit ruling
// (2026-08-04: "DX too small for our engine" — Duplex is a different, small/residential regime) MINUS
// Terminal and LTU_AHouse, which don't fit this specific job: both ship split meta/geo DBs with no
// `tasks`/`schedules`/`task_elements` tables in either half (verified 2026-08-25) — wiring that up is
// real extra scope, named below as SKIPPED, not silently dropped and not attempted here.
// Duplex is INCLUDED here (unlike the support-invariant witness) because output-of-truth persistence
// is not an engine-scale claim — it's whether small buildings persist correctly too, and Duplex is
// this witness_kit's own original worked case (WITNESS_INTERFACE_FRAMEWORK.md §3).
// Command: BLD_DIR=~/bim-ootb/buildings node viewer/tests/witness_tm_schedule_output_of_truth_all_buildings.js
// BLD_DIR — same house convention witness_door_window_host_wall.js/witness_hosted_before_host.js
// etc already use (and what run_witness_suite.js sets when it spawns this file), so this script
// runs unmodified both standalone and under the real suite runner.
//
// Quiets schedule_author.js's own §CLASS_UNMATCHED/§PHASE_*/§AUTHOR_* diagnostic logging while
// generating (not this witness's own PASS/FAIL/§WITNESS lines) — real, not cosmetic: run_witness_suite.js's
// spawnSync uses Node's default 1MB stdout maxBuffer, and looping several buildings' worth of that
// per-element chatter (Hospital alone: 64k elements_meta rows) produces 7MB+, which gets the child
// process SIGTERM'd mid-run (spawnSync reports status:null, read by the runner as RED) even though
// the script itself exits 0 when run directly. None of that diagnostic output is asserted on here.
'use strict';
const fs = require('fs');
const path = require('path');
const { Witness } = require('../../witness_kit/contract');
const { Schedule4DTaskRow } = require('../../witness_kit/schemas/schedule_4d');
const { datesOrdered, noPre1970Dates, criticalFloatZero, day0FanoutOk } = require('../../witness_kit/invariants/schedule');
const { generateRealTasksTable } = require('../../witness_kit/generators/schedule_4d');

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BUILDINGS = ['Duplex', 'Hospital', 'Clinic', 'JKR', 'HHS_Office_Federated'];
const SKIPPED = { Terminal: 'split meta/geo DB, no tasks/schedules tables in either half', LTU_AHouse: 'same split-DB gap as Terminal' };

async function generateQuietly(dbPath) {
  // schedule_author.js's own diagnostics split across BOTH streams — §AUTHOR_*/§PHASE_* on
  // console.log, §CLASS_UNMATCHED (the bulk of it, one line per unmatched element) on
  // console.warn/stderr. Muting only console.log left stderr alone still overflowing
  // spawnSync's 1MB maxBuffer (measured: 1MB+ of stderr from Hospital's 64k elements alone).
  const realLog = console.log, realWarn = console.warn, realError = console.error;
  console.log = console.warn = console.error = () => {};
  try { return await generateRealTasksTable(dbPath); }
  finally { console.log = realLog; console.warn = realWarn; console.error = realError; }
}

async function runOne(name) {
  const dbPath = path.join(BLD_DIR, `${name}_extracted.db`);
  if (!fs.existsSync(dbPath)) {
    console.log(`  SKIP ${name} — fixture missing: ${dbPath}`);
    return { name, skipped: true };
  }
  console.log(`-- ${name} --`);
  const rows = await generateQuietly(dbPath);
  const result = Witness(`tm_schedule_output_of_truth_${name}`)
    .population(() => rows)
    .schema(Schedule4DTaskRow)
    .invariant('dates-ordered', rs => rs.every(datesOrdered))
    .invariant('no-1970-dates', rs => rs.every(noPre1970Dates))
    .invariant('critical-float-zero', criticalFloatZero)
    .invariant('day0-fanout', day0FanoutOk)
    .redControl(rs => {
      const c = rs.map(r => Object.assign({}, r));
      if (c[0]) c[0].schedule_start = '1970-01-05';
      const minStart = c.reduce((m, r) => (!r.is_summary && (m == null || r.schedule_start < m)) ? r.schedule_start : m, null);
      c.forEach(r => { if (!r.is_summary) r.schedule_start = minStart; });
      return c;
    })
    .run();
  return Object.assign({ name }, result);
}

(async () => {
  const results = [];
  for (const name of BUILDINGS) results.push(await runOne(name));
  for (const name in SKIPPED) console.log(`  SKIP ${name} — ${SKIPPED[name]}`);

  const totalFail = results.reduce((n, r) => n + (r.fail || 0), 0);
  const summary = results.map(r => `${r.name}:${r.fail === 0 ? 'green' : 'RED(' + r.fail + ')'}`).join(' ');
  console.log(`§WITNESS_TM_SCHEDULE_OUTPUT_OF_TRUTH_ALL_BUILDINGS ran=${results.length} skipped=${Object.keys(SKIPPED).length} fail=${totalFail} — ${summary}`);
  if (totalFail > 0) process.exitCode = 1;
})();

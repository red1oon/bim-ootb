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
// POPULATION: real generated rows, not a fabricated fixture, via witness_kit/generators/schedule_4d.js
// — see that file's header for why a static fixture read doesn't work here. Single-building case
// (Duplex, 1193 real elements_meta rows). For the multi-building black-box version (same generator,
// looped over every building fixture with a populated elements_meta) see
// witness_tm_schedule_output_of_truth_all_buildings.js — a separate, reusable script, not folded
// into this one, so a single-building failure and a fleet-wide sweep stay independently readable.
//
// Command: node viewer/tests/witness_tm_schedule_output_of_truth.js
'use strict';
const path = require('path');
const { Witness } = require('../../witness_kit/contract');
const { Schedule4DTaskRow } = require('../../witness_kit/schemas/schedule_4d');
const { datesOrdered, noPre1970Dates, criticalFloatZero } = require('../../witness_kit/invariants/schedule');
const { generateRealTasksTable } = require('../../witness_kit/generators/schedule_4d');

const DB_PATH = path.join(__dirname, '..', '..', 'buildings', 'Duplex_extracted.db');

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

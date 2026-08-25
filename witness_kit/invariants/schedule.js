// witness_kit/invariants/schedule.js — reusable domain predicates, written once.
// Imported by name, never hand-copied — the #1 rot source WITNESS_CONTRACT_AUDIT.md found
// repeatedly across ~340 witnesses (hand-mirrored predicates drifting from the real gate).
'use strict';

const datesOrdered = row => new Date(row.schedule_start) <= new Date(row.schedule_finish);

// Not hypothetical — this project's own already-shipped defect (4D_GANTT_TM_REFACTOR.md §S67-era
// "1970-date typed edits"). Encoded here so it can never silently reappear unnoticed.
const noPre1970Dates = row => new Date(row.schedule_start).getFullYear() > 1971;

const criticalFloatZero = rows =>
  rows.filter(r => r.is_critical === 1).every(r => Math.abs(Number(r.total_float || 0)) < 1e-6);

module.exports = { datesOrdered, noPre1970Dates, criticalFloatZero };

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

// §DAY0_FANOUT — user request (2026-08-25): "Day 0, Hour 0, Minute 1, what is the building events?
// If multiple bars, clearly stack hell." Real construction starts ONE thing (a phase/task), not a
// pile-up of unrelated bars — a fast, cheap, first-minute smell test, complementary to the deep
// per-function checks: this doesn't prove any ONE call site is right, it proves the SHAPE of the
// schedule is sane at its own origin. Grounded, not guessed: measured on all 5 real generated
// buildings (Duplex/Hospital/Clinic/JKR/HHS_Office_Federated, 2026-08-25) — every one shows exactly
// 1 leaf task at the project's minimum schedule_start. maxAtMin defaults to 1 (the observed real
// baseline everywhere); pass a higher value only with a NAMED reason (e.g. two genuinely independent
// building wings breaking ground together), never to silence a real fan-out.
function day0FanoutOk(rows, maxAtMin) {
  maxAtMin = maxAtMin == null ? 1 : maxAtMin;
  const leaves = rows.filter(r => !r.is_summary);
  if (!leaves.length) return true; // nothing to fan out — §W-EMPTY-POP is a separate, earlier check
  const minStart = leaves.reduce((m, r) => (m == null || r.schedule_start < m) ? r.schedule_start : m, null);
  const atMin = leaves.filter(r => r.schedule_start === minStart);
  return atMin.length <= maxAtMin;
}

module.exports = { datesOrdered, noPre1970Dates, criticalFloatZero, day0FanoutOk };

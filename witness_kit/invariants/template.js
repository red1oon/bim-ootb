// witness_kit/invariants/template.js — reusable predicates for the PRESET 4D TEMPLATE
// (sequence rules + labour rates), the layer every generated schedule is built on top of.
//
// WHY THESE EXIST (bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S65, 2026-08-25):
// the template had NO witness of any kind, and its worst failure mode is silent by construction —
// ScheduleAuthor._installSecs (schedule_author.js:62-75) returns a bare `120` seconds whenever the
// rule's resource is missing OR that class has no productivity entry, with zero §-log at any of its
// three sites (schedule_author.js:64, :70, time_machine.js:4457). On a 45-day axis a 120s element is
// a zero-width bar, and every one of them starts at the same instant — the user-reported
// "zero minute stacking", originating here rather than in any downstream drawer/solver code.
//
// These predicates take ROWS in the shape witness_sequence_template_lock.js's population() builds
// (one row per rule / per NAME_OVERRIDE×class / one for SEQUENCE_DEFAULT) and are imported by name
// so the predicate exists in exactly ONE place — the drift class WITNESS_CONTRACT_AUDIT.md found
// 10+ times in one day.
'use strict';

// The silent floor _installSecs falls back to. NOT a tuned constant of ours — it is read from the
// real function's own behaviour, and the point of the gate is that NOTHING should reach it.
const FALLBACK_SECS = 120;

// NON-PHYSICAL classes, excluded from scheduling before a rule is ever consulted. NOT a judgement
// call here — this list mirrors the actual SQL predicate the element builders use, verbatim:
//   schedule_author.js:307   WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'
//   time_machine.js:3673, :4476, :9165  — the same predicate, all three element-query sites.
// A rule for one of these can never reach _installSecs, so holding it to the duration gates would be
// a FALSE POSITIVE. It was one, on this witness's first run: IfcSpace ships resource:null and got
// reported as a live zero-minute source when it is unreachable dead config (§S65 correction).
// IfcOpeningElement is listed for completeness — it currently has a real MASON rule and would pass
// anyway; the point is that the exclusion set is read from the product, not curated by hand here.
const NON_PHYSICAL = ['IfcOpeningElement', 'IfcSpace'];

/**
 * Is this row's class actually schedulable — i.e. can it ever reach _installSecs at runtime?
 * @param {{cls:string}} row
 * @returns {boolean}
 */
const isSchedulable = row => NON_PHYSICAL.indexOf(row.cls) < 0;

/**
 * A row lands on the silent 120s floor — i.e. it will draw a zero-width bar.
 * @param {{installSecs:number}} row
 * @returns {boolean} true if this row is a zero-minute element.
 */
const isZeroMinute = row => row.installSecs === FALLBACK_SECS;

/**
 * G-TPL-ZERO — no rule, override or default may produce the 120s floor.
 * This is the gate that would have caught §S65 defects 1-6 on the day they were written.
 * @param {object[]} rows
 * @returns {boolean}
 */
const noZeroMinuteRows = rows => rows.filter(isSchedulable).every(r => !isZeroMinute(r));

/**
 * G-TPL-RES — every resource a row names must exist in the labour table.
 * A null/absent resource is exactly what routes a row to the floor above.
 * @param {object[]} rows
 * @param {object} laborRates
 * @returns {boolean}
 */
const everyResourceResolves = (rows, laborRates) =>
  rows.filter(isSchedulable).every(r => r.resource != null && !!laborRates[r.resource]);

/**
 * G-TPL-BANDS — phase sequence bands must not interleave.
 * Derives each phase's [min..max] sequence band from the rows, orders phases by min, and requires
 * each band to start strictly after the previous one ends. An overlap means "phase order" and
 * "element order" disagree: §S65 defect 7 — Architecture spans 5-8 while MEP Rough-in sits at 7, so
 * IfcRoof (Architecture, seq 8) sequences AFTER all MEP rough-in, i.e. MEP installs before the roof
 * exists. That is a midair-MEP condition readable in the template, before any geometry is involved.
 * @param {object[]} rows
 * @returns {boolean}
 */
function phaseBandsDisjoint(rows) {
  const bounds = {};
  rows.forEach(r => {
    if (!r.phase || r.sequence == null) return;
    const b = bounds[r.phase] || (bounds[r.phase] = { min: Infinity, max: -Infinity });
    if (r.sequence < b.min) b.min = r.sequence;
    if (r.sequence > b.max) b.max = r.sequence;
  });
  const ordered = Object.keys(bounds).sort((a, b) => bounds[a].min - bounds[b].min);
  for (let i = 1; i < ordered.length; i++) {
    if (bounds[ordered[i]].min <= bounds[ordered[i - 1]].max) return false;
  }
  return true;
}

/**
 * Human-readable band report, for the §-log line — so a failure names WHICH phases overlap
 * instead of just returning false.
 * @param {object[]} rows
 * @returns {string}
 */
function phaseBandReport(rows) {
  const bounds = {};
  rows.forEach(r => {
    if (!r.phase || r.sequence == null) return;
    const b = bounds[r.phase] || (bounds[r.phase] = { min: Infinity, max: -Infinity, n: 0 });
    if (r.sequence < b.min) b.min = r.sequence;
    if (r.sequence > b.max) b.max = r.sequence;
    b.n++;
  });
  return Object.keys(bounds).sort((a, b) => bounds[a].min - bounds[b].min)
    .map(p => p + '[' + bounds[p].min + '-' + bounds[p].max + ']x' + bounds[p].n).join(' ');
}

module.exports = {
  FALLBACK_SECS, NON_PHYSICAL, isSchedulable, isZeroMinute, noZeroMinuteRows,
  everyResourceResolves, phaseBandsDisjoint, phaseBandReport
};

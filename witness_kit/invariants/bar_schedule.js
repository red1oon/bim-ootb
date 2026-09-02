// witness_kit/invariants/bar_schedule.js — the SCHEDULE layer of the 4D Bar model: the four hells,
// measured on real buildings. Spec: bim-compiler prompts/4D_BAR_MODEL.md §7.
//
// THE ACCEPTANCE BAR IS NOT ONE NUMBER. User ruling 2026-08-25, verbatim: "i dont mind floating MEP
// within when ARCH is up floor wall and roof." A pipe hung in a room whose walls and roof exist is
// acceptable; a beam resting on a column that is not built yet is not. Reporting them together hid
// a 13 inside a 9,911 on Hospital and made a green result look red. Structural is GATED at zero;
// services is REPORTED and deliberately not gated.
'use strict';

/**
 * G-BS-FLOAT-STRUCT — no Substructure or Superstructure element may start before the first thing it
 * bears on has finished. This is the hard half of the user's own acceptance bar.
 * MEASURED on the integrated model: Duplex 0 · HHS 25 · Hospital 9 · Terminal 15.
 * @param {object[]} rows - {phase, floating}
 * @returns {number} count of structural elements floating
 */
const structuralFloating = rows => rows.filter(r => r.structural && r.floating).length;

/**
 * G-BS-FLOAT-SVC — the same count for services. REPORTED, never gated (see the header).
 * @param {object[]} rows
 * @returns {number}
 */
const servicesFloating = rows => rows.filter(r => !r.structural && r.floating).length;

/**
 * G-BS-ZERO — no element may have zero duration. On a 300-day axis a 120-second element draws a
 * zero-width bar and every floored element starts at the same instant, so they stack: that is the
 * user's "zero minute stacking", §TPL_ZERO_MINUTE, at its source.
 * @param {object[]} rows
 * @returns {boolean}
 */
const noZeroDuration = rows => rows.every(r => r.stop > r.start);

/**
 * G-BS-INSIDE — every element plays inside the task that claims it. Under the Bar model this is a
 * TAUTOLOGY (a group's span IS min/max of its children) and it is gated anyway, because if it ever
 * fails somebody reintroduced a stored group time. It was 54.5% Hospital / 35.4% Terminal / 18.8%
 * Duplex under the pre-Bar code (§S70).
 * @param {object[]} rows
 * @returns {boolean}
 */
const everyElementInsideItsTask = rows =>
  rows.every(r => r.start >= r.taskStart && r.stop <= r.taskStop);

/**
 * G-BS-STACK — no two phase tasks on the same level may overlap. POLICY phase_link=serial: phases
 * are packed and strictly sequential, and an overlap is a human's drag on the Gantt, never a solver
 * artifact. Was 34% of same-level pairs on HHS, 18% Duplex, 17% Terminal (§S68).
 * @param {object[]} tasks - {level, start, stop}
 * @returns {number} overlapping pairs
 */
function phaseStacking(tasks) {
  const byLevel = {};
  tasks.forEach(t => { if (t.level != null) (byLevel[t.level] = byLevel[t.level] || []).push(t); });
  let n = 0;
  Object.keys(byLevel).forEach(lv => {
    const l = byLevel[lv];
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++)
      if (l[i].start < l[j].stop && l[j].start < l[i].stop) n++;
  });
  return n;
}

/**
 * G-BS-CREW — no trade may have more crews working at once than exist. Counted from the emitted
 * element times, not from the placement intent: schedule_gate.js enforced its cap at placement and
 * then let §DEQ_REPAIR move elements without re-claiming a crew, which put 20 carpenter crews on
 * Terminal against a cap of 2 (§S67).
 * @param {object[]} rows
 * @param {object} laborRates
 * @returns {string[]} one entry per breaching trade, empty when legal
 */
function crewBreaches(rows, laborRates) {
  const ev = {};
  rows.forEach(r => {
    if (!r.trade || r.trade === '_DEFAULT') return;
    (ev[r.trade] = ev[r.trade] || []).push([r.start, 1], [r.stop, -1]);
  });
  const out = [];
  Object.keys(ev).forEach(t => {
    ev[t].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0, pk = 0;
    ev[t].forEach(x => { cur += x[1]; if (cur > pk) pk = cur; });
    const cap = (laborRates[t] && laborRates[t].max_crews) || 1;
    if (pk > cap) out.push(t + ' peak=' + pk + ' cap=' + cap);
  });
  return out;
}

module.exports = { structuralFloating, servicesFloating, noZeroDuration, everyElementInsideItsTask, phaseStacking, crewBreaches };

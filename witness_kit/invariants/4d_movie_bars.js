// witness_kit/invariants/4d_movie_bars.js — predicates for §TPL_MOVIE_BINDS_BARS.
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S70.
//
// The bar and the movie are TWO independent computations of one real-world fact — when a thing gets
// built — which is exactly the "two clocks" shape WITNESS_INTERFACE_FRAMEWORK.md §8 names. Under the
// legacy path they agreed by construction (the bar was an envelope over the solve), so nothing had
// to check the relationship. Emitting bars from 4D_template.json makes the bar an INDEPENDENT
// statement, and the pair immediately went wrong: MEASURED 54.5% / 35.4% / 18.8% of elements still
// inside their own bar, worst offset 274.3 days. These predicates check the relationship.
'use strict';

/**
 * G-MB-INSIDE — every element must play inside the bar that claims it. No tolerance: the remap is
 * an affine map ONTO the window, so an element outside it is a bug, not a rounding artifact.
 * @param {object[]} rows - {guid, playStart, playEnd, winStart, winEnd}
 * @returns {boolean}
 */
const everyElementInsideItsBar = rows =>
  rows.every(r => r.playStart >= r.winStart && r.playEnd <= r.winEnd);

/**
 * G-MB-ORDER — the remap must not reorder anything. It is a monotone (order-preserving) affine map
 * per task, so every ordering the solve established survives: support-before-supported,
 * host-before-hosted, band monotonicity. Those were expensive to win (§HOSTED_BEFORE_HOST,
 * §STAIR_FLIGHT_GRID_VISIBILITY, §4D_BAND_MONOTONIC) and a display remap must not spend them.
 * Verified by comparing raw-solve order against played order within each task, not asserted.
 * @param {object[]} rows
 * @returns {boolean}
 */
function remapPreservesSolveOrder(rows) {
  const byTask = {};
  // Keyed by BUILDING + taskId. Task ids are derived from phase+storey, so
  // TASK_SUPERSTRUCTURE_LEVEL_1 exists in Hospital, HHS and Duplex alike — grouping on taskId alone
  // pools three buildings' elements into one "task" and manufactures inversions that do not exist.
  // (That is exactly what it did on first run: FAIL here, 0 inversions when checked per building.)
  rows.forEach(r => { const k = r.building + '|' + r.taskId; (byTask[k] = byTask[k] || []).push(r); });
  return Object.keys(byTask).every(t => {
    const list = byTask[t].slice().sort((a, b) => a.solveStart - b.solveStart || (a.guid < b.guid ? -1 : 1));
    for (let i = 1; i < list.length; i++) if (list[i].playStart < list[i - 1].playStart) return false;
    return true;
  });
}

/**
 * G-MB-NOZERO — no element may play for zero time. A zero-width element is invisible in the movie
 * and stacks at its bar's left edge: the user's "zero minute stacking", reported by name. The
 * degenerate-task branch of the remap (every member solved at one instant) exists for exactly this.
 * @param {object[]} rows
 * @returns {boolean}
 */
const noZeroWidthElement = rows => rows.every(r => r.playEnd > r.playStart);

/**
 * G-MB-SPAN — the movie's total span must equal the programme's. Two different totals is the
 * §GANTT_SHIFT_HOURS_DESYNC failure in another costume: the needle and the model disagreeing about
 * how long the job takes.
 * @param {object[]} rows
 * @returns {boolean}
 */
function movieSpanEqualsBarsSpan(rows) {
  if (!rows.length) return false;
  const per = {};
  rows.forEach(r => {
    const b = per[r.building] || (per[r.building] = { pS: Infinity, pE: -Infinity, wS: Infinity, wE: -Infinity });
    if (r.playStart < b.pS) b.pS = r.playStart;
    if (r.playEnd > b.pE) b.pE = r.playEnd;
    if (r.winStart < b.wS) b.wS = r.winStart;
    if (r.winEnd > b.wE) b.wE = r.winEnd;
  });
  return Object.keys(per).every(k => per[k].pS === per[k].wS && per[k].pE === per[k].wE);
}

module.exports = { everyElementInsideItsBar, remapPreservesSolveOrder, noZeroWidthElement, movieSpanEqualsBarsSpan };

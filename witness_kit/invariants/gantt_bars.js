// witness_kit/invariants/gantt_bars.js — reusable predicates for the Gantt DRAWER'S bar geometry.
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S65 STAGE 3.
//
// The defect these exist to make impossible, measured on HHS_Office_Federated before the fix
// (6839 ops, 17 bars, every one carrying a real task_id):
//   Superstructure — Roof Level   drawn   0.6px   vs its own task's 101.4px  =  0.6% of its window
//   Architecture   — Roof Level   drawn   0.6px   vs                 58.0px  =  1.0%
//   Architecture   — Level 3      drawn  46.9px   vs                202.9px  = 23.1%, start off 22.03d
//   mean absolute start error across all 17: 5.33 DAYS
// The drawer derived each bar's span as a Tukey fence over its MEMBER ELEMENTS while the authored
// window sat unread in the very index it was already given. When a task's elements bunch — which the
// crew/CPM solve makes routine — the fence collapses onto the bunch and the bar becomes a sliver.
'use strict';

const SECOND = 1000;

/**
 * G-BAR-WINDOW — an AUTHORED bar (one with a real task_id and a parseable window) must be drawn at
 * EXACTLY its task's window. Not "inside it", not "close to it" — equal. Tolerance is 1 second, for
 * float/parse noise only, deliberately far below the 1-day granularity the schedule is authored at.
 *
 * "Inside the window" is precisely the weaker claim that let the §CRISIS regressions ship green
 * (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1: BOUNDS is not DISTRIBUTION is not RENDERED
 * SHAPE) — a 0.6px bar sitting inside a 101.4px window satisfies "inside" perfectly.
 * @param {object[]} rows
 * @returns {boolean}
 */
const barsMatchTaskWindow = rows => rows
  .filter(r => r.taskId && r.winStart != null)
  .every(r => Math.abs(r.startTs - r.winStart) <= SECOND && Math.abs(r.endTs - r.winEnd) <= SECOND);

/**
 * G-BAR-SOURCE — no authored bar may take its span from the ops fallback. The fallback is correct
 * ONLY for un-authored groups (storey|phase and cell keys, which have no window to prefer); an
 * authored bar reaching it means the window was silently unavailable, which is how this defect
 * looked from the outside for months.
 * @param {object[]} rows
 * @returns {boolean}
 */
const authoredBarsUseTaskSpan = rows => rows
  .filter(r => r.taskId && r.winStart != null)
  .every(r => r.spanFrom === 'task');

/**
 * G-BAR-WORK — a task's window must be long enough for its OWN members' work.
 *
 * This REPLACED a `no-hairline-bars-3px` pixel gate, and the replacement is strictly stronger, not a
 * relaxation — measured on Clinic (156-day axis, 9 tasks with exactly 1.00-day windows):
 *   MEP Rough-in - Roof - Mech   139 members  0.817 crew-days  -> HONEST, the pixel gate failed it
 *   Architecture - Roof - Main    25 members  0.207 crew-days  -> HONEST, the pixel gate failed it
 *   Finishes - Level 1            64 members  1.333 crew-days  -> REAL DEFECT (33% over its window)
 *   Substructure - TOF Footing    58 members  1.074 crew-days  -> REAL DEFECT (7% over)
 * 7 of the 9 were honest. A genuine one-day task on a 156-day chart SHOULD be thin — P6 draws it
 * thin — so a pixel threshold flags real work as a defect and, worse, would be silenced by nudging
 * the threshold. Crew-days is the thing that is actually true or false about a window.
 *
 * TOLERANCE: 5%, the project's own standing error-margin ruling (4D_SCHEDULE_PERFECTION.md
 * §WORKING_STYLE: "5% error margin is acceptable — do not chase exactness past the point of
 * usefulness"). Not a number invented for this gate.
 * @param {object[]} rows
 * @returns {boolean}
 */
const WORK_TOLERANCE = 1.05;
const windowCoversWorkContent = rows => rows
  .filter(r => r.taskId && r.crewDays > 0)
  .every(r => r.crewDays <= r.windowDays * WORK_TOLERANCE);

/**
 * G-BAR-ORDERED — a bar's own start must precede its own end. Degenerate/inverted bars are the
 * shape a collapsed span takes when the fence has nothing left to fence.
 * @param {object[]} rows
 * @returns {boolean}
 */
const barsOrdered = rows => rows.every(r => r.endTs > r.startTs);

module.exports = { SECOND, WORK_TOLERANCE, barsMatchTaskWindow, authoredBarsUseTaskSpan,
                   windowCoversWorkContent, barsOrdered };

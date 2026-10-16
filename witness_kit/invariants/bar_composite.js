// witness_kit/invariants/bar_composite.js — the COMPOSITE layer of the 4D Bar model.
// Spec: bim-compiler prompts/4D_BAR_MODEL.md §2.1.
//
// These check ONE rule: only leaves store time, every group derives it. That rule is the whole
// model — with a single stored timeline there is nothing to reconcile, so none of the five
// translators that each carried a hell (deriveZones, _writeTemplateSchedule, remapSolveToTasks,
// §DEQ_REPAIR, §CREW_CAP_FINAL) can exist. A comment saying "don't store group time" is not a gate;
// these are.
'use strict';

/**
 * G-BC-GETTER — GroupBar.start/stop must be GETTERS with no backing assignment, verified in the
 * SOURCE. A group that ever stores a time is a second copy of a fact the leaves already hold, and a
 * second copy is what every hell came through. Checked textually because a runtime check cannot
 * distinguish "currently null" from "assignable".
 * @param {string} src - viewer/bar_model.js source
 * @returns {boolean}
 */
function groupTimeIsAGetter(src) {
  const i = src.indexOf('function GroupBar(');
  const j = src.indexOf('// ══ phaseOrder', i);
  if (i < 0 || j < 0) return false;
  const body = src.slice(i, j);
  const hasGetters = /defineProperty\(GroupBar\.prototype, 'start'[\s\S]*?get:/.test(body) &&
                     /defineProperty\(GroupBar\.prototype, 'stop'[\s\S]*?get:/.test(body);
  // no assignment to a backing field anywhere in GroupBar's own section
  const stores = /this\._s\s*=|this\._e\s*=/.test(body.replace(/Bar\.call\(this\)/g, ''));
  return hasGetters && !stores;
}

/**
 * G-BC-CONTAINS — every group contains every one of its children. On this model this is a
 * TAUTOLOGY, not a test: the group's span IS min/max of the children. It is gated anyway because
 * the tautology is the deliverable — if it ever fails, someone reintroduced a stored group time.
 * Contrast: under the pre-Bar code this was 54.5% true on Hospital and 18.8% on Duplex (§S70).
 * @param {object[]} rows - {groupStart, groupStop, childStart, childStop}
 * @returns {boolean}
 */
const groupContainsEveryChild = rows =>
  rows.every(r => r.childStart >= r.groupStart && r.childStop <= r.groupStop);

/**
 * G-BC-LEAFONLY — no GroupBar may carry a stored time at runtime either.
 * @param {object[]} groups - the live GroupBar instances
 * @returns {boolean}
 */
const onlyLeavesStoreTime = groups => groups.every(g => g._s === null && g._e === null);

/**
 * G-BC-SPAN — the project's span equals the min/max over every leaf. Two different totals is
 * §GANTT_SHIFT_HOURS_DESYNC in another costume: the needle and the model disagreeing about how long
 * the job takes.
 * @param {object} project
 * @param {object[]} leaves
 * @returns {boolean}
 */
function projectSpanEqualsLeafExtent(project, leaves) {
  let s = Infinity, e = -Infinity;
  leaves.forEach(l => { if (l.start != null) { if (l.start < s) s = l.start; if (l.stop > e) e = l.stop; } });
  return project.start === s && project.stop === e;
}

/**
 * G-BC-NOZERO — no leaf may have zero duration. A zero-width element is invisible in the movie and
 * stacks at its bar's left edge: the user's "zero minute stacking", reported by name.
 * @param {object[]} leaves
 * @returns {boolean}
 */
const noZeroWidthLeaf = leaves => leaves.every(l => l.start == null || l.stop > l.start);

module.exports = { groupTimeIsAGetter, groupContainsEveryChild, onlyLeavesStoreTime, projectSpanEqualsLeafExtent, noZeroWidthLeaf };

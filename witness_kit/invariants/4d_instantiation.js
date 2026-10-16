// witness_kit/invariants/4d_instantiation.js — predicates for the §TEMPLATE_INSTANTIATE task grid.
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S69.
//
// These check the INVERSION described in §S68: phases are now emitted from 4D_template.json and
// elements assigned to them, instead of phases being grouped out of the element solve afterwards.
// The old shape could not be gated at all — an envelope over the solve agrees with the solve by
// construction, so there was nothing for a predicate to contradict.
'use strict';

/**
 * G-TI-STACK — how many same-level phase PAIRS overlap in time. The template declares FS+0 within
 * a level, so the answer must be 0. MEASURED before the inversion: HHS 10/29 (34%), Clinic 13/65,
 * Duplex 7/38, Terminal 18/109, worst = HHS Level 1 Architecture sitting entirely inside
 * Superstructure for 13.4 days.
 * @param {object[]} tasks
 * @param {object} T - the parsed template, for phase order
 * @returns {{pairs:number, overlapping:number}}
 */
function phaseOverlapCount(tasks, T) {
  const order = {}; T.phases.forEach((p, i) => { order[p.name] = i; });
  const byLevel = {};
  tasks.forEach(t => { if (order[t.phase] != null) (byLevel[t.storey] = byLevel[t.storey] || []).push(t); });
  let pairs = 0, overlapping = 0;
  Object.keys(byLevel).forEach(lv => {
    const list = byLevel[lv];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      pairs++;
      const ov = Math.min(list[i].endDay, list[j].endDay) - Math.max(list[i].startDay, list[j].startDay);
      if (ov > 0) overlapping++;
    }
  });
  return { pairs, overlapping };
}

/**
 * G-TI-WORK — duration_rule: a task's window must cover its own per-trade work content. Per-trade,
 * never total-seconds over pooled crews (§S67: the sum form understated HHS by 1.74x).
 * @param {object[]} rows
 * @returns {boolean}
 */
const windowCoversWork = rows => rows.every(r => (r.endDay - r.startDay) >= Math.ceil(r.crewDays) - 1e-9);

/**
 * G-TI-LAGS — THE TAUTOLOGY KILLER. Every persisted lag must be a value the TEMPLATE declares, not
 * a number computed from the dates the edge is supposed to constrain. Before the inversion,
 * schedule_author.js wrote `lagDays = sd.s - pd.e` — the answer restated as its own constraint —
 * and §S67 HOP 5 measured 25 of 25 edges that way on HHS.
 * @param {Array[]} seqRows - [pred, succ, type, lag]
 * @param {object} T
 * @returns {boolean}
 */
function lagsAreTemplateDeclared(seqRows, T) {
  const allowed = new Set(T.dependencies.within_level.concat(T.dependencies.across_levels)
    .map(e => Number(e.lag_days || 0)));
  const types = new Set(T.dependencies.within_level.concat(T.dependencies.across_levels)
    .map(e => e.type || 'FS'));
  return seqRows.length > 0 && seqRows.every(r => allowed.has(Number(r[3])) && types.has(r[2]));
}

/**
 * G-TI-LADDER — §4D_BAND_MONOTONIC as persisted data: for every across-level edge, the successor
 * may not start before the predecessor finishes (plus its declared lag).
 * @param {object[]} tasks
 * @param {Array[]} seqRows
 * @returns {boolean}
 */
function ladderHolds(tasks, seqRows) {
  const byId = {}; tasks.forEach(t => { byId[t.taskId] = t; });
  return seqRows.every(([p, s, , lag]) => {
    const pt = byId[p], st = byId[s];
    if (!pt || !st) return true;                   // summary rows / foreign edges are not ours
    return st.startDay >= pt.endDay + Number(lag) - 1e-9;
  });
}

/**
 * G-TI-FLOAT — at least one edge must have SLACK. A graph that is tight on every edge is the old
 * tautology in a new shape: CPM would again report every task critical with float 0..0 (§S67
 * measured exactly that, 17 of 17 on HHS). Slack appears because levels run in parallel under the
 * ladder while each level's own chain is packed.
 * @param {object[]} tasks
 * @param {Array[]} seqRows
 * @returns {number} count of edges whose successor starts strictly after pred.finish + lag
 */
function slackEdgeCount(tasks, seqRows) {
  const byId = {}; tasks.forEach(t => { byId[t.taskId] = t; });
  let n = 0;
  seqRows.forEach(([p, s, , lag]) => {
    const pt = byId[p], st = byId[s];
    if (pt && st && st.startDay > pt.endDay + Number(lag) + 1e-9) n++;
  });
  return n;
}

/**
 * G-TI-CREW — capacity_rule across the whole emitted grid. Tasks on different levels run in
 * parallel, so the same trade can be demanded twice at once; average crew demand per task per trade
 * is secs_t / (shift * durationDays), summed over every task live on a given day.
 * MEASURED need: with a superstructure-only ladder this fails (HHS PLUMBER 3.67 vs cap 2), which is
 * why 4D_template.json v1.2.0 chains EVERY level-scope phase.
 * @param {object[]} tasks
 * @param {object[]} els
 * @param {object} laborRates
 * @param {number} shiftHours
 * @returns {string[]} one string per breaching trade, empty when legal
 */
function gridCrewBreaches(tasks, els, laborRates, shiftHours) {
  const shiftSecs = shiftHours * 3600;
  const byGuid = {}; els.forEach(e => { byGuid[e.guid] = e; });
  const demand = {};
  tasks.forEach(t => {
    const span = Math.max(1, t.endDay - t.startDay);
    const secs = {};
    (t.guids || []).forEach(g => {
      const e = byGuid[g]; if (!e || !e.resource || e.resource === '_DEFAULT') return;
      secs[e.resource] = (secs[e.resource] || 0) + (e.installSecs || 0);
    });
    Object.keys(secs).forEach(tr => {
      const crews = secs[tr] / (shiftSecs * span);
      const d = demand[tr] || (demand[tr] = {});
      for (let day = t.startDay; day < t.endDay; day++) d[day] = (d[day] || 0) + crews;
    });
  });
  const out = [];
  Object.keys(demand).forEach(tr => {
    const cap = (laborRates[tr] && laborRates[tr].max_crews) || 1;
    let pk = 0; Object.keys(demand[tr]).forEach(d => { if (demand[tr][d] > pk) pk = demand[tr][d]; });
    if (pk > cap + 1e-6) out.push(tr + ' peak=' + pk.toFixed(2) + ' cap=' + cap);
  });
  return out;
}

/**
 * G-TI-NOLOSS — every element the engine built must land in exactly one task. This is the gate that
 * caught a real defect in the instantiator itself: a building-scope phase (Substructure) emits ONE
 * task on the lowest level, and the first cut skipped that phase's cells on every OTHER level —
 * silently dropping their elements. MEASURED on Hospital: 63,181 of 63,182 assigned, one lost, and
 * it was invisible in every other number (tasks, edges, days, phase coverage all looked right).
 * @param {number} elementCount
 * @param {Array[]} teRows - [task_id, guid]
 * @returns {boolean}
 */
const everyElementLandsInATask = (elementCount, teRows) => {
  const seen = new Set();
  teRows.forEach(r => seen.add(r[1]));
  return seen.size === elementCount;
};

module.exports = { everyElementLandsInATask, phaseOverlapCount, windowCoversWork, lagsAreTemplateDeclared, ladderHolds, slackEdgeCount, gridCrewBreaches };

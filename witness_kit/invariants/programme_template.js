// witness_kit/invariants/programme_template.js — reusable predicates for the core programme
// template. Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S66.
//
// The template and the classification table (sequence_rules.json) are TWO FILES describing ONE set
// of construction phases. That is the exact "two clocks" shape WITNESS_INTERFACE_FRAMEWORK.md §8
// names — two independent computations claiming to represent the same real-world fact, each locally
// correct while the PAIR is wrong, because nothing checks the relationship. These predicates check
// the relationship.
'use strict';

/**
 * G-PT-ORDER — the template's phase set and order must be the classification table's own, derived
 * from SEQUENCE_RULES' minimum sequence per phase. Not "similar to": identical, in order.
 * Prevents the drift that already bit this project three times — gantt_model.js's own header
 * records _VAR_ORDER as a THIRD stale copy of the phase order that PR #1165 missed, still reading
 * MEP rough-in BEFORE the envelope.
 * @param {object[]} rows
 * @returns {boolean}
 */
function phasesMatchClassificationOrder(rows) {
  if (rows.some(r => r.classMinSequence == null)) return false;   // a phase the table doesn't know
  for (const r of rows) if (r.sequence !== r.classMinSequence) return false;
  for (let i = 1; i < rows.length; i++) if (rows[i].sequence <= rows[i - 1].sequence) return false;
  return true;
}

/**
 * G-PT-TRADES — a phase's declared trades must be exactly the union of resources its own classes
 * name in the classification table. A trade listed here but absent there means the template invents
 * work; a trade there but missing here means the programme cannot price it.
 * @param {object[]} rows
 * @returns {boolean}
 */
const tradesMatchClassification = rows => rows.every(r =>
  r.classTrades != null && JSON.stringify(r.trades) === JSON.stringify(r.classTrades));

/**
 * G-PT-EDGES — every dependency endpoint must be a real phase id declared in this file.
 * @param {object} T - the parsed template
 * @returns {boolean}
 */
function edgesReferenceRealPhases(T) {
  const ids = new Set(T.phases.map(p => p.id));
  const all = T.dependencies.within_level.concat(T.dependencies.across_levels);
  return all.every(e => ids.has(e.pred) && ids.has(e.succ));
}

/**
 * G-PT-COVER — the within-level chain must reach EVERY phase: one unbroken path from the first
 * phase to the last, no phase orphaned. This is the gate for the defect visible in HHS's live log
 * today, where the generated programme simply has no Substructure row at all — an unsequenced phase
 * does not appear, and nothing notices.
 * @param {object} T
 * @returns {boolean}
 */
function withinLevelChainCoversAllPhases(T) {
  const ids = T.phases.map(p => p.id);
  const succOf = {};
  T.dependencies.within_level.forEach(e => { succOf[e.pred] = e.succ; });
  let node = ids[0], seen = new Set([node]);
  while (succOf[node]) {
    node = succOf[node];
    if (seen.has(node)) return false;   // cycle
    seen.add(node);
  }
  return seen.size === ids.length && node === ids[ids.length - 1];
}

/**
 * G-PT-NODATES — THE POINT OF THIS FILE. No edge may carry a date, an absolute day number, or a
 * start/finish. Construction logic must be independent of the schedule it constrains.
 *
 * Today's persisted task_sequences rows are the opposite: schedule_author.js derives each lag from
 * the dates it is meant to validate ("succ.start = pred.finish + lag EXACTLY"), so every edge is
 * tight by construction, float is zero everywhere, and §GANTT_CPM_ANNOTATE reports 17 of 17 tasks
 * critical with float 0..0 on a real building. An edge computed from the answer cannot contradict
 * the answer, which makes the whole CPM tautological.
 * @param {object} T
 * @returns {boolean}
 */
function edgesAreDateIndependent(T) {
  const BANNED = ['schedule_start', 'schedule_finish', 'start', 'finish', 'date', 'day_number', 'ts'];
  const all = T.dependencies.within_level.concat(T.dependencies.across_levels);
  return all.every(e => Object.keys(e).every(k => !BANNED.includes(k)));
}

/**
 * G-PT-ONECLOCK — the template's calendar must equal the engine's own SHIFT_HOURS. Two files
 * declaring the working day is precisely how §GANTT_SHIFT_HOURS_DESYNC happened before: bars were
 * authored at 8h while the canvas played at 24h, so elements appeared before their own bar started.
 * @param {object} T
 * @param {number} engineShiftHours
 * @returns {boolean}
 */
const calendarMatchesEngine = (T, engineShiftHours) =>
  Number(T.calendar.hours_per_shift) === Number(engineShiftHours);

/**
 * G-PT-WORK — duration must be declared as derived from work content.
 * The alternative — the elapsed span of the geometry placement solve — is what produced HHS's
 * 185.2 crew-days of work content inside a 42-day programme, a 4.4x contradiction inside one log.
 * @param {object} T
 * @returns {boolean}
 */
const durationRuleIsWorkContent = T =>
  T.duration_rule && T.duration_rule.basis === 'work_content' && Number(T.duration_rule.min_days) >= 1;

module.exports = {
  phasesMatchClassificationOrder, tradesMatchClassification, edgesReferenceRealPhases,
  withinLevelChainCoversAllPhases, edgesAreDateIndependent, calendarMatchesEngine,
  durationRuleIsWorkContent
};

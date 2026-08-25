// witness_kit/invariants/4d_template.js — reusable predicates for the core programme
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
 * G-PT-BANDS — a phase owns a CONTIGUOUS, NON-OVERLAPPING band of sequence numbers:
 * max(sequence in phase[i]) < min(sequence in phase[i+1]).
 *
 * phasesMatchClassificationOrder above compares MINIMA only, and a min-only gate CANNOT SEE A BAND
 * INTERLEAVE. That is not hypothetical: §S65 defect #7 was exactly this shape — IfcRoof carried
 * sequence 8 while sitting in Architecture (min 5), so the roof sequenced after ALL of MEP Rough-in
 * (7). Architecture's min stayed 5, the minima still increased, and a min-only witness would have
 * stayed green through it. PR #1527 fixed the data; this invariant is what stops it coming back.
 * @param {object[]} rows
 * @returns {boolean}
 */
function phaseBandsDoNotOverlap(rows) {
  if (rows.some(r => r.classMinSequence == null || r.classMaxSequence == null)) return false;
  for (let i = 1; i < rows.length; i++)
    if (rows[i].classMinSequence <= rows[i - 1].classMaxSequence) return false;
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
  !!T.duration_rule && T.duration_rule.basis === 'work_content' && Number(T.duration_rule.min_days) >= 1;

/**
 * G-PT-PERTRADE — the duration divisor must be PER TRADE, never a sum across trades.
 *
 * v1.0.0 divided an activity's TOTAL seconds by the SUM of its trades' max_crews, which treats
 * trades as fungible — an electrician's seconds worked off by a plumber's crew. An activity is as
 * long as its slowest trade. MEASURED on HHS_Office_Federated (2026-08-25, 24h shift): whole
 * programme sum-of-crews 40.1d vs correct per-trade 69.8d (1.74x), and up to 3.00x on one phase
 * (MEP Rough-in: 3 trades, Sum(max_crews)=6, no single trade above 2).
 *
 * Gated on BOTH the declared scope and the formula text, so the two cannot drift apart: a formula
 * quietly re-edited back to a sum while divisor_scope still says per_trade is the failure this
 * catches.
 * @param {object} T
 * @returns {boolean}
 */
const durationDivisorIsPerTrade = T => !!T.duration_rule &&
  T.duration_rule.divisor_scope === 'per_trade' &&
  /MAX over trades/.test(T.duration_rule.formula || '') &&
  !/sum of max_crews/i.test(T.duration_rule.formula || '');

/**
 * G-PT-CAPACITY — the template must declare crew capacity as a HARD bound on the FINAL emitted
 * times, not merely on the times at first placement.
 *
 * MEASURED on HHS_Office_Federated (2026-08-25, A/B with schedule_gate.js's repair loop disabled):
 * claimCrew enforces the cap correctly at placement — all 8 trades legal. §DEQ_REPAIR then shifts
 * 33 elements forward by writing o.start/o.end directly, without re-claiming a crew, and CARPENTER
 * ends at 8 simultaneous crews against max_crews=2 (4.0x). Repair off returns it to 2. The span is
 * 46.9d either way: the breach does not shorten the programme, it makes it unbuildable.
 * @param {object} T
 * @returns {boolean}
 */
const capacityRuleIsHard = T => !!T.capacity_rule &&
  /max_crews/.test(T.capacity_rule.rule || '') &&
  /at no instant/i.test(T.capacity_rule.rule || '') &&
  /FINAL emitted times/.test(T.capacity_rule.applies_to || '');

/**
 * G-PT-SCOPE — every phase must declare its instantiation scope explicitly, and it must agree with
 * replicate_per_level. Without this, an instantiator has to infer scope from a boolean's name.
 * @param {object[]} rows
 * @returns {boolean}
 */
const phasesDeclareScope = rows => rows.every(r =>
  (r.scope === 'level' && r.replicate_per_level === true) ||
  (r.scope === 'building' && r.replicate_per_level === false));

/**
 * G-PT-EDGESCOPE — the two instantiation rules that v1.0.0 left undefined must be stated in the
 * file: which level a building-scope predecessor attaches to, and what happens to the chain when a
 * phase is dropped for empty population. HHS_Office_Federated needs BOTH — it drops Substructure,
 * which is both building-scope and the head of the within-level chain.
 * @param {object} T
 * @returns {boolean}
 */
const dependencyScopeRulesDeclared = T => !!T.dependencies &&
  /LOWEST level/.test(T.dependencies._edge_scope_rule || '') &&
  /BRIDGED/.test(T.dependencies._empty_phase_rule || '');

module.exports = {
  phasesMatchClassificationOrder, phaseBandsDoNotOverlap, tradesMatchClassification,
  edgesReferenceRealPhases, withinLevelChainCoversAllPhases, edgesAreDateIndependent,
  calendarMatchesEngine, durationRuleIsWorkContent, durationDivisorIsPerTrade,
  capacityRuleIsHard, phasesDeclareScope, dependencyScopeRulesDeclared
};

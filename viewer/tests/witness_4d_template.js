#!/usr/bin/env node
// WITNESS — 4d_template: the core Gantt programme skeleton every building instance copies
// from. Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S66.
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1):
//   the TEMPLATE layer only — the authored programme skeleton as a file. It says nothing about any
//   building's instantiated tasks, nothing about kernel_ops, nothing about drawn bars.
//
// ISSUE THIS PROVES OR DISPROVES: the user asked for a core 4D template JSON months before
// 2026-08-25 and was repeatedly told it existed. It did not. A repo-wide scan of all 96 JSON files
// found zero containing tasks, durations or dependencies, and 4D_SCHEDULE_PERFECTION.md:1751 states
// "sequence_rules.json IS that template and it does work" — which is false: that file is an
// ifc_class -> phase/sequence/trade lookup and cannot express a programme. This witness exists so
// the new file cannot rot into the same claim: it gates that the template stays DERIVED from
// sequence_rules.json where it should be, and INDEPENDENT of dates where it must be.
//
// Command: node viewer/tests/witness_4d_template.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { Witness } = require('../../witness_kit/contract');
const { PhaseRow4D } = require('../../witness_kit/schemas/4d_template');
const {
  phasesMatchClassificationOrder, phaseBandsDoNotOverlap, tradesMatchClassification,
  edgesReferenceRealPhases, withinLevelChainCoversAllPhases, edgesAreDateIndependent,
  calendarMatchesEngine, durationRuleIsWorkContent, durationDivisorIsPerTrade,
  capacityRuleIsHard, phasesDeclareScope, dependencyScopeRulesDeclared,
  ladderCoversEveryLevelPhase, allEdgesAreSerialFS
} = require('../../witness_kit/invariants/4d_template');

const VIEWER_DIR = process.env.VIEWER_DIR || path.join(__dirname, '..');
const T = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', '4D_template.json'), 'utf8'));
const C = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', 'sequence_rules.json'), 'utf8'));

// The EXECUTED clock, not the mirror — same reasoning as witness_sequence_template_lock.js:
// viewer.html never calls loadSequenceRules(), so rates.js's literal is what the browser runs.
function executedShiftHours() {
  const sandbox = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(VIEWER_DIR, 'rates.js'), 'utf8'), sandbox);
  return sandbox.SHIFT_HOURS;
}
const SHIFT = executedShiftHours();

// One row per phase, carrying what the template declares AND what the classification table says,
// so an invariant compares the two instead of trusting either.
const classPhases = {};
Object.keys(C.SEQUENCE_RULES).forEach(cls => {
  const r = C.SEQUENCE_RULES[cls];
  if (!r.phase || r.sequence == null) return;
  const p = classPhases[r.phase] || (classPhases[r.phase] = { min: Infinity, max: -Infinity, trades: {} });
  if (r.sequence < p.min) p.min = r.sequence;
  if (r.sequence > p.max) p.max = r.sequence;
  if (r.resource) p.trades[r.resource] = 1;
});

const rows = T.phases.map((p, i) => ({
  id: p.id,
  name: p.name,
  sequence: p.sequence,
  trades: (p.trades || []).slice().sort(),
  replicate_per_level: !!p.replicate_per_level,
  scope: p.scope,
  index: i,
  classMinSequence: classPhases[p.name] ? classPhases[p.name].min : null,
  classMaxSequence: classPhases[p.name] ? classPhases[p.name].max : null,
  classTrades: classPhases[p.name] ? Object.keys(classPhases[p.name].trades).sort() : null
}));

console.log('§4DT_SOURCE template=rates/4D_template.json v=' + T.meta.version +
  ' phases=' + rows.length + ' withinLevelEdges=' + T.dependencies.within_level.length +
  ' acrossLevelEdges=' + T.dependencies.across_levels.length +
  ' allFSzeroLag=' + allEdgesAreSerialFS(T));
console.log('§4DT_PHASES ' + rows.map(r => r.name + '[' + r.classMinSequence + '-' + r.classMaxSequence + ']' +
  '/' + r.scope).join(' -> '));
console.log('§4DT_CALENDAR hoursPerShift=' + T.calendar.hours_per_shift + ' engineSHIFT_HOURS=' + SHIFT +
  ' daysPerWeek=' + T.calendar.days_per_week + ' durationBasis=' + T.duration_rule.basis +
  ' divisorScope=' + T.duration_rule.divisor_scope);
console.log('§4DT_CAPACITY rule="' + T.capacity_rule.rule + '" appliesTo=' + T.capacity_rule.applies_to);

// Deep copy + mutate, so a red control can inject a defect without touching the real T every
// later gate reads. structuredClone is node>=17; JSON round-trip is enough for a plain JSON doc.
const mut = f => { const c = JSON.parse(JSON.stringify(T)); f(c); return c; };

Witness('4d_template')
  .population(() => rows)
  .schema(PhaseRow4D)
  // Phase set and order are EXTRACTED from the classification table, never typed twice.
  .invariant('phases-match-classification-order', phasesMatchClassificationOrder)
  // MIN-only ordering cannot see a band INTERLEAVE — the §S65 #7 roof defect passed that shape.
  .invariant('phase-bands-do-not-overlap', phaseBandsDoNotOverlap)
  .invariant('trades-match-classification', tradesMatchClassification)
  .invariant('phases-declare-scope', phasesDeclareScope)
  // The dependency graph must be well-formed and must cover every phase, so no phase can be
  // silently unsequenced the way Substructure currently vanishes from HHS's generated programme.
  .invariant('edges-reference-real-phases', () => edgesReferenceRealPhases(T))
  .invariant('within-level-chain-covers-all-phases', () => withinLevelChainCoversAllPhases(T))
  // THE POINT OF THE FILE: no edge may carry a date, a start, or an absolute day number. Today's
  // task_sequences rows are computed from the dates they are supposed to validate, which is why
  // CPM reports 17/17 critical and float 0..0. An edge that comes from the answer proves nothing.
  .invariant('edges-are-date-independent', () => edgesAreDateIndependent(T))
  // One clock: the template's calendar must equal the engine's own SHIFT_HOURS.
  .invariant('calendar-matches-engine', () => calendarMatchesEngine(T, SHIFT))
  // Duration comes from work content, not from the placement solve's elapsed span.
  .invariant('duration-rule-is-work-content', () => durationRuleIsWorkContent(T))
  // An activity is as long as its SLOWEST TRADE. Dividing total seconds by the SUM of the trades'
  // crews treats trades as fungible and understated HHS by 1.74x overall, 3.00x on one phase.
  .invariant('duration-divisor-is-per-trade', () => durationDivisorIsPerTrade(T))
  // Crew caps bind the FINAL times, not just placement — §DEQ_REPAIR breaches them 4.0x on HHS.
  .invariant('capacity-rule-is-hard', () => capacityRuleIsHard(T))
  // The two instantiation rules v1.0.0 left undefined, both of which HHS actually needs.
  .invariant('dependency-scope-rules-declared', () => dependencyScopeRulesDeclared(T))
  // §4D_BAND_MONOTONIC as logic: a trade may not overtake itself up the building. Without the full
  // ladder the packed-sequential plan is NOT crew-legal (PLUMBER 1.84x over cap on HHS).
  .invariant('ladder-covers-every-level-phase', () => ladderCoversEveryLevelPhase(T))
  // User ruling 2026-08-25: packed and strictly sequential; an overlap is a human's drag, not a
  // solver artifact.
  .invariant('all-edges-are-serial-fs', () => allEdgesAreSerialFS(T))
  .invariant('redctl:ladder rejects a superstructure-only ladder', () => ladderCoversEveryLevelPhase(
    mut(c => { c.dependencies.across_levels = c.dependencies.across_levels.filter(e => e.pred === 'superstructure'); })) === false)
  .invariant('redctl:serial rejects a hand-authored overlap', () => allEdgesAreSerialFS(
    mut(c => { c.dependencies.within_level[0].lag_days = -3; })) === false)
  // ── PER-GATE RED CONTROLS ────────────────────────────────────────────────────────────────
  // The contract allows ONE .redControl(), which proves the witness as a whole can fail. It does
  // NOT prove that each individual gate can. That distinction is not academic here: every gate
  // below this line was added in one sitting, and a gate whose predicate is quietly always-true
  // reads exactly like a gate that passes. Each check injects that gate's OWN real defect into a
  // deep copy and asserts the gate rejects it, every run, in the committed witness — not in a
  // throwaway console session that nobody can re-run.
  .invariant('redctl:bands reject an interleave', () => phaseBandsDoNotOverlap(
    // the §S65 #7 shape: a class at sequence 8 inside Architecture, i.e. after all MEP Rough-in (7)
    [{ classMinSequence: 1, classMaxSequence: 1 }, { classMinSequence: 5, classMaxSequence: 8 },
     { classMinSequence: 7, classMaxSequence: 7 }]) === false)
  .invariant('redctl:bands accept clean bands', () => phaseBandsDoNotOverlap(
    [{ classMinSequence: 1, classMaxSequence: 1 }, { classMinSequence: 5, classMaxSequence: 6 },
     { classMinSequence: 7, classMaxSequence: 7 }]) === true)
  .invariant('redctl:per-trade rejects a summed formula', () => durationDivisorIsPerTrade(
    mut(c => { c.duration_rule.formula = 'days = ceil( sum(installSecs) / (h*3600*crews) ), crews = sum of max_crews over the trades'; })) === false)
  .invariant('redctl:per-trade rejects a drifted divisor_scope', () => durationDivisorIsPerTrade(
    mut(c => { c.duration_rule.divisor_scope = 'pooled'; })) === false)
  .invariant('redctl:capacity rejects placement-only', () => capacityRuleIsHard(
    mut(c => { c.capacity_rule.applies_to = 'the times at first placement'; })) === false)
  .invariant('redctl:capacity rejects a deleted rule', () => capacityRuleIsHard(
    mut(c => { delete c.capacity_rule; })) === false)
  .invariant('redctl:scope rejects a level phase claiming building scope',
    () => phasesDeclareScope([{ scope: 'building', replicate_per_level: true }]) === false)
  .invariant('redctl:edge-scope rejects a dropped empty-phase rule', () => dependencyScopeRulesDeclared(
    mut(c => { delete c.dependencies._empty_phase_rule; })) === false)
  .invariant('redctl:cover rejects an orphaned phase', () => withinLevelChainCoversAllPhases(
    mut(c => { c.dependencies.within_level = c.dependencies.within_level.slice(0, 1); })) === false)
  .invariant('redctl:trades reject an invented trade', () => tradesMatchClassification(
    rows.map((r, i) => i ? r : Object.assign({}, r, { trades: r.trades.concat('WELDER') }))) === false)
  // RED CONTROL — reproduce the real defect this file exists to prevent: give an edge an absolute
  // date, which is exactly the shape schedule_author.js's derived lags have.
  .redControl(rs => {
    T.dependencies.within_level[0].schedule_start = '2026-08-25';
    return rs;
  })
  .run();

delete T.dependencies.within_level[0].schedule_start;

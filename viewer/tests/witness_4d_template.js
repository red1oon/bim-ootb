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
  capacityRuleIsHard, phasesDeclareScope, dependencyScopeRulesDeclared
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
  ' acrossLevelEdges=' + T.dependencies.across_levels.length);
console.log('§4DT_PHASES ' + rows.map(r => r.name + '[' + r.classMinSequence + '-' + r.classMaxSequence + ']' +
  '/' + r.scope).join(' -> '));
console.log('§4DT_CALENDAR hoursPerShift=' + T.calendar.hours_per_shift + ' engineSHIFT_HOURS=' + SHIFT +
  ' daysPerWeek=' + T.calendar.days_per_week + ' durationBasis=' + T.duration_rule.basis +
  ' divisorScope=' + T.duration_rule.divisor_scope);
console.log('§4DT_CAPACITY rule="' + T.capacity_rule.rule + '" appliesTo=' + T.capacity_rule.applies_to);

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
  // RED CONTROL — reproduce the real defect this file exists to prevent: give an edge an absolute
  // date, which is exactly the shape schedule_author.js's derived lags have.
  .redControl(rs => {
    T.dependencies.within_level[0].schedule_start = '2026-08-25';
    return rs;
  })
  .run();

delete T.dependencies.within_level[0].schedule_start;

#!/usr/bin/env node
// WITNESS — sequence_template_lock: the PRESET 4D TEMPLATE itself, before any building, any
// geometry, any kernel_ops. Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S65 STAGE 2.
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1 requires this to be
// named explicitly, because three different layers got conflated as "the fix is witnessed"):
//   this is the TEMPLATE layer — the static sequence/labour rules table. It says NOTHING about
//   `tasks` rows, NOTHING about `kernel_ops` element ops, and NOTHING about the rendered Gantt bar
//   widths. It proves only that the preset every downstream layer is built on is internally sound.
//
// ISSUE THIS PROVES OR DISPROVES — user, 2026-08-25: "the inbuilt preset gantt chart template that
// will always be correct already having all the types and arranged proper sequence - no zero minute
// stacking, no midair MEPs or beams." It had never been checked by anything. §S65 measured 7 real
// defects in it, and the reason they survived is that the failure mode is SILENT: ScheduleAuthor.
// _installSecs (schedule_author.js:62-75) returns a bare `120` seconds when the rule's resource is
// missing or the class has no productivity entry — no §-log at any of its three sites
// (schedule_author.js:64, :70, time_machine.js:4457). On a 45-day axis, 120s is a zero-width bar,
// and every such element starts at the same instant: the reported "zero minute stacking".
//
// POPULATION — the EXECUTED table, not the mirror. STAGE 1 of §S65 established that viewer.html:865
// loads rates.js and NEVER calls loadSequenceRules(), so the JS literal in viewer/rates.js is what
// the browser actually runs and rates/sequence_rules.json is a hand-synced mirror (rates.js:107-110,
// §RULES_TABLE_SOURCE). A witness that read the JSON would repeat the exact mistake that comment
// records: "every Node probe and every viewer/tests/witness_*.js reads the JSON, they were all
// measuring a labour table the browser never used." So: population is loaded from rates.js via
// vm.createContext (the same pattern witness_gantt_bars_in_rect.js uses for a browser-global script),
// and the mirror is checked as a separate invariant instead of trusted.
//
// Durations come from the REAL ScheduleAuthor._installSecs — never a mirrored copy of the formula.
//
// Command: node viewer/tests/witness_sequence_template_lock.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { Witness } = require('../../witness_kit/contract');
const { TemplateRuleRow } = require('../../witness_kit/schemas/template');
const {
  noZeroMinuteRows, everyResourceResolves, phaseBandsDisjoint, phaseBandReport, FALLBACK_SECS
} = require('../../witness_kit/invariants/template');

const VIEWER_DIR = process.env.VIEWER_DIR || path.join(__dirname, '..');
const SA = require(path.join(VIEWER_DIR, 'schedule_author.js'));

// ── the EXECUTED table (viewer/rates.js JS literal) ─────────────────────────
function loadExecutedTable() {
  const sandbox = { console: { log() {}, warn() {}, error() {} }, window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(VIEWER_DIR, 'rates.js'), 'utf8'), sandbox);
  return {
    rules: sandbox.SEQUENCE_RULES,
    labor: sandbox.LABOR_RATES,
    dflt: sandbox.SEQUENCE_DEFAULT,
    overrides: sandbox.SEQUENCE_NAME_OVERRIDES || []
  };
}

// ── the MIRROR (rates/sequence_rules.json), for the drift invariant only ────
function loadMirror() {
  return JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', 'sequence_rules.json'), 'utf8'));
}

const T = loadExecutedTable();
const M = loadMirror();

/**
 * One row per schedulable declaration, with its REAL duration attached.
 * A NAME_OVERRIDE contributes one row per class it declares, because the override REPLACES the
 * resource for that class — §S65 defect 4 is exactly an override moving IfcPlate/IfcMember from
 * STEEL_ERECTOR (which has productivity 12/10) to CARPENTER (which has neither), so the override's
 * own class list is where the duration is silently lost. Checking the override once, class-free,
 * would miss it.
 * @returns {object[]}
 */
function buildRows() {
  const rows = [];
  Object.keys(T.rules).forEach(cls => {
    const r = T.rules[cls];
    rows.push({
      key: 'rule:' + cls, kind: 'rule', cls,
      phase: r.phase, sequence: r.sequence, resource: r.resource == null ? null : r.resource,
      installSecs: SA._installSecs(cls, r, T.labor, null, null)
    });
  });
  T.overrides.forEach(o => {
    (o.classes || []).forEach(cls => {
      rows.push({
        key: 'override:' + o.id + ':' + cls, kind: 'override', cls,
        phase: o.phase, sequence: o.sequence, resource: o.resource == null ? null : o.resource,
        installSecs: SA._installSecs(cls, o, T.labor, null, null)
      });
    });
  });
  // SEQUENCE_DEFAULT is what EVERY unmatched IFC class in EVERY building resolves to — the widest
  // blast radius in the file, and §S65 defect 1. `cls` is a deliberate sentinel: the default's whole
  // point is that it applies to a class the table does not name.
  rows.push({
    key: 'default:SEQUENCE_DEFAULT', kind: 'default', cls: '__UNMATCHED_CLASS__',
    phase: T.dflt.phase, sequence: T.dflt.sequence,
    resource: T.dflt.resource == null ? null : T.dflt.resource,
    installSecs: SA._installSecs('__UNMATCHED_CLASS__', T.dflt, T.labor, null, null)
  });
  return rows;
}

const rows = buildRows();

// §-log proof lines: the shape of what was checked, readable without re-running.
const zero = rows.filter(r => r.installSecs === FALLBACK_SECS);
console.log('§TPL_SOURCE executed=viewer/rates.js rules=' + Object.keys(T.rules).length +
  ' labor=' + Object.keys(T.labor).length + ' overrides=' + T.overrides.length + ' rows=' + rows.length);
console.log('§TPL_BANDS ' + phaseBandReport(rows));
console.log('§TPL_ZERO_MINUTE n=' + zero.length + '/' + rows.length +
  (zero.length ? ' [' + zero.map(r => r.key + '(res=' + r.resource + ')').join(' ') + ']' : ''));

/**
 * The mirror must be byte-equal to the executed table on every FUNCTIONAL key. The JSON additionally
 * carries a `reason` string per override (documentation the JS literal omits) — that difference is
 * intentional and is excluded, so this invariant fails on real drift and not on prose.
 * @returns {boolean}
 */
function mirrorMatchesExecuted() {
  const strip = o => {
    const c = Object.assign({}, o); delete c.reason; return c;
  };
  if (JSON.stringify(T.rules) !== JSON.stringify(M.SEQUENCE_RULES)) return false;
  if (JSON.stringify(T.labor) !== JSON.stringify(M.LABOR_RATES)) return false;
  if (JSON.stringify(T.dflt) !== JSON.stringify(M.SEQUENCE_DEFAULT)) return false;
  const a = (T.overrides || []).map(strip), b = (M.NAME_OVERRIDES || []).map(strip);
  return JSON.stringify(a) === JSON.stringify(b);
}

Witness('sequence_template_lock')
  .population(() => rows)
  .schema(TemplateRuleRow)
  // G-TPL-ZERO — the gate that would have caught §S65 defects 1-6 the day they were written.
  .invariant('no-zero-minute-rows', noZeroMinuteRows)
  // G-TPL-RES — a null/absent resource is exactly what routes a row to the silent floor.
  .invariant('every-resource-resolves', rs => everyResourceResolves(rs, T.labor))
  // G-TPL-BANDS — §S65 defect 7: Architecture spans seq 5-8 while MEP Rough-in sits at 7, so
  // IfcRoof (Architecture, seq 8) sequences after all MEP rough-in — MEP before the roof exists.
  .invariant('phase-bands-disjoint', phaseBandsDisjoint)
  // STAGE 1 lock — the executed table and the shipped JSON must not diverge. This is the property
  // that silently broke once already (ELECTRICIAN.productivity: 15 class keys in rates.js vs 8 in
  // the JSON, rates.js:110-116) and cost a measured 1889.4d-vs-1926.4d Hospital programme error.
  .invariant('mirror-matches-executed', mirrorMatchesExecuted)
  // RED CONTROL — reproduce the real §S65 defect shape rather than a synthetic break: strip one
  // row's resource and RECOMPUTE its duration through the real _installSecs, which is what actually
  // returns the 120s floor. A hand-set installSecs=120 would prove the assertion, not the mechanism.
  .redControl(rs => rs.map((r, i) => {
    if (i !== 0) return r;
    const broken = Object.assign({}, r, { resource: null });
    broken.installSecs = SA._installSecs(broken.cls, { resource: null }, T.labor, null, null);
    return broken;
  }))
  .run();

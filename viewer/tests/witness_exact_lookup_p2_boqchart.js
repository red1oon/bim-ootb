#!/usr/bin/env node
// witness_exact_lookup_p2_boqchart.js — CLASSIFICATION_EXACT_LOOKUP_BLINDSPOT.md §BUILD PLAN P2, the
// OTHER higher-priority consumer: boq_charts.html:1808/1813's resource/crew-count chart. proj_fold.js
// (witness_exact_lookup_p2.js) is a real Node-requirable module; this one is inline <script> in an
// .html file, so it can't be required directly. Slicing the LITERAL shipped block between two fixed
// marker comments and running it in a vm sandbox — same "extract, never reimplement" discipline
// witness_class_fallback_blackbox.js already uses for time_machine.js's inline closures — so this
// witness proves the actual shipped lines, not a paraphrase of them.
//
// THE ISSUE THIS PROVES OR DISPROVES: same as proj_fold.js's — a raw SEQUENCE_RULES[cls] dict lookup
// misses tier 1 substring matches (IfcDoorType) and tier 2 hierarchy inheritance (IfcTank), silently
// defaulting the chart's crew-count to 'LABORER' for both.
//
// Run: node witness_exact_lookup_p2_boqchart.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const RULES_PATH = path.join(__dirname, '..', 'rates', 'sequence_rules.json');
const rulesJson = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
const SEQUENCE_RULES = rulesJson.SEQUENCE_RULES || rulesJson;
const SEQUENCE_DEFAULT = rulesJson.SEQUENCE_DEFAULT || { phase: 'Architecture', sequence: 6, resource: null };

const HIERARCHY_PATH = path.join(__dirname, '..', 'rates', 'ifc_schema_hierarchy.json');
const hierarchyJson = JSON.parse(fs.readFileSync(HIERARCHY_PATH, 'utf8'));
const HIERARCHY = {};
for (const cls in hierarchyJson) { if (cls !== '_meta') HIERARCHY[cls] = hierarchyJson[cls]; }

// classify(cls, hierarchy)'s 2-arg form (the exact shape the shipped boq_charts.html code below
// calls) reads rules/dflt off schedule_author.js's own module-scope `global` (bound to `self||this`
// at require time) — in the real browser that's `window`, populated by rates.js BEFORE
// schedule_author.js loads (viewer.html:62 then :67). Replicating that here, not working around it:
// set Node's `global.self` with the real rules/hierarchy BEFORE requiring the module, so classify()'s
// internal default sees the same data window.SEQUENCE_RULES would hold in a real page load.
global.self = { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, IFC_SCHEMA_HIERARCHY: HIERARCHY };
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

// ── slice the literal shipped block, verbatim, between its own comment markers ──
const SRC_PATH = path.join(__dirname, '..', 'boq_charts.html');
const src = fs.readFileSync(SRC_PATH, 'utf8');
const startMarker = '// Aggregate resources across all tasks';
const endMarker = "const resBox = el('div','chart-box full');";
const si = src.indexOf(startMarker);
const ei = src.indexOf(endMarker, si);
if (si < 0 || ei < 0) { console.log('  FAIL G-SLICE could not locate the shipped block markers in boq_charts.html'); process.exit(1); }
const block = src.slice(si, ei);
if (!/window\.ScheduleAuthor\.classify/.test(block)) {
  console.log('  FAIL G-SLICE sliced block does not contain the expected classify() call — markers drifted from the real code');
  process.exit(1);
}

// ── run it, verbatim, in a sandbox exposing exactly what the real page would: window.ScheduleAuthor
// (real, required) + window.IFC_SCHEMA_HIERARCHY (real, loaded from the real JSON) + a synthetic
// scheduleData covering the same three ground-truthed cases as witness_exact_lookup_p2.js ──
const scheduleData = [
  { ifcClasses: ['IfcTank'], qty: 1 },      // tier 2 — via IfcFlowStorageDevice → PLUMBER
  { ifcClasses: ['IfcDoorType'], qty: 1 },  // tier 1 substring — via IfcDoor → CARPENTER
  { ifcClasses: ['IfcActor'], qty: 1 }      // genuine tier 3 — no match at all → LABORER default
];
const sandbox = {
  window: { ScheduleAuthor: ScheduleAuthor, IFC_SCHEMA_HIERARCHY: HIERARCHY },
  scheduleData: scheduleData,
  EQUIPMENT_ALLOCATION: {},   // not under test here — real crew-chart concern only
  console: console,
  resCounts: undefined, maxResCrew: undefined, machineSet: undefined
};
vm.createContext(sandbox);
// `const`/`let` in the sliced block don't become own-properties of the vm context the way `var`
// would — appending a capture line in the SAME script (same lexical scope) reads them back without
// altering the sliced logic itself.
vm.runInContext(block + '\nthis.__captured = { resCounts: resCounts, maxResCrew: maxResCrew };', sandbox);
sandbox.resCounts = sandbox.__captured.resCounts;
sandbox.maxResCrew = sandbox.__captured.maxResCrew;

console.log('§P2_BOQCHART_RESCOUNTS ' + JSON.stringify(sandbox.resCounts));
assert(sandbox.resCounts.PLUMBER === 1, 'G-P IfcTank (tier 2) contributes to PLUMBER crew count in the real sliced block, not LABORER');
assert(sandbox.resCounts.CARPENTER === 1, 'G-Q IfcDoorType (tier 1 substring) contributes to CARPENTER crew count, not LABORER');
assert(sandbox.resCounts.LABORER === 1, 'G-R IfcActor (genuine tier 3) still defaults to LABORER — this bucket is unaffected, by design');

console.log('\n§EXACT_LOOKUP_P2_BOQCHART_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);

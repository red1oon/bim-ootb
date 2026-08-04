#!/usr/bin/env node
// witness_schema_exhaustive_classify.js — CLASSIFICATION_EXACT_LOOKUP_BLINDSPOT.md §BUILD PLAN P1:
// "export classify() from schedule_author.js, witnessed against the existing
// witness_schema_exhaustive_fallback.js's 1006-class sweep (same tiers, same numbers, just via the
// new export instead of the internal closure)."
//
// THE ISSUE THIS PROVES OR DISPROVES: classify() is a NEW code path (a second call site into
// matchRule, not matchRule itself) — nothing guarantees it reaches tier 1/2/3 the same way matchRule's
// direct callers do until it's driven across the SAME exhaustive class list and diffed against the
// SAME expected tier a real caller would see. A classify() that silently dropped `hierarchy` or
// defaulted `rules`/`dflt` wrong would regress every consumer P2/P3 route through it, invisibly,
// because none of those consumers have their own per-class coverage.
//
// FAILS on:
//   G-H: classify(cls, ...) returns a DIFFERENT rule object than matchRule(cls, ...) for the same
//        class — classify must be a pure pass-through, not a reimplementation.
//   G-I: the tier distribution (132/53/821, pinned from witness_schema_exhaustive_fallback.js's own
//        run) drifts — would mean either witness or the rules/hierarchy data changed underneath this
//        one without both being updated together.
//
// Run: node witness_schema_exhaustive_classify.js
'use strict';
const fs = require('fs');
const path = require('path');

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

const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
if (!ScheduleAuthor.classify) { console.log('  FAIL G-EXPORT ScheduleAuthor.classify is exported'); process.exit(1); }

const classNames = Object.keys(HIERARCHY).sort();
let tier1 = 0, tier2 = 0, tier3 = 0, mismatches = 0;

classNames.forEach(function (cls) {
  let mrWarn = null, clWarn = null;
  const origWarn = console.warn;

  console.warn = function (msg) { mrWarn = msg; };
  const mrRule = ScheduleAuthor.matchRule(cls, SEQUENCE_RULES, SEQUENCE_DEFAULT, HIERARCHY);

  console.warn = function (msg) { clWarn = msg; };
  const clRule = ScheduleAuthor.classify(cls, HIERARCHY, SEQUENCE_RULES, SEQUENCE_DEFAULT);

  console.warn = origWarn;

  if (clRule !== mrRule || clWarn !== mrWarn) {
    mismatches++;
    console.log('  MISMATCH cls=' + cls + ' matchRule.warn=' + mrWarn + ' classify.warn=' + clWarn);
  }

  if (mrWarn === null) tier1++;
  else if (mrWarn.indexOf('§CLASS_UNMATCHED_INHERITED') === 0) tier2++;
  else tier3++;
});

console.log('\n=== classify() vs matchRule() across ' + classNames.length + ' real IFC classes ===');
console.log('  tier 1 (explicit)  : ' + tier1);
console.log('  tier 2 (inherited) : ' + tier2);
console.log('  tier 3 (generic)   : ' + tier3);

assert(mismatches === 0, 'G-H classify() returns the identical rule+warn as matchRule() for every class — mismatches=' + mismatches);
assert(tier1 === 132, 'G-I tier 1 count pinned to witness_schema_exhaustive_fallback.js baseline (132), got ' + tier1);
assert(tier2 === 53, 'G-I tier 2 count pinned to witness_schema_exhaustive_fallback.js baseline (53), got ' + tier2);
assert(tier3 === 821, 'G-I tier 3 count pinned to witness_schema_exhaustive_fallback.js baseline (821), got ' + tier3);

// classify(cls) with no hierarchy arg at all — real call sites that only pass `cls` (P2's
// boq_charts.html chart, proj_fold.js) must still resolve tier 1 correctly; tier 2 simply never
// fires (identical to an omitted-hierarchy matchRule call), never silently throws on missing arg.
const noHierRule = ScheduleAuthor.classify('IfcWall', undefined, SEQUENCE_RULES, SEQUENCE_DEFAULT);
assert(!!noHierRule && noHierRule.phase != null, 'G-J classify(cls) with no hierarchy arg still resolves tier 1 for a real explicit class (IfcWall)');

console.log('\n§SCHEMA_EXHAUSTIVE_CLASSIFY_SUMMARY pass=' + pass + ' fail=' + fail
  + ' tier1=' + tier1 + ' tier2=' + tier2 + ' tier3=' + tier3);
process.exit(fail ? 1 : 0);

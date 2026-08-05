#!/usr/bin/env node
// witness_exact_lookup_p3_getphase.js — CLASSIFICATION_EXACT_LOOKUP_BLINDSPOT.md §BUILD PLAN P3:
// rates.js's getPhase(ifcClass) — consumed by variation_order.js:133/154/176 (S222 Variation Order
// Excel export, a real financial/contractual document) — was a raw SEQUENCE_RULES[ifcClass] exact-key
// lookup. Fixing getPhase() itself (rather than variation_order.js's 3 call sites) closes the gap for
// all 3 in one place, since they only ever call the shared helper.
//
// THE ISSUE THIS PROVES OR DISPROVES: same tier 1 substring / tier 2 inheritance gap as P2 — an
// IfcDoorType or IfcTank in an ADDED/REMOVED/CHANGED variation row used to silently get the generic
// default phase, mispricing the FIDIC Clause 12 impact bucket it's grouped under. Slices the LITERAL
// shipped getPhase() (via vm, not reimplemented) and drives it against ground-truthed cases.
//
// Run: node witness_exact_lookup_p3_getphase.js
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

global.self = { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, IFC_SCHEMA_HIERARCHY: HIERARCHY };
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

// ── slice the literal shipped getPhase() out of rates.js ──
const src = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
const startMarker = 'function getPhase(ifcClass) {';
const si = src.indexOf(startMarker);
if (si < 0) { console.log('  FAIL G-SLICE could not locate getPhase() in rates.js'); process.exit(1); }
const ei = src.indexOf('\n}', si) + 2;
const block = src.slice(si, ei);
if (!/window\.ScheduleAuthor\.classify/.test(block)) {
  console.log('  FAIL G-SLICE sliced getPhase() does not contain the expected classify() call — marker drifted from the real code');
  process.exit(1);
}

const sandbox = { window: { ScheduleAuthor: ScheduleAuthor, IFC_SCHEMA_HIERARCHY: HIERARCHY }, SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, console: console };
vm.createContext(sandbox);
vm.runInContext(block, sandbox);

assert(sandbox.getPhase('IfcFooting') === 'Substructure', 'G-Y IfcFooting (tier 1 explicit) resolves Substructure');
assert(sandbox.getPhase('IfcTank') === 'MEP Rough-in', 'G-Z IfcTank (tier 2, via IfcFlowStorageDevice) resolves MEP Rough-in, not the generic default');
assert(sandbox.getPhase('IfcDoorType') === 'Architecture', 'G-AA IfcDoorType (tier 1 substring, via IfcDoor) resolves Architecture, not the generic default');
assert(sandbox.getPhase('IfcActor') === 'Architecture', 'G-AB IfcActor (genuine tier 3) resolves the generic default (Architecture) — getPhase has no Unsequenced/OTHER concept of its own, unchanged from before');

console.log('\n§EXACT_LOOKUP_P3_GETPHASE_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);

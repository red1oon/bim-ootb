#!/usr/bin/env node
// witness_exact_lookup_p3_workpackages.js — CLASSIFICATION_EXACT_LOOKUP_BLINDSPOT.md §BUILD PLAN P3:
// WORK_PACKAGES used to carry its own hand-maintained `classes: [...]` membership array per package —
// a 4th, fully separate hardcoded classification, not even keyed off SEQUENCE_RULES. Verified
// (session transcript) that every one of the 15 non-empty rate templates' work_packages arrays carry
// BYTE-IDENTICAL `classes` groupings to rates.js's own default, in the SAME PACKAGE 1..6 order — so a
// positional `phase` field (SEQUENCE_RULES' own field) was added to rates.js AND all 15 template
// JSONs, and export_5d.js now derives Work Package membership from the real classify() tier 1->2->3
// result instead of `.classes.includes()`.
//
// THE ISSUE THIS PROVES OR DISPROVES: same class of gap as P2 — IfcDoorType (tier 1 substring, only
// 'IfcFooting'/'IfcDoor'/etc. were literal keys) and IfcTank (tier 2, only its ancestor
// IfcFlowStorageDevice was ever in a classes:[...] list) both used to fall silently into the "OTHER"
// catch-all, indistinguishable from a genuinely unclassified class like IfcActor. This slices the
// LITERAL shipped export_5d.js block (via vm, not reimplemented) and proves all three now resolve to
// their real package, while IfcActor (genuine tier 3) still lands in OTHER — not silently merged into
// a real package the way P2 found for proj_fold.js's 'Unsequenced' bucket.
//
// Run: node witness_exact_lookup_p3_workpackages.js
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

// classify()'s 2-arg form reads schedule_author.js's own module-scope `global` (bound at require
// time) — replicate what rates.js/schedule_author.js loading in a real page provides (same technique
// as witness_exact_lookup_p2_boqchart.js).
global.self = { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, IFC_SCHEMA_HIERARCHY: HIERARCHY };
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

// ── the REAL WORK_PACKAGES — required verbatim by extracting the var declaration out of rates.js's
// own source text (rates.js is a plain script, not require()-able: it references DOM/window at load
// time). Sliced between its own fixed markers, same discipline as the export_5d.js slice below. ──
const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
const wpStart = ratesSrc.indexOf('var WORK_PACKAGES = [');
const wpEnd = ratesSrc.indexOf('];', wpStart) + 2;
if (wpStart < 0) { console.log('  FAIL G-SLICE could not locate WORK_PACKAGES in rates.js'); process.exit(1); }
const WORK_PACKAGES = vm.runInNewContext(ratesSrc.slice(wpStart, wpEnd) + '\nWORK_PACKAGES;');
assert(WORK_PACKAGES.length === 6 && WORK_PACKAGES.every(wp => !!wp.phase), 'G-S rates.js WORK_PACKAGES has 6 entries, every one carries `phase` (classes:[...] retired)');

// ── slice the literal shipped classification block from export_5d.js ──
const srcPath = path.join(__dirname, '..', 'export_5d.js');
const src = fs.readFileSync(srcPath, 'utf8');
const startMarker = '// §EXACT_LOOKUP_BLINDSPOT P3';
const endMarker = "const wsWP = wb.addWorksheet('Work Packages');";
const si = src.indexOf(startMarker);
const ei = src.indexOf(endMarker, si);
if (si < 0 || ei < 0) { console.log('  FAIL G-SLICE could not locate the shipped block markers in export_5d.js'); process.exit(1); }
const block = src.slice(si, ei);
if (!/window\.ScheduleAuthor\.classify/.test(block)) {
  console.log('  FAIL G-SLICE sliced block does not contain the expected classify() call — markers drifted from the real code');
  process.exit(1);
}

const qtoData = [
  { cls: 'IfcFooting', desc: 'Footing', qty: 1, matTotal: 100, laborCost: 50, equipCost: 0 },   // tier 1 explicit -> PACKAGE 1 Substructure
  { cls: 'IfcTank', desc: 'Water Tank', qty: 1, matTotal: 200, laborCost: 80, equipCost: 0 },    // tier 2 via IfcFlowStorageDevice -> PACKAGE 3 MEP Rough-in
  { cls: 'IfcDoorType', desc: 'Door Type', qty: 2, matTotal: 300, laborCost: 60, equipCost: 0 }, // tier 1 substring via IfcDoor -> PACKAGE 4 Architecture
  { cls: 'IfcActor', desc: 'Unclassified', qty: 1, matTotal: 10, laborCost: 5, equipCost: 0 }    // genuine tier 3 -> OTHER
];

const sandbox = {
  window: { ScheduleAuthor: ScheduleAuthor, IFC_SCHEMA_HIERARCHY: HIERARCHY },
  WORK_PACKAGES: WORK_PACKAGES,
  qtoData: qtoData,
  console: console
};
vm.createContext(sandbox);
vm.runInContext(block + '\nthis.__captured = { rowsByWpId: rowsByWpId, otherRows: otherRows, allWPs: allWPs };', sandbox);
const { rowsByWpId, otherRows, allWPs } = sandbox.__captured;

console.log('§P3_WORKPACKAGES rowsByWpId=' + JSON.stringify(Object.keys(rowsByWpId).reduce((a, k) => (a[k] = rowsByWpId[k].map(r => r.cls), a), {}))
  + ' other=' + otherRows.map(r => r.cls).join(','));

assert((rowsByWpId['PACKAGE 1'] || []).some(r => r.cls === 'IfcFooting'), 'G-T IfcFooting (tier 1 explicit) lands in PACKAGE 1 SUBSTRUCTURE');
assert((rowsByWpId['PACKAGE 3'] || []).some(r => r.cls === 'IfcTank'), 'G-U IfcTank (tier 2, via IfcFlowStorageDevice) lands in PACKAGE 3 MEP ROUGH-IN, not OTHER');
assert((rowsByWpId['PACKAGE 4'] || []).some(r => r.cls === 'IfcDoorType'), 'G-V IfcDoorType (tier 1 substring, via IfcDoor) lands in PACKAGE 4 ARCHITECTURE, not OTHER');
assert(otherRows.some(r => r.cls === 'IfcActor'), 'G-W IfcActor (genuine tier 3) still lands in OTHER, not silently merged into a real package');
const otherWp = allWPs.find(wp => wp.name === 'OTHER');
assert(!!otherWp && otherWp.id === 'PACKAGE 7', 'G-X the dynamically-added OTHER package is PACKAGE 7, not a duplicate PACKAGE 6 (pre-existing id collision with MEP FINAL FIX, fixed)');
assert(allWPs.some(wp => wp.id === 'PACKAGE 6' && wp.name === 'MEP FINAL FIX'), 'G-X PACKAGE 6 stays MEP FINAL FIX, unaffected by the OTHER id fix');

console.log('\n§EXACT_LOOKUP_P3_WORKPACKAGES_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);

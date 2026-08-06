#!/usr/bin/env node
// witness_schema_exhaustive_fallback.js — the SCHEMA-EXHAUSTIVE version of
// witness_class_fallback_blackbox.js, per BUILDINGSMART_IFC_SCHEMA_CLASSIFICATION.md §BUILD PLAN P3:
// "for EVERY class in the generated hierarchy JSON (not just ones seen in current building
// fixtures), confirm it resolves via tier 1 or tier 2 to a non-generic classification, or is a
// legitimate tier-3 case with a human-reviewable §CLASS_UNMATCHED log line."
//
// THE ISSUE THIS PROVES OR DISPROVES: witness_class_fallback_blackbox.js's coverage is bounded by
// which buildings happen to get tested — it can only ever find "one more" unmatched class per real
// fixture that happens to contain it (this is literally how PRs #1186/#1187 found their gaps, one
// building at a time). This witness tests the REAL matchRule() (required from schedule_author.js,
// unchanged, not reimplemented) against EVERY one of the ~1000 real IFC2X3/IFC4/IFC4X3 entity names
// in viewer/rates/ifc_schema_hierarchy.json — the finite, authoritative space of possible classes —
// so a genuinely new building can never surface a class this witness didn't already account for.
//
// FAILS on:
//   G-E: a class resolves to tier 3 (generic default) EVEN THOUGH some ancestor in its own real
//        schema chain DOES have an explicit SEQUENCE_RULES entry — this would mean matchRule's tier
//        2 has a bug (the walk should have found it).
//   G-F: a class whose own substring DOES match an explicit SEQUENCE_RULES key nonetheless resolves
//        via tier 2 (`via=`) instead of tier 1 — tier 1 must always win when present. Named
//        explicitly in the dev-session calibration note: IfcSensorType/IfcFlowInstrumentType are
//        explicit as of PR #1187 and must resolve tier 1, NOT tier 2.
// Tier 3 (generic default) is NOT a failure by itself — it is the legitimate, human-reviewable
// outcome for a real top-level family nobody has classified yet (logged, not silently swallowed).
//
// Run: node witness_schema_exhaustive_fallback.js
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// ── Real rules data — the same JSON the shipped engine loads ──
const RULES_PATH = path.join(__dirname, '..', 'rates', 'sequence_rules.json');
const rulesJson = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
const SEQUENCE_RULES = rulesJson.SEQUENCE_RULES || rulesJson;
const SEQUENCE_DEFAULT = rulesJson.SEQUENCE_DEFAULT || { phase: 'Architecture', sequence: 6, resource: null };

// ── Real hierarchy data — P1's output, tools/dump_ifc_schema_hierarchy.py ──
const HIERARCHY_PATH = path.join(__dirname, '..', 'rates', 'ifc_schema_hierarchy.json');
const hierarchyJson = JSON.parse(fs.readFileSync(HIERARCHY_PATH, 'utf8'));
const HIERARCHY = {};
let classCount = 0;
for (const cls in hierarchyJson) {
  if (cls === '_meta') continue;
  HIERARCHY[cls] = hierarchyJson[cls];
  classCount++;
}
console.log('§SCHEMA_EXHAUSTIVE_LOAD classes=' + classCount
  + ' schema_versions=' + (hierarchyJson._meta ? hierarchyJson._meta.schema_versions.join(',') : '?')
  + ' rules=' + Object.keys(SEQUENCE_RULES).length);

// ── The REAL matchRule — required, not reimplemented (schedule_author.js is the canonical copy;
// the other two are byte-for-byte-equivalent closures in time_machine.js, already proven identical
// by witness_class_fallback_blackbox.js's G-B check — no need to re-slice them here). ──
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

// Independent of matchRule: does the class's OWN name substring-match an explicit rule key at all?
// (same longest-substring rule matchRule itself uses) — used to detect G-F (tier 1 should have won).
function hasOwnExplicitRule(cls) {
  for (const key in SEQUENCE_RULES) if (cls.indexOf(key) >= 0) return true;
  return false;
}

// Independent of matchRule: does ANY ancestor in the class's real chain have an EXACT explicit rule
// entry? (mirrors matchRule's own tier-2 exact-key lookup) — used to detect G-E (tier 2 should have
// found it but didn't).
function hasClassifiedAncestor(cls) {
  const chain = HIERARCHY[cls] || [];
  for (let i = 0; i < chain.length; i++) {
    if (Object.prototype.hasOwnProperty.call(SEQUENCE_RULES, chain[i])) return chain[i];
  }
  return null;
}

const tier1Hits = [], tier2Hits = [], tier3Hits = [];
const gEFails = [], gFFails = [];

const classNames = Object.keys(HIERARCHY).sort();
classNames.forEach(function (cls) {
  // Capture console.warn output for this one call so we can tell which tier fired without
  // duplicating matchRule's own tier logic (the log line itself IS the tier signal: tier 2 emits
  // §CLASS_UNMATCHED_INHERITED, tier 3 emits §CLASS_UNMATCHED, tier 1 emits nothing).
  let warned = null;
  const origWarn = console.warn;
  console.warn = function (msg) { warned = msg; };
  const rule = ScheduleAuthor.matchRule(cls, SEQUENCE_RULES, SEQUENCE_DEFAULT, HIERARCHY);
  console.warn = origWarn;

  const ownExplicit = hasOwnExplicitRule(cls);
  const ancestorHit = hasClassifiedAncestor(cls);

  if (warned === null) {
    // Tier 1 — no warn at all.
    tier1Hits.push(cls);
    if (!ownExplicit) { gFFails.push({ cls: cls, note: 'resolved silently (tier 1 shape) but no own-name substring match found — matchRule bug?' }); }
  } else if (warned.indexOf('§CLASS_UNMATCHED_INHERITED') === 0) {
    tier2Hits.push({ cls: cls, via: warned.split('via=')[1].split(' ')[0] });
    if (ownExplicit) { gFFails.push({ cls: cls, note: 'resolved via tier 2 (' + warned + ') but its OWN name already substring-matches an explicit rule — tier 1 should have won' }); }
  } else if (warned.indexOf('§CLASS_UNMATCHED ') === 0) {
    tier3Hits.push(cls);
    if (ancestorHit) { gEFails.push({ cls: cls, note: 'fell to tier 3 but ancestor "' + ancestorHit + '" IS explicitly classified — tier 2 walk should have found it' }); }
  } else {
    gEFails.push({ cls: cls, note: 'unrecognized warn shape: ' + warned });
  }
});

console.log('\n=== tier distribution across ' + classNames.length + ' real IFC2X3/IFC4/IFC4X3 entity classes ===');
console.log('  tier 1 (explicit)  : ' + tier1Hits.length);
console.log('  tier 2 (inherited) : ' + tier2Hits.length);
console.log('  tier 3 (generic)   : ' + tier3Hits.length);

// Calibration spot-check named explicitly in the task: these must resolve tier 1 (PR #1187 gave
// them explicit entries), NOT tier 2, even though they'd also be reachable via their classified
// parent IfcDistributionControlElement/-Type.
['IfcSensorType', 'IfcFlowInstrumentType'].forEach(function (cls) {
  const inTier1 = tier1Hits.indexOf(cls) >= 0;
  assert(inTier1, 'G-CAL ' + cls + ' resolves via TIER 1 (explicit, PR #1187), not tier 2');
});

// §GROUND TRUTH spot-check: IfcSwitchingDevice has no own-name explicit entry match beyond its own
// literal key (it DOES have one, added by PR #1186) — still expect tier 1.
assert(tier1Hits.indexOf('IfcSwitchingDevice') >= 0, 'G-CAL IfcSwitchingDevice resolves via TIER 1 (explicit, PR #1186)');

// Print every tier-2 hit for human review (this is the "loud, not silent" promotion-candidate list).
if (tier2Hits.length) {
  console.log('\n--- tier 2 (inherited) classifications, human-reviewable promotion candidates ---');
  tier2Hits.forEach(function (h) { console.log('  ' + h.cls + '  via=' + h.via); });
}
// Print every tier-3 hit for human review (legitimate — a real top-level family, not yet ruled on).
if (tier3Hits.length) {
  console.log('\n--- tier 3 (generic default) — legitimate unclassified families, ' + tier3Hits.length + ' total ---');
  console.log('  (sample) ' + tier3Hits.slice(0, 15).join(', ') + (tier3Hits.length > 15 ? ', ...' : ''));
}

assert(gEFails.length === 0, 'G-E no class fell to tier 3 while a real ancestor IS classified — misses=' + gEFails.length
  + (gEFails.length ? '  [' + gEFails.map(function (f) { return f.cls + ': ' + f.note; }).join('; ') + ']' : ''));
assert(gFFails.length === 0, 'G-F tier 1 always wins over tier 2 when an explicit own-name match exists — misses=' + gFFails.length
  + (gFFails.length ? '  [' + gFFails.map(function (f) { return f.cls + ': ' + f.note; }).join('; ') + ']' : ''));
assert(tier1Hits.length + tier2Hits.length + tier3Hits.length === classNames.length,
  'G-G every one of the ' + classNames.length + ' real schema classes is accounted for by exactly one tier');

console.log('\n§SCHEMA_EXHAUSTIVE_AUDIT SUMMARY pass=' + pass + ' fail=' + fail
  + ' tier1=' + tier1Hits.length + ' tier2=' + tier2Hits.length + ' tier3=' + tier3Hits.length);
process.exit(fail ? 1 : 0);

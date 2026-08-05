#!/usr/bin/env node
// witness_exact_lookup_p2.js — CLASSIFICATION_EXACT_LOOKUP_BLINDSPOT.md §BUILD PLAN P2: wire the two
// higher-priority live consumers (boq_charts.html:1808/1813 crew chart, proj_fold.js ERP push) through
// ScheduleAuthor.classify() instead of a raw SEQUENCE_RULES[cls]/SR[cls] dict lookup.
//
// THE ISSUE THIS PROVES OR DISPROVES: a raw dict lookup misses BOTH tier 1's substring match (a
// Type-suffixed class like IfcDoorType never had its own SEQUENCE_RULES key, only 'IfcDoor' does) AND
// tier 2's schema-hierarchy inheritance (a class like IfcTank has no entry of its own OR any
// substring match, only its real ancestor IfcFlowStorageDevice does). Both used to silently fall to
// proj_fold.js's local 'Unsequenced'/'GENERAL' bucket and boq_charts.html's 'LABORER' default — not
// wrong exactly, just needlessly generic when a real classification was one substring/one hierarchy
// hop away. This witness proves: (a) proj_fold.js's REAL foldProjectOrder (required verbatim, not
// reimplemented) now resolves both cases correctly when given `hierarchy`, (b) genuinely unclassified
// classes (true tier 3) still land in 'Unsequenced' — NOT 'Architecture' — preserving the exact
// dashboard contract time_machine.js:4376 / poc_dashboard_variance.js:31 depend on
// (`WHERE Name<>'Unsequenced'`), (c) omitting `hierarchy` entirely (existing callers like
// bake_gw_hospital_seed.js) degrades to the identical pre-fix 'Unsequenced' outcome — never a
// regression for callers that haven't been updated to pass it yet.
//
// Run: node witness_exact_lookup_p2.js
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const ProjFold = require(path.join(__dirname, '..', 'proj_fold.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const RULES_PATH = path.join(__dirname, '..', 'rates', 'sequence_rules.json');
const rulesJson = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
const SEQUENCE_RULES = rulesJson.SEQUENCE_RULES || rulesJson;

const HIERARCHY_PATH = path.join(__dirname, '..', 'rates', 'ifc_schema_hierarchy.json');
const hierarchyJson = JSON.parse(fs.readFileSync(HIERARCHY_PATH, 'utf8'));
const HIERARCHY = {};
for (const cls in hierarchyJson) { if (cls !== '_meta') HIERARCHY[cls] = hierarchyJson[cls]; }

// Three real cases, ground-truthed directly against sequence_rules.json / ifc_schema_hierarchy.json:
//   IfcTank        — no own entry, no substring match; ancestor IfcFlowStorageDevice IS classified
//                    (MEP Rough-in / PLUMBER) — tier 2, the schema-hierarchy gap.
//   IfcDoorType    — no own entry; but 'IfcDoorType'.indexOf('IfcDoor')>=0 — tier 1, the substring gap
//                    a raw exact-key dict lookup can never see (Architecture / CARPENTER, from IfcDoor).
//   IfcActor       — no own entry, ancestor chain [IfcObject, IfcObjectDefinition, IfcRoot] has no
//                    classified member either — genuinely tier 3, must stay 'Unsequenced'.
const PRICED = [
  { disc: 'MEP', cls: 'IfcTank', storey: 'L1', unit: 'EA', qty: 1, rate: 1000, cost: 1000, count: 1 },
  { disc: 'Architecture', cls: 'IfcDoorType', storey: 'L1', unit: 'EA', qty: 2, rate: 500, cost: 1000, count: 2 },
  { disc: 'Unknown', cls: 'IfcActor', storey: 'L1', unit: 'EA', qty: 1, rate: 100, cost: 100, count: 1 }
];

(async function () {
  const SQL = await initSqlJs();
  const seedBytes = fs.readFileSync(path.join(__dirname, '..', '..', 'erp', 'ad_seed.db'));

  function phasesOf(db, building) {
    const projId = (db.exec("SELECT C_Project_ID FROM C_Project WHERE Value=?", [building])[0] || { values: [] }).values[0];
    if (!projId) return { names: [], tasks: [] };
    const pid = projId[0];
    const ph = db.exec("SELECT Name FROM C_ProjectPhase WHERE C_Project_ID=" + pid);
    const names = ph.length ? ph[0].values.map(r => r[0]) : [];
    const tk = db.exec("SELECT t.Name FROM C_ProjectTask t JOIN C_ProjectPhase p ON p.C_ProjectPhase_ID=t.C_ProjectPhase_ID WHERE p.C_Project_ID=" + pid);
    const tasks = tk.length ? tk[0].values.map(r => r[0]) : [];
    return { names, tasks, pid };
  }

  // ── WITH hierarchy — the actual P2 fix ──
  const edb1 = new SQL.Database(seedBytes);
  const opts1 = { seqRules: SEQUENCE_RULES, laborRates: {}, hierarchy: HIERARCHY, packCurrencyISO: 'MYR', now: '2026-08-05 00:00:00' };
  ProjFold.foldProjectOrder(edb1, 'ExactLookupP2Test', PRICED, opts1);
  const r1 = phasesOf(edb1, 'ExactLookupP2Test');
  console.log('§P2_WITH_HIERARCHY phases=' + r1.names.join(',') + ' tasks=' + r1.tasks.join(','));

  assert(r1.names.indexOf('MEP Rough-in') >= 0, 'G-K IfcTank (tier 2, via IfcFlowStorageDevice) resolves to phase "MEP Rough-in", not Unsequenced');
  assert(r1.tasks.indexOf('PLUMBER') >= 0, 'G-K IfcTank resolves resource PLUMBER (inherited), not GENERAL');
  assert(r1.names.indexOf('Architecture') >= 0, 'G-L IfcDoorType (tier 1 substring, no own key) resolves to phase "Architecture" via IfcDoor');
  assert(r1.tasks.indexOf('CARPENTER') >= 0, 'G-L IfcDoorType resolves resource CARPENTER (via IfcDoor), not GENERAL');
  assert(r1.names.indexOf('Unsequenced') >= 0, 'G-M IfcActor (genuine tier 3 — no own match, no classified ancestor) still lands in Unsequenced');

  // ── the dashboard contract this preserves: time_machine.js:4376 / poc_dashboard_variance.js:31
  // both filter `WHERE Name<>'Unsequenced'` — confirm that query still excludes exactly the right row
  // and nothing else, on the SAME data this witness just folded.
  const filtered = edb1.exec("SELECT Name FROM C_ProjectPhase WHERE C_Project_ID=" + r1.pid + " AND Name<>'Unsequenced'")[0].values.map(r => r[0]);
  assert(filtered.indexOf('Unsequenced') === -1 && filtered.indexOf('MEP Rough-in') >= 0 && filtered.indexOf('Architecture') >= 0,
    'G-N dashboard filter (Name<>\'Unsequenced\') still excludes the true-unclassified bucket, keeps the real phases');

  // ── WITHOUT hierarchy — existing callers (e.g. bake_gw_hospital_seed.js) that haven't been updated
  // to pass it yet must degrade to the IDENTICAL pre-fix outcome: IfcTank has no own/substring match
  // either, so with no hierarchy to walk it falls to tier 3 → 'Unsequenced', same as raw SR['IfcTank']
  // being undefined always did. Not a regression for any caller this session didn't touch.
  const edb2 = new SQL.Database(seedBytes);
  const opts2 = { seqRules: SEQUENCE_RULES, laborRates: {}, packCurrencyISO: 'MYR', now: '2026-08-05 00:00:00' }; // no hierarchy
  ProjFold.foldProjectOrder(edb2, 'ExactLookupP2NoHier', PRICED, opts2);
  const r2 = phasesOf(edb2, 'ExactLookupP2NoHier');
  console.log('§P2_NO_HIERARCHY phases=' + r2.names.join(','));
  assert(r2.names.indexOf('Unsequenced') >= 0, 'G-O without hierarchy, IfcTank still falls to Unsequenced (tier 2 simply never fires — degrade-safe)');
  assert(r2.names.indexOf('Architecture') >= 0, 'G-O without hierarchy, IfcDoorType STILL resolves via tier 1 substring (unaffected by hierarchy presence)');

  console.log('\n§EXACT_LOOKUP_P2_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

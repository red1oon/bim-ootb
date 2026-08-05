#!/usr/bin/env node
// witness_exact_lookup_p4_boqchart.js — CLASSIFICATION_EXACT_LOOKUP_BLINDSPOT.md §BUILD PLAN P4, the
// last two consumers: boq_charts.html:477 (generateSchedule, the no-authored-schedule FALLBACK
// generator) and :908 (buildScheduleFromOps, the kernel_ops live-mirror path). Both were confirmed by
// BOQ4D as intentionally-preserved fallback-only paths — lower priority than P2's live consumers, but
// the same raw SEQUENCE_RULES[cls] exact-key gap applies. Slices the LITERAL shipped blocks (via vm,
// not reimplemented), same discipline as every other witness in this lane.
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   generateSchedule (:477) — IfcTank/IfcDoorType used to silently fall to DEFAULT_RULE (Architecture,
//     generic) instead of their real tier 2/tier 1 classification, misgrouping the fallback chart's
//     phase|||storey buckets.
//   buildScheduleFromOps (:908) — same gap, but ALSO must preserve today's exact behavior for a
//     genuinely tier-3 class (skip — do not add a spurious discipline to g.disciplines), the same
//     distinction P2/P3/P4's schedule_read_4d.js fix all preserve elsewhere in this lane.
//
// Run: node witness_exact_lookup_p4_boqchart.js
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
const ScheduleRead4D = require(path.join(__dirname, '..', 'schedule_read_4d.js'));

const src = fs.readFileSync(path.join(__dirname, '..', 'boq_charts.html'), 'utf8');

// ── generateSchedule's classification loop (:477 area) ──
{
  const startMarker = '  // Group activities by phase -> storey';
  const endMarker = '\n  // Sort storeys per phase';
  const si = src.indexOf(startMarker);
  const ei = src.indexOf(endMarker, si);
  if (si < 0 || ei < 0) { console.log('  FAIL G-SLICE could not locate generateSchedule\'s classification loop'); process.exit(1); }
  const block = src.slice(si, ei);
  if (!/window\.ScheduleAuthor\.classify/.test(block)) { console.log('  FAIL G-SLICE generateSchedule slice missing classify() — marker drifted'); process.exit(1); }

  const activities = [
    { cls: 'IfcTank', storey: 'L1' },      // tier 2 -> MEP Rough-in
    { cls: 'IfcDoorType', storey: 'L1' },  // tier 1 substring -> Architecture
    { cls: 'IfcActor', storey: 'L1' }      // genuine tier 3 -> Architecture (SAME as DEFAULT_RULE always was — no distinction needed here)
  ];
  const sandbox = { window: { ScheduleAuthor: ScheduleAuthor, IFC_SCHEMA_HIERARCHY: HIERARCHY }, activities: activities, console: console };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nthis.__captured = { grouped: grouped, phaseSets: Object.keys(phaseSets) };', sandbox);
  const grouped = sandbox.__captured.grouped;
  console.log('§P4_GENERATESCHEDULE groups=' + Object.keys(grouped).join(' | '));
  assert(!!grouped['MEP Rough-in|||L1'] && grouped['MEP Rough-in|||L1'].some(a => a.cls === 'IfcTank'),
    'G-AF generateSchedule: IfcTank (tier 2) groups into MEP Rough-in|||L1, not the generic default bucket');
  assert(!!grouped['Architecture|||L1'] && grouped['Architecture|||L1'].some(a => a.cls === 'IfcDoorType'),
    'G-AG generateSchedule: IfcDoorType (tier 1 substring, via IfcDoor) groups into Architecture|||L1');
}

// ── buildScheduleFromOps's classification block (:908 area) ──
{
  const startMarker = '// §EXACT_LOOKUP_BLINDSPOT P4 — was a raw SEQUENCE_RULES[op.cls]';
  const endMarker = '\n  // Find project start from ops';
  const si = src.indexOf(startMarker);
  const ei = src.indexOf(endMarker, si);
  if (si < 0 || ei < 0) { console.log('  FAIL G-SLICE could not locate buildScheduleFromOps\'s classification block'); process.exit(1); }
  const block = src.slice(si, ei);
  if (!/window\.ScheduleAuthor\.classify/.test(block)) { console.log('  FAIL G-SLICE buildScheduleFromOps slice missing classify() — marker drifted'); process.exit(1); }

  // 3x IfcActor (genuine tier 3) outnumbers the 2 real-classified ops, same discriminating shape as
  // the schedule_read_4d.js witness: if tier 3 wrongly contributed a discipline, it would still show
  // up (Set, not count-weighted) — the decisive check is that ONLY MEP/ARC (from the 2 real classes)
  // appear, nothing extra, and specifically that a tier-3-only group carries NO disciplines at all.
  const ops = [
    { op_type: 'ELEMENT_PLACE', phase: 'MEP Rough-in', storey: 'L1', cls: 'IfcTank', start_ts: 0, end_ts: 1, guid: 'g1' },
    { op_type: 'ELEMENT_PLACE', phase: 'MEP Rough-in', storey: 'L1', cls: 'IfcDoorType', start_ts: 0, end_ts: 1, guid: 'g2' },
    { op_type: 'ELEMENT_PLACE', phase: 'Unsequenced', storey: 'L2', cls: 'IfcActor', start_ts: 0, end_ts: 1, guid: 'g3' }
  ];
  const sandbox = {
    window: { ScheduleAuthor: ScheduleAuthor, IFC_SCHEMA_HIERARCHY: HIERARCHY, ScheduleRead4D: ScheduleRead4D },
    ops: ops, console: console,
    phaseOrder: function () { return ['Substructure', 'Superstructure', 'Architecture', 'MEP Rough-in', 'MEP Final', 'Finishes']; }
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nthis.__captured = { groups: groups };', sandbox);
  const groups = sandbox.__captured.groups;
  const mepGroup = groups['MEP Rough-in|||L1'];
  const unclassifiedGroup = groups['Unsequenced|||L2'];
  console.log('§P4_BUILDSCHEDULEFROMOPS mepDisciplines=' + JSON.stringify([...(mepGroup ? mepGroup.disciplines : [])])
    + ' unclassifiedDisciplines=' + JSON.stringify([...(unclassifiedGroup ? unclassifiedGroup.disciplines : [])]));
  assert(!!mepGroup && mepGroup.disciplines.has('MEP'), 'G-AH buildScheduleFromOps: IfcTank (tier 2, via IfcFlowStorageDevice/PLUMBER) contributes MEP discipline — was silently absent before');
  assert(!!mepGroup && mepGroup.disciplines.has('ARC'), 'G-AI buildScheduleFromOps: IfcDoorType (tier 1 substring, via IfcDoor/CARPENTER) contributes ARC discipline — was silently absent before');
  assert(!!unclassifiedGroup && unclassifiedGroup.disciplines.size === 0, 'G-AJ buildScheduleFromOps: IfcActor (genuine tier 3) contributes NO discipline — stays excluded, same as today\'s undefined-lookup skip');
}

console.log('\n§EXACT_LOOKUP_P4_BOQCHART_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);

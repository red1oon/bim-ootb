#!/usr/bin/env node
// witness_exact_lookup_p4_scheduleread.js — CLASSIFICATION_EXACT_LOOKUP_BLINDSPOT.md §BUILD PLAN P4:
// schedule_read_4d.js's readTasks() had two raw `rules[cls]` exact-key lookups (resource/discipline
// tally per task, majority-phase fallback when a task's name doesn't parse to a known phase) —
// missing tier 1 substring matches and tier 2 schema-hierarchy inheritance, same gap class as P2/P3.
//
// THE ISSUE THIS PROVES OR DISPROVES: (a) IfcTank (tier 2) and IfcDoorType (tier 1 substring) used to
// contribute NOTHING to a task's resource/discipline tally or its majority-phase vote — now they do.
// (b) a genuinely tier-3 class must NOT start winning the majority-phase vote just because classify()
// gives it a real (if generic) phase — it must stay excluded, exactly like today's `!rule` skip, or a
// handful of truly-unclassified elements could hijack a task's phase away from its real majority.
//
// Drives the REAL readTasks() (required verbatim from schedule_read_4d.js) against a real sql.js db
// shaped exactly like the tables it queries.
//
// Run: node witness_exact_lookup_p4_scheduleread.js
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const ScheduleRead4D = require(path.join(__dirname, '..', 'schedule_read_4d.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

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

(async function () {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE schedules (schedule_id TEXT, name TEXT);
    CREATE TABLE tasks (task_id TEXT, schedule_id TEXT, name TEXT, schedule_start TEXT, schedule_finish TEXT,
      resource TEXT, total_float INT, is_critical INT, is_summary INT);
    CREATE TABLE task_elements (task_id TEXT, guid TEXT);
    CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, storey TEXT);
    CREATE TABLE task_sequences (predecessor_id TEXT, successor_id TEXT, sequence_type TEXT, lag_days INT);
  `);
  db.run("INSERT INTO schedules VALUES ('SCH1','Test Schedule')");
  // name has no ' — ' separator -> forces the majority-phase-of-elements fallback path (identify()),
  // exercising the SAME classifyCls() the resource/discipline tally uses.
  db.run("INSERT INTO tasks VALUES ('T1','SCH1','Misc Task','2026-01-01','2026-01-05',NULL,0,0,0)");
  // 3x IfcActor (genuine tier 3) deliberately outnumbers the 2 real-classified elements — if tier 3
  // were wrongly allowed into the majority vote with classify()'s generic 'Architecture' default, it
  // would WIN on count alone (3 > 1) and hijack the task's phase away from its real classification.
  const elements = [
    ['g1', 'IfcTank'], ['g2', 'IfcDoorType'],
    ['g3', 'IfcActor'], ['g4', 'IfcActor'], ['g5', 'IfcActor']
  ];
  elements.forEach(function (e) {
    db.run("INSERT INTO task_elements VALUES ('T1',?)", [e[0]]);
    db.run("INSERT INTO elements_meta VALUES (?,?,'L1')", [e[0], e[1]]);
  });

  const opts = { rules: SEQUENCE_RULES, defaultRule: SEQUENCE_DEFAULT, hierarchy: HIERARCHY, scheduleAuthor: ScheduleAuthor };
  const out = ScheduleRead4D.readTasks(db, opts);
  if (!out || !out.length) { console.log('  FAIL readTasks() returned nothing — cannot verify'); process.exit(1); }
  const t = out[0];
  console.log('§P4_SCHEDULEREAD phase=' + t.phase + ' resource=' + t.resource + ' discipline=' + t.discipline);

  assert(t.resource.split(',').indexOf('PLUMBER') >= 0, 'G-AC IfcTank (tier 2, via IfcFlowStorageDevice) now contributes PLUMBER to the resource tally — was silently absent before');
  assert(t.resource.split(',').indexOf('CARPENTER') >= 0, 'G-AD IfcDoorType (tier 1 substring, via IfcDoor) now contributes CARPENTER to the resource tally — was silently absent before');
  assert(t.phase === 'MEP Rough-in', 'G-AE genuine tier 3 (IfcActor x3) does NOT win the majority-phase vote despite outnumbering the real classes 3-to-1 — phase correctly stays MEP Rough-in (from IfcTank)');

  console.log('\n§EXACT_LOOKUP_P4_SCHEDULEREAD_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

#!/usr/bin/env node
// witness_materialize_default_exclusion.js — §CLASS_UNMATCHED_FALLBACK follow-up (2026-08-05,
// named in 4D_SCHEDULE_PERFECTION.md by bim-ootb PR #1186). materializeDefault's elements_meta read
// carried ZERO class exclusion while the materializeZones/_buildScheduleElements path already
// excluded IfcOpeningElement (ghost/position-only) and IfcSpace (spatial zone, not physical work).
// Proves the fix on the real fixture, not a synthetic one: Duplex_extracted.db carries 50 real
// IfcOpeningElement rows and 21 real IfcSpace rows.
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
const SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } }).then(function (SQL) {
  const dbPath = path.join(require('os').homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db');
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const rawCounts = db.exec("SELECT ifc_class, COUNT(*) FROM elements_meta WHERE ifc_class IN ('IfcOpeningElement','IfcSpace') GROUP BY ifc_class")[0].values;
  const openings = (rawCounts.find(function (r) { return r[0] === 'IfcOpeningElement'; }) || [null, 0])[1];
  const spaces = (rawCounts.find(function (r) { return r[0] === 'IfcSpace'; }) || [null, 0])[1];
  console.log('§FIXTURE Duplex IfcOpeningElement=' + openings + ' IfcSpace=' + spaces);
  assert(openings > 0 && spaces > 0, 'RED-CONTROL: fixture actually carries both excludable classes, or this test proves nothing');

  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SEQUENCE_RULES = rulesJson.SEQUENCE_RULES || rulesJson;
  const res = ScheduleAuthor.materializeDefault(db, SEQUENCE_RULES, { start: '2026-01-01', laborRates: {}, blank: false });
  assert(res && res.scheduleId && res.assignmentCount > 0, 'materializeDefault succeeds on the real fixture — assignmentCount=' + (res && res.assignmentCount));

  const assignedGuids = db.exec('SELECT guid FROM task_elements')[0].values.map(function (r) { return r[0]; });
  const assignedSet = {}; assignedGuids.forEach(function (g) { assignedSet[g] = true; });

  const badGuids = db.exec("SELECT guid FROM elements_meta WHERE ifc_class IN ('IfcOpeningElement','IfcSpace')")[0].values.map(function (r) { return r[0]; });
  const leaked = badGuids.filter(function (g) { return assignedSet[g]; });
  assert(leaked.length === 0, 'zero IfcOpeningElement/IfcSpace guids were assigned a task — leaked=' + leaked.length);

  const totalElems = db.exec('SELECT COUNT(*) FROM elements_meta')[0].values[0][0];
  const expectedEligible = totalElems - openings - spaces;
  assert(assignedGuids.length === expectedEligible,
    'assignment count matches elements_meta minus both excluded classes exactly — assigned=' + assignedGuids.length + ' expected=' + expectedEligible);

  db.close();
  console.log('\n§W-MATDEFAULT-EXCL SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
});

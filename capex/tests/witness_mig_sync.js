#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MIG-SYNC (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.19). READ THE LOG: verdict = §MIG_WITNESS_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "the twin cannot apply the legacy migration scripts of a release the way legacy's RUN_SyncDB does (pending by name, once, stop on error) — so a module shipped as a
//   migration script would not reach the twin, or would be applied twice". Then the end of the chain: the CAPEX goals the scripts ship appear in the twin's Performance gadget model
//   (overlay/dashboard_gadgets.js performance — what overlay/home.js draws) for a client-11 user, each with a value from goal_engine.
// Breaks (MUST FAIL): MIG_BREAK=1 (the registry is wiped between the two boots → the 2nd boot re-applies and fails on duplicate keys).
'use strict';
var fs = require('fs'), path = require('path'), C = require('../../erp/tests/dd_common.js');
var ROOT = path.join(__dirname, '..', '..'), MA = require('../tools/migration_apply.js'), GE = require(path.join(ROOT, 'erp/goal_engine.js')), DG = require(path.join(ROOT, 'erp/overlay/dashboard_gadgets.js'));
var MIGDIR = path.join(ROOT, 'capex/legacy/migration/iD13/postgresql');
var log = console.log, judged = 0, fails = 0, BREAK = process.env.MIG_BREAK === '1';
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §MIG_WITNESS ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info ? ' ' + JSON.stringify(info) : '')); }
(async function () {
  var H = await C.boot();
  var files = fs.readdirSync(MIGDIR).filter(function (f) { return /^\d{12}_.*\.sql$/.test(f); }).map(function (f) { return { name: f, text: fs.readFileSync(path.join(MIGDIR, f), 'utf8') }; });   // the release's scripts = the folder (SyncDB.sh :54)
  var O = function (fs_) { return { files: fs_, run: function (s, p) { H.db.run(s, p || []); }, q: H.q, convertSql: H.A.convertSql, now: H.TODAY + ' 09:00:00', log: log }; };
  var n = function (sql) { return Number(H.one(sql).n); };
  var before = { calc: n('SELECT COUNT(*) AS n FROM pa_measurecalc'), meas: n('SELECT COUNT(*) AS n FROM pa_measure'), goal: n('SELECT COUNT(*) AS n FROM pa_goal') };
  var r1 = MA.ensureAll(O(files));
  var after = { calc: n('SELECT COUNT(*) AS n FROM pa_measurecalc'), meas: n('SELECT COUNT(*) AS n FROM pa_measure'), goal: n('SELECT COUNT(*) AS n FROM pa_goal') };
  var reg = H.q("SELECT name, status, isapply, filename FROM ad_migrationscript ORDER BY name");
  log('§MIG_WITNESS rows before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after) + ' registered=' + JSON.stringify(reg.map(function (r) { return r.name + ':' + r.status; })));
  check('S1 first boot applies every pending script, in name order, none failing', r1.pending === files.length && r1.applied === files.length && !r1.stopped, r1);
  var want = { calc: 0, meas: 0, goal: 0 }; files.forEach(function (f) { MA.split(f.text).forEach(function (st) { var m = /^INSERT\s+INTO\s+(PA_MeasureCalc|PA_Measure|PA_Goal)\b/i.exec(st); if (m) want[{ pa_measurecalc: 'calc', pa_measure: 'meas', pa_goal: 'goal' }[m[1].toLowerCase()]]++; }); });   // expected = what the scripts insert
  check('S2 rows arrive = the scripts\' INSERTs (calcs +' + want.calc + ', measures +' + want.meas + ', goals +' + want.goal + ')', after.calc - before.calc === want.calc && after.meas - before.meas === want.meas && after.goal - before.goal === want.goal, { before: before, after: after, want: want });
  check('S3 each script registered once, Status CO, FileName postgresql/<name> (register_migration_script)', reg.length === files.length && reg.every(function (r) { return r.status === 'CO' && r.isapply === 'Y' && r.filename === 'postgresql/' + r.name; }), reg);
  var seq = H.one("SELECT currentnext AS c FROM ad_sequence WHERE lower(name)='pa_goal' AND istableid='Y'");
  if (seq) check('S4 update_sequences: PA_Goal CurrentNext = MAX(id)+1', Number(seq.c) === Number(H.one('SELECT MAX(pa_goal_id) AS m FROM pa_goal').m) + 1, seq);
  else log('  §MIG_WITNESS S4 NOT JUDGED — the twin holds no PA_Goal table-ID row in AD_Sequence (keys are allocated at commit), so update_sequences has nothing to move here');
  if (BREAK) H.db.run('DELETE FROM ad_migrationscript');
  var r2 = MA.ensureAll(O(files));
  check('S5 second boot: already in sync, nothing applied (no duplicate rows)', r2.pending === 0 && r2.applied === 0 && n('SELECT COUNT(*) AS n FROM pa_goal') === after.goal, r2);
  // stop-on-error (SyncDB.sh :79-84): a failing file stops the later ones
  H.begin('stop');
  var bad = [{ name: '209901010000_W-BAD.sql', text: "SELECT register_migration_script('209901010000_W-BAD.sql') FROM dual;\nINSERT INTO no_such_table VALUES (1);\n" },
    { name: '209901010001_W-AFTER.sql', text: "SELECT register_migration_script('209901010001_W-AFTER.sql') FROM dual;\n" }];
  var r3 = MA.ensureAll(O(bad)), after3 = n("SELECT COUNT(*) AS n FROM ad_migrationscript WHERE name='209901010001_W-AFTER.sql'");
  H.rollback('stop');
  check('S6 an erroring file stops the run; the next file is NOT applied', r3.stopped === '209901010000_W-BAD.sql' && r3.applied === 1 && after3 === 0, r3);
  // end of the chain: the goals reach the twin's Performance gadget for a client-11 user
  GE.install(H.db);
  var S = { client: 11, user: 101, role: 102, today: H.TODAY, access: GE.accessOf(H.q, 102, 11) };
  global.AdCallout = H.A;   // the page's converter, as window.AdCallout in idempiere.html (the G4 measures read SYSDATE, §5.20)
  var items = DG.performance(H.q, S, GE).filter(function (g) { return /^CAPEX /.test(g.name); });
  items.forEach(function (g) { log('  §MIG_WITNESS gadget ' + JSON.stringify(g.title) + ' colour=' + g.color + (g.error ? ' error=' + g.error : '')); });
  var errs = items.filter(function (g) { return g.error; });
  check('S7 every shipped CAPEX goal (' + want.goal + ') is in the Performance gadget model, in SeqNo order, none in error', items.length === want.goal && !errs.length && items[0].name === 'CAPEX Total Projects', { n: items.length, errors: errs.map(function (e) { return e.name + ': ' + e.error; }) });
  var spot = items.filter(function (g) { return g.name === 'CAPEX Total Projects'; })[0], cnt = n("SELECT COUNT(*) AS n FROM c_project WHERE ad_client_id=11");
  check('S8 a shown value is the twin\'s own data (Total Projects == COUNT(C_Project) of client 11)', spot && spot.actual === cnt, { shown: spot && spot.actual, count: cnt });
  var verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  log('§MIG_WITNESS_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (MIG_BREAK=1: FAIL expected)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { log('§MIG_WITNESS_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });

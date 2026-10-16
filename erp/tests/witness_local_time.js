#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-LOCAL-TIME (bim-compiler prompts/ERP_DEPTH_FILM.md §LOCAL-TIME). READ THE LOG: §LT lines; exit code is not evidence.
// THE ISSUE: legacy shows every stamp in the server's LOCAL time and #Date is the local day; the twin rendered op-log stamps in UTC and took
//   "today" from toISOString (the UTC date). At 02:30 local (+08:00) = 18:30Z the day before, does (A) a saved edit's Updated read
//   "2026-10-16 02:30:00" (not "2026-10-15 18:30:00"), (B) today = 2026-10-16 (not 2026-10-15), (C) every clock-"today" call site use the one
//   localDay, none left on toISOString? Runs under TZ=Asia/Kuala_Lumpur (set below, before any Date use).
// Run: node tests/witness_local_time.js   (cwd = bim-ootb/erp)
'use strict';
process.env.TZ = 'Asia/Kuala_Lumpur';
var fs = require('fs'), path = require('path'), ERP = path.join(__dirname, '..');
var pass = 0, fail = 0, ok = function (id, n, c, d) { console.log((c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c ? pass++ : fail++; };
(async function () {
  var initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')), SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  var mdb = new SQL.Database(); mdb.run("CREATE TABLE c_bpartner (c_bpartner_id INTEGER PRIMARY KEY, name TEXT, Updated TEXT, UpdatedBy INTEGER)"); globalThis.__idmpDb = mdb;
  var C = require(path.join(ERP, 'crud_core.js'));
  var T = Date.UTC(2026, 9, 15, 18, 30, 0);   // 2026-10-15 18:30Z = 2026-10-16 02:30 at +08:00
  var side = new SQL.Database(); side.run('CREATE TABLE kernel_ops (id INTEGER PRIMARY KEY, op_type TEXT, parameters TEXT, timestamp INTEGER, undone INTEGER DEFAULT 0, op_uuid TEXT, branch_id TEXT)');   // the op-log columns listTip reads
  side.run('INSERT INTO kernel_ops (op_type, parameters, timestamp, undone) VALUES (?,?,?,0)', ['CRUD_UPDATE', JSON.stringify({ table: 'c_bpartner', id: 7, actor: 101, changes: { name: { old: 'A', new: 'B' } } }), T]);
  var base = [{ c_bpartner_id: 7, name: 'A', Updated: '2022-03-02 22:17:17', UpdatedBy: 100 }];
  var row = (C.listTip(side, 'c_bpartner', 'c_bpartner_id', base, null).rows || [])[0] || {};
  console.log('§LT-FOLD ' + JSON.stringify(row));
  ok('A', 'a saved edit at 02:30 local stamps Updated = the LOCAL wall clock (and into the seed row\'s own Updated key)', row.Updated === '2026-10-16 02:30:00' && row.UpdatedBy === 101 && !('updated' in row), JSON.stringify({ Updated: row.Updated, updated: row.updated }));
  var day = typeof C.localDay === 'function' ? C.localDay(T) : '(no localDay)';
  console.log('§LT-DAY localDay=' + day + ' utcDay=' + new Date(T).toISOString().slice(0, 10) + ' fmt=' + C.fmtKernelTs(T));
  ok('B', 'today at 02:30 local = 2026-10-16 (legacy #Date), not the UTC date 2026-10-15', day === '2026-10-16' && C.fmtKernelTs(T) === '2026-10-16 02:30:00', day);
  var sites = [['idempiere.html', /put\('date', ([^)]*\))/], ['idempiere.html', /ln === 'date'\) return ([^;]*);/], ['idempiere.html', /today: (CrudCore[^}]*?|\(new Date[^}]*?) \}/], ['idempiere.html', /today: (CrudCore\.localDay\(\)|\(function \(\) \{ var d = new Date\(\)[^,]*)\,/], ['crud_overlay.js', /function today\(\) \{ try \{ return ([^;]*);/],
    ['ad_process.js', /var today = ctx\.today \|\| ([^;]*);/], ['pos_lens.js', /var today = ([^;]*localDay\(\)|new Date\(\)\.toISOString\(\)\.slice\(0, 10\));/]];
  var got = sites.map(function (s) { var m = s[1].exec(fs.readFileSync(path.join(ERP, s[0]), 'utf8')); return s[0] + ': ' + (m ? m[1] : 'NOT FOUND'); });
  console.log('§LT-SITES ' + JSON.stringify(got));
  ok('C', 'every clock-"today" call site uses the one localDay (none on toISOString)', got.every(function (g) { return /localDay\(\)/.test(g) && !/toISOString/.test(g); }), got.filter(function (g) { return !/localDay\(\)/.test(g); }).join(' | '));
  console.log('§LT-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log('§LT-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });

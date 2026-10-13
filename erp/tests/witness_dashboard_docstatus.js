#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DASH-DOCSTATUS (bim-compiler prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY D3, the "Activities" gadget = docstatus.zul -> DPDocumentStatus). READ THE LOG: §DDS lines.
// THE ISSUE it proves/disproves: the legacy Home's document-status indicators (PA_DocumentStatus: Notice, Request, Workflow Activities, Unprocessed Documents, Sales Orders received today, Pending Customer
//   Shipments) show the SAME COUNTS and the SAME visible set for a user/role: MDocumentStatus.getDocumentStatusIndicators (active, client 0/own, ORDER BY SeqNo, canAccess via PA_DocumentStatusAccess,
//   window access else form access) + evaluate (COUNT(*) FROM <table> WHERE <table>.AD_Client_ID=? [project][org] AND (<WhereClause with @#AD_Client_ID@ / @#AD_User_ID@ / @#AD_Role_ID@, SysDate>) + the role's client/org where).
//   The twin builds that SQL from the dictionary; rv_unprocessed is supplied as a SQLite view over the base tables it has. Oracle = scripts/bridge/docstatus_legacy.js (3 user/role cases on the legacy pilot,
//   the pilot's own rows in a scratch db). Neg-controls: another user's notices do not count; the same query without the role org filter counts more; an inactive indicator disappears.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..'), DS = null;
try { DS = require(path.join(ERP, 'dashboard_docstatus.js')); } catch (e) { DS = null; }
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var ORA = process.env.DST_ORACLE || '/home/red1/bim-compiler/scripts/bridge/out/docstatus_legacy.json', log = console.log, fails = 0, judged = 0;
function check(name, ok, info) { judged++; if (!ok) fails++; log('  §DDS-CHECK ' + name + ' ' + (ok ? 'OK' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  if (!fs.existsSync(ORA)) { log('§DDS-VERDICT INCONCLUSIVE oracle missing'); process.exit(3); }
  if (!DS) { check('DDS0 dashboard_docstatus.js exists', false, 'missing'); log('§DDS-VERDICT FAIL judged=' + judged + ' failed=' + fails); process.exit(1); }
  var O = JSON.parse(fs.readFileSync(ORA, 'utf8')), SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  var seed = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { seed.run(st); } catch (e) {} });
  var db = new SQL.Database();
  ['pa_documentstatus', 'pa_documentstatusaccess', 'ad_table'].forEach(function (t) {
    var r = seed.exec('SELECT * FROM ' + t)[0]; if (!r) return; db.run('CREATE TABLE ' + t + ' (' + r.columns.join(',') + ')');
    var ins = db.prepare('INSERT INTO ' + t + ' VALUES (' + r.columns.map(function () { return '?'; }).join(',') + ')'); r.values.forEach(function (v) { ins.run(v); }); ins.free();
  });
  Object.keys(O.tables).forEach(function (t) {
    var spec = O.tables[t]; db.run('CREATE TABLE ' + t + ' (' + spec.cols.join(',') + ')');
    var ins = db.prepare('INSERT INTO ' + t + ' VALUES (' + spec.cols.map(function () { return '?'; }).join(',') + ')');
    spec.rows.forEach(function (r) { ins.run(spec.cols.map(function (c) { var v = r[c]; return v !== null && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; })); }); ins.free();
  });
  var q = function (sql, p) { var s = db.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; };
  var inst = DS.install(db, q); log('§DDS rv_unprocessed branches=' + inst.included.length + ' omitted(table absent)=' + JSON.stringify(inst.omitted));
  var bad = [];
  O.cases.forEach(function (c) {
    var r = DS.indicators(q, { client: c.client, user: c.user, role: c.role, now: O.now, access: { clientIds: c.client === 0 ? [0] : [0, c.client], orgIds: c.orgs } });
    var got = r.map(function (i) { return i.name + '=' + i.count; }), want = c.indicators.filter(function (i) { return i.shown; }).map(function (i) { return i.name + '=' + i.count; });
    var ok = JSON.stringify(got) === JSON.stringify(want); log('  §DDS-CASE ' + c.name + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + got.join(' | ') + (ok ? '' : '  WANT ' + want.join(' | '))); if (!ok) bad.push(c.name);
  });
  check('DDS1 visible set, order and COUNT of every indicator == the legacy pilot for ' + O.cases.length + ' user/role cases', bad.length === 0, bad);
  var distinct = {}; O.cases[0].indicators.forEach(function (i) { if (i.shown) distinct[i.count] = 1; });
  check('DDS2 discriminating: the GardenAdmin counts are not all equal (211 unprocessed, 76 shipments, 3 orders, 1 request)', Object.keys(distinct).length >= 4, distinct);
  var ctx0 = { client: 11, user: 101, role: 102, now: O.now, access: { clientIds: [0, 11], orgIds: O.cases[0].orgs } };
  var base = DS.indicators(q, ctx0), u2 = DS.indicators(q, { client: 11, user: 102, role: 102, now: O.now, access: ctx0.access });
  check('DDS3 NEG: another user (102) under the same role sees a different Unprocessed Documents count (CreatedBy filter)', base.filter(function (i) { return /Unprocessed/.test(i.name); })[0].count !== u2.filter(function (i) { return /Unprocessed/.test(i.name); })[0].count, null);
  var wide = DS.indicators(q, { client: 11, user: 101, role: 102, now: O.now, access: { clientIds: [0, 11], orgIds: [0] } });
  check('DDS4 NEG: restricting the role to org 0 only changes at least one count (org filter applied)', JSON.stringify(wide.map(function (i) { return i.count; })) !== JSON.stringify(base.map(function (i) { return i.count; })), wide.map(function (i) { return i.count; }));
  db.run("UPDATE pa_documentstatus SET isactive='N' WHERE pa_documentstatus_id=200005"); var off = DS.indicators(q, ctx0);
  check('DDS5 NEG: an inactive indicator disappears (Unprocessed Documents)', off.length === base.length - 1 && off.every(function (i) { return !/Unprocessed/.test(i.name); }), off.map(function (i) { return i.name; }));
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§DDS-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { log('§DDS-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });

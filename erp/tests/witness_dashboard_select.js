#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DASH-SELECT (bim-compiler prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY D2a). READ THE LOG: §DS lines; the exit code is not the evidence.
// THE ISSUE it proves/disproves: which gadgets the legacy Home shows a user/role, and where (MDashboardContentAccess.get: dashboards not configured in PA_DashboardContent_Access that are IsShowInLogin,
//   plus those granted by an active access row for this role/user, minus those an INACTIVE access row removes; then DashboardController: main vs side panel by IsShowInDashboard, active only, ORDER BY
//   ColumnNo, Line). Oracle = scripts/bridge/dashboard_select_legacy.js on the legacy pilot for 3 user/role cases. Every selected gadget must get a KIND from the dictionary (zul file / html / chart / goal /
//   window / process / statusline); an unclassifiable gadget is a FAIL, never silently dropped. Neg-controls: dropping the Donate access row removes Donate for role 102; an inactive access row removes a gadget.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..'), DH = null;
try { DH = require(path.join(ERP, 'dashboard_home.js')); } catch (e) { DH = null; }
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var ORA = process.env.DS_ORACLE || '/home/red1/bim-compiler/scripts/bridge/out/dashboard_select_legacy.json', log = console.log, fails = 0, judged = 0;
function check(name, ok, info) { judged++; if (!ok) fails++; log('  §DS-CHECK ' + name + ' ' + (ok ? 'OK' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  if (!fs.existsSync(ORA)) { log('§DS-VERDICT INCONCLUSIVE oracle missing: ' + ORA); process.exit(3); }
  if (!DH) { check('DS0 dashboard_home.js exists', false, 'missing'); log('§DS-VERDICT FAIL judged=' + judged + ' failed=' + fails); process.exit(1); }
  var O = JSON.parse(fs.readFileSync(ORA, 'utf8')), SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} });
  var mkq = function (d) { return function (sql, p) { var s = d.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; }; }, q = mkq(db);
  var bad = [];
  O.cases.forEach(function (c) {
    var r = DH.select(q, { client: c.client, role: c.role, user: c.user }), sel = (r.selected || []).slice().sort(function (a, b) { return a - b; }), want = c.selected.slice().sort(function (a, b) { return a - b; });
    var m = (r.main || []).map(function (g) { return g.id; }), s2 = (r.side || []).map(function (g) { return g.id; });
    var ok = JSON.stringify(sel) === JSON.stringify(want) && JSON.stringify(m) === JSON.stringify(c.main) && JSON.stringify(s2) === JSON.stringify(c.side);
    log('  §DS-CASE ' + c.name + ' ' + (ok ? 'OK' : 'FAIL') + ' selected=' + sel.length + ' main=[' + m + '] side=[' + s2 + ']' + (ok ? '' : ' want main=[' + c.main + '] side=[' + c.side + ']'));
    if (!ok) bad.push(c.name);
  });
  check('DS1 selection + main/side + column/line order == the legacy pilot for ' + O.cases.length + ' user/role cases', bad.length === 0 && O.cases.length >= 3, bad);
  var gm = DH.select(q, { client: 11, role: 102, user: 101 }), kinds = gm.main.concat(gm.side).map(function (g) { return g.name + '=' + g.kind; });
  log('§DS kinds (GardenAdmin): ' + kinds.join(', '));
  check('DS2 every selected gadget is classified from the dictionary (no "unknown")', gm.main.concat(gm.side).every(function (g) { return g.kind && g.kind !== 'unknown'; }), kinds);
  check('DS3 layout: 5 columns, effective column clamp (DashboardController: effColumn = min(ColumnNo, noOfCols-1))', gm.cols === 5 && gm.main.every(function (g) { return g.effColumn === Math.min(g.col, gm.cols - 1); }), { cols: gm.cols });
  // negative controls on a COPY
  var db2 = new SQL.Database(db.export()), q2 = mkq(db2);
  db2.run('DELETE FROM pa_dashboardcontent_access WHERE pa_dashboardcontent_id=200005 AND ad_role_id=102');
  var nd = DH.select(q2, { client: 11, role: 102, user: 101 }); check('DS4 NEG: without its access row Donate (200005) disappears for role 102 and nothing else changes', nd.main.length === gm.main.length - 1 && nd.main.every(function (g) { return g.id !== 200005; }), nd.main.map(function (g) { return g.id; }));
  db2.run("INSERT INTO pa_dashboardcontent_access (pa_dashboardcontent_access_id, ad_client_id, ad_org_id, isactive, pa_dashboardcontent_id, ad_role_id) VALUES (9000001, 0, 0, 'N', 50002, 102)");
  var ni = DH.select(q2, { client: 11, role: 102, user: 101 }); check('DS5 NEG: an INACTIVE access row for Views (50002) removes it for role 102 (the "New part" of MDashboardContentAccess.get)', ni.main.every(function (g) { return g.id !== 50002; }), ni.main.map(function (g) { return g.id; }));
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§DS-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { log('§DS-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });

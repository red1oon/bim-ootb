// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-ERP-GOVERNED witness (bim-compiler RESUME_HBA_ERP_GOVERNED_DISPLAY.md Stage 2).
//   The CRUX proof of the whole thread's §CONVENTION: with the REAL Stage-1 seeded erp/ad_seed.db injected as
//   the compile layer's `erpQuery`, every displayed identity/id TRACES TO A QUERIED ROW instead of a JS
//   literal — and WITHOUT the db it falls back byte-identically to the literal (so the 33 existing witnesses
//   stay green). Each check NAMES the issue it proves (CLAUDE.md test mandate):
//     • G1 — the id=1 blind-mint determinism LANDMINE (§IMPLICATIONS pt2) is fixed: toWarehouseRow resolves the
//       DURABLE seeded M_Warehouse id (990000), not `1`.
//     • G2 — compileBuilding's whole warehouse+locator identity comes from the seeded rows when governed.
//     • G3 — payroll demoSpec's employee identities (c_bpartner_id) come from real HR_Employee⋈C_BPartner, and
//       the engine's payslip == the DB-summed HR_Movement (display already traces to the seeded rows).
//     • G4 — models.officialByName is GOVERNED for a real AD_User (EMP001) and honestly LITERAL for a name with
//       no real user (BP-TEN-1) — a DB-first-per-name join, never a blanket replace.
//     • G5 — §DESIGN-RESOURCE-AVAILABILITY: toResourceRow threads the REAL signed-replay availability onto
//       isavailable/percentutilization (no more hardcoded 'Y').
//     • G6 — FALLBACK: no erpQuery → every builder returns the prior literal (zero-regression guarantee).
//   Run: NODE_PATH=$HOME/bim-ootb/node_modules node hr_bim_asset/tests/witness_erp_governed.js
'use strict';
var fs = require('fs'), path = require('path');
var initSqlJs = require('sql.js');
var ADT = require('../ad_tenancy'), ADP = require('../ad_payroll'), M = require('../models'), OC = require('../occupancy');
var ROOT = path.join(__dirname, '..', '..');
var SEED = path.join(ROOT, 'erp', 'ad_seed.db');
var rooms = require('../fixtures/hhs_rooms.json').rooms;

var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-ERP-GOVERNED ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }
function fin() { var p = checks.filter(Boolean).length; console.log('§W-HBA-ERP-GOVERNED ' + (p === checks.length ? 'PASS' : 'FAIL') + ' ' + p + '/' + checks.length); process.exit(p === checks.length ? 0 : 1); }

initSqlJs().then(function (SQL) {
  if (!fs.existsSync(SEED)) { console.log('§W-HBA-ERP-GOVERNED FAIL — erp/ad_seed.db not found'); process.exit(1); }
  var db = new SQL.Database(fs.readFileSync(SEED));
  // the SYNC erpQuery seam — returns [{col:val,…}] row-objects, the exact shape the viewer's A.erpQuery hands
  // the compile modules. Never throws to the module (module guards its own try, but keep the seam honest).
  function erpQuery(sql, params) {
    var r = db.exec(sql, params || []); if (!r.length) return [];
    var cs = r[0].columns;
    return r[0].values.map(function (v) { var o = {}; cs.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }
  var HHS = 'HHS_Office_Federated';

  // ── G1 — warehouse id resolution (the determinism landmine) ───────────────────────────────────────────────
  var whMint = ADT.toWarehouseRow(HHS, function () { return 1; });                       // no db → mint
  var whGov = ADT.toWarehouseRow(HHS, function () { return 1; }, erpQuery);              // db  → resolve
  ok('G1-warehouse-resolve', whMint.m_warehouse_id === 1 && whGov.m_warehouse_id === 990000 && whGov.value === HHS,
     'toWarehouseRow: literal mints id=1, GOVERNED resolves the durable seeded id=990000 (Value=' + whGov.value + ')');

  // ── G2 — whole-building tenancy compile governed off the seeded warehouse+locators ────────────────────────
  var govBld = ADT.compileBuilding(HHS, rooms, M.records('Tenancy'), M.records('Strata'), { erpQuery: erpQuery });
  var seededLoc = {};
  erpQuery('SELECT M_Locator_ID AS id, Value AS value FROM M_Locator WHERE M_Warehouse_ID=990000').forEach(function (r) { seededLoc[r.value] = Number(r.id); });
  var locGoverned = govBld.locators.filter(function (l) { return seededLoc[l.value] === l.m_locator_id; }).length;
  ok('G2-building-governed', govBld.warehouse.m_warehouse_id === 990000 && locGoverned > 0
     && govBld.locators.every(function (l) { return l.m_warehouse_id === 990000; }),
     'compileBuilding: warehouse=990000, ' + locGoverned + '/' + govBld.locators.length + ' locators resolved to their real seeded M_Locator id');

  // ── G3 — payroll identities from real rows + engine==DB numbers ────────────────────────────────────────────
  var specLit = ADP.demoSpec();
  var specGov = ADP.demoSpec(erpQuery);
  var realEmp = erpQuery('SELECT Code AS code, C_BPartner_ID AS bp FROM HR_Employee ORDER BY HR_Employee_ID');
  var idsGov = specGov.employees.map(function (e) { return e.c_bpartner_id; }).sort();
  var idsReal = realEmp.map(function (e) { return Number(e.bp); }).sort();
  ok('G3a-payroll-identity', specGov._governed === true && !specLit._governed
     && JSON.stringify(idsGov) === JSON.stringify(idsReal) && idsReal.length === 2,
     'demoSpec(erpQuery) is _governed and its c_bpartner_ids ' + JSON.stringify(idsGov) + ' come from real HR_Employee rows');
  var run = ADP.runPeriod(specGov);
  var slip = ADP.payslip(run.hr_movement, 1001, 'en');
  var dbGross = Number(erpQuery("SELECT SUM(amount) AS g FROM HR_Movement WHERE c_bpartner_id=1001 AND accountsign='+'")[0].g);
  var dbNet = Number(erpQuery("SELECT ROUND(SUM(CASE WHEN accountsign='+' THEN amount ELSE -amount END),2) AS n FROM HR_Movement WHERE c_bpartner_id=1001")[0].n);
  ok('G3b-engine==db', slip.gross === dbGross && slip.net === dbNet,
     'governed run payslip (gross=' + slip.gross + ' net=' + slip.net + ') == DB-summed HR_Movement (gross=' + dbGross + ' net=' + dbNet + ')');

  // ── G4 — official DB-first-per-name join (governed real, literal gap) ─────────────────────────────────────
  var realUser = erpQuery('SELECT AD_User_ID AS id, EMail AS email, Phone AS phone, C_BPartner_ID AS bp FROM AD_User WHERE Name=?', ['EMP001'])[0];
  var offGov = M.officialByName('EMP001', erpQuery);
  var offLit = M.officialByName('EMP001');
  var offTen = M.officialByName('BP-TEN-1', erpQuery);   // no real AD_User seeded → honest literal fallback
  ok('G4a-official-governed', offGov && offGov._governed === true && offGov.email === realUser.email
     && offGov.phone === realUser.phone && offGov.c_bpartner_id === Number(realUser.bp) && !offLit._governed,
     'officialByName("EMP001") GOVERNED — email/phone/c_bpartner_id trace to the real AD_User row (literal is not _governed)');
  ok('G4b-official-literal-gap', offTen && !offTen._governed && offTen.c_bpartner_id == null,
     'officialByName("BP-TEN-1") honestly falls back to the literal (no real AD_User → the accepted 2-person tradeoff, never fabricated)');

  // ── G5 — occupancy availability threaded from the signed replay (§DESIGN-RESOURCE-AVAILABILITY) ────────────
  // build a tiny signed occupancy log: room[0] UNAVAIL over the period, room[1] vacant (no op).
  var g0 = rooms[0].guid, g1 = rooms[1].guid, period = '2026-03';
  var log = [];
  var u = OC.unavailable({ resource: g0, from: '2026-03', to: '2026-04', reason: 'renovation', ts: '2026-03-01T00:00:00Z' }, null, 'GENESIS');
  if (u.op) log.push(u.op);
  var resSpec = OC.compileResources([{ guid: g0, name: 'R0' }, { guid: g1, name: 'R1' }], { log: log, period: period, periods: [period] });
  var r0 = resSpec.resources[0].row, r1 = resSpec.resources[1].row;
  ok('G5-availability-real', r0.isavailable === 'N' && r1.isavailable === 'Y'
     && r0.percentutilization != null && r1.percentutilization != null,
     'toResourceRow: UNAVAIL room isavailable=N, vacant room isavailable=Y, both carry real percentutilization (' + r0.percentutilization + '/' + r1.percentutilization + ') — no hardcoded Y');
  // and no-log = legacy behaviour (master Y, no percentutilization)
  var legacy = OC.compileResources([{ guid: g0, name: 'R0' }]).resources[0].row;
  ok('G5b-availability-legacy', legacy.isavailable === 'Y' && legacy.percentutilization === undefined,
     'no occupancy log → legacy toResourceRow verbatim (isavailable=Y, no percentutilization) — zero regression');

  // ── G6 — FALLBACK: no erpQuery → literal identity everywhere ───────────────────────────────────────────────
  ok('G6-fallback-literal', ADT.toWarehouseRow(HHS, function () { return 1; }).m_warehouse_id === 1
     && ADP.demoSpec().employees[0].c_bpartner_id === 1001 && !ADP.demoSpec()._governed,
     'no db injected → toWarehouseRow mints 1, demoSpec is the literal (the zero-regression fallback the 33 witnesses rely on)');

  db.close();
  fin();
}).catch(function (e) { console.log('§W-HBA-ERP-GOVERNED FAIL — ' + e.message + '\n' + e.stack); process.exit(1); });

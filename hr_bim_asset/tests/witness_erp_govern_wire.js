// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-ERP-GOVERN-WIRE witness (bim-compiler RESUME_HBA_ERP_GOVERNED_DISPLAY.md Stage 2).
//   Proves the VIEWER wiring (viewer/hba_lens.js _regovern) — not just the compile modules — actually swaps the
//   literal specs for GOVERNED ones off the real erp/ad_seed.db. Drives the exact seam the browser drives:
//   self.Hba* engine globals + a mock APP (A) carrying the real HHS rooms + a real-db erpQuery, then calls the
//   exported _regovern hook. NAMES the issue: the real-user seeding path produces ERP-governed pane specs.
//     • WIRE0 — _buildingName EXTRACTS 'HHS_Office_Federated' from project_metadata (A.buildingName is unset in
//       the streaming path — the silent-miss landmine this guards).
//     • WIRE1 — A._hbaPayrollSpec is _governed, identities from real HR_Employee.
//     • WIRE2 — A._hbaTenancySpec.warehouse resolves to the durable seeded id 990000 (not the mint 1).
//     • WIRE3 — A._hbaAttendanceSpec compiles the signed sessions onto real C_Attendance rows (FKs real,
//       lossless rows+skipped == session count).
//   Run: NODE_PATH=$HOME/bim-ootb/node_modules node hr_bim_asset/tests/witness_erp_govern_wire.js
'use strict';
var fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
// ---- stand up the browser-side globals the way viewer/viewer.html <script> loading does ----
global.self = global; global.window = global;
self.HbaWatermark = require('../watermark');
self.HbaModels = require('../models');
self.HbaBinding = require('../binding');
self.HbaConnectors = require('../connectors');
self.HbaRules = require('../rules');
self.HbaOverlay = require('../overlay');
self.HbaLens = require('../lens');
self.HbaTimeline = require('../timeline');
self.HbaAttendance = require('../attendance');
self.HbaLeave = require('../leave');
self.HbaOccupancy = require('../occupancy');
self.HbaAdPayroll = require('../ad_payroll');
self.HbaAdTenancy = require('../ad_tenancy');
self.HbaAdAttendance = require('../ad_attendance');
self.HbaIot = require('../iot');
var HBALens = require('../../viewer/hba_lens');   // exports the API incl. the §STAGE2 witness hooks

var ROOT = path.join(__dirname, '..', '..');
var SEED = path.join(ROOT, 'erp', 'ad_seed.db');
var ROOMS_FX = require('../fixtures/hhs_rooms.json');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-GOVERN-WIRE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }
function fin() { var p = checks.filter(Boolean).length; console.log('§W-HBA-ERP-GOVERN-WIRE ' + (p === checks.length ? 'PASS' : 'FAIL') + ' ' + p + '/' + checks.length); process.exit(p === checks.length ? 0 : 1); }

initSqlJs().then(function (SQL) {
  var db = new SQL.Database(fs.readFileSync(SEED));
  function eq(sql, params) {
    var r = db.exec(sql, params || []); if (!r.length) return [];
    var cs = r[0].columns;
    return r[0].values.map(function (v) { var o = {}; cs.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }
  // mock APP — exactly the fields _regovern reads. dbQuery answers the building_name probe from the model DB
  // (here the real HHS project_metadata value); markDirty is a no-op.
  var rooms = ROOMS_FX.rooms.map(function (r) { return { guid: r.guid, name: r.name || r.guid, storey: r.storey || null }; });
  var attLog = self.HbaAttendance.demoSeed(rooms, '2026-06').log;
  var A = {
    _hbaRooms: rooms, _hbaAttendanceLog: attLog, _hbaPeriod: '2026-06',
    dbQuery: function (sql) { return /building_name/.test(sql) ? [['HHS_Office_Federated']] : []; },
    markDirty: function () {}
  };

  ok('WIRE0-extract-name', HBALens._buildingName(A) === 'HHS_Office_Federated' && A.buildingName === undefined,
     '_buildingName EXTRACTS "HHS_Office_Federated" from project_metadata even though A.buildingName is unset (streaming-path landmine guarded)');

  HBALens._regovern(A, eq);   // drive the real governance swap

  ok('WIRE1-payroll-governed', A._hbaPayrollSpec && A._hbaPayrollSpec._governed === true
     && A._hbaPayrollSpec.employees.map(function (e) { return e.c_bpartner_id; }).sort().join(',') === '1001,1002',
     'A._hbaPayrollSpec is _governed with c_bpartner_ids [1001,1002] from real HR_Employee');
  ok('WIRE2-tenancy-governed', A._hbaTenancySpec && A._hbaTenancySpec.warehouse.m_warehouse_id === 990000
     && A._hbaTenancySpec.warehouse.value === 'HHS_Office_Federated',
     'A._hbaTenancySpec.warehouse resolved to the durable seeded id 990000 (Value=HHS_Office_Federated), not a re-mint');
  var spec = A._hbaAttendanceSpec, sessCount = self.HbaAttendance.sessions(attLog, '2026-06').length;
  ok('WIRE3-attendance-governed', spec && spec.rows.length > 0
     && spec.rows.every(function (r) { return (r.C_BPartner_ID === 1001 || r.C_BPartner_ID === 1002) && r.M_Locator_ID != null && r.HR_Process_ID != null; })
     && (spec.rows.length + spec.skipped.length) === sessCount,
     'A._hbaAttendanceSpec: ' + spec.rows.length + '/' + sessCount + ' sessions → real C_Attendance rows (every FK real, none lost)');

  db.close();
  fin();
}).catch(function (e) { console.log('§W-HBA-ERP-GOVERN-WIRE FAIL — ' + e.message + '\n' + e.stack); process.exit(1); });

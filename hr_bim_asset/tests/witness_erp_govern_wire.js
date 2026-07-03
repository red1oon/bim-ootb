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
//     • WIRE3 — A._hbaAttendanceSpec compiles the signed sessions onto **REAL NATIVE S_ResourceAssignment**
//       rows (RESUME_HBA_ERP_STAGE3.md §PREREQUISITE retarget): every s_resource_id resolves to a seeded
//       S_Resource whose ad_user_id/m_warehouse_id are the real Stage-1 identities; lossless rows+skipped ==
//       session count; the zone rides the spatial view-trace (room-granularity call).
//     • WIRE3b — the C_Attendance INVENTION IS GONE from the shipped db: staged dictionary rows inactive,
//       no physical c_attendance table, lens 7600000 points at the REAL AD_Table (S_ResourceAssignment).
//     • WIRE3c — ad_attendance.readPresence round-trips the persisted rows through the native InfoWindow JOIN.
//     • WIRE5 — §STAGE3.1: openPresenceDrawer renders the GOVERNED rows (hours/IsConfirmed from the native
//       shape, honest-open, '· ERP-governed' title) and each row still carries its BIM zone for fly-to.
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
self.HbaAdBom = require('../ad_bom');
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
  // the REAL seeded person-resources — S_Resource.Value=code, ad_user_id=Stage-1 AD_User, m_warehouse_id=HHS.
  var realRes = {};
  eq("SELECT S_Resource_ID AS id, Value AS code, AD_User_ID AS uid, M_Warehouse_ID AS wh FROM S_Resource WHERE AD_User_ID IS NOT NULL").forEach(function (r) {
    realRes[Number(r.id)] = { code: r.code, uid: Number(r.uid), wh: Number(r.wh) };
  });
  ok('WIRE3-attendance-governed', spec && spec.rows.length > 0
     && spec.rows.every(function (r) { var rr = realRes[r.s_resource_id]; return rr && (rr.uid === 1 || rr.uid === 2) && rr.wh === 990000; })
     && (spec.rows.length + spec.skipped.length) === sessCount
     && spec.spatial.length === spec.rows.length && spec.spatial.every(function (sp) { return sp.zone != null; }),
     'A._hbaAttendanceSpec: ' + spec.rows.length + '/' + sessCount + ' sessions → NATIVE s_resourceassignment rows (every s_resource_id → real seeded S_Resource with ad_user_id 1/2 @ warehouse 990000, none lost, zone in spatial view-trace)');
  // WIRE3b — the invention is gone from the SHIPPED db (not just the compile path).
  var stagedActive = Number(eq("SELECT COUNT(*) AS n FROM AD_Table WHERE AD_Table_ID>=7000000 AND IsActive='Y'")[0].n);
  var physGone = eq("SELECT name FROM sqlite_master WHERE type='table' AND lower(name)='c_attendance'").length === 0;
  var lensTable = Number(eq('SELECT ad_table_id AS t FROM ad_infowindow WHERE ad_infowindow_id=7600000')[0].t);
  var raTable = Number(eq("SELECT AD_Table_ID AS t FROM AD_Table WHERE TableName='S_ResourceAssignment'")[0].t);
  ok('WIRE3b-invention-gone', stagedActive === 0 && physGone && lensTable === raTable && raTable < 7000000,
     'C_Attendance retired in erp/ad_seed.db: 0 active staged dictionary rows, physical table gone, lens 7600000 → REAL AD_Table ' + raTable + ' (S_ResourceAssignment)');
  // WIRE3c — the persisted rows read back through the native JOIN (the pane's lens-read path).
  var pres = self.HbaAdAttendance.readPresence(eq, { m_warehouse_id: 990000 });
  var openPres = pres.sessions.filter(function (s) { return s.checkout == null; });
  ok('WIRE3c-readpresence', pres.sessions.length > 0
     && pres.sessions.every(function (s) { return s.building === 'HHS_Office_Federated' && (s.who === 'EMP001' || s.who === 'EMP002'); })
     && openPres.length > 0 && openPres.every(function (s) { return s.hours == null && s.confirmed === 'N'; }),
     'readPresence: ' + pres.sessions.length + ' persisted sessions round-trip the native JOIN (who/building real, ' + openPres.length + ' honest-open with NULL hours + unconfirmed)');
  // WIRE4 — §BOM-ERP-CENTERED: _regovern reads the native BOM as a lens over the real seeded pp_product_bom.
  var bom = A._hbaBomSpec;
  ok('WIRE4-bom-lens', bom && bom.assemblies.length > 0
     && bom.assemblies.every(function (a) { return a.building === 'HHS_Office_Federated' && a.lines.length > 0; }),
     'A._hbaBomSpec: ' + (bom ? bom.assemblies.length : 0) + ' BIM assemblies read as a lens over real pp_product_bom (ERP is the authority, not Java m_bom)');

  // ---- WIRE5 — §STAGE3.1: the Presence drawer renders the GOVERNED rows (stub DOM, witness_p10a idiom) ----
  function domNode(tag) {
    return { tagName: tag, style: { cssText: '' }, children: [], textContent: '', title: '', id: '', innerHTML: '',
      appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
      removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
      remove: function () { if (this.parentNode) this.parentNode.removeChild(this); },
      setAttribute: function (k, v) { this['attr_' + k] = v; },
      addEventListener: function (ev, fn) { this['_on_' + ev] = fn; } };
  }
  var domBody = domNode('body');
  global.document = { createElement: function (t) { return domNode(t); }, body: domBody, documentElement: domNode('html'),
    getElementById: function (id) { function find(n) { if (n.id === id) return n; for (var i = 0; i < n.children.length; i++) { var r = find(n.children[i]); if (r) return r; } return null; } return find(domBody); } };
  var drawer = HBALens.openPresenceDrawer(A);
  var title = drawer.children[0].children[0].textContent;
  var rows = drawer.children.filter(function (c) { return c['attr_data-employee'] != null; });
  var openRows = rows.filter(function (r) { return /checked in/.test(r.innerHTML); });
  ok('WIRE5-drawer-governed', /ERP-governed/.test(title) && rows.length === spec.rows.length
     && rows.every(function (r) { return r['attr_data-zone'] != null; })
     && /·\s*[\d.]+h/.test(rows.map(function (r) { return r.innerHTML; }).join(''))
     && openRows.length === spec.rows.filter(function (r) { return r.assigndateto == null; }).length,
     'openPresenceDrawer renders the GOVERNED S_ResourceAssignment rows: title "' + title + '", ' + rows.length
     + ' rows == spec.rows, every row keeps its BIM zone for fly-to, real Qty hours shown, ' + openRows.length + ' honest-open');
  drawer.remove();

  db.close();
  fin();
}).catch(function (e) { console.log('§W-HBA-ERP-GOVERN-WIRE FAIL — ' + e.message + '\n' + e.stack); process.exit(1); });

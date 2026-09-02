// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-ERP-DEEPLINK witness (prompts/RESUME_HR_BIM_ASSET.md §P11, user 2026-07-02). Proves
//   the cross-app deep-link from HBA panes into the real iDempiere ERP UI: (1) every AD_Window_ID hba_lens.js
//   ships is the REAL id LOOKED UP from build/erp/ad_full.db (`SELECT AD_Window_ID,Name FROM AD_Window`), not
//   guessed — this witness holds an INDEPENDENTLY-typed copy of those numbers, sourced the same way, so it
//   can't grade its own homework; (2) erpLink() builds the SAME URL shape navigate_find.js's proven
//   `_surfaceExistingOrder` deep-link already uses; (3) the new occupancy.js S_Resource compile is a
//   NON-INVENT GATE (keys ⊆ real s_resource/s_resourcetype columns, independently sourced PRAGMA table_info);
//   (4) ad_payroll.js's payslip() reader now surfaces the REAL hr_movement_id per line (the PK the Payslip
//   pane's deep-link needs) matching the actual emitted movement, not a re-numbered view id.
//   Run: node hr_bim_asset/tests/witness_erp_deeplink.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-ERP-DEEPLINK ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var fs = require('fs'), path = require('path');
global.self = global;
self.HbaWatermark  = require('../watermark');
self.HbaModels     = require('../models');
self.HbaBinding    = require('../binding');
self.HrConnectors  = require('../connectors');
self.HbaOverlay    = require('../overlay');
self.HbaLens       = require('../lens');
self.HbaTimeline   = require('../timeline');
self.HbaAttendance = require('../attendance');
var Oc = require('../occupancy'); self.HbaOccupancy = Oc;
self.HbaRequest    = require('../request');
self.HbaDashboard  = require('../dashboard');
var AD = require('../ad_payroll'); self.HbaAdPayroll = AD;
var ADT = require('../ad_tenancy'); self.HbaAdTenancy = ADT;
var IoT = require('../iot'); self.HbaIot = IoT;
var Lv = require('../leave'); self.HbaLeave = Lv;
var HBALens = require('../../viewer/hba_lens');

ok('L0-load', HBALens && typeof HBALens.erpLink === 'function' && HBALens.AD_WINDOWS,
  'hba_lens.js exports erpLink() + AD_WINDOWS');

// ---- L1: NON-INVENT GATE on the window ids — independently sourced, same values ---------------------------
// ground truth: sqlite3 build/erp/ad_full.db "SELECT AD_Window_ID,Name FROM AD_Window WHERE ..."
var REAL_WINDOWS = {
  RESOURCE: 236,           // "Resource" — table S_Resource
  PAYROLL_MOVEMENT: 53042, // "Payroll Movement" — table HR_Movement
  SUBSCRIPTION: 316,       // "Subscription" — table C_Subscription
  ORDER: 143,              // "Sales Order" — table C_Order (issotrx='Y', matches iot.js's compiled order)
  PAYROLL_CONCEPT: 53036,  // "Payroll Concept Catalog" — table HR_Concept
  BOM: 53006               // "Bill of Materials and Formula" — table PP_Product_BOM (§STAGE3 BOM pane)
};
Object.keys(REAL_WINDOWS).forEach(function (k) {
  ok('L1-window-' + k, HBALens.AD_WINDOWS[k] === REAL_WINDOWS[k],
    'AD_WINDOWS.' + k + ' = ' + HBALens.AD_WINDOWS[k] + ' matches the independently-sourced AD_Window_ID ' + REAL_WINDOWS[k]);
});

// ---- L2: erpLink() builds the SAME URL shape as navigate_find.js's proven _surfaceExistingOrder link --------
var url = HBALens.erpLink(236, 12345);
ok('L2-url-shape', url === '../erp/idempiere.html?client=garden&window=236&record=12345',
  'erpLink(236,12345) = "' + url + '" — same client=garden + window/record query shape as the proven BIM→Project deep-link');
ok('L2-null-record', HBALens.erpLink(236, null) === null && HBALens.erpLink(null, 1) === null,
  'erpLink refuses to build a URL with a missing window or record — never a dangling/wrong link');

// ---- L3: occupancy.js S_Resource compile — NON-INVENT GATE (independently sourced columns) ------------------
var REAL_COLS = {
  s_resource: ['s_resource_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated',
    'updatedby', 'value', 'name', 'description', 's_resourcetype_id', 'm_warehouse_id', 'isavailable',
    'ad_user_id', 'chargeableqty', 'percentutilization', 'dailycapacity', 'ismanufacturingresource',
    'waitingtime', 'manufacturingresourcetype', 'queuingtime', 'planninghorizon', 's_resource_uu'],
  s_resourcetype: ['s_resourcetype_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby',
    'updated', 'updatedby', 'value', 'name', 'description', 'issingleassignment', 'c_uom_id',
    'allowuomfractions', 'timeslotstart', 'timeslotend', 'istimeslot', 'isdateslot', 'onsunday', 'onmonday',
    'ontuesday', 'onwednesday', 'onthursday', 'onfriday', 'onsaturday', 'm_product_category_id',
    'c_taxcategory_id', 'chargeableqty', 's_resourcetype_uu']
};
function keysSubset(row, table) { return Object.keys(row).every(function (k) { return REAL_COLS[table].indexOf(k) >= 0; }); }

var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'hhs_rooms.json'), 'utf8'));
var rooms = FX.rooms.slice(0, 3);
var spec = Oc.compileResources(rooms);
ok('L3-resourcetype-shape', keysSubset(spec.resourceType, 's_resourcetype'), 's_resourcetype row uses ONLY real AD_Column names');
ok('L3-resource-shapes', spec.resources.every(function (r) { return keysSubset(r.row, 's_resource'); }),
  'every s_resource row uses ONLY real AD_Column names');
ok('L3-one-per-room', spec.resources.length === rooms.length && spec.resources.every(function (r, i) { return r.guid === rooms[i].guid && r.row.value === rooms[i].guid; }),
  'ONE s_resource row per REAL room, value=the room guid — never a fabricated resource for a room not in the fixture');
ok('L3-sequential-ids', spec.resources.map(function (r) { return r.row.s_resource_id; }).join(',') === rooms.map(function (r, i) { return i + 1; }).join(','),
  's_resource_id is a sequential numeric PK (1..N) — a real deep-link record id, not the room guid text');
ok('L3-shared-type', spec.resources.every(function (r) { return r.row.s_resourcetype_id === spec.resourceType.s_resourcetype_id; }),
  'every room resource shares the ONE compiled "Room" S_ResourceType — a genuine new dictionary row (Consultant/Plants/Work Center don\'t fit), same on-demand precedent as C_UOM/M_Warehouse');

// ---- L4: payslip() reader surfaces the REAL hr_movement_id per line (what the Payslip deep-link uses) -------
var run = AD.runPeriod(AD.demoSpec());
var slip = AD.payslip(run.hr_movement, 1001, 'en');
var realIds = run.hr_movement.filter(function (m) { return m.c_bpartner_id === 1001; }).map(function (m) { return m.hr_movement_id; }).sort();
var slipIds = slip.lines.map(function (l) { return l.hr_movement_id; }).sort();
ok('L4-real-movement-ids', slip.lines.every(function (l) { return l.hr_movement_id != null; }) && JSON.stringify(slipIds) === JSON.stringify(realIds),
  'every payslip() line carries the REAL hr_movement_id of the movement it groups from — exactly the ids in run.hr_movement (' + realIds.join(',') + '), not re-numbered by the view');

// ---- L5: sanity — the other two deep-link sources (C_Subscription, C_Order/Line) already carry real PKs ------
var tenSpec = ADT.compileBuilding('HHS_Office_Federated', rooms, self.HbaModels.records('Tenancy'), self.HbaModels.records('Strata'));
ok('L5-subscription-pk', tenSpec.subscriptions.every(function (s) { return s.row.c_subscription_id != null; }),
  'ad_tenancy.compileBuilding subscriptions already carry a real c_subscription_id (§P10-BUILD, unchanged) — the Tenancy pane link source');
var series = IoT.demoSeries('TEST-ASSET', 24);
var billing = IoT.billingLines('TEST-ASSET', series.series, 'HHS_Office_Federated', '24h');
ok('L5-order-pk', billing.order.c_order_id != null && billing.lines.every(function (l) { return l.row.c_order_id === billing.order.c_order_id && l.row.c_orderline_id != null; }),
  'iot.billingLines already carries a real c_order_id/c_orderline_id (§P10b, unchanged) — the IoT billing pane link source');

// ---- L6: Leave has NO native AD table of its own — its deep-link target is the REAL "Leave without pay"
//   hr_concept identity it feeds, not a fabricated leave-record window (verified §CRITICAL P8 finding). -------
var log = Lv.demoLog('EMP001');
var mayEntries = Lv.classify(log, 'EMP001').filter(function (r) { return r.period === '2026-05' && r.unpaidDays > 0; });
ok('L6-unpaid-entry-exists', mayEntries.length === 2 && mayEntries[0].unpaidDays === 3 && mayEntries[1].unpaidDays === 1,
  'the demo log genuinely has unpaid entries in 2026-05 (the 5d annual take splits 2 paid/3 unpaid against a 2d balance, plus a 1d unpaid-type take) — the rows the Leave pane link gates on, not every row');
ok('L6-concept-id-real', AD.CONCEPTS.UNPAID_LEAVE.hr_concept_id === 5,
  'ad_payroll.CONCEPTS.UNPAID_LEAVE.hr_concept_id = 5 — the SAME real hr_concept row already compiled+witnessed by W-HBA-AD-PAYROLL, reused (not a new id minted for the link)');
var leaveLink = HBALens.erpLink(HBALens.AD_WINDOWS.PAYROLL_CONCEPT, AD.CONCEPTS.UNPAID_LEAVE.hr_concept_id);
ok('L6-link-shape', leaveLink === '../erp/idempiere.html?client=garden&window=53036&record=5',
  'Leave pane link = "' + leaveLink + '" — Payroll Concept Catalog window, record=the real UNPAID_LEAVE concept id');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-ERP-DEEPLINK ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);

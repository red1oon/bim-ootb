// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-AD-TENANCY witness (prompts/RESUME_HR_BIM_ASSET.md §CRITICAL "Compile not Model",
//   Tenancy re-scope, WMS-corrected 2026-07-02). Proves Building=M_Warehouse / Room=M_Locator(WMS bin-address,
//   NOT coordinates)+M_Product / Lease=C_Subscription, AND that Strata reuses the SAME C_Subscription shape
//   (no PM_Strata_Parcel needed) with a different party role + C_SubscriptionType.
//   Run: node hr_bim_asset/tests/witness_ad_tenancy.js
'use strict';
var AD = require('../ad_tenancy'), M = require('../models');
var rooms = require('../fixtures/hhs_rooms.json').rooms;
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-AD-TENANCY ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- ground truth, independently sourced (sqlite3 build/erp/ad_full.db "PRAGMA table_info(<table>);") --------
var REAL_COLS = {
  m_warehouse: ['m_warehouse_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated',
    'updatedby', 'value', 'name', 'description', 'c_location_id', 'separator', 'm_warehousesource_id',
    'replenishmentclass', 'isintransit', 'isdisallownegativeinv', 'm_warehouse_uu', 'm_reservelocator_id',
    'isdisableinventorypopup'],
  m_locator: ['m_locator_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated',
    'updatedby', 'value', 'm_warehouse_id', 'priorityno', 'isdefault', 'x', 'y', 'z', 'm_locator_uu', 'm_locatortype_id'],
  c_subscription: ['c_subscription_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby',
    'updated', 'updatedby', 'name', 'c_bpartner_id', 'm_product_id', 'c_subscriptiontype_id', 'startdate',
    'paiduntildate', 'isdue', 'renewaldate', 'c_subscription_uu'],
  // for the PM_Property↔M_Warehouse "manager" gap check (AD-TEN6) — sourced the SAME way as the tables above.
  ad_user: ['ad_user_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby',
    'name', 'description', 'password', 'email', 'supervisor_id', 'c_bpartner_id', 'processing', 'emailuser',
    'emailuserpw', 'c_bpartner_location_id', 'c_greeting_id', 'title', 'comments', 'phone', 'phone2', 'fax',
    'lastcontact', 'lastresult', 'birthday', 'ad_orgtrx_id', 'emailverify', 'emailverifydate', 'notificationtype',
    'isfullbpaccess', 'c_job_id', 'ldapuser', 'connectionprofile', 'value', 'userpin', 'isinpayroll', 'ad_user_uu',
    'ismenuautoexpand', 'salt', 'islocked', 'dateaccountlocked', 'failedlogincount', 'datepasswordchanged',
    'datelastlogin', 'isnopasswordreset', 'isexpired', 'securityquestion', 'answer', 'issaleslead', 'c_location_id',
    'leadsource', 'leadstatus', 'leadsourcedescription', 'leadstatusdescription', 'c_campaign_id', 'salesrep_id',
    'bpname', 'bp_location_id', 'isaddmailtextautomatically', 'r_defaultmailtext_id', 'ad_image_id', 'isnoexpire',
    'issupportuser', 'isbillto', 'isshipto', 'isvendorlead', 'authenticationtype', 'passwordhashalgorithm', 'saltalgorithm'],
  ad_user_orgaccess: ['ad_user_id', 'ad_org_id', 'ad_client_id', 'isactive', 'created', 'createdby', 'updated',
    'updatedby', 'isreadonly', 'ad_user_orgaccess_uu']
};
function keysSubset(row, table) { return Object.keys(row).every(function (k) { return REAL_COLS[table].indexOf(k) >= 0; }); }

// ---- ground truth, independently sourced (sqlite3 build/erp/ad_full.db "SELECT columnname,name FROM ad_element
// WHERE columnname IN ('X','Y','Z');") — X="Aisle (X)", Y="Bin (Y)", Z="Level (Z)". Real WMS bin-address triple.
var AD_ELEMENT_LABEL = { x: 'Aisle (X)', y: 'Bin (Y)', z: 'Level (Z)' };

var seed = 0; function seedId() { return ++seed; }
var room1 = rooms[0]; // RM_Level_1_1, storey "Level 1", no block (single tower)
var wh = AD.toWarehouseRow('HHS_Office_Federated', seedId);
var loc = AD.toLocatorRow(room1, wh.m_warehouse_id, seedId);
var prod = AD.toProductRow(room1, loc.m_locator_id, seedId);
var lease = M.records('Tenancy')[0]; // L-0001, unit_guid RM_Level_1_1, tenant BP-TEN-1
var leaseRecord = { party: lease.tenant, unit_guid: lease.unit_guid, term_start: lease.term_start, term_end: lease.term_end, ref_no: lease.lease_no };
var sub = AD.toSubscriptionRow(leaseRecord, prod.m_product_id, AD.SUBSCRIPTION_TYPES.MONTHLY_RENT, seedId);

// ---- AD-TEN0: NON-INVENT GATE — every emitted row's keys ⊆ the REAL AD column set --------------------------
ok('AD-TEN0-warehouse-shape', keysSubset(wh, 'm_warehouse'), 'm_warehouse row uses ONLY real AD_Column names');
ok('AD-TEN0-locator-shape', keysSubset(loc, 'm_locator'), 'm_locator row uses ONLY real AD_Column names');
ok('AD-TEN0-subscription-shape', keysSubset(sub, 'c_subscription'), 'c_subscription row uses ONLY real AD_Column names');

// ---- AD-TEN1: WMS bin-ADDRESS, not coordinates — Level(Z)=real storey, Aisle(X)=block-when-real, Bin(Y)=unused --
ok('AD-TEN1-level-is-storey', loc.z === room1.storey && room1.storey === 'Level 1',
  'm_locator.z ("' + AD_ELEMENT_LABEL.z + '") = the REAL extracted storey ("' + room1.storey + '") — vertical axis maps to floor, not a fabricated coordinate');
ok('AD-TEN1-native-empty-address', loc.x === '0' && loc.y === '0' && loc.isdefault === 'N',
  '§P10-CHECK correction (sourced MLocator.java setXYZ("0","0","0") + every real GW locator row): unused aisle(x)/bin(y) = the NATIVE \'0\' empty-address default — never a guessed real address, never null-drift from what the native engine writes; isdefault=N (a room locator is never the warehouse default)');
ok('AD-TEN1-not-cartesian', !('center' in loc) && typeof loc.z === 'string',
  'no Cartesian x/y/z centroid leaks into this row — real geometry stays authoritative on the BIM/viewer side, joined only by guid (m_locator.value)');

// ---- AD-TEN2: Product→Locator→Warehouse chain wired correctly -----------------------------------------------
ok('AD-TEN2-chain', prod.m_locator_id === loc.m_locator_id && loc.m_warehouse_id === wh.m_warehouse_id,
  'm_product.m_locator_id → m_locator.m_warehouse_id → the same m_warehouse row (the native chain, zero new tables)');

// ---- AD-TEN3: the lease is a self-contained subscription — no c_order_id/c_invoice_id needed to build it ----
ok('AD-TEN3-self-contained', sub.c_bpartner_id === lease.tenant && sub.m_product_id === prod.m_product_id &&
  sub.startdate === lease.term_start && sub.renewaldate === lease.term_end && !('c_order_id' in sub) && !('c_invoice_id' in sub),
  'c_subscription carries tenant+unit+term directly — no C_Order/C_Invoice FK required to exist first (unlike c_recurring)');

// ---- AD-TEN4: honest gap — paiduntildate is NEVER fabricated (needs a real C_Invoice/C_Payment, not built here) ---
ok('AD-TEN4-no-fabricated-paydate', sub.paiduntildate === null,
  'paiduntildate is honestly null — advancing it needs a real C_Invoice/C_Payment (the isolated Order-engine dependency), never guessed');

// ---- AD-TEN5: Strata reuses the IDENTICAL C_Subscription shape — NO PM_Strata_Parcel table -------------------
var strata = M.records('Strata')[0]; // A-12-03, unit_guid RM_Level_1_2, owner BP-OWN-1
var strataProd = AD.toProductRow(rooms[1], 99, seedId); // RM_Level_1_2's own locator (id 99 stand-in)
var strataRecord = { party: strata.owner, unit_guid: strata.unit_guid, term_start: '2026-01', term_end: '2026-12', ref_no: strata.parcel };
var strataSub = AD.toSubscriptionRow(strataRecord, strataProd.m_product_id, AD.SUBSCRIPTION_TYPES.QUARTERLY_STRATA_FEE, seedId);
ok('AD-TEN5-strata-same-shape', keysSubset(strataSub, 'c_subscription') && Object.keys(strataSub).length === Object.keys(sub).length,
  'Strata (owner charge) uses the EXACT SAME c_subscription shape as Tenancy — same function, same table, no new AD entity');
ok('AD-TEN5-strata-different-role-and-type', strataSub.c_bpartner_id === strata.owner && strataSub.c_bpartner_id !== lease.tenant &&
  strataSub.c_subscriptiontype_id === AD.SUBSCRIPTION_TYPES.QUARTERLY_STRATA_FEE.c_subscriptiontype_id &&
  strataSub.c_subscriptiontype_id !== sub.c_subscriptiontype_id,
  'the ONLY differences are the party role (owner vs tenant) and the C_SubscriptionType (quarterly strata fee vs monthly rent) — confirmed distinct real subscription-type rows');
ok('AD-TEN5-subscriptiontype-shapes', AD.SUBSCRIPTION_TYPES.QUARTERLY_STRATA_FEE.frequency === 3 && AD.SUBSCRIPTION_TYPES.MONTHLY_RENT.frequency === 1,
  'both subscription types are real, distinct native C_SubscriptionType rows (frequency 1 vs 3), not a hardcoded cadence string');

// ---- AD-TEN6: PM_Property↔M_Warehouse check (session backlog item) — `units` is DERIVED (never a stored
//   duplicate), `manager` is a GENUINE NATIVE GAP (no column anywhere), never fabricated onto the row ----------
var loc2 = AD.toLocatorRow(rooms[1], wh.m_warehouse_id, seedId);          // 2nd room, SAME warehouse
var locOther = AD.toLocatorRow(rooms[2], 999, seedId);                    // a room in a DIFFERENT warehouse
ok('AD-TEN6-units-derived', AD.propertyUnits(wh.m_warehouse_id, [loc, loc2, locOther]) === 2,
  'propertyUnits COUNTS the real m_locator rows for this warehouse (2 of 3) — never a stored/guessed number');
ok('AD-TEN6-manager-no-column', REAL_COLS.m_warehouse.indexOf('manager') === -1 && REAL_COLS.m_warehouse.every(function (c) { return c.indexOf('manager') === -1; }),
  'm_warehouse has NO manager-shaped column (independently sourced) — PropertyManagement.manager cannot compile onto the Warehouse row itself');
ok('AD-TEN6-manager-chain-real', REAL_COLS.ad_user.indexOf('c_bpartner_id') >= 0 && REAL_COLS.ad_user_orgaccess.indexOf('ad_user_id') >= 0 &&
  REAL_COLS.ad_user_orgaccess.indexOf('ad_org_id') >= 0 && REAL_COLS.m_warehouse.indexOf('ad_org_id') >= 0,
  'the nearest native mechanism DOES exist (ad_user.c_bpartner_id -> ad_user_orgaccess(ad_user_id,ad_org_id) -> m_warehouse.ad_org_id) — an access-control chain, not a business "manager" fact; flagged, not built (no live engine needs it)');

// ---- AD-TEN7: `_governed` — an honest, explicit signal that warehouse.m_warehouse_id is the REAL persisted
//   id (a DB hit) vs. this session's throwaway local mint (always the literal 1) — the Find-panel "zoom to
//   iDempiere" review (2026-07-04) caught a live bug: without this flag, a deep-link could be built off a
//   session-local id that matches nothing in the real dictionary, depending on load timing. Kept OFF the
//   `warehouse` row itself (would fail the AD-TEN0 non-invent gate) — a sibling flag, same idiom as
//   ad_payroll.js's demoSpec()._governed.
var specNoErp = AD.compileBuilding('HHS_Office_Federated', rooms, [], []);
ok('AD-TEN7-ungoverned-honest', specNoErp._governed === false && specNoErp.warehouse.m_warehouse_id === 1,
  'no erpQuery → _governed=false, warehouse id is the literal session-local mint (1) — never mistaken for a real persisted id');
function stubQuery(sql, params) {
  if (/FROM M_Warehouse/.test(sql) && params[0] === 'HHS_Office_Federated') return [{ id: 990000, value: 'HHS_Office_Federated', name: 'HHS_Office_Federated' }];
  return [];
}
var specGoverned = AD.compileBuilding('HHS_Office_Federated', rooms, [], [], { erpQuery: stubQuery });
ok('AD-TEN7-governed-real-id', specGoverned._governed === true && specGoverned.warehouse.m_warehouse_id === 990000,
  'erpQuery hits a real seeded row → _governed=true, warehouse id is the REAL persisted id (990000), not a re-mint');
ok('AD-TEN7-warehouse-row-still-column-pure', keysSubset(specGoverned.warehouse, 'm_warehouse') && keysSubset(specNoErp.warehouse, 'm_warehouse'),
  '_governed lives OUTSIDE the warehouse row — the row itself stays column-pure in both the governed and ungoverned case (AD-TEN0 gate unaffected)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-AD-TENANCY ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);

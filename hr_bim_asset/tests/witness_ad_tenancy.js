// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-AD-TENANCY witness (prompts/RESUME_HR_BIM_ASSET.md §CRITICAL "Compile not Model",
//   Tenancy re-scope). Proves the Building=M_Warehouse / Room=M_Locator+M_Product / Lease=C_Subscription
//   model compiles onto REAL AD_Column names, with REAL fixture-extracted geometry, not fabricated.
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
    'paiduntildate', 'isdue', 'renewaldate', 'c_subscription_uu']
};
function keysSubset(row, table) { return Object.keys(row).every(function (k) { return REAL_COLS[table].indexOf(k) >= 0; }); }

var seed = 0; function seedId() { return ++seed; }
var room1 = rooms[0]; // RM_Level_1_1
var wh = AD.toWarehouseRow('HHS_Office_Federated', seedId);
var loc = AD.toLocatorRow(room1, wh.m_warehouse_id, seedId);
var prod = AD.toProductRow(room1, loc.m_locator_id, seedId);
var lease = M.records('Tenancy')[0]; // L-0001, unit_guid RM_Level_1_1
var sub = AD.toSubscriptionRow(lease, prod.m_product_id, seedId);

// ---- AD-TEN0: NON-INVENT GATE — every emitted row's keys ⊆ the REAL AD column set --------------------------
ok('AD-TEN0-warehouse-shape', keysSubset(wh, 'm_warehouse'), 'm_warehouse row uses ONLY real AD_Column names');
ok('AD-TEN0-locator-shape', keysSubset(loc, 'm_locator'), 'm_locator row uses ONLY real AD_Column names');
ok('AD-TEN0-subscription-shape', keysSubset(sub, 'c_subscription'), 'c_subscription row uses ONLY real AD_Column names');

// ---- AD-TEN1: the Locator's x/y/z is the REAL fixture-extracted centroid, not fabricated --------------------
ok('AD-TEN1-real-centroid', loc.x === String(room1.center[0]) && loc.y === String(room1.center[1]) && loc.z === String(room1.center[2]),
  'm_locator x/y/z = fixtures/hhs_rooms.json REAL extracted center [' + room1.center.join(',') + '], not invented');

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

// ---- AD-TEN5: subscription type is a real, reusable native row (frequencytype/frequency), not a magic string ---
var st = AD.SUBSCRIPTION_TYPES.MONTHLY_RENT;
ok('AD-TEN5-subscriptiontype', sub.c_subscriptiontype_id === st.c_subscriptiontype_id && st.frequencytype === 'M' && st.frequency === 1,
  'the lease references a real C_SubscriptionType row (Monthly Rent, frequencytype=M/frequency=1), not a hardcoded cadence');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-AD-TENANCY ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);

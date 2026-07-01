// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TENANCY RE-TARGETED ONTO NATIVE iDempiere AD TABLES (prompts/RESUME_HR_BIM_ASSET.md
//   §CRITICAL "Compile not Model", Tenancy re-scope 2026-07-02, user-reviewed design).
//
//   `c_recurring` was the WRONG table (verified — it's a header POINTING AT an existing C_Order/C_Invoice,
//   needs one to pre-exist). The right native table is `C_Subscription` (c_bpartner_id=tenant,
//   m_product_id=the leased unit — itself already a compiled BIM element per the BOM PRINCIPLE,
//   c_subscriptiontype_id=frequency, startdate/paiduntildate/renewaldate/isdue) — SELF-CONTAINED, no
//   Order/Invoice pre-req.
//
//   "Building" has no native AD table, but `build/erp/bim_embed.js` §B4 already proves `M_Warehouse` is used
//   as one in this exact repo (an AD_Attachment BIM-set on M_Warehouse 190/103 "HQ Warehouse", pointing at the
//   compiled Terminal viewer). `M_Locator` (real x/y/z columns) is already a spatial-zone primitive twice over
//   (wh_route.js aisle/rack picking; DAGCompiler Place.java's wall-zone handles). `M_Product.m_locator_id` is a
//   real column, so Product(unit)→Locator(room, real x/y/z)→Warehouse(building) is wired natively, schema-only.
//   The room centroids below come from `fixtures/hhs_rooms.json`'s REAL extracted `center` — not fabricated.
//
//   NOT built here (honest gap, isolated to ONE step): `paiduntildate` needs a real C_Invoice/C_Payment to
//   advance — the genuine Order-engine dependency. Left null; never fabricate a paid-through date. Declaring
//   the BIM-set AD_Attachment on the Warehouse is bim_embed.js's job (ERP-side, already built) — NOT
//   reimplemented here; this module only produces the row shapes, per the "dotted lines only" doctrine.
'use strict';
(function () {
var W = (typeof require !== 'undefined') ? require('./watermark') : (typeof self !== 'undefined' ? self : this).HbaWatermark;

// ---- native C_SubscriptionType — ONE demo cadence, reused across every lease (real columns only) ----------
var SUBSCRIPTION_TYPES = {
  MONTHLY_RENT: { c_subscriptiontype_id: 1, name: 'Monthly Rent', description: 'Residential/commercial unit lease, billed monthly', frequencytype: 'M', frequency: 1 }
};

// ONE M_Warehouse row per building — new, since a demo building like HHS_Office_Federated has none yet
// (unlike GardenWorld/Terminal, which already have real M_Warehouse rows in ad_full.db).
function toWarehouseRow(buildingName, seedId) {
  return { m_warehouse_id: seedId ? seedId() : 1, value: buildingName, name: buildingName };
}

// ONE M_Locator row per room — x/y/z = the fixture's REAL extracted centroid, never fabricated.
// room = { guid, name, storey, center: [x,y,z] } (fixtures/hhs_rooms.json shape).
function toLocatorRow(room, m_warehouse_id, seedId) {
  if (!room || !room.guid || !room.center) return null;
  return { m_locator_id: seedId ? seedId() : 1, m_warehouse_id: m_warehouse_id, value: room.guid,
    x: String(room.center[0]), y: String(room.center[1]), z: String(room.center[2]) };
}

// the leasable unit itself — an M_Product row whose m_locator_id names its real room/zone.
function toProductRow(room, m_locator_id, seedId) {
  if (!room || !room.guid) return null;
  return { m_product_id: seedId ? seedId() : 1, value: room.guid, name: room.name || room.guid, m_locator_id: m_locator_id };
}

// the lease itself — a C_Subscription row (tenant↔unit, recurring, self-contained — no Order/Invoice needed).
// lease = models.js MODELS.Tenancy record shape: { lease_no, unit_guid, tenant, rent, term_start, term_end, deposit }.
function toSubscriptionRow(lease, m_product_id, seedId) {
  if (!lease || !lease.tenant || !lease.unit_guid) return null;
  return { c_subscription_id: seedId ? seedId() : 1, name: lease.lease_no || null, c_bpartner_id: lease.tenant,
    m_product_id: m_product_id, c_subscriptiontype_id: SUBSCRIPTION_TYPES.MONTHLY_RENT.c_subscriptiontype_id,
    startdate: lease.term_start, renewaldate: lease.term_end, paiduntildate: null, isdue: 'Y' };
}

var AD = { SUBSCRIPTION_TYPES: SUBSCRIPTION_TYPES, toWarehouseRow: toWarehouseRow,
  toLocatorRow: toLocatorRow, toProductRow: toProductRow, toSubscriptionRow: toSubscriptionRow };
if (typeof module === 'object' && module.exports) module.exports = AD;
else (typeof self !== 'undefined' ? self : this).HbaAdTenancy = AD;
})();

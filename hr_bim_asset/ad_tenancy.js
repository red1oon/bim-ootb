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
//   compiled Terminal viewer). `M_Product.m_locator_id` is a real column, so Product(unit)→Locator(room)→
//   Warehouse(building) is wired natively, schema-only.
//
//   CORRECTED 2026-07-02 (user WMS review) — `M_Locator.X/Y/Z` are NOT Cartesian coordinates. Verified against
//   this project's own `ad_full.db` AD_Element dictionary: X="Aisle (X)", Y="Bin (Y)", Z="Level (Z)" — the
//   classic WMS bin-address triple (e.g. "02-B-03": aisle=row, bin=rack section along the row, level=shelf
//   HEIGHT). Aisle/Bin are the two HORIZONTAL axes; Level is the VERTICAL one — so Level maps naturally onto a
//   building's storey (floors stack vertically), Aisle onto a block/wing (the other horizontal grouping), and
//   Bin has no building-side analog (there's no "which rack-section along the row" concept for a floor plan) —
//   left honestly unused rather than forced. The room's real geometry (precise x/y/z position) stays
//   authoritative on the BIM/viewer side, joined back only by guid — this AD-side record is a WMS-style
//   business ADDRESS (block/storey) for ERP-side lookup, not a duplicate coordinate store.
//
//   Strata needs NO new table (§CRITICAL correction — retires the earlier `PM_Strata_Parcel` idea): it is the
//   IDENTICAL `C_Subscription` mechanism as Tenancy — same `c_bpartner_id` (the owner instead of the tenant),
//   same `m_product_id` (the same unit), just a different native `C_SubscriptionType` row (quarterly strata fee
//   vs monthly rent). `toSubscriptionRow` takes the type + party role as parameters so both profiles share it.
//
//   NOT built here (honest gap, isolated to ONE step): `paiduntildate` needs a real C_Invoice/C_Payment to
//   advance — the genuine Order-engine dependency. Left null; never fabricate a paid-through date. Declaring
//   the BIM-set AD_Attachment on the Warehouse is bim_embed.js's job (ERP-side, already built) — NOT
//   reimplemented here; this module only produces the row shapes, per the "dotted lines only" doctrine.
'use strict';
(function () {
var W = (typeof require !== 'undefined') ? require('./watermark') : (typeof self !== 'undefined' ? self : this).HbaWatermark;

// ---- native C_SubscriptionType rows — ONE demo cadence per profile, both real columns only ------------------
var SUBSCRIPTION_TYPES = {
  MONTHLY_RENT: { c_subscriptiontype_id: 1, name: 'Monthly Rent', description: 'Residential/commercial unit lease, billed monthly', frequencytype: 'M', frequency: 1 },
  QUARTERLY_STRATA_FEE: { c_subscriptiontype_id: 2, name: 'Quarterly Strata Fee', description: 'Owner maintenance/sinking-fund charge, billed quarterly', frequencytype: 'M', frequency: 3 }
};

// ONE M_Warehouse row per building — new, since a demo building like HHS_Office_Federated has none yet
// (unlike GardenWorld/Terminal, which already have real M_Warehouse rows in ad_full.db).
function toWarehouseRow(buildingName, seedId) {
  return { m_warehouse_id: seedId ? seedId() : 1, value: buildingName, name: buildingName };
}

// ONE M_Locator row per room — a WMS bin-ADDRESS (block/storey), NOT a coordinate (see header). Level(Z)=the
// real extracted storey; Aisle(X)=a real block/wing when the building has one (blank otherwise, never guessed);
// Bin(Y) has no building-side analog — left unset. room = { guid, name, storey, block? } (fixture shape).
function toLocatorRow(room, m_warehouse_id, seedId) {
  if (!room || !room.guid) return null;
  return { m_locator_id: seedId ? seedId() : 1, m_warehouse_id: m_warehouse_id, value: room.guid,
    x: room.block || null, z: room.storey || null };
}

// the leasable unit itself — an M_Product row whose m_locator_id names its real room/zone.
function toProductRow(room, m_locator_id, seedId) {
  if (!room || !room.guid) return null;
  return { m_product_id: seedId ? seedId() : 1, value: room.guid, name: room.name || room.guid, m_locator_id: m_locator_id };
}

// the recurring charge itself — a C_Subscription row, party↔unit, self-contained (no Order/Invoice needed).
// SAME shape serves Tenancy (party=tenant, type=MONTHLY_RENT) AND Strata (party=owner, type=QUARTERLY_STRATA_FEE)
// — no separate table for the latter (§CRITICAL correction, see header). record = { ref_no, unit_guid, party,
// term_start, term_end } (models.js Tenancy/Strata record shape, field names vary slightly per model — caller
// normalizes). subscriptionType defaults to MONTHLY_RENT (Tenancy); pass QUARTERLY_STRATA_FEE for Strata.
function toSubscriptionRow(record, m_product_id, subscriptionType, seedId) {
  if (!record || !record.party || !record.unit_guid) return null;
  var st = subscriptionType || SUBSCRIPTION_TYPES.MONTHLY_RENT;
  return { c_subscription_id: seedId ? seedId() : 1, name: record.ref_no || null, c_bpartner_id: record.party,
    m_product_id: m_product_id, c_subscriptiontype_id: st.c_subscriptiontype_id,
    startdate: record.term_start, renewaldate: record.term_end, paiduntildate: null, isdue: 'Y' };
}

var AD = { SUBSCRIPTION_TYPES: SUBSCRIPTION_TYPES, toWarehouseRow: toWarehouseRow,
  toLocatorRow: toLocatorRow, toProductRow: toProductRow, toSubscriptionRow: toSubscriptionRow };
if (typeof module === 'object' && module.exports) module.exports = AD;
else (typeof self !== 'undefined' ? self : this).HbaAdTenancy = AD;
})();

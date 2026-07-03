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
//
//   PM_Property↔M_Warehouse CHECK (2026-07-02, session backlog item, low priority — no live engine depends on
//   it): `models.js PropertyManagement` (`property`/`building_guid`/`units`/`manager`) is COVERED by the SAME
//   Building=M_Warehouse mapping above, not a separate table:
//     • `property`/`building_guid` — already the Warehouse row itself (`toWarehouseRow`, AD-TEN0-proven) + the
//       existing `bim_embed.js` AD_Attachment (the guid link is NOT a Warehouse column, per the header above).
//     • `units` — NEVER a stored field (a redundant duplicate of the room count). Derive it: COUNT the
//       `M_Locator` rows whose `m_warehouse_id` matches (`propertyUnits`, below) — non-invent (compute, don't
//       store a number that can drift from the real locators).
//     • `manager` — a GENUINE NATIVE GAP, same treatment as Occupancy's party gap (P-OCC-RETRO): grepped every
//       table in `ad_full.db` for a `%manager%` column — NONE exists, `M_Warehouse` included. The nearest native
//       mechanism is an ACCESS-CONTROL chain, not a business fact on the row: `ad_user.c_bpartner_id` (a login
//       account's linked BPartner) granted `ad_user_orgaccess(ad_user_id, ad_org_id)` on `m_warehouse.ad_org_id`
//       (every AD row carries `ad_org_id`) — "who has org-access" is a role assignment, not "who manages this
//       building." NOT built here (no live engine needs it) — flagged, not fabricated into a `manager` column
//       that doesn't exist. `models.js`'s `PropertyManagement` demo record is UNCHANGED (kept, like Strata's
//       demo record, as the alpha-existence proof — the compile-layer finding lives here, not there).
function propertyUnits(m_warehouse_id, locatorRows) {
  return (locatorRows || []).filter(function (l) { return l && l.m_warehouse_id === m_warehouse_id; }).length;
}
'use strict';
(function () {
var W = (typeof require !== 'undefined') ? require('./watermark') : (typeof self !== 'undefined' ? self : this).HbaWatermark;

// §STAGE2 — MATCH-OR-CREATE against the REAL seeded AD rows (RESUME_HBA_ERP_GOVERNED_DISPLAY.md Stage 2,
// §IMPLICATIONS point 2 "identity-key stability is the crux design risk"). `erpQuery(sql, params)` is a SYNC
// reader over the loaded ad_seed.db (the viewer's A.erpQuery seam / a witness's injected handle) returning an
// array of row-objects; ABSENT (undefined/null) → every builder falls back to the prior deterministic mint, so
// every existing node witness (which passes no erpQuery) is byte-for-byte unchanged. `_one` returns the first
// matched row or null, never throws (a missing table / bad db degrades to the mint path, honest no-op).
function _one(erpQuery, sql, params) {
  if (typeof erpQuery !== 'function') return null;
  try { var r = erpQuery(sql, params || []); return (r && r.length) ? r[0] : null; } catch (e) { return null; }
}
function _num(v) { return (v == null) ? v : Number(v); }

// ---- native C_SubscriptionType rows — ONE demo cadence per profile, both real columns only ------------------
var SUBSCRIPTION_TYPES = {
  MONTHLY_RENT: { c_subscriptiontype_id: 1, name: 'Monthly Rent', description: 'Residential/commercial unit lease, billed monthly', frequencytype: 'M', frequency: 1 },
  QUARTERLY_STRATA_FEE: { c_subscriptiontype_id: 2, name: 'Quarterly Strata Fee', description: 'Owner maintenance/sinking-fund charge, billed quarterly', frequencytype: 'M', frequency: 3 }
};

// ONE M_Warehouse row per building. §STAGE2 — MATCH-OR-CREATE by Value: when `erpQuery` is present, resolve
// the REAL seeded warehouse row (Q1 pinned Value='HHS_Office_Federated' at id 990000, seed_hba_erp.js §1) so
// the building's identity is the DURABLE seeded id, NOT a blind `1` re-minted every compile (the §IMPLICATIONS
// pt-2 determinism landmine — GeoMapping W-GEOMAP-TIER1 discipline). No match (a building not yet seeded, or no
// db loaded) → the prior deterministic mint, unchanged. Value is the match key exactly as pinned in Stage 1.
function toWarehouseRow(buildingName, seedId, erpQuery) {
  var hit = _one(erpQuery, 'SELECT M_Warehouse_ID AS id, Value AS value, Name AS name FROM M_Warehouse WHERE Value=?', [buildingName]);
  if (hit) return { m_warehouse_id: _num(hit.id), value: hit.value, name: hit.name || hit.value };
  return { m_warehouse_id: seedId ? seedId() : 1, value: buildingName, name: buildingName };
}

// ONE M_Locator row per room — a WMS bin-ADDRESS (block/storey), NOT a coordinate (see header). Level(Z)=the
// real extracted storey; Aisle(X)=a real block/wing when the building has one; Bin(Y) has no building-side
// analog. §P10-CHECK CORRECTION (2026-07-02, sourced): unused dimensions = '0', the NATIVE empty-address
// default (MLocator constructor setXYZ("0","0","0"); every real GardenWorld row shows '0') — not null/absent,
// and never a guessed real address. isdefault='N': a room locator is never the warehouse's default locator.
// ⚠ MLocator.get() coalesces by (warehouse,X,Y,Z) — rooms on one storey share an ABL address, so locator
// identity rides on value=guid; never create/look up room locators via the combination. room = { guid, name,
// storey, block? } (fixture shape).
function toLocatorRow(room, m_warehouse_id, seedId, erpQuery) {
  if (!room || !room.guid) return null;
  // §STAGE2 — resolve the REAL seeded M_Locator for this room (seed_hba_erp.js §2 persisted one per HHS room,
  // keyed Value=guid under the warehouse) so the room's spatial address is the durable seeded id; else mint.
  var hit = _one(erpQuery, 'SELECT M_Locator_ID AS id FROM M_Locator WHERE M_Warehouse_ID=? AND Value=?', [m_warehouse_id, room.guid]);
  var id = hit ? _num(hit.id) : (seedId ? seedId() : 1);
  return { m_locator_id: id, m_warehouse_id: m_warehouse_id, value: room.guid,
    x: room.block || '0', y: '0', z: room.storey || '0', isdefault: 'N' };
}

// the leasable unit itself — an M_Product row whose m_locator_id names its real room/zone. §STAGE2 — reuse a
// REAL seeded M_Product row (Value=guid) when one exists; else mint (Stage 1 seeded no per-room Products, so
// this ordinarily mints a deterministic compile-projection id over the resolved locator — honest, not a
// fabricated master).
function toProductRow(room, m_locator_id, seedId, erpQuery) {
  if (!room || !room.guid) return null;
  var hit = _one(erpQuery, 'SELECT M_Product_ID AS id, Name AS name FROM M_Product WHERE Value=?', [room.guid]);
  if (hit) return { m_product_id: _num(hit.id), value: room.guid, name: hit.name || room.name || room.guid, m_locator_id: m_locator_id };
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

// §P10a — the native `ad_user` row for a person (see models.js `Official` header for the c_bpartner_id
// discipline: populated only where a real HR/Payroll link exists, null for pure tenancy contacts). person =
// a models.js Official record ({ad_user_id,name,email,phone,c_bpartner_id}); column-pure passthrough — the
// non-invent decision already happened where the record was seeded.
function toUserRow(person) {
  if (!person) return null;
  return { ad_user_id: person.ad_user_id, name: person.name, email: person.email || null,
    phone: person.phone || null, c_bpartner_id: person.c_bpartner_id || null };
}

// §P10-BUILD point 1 — compile a WHOLE building's tenancy+strata into the native AD shapes in one pass:
// {warehouse, locators, products, subscriptions, skipped, units, _watermark}. Per REAL room -> locator+product;
// per lease -> subscription(MONTHLY_RENT, party=tenant); per strata parcel -> subscription(QUARTERLY_STRATA_FEE,
// party=owner). A lease/strata record whose unit_guid is NOT a real room in `rooms` is SKIPPED (never fabricate
// a locator for it) into `skipped[]` with a reason, not silently dropped. `units` is DERIVED via propertyUnits
// (never a stored duplicate of the room count). Subscriptions come back WRAPPED {row, unit_guid, kind, storey}
// — `row` stays column-pure AD; the wrapper is caller/view trace only, never written back as an AD column.
function compileBuilding(buildingName, rooms, leases, strata, opts) {
  rooms = rooms || []; leases = leases || []; strata = strata || []; opts = opts || {};
  var erpQuery = opts.erpQuery;   // §STAGE2 — SYNC ad_seed.db reader (viewer A.erpQuery / witness handle) or null
  var seq = { loc: 0, prod: 0, sub: 0 };
  var seedLoc = function () { return ++seq.loc; }, seedProd = function () { return ++seq.prod; }, seedSub = function () { return ++seq.sub; };
  var warehouse = toWarehouseRow(buildingName, function () { return 1; }, erpQuery);
  var byGuid = {}; rooms.forEach(function (r) { byGuid[r.guid] = r; });
  var locators = [], products = [], productIdByGuid = {};
  rooms.forEach(function (r) {
    var loc = toLocatorRow(r, warehouse.m_warehouse_id, seedLoc, erpQuery); locators.push(loc);
    var prod = toProductRow(r, loc.m_locator_id, seedProd, erpQuery); products.push(prod); productIdByGuid[r.guid] = prod.m_product_id;
  });
  var subscriptions = [], skipped = [];
  function compileCharge(record, kind, subType, refField, partyField) {
    var guid = record.unit_guid, room = byGuid[guid];
    if (!room) { skipped.push({ ref: record[refField] || null, unit_guid: guid, kind: kind, reason: 'unit_guid is not a real room in this building' }); return; }
    var norm = { ref_no: record[refField], unit_guid: guid, party: record[partyField], term_start: record.term_start, term_end: record.term_end };
    var row = toSubscriptionRow(norm, productIdByGuid[guid], subType, seedSub);
    subscriptions.push({ row: row, unit_guid: guid, kind: kind, storey: room.storey || null });
  }
  leases.forEach(function (l) { compileCharge(l, 'tenancy', SUBSCRIPTION_TYPES.MONTHLY_RENT, 'lease_no', 'tenant'); });
  strata.forEach(function (s) { compileCharge(s, 'strata', SUBSCRIPTION_TYPES.QUARTERLY_STRATA_FEE, 'parcel', 'owner'); });
  var units = propertyUnits(warehouse.m_warehouse_id, locators);
  var out = { warehouse: warehouse, locators: locators, products: products, subscriptions: subscriptions, skipped: skipped, units: units };
  return W.stamp(out, 'en');
}

var AD = { SUBSCRIPTION_TYPES: SUBSCRIPTION_TYPES, toWarehouseRow: toWarehouseRow,
  toLocatorRow: toLocatorRow, toProductRow: toProductRow, toSubscriptionRow: toSubscriptionRow,
  toUserRow: toUserRow, compileBuilding: compileBuilding, propertyUnits: propertyUnits };
if (typeof module === 'object' && module.exports) module.exports = AD;
else (typeof self !== 'undefined' ? self : this).HbaAdTenancy = AD;
})();

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET AD-DEFINED MODELS (§ALPHA-MODELS). Each is a NEW AD-shaped model with
//   ONE singular demo record — enough to DEMO the feature exists (alpha). Watermarked. AD-shaped so it
//   compiles into the ERP AD when present (dotted line), but seeds standalone. Demo values only — any real
//   rate/fee is behind the §RESEARCH GATE. Expand per a big user request. Read log after run.
'use strict';
// browser-safe import: node → require; browser <script> → the self.Hba* global the dep set on load.
var W = (typeof require !== 'undefined') ? require('./watermark') : (typeof self !== 'undefined' ? self : this).HbaWatermark;

var MODELS = {
  Tenancy: {
    table: 'HR_Lease', label: 'Tenancy', doc_type: 'LEASE',
    fields: [{ name: 'lease_no', type: 'id' }, { name: 'unit_guid', type: 'bim_ref' }, { name: 'tenant', type: 'party' },
             { name: 'rent', type: 'amount' }, { name: 'term_start', type: 'period' }, { name: 'term_end', type: 'period' }, { name: 'deposit', type: 'amount' },
             { name: 'unit_class', type: 'list' }],   // §CLASS facet — building-use class (residential/commercial/office)
    // unit_guid = a REAL HHS IfcSpace room (≈ Level 1 R1) — see fixtures/hhs_rooms.json (NON-INVENT: the
    // join hits a real unit; a fabricated guid would honestly show un-linked, never a faked binding).
    // unit_class = a DECLARED business datum on the lease (CONTOH/SAMPLE demonstrator), NOT a geometric claim:
    // the HHS model carries NO real IfcSpace predefined_type (all 'INTERNAL'), so the class facet sources class
    // from the lease record. The resolver still PREFERS a real model predefined_type when a building has one
    // (viewer/hba_lens.js classRows). Guids are real; classes are sample lease declarations.
    records: [{ lease_no: 'L-0001', unit_guid: 'RM_Level_1_1', tenant: 'BP-TEN-1', rent: 1800, term_start: '2026-01', term_end: '2026-12', deposit: 3600, unit_class: 'office' },
              { lease_no: 'L-0002', unit_guid: 'RM_Level_1_3', tenant: 'BP-TEN-5', rent: 2400, term_start: '2026-01', term_end: '2026-12', deposit: 4800, unit_class: 'commercial' },
              { lease_no: 'L-0003', unit_guid: 'RM_Level_1_4', tenant: 'BP-TEN-6', rent: 1500, term_start: '2026-01', term_end: '2026-12', deposit: 3000, unit_class: 'residential' }]
  },
  PropertyManagement: {
    // ALPHA DEMO RECORD ONLY (kept, like Strata's below) — the COMPILE-LAYER finding is in ad_tenancy.js:
    // this table's concept is COVERED by the Building=M_Warehouse mapping (`toWarehouseRow`, AD-TEN0-proven),
    // not a separate PM_Property table. `units` should be DERIVED (`ad_tenancy.propertyUnits`, AD-TEN6), never
    // a stored duplicate of the room count. `manager` is a GENUINE NATIVE GAP (no column anywhere in ad_full.db)
    // — AD-TEN6 proves the nearest native chain (ad_user.c_bpartner_id → ad_user_orgaccess → m_warehouse.ad_org_id
    // is an access-control fact, not "who manages this building") — flagged, not fabricated onto this row.
    table: 'PM_Property', label: 'Property Management',
    fields: [{ name: 'property', type: 'id' }, { name: 'building_guid', type: 'bim_ref' }, { name: 'units', type: 'number' }, { name: 'manager', type: 'party' }],
    records: [{ property: 'PROP-001', building_guid: 'GUID-BLDG-1', units: 48, manager: 'BP-MGR-1' }]
  },
  Strata: {
    table: 'PM_Strata_Parcel', label: 'Strata Title / Ownership',
    fields: [{ name: 'parcel', type: 'id' }, { name: 'unit_guid', type: 'bim_ref' }, { name: 'owner', type: 'party' },
             { name: 'share_units', type: 'number' }, { name: 'maint_fee', type: 'amount' }, { name: 'sinking_fund', type: 'amount' }],
    // unit_guid = a REAL HHS IfcSpace room (≈ Level 1 R2) — strata parcel bound to actual geometry, not a placeholder.
    records: [{ parcel: 'A-12-03', unit_guid: 'RM_Level_1_2', owner: 'BP-OWN-1', share_units: 120, maint_fee: 280, sinking_fund: 56 }]
  },
  Asset: {
    table: 'PM_Asset', label: 'Asset / Equipment',
    // The HR_BIM_ASSET crossroads: BIM(bim_guid) + IoT(iot_device) + HR/ERP(operator/vendor/personnel) + 4D(schedule).
    fields: [{ name: 'asset', type: 'id' }, { name: 'bim_guid', type: 'bim_ref' }, { name: 'iot_device', type: 'iot_ref' }, { name: 'category', type: 'list' },
             { name: 'operator', type: 'party' }, { name: 'vendor', type: 'party' }, { name: 'personnel', type: 'party' },
             { name: 'pm_cycle', type: 'list' }, { name: 'next_due', type: 'period' }],
    // bim_guid = a REAL HHS IfcFlowTerminal (HVAC supply diffuser) — see fixtures/hhs_rooms.json.assets
    // (NON-INVENT: the asset binds to actual geometry; the maintenance timeline is derived from next_due+pm_cycle).
    records: [{ asset: 'AHU-03', bim_guid: '04i7IlvuLBuOmBXGMxmbgo', iot_device: 'IOT-AHU03-TEMP', category: 'HVAC',
                operator: 'BP-OPR-1', vendor: 'BP-VEND-1', personnel: 'EMP002', pm_cycle: 'monthly', next_due: '2026-07' }]
  },
  Occupancy: {
    table: 'S_ResourceAssignment', label: 'Room Occupancy / Availability', doc_type: 'RESOURCE_ASSIGNMENT',
    // CORRECTED 2026-07-02 (§CRITICAL "Compile not Model", P-OCC-RETRO) — field names below are now the REAL
    // s_resourceassignment columns, verified against build/erp/ad_full.db `PRAGMA table_info`, not paraphrases.
    // The FK direction is Product→Resource (m_product.s_resource_id, verified — the earlier "Room IS-A
    // M_Product" here had it backwards). s_resourceassignment natively has NO party/tenant column — `party` is
    // a carry-along for the caller's own use (it threads onto C_Order/C_Invoice.c_bpartner_id when a real lease
    // exists), never a real column on this table (occupancy.js `toResourceAssignmentRow` enforces this — see its
    // header + W-HBA-AD-OCC). The LIVE availability is a REPLAY of occupancy.js's signed ASSIGN/RELEASE/UNAVAIL
    // op-log over the 14 REAL HHS rooms; this record is a static single-record showcase only. assigndateto=null → open-ended.
    fields: [{ name: 's_resourceassignment_id', type: 'id' }, { name: 's_resource_id', type: 'bim_ref' },
             { name: 'party', type: 'party' }, { name: 'assigndatefrom', type: 'period' }, { name: 'assigndateto', type: 'period' },
             { name: 'qty', type: 'number' }, { name: 'isconfirmed', type: 'flag' }],
    // s_resource_id = a REAL HHS IfcSpace room (≈ Level 1 R1); the occupancy graph over the other rooms is seeded
    // by occupancy.demoSeed(rooms) from fixtures/hhs_rooms.json (NON-INVENT: vacancy = absence of an assignment).
    records: [{ s_resourceassignment_id: 'RA-0001', s_resource_id: 'RM_Level_1_1',
                party: 'BP-TEN-1', assigndatefrom: '2026-01', assigndateto: '2026-12', qty: 1, isconfirmed: 'Y' }]
  },
  // §P10a (RESUME_HR_BIM_ASSET.md, user 2026-07-02) — the PRIMARY spatial-side identity for a person: the
  // native `ad_user` table already carries name/email/phone AND an OPTIONAL c_bpartner_id (verified
  // build/erp/ad_full.db PRAGMA table_info(ad_user) — notnull=0). `c_bpartner_id` is populated ONLY where a
  // real link already exists elsewhere in this codebase (ad_payroll.js EMP001->1001/EMP002->1002 — HR/Payroll
  // IS involved for those two); tenant rows stay null — no real C_BPartner backs a bare BP-TEN-* label here,
  // same non-invent discipline as PropertyManagement.manager (AD-TEN6). email/phone are CONTOH/SAMPLE demo
  // contact details (watermarked below, like every other demo field in this file — rent/deposit are equally
  // invented sample numbers, watermarked the same way).
  Official: {
    table: 'AD_User', label: 'Officials & Contacts',
    fields: [{ name: 'ad_user_id', type: 'id' }, { name: 'name', type: 'text' }, { name: 'email', type: 'email' },
             { name: 'phone', type: 'text' }, { name: 'c_bpartner_id', type: 'party' }],
    // EMP-1..EMP-4 are attendance.js demoSeed's own canonical check-in identities (its own namespace, distinct
    // from ad_payroll.js's EMP001/EMP002 — verified: `demoSeed` hardcodes 'EMP-1'..'EMP-4' for zones g[0]/g[1],
    // the 4 the existing witnesses probe; the auto-generated overflow past g[3] ('EMP-30' etc) has no Official
    // row — an honest miss, never fabricated). c_bpartner_id null: presence/check-in alone doesn't prove an
    // HR/Payroll BPartner link (unlike ad_payroll.js's own EMP001/EMP002, which do).
    records: [{ ad_user_id: 1, name: 'EMP001', email: 'emp001@contoh.my', phone: '+60 12-345 6001', c_bpartner_id: 1001 },
              { ad_user_id: 2, name: 'EMP002', email: 'emp002@contoh.my', phone: '+60 12-345 6002', c_bpartner_id: 1002 },
              { ad_user_id: 3, name: 'BP-TEN-1', email: 'ten1@contoh.my', phone: '+60 12-345 7001', c_bpartner_id: null },
              { ad_user_id: 4, name: 'BP-TEN-5', email: 'ten5@contoh.my', phone: '+60 12-345 7005', c_bpartner_id: null },
              { ad_user_id: 5, name: 'BP-TEN-6', email: 'ten6@contoh.my', phone: '+60 12-345 7006', c_bpartner_id: null },
              { ad_user_id: 6, name: 'EMP-1', email: 'emp-1@contoh.my', phone: '+60 12-345 8001', c_bpartner_id: null },
              { ad_user_id: 7, name: 'EMP-2', email: 'emp-2@contoh.my', phone: '+60 12-345 8002', c_bpartner_id: null },
              { ad_user_id: 8, name: 'EMP-3', email: 'emp-3@contoh.my', phone: '+60 12-345 8003', c_bpartner_id: null },
              { ad_user_id: 9, name: 'EMP-4', email: 'emp-4@contoh.my', phone: '+60 12-345 8004', c_bpartner_id: null }]
  }
};

// alpha discipline: watermark every demo record
Object.keys(MODELS).forEach(function (k) { MODELS[k].records.forEach(function (r) { W.stamp(r, 'en'); }); });

// COMPILE (not model) — project an Asset record onto the REAL native `a_asset` shape (§CRITICAL, follow-on to
// P-OCC-RETRO). Columns verified against build/erp/ad_full.db `PRAGMA table_info(a_asset)`. timeline.js's OWN
// consumption (asset/bim_guid/pm_cycle/next_due/category — the shipped, witnessed W-HBA-TIMELINE 7/7 engine,
// merged into the 4D editor) is UNCHANGED by this — this is an additional projection, not a replacement.
// NON-INVENT gap, honestly carried, not forced: `a_asset` has ONE `c_bpartner_id` (a single responsible party),
// but the Asset model tracks THREE parties (operator/vendor/personnel) — there is no native 3-way split, so only
// `operator` maps to the real column; `vendor`/`personnel` are carried as `_vendor`/`_personnel` for the caller,
// never forced into a column that doesn't exist for them.
function toAssetRow(asset) {
  if (!asset) return null;
  return { a_asset_id: 1, value: asset.asset, name: asset.asset, m_product_id: asset.bim_guid,
    c_bpartner_id: asset.operator || null, isowned: 'Y', nextmaintenencedate: asset.next_due || null,
    _vendor: asset.vendor || null, _personnel: asset.personnel || null };
}

function model(name) { return MODELS[name]; }
function records(name) { return (MODELS[name] || {}).records || []; }
// §P10a lookup — resolve a bare code (attendance `employee` id, lease `party`/`tenant`) to its AD_User contact
// record. Honest miss: returns null rather than fabricating a name for a code with no Official row.
function officialByName(name) {
  return records('Official').filter(function (o) { return o.name === name; })[0] || null;
}

var M = { MODELS: MODELS, model: model, records: records, toAssetRow: toAssetRow, officialByName: officialByName };
if (typeof module === 'object' && module.exports) module.exports = M;
else (typeof self !== 'undefined' ? self : this).HbaModels = M;

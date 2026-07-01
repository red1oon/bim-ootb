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

var M = { MODELS: MODELS, model: model, records: records, toAssetRow: toAssetRow };
if (typeof module === 'object' && module.exports) module.exports = M;
else (typeof self !== 'undefined' ? self : this).HbaModels = M;

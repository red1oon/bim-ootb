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
             { name: 'rent', type: 'amount' }, { name: 'term_start', type: 'period' }, { name: 'term_end', type: 'period' }, { name: 'deposit', type: 'amount' }],
    // unit_guid = a REAL HHS IfcSpace room (≈ Level 1 R1) — see fixtures/hhs_rooms.json (NON-INVENT: the
    // join hits a real unit; a fabricated guid would honestly show un-linked, never a faked binding).
    records: [{ lease_no: 'L-0001', unit_guid: 'RM_Level_1_1', tenant: 'BP-TEN-1', rent: 1800, term_start: '2026-01', term_end: '2026-12', deposit: 3600 }]
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
    // iDempiere Resource-Assignment: the ROOM is a Resource (IS-A M_Product); an assignment books it over a
    // date range. This is the AD shape only — the LIVE availability is a REPLAY of occupancy.js's signed
    // ASSIGN/RELEASE/UNAVAIL op-log over the 14 REAL HHS rooms. assign_to=null → open-ended.
    fields: [{ name: 'assignment_no', type: 'id' }, { name: 's_resource', type: 'bim_ref' }, { name: 'resource_product', type: 'product' },
             { name: 'party', type: 'party' }, { name: 'assign_from', type: 'period' }, { name: 'assign_to', type: 'period' }, { name: 'qty', type: 'number' }],
    // s_resource = a REAL HHS IfcSpace room (≈ Level 1 R1); the occupancy graph over the other rooms is seeded
    // by occupancy.demoSeed(rooms) from fixtures/hhs_rooms.json (NON-INVENT: vacancy = absence of an assignment).
    records: [{ assignment_no: 'RA-0001', s_resource: 'RM_Level_1_1', resource_product: 'ROOM-RM_Level_1_1',
                party: 'BP-TEN-1', assign_from: '2026-01', assign_to: '2026-12', qty: 1 }]
  }
};

// alpha discipline: watermark every demo record
Object.keys(MODELS).forEach(function (k) { MODELS[k].records.forEach(function (r) { W.stamp(r, 'en'); }); });

function model(name) { return MODELS[name]; }
function records(name) { return (MODELS[name] || {}).records || []; }

var M = { MODELS: MODELS, model: model, records: records };
if (typeof module === 'object' && module.exports) module.exports = M;
else (typeof self !== 'undefined' ? self : this).HbaModels = M;

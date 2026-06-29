// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET AD-DEFINED MODELS (§ALPHA-MODELS). Each is a NEW AD-shaped model with
//   ONE singular demo record — enough to DEMO the feature exists (alpha). Watermarked. AD-shaped so it
//   compiles into the ERP AD when present (dotted line), but seeds standalone. Demo values only — any real
//   rate/fee is behind the §RESEARCH GATE. Expand per a big user request. Read log after run.
'use strict';
var W = require('./watermark');

var MODELS = {
  Tenancy: {
    table: 'HR_Lease', label: 'Tenancy', doc_type: 'LEASE',
    fields: [{ name: 'lease_no', type: 'id' }, { name: 'unit_guid', type: 'bim_ref' }, { name: 'tenant', type: 'party' },
             { name: 'rent', type: 'amount' }, { name: 'term_start', type: 'period' }, { name: 'term_end', type: 'period' }, { name: 'deposit', type: 'amount' }],
    records: [{ lease_no: 'L-0001', unit_guid: 'GUID-UNIT-A1203', tenant: 'BP-TEN-1', rent: 1800, term_start: '2026-01', term_end: '2026-12', deposit: 3600 }]
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
    records: [{ parcel: 'A-12-03', unit_guid: 'GUID-UNIT-A1203', owner: 'BP-OWN-1', share_units: 120, maint_fee: 280, sinking_fund: 56 }]
  },
  Asset: {
    table: 'PM_Asset', label: 'Asset / Equipment',
    // The HR_BIM_ASSET crossroads: BIM(bim_guid) + IoT(iot_device) + HR/ERP(operator/vendor/personnel) + 4D(schedule).
    fields: [{ name: 'asset', type: 'id' }, { name: 'bim_guid', type: 'bim_ref' }, { name: 'iot_device', type: 'iot_ref' }, { name: 'category', type: 'list' },
             { name: 'operator', type: 'party' }, { name: 'vendor', type: 'party' }, { name: 'personnel', type: 'party' },
             { name: 'pm_cycle', type: 'list' }, { name: 'next_due', type: 'period' }],
    records: [{ asset: 'AHU-03', bim_guid: 'GUID-MEP-AHU03', iot_device: 'IOT-AHU03-TEMP', category: 'HVAC',
                operator: 'BP-OPR-1', vendor: 'BP-VEND-1', personnel: 'EMP002', pm_cycle: 'monthly', next_due: '2026-07' }]
  }
};

// alpha discipline: watermark every demo record
Object.keys(MODELS).forEach(function (k) { MODELS[k].records.forEach(function (r) { W.stamp(r, 'en'); }); });

function model(name) { return MODELS[name]; }
function records(name) { return (MODELS[name] || {}).records || []; }

var M = { MODELS: MODELS, model: model, records: records };
if (typeof module === 'object' && module.exports) module.exports = M;
else (typeof self !== 'undefined' ? self : this).HbaModels = M;

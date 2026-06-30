// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET FIND LENSES (§SPATIAL-VIEW). Two Find-panel lenses (Tenancy · IoT) as
//   FLATICON toggles (Lucide 'users'/'cpu', word on hover, active = blue band) — mirrors Storey/DISC/Phase.
//   ZERO-IMPACT: reuses the panel's existing search→results→zoom→popup rails; HBA only supplies result rows
//   + a pick handler driven through the ScenePort seam. High level = population-density dots per storey;
//   drill = click → zoom → human dummy → IFC-style popup. Pure + deterministic. Read log after run.
'use strict';
var M = require('./models'), O = require('./overlay');

// a lens = flaticon toggle + a row provider. Reuses panels.js A.icon(icon,{title,onClick}).
var LENSES = {
  tenancy: { icon: 'users', label: 'Tenancy', mode: 'tenancy' },   // 2-head glyph
  iot:     { icon: 'cpu',   label: 'IoT / Assets', mode: 'maintenance' }
};

function deriveStorey(guid) { return 'S?'; }   // STUB: real = unit→storey containment from the model

// occupancy rows for the Find list — rooms→tenants. (recs override lets witnesses inject a fixture.)
function tenancyRows(period, recs) {
  return (recs || M.records('Tenancy')).map(function (r) {
    var occ = !!r.tenant;
    return { id: r.lease_no, guid: r.unit_guid, storey: r.storey || deriveStorey(r.unit_guid),
             label: (occ ? r.tenant : 'VACANT') + ' · ' + r.unit_guid, state: occ ? 'occupied' : 'vacant',
             detail: 'Lease ' + r.lease_no + ' · rent ' + r.rent + ' · ends ' + r.term_end, _watermark: r._watermark };
  });
}
function iotRows(recs) {
  return (recs || M.records('Asset')).map(function (r) {
    return { id: r.asset, guid: r.bim_guid, label: r.asset + ' · ' + r.category + ' · ' + r.iot_device,
             state: 'asset', detail: r.asset + ' · due ' + r.next_due + ' · ' + r.personnel + ' · ' + r.vendor, _watermark: r._watermark };
  });
}

// HIGH LEVEL — population-density dots per storey ∝ occupant count. NON-INVENT: count from records, positions
// jittered within the storey bbox SUPPLIED by the scene (never fabricated). Vacant rows don't count.
function densityPlan(rows, storeyBBoxes) {
  var pop = {};
  rows.forEach(function (r) { if (r.state === 'occupied') pop[r.storey] = (pop[r.storey] || 0) + 1; });
  return Object.keys(pop).sort().map(function (st) {
    return { storey: st, count: pop[st], bbox: (storeyBBoxes || {})[st] || null };
  });
}

// DRILL — pick a row → drive the ScenePort (reuse). scene = { zoomTo, placeDummy, popup, highlight, restoreAll }.
function onPick(lensKey, row, scene) {
  scene.restoreAll();                                       // clear prior selection (no stacking)
  scene.zoomTo(row.guid);
  scene.highlight(row.guid, O.COLORS[row.state] || O.COLORS.occupied);
  if (lensKey === 'tenancy' && row.state === 'occupied') scene.placeDummy(row.guid);  // one dummy, occupied only
  scene.popup(row.detail);                                  // reuse IFC-style hover popup
  return row.guid;
}

var L = { LENSES: LENSES, tenancyRows: tenancyRows, iotRows: iotRows, densityPlan: densityPlan, onPick: onPick };
if (typeof module === 'object' && module.exports) module.exports = L;
else (typeof self !== 'undefined' ? self : this).HbaLens = L;

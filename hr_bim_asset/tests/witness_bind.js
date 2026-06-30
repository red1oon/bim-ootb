// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-BIND witness (§RESUME NEXT#1 — bind a demo lease to a REAL HHS IfcSpace guid).
//   Each check NAMES the issue it proves/disproves. The load-bearing claim: the Tenancy lens lights a unit
//   ONLY when the lease guid JOINS a real room of the loaded building — a non-matching guid honestly shows
//   un-linked and NEVER fabricates a binding (the §BINDING non-invent gate). Joins against the EXTRACTED
//   room fixture (fixtures/hhs_rooms.json), so it does not depend on the 73MB blob being present.
//   Run: node hr_bim_asset/tests/witness_bind.js
'use strict';
var fs = require('fs'), path = require('path');
var B = require('../binding'), O = require('../overlay'), M = require('../models'), C = require('../connectors'), L = require('../lens');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-BIND ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var fxPath = path.join(__dirname, '../fixtures/hhs_rooms.json');
if (!fs.existsSync(fxPath)) { console.error('§HBA-BIND FAIL — room fixture missing; run fixtures/build_hhs_rooms.js'); process.exit(1); }
var FX = JSON.parse(fs.readFileSync(fxPath, 'utf8'));
var leaseGuid = M.records('Tenancy')[0].unit_guid;
var FAKE = 'GUID-DOES-NOT-EXIST-IN-HHS';

// B1 — fixture provenance: rooms are EXTRACTED from the real building, not invented.
ok('B1-fixture-real', FX._provenance && /HHS_Office_Federated/.test(FX._provenance.source) && FX._provenance.source_sha16
  && FX.count === FX.rooms.length && FX.count > 0 && FX.rooms.every(function (r) { return r.guid; }),
  'room fixture is EXTRACTED from HHS (' + FX.count + ' IfcSpace rooms, src sha16 ' + (FX._provenance || {}).source_sha16 + ') — non-invent provenance');

// B2 — the demo lease references a REAL room guid (the join hits → a real unit lights up).
var realRoom = FX.rooms.filter(function (r) { return r.guid === leaseGuid; })[0];
ok('B2-lease-binds-real', !!realRoom, 'demo lease L-0001 unit_guid "' + leaseGuid + '" IS a real HHS room (' + (realRoom ? realRoom.name : 'NONE') + ') → lens lights a real unit');

// B3 — resolveGuid gate: real guid resolves true, fabricated guid resolves false (honest un-linked).
ok('B3-gate', B.resolveGuid(leaseGuid, FX) === true && B.resolveGuid(FAKE, FX) === false,
  'resolveGuid: real guid → linked, fabricated guid → un-linked (never a faked binding)');

// B4 — bindRecords: a fabricated lease is honestly flagged unlinked, the real one linked.
var bound = B.bindRecords([{ lease_no: 'L-0001', unit_guid: leaseGuid }, { lease_no: 'L-FAKE', unit_guid: FAKE }], FX);
ok('B4-honest-unlinked', bound[0].linked === true && bound[0].status === 'linked'
  && bound[1].linked === false && bound[1].status === 'unlinked',
  'bindRecords flags real lease linked + fabricated lease un-linked (honest, no fabrication)');

// B5 — overlay non-invent gate: a fabricated-guid lease is NOT tinted; only real-guid units light.
//   Inject a fake-guid lease, then gate the overlay by the real room set → fake stays unlinked.
var saved = M.MODELS.Tenancy.records.slice();
M.MODELS.Tenancy.records = saved.concat([{ lease_no: 'L-FAKE', unit_guid: FAKE, tenant: 'BP-X', rent: 1, term_start: '2026-01', term_end: '2026-12' }]);
var realN = saved.length;                                                       // real leases (all resolve in FX)
var planUngated = O.computeOverlay('tenancy', '2026-06');                       // legacy path: tints everything
var planGated = O.computeOverlay('tenancy', '2026-06', { knownGuids: FX });     // gated: only real units tint
M.MODELS.Tenancy.records = saved;                                              // restore (zero residue)
ok('B5-gate-tints-real-only', planUngated.linked.length === realN + 1
  && planGated.linked.length === realN && planGated.linked.indexOf(leaseGuid) >= 0
  && planGated.unlinked.indexOf(FAKE) >= 0,
  'gated overlay tints ONLY the real-guid units (' + realN + ' of ' + (realN + 1) + '); the fabricated guid is honestly un-linked, never tinted');

// B6 — enrich pulls REAL room meta (name + occupancy from rel_contained_in_space) — extracted, not invented.
var enriched = B.enrich(B.bindRecords([{ lease_no: 'L-0001', unit_guid: leaseGuid }], FX), FX)[0];
ok('B6-real-occupancy', enriched.room && enriched.room.name === realRoom.name
  && typeof enriched.room.contained === 'number' && enriched.room.center.length === 3,
  'bound unit carries REAL room name + centre + occupancy=' + (enriched.room ? enriched.room.contained : '?') + ' (from rel_contained_in_space) — extracted');

// B7 — connector seam delegates to the same gate (the real impl swaps in APP.guidMap; stub uses the fixture).
ok('B7-connector-seam', C.resolveGuid(leaseGuid, FX) === true && C.resolveGuid(FAKE, FX) === false,
  'Connectors.resolveGuid (the MeshPort seam) gates by the same join — swap fixture→APP.guidMap to go live');

// B8 — REAL viewer orientation: APP.guidMap is meshId→guid (guids are VALUES; instanced keys carry `_N`).
//   meshIdForGuid scans VALUES and returns the mesh-id handle; the gate reads values, not keys.
var guidMap = { '4012': leaseGuid, '4013': 'RM_Level_1_2', '4014_0': 'RM_Level_2_1', '4014_1': 'RM_Level_2_1' };
ok('B8-guidmap-reverse', B.meshIdForGuid(leaseGuid, guidMap) === '4012' && B.meshIdForGuid(FAKE, guidMap) === null
  && B.resolveGuid(leaseGuid, guidMap) === true && B.resolveGuid(FAKE, guidMap) === false,
  'APP.guidMap reverse lookup: real guid → mesh-id "4012", fabricated guid → null (handles instanced `_N` keys)');

// B9 — connector seam over a real-shaped guidMap returns the MESH-ID handle (browser tint/zoom target), not bool.
ok('B9-seam-meshid', C.resolveGuid(leaseGuid, guidMap) === '4012' && C.resolveGuid(FAKE, guidMap) === null,
  'Connectors.resolveGuid over APP.guidMap → returns mesh-id handle (real) / null (un-linked) — the live MeshPort hook');

// B10 — real storey derivation (kills the 'S?' stub): bind storeys from the fixture, then the demo lease's
//   row carries the REAL storey of its bound room (Level N), not a placeholder. Unknown guid → honest 'S?'.
L.bindStoreys(FX.rooms);
var realStorey = realRoom.storey;
var trow = L.tenancyRows('2026-06')[0];
ok('B10-real-storey', realStorey && trow.storey === realStorey && L.deriveStorey('NO-SUCH-GUID') === 'S?',
  'deriveStorey is real: lease unit → "' + trow.storey + '" (from IfcBuildingStorey), unknown guid → honest S?');

// B11 — density dots group by REAL storey: an occupied lease on a real storey produces a density entry keyed
//   by that storey (non-invent — count from records, storey from the model).
var dens = L.densityPlan(L.tenancyRows('2026-06'));
ok('B11-density-real-storey', dens.length >= 1 && dens.some(function (d) { return d.storey === realStorey && d.count >= 1; }),
  'population-density dot keyed by the real storey "' + realStorey + '" (count from leases, storey from the model)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-BIND ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);

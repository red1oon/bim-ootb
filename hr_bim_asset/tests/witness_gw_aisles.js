// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-GW-AISLES witness (§AISLE-ZONES — P3, GardenWorld sample, 2026-07-01).
//   GardenWorld is a WAREHOUSE: it has NO IfcSpace rooms and NO rel_contained_in_space (verified: tables are
//   elements_meta/element_instances/element_transforms only). The room-centric HBA lens would show nothing. Per
//   the user's choice ("aisles as zones"), the viewer falls back to AISLE-as-ZONE: the real `storey` grouping
//   (SITE/AISLE_A/B/C) becomes the zone, members = the element guids in that aisle (all real, extracted). This
//   test runs that binding over the EXTRACTED GW fixture (fixtures/gw_aisles.json) + drives the enriched seeds,
//   asserting: aisle-zones resolve, the lens would paint each aisle, the seeds populate a mix, and non-invent
//   holds (an unknown aisle paints nothing). It TELLS us GW is a usable HBA sample. Run:
//     node hr_bim_asset/tests/witness_gw_aisles.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-GW ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var fs = require('fs'), path = require('path');
var B = require('../binding'), Oc = require('../occupancy'), At = require('../attendance'), Rq = require('../request');
var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'gw_aisles.json'), 'utf8'));

// Simulate the viewer APP.guidMap (meshId→rendered element guid) from the extracted rendered set.
var rendered = FX.renderedGuids;
var guidMap = {}; rendered.forEach(function (g, i) { guidMap[String(20000 + i)] = g; });
var aisleMembers = FX.aisleMembers;
var AISLES = FX.aisleZones;                                   // [AISLE_A, AISLE_B, AISLE_C]
var rooms = AISLES.map(function (a) { return { guid: a, storey: a }; });
var realSet = new Set(rendered);

// ---- G0 — provenance: GW really has no rooms; aisle-as-zone uses real guids only.
ok('G0-warehouse-no-rooms', AISLES.length === 3 && rendered.length === 26 && AISLES.every(function (a) { return realSet.has(a); }),
  'GardenWorld: ' + rendered.length + ' rendered elements, ' + AISLES.length + ' aisle-zones [' + AISLES.join(', ') + '], each aisle guid is a REAL rendered element (its floor slab) — non-invent');

// ---- G1 — every aisle-zone RESOLVES (the FM lenses light): each aisle is rendered (or has ≥1 rendered member).
var known = B.augmentKnown(guidMap, aisleMembers);
ok('G1-aisles-resolve', AISLES.every(function (a) { return known.has(a); }),
  'every aisle-zone resolves (augmentKnown): the FM pill + lenses light on a room-less warehouse');

// ---- G2 — zoneMeshGuids(aisle) returns the aisle's RENDERED representation to tint (slab + members, real only).
var paint = {}, allPaint = true;
AISLES.forEach(function (a) {
  var g = B.zoneMeshGuids(a, guidMap, aisleMembers);
  paint[a] = g.length;
  if (!(g.length >= 1 && g.every(function (x) { return realSet.has(x); }))) allPaint = false;
});
ok('G2-zone-paints', allPaint,
  'zoneMeshGuids(aisle) → real rendered guids to tint per aisle — counts ' + JSON.stringify(paint));

// ---- G3 — OCCUPANCY seed populates a MIX across the 3 aisle-zones (occupied/expiring/vacant by index cycle).
var occLog = Oc.demoSeed(rooms).log;
var PER = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
var pv = Oc.pivot(occLog, PER, { allResources: AISLES, storeyOf: function (r) { return r; } });
var states = {}; Object.keys(pv.byRoom).forEach(function (r) { PER.forEach(function (p) { states[pv.byRoom[r].cells[p]] = 1; }); });
ok('G3-occupancy-mix', pv.byStorey.length === 3 && Object.keys(states).length >= 2 && Oc.resources(occLog).every(function (z) { return realSet.has(z); }),
  '3 aisle-zones populate with a state mix ' + JSON.stringify(Object.keys(states)) + ' across ' + pv.byStorey.length + ' aisle-storeys (real guids only)');

// ---- G4 — PRESENCE + TICKETS also land on the aisles (the whole FM family works on GW).
var att = At.demoSeed(rooms, '2026-07').log;
var pres = At.presenceByZone(att, '2026-07').filter(function (x) { return x.headcount > 0; });
var reqLog = Rq.demoSeed(rooms, '2026-05-10T00:00:00Z', new Set(AISLES)).log;
var ag = Rq.aging(reqLog, '2026-05-10T00:00:00Z');
ok('G4-presence-tickets', pres.length >= 1 && pres.every(function (x) { return realSet.has(x.zone); }) && ag.openCount >= 1 && ag.open.every(function (t) { return AISLES.indexOf(t.resource) >= 0; }),
  'presence lights ' + pres.length + ' aisle(s) + ' + ag.openCount + ' tickets open on aisles — the FM family works on a warehouse');

// ---- G5 — NON-INVENT: an aisle NOT in the building resolves to nothing (no fabricated zone).
var ghost = B.zoneMeshGuids('AISLE_ZZ', guidMap, aisleMembers);
ok('G5-noninvent', ghost.length === 0 && !B.augmentKnown(guidMap, { 'AISLE_ZZ': ['NOT-RENDERED'] }).has('AISLE_ZZ'),
  'an aisle not in the model resolves to nothing + does not augment-resolve (never a fabricated zone)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-GW ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);

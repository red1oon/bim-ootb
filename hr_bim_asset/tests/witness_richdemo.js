// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-RICHDEMO witness (§RICH-DEMO — P2, the demo-data RICHNESS standard, 2026-07-01).
//   The user flagged the demo as SPARSE: the old occupancy/attendance seeds hard-coded only g[0..4], so on HHS
//   (14 rooms across 3 storeys) ONLY Level 1 populated and the lenses/dashboard looked empty ("8 rooms / 38% /
//   3 tickets", "no data"). ACCEPTANCE BAR: multiple storeys populated; occupancy a real MIX (occupied/expiring/
//   vacant/unavailable); presence varied headcounts across storeys. This test runs the enriched demoSeed over the
//   REAL HHS room fixture (fixtures/hhs_rooms.json — 14 real guids, 3 storeys) and asserts the bar is met,
//   deterministically, with REAL guids only (non-invent). It TELLS us the demo presents richly — no eyeballing.
//   Run:  node hr_bim_asset/tests/witness_richdemo.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-RICHDEMO ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var fs = require('fs'), path = require('path');
var Oc = require('../occupancy'), At = require('../attendance'), Rq = require('../request'), B = require('../binding');
var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'hhs_rooms.json'), 'utf8'));
var G = FX.rooms.map(function (r) { return r.guid; });
var storeyOf = {}; FX.rooms.forEach(function (r) { storeyOf[r.guid] = r.storey; });
var STOREYS = Object.keys(FX.rooms.reduce(function (s, r) { s[r.storey] = 1; return s; }, {}));
var realSet = new Set(G);
var PERIODS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];

// ---- R0 — provenance: the fixture is the real multi-storey HHS building (the richness must land on THIS).
ok('R0-multistorey-building', G.length === 14 && STOREYS.length === 3,
  'fixture = the real HHS domain: ' + G.length + ' rooms across ' + STOREYS.length + ' storeys [' + STOREYS.join(', ') + ']');

// ---- the enriched seeds ----------------------------------------------------------------------------------
var occLog = Oc.demoSeed(FX.rooms).log;
var pv = Oc.pivot(occLog, PERIODS, { allResources: G, storeyOf: function (r) { return storeyOf[r]; } });

// ---- R1 — EVERY storey is populated (occupancy utilization > 0 on each) — not just Level 1 (the old sparse bug).
var perStorey = {}; pv.byStorey.forEach(function (b) { perStorey[b.storey] = b.utilization; });
var allStoreysLit = STOREYS.every(function (s) { return (perStorey[s] || 0) > 0; });
ok('R1-all-storeys-populated', pv.byStorey.length === 3 && allStoreysLit,
  'occupancy populates ALL ' + pv.byStorey.length + ' storeys (utilization>0 each) — ' + JSON.stringify(perStorey) + ' (was: only Level 1)');

// ---- R2 — the occupancy MIX: ≥4 distinct states appear across the room×period matrix (the acceptance mix).
var states = {};
Object.keys(pv.byRoom).forEach(function (r) { var c = pv.byRoom[r].cells; PERIODS.forEach(function (p) { states[c[p]] = (states[c[p]] || 0) + 1; }); });
var distinct = Object.keys(states);
ok('R2-state-mix', ['occupied', 'expiring', 'vacant', 'unavailable'].every(function (s) { return states[s] > 0; }) && distinct.length >= 4,
  'occupancy shows the full MIX across the matrix: ' + JSON.stringify(states) + ' (occupied/expiring/vacant/unavailable all present)');

// ---- R3 — meaningful spread at a single period (2026-03): multiple occupied, multiple vacant, multiple unavailable.
var mar = pv.byPeriod['2026-03'];
ok('R3-period-spread', mar.occupied >= 3 && mar.vacant >= 2 && mar.unavailable >= 2 && (mar.occupied + mar.vacant + mar.unavailable + mar.expiring) === G.length,
  '2026-03 snapshot is a real operating mix: occupied=' + mar.occupied + ' expiring=' + mar.expiring + ' vacant=' + mar.vacant + ' unavailable=' + mar.unavailable + ' (Σ=' + G.length + ')');

// ---- R4 — PRESENCE varied: headcounts span ≥2 storeys with ≥3 distinct nonzero band values (not one zone).
var att = At.demoSeed(FX.rooms, '2026-07').log;
var pres = At.presenceByZone(att, '2026-07').filter(function (x) { return x.headcount > 0; });
var presStoreys = {}; pres.forEach(function (x) { presStoreys[storeyOf[x.zone]] = 1; });
var bands = Object.keys(pres.reduce(function (s, x) { s[x.headcount] = 1; return s; }, {}));
ok('R4-presence-varied', Object.keys(presStoreys).length >= 2 && bands.length >= 3 && pres.length >= 4,
  'presence spans ' + Object.keys(presStoreys).length + ' storeys, ' + pres.length + ' occupied zones, ' + bands.length + ' distinct headcount bands [' + bands.sort(function (a, b) { return a - b; }).join(',') + ']');

// ---- R5 — NON-INVENT: every populated occupancy/presence zone is a REAL fixture room guid (no fabricated rooms).
var occZones = Oc.resources(occLog), occReal = occZones.every(function (z) { return realSet.has(z); });
var presReal = pres.every(function (x) { return realSet.has(x.zone); });
ok('R5-noninvent-real-guids', occReal && presReal && occZones.length >= 8,
  'every populated zone is a REAL HHS room guid (' + occZones.length + ' occupancy zones, ' + pres.length + ' presence zones — none fabricated)');

// ---- R6 — DETERMINISTIC: same fixture → identical seed (the rich demo replays exactly, no Date.now/random).
ok('R6-deterministic', Oc.fingerprint(occLog, PERIODS, { allResources: G }) === Oc.fingerprint(Oc.demoSeed(FX.rooms).log, PERIODS, { allResources: G }),
  'the enriched seed is fully deterministic (re-seed → identical pivot fingerprint)');

// ---- R7 — TICKET-AGING: the request seed populates ALL 4 SLA buckets (<1d/1-3d/3-7d/>7d) — the dashboard's
//   doughnut was empty (Request log unseeded). Resource-gated to real rooms; deterministic; tickets stay OPEN.
var ASOF = '2026-05-10T00:00:00Z';
var known = B.augmentKnown(G, null);                          // G = real room guids → all resolve (no fabrication)
var reqLog = Rq.demoSeed(FX.rooms, ASOF, known).log;
var ag = Rq.aging(reqLog, ASOF);
var bucketsFilled = Object.keys(ag.buckets).filter(function (b) { return ag.buckets[b] > 0; }).length;
ok('R7-ticket-aging-buckets', ag.openCount >= 4 && bucketsFilled === 4 && ag.open.every(function (t) { return realSet.has(t.resource); }),
  'ticket-aging populates ALL 4 SLA buckets ' + JSON.stringify(ag.buckets) + ' (' + ag.openCount + ' open, all on real rooms) — dashboard doughnut now rich');

// ---- R8 — ticket NON-INVENT: a ticket on an un-located room is REFUSED (spatial gate, never fabricated).
var refusedLog = Rq.demoSeed([{ guid: 'RM_DOES_NOT_EXIST' }], ASOF, new Set(['SOME-REAL-GUID'])).log;
ok('R8-ticket-noninvent', refusedLog.length === 0,
  'a ticket whose room is not in the building is REFUSED (resource spatial gate) — no fabricated ticket');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-RICHDEMO ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);

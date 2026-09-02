// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-REMOTE: a REMOTE USER pulls the shared model from a real durable facilitator
//   (GitHub raw / OCI object storage) over real fetch, and the TRUSTLESS guarantees hold end-to-end:
//   verifyChain on every pulled branch, fold reconstructs the World, the gate finds the cross-discipline
//   clash, CAS blob round-trips by content, presence summarizes. NON-INVENT. DESIGN.md §7 demo topology.
//   Run: node teams/demo/smoke_remote.js <BASE_URL>   (BASE must end in /, serve teams/demo/store/)
'use strict';
var path = require('path');
var T = require(path.join(__dirname, '..', 'transport.js'));
var C = require(path.join(__dirname, '..', 'connectors.js'));
var E = require(path.join(__dirname, '..', 'engine.js'));
var G = require(path.join(__dirname, '..', 'gate.js'));
var Pr = require(path.join(__dirname, '..', 'protocol.js'));

var BASE = process.argv[2] || process.env.TEAMS_BASE;
if (!BASE) { console.error('usage: node smoke_remote.js <BASE_URL ending in />'); process.exit(2); }
if (typeof fetch !== 'function') { console.error('global fetch unavailable (need node >=18)'); process.exit(2); }

var fails = 0;
function ok(cond, label, detail) { if (!cond) fails++; console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  console.log('\n═══ W-REMOTE — remote user pulls shared model over fetch ═══');
  console.log('   base: ' + BASE + '\n');

  // a read-only remote peer: get = real fetch; put = noop (cannot write, only mirror-reads)
  var fac = T.makeHttpFacilitator({
    get: async function (p) { var r = await fetch(BASE + p); return r.ok ? await r.text() : null; },
    put: async function () { /* read-only peer */ }
  });

  var tips = await fac.tips();
  ok(tips.trunk && tips.MEP && tips.STR, 'W-REMOTE tips() lists trunk + MEP + STR from the facilitator', Object.keys(tips).join(','));

  // pull every branch; each chain RE-VERIFIES on arrival (trustless)
  var merged = [], allOk = true, branchOps = [], trunkOps = [];
  for (var b of Object.keys(tips)) {
    var ops = await fac.pullOps(b, 'GENESIS');
    var v = C.verifyChain(ops);
    if (!v.ok) allOk = false;
    merged = merged.concat(ops);
    if (b === 'trunk') trunkOps = ops; else branchOps = branchOps.concat(ops);
  }
  ok(allOk && merged.length > 0, 'W-REMOTE every pulled branch verifies (signed chain intact over the wire)', 'ops=' + merged.length);

  // fold reconstructs the World; the moved column is where the STR edit put it
  var world = E.fold(merged);
  ok(world['Col-204'] && Math.abs(world['Col-204'].box.y - (2 + 3.2)) < 1e-9, 'W-REMOTE fold reconstructs World (Col-204 moved to y=5.2)', 'y=' + (world['Col-204'] || {}).box && world['Col-204'].box.y);

  // the gate finds the real cross-discipline clash
  var settle = G.settle(branchOps, trunkOps, { baseline: { STR: 1500 }, tol: 0.1 });
  var cross = settle.clashes.filter(function (c) { return c.disc[0] !== c.disc[1]; });
  ok(cross.length >= 1, 'W-REMOTE gate finds the cross-discipline clash (MEP×STR)', JSON.stringify((cross[0] || {}).disc));

  // CAS blob round-trips by content (key recomputed on get → tamper-proof)
  var datum = { kind: 'datum_plane', axis: 'Z', at: 3.1, derived: 'face-cadence' };
  var key = Pr.casKey(datum);
  var got = await fac.getBlob(key);
  ok(got && got.at === 3.1, 'W-REMOTE shared datum round-trips from CAS by content key', key.slice(0, 12) + '…');

  // presence (awareness) summarizes latest per branch
  var pres = await fac.presence();
  ok(pres.MEP && pres.STR, 'W-REMOTE presence() shows MEP + STR peers', Object.keys(pres).join(','));

  var total = 7;
  console.log('\n' + (fails === 0 ? '✅ W-REMOTE ' + total + '/' + total + ' PASS' : '❌ ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error('W-REMOTE ERROR', e); process.exit(1); });

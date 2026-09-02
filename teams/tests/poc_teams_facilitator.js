// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-FACIL: the facilitator is a TRUSTLESS relay (DESIGN.md §7). Each assertion names
//   the property it proves. Runs node-only over the real engine + stub seam. NON-INVENT, deterministic
//   (fixed ts/ids). Run: node teams/tests/poc_teams_facilitator.js 2>&1 | tee teams/logs/facilitator.log
'use strict';
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));
var C = require(path.join(__dirname, '..', 'connectors.js'));
var F = require(path.join(__dirname, '..', 'facilitator.js'));

var fails = 0;
function ok(cond, label, detail) { if (!cond) fails++; console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function op(id, ts, branch, author, verb, target, params) {
  return { id: id, ts: ts, branch: branch, author: author, cls: E.GEOM, verb: verb, target: target, params: params || {} };
}
// build a signed branch log via the real engine (engine.append signs through the connector chain)
function buildLog(branchId, owner, ops) {
  var br = E.makeBranch(branchId, owner, 'ARC', 'walker', 'GENESIS'), log = [];
  ops.forEach(function (o) { var r = E.append(log, br, o); if (r.ok) log = r.log; });
  return log;
}

console.log('\n═══ W-FACIL — trustless relay: store-and-forward · CAS · presence · converge ═══\n');

var T = 1000;
var arc = buildLog('arc', 'ana', [
  op('a1', T + 1, 'arc', 'ana', 'INSERT', 'Wall-N', { box: { x: 0, y: 0, z: 0, w: 10, d: 0.25, h: 3 }, disc: 'ARC', cost: 0 }),
  op('a2', T + 2, 'arc', 'ana', 'INSERT', 'Wall-E', { box: { x: 0, y: 0, z: 0, w: 0.25, d: 8, h: 3 }, disc: 'ARC', cost: 0 }),
  op('a3', T + 3, 'arc', 'ana', 'MOVE',   'Wall-E', { dx: 0.1 })
]);
var mep = buildLog('mep', 'milo', [
  op('m1', T + 4, 'mep', 'milo', 'INSERT', 'Duct-1', { box: { x: 1, y: 1, z: 2.4, w: 8, d: 0.5, h: 0.5 }, disc: 'MEP', cost: 800 })
]);

// ── 1. RELAY preserves the chain (verifyChain ok + fold identical on a fresh peer) ──
var hub = F.makeFacilitator();
var pushA = hub.pushOps('arc', arc);
ok(pushA.accepted === 3 && pushA.rejected.length === 0, 'W-FACIL-RELAY push accepted all', 'accepted=' + pushA.accepted);
var pulled = hub.pullOps('arc', 'GENESIS');
ok(C.verifyChain(pulled).ok, 'W-FACIL-RELAY pulled chain verifies (untampered in transit)');
ok(eq(E.fold(pulled), E.fold(arc)), 'W-FACIL-RELAY fold(pulled) === fold(original) — World survives relay');

// ── 2. INCREMENTAL pull (only ops after a known tip) ──
var afterFirst = hub.pullOps('arc', arc[0].op_hash);
ok(afterFirst.length === 2 && afterFirst[0].id === 'a2', 'W-FACIL-PULL incremental returns ops after sinceHash', 'n=' + afterFirst.length);

// ── 3. TAMPER rejected on push (forged param breaks the chain) ──
var tampered = arc.map(function (o) { return Object.assign({}, o, { params: Object.assign({}, o.params) }); });
tampered[1].params.box = Object.assign({}, tampered[1].params.box, { x: 99 });   // amend after signing
var hub2 = F.makeFacilitator();
var bad = hub2.pushOps('arc', tampered);
ok(bad.accepted === 0 && bad.rejected.length === 1, 'W-FACIL-TAMPER push rejected', 'why=' + (bad.rejected[0] || {}).why);
ok((bad.rejected[0] || {}).why === 'op_hash', 'W-FACIL-TAMPER reason = broken op_hash');
ok(eq(hub2.tips(), {}), 'W-FACIL-TAMPER nothing stored from a rejected push');

// ── 4. NO HISTORY REWRITE (must extend the stored prefix) ──
var divergent = buildLog('arc', 'ana', [
  op('a1', T + 1, 'arc', 'ana', 'INSERT', 'Wall-N', { box: { x: 0, y: 0, z: 0, w: 10, d: 0.25, h: 3 }, disc: 'ARC', cost: 0 }),
  op('x2', T + 2, 'arc', 'ana', 'INSERT', 'Wall-X', { box: { x: 5, y: 0, z: 0, w: 1, d: 1, h: 1 }, disc: 'ARC', cost: 0 })
]);
var rw = hub.pushOps('arc', divergent);
ok(rw.accepted === 0 && (rw.rejected[0] || {}).why === 'rewrite', 'W-FACIL-NOREWRITE divergent push rejected');
var shorter = hub.pushOps('arc', arc.slice(0, 1));
ok(shorter.accepted === 0 && (shorter.rejected[0] || {}).why === 'rewrite', 'W-FACIL-NOREWRITE shorter push rejected (no orphaning)');
ok(eq(hub.tips().arc, arc[2].op_hash), 'W-FACIL-NOREWRITE stored tip unchanged');

// ── 5. EXTEND + REPLAY idempotent ──
var arc4 = buildLog('arc', 'ana', [
  op('a1', T + 1, 'arc', 'ana', 'INSERT', 'Wall-N', { box: { x: 0, y: 0, z: 0, w: 10, d: 0.25, h: 3 }, disc: 'ARC', cost: 0 }),
  op('a2', T + 2, 'arc', 'ana', 'INSERT', 'Wall-E', { box: { x: 0, y: 0, z: 0, w: 0.25, d: 8, h: 3 }, disc: 'ARC', cost: 0 }),
  op('a3', T + 3, 'arc', 'ana', 'MOVE',   'Wall-E', { dx: 0.1 }),
  op('a4', T + 5, 'arc', 'ana', 'SIZE',   'Wall-N', { h: 3.2 })
]);
var ext = hub.pushOps('arc', arc4);
ok(ext.accepted === 1, 'W-FACIL-EXTEND appends only the new op', 'accepted=' + ext.accepted);
var replay = hub.pushOps('arc', arc4);
ok(replay.accepted === 0 && eq(hub.tips().arc, arc4[3].op_hash), 'W-FACIL-REPLAY re-push is idempotent (tip unchanged)');

// ── 6. CAS blob store (content-addressed, dedup, tamper-evident) ──
var datum = { kind: 'datum_plane', axis: 'Z', at: 3.1, derived: 'face-cadence' };
var k1 = hub.putBlob(datum), k2 = hub.putBlob({ at: 3.1, axis: 'Z', kind: 'datum_plane', derived: 'face-cadence' }); // key-order shuffled
ok(k1 === k2, 'W-FACIL-CAS identical content → identical key (order-independent)');
ok(eq(hub.getBlob(k1), datum), 'W-FACIL-CAS getBlob round-trips');
var kT = hub.putBlob({ kind: 'datum_plane', axis: 'Z', at: 3.2, derived: 'face-cadence' });
ok(kT !== k1, 'W-FACIL-CAS tampered datum → different key');
ok(hub.getBlob('deadbeef') === undefined, 'W-FACIL-CAS unknown key → undefined');

// ── 7. PRESENCE broker (latest heartbeat per branch; awareness only) ──
var P = require(path.join(__dirname, '..', 'protocol.js'));
hub.announce(P.makeHeartbeat({ branch: 'arc', author: 'ana',  tipHash: 'h1', scope: 'ARC', ts: T + 10 }));
hub.announce(P.makeHeartbeat({ branch: 'arc', author: 'ana',  tipHash: 'h2', scope: 'ARC', ts: T + 20 }));
hub.announce(P.makeHeartbeat({ branch: 'mep', author: 'milo', tipHash: 'm1', scope: 'MEP', ts: T + 15 }));
var pres = hub.presence();
ok(pres.arc && pres.arc.tip === 'h2' && pres.mep && pres.mep.tip === 'm1', 'W-FACIL-PRESENCE latest per branch', 'arc.tip=' + pres.arc.tip);

// ── 8. CONVERGENCE despite arrival ORDER (trustless guarantee) ──
var n1 = F.makeFacilitator(), n2 = F.makeFacilitator();
n1.pushOps('arc', arc); n1.pushOps('mep', mep);     // order: arc then mep
n2.pushOps('mep', mep); n2.pushOps('arc', arc);     // order: mep then arc
ok(eq(n1.tips(), n2.tips()), 'W-FACIL-CONVERGE tips() identical regardless of push order');
var union1 = n1.pullOps('arc', 'GENESIS').concat(n1.pullOps('mep', 'GENESIS'));
var union2 = n2.pullOps('mep', 'GENESIS').concat(n2.pullOps('arc', 'GENESIS'));
ok(eq(E.fold(union1), E.fold(union2)), 'W-FACIL-CONVERGE fold(union) order-independent (total order = (ts,id))');

var total = 18;
console.log('\n' + (fails === 0 ? '✅ W-FACIL ' + total + '/' + total + ' PASS' : '❌ ' + fails + ' FAIL') + '\n');
process.exit(fails === 0 ? 0 : 1);

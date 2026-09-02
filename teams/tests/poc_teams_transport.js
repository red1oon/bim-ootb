// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TRANSPORT: the HTTP facilitator is a TRUSTLESS Tier-2 relay (DESIGN.md §7). Each
//   assertion names the property it proves. Runs node-only over the real engine + a MOCK in-memory
//   transport (no network). NON-INVENT, deterministic (fixed ts/ids). Methods are async → awaited.
//   Run: node teams/tests/poc_teams_transport.js 2>&1 | tee teams/logs/transport.log  — read the log.
'use strict';
var path = require('path');
var E  = require(path.join(__dirname, '..', 'engine.js'));
var C  = require(path.join(__dirname, '..', 'connectors.js'));
var P  = require(path.join(__dirname, '..', 'protocol.js'));
var TR = require(path.join(__dirname, '..', 'transport.js'));

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

// ── MOCK transport: an in-memory {path:body} map. get/put resolve immediately (no network). This is
//    the ONLY substitution — live get=fetch(raw GH/OCI), live put=GH API/OCI object put (see transport.js
//    header). The trustless guarantees ride entirely on the engine crypto, not on the transport.
function mockTransport() {
  var store = {};
  return {
    store: store,
    get: function (p) { return Promise.resolve(Object.prototype.hasOwnProperty.call(store, p) ? store[p] : null); },
    put: function (p, body /*, contentType */) { store[p] = body; return Promise.resolve(); }
  };
}

async function main() {
  console.log('\n═══ W-TRANSPORT — HTTP facilitator over a mock transport: round-trip · tamper · rewrite · CAS · presence ═══\n');

  var T = 1000;
  var arc = buildLog('arc', 'ana', [
    op('a1', T + 1, 'arc', 'ana', 'INSERT', 'Wall-N', { box: { x: 0, y: 0, z: 0, w: 10, d: 0.25, h: 3 }, disc: 'ARC', cost: 0 }),
    op('a2', T + 2, 'arc', 'ana', 'INSERT', 'Wall-E', { box: { x: 0, y: 0, z: 0, w: 0.25, d: 8, h: 3 }, disc: 'ARC', cost: 0 }),
    op('a3', T + 3, 'arc', 'ana', 'MOVE',   'Wall-E', { dx: 0.1 })
  ]);
  var mep = buildLog('mep', 'milo', [
    op('m1', T + 4, 'mep', 'milo', 'INSERT', 'Duct-1', { box: { x: 1, y: 1, z: 2.4, w: 8, d: 0.5, h: 0.5 }, disc: 'MEP', cost: 800 })
  ]);

  // ── 1. ROUND-TRIP through the transport (push → pull; chain verifies; fold survives the wire) ──
  var mt = mockTransport();
  var hub = TR.makeHttpFacilitator(mt);
  var pushA = await hub.pushOps('arc', arc);
  ok(pushA.accepted === 3 && pushA.rejected.length === 0, 'W-TRANSPORT-RTT push accepted all', 'accepted=' + pushA.accepted);
  ok(Object.prototype.hasOwnProperty.call(mt.store, 'branches/arc.log.json'), 'W-TRANSPORT-RTT log persisted at documented path');
  var pulled = await hub.pullOps('arc', 'GENESIS');
  ok(C.verifyChain(pulled).ok, 'W-TRANSPORT-RTT pulled chain verifies (untampered over the wire)');
  ok(eq(E.fold(pulled), E.fold(arc)), 'W-TRANSPORT-RTT fold(pulled) === fold(original) — World survives transport');

  // ── 2. INCREMENTAL pull honors sinceHash (only ops after a known tip) ──
  var afterFirst = await hub.pullOps('arc', arc[0].op_hash);
  ok(afterFirst.length === 2 && afterFirst[0].id === 'a2', 'W-TRANSPORT-SINCE incremental returns ops after sinceHash', 'n=' + afterFirst.length);

  // ── 3. TAMPER in the STORED log is REJECTED on pull (verifyChain), not silently served ──
  var mt2 = mockTransport();
  var hub2 = TR.makeHttpFacilitator(mt2);
  await hub2.pushOps('arc', arc);
  var stored = JSON.parse(mt2.store['branches/arc.log.json']);
  stored[1].params.box.x = 99;                                   // amend a param AFTER it was signed
  mt2.store['branches/arc.log.json'] = JSON.stringify(stored);   // poison the doc on the relay
  var poisoned = await hub2.pullOps('arc', 'GENESIS');
  ok(poisoned.length === 0, 'W-TRANSPORT-TAMPER tampered stored log REJECTED on pull (returns [], not served)', 'n=' + poisoned.length);
  ok(!C.verifyChain(stored).ok && C.verifyChain(stored).why === 'op_hash', 'W-TRANSPORT-TAMPER reason = broken op_hash');

  // ── 4. NO HISTORY REWRITE (a divergent OR shorter push is rejected; stored tip unchanged) ──
  await hub.pushOps('arc', arc); // ensure baseline (idempotent)
  var divergent = buildLog('arc', 'ana', [
    op('a1', T + 1, 'arc', 'ana', 'INSERT', 'Wall-N', { box: { x: 0, y: 0, z: 0, w: 10, d: 0.25, h: 3 }, disc: 'ARC', cost: 0 }),
    op('x2', T + 2, 'arc', 'ana', 'INSERT', 'Wall-X', { box: { x: 5, y: 0, z: 0, w: 1, d: 1, h: 1 }, disc: 'ARC', cost: 0 })
  ]);
  var rw = await hub.pushOps('arc', divergent);
  ok(rw.accepted === 0 && (rw.rejected[0] || {}).why === 'rewrite', 'W-TRANSPORT-NOREWRITE divergent push rejected');
  var shorter = await hub.pushOps('arc', arc.slice(0, 1));
  ok(shorter.accepted === 0 && (shorter.rejected[0] || {}).why === 'rewrite', 'W-TRANSPORT-NOREWRITE shorter push rejected (no orphaning)');
  var tipsNow = await hub.tips();
  ok(eq(tipsNow.arc, arc[2].op_hash), 'W-TRANSPORT-NOREWRITE stored tip unchanged after rejected pushes');

  // ── 5. EXTEND + REPLAY idempotent (append only the new op; re-push accepts 0) ──
  var arc4 = buildLog('arc', 'ana', [
    op('a1', T + 1, 'arc', 'ana', 'INSERT', 'Wall-N', { box: { x: 0, y: 0, z: 0, w: 10, d: 0.25, h: 3 }, disc: 'ARC', cost: 0 }),
    op('a2', T + 2, 'arc', 'ana', 'INSERT', 'Wall-E', { box: { x: 0, y: 0, z: 0, w: 0.25, d: 8, h: 3 }, disc: 'ARC', cost: 0 }),
    op('a3', T + 3, 'arc', 'ana', 'MOVE',   'Wall-E', { dx: 0.1 }),
    op('a4', T + 5, 'arc', 'ana', 'SIZE',   'Wall-N', { h: 3.2 })
  ]);
  var ext = await hub.pushOps('arc', arc4);
  ok(ext.accepted === 1, 'W-TRANSPORT-EXTEND appends only the new op', 'accepted=' + ext.accepted);
  var replay = await hub.pushOps('arc', arc4);
  var tipsR = await hub.tips();
  ok(replay.accepted === 0 && eq(tipsR.arc, arc4[3].op_hash), 'W-TRANSPORT-REPLAY re-push idempotent (tip unchanged)');

  // ── 6. CAS blob store over the transport (dedup · round-trip · content-addressing check) ──
  var datum = { kind: 'datum_plane', axis: 'Z', at: 3.1, derived: 'face-cadence' };
  var k1 = await hub.putBlob(datum);
  var k2 = await hub.putBlob({ at: 3.1, axis: 'Z', kind: 'datum_plane', derived: 'face-cadence' }); // key-order shuffled
  ok(k1 === k2, 'W-TRANSPORT-CAS identical content → identical key (order-independent)');
  var writesBefore = Object.keys(mt.store).length;
  await hub.putBlob(datum);                                       // dedup: no new write
  ok(Object.keys(mt.store).length === writesBefore, 'W-TRANSPORT-CAS dedup — re-put writes nothing new');
  ok(eq(await hub.getBlob(k1), datum), 'W-TRANSPORT-CAS getBlob round-trips');
  ok((await hub.getBlob('deadbeef')) === null, 'W-TRANSPORT-CAS unknown key → null');
  // corrupt the stored blob so its content no longer hashes to its key → MUST be rejected on get
  mt.store['cas/' + k1 + '.json'] = JSON.stringify({ kind: 'datum_plane', axis: 'Z', at: 9.9, derived: 'TAMPERED' });
  ok((await hub.getBlob(k1)) === null, 'W-TRANSPORT-CAS corrupted blob (key≠content) REJECTED on get (content-addressing)');

  // ── 7. PRESENCE broker over the transport (latest heartbeat per branch; awareness only) ──
  var mp = mockTransport();
  var hubP = TR.makeHttpFacilitator(mp);
  await hubP.announce(P.makeHeartbeat({ branch: 'arc', author: 'ana',  tipHash: 'h1', scope: 'ARC', ts: T + 10 }));
  await hubP.announce(P.makeHeartbeat({ branch: 'arc', author: 'ana',  tipHash: 'h2', scope: 'ARC', ts: T + 20 }));
  await hubP.announce(P.makeHeartbeat({ branch: 'mep', author: 'milo', tipHash: 'm1', scope: 'MEP', ts: T + 15 }));
  var pres = await hubP.presence();
  ok(pres.arc && pres.arc.tip === 'h2' && pres.mep && pres.mep.tip === 'm1', 'W-TRANSPORT-PRESENCE latest per branch', 'arc.tip=' + (pres.arc || {}).tip);

  // ── 8. CONVERGENCE despite arrival ORDER (two relays, opposite push order → identical tips/fold) ──
  var n1 = TR.makeHttpFacilitator(mockTransport()), n2 = TR.makeHttpFacilitator(mockTransport());
  await n1.pushOps('arc', arc); await n1.pushOps('mep', mep);     // order: arc then mep
  await n2.pushOps('mep', mep); await n2.pushOps('arc', arc);     // order: mep then arc
  ok(eq(await n1.tips(), await n2.tips()), 'W-TRANSPORT-CONVERGE tips() identical regardless of push order');
  var u1 = (await n1.pullOps('arc', 'GENESIS')).concat(await n1.pullOps('mep', 'GENESIS'));
  var u2 = (await n2.pullOps('mep', 'GENESIS')).concat(await n2.pullOps('arc', 'GENESIS'));
  ok(eq(E.fold(u1), E.fold(u2)), 'W-TRANSPORT-CONVERGE fold(union) order-independent (total order = (ts,id))');

  var total = 18;
  console.log('\n' + (fails === 0 ? '✅ W-TRANSPORT ' + total + '/' + total + ' PASS' : '❌ ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(function (e) { console.error('❌ W-TRANSPORT threw', e); process.exit(1); });

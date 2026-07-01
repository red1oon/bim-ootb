// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — WITNESS W-CONN-LIVE for connectors_live.js. Proves: (1) with NO host the live
//   connector === the stub byte-for-byte; (2) with a fake host the live bindings are routed VERBATIM
//   (no fabrication); (3) bus/ops feature-detect and deliver. Node-only, fixed timestamps, no git.
//   prompts/RESUME_DISTRIBUTED_BRANCHES.md §isolation. Read the log after every run.
'use strict';
var Stub = require('../connectors');
var Live = require('../connectors_live');           // default export = stub-equivalent in node
var makeConnectors = Live.makeConnectors;

var PASS = 0, FAIL = 0;
function ok(cond, name) { if (cond) { PASS++; console.log('  ✓ ' + name); } else { FAIL++; console.log('  ✗ ' + name); } }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function chainSign(C, ops) { var prev = 'GENESIS'; for (var i = 0; i < ops.length; i++) { C.sign(ops[i], prev); prev = ops[i].op_hash; } return ops; }

// fixed-timestamp op log (proves: deterministic — no Date.now)
function sampleOps() {
  return [
    { id: 'op1', ts: 1000, branch: 'trunk', author: 'arc', cls: 'geom', verb: 'INSERT', target: 'g1', params: { box: { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }, disc: 'ARC', cost: 10 } },
    { id: 'op2', ts: 1001, branch: 'walkerA', author: 'mep', cls: 'geom', verb: 'INSERT', target: 'g2', params: { box: { x: 0.5, y: 0, z: 0, w: 1, d: 1, h: 1 }, disc: 'MEP', cost: 5 } },
    { id: 'op3', ts: 1002, branch: 'walkerA', author: 'mep', cls: 'annot', verb: 'NOTE', target: 'g2', params: { msg: 'check clash' } }
  ];
}
// a 2-element CLASHing world (cross-discipline AABB overlap → exactly 1 clash)
function clashWorld() {
  return {
    g1: { box: { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }, disc: 'ARC', cost: 10 },
    g2: { box: { x: 0.5, y: 0, z: 0, w: 1, d: 1, h: 1 }, disc: 'MEP', cost: 5 }
  };
}

console.log('\n# W-CONN-LIVE — connectors_live.js feature-detect/fallback witness\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1) ISSUE: does the NO-host live connector behave IDENTICALLY to the stub?
//    (if fallback drifts from the stub, "go live by swapping the seam" is a lie)
console.log('§1 W-CONN-LIVE fallback==stub (no host)');
var noHost = makeConnectors();   // node, no globals → must be pure stub

// 1a sign + verifyChain round-trip → identical hashes/sigs + both verify ok
var opsStub = chainSign(Stub, sampleOps());
var opsLive = chainSign(noHost, sampleOps());
ok(eq(opsStub.map(function (o) { return [o.op_hash, o.sig, o.prev_hash]; }),
      opsLive.map(function (o) { return [o.op_hash, o.sig, o.prev_hash]; })),
   '1a sign chain hashes/sigs identical to stub');
ok(eq(Stub.verifyChain(opsStub), noHost.verifyChain(opsLive)) && noHost.verifyChain(opsLive).ok === true,
   '1a verifyChain identical + ok (tamper-free round-trip)');
// tamper detection still works through the fallback
var tampered = clone(opsLive); tampered[1].params.box.x = 9.9;
ok(noHost.verifyChain(tampered).ok === false, '1a tamper breaks chain (op_hash) via fallback');

// 1b evaluateGate on a clashing world → identical clash result
ok(eq(Stub.evaluateGate(clashWorld(), { margin: 0 }), noHost.evaluateGate(clashWorld(), { margin: 0 })) &&
   noHost.evaluateGate(clashWorld(), { margin: 0 }).clashes.length === 1,
   '1b evaluateGate identical to stub (1 cross-disc clash)');

// 1c foldCost → identical
ok(Stub.foldCost(clashWorld()) === noHost.foldCost(clashWorld()) && noHost.foldCost(clashWorld()) === 15,
   '1c foldCost identical to stub (15)');

// 1d _bindings ALL stub + _util shared + _isStub
ok(eq(noHost._bindings, { evaluateGate: 'stub', foldCost: 'stub', sign: 'stub', subscribeOps: 'stub', bus: 'stub' }),
   '1d _bindings all === "stub"');
ok(noHost._util === Stub._util, '1d _util pulled from stub (not re-implemented)');
ok(noHost._isStub === true && Live._isStub === true, '1d _isStub true (default export === stub behavior)');

// ─────────────────────────────────────────────────────────────────────────────
// 2) ISSUE: when a live binding EXISTS, is it routed VERBATIM (never fabricated)?
console.log('\n§2 W-CONN-LIVE routes-live (fake host)');
var GATE_SENTINEL = { clashes: [{ a: 'X', b: 'Y', disc: ['SENTINEL'] }], _src: 'live-gate' };
var COST_SENTINEL = 424242;
var SIGN_SENTINEL = { op_hash: 'LIVE_HASH', sig: 'LIVE_SIG', _src: 'live-ko' };
var VERIFY_SENTINEL = { ok: true, _src: 'live-verify' };
var seenGateArgs = null, seenSignArgs = null;
var fakeHost = {
  sdg_gate: { evaluate: function (world, opts) { seenGateArgs = { world: world, opts: opts }; return GATE_SENTINEL; } },
  rates:    { foldCost: function (world, branch) { return COST_SENTINEL; } },
  kernel_ops: {
    sign: function (op, prevHash) { seenSignArgs = { op: op, prevHash: prevHash }; return SIGN_SENTINEL; },
    verifyChain: function (ops) { return VERIFY_SENTINEL; }
  }
};
var liveConn = makeConnectors(fakeHost);

ok(liveConn.evaluateGate(clashWorld(), { margin: 0 }) === GATE_SENTINEL,
   '2a evaluateGate routes to host.sdg_gate.evaluate (returns sentinel, not a computed clash)');
ok(seenGateArgs && seenGateArgs.opts && seenGateArgs.opts.margin === 0,
   '2a world+opts forwarded verbatim to live gate');
ok(liveConn.foldCost(clashWorld()) === COST_SENTINEL && liveConn.foldCost(clashWorld()) !== 15,
   '2b foldCost routes to host.rates.foldCost (sentinel, NOT the stub sum 15)');
ok(liveConn.sign({ id: 'z', author: 'a' }, 'PREV') === SIGN_SENTINEL,
   '2c sign routes to host.kernel_ops.sign (sentinel sig, not fabricated)');
ok(seenSignArgs && seenSignArgs.prevHash === 'PREV', '2c prevHash forwarded verbatim to live sign');
ok(liveConn.verifyChain([]) === VERIFY_SENTINEL, '2c verifyChain routes to host.kernel_ops.verifyChain');
ok(eq(liveConn._bindings, { evaluateGate: 'live', foldCost: 'live', sign: 'live', subscribeOps: 'stub', bus: 'stub' }),
   '2d _bindings flip to "live" for bound methods (subscribeOps/bus still stub here)');
ok(liveConn._isStub === false, '2d _isStub false when any binding is live');

// ─────────────────────────────────────────────────────────────────────────────
// 3) ISSUE: do bus + op-stream feature-detect and actually DELIVER across the seam?
console.log('\n§3 W-CONN-LIVE bus+ops (fake event target + BroadcastChannel)');

// minimal EventTarget shim (the 'bonsai:oplog' rail)
function EvtTarget() { this._l = {}; }
EvtTarget.prototype.addEventListener = function (t, cb) { (this._l[t] = this._l[t] || []).push(cb); };
EvtTarget.prototype.removeEventListener = function (t, cb) { this._l[t] = (this._l[t] || []).filter(function (f) { return f !== cb; }); };
EvtTarget.prototype.dispatchEvent = function (e) { (this._l[e.type] || []).slice().forEach(function (cb) { cb(e); }); };

// minimal CustomEvent shim
function CE(type, init) { this.type = type; this.detail = init && init.detail; }

// minimal BroadcastChannel shim — same-name instances share a registry; sender does NOT echo to self
// (matches real BroadcastChannel semantics → forces a true 2-party cross-tab test)
var REG = {};
function BC(name) { this.name = name; this._l = []; (REG[name] = REG[name] || []).push(this); }
BC.prototype.addEventListener = function (t, cb) { if (t === 'message') this._l.push(cb); };
BC.prototype._deliver = function (m) { this._l.slice().forEach(function (cb) { cb({ data: m }); }); };
BC.prototype.postMessage = function (m) {
  var me = this; (REG[this.name] || []).forEach(function (ch) { if (ch !== me) ch._deliver(m); });
};

var evtHost = new EvtTarget();
evtHost.CustomEvent = CE;
evtHost.BroadcastChannel = BC;

// two connectors over the SAME host = two tabs on channel 'bim_teams'
var connA = makeConnectors(evtHost);
var connB = makeConnectors(evtHost);
ok(connA._bindings.bus === 'live' && connA._bindings.subscribeOps === 'live',
   '3a bus + subscribeOps feature-detected as live');

// bus.send (A) reaches bus.on (B)
var busGot = [];
connB.bus.on('pulse', function (m) { busGot.push(m); });
connB.bus.on('other', function (m) { busGot.push('WRONG'); });   // proves channel filtering
connA.bus.send('pulse', { hello: 'world' });
ok(busGot.length === 1 && eq(busGot[0], { hello: 'world' }),
   '3a bus.send(A) → bus.on(B) delivers (and filters by channel)');

// subscribeOps delivers an emitted op (CustomEvent detail)
var opsGot = [];
var off = connA.subscribeOps(function (op) { opsGot.push(op); });
var theOp = { id: 'live-op', ts: 2000, verb: 'MOVE', target: 'g7' };
connA.emitOp(theOp);
ok(opsGot.length === 1 && opsGot[0] === theOp, '3b subscribeOps delivers emitOp via "bonsai:oplog" CustomEvent');
off();
connA.emitOp({ id: 'after-unsub', ts: 2001 });
ok(opsGot.length === 1, '3b unsubscribe stops delivery (removeEventListener honored)');

// ─────────────────────────────────────────────────────────────────────────────
var total = PASS + FAIL;
console.log('');
if (FAIL === 0) console.log('✅ W-CONN-LIVE ' + PASS + '/' + total + ' PASS');
else { console.log('❌ W-CONN-LIVE ' + PASS + '/' + total + ' (' + FAIL + ' FAIL)'); process.exit(1); }

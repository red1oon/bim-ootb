// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-GOLIVE: the seam swap actually takes the ENGINE live (DESIGN.md §3). Proves that
//   upgrading connectors.js in place makes engine.append/gate.settle route to a live host, with ZERO
//   edits to engine/gate, and that node (no host) stays the deterministic stub. Each assertion names
//   the issue it proves. Run: node teams/tests/poc_teams_golive.js 2>&1 | tee teams/logs/golive.log
'use strict';
var path = require('path');
var P = function (m) { return path.join(__dirname, '..', m); };
var MODS = ['connectors.js', 'connectors_live.js', 'engine.js', 'gate.js', 'chatlog.js'];
function fresh() { MODS.forEach(function (m) { delete require.cache[require.resolve(P(m))]; }); }

var fails = 0;
function ok(cond, label, detail) { if (!cond) fails++; console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

// A FAKE modeller host with recognizable live bindings (sentinels prove routing, not fabrication).
var fakeHost = {
  sdg_gate: { evaluate: function (world, opts) { return { clashes: [{ a: 'LX', b: 'LY', disc: ['ARC', 'MEP'] }], _live: true }; } },
  rates:    { foldCost: function (world, branch) { return 4242; } },
  kernel_ops: {
    sign: function (op, prev) { op.prev_hash = prev || 'GENESIS'; op.op_hash = 'LIVE-' + op.id; op.sig = 'LIVESIG-' + op.author; return op; },
    verifyChain: function (ops) { for (var i = 0; i < ops.length; i++) if (String(ops[i].op_hash).slice(0, 5) !== 'LIVE-') return { ok: false, at: i, why: 'op_hash' }; return { ok: true }; }
  }
};

console.log('\n═══ W-GOLIVE — the seam swap takes the engine live; node stays stub ═══\n');

// ── A. LIVE: host present → connectors auto-upgrades on load → engine routes to it ──
global.window = fakeHost;
fresh();
var Cl = require(P('connectors.js'));
var El = require(P('engine.js'));
var Gl = require(P('gate.js'));
ok(Cl._bindings.sign === 'live' && Cl._bindings.verifyChain === 'live', 'W-GOLIVE auto-upgrade bound sign/verify live', JSON.stringify(Cl._bindings));
ok(Cl._bindings.evaluateGate === 'live' && Cl._bindings.foldCost === 'live', 'W-GOLIVE auto-upgrade bound gate/cost live');
ok(Cl._isStub === false, 'W-GOLIVE _isStub flips false when live');

var brL = El.makeBranch('arc', 'ana', 'ARC', 'walker', 'GENESIS');
var resL = El.append([], brL, { id: 'a1', ts: 10, branch: 'arc', author: 'ana', cls: El.GEOM, verb: 'INSERT', target: 'W1', params: { box: { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }, disc: 'ARC' } });
ok(resL.ok && resL.log[0].op_hash === 'LIVE-a1', 'W-GOLIVE engine.append signs via LIVE kernel_ops (no engine edit)', resL.log[0].op_hash);

var sL = Gl.settle(resL.log, [], { baseline: { ARC: 100 }, tol: 0.1 });
ok(sL.clashes.length === 1 && sL.clashes[0].a === 'LX', 'W-GOLIVE gate.settle uses LIVE sdg_gate.evaluate', JSON.stringify(sL.clashes[0]));
ok(sL.over && sL.over.ARC > 0.1, 'W-GOLIVE budget uses LIVE rates.foldCost (4242 over baseline 100)', 'over.ARC=' + (sL.over || {}).ARC);

// ── B. STUB: no host → fresh load stays the deterministic stub ──
delete global.window;
fresh();
var Cs = require(P('connectors.js'));
var Es = require(P('engine.js'));
ok(Cs._bindings.sign === 'stub' && Cs._bindings.evaluateGate === 'stub' && Cs._bindings.foldCost === 'stub', 'W-GOLIVE no host → all bindings stub', JSON.stringify(Cs._bindings));
ok(Cs._isStub === true, 'W-GOLIVE _isStub true when no host');
var brS = Es.makeBranch('arc', 'ana', 'ARC', 'walker', 'GENESIS');
var resS = Es.append([], brS, { id: 'b1', ts: 10, branch: 'arc', author: 'ana', cls: Es.GEOM, verb: 'INSERT', target: 'W1', params: { box: { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }, disc: 'ARC' } });
ok(resS.ok && resS.log[0].op_hash !== 'LIVE-b1' && /^[0-9a-f]{64}$/.test(resS.log[0].op_hash), 'W-GOLIVE engine.append signs via STUB sha256 chain when no host', resS.log[0].op_hash.slice(0, 12) + '…');

// ── C. CHANNEL INJECTION (S11) — the awareness bus binds to an injectable shared channel ──
//   Default 'bim_teams'; goLive(host,{channel}) / makeConnectors(host,{channel}) binds whatever channel the
//   live suite shares (e.g. ERP's 'bim_erp') — cross-product presence meets only on ONE channel. A recording
//   mock BroadcastChannel proves the REAL channel name used (routing, not fabrication).
function recBus() {
  var rec = { names: [], posts: [] };
  function BC(name) { rec.names.push(name); this.name = name;
    this.postMessage = function (m) { rec.posts.push({ name: name, m: m }); };
    this.addEventListener = function () {}; }
  return { BroadcastChannel: BC, _rec: rec };
}
delete global.window;
fresh();
var Cc = require(P('connectors.js'));
ok(Cc._channel === 'bim_teams', 'W-GOLIVE channel default = bim_teams (before goLive)', Cc._channel);
var h1 = recBus(); Cc.goLive(h1);                                      // no opts → default channel
ok(Cc._channel === 'bim_teams' && h1._rec.names[0] === 'bim_teams', 'W-GOLIVE goLive(host) opens the default bim_teams channel', h1._rec.names.join(','));
fresh();
var Cc2 = require(P('connectors.js'));
var h2 = recBus(); Cc2.goLive(h2, { channel: 'bim_erp' });            // INJECT the shared channel
ok(Cc2._channel === 'bim_erp' && h2._rec.names[0] === 'bim_erp', 'W-GOLIVE goLive(host,{channel}) binds the injected channel', h2._rec.names.join(','));
Cc2.bus.send('whatever', { hi: 1 });
ok(h2._rec.posts.length === 1 && h2._rec.posts[0].name === 'bim_erp', 'W-GOLIVE bus.send routes to the injected channel', h2._rec.posts[0] && h2._rec.posts[0].name);
fresh();
var CL = require(P('connectors_live.js'));
var h3 = recBus(); var connF = CL.makeConnectors(h3, { channel: 'suite_shared' });
ok(connF._channel === 'suite_shared' && h3._rec.names[0] === 'suite_shared', 'W-GOLIVE makeConnectors(host,{channel}) binds the injected channel (factory)', h3._rec.names.join(','));
ok(CL.makeConnectors()._channel === 'bim_teams', 'W-GOLIVE makeConnectors() defaults to bim_teams', CL.makeConnectors()._channel);

// restore clean module state for any later requirer
fresh();

var total = 15;
console.log('\n' + (fails === 0 ? '✅ W-GOLIVE ' + total + '/' + total + ' PASS' : '❌ ' + fails + ' FAIL') + '\n');
process.exit(fails === 0 ? 0 : 1);

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS LIVE CONNECTOR: feature-detects real modeller bindings at runtime and
//   binds to them, falling back to the EXACT connectors.js stub when a binding is ABSENT. Same public
//   surface as the stub + a `_bindings` report. NON-INVENT: a present live binding is routed VERBATIM;
//   an absent one delegates to the stub (no re-implemented crypto/gate/cost). Pure + deterministic
//   (no Date.now / Math.random). prompts/RESUME_DISTRIBUTED_BRANCHES.md §isolation. Read the log.
//
//   STUB → REAL mapping (each independently feature-detected):
//     evaluateGate         →  host.sdg_gate.evaluate        (§GATE-1)
//     foldCost             →  host.rates.foldCost           (§SE 5D rollup)
//     sign / verifyChain   →  host.kernel_ops.sign/verify(Chain)  (signed hash-chain)
//     subscribeOps/emitOp  →  host 'bonsai:oplog' CustomEvent
//     bus                  →  host.BroadcastChannel('bim_teams')  (Tier-1 awareness)
'use strict';
var Stub = (typeof require !== 'undefined') ? require('./connectors')
                                            : (typeof self !== 'undefined' ? self.TeamsConnectors : null);

// AUTO-detect the host global. NOTE: globalThis is intentionally OMITTED here — node exposes
// BroadcastChannel/crypto on globalThis, which would FALSE-bind the bus in a plain node process.
// A caller that wants those may pass `globalThis` explicitly; auto-detect stays browser-only so that
// `require('./connectors_live')` in node === pure stub behavior.
function detectHost() {
  if (typeof window !== 'undefined') return window;
  if (typeof self !== 'undefined') return self;
  return undefined;
}

function isFn(f) { return typeof f === 'function'; }

// Factory: returns a stub-surface object bound to whatever live modeller APIs `host` exposes.
function makeConnectors(host) {
  if (arguments.length === 0 || host === undefined) host = detectHost();

  var bindings = { evaluateGate: 'stub', foldCost: 'stub', sign: 'stub', subscribeOps: 'stub', bus: 'stub' };
  var conn = {}; // declared early so stub-fallback subs keep their OWN isolated _subs via `this`

  // ---- evaluateGate → sdg_gate.evaluate (else stub) -------------------------
  var liveGate = !!(host && host.sdg_gate && isFn(host.sdg_gate.evaluate));
  if (liveGate) bindings.evaluateGate = 'live';
  conn.evaluateGate = liveGate
    ? function (world, opts) { return host.sdg_gate.evaluate(world, opts); }
    : function (world, opts) { return Stub.evaluateGate(world, opts); };

  // ---- foldCost → rates.foldCost (else stub) -------------------------------
  // Only `rates.foldCost` is treated as live — a bare RATES table without a fold fn cannot be routed
  // VERBATIM, and synthesizing one would fabricate cost (NON-INVENT), so it falls back to the stub.
  var liveCost = !!(host && host.rates && isFn(host.rates.foldCost));
  if (liveCost) bindings.foldCost = 'live';
  conn.foldCost = liveCost
    ? function (world, branch) { return host.rates.foldCost(world, branch); }
    : function (world, branch) { return Stub.foldCost(world, branch); };

  // ---- sign / verifyChain → kernel_ops (else stub) ------------------------
  // Coupled: a live signature MUST be live-verified, so BOTH are required for the live route.
  var ko = host && host.kernel_ops;
  var koVerify = ko && (ko.verifyChain || ko.verify);
  var liveSign = !!(ko && isFn(ko.sign) && isFn(koVerify));
  if (liveSign) bindings.sign = 'live';
  conn.sign = liveSign
    ? function (op, prevHash) { return ko.sign(op, prevHash); }
    : function (op, prevHash) { return Stub.sign(op, prevHash); };
  conn.verifyChain = liveSign
    ? function (ops) { return koVerify.call(ko, ops); }
    : function (ops) { return Stub.verifyChain(ops); };

  // ---- subscribeOps / emitOp → 'bonsai:oplog' CustomEvent (else stub) -----
  var liveSub = !!(host && isFn(host.addEventListener));
  if (liveSub) bindings.subscribeOps = 'live';
  conn.subscribeOps = liveSub
    ? function (cb) {
        var handler = function (e) { cb(e ? e.detail : undefined); };
        host.addEventListener('bonsai:oplog', handler);
        return function () { if (isFn(host.removeEventListener)) host.removeEventListener('bonsai:oplog', handler); };
      }
    : function (cb) { return Stub.subscribeOps.call(conn, cb); };   // `this`=conn → conn gets its OWN _subs
  conn.emitOp = liveSub
    ? function (op) {
        var ev = isFn(host.CustomEvent) ? new host.CustomEvent('bonsai:oplog', { detail: op })
                                        : { type: 'bonsai:oplog', detail: op };
        if (isFn(host.dispatchEvent)) host.dispatchEvent(ev);
        return op;
      }
    : function (op) { return Stub.emitOp.call(conn, op); };

  // ---- bus → BroadcastChannel('bim_teams') (else in-memory, stub semantics) -
  var liveBus = !!(host && isFn(host.BroadcastChannel));
  if (liveBus) {
    bindings.bus = 'live';
    var bc = new host.BroadcastChannel('bim_teams');
    conn.bus = {
      on: function (ch, cb) {
        bc.addEventListener('message', function (e) {
          var d = e && e.data;
          if (d && d.ch === ch) cb(d.m);
        });
      },
      send: function (ch, m) { bc.postMessage({ ch: ch, m: m }); }
    };
  } else {
    // per-instance in-memory bus matching the stub's on/send semantics (trivial pub/sub, not crypto)
    var ls = {};
    conn.bus = {
      on: function (ch, cb) { (ls[ch] = ls[ch] || []).push(cb); },
      send: function (ch, m) { (ls[ch] || []).forEach(function (cb) { cb(m); }); }
    };
  }

  // ---- shared, pure utilities (pulled from the stub — never re-implemented) -
  conn._util = Stub._util;
  conn._bindings = bindings;
  conn._isStub = (bindings.evaluateGate === 'stub' && bindings.foldCost === 'stub' && bindings.sign === 'stub' &&
                  bindings.subscribeOps === 'stub' && bindings.bus === 'stub');
  return conn;
}

// Default instance = stub-equivalent when no host is detected (e.g. node). Factory attached for callers.
var DEFAULT = makeConnectors();
DEFAULT.makeConnectors = makeConnectors;

if (typeof module === 'object' && module.exports) module.exports = DEFAULT;
else (typeof self !== 'undefined' ? self : this).TeamsConnectorsLive = { makeConnectors: makeConnectors };

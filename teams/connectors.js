// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS CONNECTOR SEAM (prompts/RESUME_DISTRIBUTED_BRANCHES.md §isolation).
//   THIS FILE IS THE ONLY COUPLING POINT to the modeller. Everything else in teams/ is
//   self-contained and depends only on this interface. To go live, REPLACE each stub body with the
//   real modeller binding — the engine + witnesses never change. Read the log after every run.
//
//   STUB → REAL mapping (separation of concern):
//     evaluateGate   →  sdg_gate.evaluate          (§GATE-1, RED/ORANGE clash+clearance)
//     foldCost       →  viewer/rates.js foldCost   (§SE 5D rollup)
//     sign/verify    →  build/erp/kernel_ops.js    (signed hash-chain)
//     subscribeOps   →  window 'bonsai:oplog' event
//     bus            →  BroadcastChannel('bim_teams')  (Tier-1 awareness)
'use strict';
var crypto = (typeof require !== 'undefined') ? require('crypto') : null;

function sha256(s) {
  if (crypto) return crypto.createHash('sha256').update(String(s)).digest('hex');
  var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return ('00000000' + h.toString(16)).slice(-8);
}
// stable, RECURSIVELY key-sorted serialization (don't use JSON.stringify's array arg — it acts as a
// nested property allowlist and silently drops params.box.* → tamper-blind hashes).
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(function (k) {
    return JSON.stringify(k) + ':' + stableStringify(v[k]);
  }).join(',') + '}';
}
// canonical serialization of the signable op body (hash/sig fields excluded)
function canonical(op) {
  return stableStringify({ id: op.id, ts: op.ts, branch: op.branch, author: op.author,
    cls: op.cls, verb: op.verb, target: op.target, params: op.params });
}
// AABB overlap on all three axes
function overlap(a, b, m) {
  m = m || 0;
  return (a.x - m) < (b.x + b.w + m) && (a.x + a.w + m) > (b.x - m) &&
         (a.y - m) < (b.y + b.d + m) && (a.y + a.d + m) > (b.y - m) &&
         (a.z - m) < (b.z + b.h + m) && (a.z + a.h + m) > (b.z - m);
}

var Connectors = {
  _isStub: true,

  // ---- STUB: sign + hash-chain (REAL: kernel_ops.js) -------------------------
  // chains op_hash = H(prev_hash + body); sig = H(author + op_hash) as a stand-in signature.
  sign: function (op, prevHash) {
    var body = canonical(op);
    op.prev_hash = prevHash || 'GENESIS';
    op.op_hash = sha256(op.prev_hash + body);
    op.sig = sha256(op.author + ':' + op.op_hash);
    return op;
  },
  // recompute the chain — any amended op/param breaks op_hash; any forged author breaks sig.
  verifyChain: function (ops) {
    var prev = 'GENESIS';
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i], h = sha256(prev + canonical(o));
      if (o.op_hash !== h) return { ok: false, at: i, why: 'op_hash' };
      if (o.sig !== sha256(o.author + ':' + o.op_hash)) return { ok: false, at: i, why: 'sig' };
      prev = o.op_hash;
    }
    return { ok: true };
  },

  // ---- STUB: the merge gate (REAL: sdg_gate.evaluate §GATE-1) ----------------
  //   world = { guid: {box,disc,cost} }. Returns cross-discipline clashes (precise AABB) and
  //   per-branch budget ratio vs a Project-Order baseline. `margin` lets the caller ask a coarse
  //   Tier-1 hint (inflated boxes) vs a precise Tier-2 verdict (margin 0).
  evaluateGate: function (world, opts) {
    opts = opts || {}; var margin = opts.margin || 0;
    var ids = Object.keys(world), clashes = [];
    for (var i = 0; i < ids.length; i++) for (var j = i + 1; j < ids.length; j++) {
      var a = world[ids[i]], b = world[ids[j]];
      if (a.disc === b.disc) continue;                 // cross-discipline only
      if (overlap(a.box, b.box, margin)) clashes.push({ a: ids[i], b: ids[j], disc: [a.disc, b.disc].sort() });
    }
    return { clashes: clashes };
  },

  // ---- STUB: 5D cost fold (REAL: rates.js foldCost) -------------------------
  foldCost: function (world, branch) {
    var sum = 0; for (var g in world) if (!branch || world[g].disc === branch) sum += (world[g].cost || 0);
    return sum;
  },

  // ---- STUB: live op stream (REAL: window 'bonsai:oplog') -------------------
  subscribeOps: function (cb) { (this._subs = this._subs || []).push(cb); return function () {}; },
  emitOp: function (op) { (this._subs || []).forEach(function (cb) { cb(op); }); },

  // ---- STUB: Tier-1 awareness bus (REAL: BroadcastChannel) ------------------
  bus: (function () { var ls = {}; return {
    on: function (ch, cb) { (ls[ch] = ls[ch] || []).push(cb); },
    send: function (ch, m) { (ls[ch] || []).forEach(function (cb) { cb(m); }); } }; })(),

  _util: { sha256: sha256, canonical: canonical, overlap: overlap }
};

// ── SELF-UPGRADE TO LIVE — THE seam swap (DESIGN.md §3) ────────────────────────
// connectors.js IS the single coupling point: engine/gate/chatlog all require('./connectors'), so
// upgrading THIS singleton in place takes the whole layer live with ZERO edits to them or to the
// modeller. Behavior is IDENTICAL to the stub when no live host is present (node/tests stay green).
// Detection mirrors connectors_live.js (window/self only — NOT globalThis, so node BroadcastChannel/
// crypto never false-bind). NON-INVENT: a present binding routes verbatim; an absent one keeps the stub.
function _detectHost() {
  return (typeof window !== 'undefined') ? window : (typeof self !== 'undefined') ? self : null;
}
Connectors._bindings = { evaluateGate: 'stub', foldCost: 'stub', sign: 'stub', verifyChain: 'stub', subscribeOps: 'stub', bus: 'stub' };
Connectors.goLive = function (host) {
  host = host || _detectHost(); if (!host) return Connectors;
  var b = Connectors._bindings;
  if (host.sdg_gate && typeof host.sdg_gate.evaluate === 'function') {
    Connectors.evaluateGate = function (w, o) { return host.sdg_gate.evaluate(w, o); }; b.evaluateGate = 'live';
  }
  if (host.rates && typeof host.rates.foldCost === 'function') {
    Connectors.foldCost = function (w, br) { return host.rates.foldCost(w, br); }; b.foldCost = 'live';
  }
  var ko = host.kernel_ops, kv = ko && (ko.verifyChain || ko.verify);   // sign+verify bound as a pair
  if (ko && typeof ko.sign === 'function' && typeof kv === 'function') {
    Connectors.sign = function (op, prev) { return ko.sign(op, prev); };
    Connectors.verifyChain = function (ops) { return kv.call(ko, ops); };
    b.sign = b.verifyChain = 'live';
  }
  if (typeof host.addEventListener === 'function') {                    // live op stream: 'bonsai:oplog'
    Connectors.subscribeOps = function (cb) {
      var h = function (e) { cb(e && e.detail); };
      host.addEventListener('bonsai:oplog', h);
      return function () { host.removeEventListener('bonsai:oplog', h); };
    }; b.subscribeOps = 'live';
  }
  if (typeof host.BroadcastChannel === 'function') {                    // Tier-1 awareness bus
    var ch = new host.BroadcastChannel('bim_teams');
    Connectors.bus = { on: function (c, cb) { ch.onmessage = function (e) { cb(e && e.data); }; },
                       send: function (c, m) { ch.postMessage(m); } }; b.bus = 'live';
  }
  Connectors._isStub = (b.evaluateGate === 'stub' && b.foldCost === 'stub' && b.sign === 'stub' &&
                        b.subscribeOps === 'stub' && b.bus === 'stub');
  return Connectors;
};
// auto-upgrade on load ONLY when a real modeller host is present (gate/rates/kernel_ops) — no-op in
// node → stays the deterministic stub. A standalone page may call Connectors.goLive(window) explicitly.
(function () {
  var h = _detectHost();
  if (h && (h.sdg_gate || h.rates || h.kernel_ops)) Connectors.goLive(h);
})();

if (typeof module === 'object' && module.exports) module.exports = Connectors;
else (typeof self !== 'undefined' ? self : this).TeamsConnectors = Connectors;

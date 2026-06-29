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
// NOTE: must NOT be named `crypto` — at browser top-level scope `var crypto` aliases the read-only
// `window.crypto` getter and THROWS on load (kills the module → downstream `_util` undefined).
var _nodeCrypto = (typeof require !== 'undefined') ? (function () { try { return require('crypto'); } catch (e) { return null; } })() : null;

// Real SHA-256, pure JS — byte-identical to node's crypto sha256 (standard algorithm + UTF-8 input).
// Used in the BROWSER so a chain signed in node verifies in the browser and vice-versa (cross-env
// determinism — the prior djb2 fallback produced a DIFFERENT, 8-char digest → chains never verified).
var _K256 = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function _utf8Bytes(s) {
  var b = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) b.push(c);
    else if (c < 0x800) b.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c >= 0xd800 && c < 0xdc00) {
      var c2 = s.charCodeAt(++i), cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      b.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else b.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return b;
}
function _jsSha256(str) {
  function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
  var m = _utf8Bytes(str), l = m.length;
  var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  m.push(0x80); while (m.length % 64 !== 56) m.push(0);
  var bits = l * 8, hi = Math.floor(bits / 0x100000000), lo = bits >>> 0;
  m.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
         (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  var w = new Array(64);
  for (var i = 0; i < m.length; i += 64) {
    for (var t = 0; t < 16; t++) w[t] = (m[i+4*t] << 24) | (m[i+4*t+1] << 16) | (m[i+4*t+2] << 8) | m[i+4*t+3];
    for (t = 16; t < 64; t++) {
      var s0 = rotr(7, w[t-15]) ^ rotr(18, w[t-15]) ^ (w[t-15] >>> 3);
      var s1 = rotr(17, w[t-2]) ^ rotr(19, w[t-2]) ^ (w[t-2] >>> 10);
      w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
    }
    var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for (t = 0; t < 64; t++) {
      var S1 = rotr(6,e) ^ rotr(11,e) ^ rotr(25,e), ch = (e & f) ^ (~e & g);
      var t1 = (h + S1 + ch + _K256[t] + w[t]) | 0;
      var S0 = rotr(2,a) ^ rotr(13,a) ^ rotr(22,a), mj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + mj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
  }
  var hex = ''; for (i = 0; i < 8; i++) hex += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
  return hex;
}
function sha256(s) {
  s = String(s);
  return _nodeCrypto ? _nodeCrypto.createHash('sha256').update(s).digest('hex') : _jsSha256(s);
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

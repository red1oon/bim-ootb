// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS FACILITATOR: an OPTIONAL, TRUSTLESS relay (DESIGN.md §7). It NEVER holds
//   truth — truth is signed (History, connectors.verifyChain) and content-addressed (shared datums,
//   protocol CAS). It can only store-and-forward signed ops, host the CAS blob store, and broker Tier-1
//   presence. It CANNOT forge an op (breaks sig/chain), alter a datum (breaks CAS key), or invent a
//   verdict (the gate runs client-side). Worst case = withhold/reorder/replay → clients still converge
//   (total order = (ts,id); dedup by op_hash; replay idempotent). Remove it and Tier-0/1 still work.
//   Pure over inputs: NO Date.now / Math.random. In-memory loopback stub; live binding (serverless /
//   ERP edge suite, scripts/erp_seam.js) swaps in later WITHOUT touching engine, overlay, or witnesses.
//   Read the log after every run.
'use strict';
var C = (typeof require !== 'undefined') ? require('./connectors') : (self.TeamsConnectors);
var P = (typeof require !== 'undefined') ? require('./protocol')   : (self.TeamsProtocol);

// op_hash sequence of a log (the identity of a branch chain prefix).
function _hashes(log) { return log.map(function (o) { return o.op_hash; }); }

// does `next` contain `prev` as an exact op_hash prefix? (monotonic, no-history-rewrite check)
function _extendsPrefix(prev, next) {
  if (next.length < prev.length) return false;
  for (var i = 0; i < prev.length; i++) if (next[i].op_hash !== prev[i].op_hash) return false;
  return true;
}

// A facilitator instance owns its OWN state (so tests can spin up several and prove convergence).
function makeFacilitator() {
  var logs = {};        // branch -> signed op log (full chain from GENESIS)
  var cas = {};         // content-addressed shared-datum store
  var beats = [];       // heartbeat list (awareness)

  return {
    _isStub: true,

    // ── store-and-forward signed ops (git-like "dumb remote") ──────────────────
    // Accepts a branch's FULL signed log. Rejects on (a) broken chain/sig (verifyChain) or
    // (b) history rewrite (must extend the stored prefix). Idempotent: re-push → accepted 0.
    pushOps: function (branch, ops) {
      ops = ops || [];
      var v = C.verifyChain(ops);
      if (!v.ok) return { accepted: 0, rejected: [{ at: v.at, why: v.why }] };
      var prev = logs[branch] || [];
      if (!_extendsPrefix(_hashes(prev), _hashes(ops)))
        return { accepted: 0, rejected: [{ at: prev.length, why: 'rewrite' }] };
      logs[branch] = ops.slice();
      return { accepted: ops.length - prev.length, rejected: [] };
    },

    // return ops AFTER the op whose op_hash === sinceHash (whole log if GENESIS/unknown — the puller
    // re-verifies the chain and detects any gap itself). Never mutates stored state.
    pullOps: function (branch, sinceHash) {
      var log = logs[branch] || [];
      if (!sinceHash || sinceHash === 'GENESIS') return log.slice();
      for (var i = 0; i < log.length; i++) if (log[i].op_hash === sinceHash) return log.slice(i + 1);
      return log.slice();
    },

    // branch -> tip op_hash (a joining peer discovers branches + how far behind it is). Keys are
    // SORTED → output is deterministic regardless of push/arrival order (the convergence guarantee).
    tips: function () {
      var t = {};
      Object.keys(logs).sort().forEach(function (b) {
        t[b] = logs[b].length ? logs[b][logs[b].length - 1].op_hash : 'GENESIS';
      });
      return t;
    },

    // ── CAS blob store for shared datums (content-addressed, immutable, dedup) ──
    putBlob: function (datum) { var r = P.casPut(cas, datum); cas = r.store; return r.key; },
    getBlob: function (key)   { return P.casGet(cas, key); },

    // ── Tier-1 presence broker (awareness only — carries tips, never ops) ──────
    announce: function (hb) { if (hb && hb.kind === 'heartbeat') beats.push(hb); return beats.length; },
    presence: function ()   { return P.summarizeHeartbeats(beats); },

    _state: function () { return { logs: logs, cas: cas, beats: beats }; }
  };
}

var F = { makeFacilitator: makeFacilitator, _extendsPrefix: _extendsPrefix };
if (typeof module === 'object' && module.exports) module.exports = F;
else (typeof self !== 'undefined' ? self : this).TeamsFacilitator = F;

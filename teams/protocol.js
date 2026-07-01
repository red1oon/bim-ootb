// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS PROTOCOL: the 3 OPEN design items resolved as deterministic, NON-INVENT
//   helpers (prompts/RESUME_DISTRIBUTED_BRANCHES.md §3/§7/§12). Pure f(input): NO Date.now / NO
//   Math.random — every timestamp & id is an edge-minted INPUT passed in by the caller.
//     §3  shared-datum CAS  — content-addressed seam for zone-splits (casKey/casPut/casGet)
//     §7  Tier-1 heartbeat  — minimal awareness payload (makeHeartbeat/summarizeHeartbeats)
//     §12 op-message default — author message OR deterministic projection (withMessage)
//   Reuses connectors.js `_util.sha256` for hashing — does NOT re-implement crypto, does NOT fork
//   the frozen engine. Read the log after every run.
'use strict';
var C = (typeof require !== 'undefined') ? require('./connectors') : (self.TeamsConnectors);

// stable, RECURSIVELY key-sorted serialization of an ARBITRARY datum (not op-shaped).
// MIRRORS connectors `_util` stableStringify EXACTLY — see §FINDING in PROTOCOL.md: the connector
// exposes `_util.canonical` (which ALLOWLISTS op fields → lossy/colliding for a bare datum) and
// `_util.sha256`, but NOT the general stableStringify. We re-serialize here (serialization, not
// crypto) and reuse `_util.sha256` for the digest. Never mutates input.
function _stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(_stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map(function (k) {
    return JSON.stringify(k) + ':' + _stable(v[k]);
  }).join(',') + '}';
}

// ─── §3 SHARED-DATUM CAS (the seam) ────────────────────────────────────────────
// Content address of a shared datum (a datum_plane / grid / rel_anchored row). Identical content →
// identical key on ANY node, so two zone branches reference the SAME datum by content, not by a
// mutable id. Tamper-evident: any change to the datum changes the key.
function casKey(datum) { return C._util.sha256(_stable(datum)); }

// Immutable add to a content-addressed store (plain {key:datum} map). Returns {key, store} where
// store is a NEW object (input store untouched). Identical datum → identical key → NO duplicate
// entry (the existing immutable value is kept; CAS values never differ for the same key).
function casPut(store, datum) {
  store = store || {};
  var key = casKey(datum);
  if (Object.prototype.hasOwnProperty.call(store, key)) return { key: key, store: store };
  var next = {}; for (var k in store) if (Object.prototype.hasOwnProperty.call(store, k)) next[k] = store[k];
  next[key] = datum;
  return { key: key, store: next };
}

// Read-only lookup (the non-owner branch references the shared datum read-only).
function casGet(store, key) { return (store && Object.prototype.hasOwnProperty.call(store, key)) ? store[key] : undefined; }

// ─── §7 TIER-1 HEARTBEAT (awareness, NOT ops) ──────────────────────────────────
// A minimal fixed-schema awareness payload for BroadcastChannel('bim_teams'). Carries only what a
// peer needs to paint an OPTIMISTIC overlay: who, which branch, the branch TIP HASH (not the ops),
// and a coarse scope. Ops themselves travel on the signed log ('bonsai:oplog') — never here.
function makeHeartbeat(o) {
  o = o || {};
  return { kind: 'heartbeat', branch: o.branch, author: o.author, tip: o.tipHash, scope: o.scope, ts: o.ts };
}

// Reduce a list of heartbeats to a per-branch presence map = the LATEST (max ts) per branch.
// Pure: deterministic over inputs (ties broken by keeping the first-seen latest — stable).
function summarizeHeartbeats(list) {
  var by = {};
  (list || []).forEach(function (h) {
    if (!h || h.kind !== 'heartbeat') return;
    var cur = by[h.branch];
    if (!cur || h.ts > cur.ts) by[h.branch] = h;
  });
  return by;
}

// ─── §12 OP-MESSAGE DEFAULT ─────────────────────────────────────────────────────
// Policy: the STORED op keeps `params.message` OPTIONAL. The chat projection fills it
// DETERMINISTICALLY: author-written message verbatim IF present, ELSE describeFn(op) — a pure
// render of verb+params. The caller passes `TeamsChatlog.describe` so we do NOT fork it. NEVER
// fabricates prose. Returns a NEW op (input untouched).
function withMessage(op, describeFn) {
  var p = op.params || {};
  var msg = (p.message != null && p.message !== '') ? p.message
          : (typeof describeFn === 'function' ? describeFn(op) : '');
  var nextParams = {}; for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) nextParams[k] = p[k];
  nextParams.message = msg;
  var next = {}; for (var f in op) if (Object.prototype.hasOwnProperty.call(op, f)) next[f] = op[f];
  next.params = nextParams;
  return next;
}

var P = { casKey: casKey, casPut: casPut, casGet: casGet,
          makeHeartbeat: makeHeartbeat, summarizeHeartbeats: summarizeHeartbeats,
          withMessage: withMessage, _stable: _stable };
if (typeof module === 'object' && module.exports) module.exports = P;
else (typeof self !== 'undefined' ? self : this).TeamsProtocol = P;

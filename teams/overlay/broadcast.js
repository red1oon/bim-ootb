// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS BROADCAST (teams/ROADMAP.md §S10·broadcast, Phase F — standalone, off-by-default).
//   The system-wide sticky (TEAM_OPTICS.md §5.1, ERP_CONTEXT.md §5.1): an admin announcement is just a
//   signed `annot` op on the UNIVERSAL `broadcast` anchor (the same primitive as a post-it, wider target).
//   target = all | role:<R> | level:<N>. Broadcast-eligible GATED — only an eligible author may emit
//   (NON-INVENT: an ineligible broadcast is never created, emit throws). Surfaces in the Organiser + as
//   a dot; recipients ACK; an admin can REVOKE. Every state is a pure fold of the ONE signed log.
//
//   PURE + deterministic (no Date.now / Math.random — ids/ts are INPUTS). Reuses the post-it anchor model
//   (overlay/postit.js makeAnchor 'broadcast') + the connector seam (sign/verifyChain). Witness:
//   teams/tests/poc_teams_s10.js (W-BROADCAST).
'use strict';
var C = (typeof require !== 'undefined') ? require('../connectors') : self.TeamsConnectors;
var P = (typeof require !== 'undefined') ? require('./postit') : self.TeamsPostit;

// target encoding → the anchor ref (the broadcast scope is the anchor's identity).
//   { scope:'all' } → 'all' · { scope:'role', value:'AP' } → 'role:AP' · { scope:'level', value:2 } → 'level:2'
function targetRef(target) {
  if (!target || !target.scope) throw new Error('broadcast: target {scope[,value]} required');
  if (target.scope === 'all') return 'all';
  if (target.scope === 'role' || target.scope === 'level') {
    if (target.value == null || target.value === '') throw new Error('broadcast: ' + target.scope + ' target needs a value');
    return target.scope + ':' + target.value;
  }
  throw new Error('broadcast: unknown scope ' + target.scope);
}

// targetsViewer(target, viewer) — does this broadcast reach `viewer` = { user, role, level }?
//   all → everyone · role → viewer.role === value · level → viewer.level ≥ value (that seniority and up).
function targetsViewer(target, viewer) {
  viewer = viewer || {};
  if (target.scope === 'all') return true;
  if (target.scope === 'role') return viewer.role === target.value;
  if (target.scope === 'level') return viewer.level != null && Number(viewer.level) >= Number(target.value);
  return false;
}

function _append(log, op) {
  var tip = log.length ? log[log.length - 1].op_hash : 'GENESIS';
  C.sign(op, tip);
  return log.concat([op]);
}
function _op(id, ts, author, role, verb, ref, params) {
  return { id: id, ts: ts, branch: null, author: author, role: role, cls: 'annot',
           verb: verb, target: P.anchorKey(P.makeAnchor('broadcast', ref)), params: params || {} };
}

// emit(log, args) — an eligible author posts a broadcast. args:
//   { id, ts, author, role, target:{scope[,value]}, msg, eligible: fn(author,role)->bool }.
//   GATED: if eligible(author,role) is false → throws (NON-INVENT: an ineligible broadcast is never minted).
//   Returns { ok, log, op, bid }. bid = the broadcast id (= args.id) used by ack/revoke/fold.
function emit(log, args) {
  var elig = args.eligible || function () { return true; };
  if (!elig(args.author, args.role)) throw new Error('broadcast: ' + args.author + ' (' + args.role + ') not broadcast-eligible');
  var ref = targetRef(args.target);
  var op = _op(args.id, args.ts, args.author, args.role, 'BROADCAST', ref,
    { bid: args.id, target: args.target, msg: args.msg != null ? args.msg : '' });
  return { ok: true, log: _append(log, op), op: op, bid: args.id };
}

// ack(log, args) — a recipient acknowledges a broadcast. { id, ts, author, bid, ref }. Returns { ok, log, op }.
function ack(log, args) {
  var op = _op(args.id, args.ts, args.author, args.role, 'ACK', args.ref, { bid: args.bid });
  return { ok: true, log: _append(log, op), op: op };
}
// revoke(log, args) — an admin retires a broadcast. { id, ts, author, bid, ref }. Returns { ok, log, op }.
function revoke(log, args) {
  var op = _op(args.id, args.ts, args.author, args.role, 'REVOKE', args.ref, { bid: args.bid });
  return { ok: true, log: _append(log, op), op: op };
}

function _order(ops) {
  return (ops || []).slice().sort(function (a, b) {
    return a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

// foldBroadcasts(ops) — the active announcements (NON-INVENT: each ← a BROADCAST op), keyed by bid:
//   { bid, author, role, target, msg, ts, revoked, acks:[user,...] }. REVOKE drops it from `active`.
function foldBroadcasts(ops) {
  var bc = {};
  _order(ops).forEach(function (op) {
    if (op.cls !== 'annot') return;
    var p = op.params || {}, bid = p.bid;
    if (bid == null) return;
    if (op.verb === 'BROADCAST') {
      bc[bid] = { bid: bid, author: op.author, role: op.role, target: p.target, msg: p.msg != null ? p.msg : '',
                  ts: op.ts, revoked: false, acks: [] };
    } else if (bc[bid]) {
      if (op.verb === 'REVOKE') bc[bid].revoked = true;
      else if (op.verb === 'ACK' && bc[bid].acks.indexOf(op.author) < 0) bc[bid].acks.push(op.author);
    }
  });
  var all = Object.keys(bc).map(function (k) { return bc[k]; })
    .sort(function (x, y) { return x.ts !== y.ts ? x.ts - y.ts : (x.bid < y.bid ? -1 : 1); });
  return { all: all, active: all.filter(function (b) { return !b.revoked; }) };
}

// broadcastsFor(folded, viewer) — the active broadcasts that REACH `viewer`, UNACKED-first (most urgent),
//   then newest. viewer = { user, role, level }. Pure filter over the fold (no invention).
function broadcastsFor(folded, viewer) {
  viewer = viewer || {};
  return (folded.active || []).filter(function (b) { return targetsViewer(b.target, viewer); })
    .map(function (b) { return Object.assign({}, b, { acked: b.acks.indexOf(viewer.user) >= 0 }); })
    .sort(function (x, y) {
      if (x.acked !== y.acked) return x.acked ? 1 : -1;        // unacked first
      return y.ts - x.ts;                                       // then newest
    });
}

// tamper-evidence of the broadcast log (the announcements ARE the signed log).
function verify(log) { return C.verifyChain(log || []); }

var B = { targetRef: targetRef, targetsViewer: targetsViewer, emit: emit, ack: ack, revoke: revoke,
          foldBroadcasts: foldBroadcasts, broadcastsFor: broadcastsFor, verify: verify };
if (typeof module === 'object' && module.exports) module.exports = B;
else (typeof self !== 'undefined' ? self : this).TeamsBroadcast = B;

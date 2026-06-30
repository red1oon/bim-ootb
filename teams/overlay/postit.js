// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS POST-IT (teams/ROADMAP.md §S3, Phase B — standalone, off-by-default).
//   The one ACTIVE optic (TEAM_OPTICS.md §4): digitises the monitor-sticky habit and removes its three
//   weaknesses — lost / siloed / no-recall. A post-it is a signed `annot` op anchored to a UNIVERSAL
//   anchor `{kind, ref}` (BIM element + ERP doc are the SAME primitive). Private-first; promote, don't
//   re-create (private → shared → bundled). The "wall" self-tidies via organise axes; a sticky
//   resurfaces in context (contextual recall). Every post-it is a fold of the ONE signed log (NON-INVENT).
//
//   PURE + deterministic (no Date.now / Math.random — `now`/`ts` are INPUTS). Depends only on the
//   connector seam (connectors.js sign/verifyChain). Witness: teams/tests/poc_teams_postit.js (W-POSTIT).
'use strict';
var C = (typeof require !== 'undefined') ? require('../connectors') : self.TeamsConnectors;

// universal anchor kinds (TEAM_OPTICS §4 + §5.1 broadcast). The SAME set across BIM and ERP.
var ANCHOR_KINDS = ['doc', 'field', 'screen', 'dashboard', 'flow', 'element', 'broadcast'];
// visibility ladder (TEAM_OPTICS §4: "promote, don't re-create" — ONE op escalates visibility).
var VISIBILITY = ['private', 'shared', 'bundled'];

// makeAnchor(kind, ref) — validate against the universal set. NON-INVENT: an unknown kind throws
// (never silently coerced). `ref` is the record/element id (composite key = kind+':'+ref).
function makeAnchor(kind, ref) {
  if (ANCHOR_KINDS.indexOf(kind) < 0) throw new Error('postit: unknown anchor kind ' + kind);
  if (ref == null || ref === '') throw new Error('postit: anchor ref required');
  return { kind: kind, ref: String(ref) };
}
function anchorKey(anchor) { return anchor.kind + ':' + anchor.ref; }

// parse @mentions from a message (deterministic) ∪ explicit params.mentions. Sorted, de-duped.
function _mentions(msg, explicit) {
  var set = {};
  (String(msg || '').match(/@([A-Za-z0-9_]+)/g) || []).forEach(function (m) { set[m.slice(1)] = 1; });
  (explicit || []).forEach(function (m) { set[m] = 1; });
  return Object.keys(set).sort();
}

// ── signed-op helpers ────────────────────────────────────────────────────────
// every post-it action is a signed annot op chained off the log tip (tamper-evident, like any op).
function _append(log, op) {
  var tip = log.length ? log[log.length - 1].op_hash : 'GENESIS';
  C.sign(op, tip);                                    // sets prev_hash/op_hash/sig
  return log.concat([op]);
}
function _op(id, ts, author, verb, anchor, params) {
  return { id: id, ts: ts, branch: author, author: author, cls: 'annot', verb: verb,
           target: anchorKey(anchor), params: params || {} };
}

// pin — create a post-it. PRIVATE-FIRST (default visibility = 'private' = your monitor only).
//   args: { id, ts, author, anchor:{kind,ref}, msg, visibility?, mentions? }. Returns {ok, log, op, pinId}.
function pin(log, args) {
  var a = args.anchor.kind ? args.anchor : makeAnchor(args.anchor.kind, args.anchor.ref);
  var pinId = args.pinId != null ? args.pinId : args.id;
  var vis = args.visibility || 'private';
  if (VISIBILITY.indexOf(vis) < 0) throw new Error('postit: unknown visibility ' + vis);
  var op = _op(args.id, args.ts, args.author, 'PIN', a,
    { pinId: pinId, anchor: a, msg: args.msg != null ? args.msg : '', visibility: vis,
      mentions: _mentions(args.msg, args.mentions) });
  return { ok: true, log: _append(log, op), op: op, pinId: pinId };
}

// an update op against an existing pin (RESOLVE/SNOOZE/REOPEN/REPLY/PROMOTE). Anchor is re-stated so
// the op stands alone (the fold reads pinId). Returns {ok, log, op}.
function _update(log, args, verb, extra) {
  var a = args.anchor;
  var op = _op(args.id, args.ts, args.author, verb, a,
    Object.assign({ pinId: args.pinId, anchor: a }, extra || {}));
  return { ok: true, log: _append(log, op), op: op };
}
function resolve(log, args) { return _update(log, args, 'RESOLVE'); }
function snooze(log, args)  { return _update(log, args, 'SNOOZE'); }
function reopen(log, args)  { return _update(log, args, 'REOPEN'); }
function reply(log, args)   { return _update(log, args, 'REPLY', { msg: args.msg, mentions: _mentions(args.msg, args.mentions) }); }
// promote — escalate visibility (TEAM_OPTICS §4). One op, no re-create.
function promote(log, args) {
  if (VISIBILITY.indexOf(args.visibility) < 0) throw new Error('postit: unknown visibility ' + args.visibility);
  return _update(log, args, 'PROMOTE', { visibility: args.visibility });
}

// ── the fold: annot ops → post-it states (NON-INVENT, order-invariant) ────────
// status: PIN/REOPEN/REPLY → open · RESOLVE → resolved · SNOOZE → snoozed. visibility tracks PROMOTE.
// Folds in total order (ts,id) so arrival order is irrelevant. Returns array sorted by (ts,id).
function _order(ops) {
  return (ops || []).slice().sort(function (a, b) {
    return a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
function foldPostits(ops) {
  var pins = {};
  _order(ops).forEach(function (op) {
    if (op.cls !== 'annot') return;
    var p = op.params || {}, pinId = p.pinId != null ? p.pinId : op.id;
    if (op.verb === 'PIN' || !pins[pinId]) {
      pins[pinId] = { pinId: pinId, author: op.author, anchor: p.anchor || null, anchorKey: op.target,
        msg: p.msg != null ? p.msg : '', status: 'open', visibility: p.visibility || 'private',
        ts: op.ts, lastTs: op.ts, replies: [], mentions: (p.mentions || []).slice(), faded: false };
      if (op.verb !== 'PIN') return;                  // a stray non-PIN with no prior pin: seeded open
    }
    var d = pins[pinId];
    d.lastTs = op.ts;
    if (op.verb === 'RESOLVE') d.status = 'resolved';
    else if (op.verb === 'SNOOZE') d.status = 'snoozed';
    else if (op.verb === 'REOPEN') d.status = 'open';
    else if (op.verb === 'PROMOTE' && p.visibility) d.visibility = p.visibility;
    else if (op.verb === 'REPLY') {
      d.replies.push({ author: op.author, msg: p.msg != null ? p.msg : '', ts: op.ts });
      (p.mentions || []).forEach(function (m) { if (d.mentions.indexOf(m) < 0) d.mentions.push(m); });
      d.mentions.sort();
    }
    d.faded = (d.status === 'resolved' || d.status === 'snoozed');
  });
  return Object.keys(pins).map(function (k) { return pins[k]; })
    .sort(function (x, y) { return x.ts !== y.ts ? x.ts - y.ts : (x.pinId < y.pinId ? -1 : 1); });
}

// ── visibility gate (TEAM_OPTICS §4 private-first / §6 gating) ────────────────
// private → only the author; shared/bundled → the team (opts.isTeam(viewer), default = everyone).
function visibleTo(postit, viewer, opts) {
  opts = opts || {};
  if (postit.visibility === 'private') return postit.author === viewer;
  return opts.isTeam ? !!opts.isTeam(viewer) : true;       // shared + bundled = team-visible
}

// ── organise axes (TEAM_OPTICS §4: anchor / age / status / mention) ───────────
// Returns a {bucketKey: [postit,...]} map (each bucket sorted by ts,id) — the self-tidying wall.
//   anchor  → key = anchorKey (kind:ref)
//   age     → 'old' if (now - lastTs) > opts.ageMs (default 7d), else 'new'  (now is an INPUT)
//   status  → 'open' | 'resolved' | 'snoozed'
//   mention → key = each mentioned user (a postit appears under every user it @mentions)
function organise(postits, axis, opts) {
  opts = opts || {};
  var out = {};
  function push(k, p) { (out[k] = out[k] || []).push(p); }
  (postits || []).forEach(function (p) {
    if (axis === 'anchor') push(p.anchorKey, p);
    else if (axis === 'status') push(p.status, p);
    else if (axis === 'age') {
      var ageMs = opts.ageMs != null ? opts.ageMs : 7 * 24 * 3600 * 1000;
      var now = opts.now != null ? opts.now : p.lastTs;
      push((now - p.lastTs) > ageMs ? 'old' : 'new', p);
    } else if (axis === 'mention') {
      (p.mentions || []).forEach(function (m) { push(m, p); });
    } else throw new Error('postit: unknown organise axis ' + axis);
  });
  Object.keys(out).forEach(function (k) {
    out[k].sort(function (x, y) { return x.ts !== y.ts ? x.ts - y.ts : (x.pinId < y.pinId ? -1 : 1); });
  });
  return out;
}

// ── contextual recall (TEAM_OPTICS §4: "resurfaces in context") ───────────────
// Open an anchor → its post-its reappear. Filtered by visibility for `viewer` (private-first), and by
// status (default hides resolved — the wall stays low-density; opts.includeResolved keeps them).
function recall(postits, anchor, viewer, opts) {
  opts = opts || {};
  var key = anchorKey(anchor.kind ? anchor : makeAnchor(anchor.kind, anchor.ref));
  return (postits || []).filter(function (p) {
    if (p.anchorKey !== key) return false;
    if (!visibleTo(p, viewer, opts)) return false;
    if (!opts.includeResolved && p.status === 'resolved') return false;
    return true;
  });
}

// tamper-evidence of the whole post-it log (the chat IS the signed log).
function verify(log) { return C.verifyChain(log || []); }

var P = {
  ANCHOR_KINDS: ANCHOR_KINDS, VISIBILITY: VISIBILITY,
  makeAnchor: makeAnchor, anchorKey: anchorKey,
  pin: pin, resolve: resolve, snooze: snooze, reopen: reopen, reply: reply, promote: promote,
  foldPostits: foldPostits, visibleTo: visibleTo, organise: organise, recall: recall, verify: verify
};
if (typeof module === 'object' && module.exports) module.exports = P;
else (typeof self !== 'undefined' ? self : this).TeamsPostit = P;

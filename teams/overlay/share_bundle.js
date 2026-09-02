// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS BUNCH-&-SHARE + WORK-SUMMARY (teams/ROADMAP.md §S4, Phase B — standalone).
//   Ports BIM's proven snag→punch-list pattern, universal (TEAM_OPTICS.md §5): select N post-its →
//   ONE bundle (each = note + anchor + tiny snapshot + status + a BCF-style deep-link back) → push to a
//   channel (the post office = facilitator transports: Team feed / WhatsApp-stub / link). The receiver
//   taps an item and jumps to its anchor. Plus §5.1 the on-the-fly WORK SUMMARY: fold a flow/period →
//   a readable `what · who · when` digest, exportable + editable, doubling as the replay/training script.
//
//   PURE + deterministic (no Date.now / Math.random — `now`/`ts`/ids are INPUTS). The feed channel rides
//   the EXISTING facilitator (signed, tamper-evident); WhatsApp/link are thin serialise targets. Depends
//   only on the connector seam. Witness: teams/tests/poc_teams_share_bundle.js (W-BUNDLE-SHARE + W-WORK-SUMMARY).
'use strict';
var C = (typeof require !== 'undefined') ? require('../connectors') : self.TeamsConnectors;

function _order(rows) {
  return (rows || []).slice().sort(function (a, b) {
    return a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

// BCF-style deep-link back to a post-it's anchor — stable + deterministic (the "tap → jump").
function deeplink(anchor, pinId) {
  var a = anchor || {};
  return 'team://' + (a.kind || 'doc') + '/' + (a.ref != null ? a.ref : '?') + (pinId != null ? '#pin=' + pinId : '');
}

// ── selection (TEAM_OPTICS §5: all / this-week / this-flow / unresolved) ──────
// Operates on FOLDED post-its (postit.foldPostits output). NON-INVENT — pure predicates, no mutation.
function select(postits, criterion, opts) {
  opts = opts || {};
  var ps = postits || [];
  switch (criterion) {
    case 'all':        return ps.slice();
    case 'open':
    case 'unresolved': return ps.filter(function (p) { return p.status !== 'resolved'; });
    case 'mine':       return ps.filter(function (p) { return p.author === opts.viewer; });
    case 'this-anchor':
    case 'this-flow':  return ps.filter(function (p) { return p.anchorKey === opts.anchorKey; });
    case 'this-week': {
      var ageMs = opts.ageMs != null ? opts.ageMs : 7 * 24 * 3600 * 1000;
      var now = opts.now;
      return ps.filter(function (p) { return now == null || (now - p.lastTs) <= ageMs; });
    }
    default: throw new Error('share_bundle: unknown selection criterion ' + criterion);
  }
}

// ── bundle: N post-its → one shareable digest (each item self-contained) ──────
//   item = { pinId, note, anchor, status, author, ts, deeplink, snapshot }. snapshot = opts.snapshotOf(p)
//   if supplied (a tiny ref) else null — NEVER fabricated. Ordered by (ts,pinId) for a stable digest.
function bundle(postits, opts) {
  opts = opts || {};
  var items = (postits || []).slice()
    .sort(function (x, y) { return x.ts !== y.ts ? x.ts - y.ts : (x.pinId < y.pinId ? -1 : 1); })
    .map(function (p) {
      return { pinId: p.pinId, note: p.msg || '', anchor: p.anchor, status: p.status,
               author: p.author, ts: p.ts, deeplink: deeplink(p.anchor, p.pinId),
               snapshot: opts.snapshotOf ? (opts.snapshotOf(p) || null) : null };
    });
  var title = opts.title || ('Bundle of ' + items.length + ' note' + (items.length === 1 ? '' : 's'));
  return { id: opts.id != null ? opts.id : null, title: title, count: items.length, items: items };
}

// human-readable digest text (the WhatsApp/socmed body; receiver taps a deeplink to jump).
function bundleToText(b) {
  var lines = ['📌 ' + b.title];
  (b.items || []).forEach(function (it) {
    lines.push('• [' + it.status + '] ' + (it.note || '(note)') + ' — ' + it.author + '  ' + it.deeplink);
  });
  return lines.join('\n');
}

// ── channels = transports (the post office, TEAM_OPTICS §5 / DESIGN §7) ───────
// feed     → a SIGNED `annot` BUNDLE op pushed onto the facilitator (tamper-evident, on the log).
// whatsapp → a batched text payload (one message, N items) — a thin share target, not its own feature.
// link     → a serialisable payload (deep-linkable) optionally content-addressed via the facilitator CAS.
function dispatch(b, channel, ctx) {
  ctx = ctx || {};
  if (channel === 'feed') {
    if (!ctx.facilitator) throw new Error('share_bundle: feed channel needs ctx.facilitator');
    var log = (ctx.log || []).slice();
    var tip = log.length ? log[log.length - 1].op_hash : 'GENESIS';
    var op = { id: ctx.id, ts: ctx.ts, branch: ctx.branch || ctx.author, author: ctx.author,
               cls: 'annot', verb: 'BUNDLE', target: 'bundle:' + (b.id != null ? b.id : ctx.id),
               params: { bundle: b } };
    C.sign(op, tip);
    log.push(op);
    var res = ctx.facilitator.pushOps(op.branch, log);
    return { channel: 'feed', ok: res.accepted > 0, accepted: res.accepted, op: op, log: log };
  }
  if (channel === 'whatsapp') {
    return { channel: 'whatsapp', ok: true, text: bundleToText(b), count: b.count };
  }
  if (channel === 'link') {
    var payload = JSON.stringify(b);
    var ref = null;
    if (ctx.facilitator && ctx.facilitator.putBlob) ref = ctx.facilitator.putBlob(b);  // content-addressed
    return { channel: 'link', ok: true, payload: payload, ref: ref,
             url: 'team://bundle/' + (b.id != null ? b.id : (ref || 'inline')) };
  }
  throw new Error('share_bundle: unknown channel ' + channel);
}

// receiver side — round-trip a shared bundle back to its items (BCF-style: tap → deeplink).
function receive(shared) {
  if (shared && shared.channel === 'feed') return (shared.op.params.bundle || {}).items || [];
  if (shared && shared.channel === 'link') return (JSON.parse(shared.payload) || {}).items || [];
  if (shared && shared.channel === 'whatsapp') {                 // parse deeplinks out of the text
    return (shared.text || '').split('\n').filter(function (l) { return l.indexOf('team://') >= 0; })
      .map(function (l) { return { deeplink: l.slice(l.indexOf('team://')).trim() }; });
  }
  return [];
}

// ── §5.1 on-the-fly WORK SUMMARY: fold a flow/period → `what · who · when` ─────
//   Over ANY signed ops (ERP touches, annots, geom). Each row = a step (verb on a target). Scope by
//   opts.anchorKey (a flow/doc) and/or opts.from..opts.to (a period). Ordered by (ts,id) = the replay
//   script. NON-INVENT: every row ← one op; participants = the distinct authors. Editable = plain data.
function workSummary(ops, opts) {
  opts = opts || {};
  var rows = _order(ops).filter(function (op) {
    if (opts.classes && opts.classes.indexOf(op.cls) < 0) return false;
    if (opts.anchorKey != null && op.target !== opts.anchorKey) return false;
    if (opts.from != null && op.ts < opts.from) return false;
    if (opts.to != null && op.ts > opts.to) return false;
    return true;
  }).map(function (op) {
    return { what: op.verb + ' ' + op.target, who: op.author, when: op.ts, verb: op.verb, target: op.target };
  });
  var who = {}; rows.forEach(function (r) { who[r.who] = 1; });
  return { scope: { anchorKey: opts.anchorKey || null, from: opts.from != null ? opts.from : null, to: opts.to != null ? opts.to : null },
           rows: rows, participants: Object.keys(who).sort(), count: rows.length };
}

// exportable digest (doubles as the replay/training script). Editable = the caller edits `summary.rows`.
function summaryToText(summary) {
  var lines = ['Work summary' + (summary.scope.anchorKey ? ' · ' + summary.scope.anchorKey : '') +
               ' (' + summary.count + ' steps, ' + summary.participants.length + ' people)'];
  (summary.rows || []).forEach(function (r) { lines.push('· ' + r.what + ' — ' + r.who + ' @ ' + r.when); });
  return lines.join('\n');
}
function summaryToMarkdown(summary) {
  var lines = ['| # | what | who | when |', '|---|---|---|---|'];
  (summary.rows || []).forEach(function (r, i) { lines.push('| ' + (i + 1) + ' | ' + r.what + ' | ' + r.who + ' | ' + r.when + ' |'); });
  return lines.join('\n');
}

var S = {
  deeplink: deeplink, select: select, bundle: bundle, bundleToText: bundleToText,
  dispatch: dispatch, receive: receive,
  workSummary: workSummary, summaryToText: summaryToText, summaryToMarkdown: summaryToMarkdown
};
if (typeof module === 'object' && module.exports) module.exports = S;
else (typeof self !== 'undefined' ? self : this).TeamsShareBundle = S;

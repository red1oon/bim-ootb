// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS NUDGES (teams/ROADMAP.md §S12·F, Phase F — standalone, off-by-default).
//   The proactive half of the Flow lens (IDEAS.md §F): per-item ORANGE nudges from log folds + MEASURED
//   baselines — NON-INVENT, measure-DON'T-whitelist. "this PO sat in submitted 9d (p95 = 2d)", "this doc
//   skipped the usual approver", "Carol posted 3× her daily norm". Variance vs a MEASURED baseline, not ML,
//   not a hard-coded threshold. ONE clear nudge per item, DISMISSIBLE — never a wall.
//
//   Every baseline is computed FROM THE SAME LOG (percentiles of measured dwell, the majority variant, the
//   median author rate). Too few samples → REFUSE (no nudge) rather than guess. Dismiss = a signed annot op
//   → folded out. PURE + deterministic (no Date.now / Math.random — `now`/ids/ts are INPUTS). Witness:
//   teams/tests/poc_teams_s12.js (W-NUDGE).
'use strict';
var C = (typeof require !== 'undefined') ? require('../connectors') : self.TeamsConnectors;

function _order(ops) {
  return (ops || []).slice().sort(function (a, b) {
    return a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
// nearest-rank percentile over a numeric sample (deterministic; pct in [0,1]). Empty → null.
function _percentile(values, pct) {
  if (!values.length) return null;
  var s = values.slice().sort(function (a, b) { return a - b; });
  var rank = Math.ceil(pct * s.length);                    // nearest-rank (1-based)
  return s[Math.min(s.length, Math.max(1, rank)) - 1];
}
function _median(values) { return _percentile(values, 0.5); }

// status of an op (the doc-state vocab shared with the Dashboard optics): params.to | params.status.
function _statusOf(op) { var p = op.params || {}; return p.to != null ? p.to : (p.status != null ? p.status : null); }

// nudges(ops, opts) — at most ONE nudge per item (doc or author), each ← a MEASURED variance. opts:
//   { now, minSamples?(=4), pct?(=0.95), rateK?(=2), terminal?:[statuses] }. Returns
//   { nudges:[{ item, kind, severity:'orange', text, measured:{...} }], baselines, dismissed:[...] }.
//   kinds (priority slow > skipped > rate; one per item):
//     slow    — a doc's CURRENT status dwell (now - sinceTs) exceeds the measured pXX of that status' dwell.
//     skipped — a doc's activity set is missing an activity the measured MAJORITY variant contains.
//     rate    — an author's op count exceeds rateK × the measured median author count.
function nudges(ops, opts) {
  opts = opts || {};
  var now = opts.now, minSamples = opts.minSamples != null ? opts.minSamples : 4;
  var pct = opts.pct != null ? opts.pct : 0.95, rateK = opts.rateK != null ? opts.rateK : 2;
  var terminal = opts.terminal || [];
  var ordered = _order(ops);

  // ── per-case activity sequences + status timelines (the event log). ──
  var seqs = {}, statusTimeline = {}, authorCount = {};
  ordered.forEach(function (op) {
    if (op.cls === 'erp') {
      (seqs[op.target] = seqs[op.target] || []).push(op.verb);
      var st = _statusOf(op);
      if (st != null) (statusTimeline[op.target] = statusTimeline[op.target] || []).push({ status: st, ts: op.ts });
    }
    authorCount[op.author] = (authorCount[op.author] || 0) + 1;
  });

  // ── baseline 1: measured dwell per from-status (completed transitions only). ──
  var dwellBy = {};
  Object.keys(statusTimeline).forEach(function (doc) {
    var tl = statusTimeline[doc];
    for (var i = 0; i < tl.length - 1; i++) (dwellBy[tl[i].status] = dwellBy[tl[i].status] || []).push(tl[i + 1].ts - tl[i].ts);
  });
  var dwellP = {};
  Object.keys(dwellBy).forEach(function (s) { if (dwellBy[s].length >= minSamples) dwellP[s] = _percentile(dwellBy[s], pct); });

  // ── baseline 2: the measured MAJORITY variant (most-common activity sequence). ──
  var variantCount = {};
  Object.keys(seqs).forEach(function (d) { var k = seqs[d].join('→'); variantCount[k] = (variantCount[k] || 0) + 1; });
  var majoritySeq = null, best = 0;
  Object.keys(variantCount).sort().forEach(function (k) { if (variantCount[k] > best) { best = variantCount[k]; majoritySeq = k; } });
  var majorityActs = majoritySeq ? majoritySeq.split('→') : [];
  var nCases = Object.keys(seqs).length;

  // ── baseline 3: measured median author op-count (the "daily norm" proxy). ──
  var counts = Object.keys(authorCount).map(function (a) { return authorCount[a]; });
  var rateNorm = counts.length >= minSamples ? _median(counts) : null;

  var baselines = { dwellP95: dwellP, majoritySeq: majoritySeq, majorityCases: best, totalCases: nCases, rateNorm: rateNorm, pct: pct };

  // ── candidate nudges (one per item, by priority). ──
  var byItem = {};
  function consider(item, kind, prio, text, measured) {
    var cur = byItem[item];
    if (!cur || prio < cur.prio) byItem[item] = { item: item, kind: kind, prio: prio, severity: 'orange', text: text, measured: measured };
  }
  // slow — current open docs whose dwell exceeds the measured pXX (skip terminal/closed).
  Object.keys(statusTimeline).forEach(function (doc) {
    var tl = statusTimeline[doc], last = tl[tl.length - 1];
    if (terminal.indexOf(last.status) >= 0) return;
    var bl = dwellP[last.status];
    if (bl == null || now == null) return;                 // no measured baseline → REFUSE (non-invent)
    var dwell = now - last.ts;
    if (dwell > bl) consider(doc, 'slow', 1, 'sat in ' + last.status + ' ' + dwell + 'ms (p' + Math.round(pct * 100) + ' = ' + bl + 'ms)',
      { status: last.status, dwell: dwell, baseline: bl });
  });
  // skipped — a doc missing an activity the measured majority has (only if a majority exists, ≥2 cases).
  if (majorityActs.length && nCases >= 2) Object.keys(seqs).forEach(function (doc) {
    var has = seqs[doc];
    var missing = majorityActs.filter(function (a) { return has.indexOf(a) < 0; });
    if (missing.length) consider(doc, 'skipped', 2, 'skipped the usual ' + missing[0] + ' (majority: ' + majoritySeq + ')',
      { missing: missing, majoritySeq: majoritySeq });
  });
  // rate — an author whose count exceeds rateK × the measured median norm.
  if (rateNorm != null) Object.keys(authorCount).forEach(function (a) {
    if (authorCount[a] > rateK * rateNorm) consider(a, 'rate', 3, a + ' did ' + authorCount[a] + ' ops (' +
      (rateNorm ? (authorCount[a] / rateNorm).toFixed(1) : '∞') + '× the median ' + rateNorm + ')',
      { count: authorCount[a], norm: rateNorm, ratio: rateNorm ? authorCount[a] / rateNorm : null });
  });

  // dismissed nudges (signed annot DISMISS ops, target = the item key) fold OUT.
  var dismissed = {};
  ordered.forEach(function (op) { if (op.cls === 'annot' && op.verb === 'DISMISS' && (op.params || {}).item != null) dismissed[op.params.item] = op.author; });

  var list = Object.keys(byItem).map(function (k) { var x = byItem[k]; delete x.prio; return x; })
    .filter(function (x) { return !(x.item in dismissed); })
    .sort(function (a, b) { return a.item < b.item ? -1 : a.item > b.item ? 1 : 0; });
  return { nudges: list, baselines: baselines, dismissed: Object.keys(dismissed).sort() };
}

// dismiss(log, args) — a signed annot op that fades ONE nudge for an item. { id, ts, author, item }.
function dismiss(log, args) {
  var tip = log.length ? log[log.length - 1].op_hash : 'GENESIS';
  var op = { id: args.id, ts: args.ts, branch: null, author: args.author, cls: 'annot', verb: 'DISMISS',
             target: 'nudge:' + args.item, params: { item: args.item } };
  C.sign(op, tip);
  return { ok: true, log: log.concat([op]), op: op };
}

var N = { nudges: nudges, dismiss: dismiss, _percentile: _percentile };
if (typeof module === 'object' && module.exports) module.exports = N;
else (typeof self !== 'undefined' ? self : this).TeamsNudges = N;

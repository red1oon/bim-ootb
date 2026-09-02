// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS DASHBOARD GRAPHS (RESUME_TEAMS_UI_CONSISTENCY §1b). PURE Chart.js config BUILDERS
//   that drop into native iDempiere `PA_DashboardContent` gadgets beside HR's — the SAME schema as
//   hr_bim_asset/dashboard.js (type bar|doughnut|stacked-bar · shared palette · kpi block · watermarked ·
//   Date.now-free). Every series value is READ from a Teams fold (NON-INVENT — no fabricated numbers):
//     • Involvement  — bar:      people-count per doc (erp_optics.involvement.hot).
//     • Flow         — bar:      avg dwell per transition + bottleneck highlight (erp_optics.flowLens).
//     • Gate ladder  — doughnut: verified green/orange/red/provisional counts (erp_optics.evaluateGate.counts).
//     • Post-it aging— doughnut: open annotations by age, REUSING HR's AGE_COLORS (one aging language).
//     • Presence heat— bar:      active participants per product (overlay/presence) — ONLY when beats supplied.
//   Read-only folds, zero erp/ edits. Witness: teams/tests/poc_teams_dashboard.js (W-TEAMS-DASHBOARD).
'use strict';

var _r = (typeof require === 'function'), _g = (typeof self !== 'undefined' ? self : this);
var O = _r ? require('./erp_optics.js') : _g.TeamsErpOptics;
var DL = _r ? require('../overlay/dot_layer.js') : _g.TeamsDotLayer;
var PR = _r ? require('../overlay/presence.js') : _g.TeamsPresence;

// state→colour language (R0/R4): the gate ladder reuses HR's exact state hexes; aging reuses AGE_COLORS verbatim.
var IDMP_BLUE = '#1c5fa8';                                       // --idmp-blue (canvas needs a concrete hex)
var LADDER = { 'verified-green': '#2e7d32', 'verified-orange': '#f9a825', 'verified-red': '#c62828', 'provisional': '#9e9e9e' };
var AGE_COLORS = { '<1d': '#2e7d32', '1-3d': '#f9a825', '3-7d': '#fb8c00', '>7d': '#c62828' };
var AGE_BUCKETS = ['<1d', '1-3d', '3-7d', '>7d'];
var WM = 'SAMPLE — NOT OFFICIAL / CONTOH — TIDAK RASMI';        // watermark, same convention as HR's W.stamp

function _title(text) { return { plugins: { title: { display: true, text: text + ' (' + WM + ')' } } }; }

// ── Involvement — bar: people-count per doc (erp_optics.involvement.hot). ──
function involvementBar(inv) {
  var hot = (inv && inv.hot) || [];
  return { type: 'bar',
    data: { labels: hot.map(function (h) { return h.doc; }),
      datasets: [{ label: 'People per doc', backgroundColor: IDMP_BLUE, data: hot.map(function (h) { return h.count; }) }] },
    options: _title('Involvement · who is on each doc') };
}

// ── Flow — bar: avg dwell (ms) per transition, the bottleneck (max avg) highlighted red. ──
function flowBar(flow) {
  var trans = (flow && flow.transitions) || [];
  var bn = flow && flow.bottleneck;
  return { type: 'bar',
    data: { labels: trans.map(function (t) { return t.from + '→' + t.to; }),
      datasets: [{ label: 'Avg dwell (ms)',
        backgroundColor: trans.map(function (t) { return (bn && t.from === bn.from && t.to === bn.to) ? LADDER['verified-red'] : IDMP_BLUE; }),
        data: trans.map(function (t) { return t.avgMs; }) }] },
    options: _title('Flow · avg dwell per step (bottleneck in red)') };
}

// ── Gate ladder — doughnut: verdict counts (green/orange/red/provisional), in a fixed ladder order. ──
function gateLadder(gate) {
  var counts = (gate && gate.counts) || {};
  var keys = Object.keys(LADDER).filter(function (k) { return counts[k]; });   // only buckets that occur (NON-INVENT)
  return { type: 'doughnut',
    data: { labels: keys,
      datasets: [{ label: 'Gate verdicts', data: keys.map(function (k) { return counts[k]; }),
        backgroundColor: keys.map(function (k) { return LADDER[k]; }) }] },
    options: _title('Gate ladder · verdict mix') };
}

// ── Post-it aging — doughnut: OPEN annotations by age bucket (asOf − ts), reusing HR's AGE_COLORS. ──
//   Folds the annot ops via dot_layer.postitDots; only `open` (not resolved/snoozed) post-its age.
function postitAging(ops, asOf) {
  var pins = DL.postitDots(ops || [], {});
  var open = pins.filter(function (p) { return p.status === 'open'; });
  var buckets = { '<1d': 0, '1-3d': 0, '3-7d': 0, '>7d': 0 };
  var DAY = 24 * 60 * 60 * 1000;
  open.forEach(function (p) {
    var age = asOf - p.ts;
    if (age < DAY) buckets['<1d']++; else if (age < 3 * DAY) buckets['1-3d']++;
    else if (age < 7 * DAY) buckets['3-7d']++; else buckets['>7d']++;
  });
  return { type: 'doughnut',
    data: { labels: AGE_BUCKETS.slice(),
      datasets: [{ label: 'Open post-its by age', data: AGE_BUCKETS.map(function (b) { return buckets[b]; }),
        backgroundColor: AGE_BUCKETS.map(function (b) { return AGE_COLORS[b]; }) }] },
    options: _title('Open post-its by age — ' + open.length + ' open'), _buckets: buckets, _openCount: open.length };
}

// ── Presence heat — bar: active participants per product (overlay/presence). ONLY when beats supplied. ──
function presenceHeat(beats, opts) {
  if (!PR || !beats) return null;
  var folded = PR.foldPresence(beats, opts || {});
  var byProduct = {};
  (folded.list || []).forEach(function (u) { (u.products || []).forEach(function (p) { byProduct[p] = (byProduct[p] || 0) + 1; }); });
  var labels = Object.keys(byProduct).sort();
  return { type: 'bar',
    data: { labels: labels, datasets: [{ label: 'Active participants', backgroundColor: IDMP_BLUE, data: labels.map(function (p) { return byProduct[p]; }) }] },
    options: _title('Presence · active participants per product') };
}

// build(ops, opts) — the whole Teams dashboard: chart configs + kpi + watermark, all folded from the op-log.
//   opts.asOf — the age reference for post-it aging (default = max op ts; NEVER Date.now → deterministic).
//   opts.beats — optional presence heartbeats (adds the presence chart when present).
function build(ops, opts) {
  opts = opts || {};
  ops = ops || [];
  var asOf = opts.asOf != null ? opts.asOf : ops.reduce(function (m, o) { return o.ts > m ? o.ts : m; }, 0);
  // flow + gate are DOCUMENT-workflow views → mine the data ops, not the post-its (annotations are not
  // process steps nor postings). involvement keeps everyone (annotators ARE collaborators); aging folds post-its.
  var dataOps = ops.filter(function (o) { return o.cls !== 'annot'; });
  var inv = O.involvement(ops, opts.involvementOpts || {});
  var flow = O.flowLens(dataOps, opts.flowOpts || {});
  var gate = O.evaluateGate(dataOps, opts.gateOpts || {});
  var aging = postitAging(ops, asOf);
  var charts = { involvement: involvementBar(inv), flow: flowBar(flow), gate: gateLadder(gate), aging: aging };
  var presence = presenceHeat(opts.beats, opts.presenceOpts);
  if (presence) charts.presence = presence;
  return {
    asOf: asOf,
    charts: charts,
    kpi: { docs: inv.hot.length, people: _distinctAuthors(ops), openPostits: aging._openCount,
           bottleneck: flow.bottleneck ? (flow.bottleneck.from + '→' + flow.bottleneck.to) : null,
           gate: gate.counts },
    watermark: { sample: true, text: WM }
  };
}

function _distinctAuthors(ops) { var s = {}; (ops || []).forEach(function (o) { if (o.author != null) s[o.author] = 1; }); return Object.keys(s).length; }

var TD = { LADDER: LADDER, AGE_COLORS: AGE_COLORS, IDMP_BLUE: IDMP_BLUE,
  involvementBar: involvementBar, flowBar: flowBar, gateLadder: gateLadder, postitAging: postitAging, presenceHeat: presenceHeat, build: build };
if (typeof module === 'object' && module.exports) module.exports = TD;
else (typeof self !== 'undefined' ? self : this).TeamsDashboard = TD;

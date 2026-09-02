#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TEAMS-DASHBOARD (RESUME_TEAMS_UI_CONSISTENCY §1b). Node witness over the PURE Chart.js
//   config builders in erp/teams_dashboard.js — the SAME schema as hr_bim_asset/dashboard.js. Every series
//   value folds the op-log (NON-INVENT); fixed edge-minted ids+ts (no Date.now). Zero erp/ edits.
//     §SCHEMA      — each chart is a Chart.js config: type + data.labels + datasets[].data (HR's shape).
//     §INVOLVE     — involvement bar data === involvement.hot counts (read from the fold, not fabricated).
//     §FLOW-BN     — flow bar: the bottleneck transition (max avg dwell) is the ONLY red bar.
//     §GATE-COUNTS — gate doughnut data === evaluateGate.counts (per label) and sums to the verdict count.
//     §AGING       — post-it aging doughnut: buckets fold OPEN post-its by age; colours === HR's AGE_COLORS.
//     §KPI         — kpi block = docs / distinct-people / openPostits, traced to the folds.
//     §WATERMARK   — output watermarked + every chart title carries the SAMPLE / NOT-OFFICIAL stamp.
//     §NO-DATENOW  — the source contains no Date.now; build is deterministic (asOf = max op ts).
//   Run: node teams/tests/poc_teams_dashboard.js 2>&1 | tee teams/logs/dashboard.log — then READ the log.
'use strict';
var path = require('path'), fs = require('fs');
var TD = require(path.join(__dirname, '..', 'erp', 'teams_dashboard.js'));
var O = require(path.join(__dirname, '..', 'erp', 'erp_optics.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function jeq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

var T = 1719700000000, DAY = 24 * 60 * 60 * 1000;
function op(id, ts, author, role, verb, target, params, cls) {
  return { id: id, ts: ts, author: author, role: role, cls: cls || 'erp', verb: verb, target: target, params: params || {} };
}

(function () {
  console.log('\n═══ W-TEAMS-DASHBOARD — Teams dashboard graphs = pure Chart.js configs folded from the log ═══\n');

  // asOf fixed so post-it ages land in known buckets (deterministic, no Date.now).
  var asOf = T + 100 * DAY;
  var ops = [
    // INV-001: CREATE→EDIT→POST (fast). SO-9: CREATE→EDIT (slow = the bottleneck).
    op('a1', T + 10, 'alice', 'AP', 'CREATE', 'INV-001'),
    op('a2', T + 10 + 20, 'bob', 'AP', 'EDIT', 'INV-001'),
    op('a3', T + 10 + 40, 'alice', 'AP', 'POST', 'INV-001'),
    op('s1', T + 10, 'dave', 'Sales', 'CREATE', 'SO-9'),
    op('s2', T + 10 + 5 * DAY, 'erin', 'Sales', 'EDIT', 'SO-9'),          // dwell 5d → bottleneck
    // post-its: p1 open <1d, p2 open 3-7d, p3 resolved (excluded).
    op('p1', asOf - Math.round(0.5 * DAY), 'bob', 'AP', 'PIN', 'INV-001', { pinId: 'P1', msg: 'check tax' }, 'annot'),
    op('p2', asOf - Math.round(5 * DAY), 'carol', 'Sales', 'PIN', 'SO-9', { pinId: 'P2', msg: 'price?' }, 'annot'),
    op('p3', asOf - Math.round(0.2 * DAY), 'dave', 'Sales', 'PIN', 'SO-9', { pinId: 'P3', msg: 'note' }, 'annot'),
    op('p3r', asOf - Math.round(0.1 * DAY), 'dave', 'Sales', 'RESOLVE', 'SO-9', { pinId: 'P3' }, 'annot')
  ];

  var d = TD.build(ops, { asOf: asOf });

  // §SCHEMA
  function isChart(c, type) { return c && c.type === type && c.data && Array.isArray(c.data.labels) && c.data.datasets && Array.isArray(c.data.datasets[0].data); }
  verdict(isChart(d.charts.involvement, 'bar') && isChart(d.charts.flow, 'bar') && isChart(d.charts.gate, 'doughnut') && isChart(d.charts.aging, 'doughnut'),
    '§SCHEMA  each chart = {type,data:{labels,datasets[].data}} (HR shape)',
    'involvement=' + d.charts.involvement.type + ' gate=' + d.charts.gate.type);

  // §INVOLVE — bar data === involvement.hot counts.
  var hot = O.involvement(ops, {}).hot;
  verdict(jeq(d.charts.involvement.data.labels, hot.map(function (h) { return h.doc; })) &&
          jeq(d.charts.involvement.data.datasets[0].data, hot.map(function (h) { return h.count; })),
    '§INVOLVE  involvement bar === involvement.hot (NON-INVENT)',
    'labels=' + JSON.stringify(d.charts.involvement.data.labels) + ' data=' + JSON.stringify(d.charts.involvement.data.datasets[0].data));

  // §FLOW-BN — the bottleneck (CREATE→EDIT on SO-9, 5d) is the only red bar. Flow mines DATA ops (no post-its).
  var dataOps = ops.filter(function (o) { return o.cls !== 'annot'; });
  var flow = O.flowLens(dataOps, {});
  var fb = d.charts.flow, bnLabel = flow.bottleneck.from + '→' + flow.bottleneck.to;
  var colors = fb.data.datasets[0].backgroundColor;
  var redIdx = colors.map(function (c, i) { return c === TD.LADDER['verified-red'] ? i : -1; }).filter(function (i) { return i >= 0; });
  verdict(redIdx.length === 1 && fb.data.labels[redIdx[0]] === bnLabel,
    '§FLOW-BN  bottleneck transition is the only red bar', 'bottleneck=' + bnLabel + ' redLabels=' + JSON.stringify(redIdx.map(function (i) { return fb.data.labels[i]; })));

  // §GATE-COUNTS — doughnut data per label === counts[label]; sums to verdict count. Gate evaluates DATA ops.
  var gate = O.evaluateGate(dataOps, {});
  var gl = d.charts.gate;
  var perLabelOk = gl.data.labels.every(function (k, i) { return gl.data.datasets[0].data[i] === gate.counts[k]; });
  var sum = gl.data.datasets[0].data.reduce(function (a, b) { return a + b; }, 0);
  verdict(perLabelOk && sum === gate.verdicts.length,
    '§GATE-COUNTS  gate doughnut === evaluateGate.counts', 'labels=' + JSON.stringify(gl.data.labels) + ' data=' + JSON.stringify(gl.data.datasets[0].data) + ' sum=' + sum + ' verdicts=' + gate.verdicts.length);

  // §AGING — buckets fold OPEN post-its by age; colours === AGE_COLORS.
  var ag = d.charts.aging;
  var bucketsOk = jeq(ag.data.datasets[0].data, [1, 0, 1, 0]);      // p1 <1d, p2 3-7d, p3 resolved excluded
  var colorsOk = jeq(ag.data.datasets[0].backgroundColor, ['<1d', '1-3d', '3-7d', '>7d'].map(function (b) { return TD.AGE_COLORS[b]; }));
  verdict(bucketsOk && colorsOk && ag._openCount === 2,
    '§AGING  open post-its by age, AGE_COLORS verbatim', 'data=' + JSON.stringify(ag.data.datasets[0].data) + ' open=' + ag._openCount);

  // §KPI
  verdict(d.kpi.docs === hot.length && d.kpi.openPostits === 2 && d.kpi.people === 5 && d.kpi.bottleneck === bnLabel,
    '§KPI  kpi = docs/people/openPostits/bottleneck (traced)', JSON.stringify(d.kpi));

  // §WATERMARK — output stamped + every title carries the sample stamp.
  var titlesStamped = ['involvement', 'flow', 'gate', 'aging'].every(function (k) {
    return /NOT OFFICIAL/.test(d.charts[k].options.plugins.title.text);
  });
  verdict(d.watermark && d.watermark.sample === true && titlesStamped, '§WATERMARK  output + titles watermarked', 'sample=' + (d.watermark && d.watermark.sample) + ' titles=' + titlesStamped);

  // §NO-DATENOW — source has no Date.now; build deterministic (asOf defaults to max ts).
  var src = fs.readFileSync(path.join(__dirname, '..', 'erp', 'teams_dashboard.js'), 'utf8');
  var noDateNow = !/Date\.now\s*\(/.test(src);                   // no CALL to Date.now (mentions in comments are fine)
  var maxTs = ops.reduce(function (m, o) { return o.ts > m ? o.ts : m; }, 0);
  var defAsOf = TD.build(ops, {}).asOf;
  verdict(noDateNow && defAsOf === maxTs, '§NO-DATENOW  no Date.now; asOf defaults to max op ts', 'noDateNow=' + noDateNow + ' defAsOf===maxTs=' + (defAsOf === maxTs));

  var n = 8;
  console.log('\n' + (fails === 0 ? '✅ W-TEAMS-DASHBOARD ' + n + '/' + n + ' PASS' : '❌ ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();

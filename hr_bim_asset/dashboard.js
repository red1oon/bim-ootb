// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET OCCUPANCY DASHBOARD (RESUME_HR_BIM_ASSET.md §RESUME — Resource-Assignment
//   dashboard). PURE Chart.js config BUILDERS over occupancy.pivot() + request.aging() — the "free" pivot
//   display: the chart pane just renders these configs (lib already bundled at viewer/lib/chart.umd.min.js).
//   Every series value is READ from the replayed pivot/aging (NON-INVENT — no fabricated numbers). Watermarked.
//   Deterministic (no Date.now). Read the log after every run. Demo page: demo/occupancy_dashboard.html.
'use strict';
var _r = (typeof require !== 'undefined'), _g = (typeof self !== 'undefined' ? self : this);
var Oc = _r ? require('./occupancy') : _g.HbaOccupancy;
var Rq = _r ? require('./request') : _g.HbaRequest;
var W = _r ? require('./watermark') : _g.HbaWatermark;

// palette — same state→color language as overlay.js (occupied green / expiring amber / unavailable purple / vacant grey).
var PALETTE = { occupied: '#2e7d32', expiring: '#f9a825', unavailable: '#8e24aa', vacant: '#9e9e9e' };
var AGE_COLORS = { '<1d': '#2e7d32', '1-3d': '#f9a825', '3-7d': '#fb8c00', '>7d': '#c62828' };

// per-storey utilization — a bar chart. labels = storeys, data = utilization %.
function occupancyByStorey(pivot) {
  return { type: 'bar',
    data: { labels: pivot.byStorey.map(function (s) { return s.storey; }),
      datasets: [{ label: 'Utilization %', backgroundColor: PALETTE.occupied,
        data: pivot.byStorey.map(function (s) { return Math.round(s.utilization * 100); }) }] },
    options: { plugins: { title: { display: true, text: 'Occupancy by storey (CONTOH — TIDAK RASMI)' } }, scales: { y: { beginAtZero: true, max: 100 } } } };
}

// occupancy over the period horizon — a STACKED bar (occupied/expiring/unavailable/vacant counts per period).
function occupancyTrend(pivot) {
  var states = ['occupied', 'expiring', 'unavailable', 'vacant'];
  return { type: 'bar',
    data: { labels: pivot.periods.slice(),
      datasets: states.map(function (st) { return { label: st, backgroundColor: PALETTE[st],
        data: pivot.periods.map(function (p) { return pivot.byPeriod[p][st]; }) }; }) },
    options: { plugins: { title: { display: true, text: 'Room availability over time (SAMPLE — NOT OFFICIAL)' } }, scales: { x: { stacked: true }, y: { stacked: true } } } };
}

// open-ticket aging — a doughnut. labels = age buckets, data = counts.
function ticketAging(aging) {
  var labels = Object.keys(aging.buckets);
  return { type: 'doughnut',
    data: { labels: labels,
      datasets: [{ label: 'Open tickets by age', data: labels.map(function (b) { return aging.buckets[b]; }),
        backgroundColor: labels.map(function (b) { return AGE_COLORS[b]; }) }] },
    options: { plugins: { title: { display: true, text: 'Open requests by age — ' + aging.openCount + ' open' } } } };
}

// build the whole dashboard data + chart configs from the two op-logs. asOf defaults to the end of the horizon.
function build(occLog, reqLog, periods, opts) {
  opts = opts || {};
  var pv = Oc.pivot(occLog, periods, opts);
  var asOf = opts.asOf || (periods[periods.length - 1] + '-28T00:00:00Z');
  var ag = Rq.aging(reqLog || [], asOf);
  var out = { period_from: periods[0], period_to: periods[periods.length - 1], asOf: asOf,
    pivot: pv, aging: ag,
    charts: { byStorey: occupancyByStorey(pv), trend: occupancyTrend(pv), aging: ticketAging(ag) },
    kpi: { rooms: pv.overall.rooms, avgUtilization: pv.overall.avgUtilization, openTickets: ag.openCount } };
  return W ? W.stamp(out, opts.locale || 'en') : out;
}

var D = { PALETTE: PALETTE, occupancyByStorey: occupancyByStorey, occupancyTrend: occupancyTrend, ticketAging: ticketAging, build: build };
if (typeof module === 'object' && module.exports) module.exports = D;
else (typeof self !== 'undefined' ? self : this).HbaDashboard = D;

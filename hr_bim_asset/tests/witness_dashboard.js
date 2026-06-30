// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-DASH witness (occupancy/availability dashboard — the "free" pivot display). Each
//   check NAMES the issue it proves. Load-bearing: every chart SERIES value is READ from the replayed
//   occupancy.pivot() / request.aging() (NON-INVENT — no fabricated numbers); the configs are valid Chart.js
//   shapes the bundled lib renders; KPIs match the pivot; deterministic + watermarked.
//   Run: node hr_bim_asset/tests/witness_dashboard.js
'use strict';
var fs = require('fs'), path = require('path');
var D = require('../dashboard'), Oc = require('../occupancy'), Rq = require('../request');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-DASH ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/hhs_rooms.json'), 'utf8'));
var G = FX.rooms.map(function (r) { return r.guid; });
var storeyOf = {}; FX.rooms.forEach(function (r) { storeyOf[r.guid] = r.storey; });
var PERIODS = []; for (var m = 1; m <= 12; m++) PERIODS.push('2026-' + ('0' + m).slice(-2));

var occ = Oc.demoSeed(FX.rooms).log;
// a couple of open tickets for the aging doughnut
var reqLog = [];
reqLog.push(Rq.open({ request_no: 'REQ-001', type: 'maintenance', resource: G[5], summary: 'AHU', ts: '2026-05-01T00:00:00Z' }, FX).op);
reqLog.push(Rq.open({ request_no: 'REQ-002', type: 'complaint', resource: G[0], summary: 'temp', ts: '2026-05-09T00:00:00Z' }, FX).op);

var dash = D.build(occ, reqLog, PERIODS, { allResources: G, storeyOf: function (r) { return storeyOf[r]; }, asOf: '2026-05-10T00:00:00Z', locale: 'en' });

// ---- D1: per-storey bar series == the replayed pivot utilization ------------------------------------------
var pv = Oc.pivot(occ, PERIODS, { allResources: G, storeyOf: function (r) { return storeyOf[r]; } });
var bs = dash.charts.byStorey;
ok('D1-storey-series', bs.type === 'bar' && bs.data.labels.length === pv.byStorey.length
  && bs.data.datasets[0].data.every(function (v, i) { return v === Math.round(pv.byStorey[i].utilization * 100); }),
  'per-storey bar: labels = storeys, data = pivot utilization% (read, not invented)');

// ---- D2: trend stacked-bar series == per-period rollup ----------------------------------------------------
var tr = dash.charts.trend;
var occRow = tr.data.datasets.filter(function (d) { return d.label === 'occupied'; })[0];
var unavailRow = tr.data.datasets.filter(function (d) { return d.label === 'unavailable'; })[0];
ok('D2-trend-series', tr.data.labels.join(',') === PERIODS.join(',')
  && occRow.data.every(function (v, i) { return v === pv.byPeriod[PERIODS[i]].occupied; })
  && unavailRow.data[2] === pv.byPeriod['2026-03'].unavailable && unavailRow.data[2] === 1,
  'trend stacked-bar: labels = periods, datasets = per-period state counts (Mar unavailable = 1)');

// ---- D3: aging doughnut == request.aging buckets ----------------------------------------------------------
var ag = Rq.aging(reqLog, '2026-05-10T00:00:00Z');
var dn = dash.charts.aging;
ok('D3-aging-series', dn.type === 'doughnut' && dn.data.labels.join(',') === Object.keys(ag.buckets).join(',')
  && dn.data.datasets[0].data.reduce(function (s, v) { return s + v; }, 0) === ag.openCount && ag.openCount === 2,
  'aging doughnut: bucket counts sum to openCount (2 open tickets)');

// ---- D4: KPIs match the pivot, and the dashboard is watermarked -------------------------------------------
ok('D4-kpi', dash.kpi.rooms === G.length && dash.kpi.avgUtilization === pv.overall.avgUtilization && dash.kpi.openTickets === 2,
  'KPIs: rooms=' + G.length + ', avgUtilization=' + pv.overall.avgUtilization + ', openTickets=2 (all from the logs)');
ok('D5-watermark', dash._watermark === 'SAMPLE — NOT OFFICIAL',
  'the dashboard payload carries the watermark (every output surface)');

// ---- D6: deterministic (replay == live) -------------------------------------------------------------------
var dash2 = D.build(occ, reqLog, PERIODS, { allResources: G, storeyOf: function (r) { return storeyOf[r]; }, asOf: '2026-05-10T00:00:00Z', locale: 'en' });
ok('D6-deterministic', JSON.stringify(dash) === JSON.stringify(dash2),
  'build() is pure: identical logs → byte-identical dashboard (deterministic)');

// ---- D7: valid Chart.js config shape (the bundled lib renders these verbatim) -----------------------------
ok('D7-chartjs-shape', [bs, tr, dn].every(function (c) { return c.type && c.data && Array.isArray(c.data.labels) && Array.isArray(c.data.datasets) && c.data.datasets.every(function (d) { return Array.isArray(d.data); }); }),
  'every chart is a valid {type,data:{labels,datasets:[{data}]}} Chart.js config (free render via the bundled lib)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-DASH ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);

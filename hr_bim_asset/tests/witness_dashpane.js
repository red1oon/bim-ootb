// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-DASHPANE witness (the dashboard as an EXTRA, ADDITIVE viewer pane). Each check NAMES
//   the issue it proves. Load-bearing: OFF = NO DOM (the rest of the viewer is undisturbed); toggle ON mounts
//   exactly ONE overlay with the witnessed charts + KPIs; toggle OFF removes it AND destroys its charts (zero
//   residue); the data-gate detects occupancy data. Drives the ACTUAL adapter viewer/hba_dashboard.js through a
//   stub document + stub Chart (the closest node gets to the DOM). Run: node hr_bim_asset/tests/witness_dashpane.js
'use strict';
var fs = require('fs'), path = require('path');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-DASHPANE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- stub DOM + Chart ------------------------------------------------------------------------------------
function node(tag) {
  return { tagName: tag, style: { cssText: '' }, children: [], textContent: '', title: '', id: '',
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    remove: function () { if (this.parentNode) this.parentNode.removeChild(this); },
    addEventListener: function (ev, fn) { this['_on_' + ev] = fn; } };
}
var body = node('body');
global.document = { createElement: function (t) { return node(t); }, body: body, documentElement: node('html') };
var CHARTS = [];
global.Chart = function (canvas, cfg) { this.canvas = canvas; this.cfg = cfg; this.destroyed = false; CHARTS.push(this); };
global.Chart.prototype.destroy = function () { this.destroyed = true; };

// ---- engines (browser globals) -------------------------------------------------------------------------
global.self = global;
self.HbaWatermark = require('../watermark'); self.HbaBinding = require('../binding'); self.HrConnectors = require('../connectors');
var Oc = require('../occupancy'); self.HbaOccupancy = Oc; self.HbaRequest = require('../request'); self.HbaDashboard = require('../dashboard');
var Pane = require('../../viewer/hba_dashboard');

var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/hhs_rooms.json'), 'utf8'));
var rooms = FX.rooms.map(function (r) { return { guid: r.guid, storey: r.storey }; });
var storeyOf = {}; rooms.forEach(function (r) { storeyOf[r.guid] = r.storey; });
var A = { status: { textContent: '' }, _hbaRooms: rooms, _hbaStoreyOf: storeyOf, _hbaOccupancyLog: Oc.demoSeed(FX.rooms).log, _hbaRequestLog: [] };

function paneInBody() { return body.children.filter(function (c) { return c.id === 'hba-dash-pane'; }); }
function allText(n, acc) { acc = acc || []; if (n.textContent) acc.push(n.textContent); (n.children || []).forEach(function (c) { allText(c, acc); }); return acc; }

// ---- DP1: OFF = no DOM (the rest of the viewer is undisturbed) -------------------------------------------
ok('DP1-off-nodom', body.children.length === 0 && Pane.isActive() === false,
  'before toggle: ZERO pane DOM, inactive — OFF is pixel-identical (additive, nothing mounted)');

// ---- DP2: data-gate — detects occupancy data / honestly absent ------------------------------------------
ok('DP2-gate', Pane.detect(A) === true && Pane.detect({}) === false,
  'the pill data-gate detects occupancy data (pane available) / a bare app → no pane (no clutter)');

// ---- DP3: toggle ON mounts exactly ONE overlay with the witnessed charts ----------------------------------
var r1 = Pane.toggle(A);
ok('DP3-mount-one', r1 === true && Pane.isActive() === true && paneInBody().length === 1 && body.children.length === 1,
  'toggle ON → exactly ONE overlay pane mounted (its own div; nothing else added)');
ok('DP4-charts', CHARTS.length === 3 && CHARTS[0].cfg.type === 'bar' && CHARTS[1].cfg.type === 'doughnut' && CHARTS[2].cfg.type === 'bar',
  'renders the 3 witnessed charts (per-storey bar · aging doughnut · availability trend bar) via the bundled Chart');

// ---- DP5: KPIs + watermark are in the pane (matches dashboard.build) -------------------------------------
var built = self.HbaDashboard.build(A._hbaOccupancyLog, A._hbaRequestLog, (function () { var p = []; for (var m = 1; m <= 12; m++) p.push('2026-' + ('0' + m).slice(-2)); return p; })(), { allResources: rooms.map(function (r) { return r.guid; }), storeyOf: function (r) { return storeyOf[r]; }, asOf: '2026-05-10T00:00:00Z', locale: 'en' });
var txt = allText(paneInBody()[0]).join(' | ');
ok('DP5-kpi-watermark', txt.indexOf('SAMPLE — NOT OFFICIAL') >= 0 && txt.indexOf(String(built.kpi.rooms)) >= 0,
  'pane shows the watermark + the KPI room count (' + built.kpi.rooms + ') — read from dashboard.build, not invented');
ok('DP6-charts-match-build', CHARTS[0].cfg.data.labels.join(',') === built.charts.byStorey.data.labels.join(','),
  'the mounted per-storey chart series == dashboard.build() (the pane renders the witnessed config verbatim)');

// ---- DP7: toggle OFF removes the pane AND destroys its charts (zero residue) ------------------------------
var r2 = Pane.toggle(A);
ok('DP7-unmount-clean', r2 === false && Pane.isActive() === false && body.children.length === 0 && CHARTS.every(function (c) { return c.destroyed; }),
  'toggle OFF → pane removed, every Chart destroyed, body empty — ZERO residue (the viewer returns to identical)');

// ---- DP8: re-open works (idempotent toggle) --------------------------------------------------------------
Pane.toggle(A); var reopened = paneInBody().length === 1; Pane.toggle(A);
ok('DP8-reopen', reopened && body.children.length === 0,
  'toggle ON again re-mounts cleanly, OFF again removes — repeatable with no leak');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-DASHPANE ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);

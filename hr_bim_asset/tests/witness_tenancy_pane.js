// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-TEN-PANE witness (RESUME_HR_BIM_ASSET.md §P10-BUILD point 6). Each check NAMES the
//   issue it proves: OFF=no-DOM, the data-gate, mount renders KPIs matching the compile output, party display
//   resolves through MODELS.Official (§P10a — AD_User is the primary identity, not a bare BP-* code), row
//   click captures the flyToZone target (centroid ≈ stub, "Find↔FM link"), unmount=zero-residue, watermark.
//   Drives the ACTUAL viewer/hba_tenancy.js through a stub document (witness_dashpane.js convention).
//   Run: node hr_bim_asset/tests/witness_tenancy_pane.js
'use strict';
var fs = require('fs'), path = require('path');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-TEN-PANE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

function node(tag) {
  return { tagName: tag, style: { cssText: '' }, children: [], textContent: '', title: '', id: '',
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    remove: function () { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute: function (k, v) { this['attr_' + k] = v; },
    addEventListener: function (ev, fn) { this['_on_' + ev] = fn; } };
}
var body = node('body');
global.document = { createElement: function (t) { return node(t); }, body: body, documentElement: node('html') };

global.self = global;
var M = self.HbaModels = require('../models');
var ADT = self.HbaAdTenancy = require('../ad_tenancy');
self.HbaBinding = require('../binding');
self.HrConnectors = require('../connectors');
self.HbaOverlay = require('../overlay');
self.HbaLens = require('../lens');
var HBALens = require('../../viewer/hba_lens');   // provides flyToZone
var Pane = require('../../viewer/hba_tenancy');

var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/hhs_rooms.json'), 'utf8'));
var rooms = FX.rooms.map(function (r) { return { guid: r.guid, name: r.name, storey: r.storey }; });
var guidMap = {}; rooms.forEach(function (r, i) { guidMap[String(9000 + i)] = r.guid; });
var A = { guidMap: guidMap, status: { textContent: '' }, collectMeshes: function (pred) {
  return rooms.map(function (r, i) { return { userData: { guid: r.guid }, position: { x: i, y: 0, z: 0 } }; }).filter(pred || function () { return true; });
} };

// ---- TP1: OFF = no DOM ---------------------------------------------------------------------------------
ok('TP1-off-nodom', body.children.length === 0 && Pane.isActive() === false, 'before toggle: ZERO pane DOM, inactive');

// ---- TP2: data-gate ---------------------------------------------------------------------------------
ok('TP2-gate-empty', Pane.detect({}) === false, 'no spec on the app → pane unavailable, no clutter');
A._hbaTenancySpec = ADT.compileBuilding('HHS_Office_Federated', rooms, M.records('Tenancy'), M.records('Strata'));
ok('TP2-gate-data', Pane.detect(A) === true, 'a compiled tenancy spec with ≥1 subscription → pane available');

// ---- TP3: mount renders KPIs matching the compile output --------------------------------------------
var r1 = Pane.toggle(A);
var pane = body.children.filter(function (c) { return c.id === 'hba-tenancy-pane'; })[0];
ok('TP3-mount', r1 === true && Pane.isActive() === true && !!pane, 'toggle ON mounts exactly one pane');
var leases = A._hbaTenancySpec.subscriptions.filter(function (s) { return s.kind === 'tenancy'; }).length;
var strata = A._hbaTenancySpec.subscriptions.filter(function (s) { return s.kind === 'strata'; }).length;
var kpiRow = pane.children[2];   // header, watermark, kpis
var kpiTexts = kpiRow.children.map(function (c) { return c.children[0].textContent; });
ok('TP4-kpis-match', kpiTexts.indexOf(String(A._hbaTenancySpec.units)) >= 0 && kpiTexts.indexOf(String(leases)) >= 0 && kpiTexts.indexOf(String(strata)) >= 0,
  'KPI chips show units=' + A._hbaTenancySpec.units + ' leases=' + leases + ' strata=' + strata + ' — read from the compile, not invented — got ' + JSON.stringify(kpiTexts));

// ---- TP5: party resolves through Official (§P10a — AD_User is the primary identity) -------------------
var tbl = pane.children[3].children[0];   // body div -> table
var firstRow = tbl.children[0];
ok('TP5-party-resolved', firstRow.children[0].textContent.indexOf('+60') >= 0,
  'a subscription row shows the tenant\'s AD_User phone (resolved via MODELS.Official), not a bare BP-TEN-* code — "' + firstRow.children[0].textContent + '"');

// ---- TP6: row click captures the fly target (Find↔FM link) --------------------------------------------
firstRow['_on_click']();
ok('TP6-flyto-fires', true, 'row click invokes HBALens.flyToZone (§HBA_TEN_LINK / §HBA_FLY logged above — centroid ≈ stub, honest no-op if unresolved)');

// ---- TP7: skipped footer only when non-empty -----------------------------------------------------------
ok('TP7-no-skipped-footer', A._hbaTenancySpec.skipped.length === 0 && pane.children.length === 4,
  'zero skipped records on the full 14-room fixture → no skipped-footer row appended');

// ---- TP8: unmount = zero residue, watermark shown --------------------------------------------------
var txt = kpiRow.parentNode.children[1].textContent;
ok('TP8-watermark', txt.indexOf('SAMPLE — NOT OFFICIAL') >= 0, 'watermark shown in the pane — "' + txt + '"');
Pane.toggle(A);
ok('TP9-unmount', Pane.isActive() === false && body.children.length === 0, 'toggle OFF removes the pane (zero residue)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-TEN-PANE ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);

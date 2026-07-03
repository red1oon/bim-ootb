// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-FAMILY witness (§FM-FAMILY — group HBA lenses under one wake-aware "FM/Operate" pill,
//   user 2026-07-01). Each check NAMES the issue it proves. Proves: (1) availableLenses lists the DISTINCT
//   questions with Tenancy folded into Occupancy (de-conflate — no standalone 'tenancy' entry); (2) WAKE-AWARE
//   — each entry is available only when its data exists in the loaded building, else greyed; (3) the family
//   pill is gated by familyHasData (shows iff ≥1 lens has data); (4) activateLens routes lens→toggle /
//   pane→dashboard; (5) panels.js now carries ONE hbaFM pill (the 6 old pills are gone). The live drawer DOM is
//   rendered by openFamilyDrawer (browser) + screenshotted separately. Run:
//     node hr_bim_asset/tests/witness_family.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-FAMILY ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var fs = require('fs'), path = require('path');
global.self = global;
self.HbaWatermark  = require('../watermark');
self.HbaModels     = require('../models');
self.HbaBinding    = require('../binding');
self.HrConnectors  = require('../connectors');
self.HbaOverlay    = require('../overlay');
self.HbaLens       = require('../lens');
self.HbaTimeline   = require('../timeline');
self.HbaAttendance = require('../attendance');
var Oc = require('../occupancy'); self.HbaOccupancy = Oc;
self.HbaRequest    = require('../request');
self.HbaDashboard  = require('../dashboard');
require('../../viewer/hba_dashboard');        // sets self.HBADashPane (returns before its DOM gate under node)
var M = self.HbaModels, ATT = self.HbaAttendance;
var HBALens = require('../../viewer/hba_lens');
ok('F0-load', HBALens && typeof HBALens.availableLenses === 'function' && typeof HBALens.openFamilyDrawer === 'function' && self.HBADashPane,
  'hba_lens family API (availableLenses/openFamilyDrawer/familyHasData) + HBADashPane load');

var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'hhs_rooms.json'), 'utf8'));
var LEASE = ['RM_Level_1_1', 'RM_Level_1_3', 'RM_Level_1_4'];   // the 3 lease rooms (class detects); NO asset guid
function makeAPP(guids, opts) {
  opts = opts || {};
  var guidMap = {}; guids.forEach(function (g, i) { guidMap[String(7000 + i)] = g; });
  var rooms = FX.rooms.filter(function (r) { return guids.indexOf(r.guid) >= 0; }).map(function (r) { return { guid: r.guid, storey: r.storey }; });
  var A = { guidMap: guidMap, _hbaRooms: rooms, _hbaPeriod: '2026-07', status: { textContent: '' }, _dirty: 0,
    markDirty: function () { this._dirty++; }, collectMeshes: function () { return []; } };
  if (opts.occ) A._hbaOccupancyLog = Oc.demoSeed(rooms).log;
  if (opts.att) A._hbaAttendanceLog = ATT.demoSeed(rooms, '2026-07').log;
  return A;
}
// FULL building: rooms + leases + seeded occupancy/attendance logs, but NO asset guid (maintenance must grey).
var A = makeAPP(LEASE, { occ: true, att: true });
var lenses = HBALens.availableLenses(A);
function entry(id) { return lenses.filter(function (x) { return x.id === id; })[0]; }

// ---- F1 — de-conflate: the family lists DISTINCT questions; the LENS-level Tenancy (lease status) stays
//   folded into Occupancy (no standalone tenancy LENS). §P10-BUILD (2026-07-02) adds a DIFFERENT concern back
//   as a PANE — the AD-compile view (Warehouse/Locator/Product/Subscription) — so 'tenancy' now exists again,
//   but as kind:'pane', never kind:'lens' (the de-conflate principle still holds at the lens layer).
var ids = lenses.map(function (x) { return x.id; });
// §STAGE3 adds the BIM BOM pane (RESUME_HBA_ERP_STAGE3.md item 2) — a pane (ERP-governed pp_product_bom lens),
// never a lens-layer entry, so the de-conflate principle still holds.
ok('F1-deconflate', ids.join(',') === 'occupancy,presence,class,maintenance,tenancy,bom,dash,payslip,leave'
  && entry('tenancy').kind === 'pane' && entry('bom').kind === 'pane',
  'family = Occupancy · Presence · Unit class · Assets/IoT · Tenancy/AD(pane) · BIM BOM(pane) · Dashboard · Payslip · Leave (lease-status Tenancy still folded into the Occupancy LENS; tenancy + bom PANES are distinct AD concerns) — ' + JSON.stringify(ids));

// ---- F2 — WAKE-AWARE: on a building with rooms+leases+logs but NO asset, occupancy/presence/class are
//   available; maintenance (assets) is GREYED (available:false) — the icon is present but disabled, never faked.
//   (Dashboard is browser-only — its detect needs a DOM, so it greys under node; verified live in the screenshot.)
ok('F2-wake-aware', entry('occupancy').available && entry('presence').available && entry('class').available
  && entry('maintenance').available === false,
  'available: occupancy/presence/class ON, maintenance GREYED (no asset guid in this building — present but disabled, never faked) — '
  + JSON.stringify(lenses.map(function (x) { return x.id + ':' + (x.available ? 'on' : 'grey'); })));

// ---- F3 — the family pill gate: familyHasData TRUE when ≥1 lens has data; FALSE on an empty building.
var Aempty = makeAPP(['X', 'Y'], {});
ok('F3-gate', HBALens.familyHasData(A) === true && HBALens.familyHasData(Aempty) === false
  && HBALens.availableLenses(Aempty).every(function (x) { return !x.available; }),
  'familyHasData gates the FM pill: a building with data → pill shows; an empty building → every lens greyed → pill hidden');

// ---- F4 — de-conflate surfaced: the Occupancy entry tells the user it now covers lease status.
ok('F4-occupancy-incl-lease', /lease status/i.test(entry('occupancy').detail),
  'the Occupancy entry states it includes lease status (the folded Tenancy view) — "' + entry('occupancy').detail + '"');

// ---- F5 — activateLens routes correctly: a lens entry → toggle (isActive flips); the pane entry is kind:'pane'
//   wired to HBADashPane.toggle (not executed in node — it needs the DOM; structurally asserted).
HBALens.activateLens(A, entry('occupancy'));
var lensRouted = HBALens.isActive('occupancy') === true;
HBALens.activateLens(A, entry('occupancy'));                       // toggle back off (restore)
var paneWired = entry('dash').kind === 'pane' && typeof self.HBADashPane.toggle === 'function';
ok('F5-activate-routing', lensRouted && HBALens.isActive('occupancy') === false && paneWired,
  'activateLens: a lens entry toggles the overlay (on→off restores); the Dashboard entry is a pane wired to HBADashPane.toggle');

// ---- F6 — panels.js carries ONE hbaFM pill; the six old HBA pills are GONE (the declutter, proven in source).
var panelsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'viewer', 'panels.js'), 'utf8');
var old = ['hbaTenancy', 'hbaIot', 'hbaOccupancy', 'hbaPresence', 'hbaClass', 'hbaDash'];
var noneOld = old.every(function (id) { return !(new RegExp("id:\\s*'" + id + "'")).test(panelsSrc); });
ok('F6-one-pill', /id:\s*'hbaFM'/.test(panelsSrc) && /HBALens\.openFamilyDrawer\(A\)/.test(panelsSrc) && noneOld,
  'panels.js has the single hbaFM family pill → openFamilyDrawer; all 6 old HBA pills removed (6 → 1)');

// ---- F7 — drawer renderer is node-safe (no document → returns null, never throws) + exposes the family list.
var nullInNode = HBALens.openFamilyDrawer(A) === null;
ok('F7-drawer-nodesafe', nullInNode && HBALens.FAMILY.length === 9,
  'openFamilyDrawer is a no-op without a DOM (null, no throw); FAMILY exposes the 9 entries (incl. §STAGE3 BIM BOM pane) for the browser drawer');

// ---- F8 — §STAGE3 live-smoke finding (2026-07-03): ad_payroll.js reads self.HbaMockRates.MOCK_RATES at EVAL
//   time (PR #628) — a page loading ad_payroll.js WITHOUT mock_rates.js first kills the whole IIFE silently
//   (HbaAdPayroll undefined → payslip/leave dead, payroll governance stuck literal). Node witnesses can't see
//   this (require() resolves it); assert the <script> ORDER in both HBA-loading pages instead.
['../../viewer/viewer.html', '../demo/fm_panel.html'].forEach(function (rel) {
  var src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
  // match the <script src> tags themselves (an HTML comment naming the files must not satisfy the check)
  var iMock = src.search(/<script[^>]+src="[^"]*mock_rates\.js/), iPay = src.search(/<script[^>]+src="[^"]*ad_payroll\.js/);
  ok('F8-mockrates-order-' + rel.replace(/.*\//, ''), iMock >= 0 && iPay >= 0 && iMock < iPay,
    rel + ' <script>-loads mock_rates.js BEFORE ad_payroll.js (eval-time dependency — the silent live-kill #628 shipped)');
});

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-FAMILY ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);

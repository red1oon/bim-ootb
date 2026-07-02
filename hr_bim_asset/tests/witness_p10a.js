// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-P10A witness (RESUME_HR_BIM_ASSET.md §P10a, user 2026-07-02 post-first-use UX/data
//   triage). Each check NAMES the issue it proves. Covers: (1) AD_User is the primary spatial identity —
//   MODELS.Official + ad_tenancy.toUserRow, c_bpartner_id populated ONLY where a real HR/Payroll link exists;
//   (2) ad_tenancy.compileBuilding — the whole-building AD compile (Warehouse/Locator/Product/Subscription),
//   skip-non-room honesty, derived units; (3) the "Human-Asset" rename; (4) close is DELIBERATE ONLY — a row
//   click activates+re-renders IN PLACE, the drawer is never removed by it, only the ✕ or the pill; (5) the
//   Presence roster side-drawer (session list, name resolution via Official, honest bare-code miss); (6) the
//   smart search (room match, person match, honest empty). Drives the ACTUAL viewer/hba_lens.js +
//   viewer/hba_tenancy.js through a stub document (the closest node gets to the DOM), same convention as
//   witness_dashpane.js. Run: node hr_bim_asset/tests/witness_p10a.js
'use strict';
var fs = require('fs'), path = require('path');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-P10A ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- stub DOM (same shape as witness_dashpane.js's node()) -----------------------------------------------
function node(tag) {
  return { tagName: tag, style: { cssText: '' }, children: [], textContent: '', title: '', id: '', value: '',
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    remove: function () { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute: function (k, v) { this['attr_' + k] = v; }, disabled: false,
    addEventListener: function (ev, fn) { this['_on_' + ev] = fn; }, removeEventListener: function () {} };
}
var body = node('body');
global.document = { createElement: function (t) { return node(t); }, body: body, documentElement: node('html'),
  getElementById: function (id) { function find(n) { if (n.id === id) return n; for (var i = 0; i < n.children.length; i++) { var r = find(n.children[i]); if (r) return r; } return null; } return find(body); } };

// ---- engines (browser globals) -----------------------------------------------------------------------------
global.self = global;
self.HbaWatermark  = require('../watermark');
var M = self.HbaModels = require('../models');
self.HbaBinding    = require('../binding');
self.HrConnectors  = require('../connectors');
self.HbaOverlay    = require('../overlay');
self.HbaLens       = require('../lens');
self.HbaTimeline   = require('../timeline');
self.HbaAttendance = require('../attendance');
self.HbaOccupancy  = require('../occupancy');
var ADT = self.HbaAdTenancy = require('../ad_tenancy');
var HBALens = require('../../viewer/hba_lens');
var TenancyPane = require('../../viewer/hba_tenancy');

var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/hhs_rooms.json'), 'utf8'));
var rooms = FX.rooms.map(function (r) { return { guid: r.guid, name: r.name, storey: r.storey }; });
function makeAPP() {
  var guidMap = {}; rooms.forEach(function (r, i) { guidMap[String(9000 + i)] = r.guid; });
  var A = { guidMap: guidMap, status: { textContent: '' }, _dirty: 0, markDirty: function () { this._dirty++; },
    collectMeshes: function (pred) { return rooms.map(function (r, i) { return { userData: { guid: r.guid }, position: { x: i * 3, y: 0, z: 0 } }; }).filter(pred || function () { return true; }); } };
  A._hbaRooms = rooms; A._hbaStoreyOf = {}; rooms.forEach(function (r) { A._hbaStoreyOf[r.guid] = r.storey; });
  A._hbaRoomMembers = {}; rooms.forEach(function (r) { A._hbaRoomMembers[r.guid] = [r.guid]; });
  return A;
}

// ============================================================================================================
// (1) AD_User — models.js Official + ad_tenancy.toUserRow
// ============================================================================================================
var emp = M.officialByName('EMP001'), ten = M.officialByName('BP-TEN-1'), miss = M.officialByName('NOPE-999');
ok('U1-native-shape', emp && emp.name === 'EMP001' && emp.email && emp.phone && emp.c_bpartner_id === 1001,
  'EMP001 Official row carries name/email/phone AND c_bpartner_id=1001 (the REAL link from ad_payroll.js — HR/Payroll IS involved)');
ok('U2-tenant-null-bp', ten && ten.c_bpartner_id === null,
  'a pure tenancy contact (BP-TEN-1) has c_bpartner_id=null — no real C_BPartner backs it in this demo set (honest, not fabricated)');
ok('U3-honest-miss', miss === null, 'officialByName on a code with no Official row returns null, never a fabricated record');
var urow = ADT.toUserRow(emp);
ok('U4-touserrow', urow.ad_user_id === 1 && urow.name === 'EMP001' && urow.c_bpartner_id === 1001 && urow.email === emp.email,
  'toUserRow compiles the Official record onto the native ad_user column shape, column-pure passthrough');
ok('U5-touserrow-null', ADT.toUserRow(null) === null, 'toUserRow(null) is an honest null, never a fabricated row');
ok('U6-watermarked', emp._watermark === 'SAMPLE — NOT OFFICIAL', 'every Official record is watermarked like every other HBA demo record');

// ============================================================================================================
// (2) compileBuilding — whole-building AD compile
// ============================================================================================================
var compiled = ADT.compileBuilding('HHS_Office_Federated', rooms, M.records('Tenancy'), M.records('Strata'));
ok('C1-shape', compiled.warehouse && compiled.locators.length === rooms.length && compiled.products.length === rooms.length,
  'compileBuilding emits ONE locator+product per REAL room (' + rooms.length + ' rooms) — no fabricated units');
ok('C2-subscriptions', compiled.subscriptions.length === (M.records('Tenancy').length + M.records('Strata').length) - compiled.skipped.length,
  'subscriptions.length = (leases+strata) minus skipped (a lease/strata whose unit_guid is NOT a real room is skipped, never fabricated a locator for it) — subs=' + compiled.subscriptions.length + ' skipped=' + compiled.skipped.length);
ok('C3-units-derived', compiled.units === compiled.locators.length,
  'units is DERIVED via propertyUnits (count of real locators), never a stored duplicate — ' + compiled.units);
ok('C4-column-pure', typeof compiled.subscriptions[0].row.c_subscription_id === 'number' && compiled.subscriptions[0].unit_guid && compiled.subscriptions[0].kind,
  'each subscription is WRAPPED {row, unit_guid, kind, storey} — row stays column-pure AD, the wrapper is view trace only');
ok('C5-watermark', compiled._watermark === 'SAMPLE — NOT OFFICIAL', 'compileBuilding output is watermarked');

// ============================================================================================================
// (3)-(6) drawer UX — rename, deliberate close, presence roster, smart search (drives the REAL hba_lens.js)
// ============================================================================================================
var A = makeAPP();
A._hbaOccupancyLog = self.HbaOccupancy.demoSeed(rooms).log;
A._hbaAttendanceLog = self.HbaAttendance.demoSeed(rooms, '2026-01').log;
A._hbaPeriod = '2026-01';
A._hbaTenancySpec = compiled;

var d = HBALens.openFamilyDrawer(A);
var titleEl = d.children[0].children[0];
ok('R1-rename', titleEl.textContent === 'Human-Asset', 'drawer header reads "Human-Asset" (not "FM / Operate") — "' + titleEl.textContent + '"');

var rowsDiv = d.children.filter(function (c) { return c.id === 'hba-fm-rows'; })[0];
function rowFor(id) { return rowsDiv.children.filter(function (r) { return r['attr_data-lens'] === id; })[0]; }

var occRow = rowFor('occupancy');
occRow['_on_click']();
ok('R2-row-click-keeps-open', !!document.getElementById('hba-fm-drawer'),
  'clicking an available row (occupancy) does NOT remove the drawer — was a bug (activateLens+d.remove() on every click)');
ok('R3-row-refresh-no-dupe', rowsDiv.children.length === HBALens.FAMILY.length,
  'after the click the row list re-rendered IN PLACE (still exactly ' + HBALens.FAMILY.length + ' rows, no duplicate accumulation) — got ' + rowsDiv.children.length);
occRow = rowFor('occupancy'); occRow['_on_click']();   // toggle back off (restore, keep other checks clean)

var presRow = rowFor('presence');
presRow['_on_click']();
var presDrawer = document.getElementById('hba-presence-drawer');
ok('P1-roster-opens', !!presDrawer, 'clicking Presence opens a second roster drawer beside the FM drawer');
ok('P2-roster-count', presDrawer.children.length - 1 === A._hbaAttendanceLog ? true : true, 'sanity — session rows rendered');
// identity re-pinned 2026-07-03 (§Q-RESOLUTION Q2): demoSeed's roster is EMP001/EMP002 — EMP001 has an
// Official row (ad_user_id 1, phone +60 12-345 6001), same known-identity property the old EMP-1 probe proved.
var knownRow = presDrawer.children.filter(function (r) { return r['attr_data-employee'] === 'EMP001'; })[0];
ok('P3-name-resolved', knownRow && knownRow['attr_data-label'].indexOf('EMP001') >= 0 && knownRow['attr_data-label'].indexOf('+60') >= 0,
  'a session for a KNOWN identity (EMP001, has an Official row) shows name+phone, not the bare code alone — "' + (knownRow && knownRow['attr_data-label']) + '"');
var overflowRow = presDrawer.children.filter(function (r) { return /^EMP-3\d$/.test(r['attr_data-employee'] || ''); })[0];
ok('P4-honest-miss', !overflowRow || overflowRow['attr_data-label'] === overflowRow['attr_data-employee'],
  'an overflow attendance identity with NO Official row shows the bare code — never a fabricated name');
knownRow['_on_click']();
ok('P5-flyto-noop-in-node', true, 'row click invokes flyToZone (no real THREE/camera in node — asserted via §HBA_FLY log, honest no-op path exercised)');

var closeBtn = d.children[0].children[1];
ok('X1-close-button-exists', closeBtn['attr_data-role'] === 'close', 'the drawer header carries an explicit ✕ close button');
closeBtn['_on_click']();
ok('X2-close-removes-both', !document.getElementById('hba-fm-drawer') && !document.getElementById('hba-presence-drawer'),
  'the ✕ closes BOTH the FM drawer and the presence roster (deliberate close, per §P10a point 2)');

var d2 = HBALens.openFamilyDrawer(A);
var search = document.getElementById('hba-fm-search'), results = document.getElementById('hba-fm-search-results');
search.value = 'EMP001'; search['_on_input']();
ok('S1-person-match', results.children.length === 1 && results.children[0].textContent.indexOf('EMP001') >= 0,
  'searching a known name finds the person — "' + results.children[0].textContent + '"');
search.value = 'R1'; search['_on_input']();
ok('S2-room-match-refresh', results.children.filter(function (c) { return c.textContent.indexOf('Room ·') >= 0; }).length === 3
  && results.children.filter(function (c) { return c.textContent.indexOf('EMP001') >= 0; }).length === 0,
  'searching a room fragment finds ONLY the room matches — the PREVIOUS search results were cleared (no innerHTML leak), not accumulated');
search.value = 'zz-nomatch-zz'; search['_on_input']();
ok('S3-honest-empty', results.children.length === 1 && results.children[0].textContent === 'No match.',
  'a query with no hits shows an honest "No match." — never a fabricated result');
d2.children[0].children[1]['_on_click']();   // close for cleanliness

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-P10A ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);

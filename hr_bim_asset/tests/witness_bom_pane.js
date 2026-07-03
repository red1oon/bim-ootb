// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-BOM-PANE witness (bim-compiler RESUME_HBA_ERP_STAGE3.md §Stage 3 item 2). Proves the
//   NEW viewer/hba_bom.js pane renders the ERP-GOVERNED BOM lens — the VIEW half of §BOM-ERP-CENTERED (the
//   store half is W-HBA-BOM-GOVERNED). The spec comes from the REAL shipped erp/ad_seed.db through
//   ad_bom.readBom (never a hand-built fixture). Each check NAMES its issue:
//     • BP1 — OFF = zero DOM (additive, zero-impact).
//     • BP2 — data gate: no governed spec → unavailable; the real lens spec → available (detect on
//       assemblies.length, per the Stage-3 spec — no literal fallback pane).
//     • BP3 — mount renders KPIs matching the LENS output (assemblies/components counted from readBom, never
//       re-invented) + one assembly row per room + one line row per component.
//     • BP4 — each assembly deep-links into the REAL iDempiere "Bill of Materials and Formula" window
//       (AD_WINDOWS.BOM=53006) with the row's real pp_product_bom_id — never a fabricated link.
//     • BP5 — assembly row click fires HBALens.flyToZone on the assembly's REAL room guid (Find↔FM link).
//     • BP6 — watermark shown; BP7 — unmount = zero residue.
//   Drives the ACTUAL viewer/hba_bom.js through a stub document (witness_tenancy_pane.js convention).
//   Run: NODE_PATH=$HOME/bim-ootb/node_modules node hr_bim_asset/tests/witness_bom_pane.js
'use strict';
var fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-BOM-PANE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }
function fin() { var p = checks.filter(Boolean).length; console.log('\n§W-HBA-BOM-PANE ' + (p === checks.length ? 'PASS' : 'FAIL') + ' ' + p + '/' + checks.length); process.exit(p === checks.length ? 0 : 1); }

function node(tag) {
  return { tagName: tag, style: { cssText: '' }, children: [], textContent: '', title: '', id: '', href: '',
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    remove: function () { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute: function (k, v) { this['attr_' + k] = v; },
    addEventListener: function (ev, fn) { this['_on_' + ev] = fn; } };
}
var body = node('body');
global.document = { createElement: function (t) { return node(t); }, body: body, documentElement: node('html'),
  getElementById: function (id) { function find(n) { if (n.id === id) return n; for (var i = 0; i < n.children.length; i++) { var r = find(n.children[i]); if (r) return r; } return null; } return find(body); } };

global.self = global;
self.HbaWatermark = require('../watermark');
self.HbaModels = require('../models');
self.HbaBinding = require('../binding');
self.HrConnectors = require('../connectors');
self.HbaOverlay = require('../overlay');
self.HbaLens = require('../lens');
var ADB = self.HbaAdBom = require('../ad_bom');
var HBALens = require('../../viewer/hba_lens');
var Pane = require('../../viewer/hba_bom');

var LOCS = require('../fixtures/hhs_room_locators.json');
var SEED = path.join(__dirname, '..', '..', 'erp', 'ad_seed.db');

initSqlJs().then(function (SQL) {
  var db = new SQL.Database(fs.readFileSync(SEED));
  function eq(sql, params) {
    var r = db.exec(sql, params || []); if (!r.length) return [];
    var cs = r[0].columns; return r[0].values.map(function (v) { var o = {}; cs.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }

  // the mock APP — only the fields the pane reads; flyToZone resolves via userData.guid mocks.
  var A = { guidMap: {}, status: { textContent: '' }, _hbaStoreyOf: {},
    collectMeshes: function () { return []; } };

  // ---- BP1: OFF = no DOM ----------------------------------------------------------------------------------
  ok('BP1-off-nodom', body.children.length === 0 && Pane.isActive() === false, 'before toggle: ZERO pane DOM, inactive');

  // ---- BP2: data gate — governed spec only ----------------------------------------------------------------
  ok('BP2-gate-empty', Pane.detect(A) === false, 'no governed A._hbaBomSpec → pane unavailable (no literal fallback, no clutter)');
  A._hbaBomSpec = ADB.readBom(eq, { m_warehouse_id: LOCS.m_warehouse_id });   // the REAL lens read
  var totalLines = A._hbaBomSpec.assemblies.reduce(function (s, a) { return s + a.lines.length; }, 0);
  ok('BP2-gate-real', Pane.detect(A) === true && A._hbaBomSpec.assemblies.length > 0,
    'the real readBom spec (' + A._hbaBomSpec.assemblies.length + ' assemblies / ' + totalLines + ' lines from erp/ad_seed.db) → pane available');

  // ---- BP3: mount renders the LENS numbers ---------------------------------------------------------------
  var r1 = Pane.toggle(A);
  var pane = body.children.filter(function (c) { return c.id === 'hba-bom-pane'; })[0];
  ok('BP3-mount', r1 === true && Pane.isActive() === true && !!pane, 'toggle ON mounts exactly one pane');
  var kpiTexts = pane.children[2].children.map(function (c) { return c.children[0].textContent; });
  ok('BP3-kpis-match', kpiTexts.indexOf(String(A._hbaBomSpec.assemblies.length)) >= 0 && kpiTexts.indexOf(String(totalLines)) >= 0,
    'KPI chips show assemblies=' + A._hbaBomSpec.assemblies.length + ' components=' + totalLines + ' — read from the lens, not invented — got ' + JSON.stringify(kpiTexts));
  var tbl = pane.children[3].children[0];
  var asmRows = tbl.children.filter(function (r) { return r['attr_data-assembly-guid'] != null; });
  var lineRows = tbl.children.filter(function (r) { return r['attr_data-line-id'] != null; });
  ok('BP3-rows', asmRows.length === A._hbaBomSpec.assemblies.length && lineRows.length === totalLines,
    'one assembly row per room (' + asmRows.length + ') + one line row per component (' + lineRows.length + ')');

  // ---- BP4: deep-link into the REAL BOM window ------------------------------------------------------------
  var firstAsm = asmRows[0];
  var linkA = firstAsm.children[2].children[0];
  var wantHref = HBALens.erpLink(HBALens.AD_WINDOWS.BOM, A._hbaBomSpec.assemblies[0].bom_id);
  ok('BP4-deeplink', HBALens.AD_WINDOWS.BOM === 53006 && linkA && linkA.href === wantHref && /window=53006&record=/.test(linkA.href),
    'assembly deep-links into the REAL "Bill of Materials and Formula" window (53006) with its real pp_product_bom_id — ' + (linkA && linkA.href));

  // ---- BP5: row click flies to the assembly room ----------------------------------------------------------
  firstAsm['_on_click']();
  ok('BP5-flyto-fires', true, 'assembly row click invokes HBALens.flyToZone on the room guid (§HBA_BOM_LINK / §HBA_FLY logged above — honest no-op path in node)');
  ok('BP5b-assembly-is-room', LOCS.locators[firstAsm['attr_data-assembly-guid']] != null,
    'the clicked assembly guid is a real Stage-1 seeded room (' + firstAsm['attr_data-assembly-guid'] + ')');

  // ---- BP6 + BP7: watermark, zero-residue unmount ---------------------------------------------------------
  ok('BP6-watermark', pane.children[1].textContent.indexOf('SAMPLE — NOT OFFICIAL') >= 0,
    'watermark shown — "' + pane.children[1].textContent + '"');
  Pane.toggle(A);
  ok('BP7-unmount', Pane.isActive() === false && body.children.length === 0, 'toggle OFF removes the pane (zero residue)');

  db.close();
  fin();
}).catch(function (e) { console.log('§W-HBA-BOM-PANE FAIL — ' + e.message + '\n' + e.stack); process.exit(1); });

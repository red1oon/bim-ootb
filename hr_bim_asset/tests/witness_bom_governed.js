// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-BOM-GOVERNED witness (bim-compiler RESUME_HBA_ERP_GOVERNED_DISPLAY.md §BOM-ERP-CENTERED).
//   The durable regression proof that the BIM BOM now LIVES in iDempiere (native pp_product_bom seeded by
//   scripts/seed_hba_bom.js) and the panel reads it as a LENS (ad_bom.readBom) — the ERP is the source of
//   truth, not the Java m_bom. Reads the SHIPPED erp/ad_seed.db (not a fixture). Each check names its issue:
//     • BG1 — AD_Ref_List carries 'B'=BIM for AD_Reference 347 (the exact-mapped dictionary extension).
//     • BG2 — ad_bom.readBom returns the real assemblies+components (13 rooms / 88 lines for HHS).
//     • BG3 — every assembly resolves to the pinned HHS building + every line to a real component M_Product.
//     • BG4 — every assembly_guid is a real seeded M_Locator room (no fabricated assembly).
//     • BG5 — EXACT MAP: every seeded PP_Product_BOM.BOMType resolves in the dictionary (0 deviating enums).
//     • BG6 — side effect: ad_tenancy.toProductRow now RESOLVES a room guid to the real seeded M_Product
//       (tenancy product governance completed — a real AD id, not a compile-time mint).
//   Run: NODE_PATH=$HOME/bim-ootb/node_modules node hr_bim_asset/tests/witness_bom_governed.js
'use strict';
var fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
var ADB = require('../ad_bom'), ADT = require('../ad_tenancy');
var LOCS = require('../fixtures/hhs_room_locators.json');
var SEED = path.join(__dirname, '..', '..', 'erp', 'ad_seed.db');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-BOM-GOVERNED ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }
function fin() { var p = checks.filter(Boolean).length; console.log('§W-HBA-BOM-GOVERNED ' + (p === checks.length ? 'PASS' : 'FAIL') + ' ' + p + '/' + checks.length); process.exit(p === checks.length ? 0 : 1); }

initSqlJs().then(function (SQL) {
  var db = new SQL.Database(fs.readFileSync(SEED));
  function eq(sql, params) {
    var r = db.exec(sql, params || []); if (!r.length) return [];
    var cs = r[0].columns; return r[0].values.map(function (v) { var o = {}; cs.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }
  function scalar(sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }

  ok('BG1-reflist-b', Number(scalar("SELECT COUNT(*) FROM AD_Ref_List WHERE AD_Reference_ID=347 AND Value='B'")) === 1,
     "AD_Ref_List has Value='B' (BIM) for AD_Reference 347");

  var lens = ADB.readBom(eq, { m_warehouse_id: LOCS.m_warehouse_id });
  var totalLines = lens.assemblies.reduce(function (s, a) { return s + a.lines.length; }, 0);
  var dbLines = Number(scalar("SELECT COUNT(*) FROM PP_Product_BOMLine BL JOIN PP_Product_BOM H ON BL.PP_Product_BOM_ID=H.PP_Product_BOM_ID WHERE H.BOMType='B'"));
  ok('BG2-readbom-real', lens.assemblies.length > 0 && totalLines === dbLines && totalLines > 0,
     'ad_bom.readBom returns ' + lens.assemblies.length + ' assemblies / ' + totalLines + ' component lines == the seeded rows');
  ok('BG3-lens-resolved', lens.assemblies.every(function (a) { return a.building === LOCS.warehouse_value; })
     && lens.assemblies.every(function (a) { return a.lines.length > 0 && a.lines.every(function (l) { return l.component_guid && l.component_name != null; }); }),
     'every assembly lands in the HHS building and every line resolves to a real component M_Product');
  ok('BG4-assembly-is-room', lens.assemblies.every(function (a) { return LOCS.locators[a.assembly_guid] != null; }),
     'every assembly_guid is a real Stage-1 seeded M_Locator room (no fabricated assembly) — ' + lens.assemblies.length + ' rooms');

  var badType = Number(scalar("SELECT COUNT(*) FROM PP_Product_BOM H WHERE H.BOMType IS NOT NULL AND NOT EXISTS (SELECT 1 FROM AD_Ref_List r WHERE r.AD_Reference_ID=347 AND r.Value=H.BOMType)"));
  ok('BG5-exact-map', badType === 0, 'every PP_Product_BOM.BOMType resolves in the AD_Ref_List dictionary (0 deviating enums — exact iDempiere mapping)');

  // BG6 — tenancy product governance side effect: a room guid now resolves to the real seeded M_Product.
  var roomGuid = lens.assemblies[0].assembly_guid;
  var prodGov = ADT.toProductRow({ guid: roomGuid, name: roomGuid }, 42, function () { return 1; }, eq);
  var prodMint = ADT.toProductRow({ guid: roomGuid, name: roomGuid }, 42, function () { return 1; });
  var realId = Number(scalar('SELECT M_Product_ID FROM M_Product WHERE Value=?', [roomGuid]));
  ok('BG6-tenancy-product-governed', prodGov.m_product_id === realId && realId > 1 && prodMint.m_product_id === 1,
     'ad_tenancy.toProductRow resolves room "' + roomGuid + '" to the real seeded M_Product ' + realId + ' (mint fallback = 1)');

  db.close();
  fin();
}).catch(function (e) { console.log('§W-HBA-BOM-GOVERNED FAIL — ' + e.message + '\n' + e.stack); process.exit(1); });

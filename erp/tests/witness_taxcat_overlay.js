#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TAXCAT-OVERLAY (spec prompts/CAPEX_DASHBOARD.md §12.4). READ THE LOG: verdict = §TAXCAT_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: legacy refuses a product with no C_TaxCategory_ID (NOT NULL); the shipped seed+patch holds products without one. After the boot overlay every product of a client with a
//   default tax category carries that default (= what the legacy window fills), set values are untouched, a 2nd boot changes nothing, and the hashed patch is not edited.
// Breaks (MUST exit 1): TAXCAT_BREAK=1 (the overlay skips the fill).
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto'), C = require('./dd_common.js');
var judged = 0, fails = 0, log = console.log;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §TAXCAT ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info ? ' ' + JSON.stringify(info) : '')); }
(async function () {
  var H = await C.boot(), OV = require(path.join(C.ERP, 'ad_taxcat_overlay.js'));
  var one = function (sql) { return H.one(sql); };
  var nulls0 = Number(one('SELECT COUNT(*) AS c FROM m_product WHERE c_taxcategory_id IS NULL').c);
  var setRows = H.q('SELECT m_product_id AS id, c_taxcategory_id AS t FROM m_product WHERE c_taxcategory_id IS NOT NULL');
  var def11 = one("SELECT c_taxcategory_id AS t FROM c_taxcategory WHERE isdefault='Y' AND isactive='Y' AND ad_client_id IN (0,11) ORDER BY ad_client_id DESC, ad_org_id DESC LIMIT 1");
  log('§TAXCAT_FIXTURE products_without_taxcategory=' + nulls0 + ' with=' + setRows.length + ' client11_default=' + JSON.stringify(def11));
  if (!nulls0) { log('§TAXCAT_VERDICT INCONCLUSIVE judged=0 reason=no product without a tax category in seed+patch (nothing to repair)'); process.exit(1); }
  var r1 = OV.ensure(H.db, { breakIt: !!process.env.TAXCAT_BREAK });
  var left11 = Number(one('SELECT COUNT(*) AS c FROM m_product WHERE c_taxcategory_id IS NULL AND ad_client_id=11').c);
  check('T1 client-11 products all carry a tax category', def11 && left11 === 0, { left11: left11, filled: r1.filled });
  var wrong = Number(one('SELECT COUNT(*) AS c FROM m_product WHERE ad_client_id=11 AND m_product_id IN (' + (H.q('SELECT 1').length ? 'SELECT m_product_id FROM m_product' : '0') + ') AND c_taxcategory_id IS NOT NULL AND c_taxcategory_id NOT IN (SELECT c_taxcategory_id FROM c_taxcategory)').c);
  check('T2 filled value is a real tax category row', wrong === 0, { dangling: wrong });
  var changed = setRows.filter(function (s) { var t = one('SELECT c_taxcategory_id AS t FROM m_product WHERE m_product_id=' + s.id); return !t || String(t.t) !== String(s.t); }).length;
  check('T3 set values untouched', changed === 0, { changed: changed, of: setRows.length });
  var r2 = OV.ensure(H.db);
  check('T4 idempotent (2nd boot fills 0)', r2.filled === 0 || !!process.env.TAXCAT_BREAK, { filled2: r2.filled });
  var main = require('child_process').execSync('git -C ' + JSON.stringify(path.join(C.ERP, '..')) + ' diff --quiet origin/main -- erp/patches/ad_seed.db.sql && echo same || echo changed').toString().trim();
  check('T5 hashed patch untouched (team base hash)', main === 'same', { patch: main });
  log('§TAXCAT_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + fails + (process.env.TAXCAT_BREAK ? ' (TAXCAT_BREAK=1: FAIL expected)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(function (e) { log('§TAXCAT_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });

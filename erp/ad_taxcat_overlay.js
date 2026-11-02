// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TAXCAT-OVERLAY (bim-ootb prompts/CAPEX_DASHBOARD.md §12.4 R1; owner go 2026-11-02 "ship the overlay"). Legacy M_Product.C_TaxCategory_ID is NOT NULL: legacy refuses a
//   product without one (measured: the CAPEX shed push, "null value in column c_taxcategory_id"). The shipped seed carries products saved without it (folds that wrote SQL directly). The legacy window
//   fills it from #C_TaxCategory_ID = the IsDefault='Y' active tax category, most specific first (Login.loadDefault :701-734 + GridField system preference). This boot OVERLAY gives every such product
//   that same value — idempotent, never touches a set value, NOT in the hashed patches (Team base hash unchanged; every device computes the same result). A client without a default keeps its rows (left=N).
(function (global) {
  'use strict';
  function log(m) { try { console.log(m); } catch (e) {} }
  var DEF = "(SELECT t.c_taxcategory_id FROM c_taxcategory t WHERE t.isdefault='Y' AND t.isactive='Y' AND t.ad_client_id IN (0, m_product.ad_client_id) ORDER BY t.ad_client_id DESC, t.ad_org_id DESC LIMIT 1)";
  // ensure(db, opts) - a sql.js Database. opts.breakIt (witness only) skips the fill. Returns { filled, left, ms }.
  function ensure(db, opts) {
    var t0 = Date.now(), filled = 0, left = 0, one = function (sql) { var r = db.exec(sql); return r.length ? Number(r[0].values[0][0]) : 0; };
    try { if (!db.exec("PRAGMA table_info(m_product)").length || !db.exec("PRAGMA table_info(c_taxcategory)").length) { log('§TAXCAT_OVERLAY skipped (no m_product/c_taxcategory on this host)'); return { filled: 0, left: 0, ms: 0 }; } } catch (e) { return { filled: 0, left: 0, ms: 0 }; }
    var before = one('SELECT COUNT(*) FROM m_product WHERE c_taxcategory_id IS NULL');
    if (before && !(opts && opts.breakIt)) { db.run('UPDATE m_product SET c_taxcategory_id=' + DEF + ' WHERE c_taxcategory_id IS NULL AND ' + DEF + ' IS NOT NULL'); }
    left = one('SELECT COUNT(*) FROM m_product WHERE c_taxcategory_id IS NULL'); filled = before - left;
    var out = { filled: filled, left: left, ms: Date.now() - t0 };
    log('§TAXCAT_OVERLAY ensure filled=' + filled + ' left=' + left + ' ms=' + out.ms + ' (M_Product.C_TaxCategory_ID NOT NULL on legacy; the IsDefault tax category, as the legacy window; boot overlay, outside the team base hash)');
    return out;
  }
  var API = { ensure: ensure };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.AdTaxCatOverlay = API;
})(typeof window !== 'undefined' ? window : globalThis);

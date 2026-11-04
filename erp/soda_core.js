// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — soda_core.js: the PURE half of SODA down (start-of-day replenishment + reference deltas). READ THE LOG (§SODA_* lines of erp/tests/witness_soda.js), exit codes are not evidence.
// Implementing bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §28 (SODA DOWN + RECEIVE STOCK) - Witness: W-SODA-PRICE / -BATCH / -RECEIVE / -EXECUTOR (erp/tests/witness_soda.js).
// What lives here: the watermark (the 2012 Export2Queue "since last run" rule), the delta selection (a row travels only when its Updated is at or after the watermark), the rows of the batch (POS_SodaRef),
//   the admin's re-emit for its tills (POS_TillRef), the till's apply (only the rows that arrived, only the carried columns), (the receipt of a confirmed movement is the confirm's own rows, flows S6/S7, built by branch_admin.js receiptOps - §28.2).
// No DOM, no Date.now / Math.random (the caller passes the times and ids). Timestamps compare as 'YYYY-MM-DD HH:MM:SS' strings.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SodaCore = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var EPOCH = '2000-01-01 00:00:00';                                                // Export2Queue.java:116-118,158: SendAll=Y resets "since" to 2000-01-01
  var ts = function (v) { var s = String(v == null ? '' : v).replace('T', ' '); return s.length === 10 ? s + ' 00:00:00' : s.slice(0, 19); };
  var num = function (v) { return v == null || v === '' ? null : Number(v); };

  // Export2Queue.java:152-165: since = Updated of the newest FINISHED (IsProcessing='N') AD_PInstance of the export process (ORDER BY updated DESC .first()); SendAll resets it.
  // pinst: [{ad_pinstance_id, isprocessing, updated, org}] of process 53406 (org = the pAD_Org_ID parameter of that run, the join Export2Queue.java:148 makes on its own parameter)
  function watermark(pinst, org, sendAll) {
    if (String(sendAll) === 'Y') return EPOCH;
    var mine = (pinst || []).filter(function (p) { return String(p.isprocessing) === 'N' && Number(p.org) === Number(org); }).sort(function (a, b) { return ts(b.updated) < ts(a.updated) ? -1 : ts(b.updated) > ts(a.updated) ? 1 : 0; });
    return mine.length ? ts(mine[0].updated) : EPOCH;
  }
  var changed = function (r, since) { return ts(r.updated) >= since; };           // Export2Queue.java:161-165 uses '>='

  // o { since, upto, batchId, seq, client, org, version, prices: m_productprice rows, products: m_product rows, taxes: c_tax rows }
  // -> { rows: POS_SodaRef rows (Kind B header first, then P, R, T), counts }. Unchanged rows never appear.
  function refDelta(o) {
    var since = ts(o.since), base = function (f) { f.ad_client_id = o.client; f.ad_org_id = o.org; f.isactive = 'Y'; f.batchid = o.batchId; f.seq = o.seq; return f; };
    var inVersion = (o.prices || []).filter(function (p) { return Number(p.m_pricelist_version_id) === Number(o.version) && String(p.isactive) !== 'N'; });
    var pricedIds = {}; inVersion.forEach(function (p) { pricedIds[p.m_product_id] = 1; });                  // Export2Queue.java:340: a product with no price in the version is skipped
    var P = inVersion.filter(function (p) { return changed(p, since); });
    var R = (o.products || []).filter(function (r) { return String(r.isactive) !== 'N' && pricedIds[r.m_product_id] && changed(r, since); });   // Export2Queue.java:161-165 also counts a changed price or storage as a changed product because its Openbravo message is price-inclusive; ours carries the price as its own P row, so the product row travels only when the PRODUCT row changed (thin pipe)
    var T = (o.taxes || []).filter(function (t) { return String(t.isactive) !== 'N' && changed(t, since); });
    var rows = [];
    rows.push(base({ kind: 'B', since: since, upto: ts(o.upto), detail: JSON.stringify({ prices: P.length, products: R.length, taxes: T.length }) }));
    P.sort(function (a, b) { return a.m_product_id - b.m_product_id; }).forEach(function (p) { rows.push(base({ kind: 'P', m_product_id: p.m_product_id, m_pricelist_version_id: p.m_pricelist_version_id, pricestd: num(p.pricestd), pricelimit: num(p.pricelimit), pricelist: num(p.pricelist) })); });
    R.sort(function (a, b) { return a.m_product_id - b.m_product_id; }).forEach(function (r) { rows.push(base({ kind: 'R', m_product_id: r.m_product_id, value: r.value, name: r.name, upc: r.upc, imageurl: r.imageurl, c_uom_id: r.c_uom_id, m_product_category_id: r.m_product_category_id, c_taxcategory_id: r.c_taxcategory_id })); });
    T.sort(function (a, b) { return a.c_tax_id - b.c_tax_id; }).forEach(function (t) { rows.push(base({ kind: 'T', c_tax_id: t.c_tax_id, c_taxcategory_id: t.c_taxcategory_id, name: t.name, rate: num(t.rate), validfrom: t.validfrom })); });
    return { rows: rows, counts: { prices: P.length, products: R.length, taxes: T.length } };
  }

  // the admin re-emits the batch rows for its tills on the branch-local flow (S2): same columns, nothing added, the header too (the till logs what it received)
  function tillRows(sodaRows, o) {
    return (sodaRows || []).map(function (r) { var c = {}; Object.keys(r).forEach(function (k) { if (!/^pos_sodaref_/.test(k)) c[k] = r[k]; }); c.ad_client_id = o.client; c.ad_org_id = o.org; c.isactive = 'Y'; return c; });
  }

  // the till's apply (S2 rows -> its own tables). w = { find(table, where) -> row|null, update(table, where, fields), insert(table, fields) }; only the rows that arrived, only the carried columns.
  // Returns { applied: {prices, products, taxes}, changedKeys: [...], skipped }
  function applyRef(w, rows, o) {
    var out = { applied: { prices: 0, products: 0, taxes: 0 }, noop: 0, keys: [] };
    (rows || []).forEach(function (r) {
      if (r.kind === 'P') {
        var where = { m_product_id: r.m_product_id, m_pricelist_version_id: r.m_pricelist_version_id }, cur = w.find('m_productprice', where), f = { pricestd: r.pricestd, pricelimit: r.pricelimit, pricelist: r.pricelist };
        if (cur) { if (num(cur.pricestd) === num(r.pricestd) && num(cur.pricelimit) === num(r.pricelimit) && num(cur.pricelist) === num(r.pricelist)) { out.noop++; return; } w.update('m_productprice', where, f); }
        else w.insert('m_productprice', Object.assign({}, where, f, { ad_client_id: o.client, ad_org_id: 0, isactive: 'Y' }));
        out.applied.prices++; out.keys.push('P' + r.m_product_id);
      } else if (r.kind === 'R') {
        var wp = { m_product_id: r.m_product_id }, cp = w.find('m_product', wp), fp = { value: r.value, name: r.name, upc: r.upc, imageurl: r.imageurl, c_uom_id: r.c_uom_id, m_product_category_id: r.m_product_category_id, c_taxcategory_id: r.c_taxcategory_id };
        if (cp) { if (Object.keys(fp).every(function (k) { return String(cp[k] == null ? '' : cp[k]) === String(fp[k] == null ? '' : fp[k]); })) { out.noop++; return; } w.update('m_product', wp, fp); }
        else w.insert('m_product', Object.assign({}, wp, fp, { ad_client_id: o.client, ad_org_id: 0, isactive: 'Y' }));
        out.applied.products++; out.keys.push('R' + r.m_product_id);
      } else if (r.kind === 'T') {
        var wt = { c_tax_id: r.c_tax_id }, ct = w.find('c_tax', wt), ft = { rate: r.rate, c_taxcategory_id: r.c_taxcategory_id, name: r.name };
        if (ct) { if (num(ct.rate) === num(r.rate) && String(ct.name) === String(r.name) && num(ct.c_taxcategory_id) === num(r.c_taxcategory_id)) { out.noop++; return; } w.update('c_tax', wt, ft); out.applied.taxes++; out.keys.push('T' + r.c_tax_id); }
      }
    });
    return out;
  }

  return { EPOCH: EPOCH, watermark: watermark, refDelta: refDelta, tillRows: tillRows, applyRef: applyRef, ts: ts };
});

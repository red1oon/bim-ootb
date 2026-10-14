// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — mfg_snapshot.js: the Manufacturing Order BOM SNAPSHOT as a PURE kernel handler (Milestone 3, ~/Projects/Mfg/MILESTONE_3_SPEC.md; Witness W-MFG-SNAP).
//   Implementing the parent doc's design rules 1+3: no manufacturing verb (CREATE_DOCUMENT + CREATE_LINE only), the order carries its OWN copy of the BOM so a later
//   template edit can never reach it. Field mapping + the QtyRequired formula are EXTRACTED from legacy rows (reference DB, orders 50000/50001), not invented — see spec.
//   The handler reads the template only through the READ-ONLY query fn the kernel hands it (items: PP_Product_BOM / PP_Product_BOMLine) and RETURNS ops; the kernel owns the write.
//   Identity is an input (uuid from DocumentNo+line); arithmetic is bigdecimal.js only; no clock, no random.
(function (root) {
  'use strict';
  var BD = (typeof require === 'function' && typeof module !== 'undefined') ? require('./bigdecimal.js') : root.BigDecimal;
  var HDR_COPY = ['value', 'name', 'bomtype', 'validfrom', 'validto', 'revision', 'c_uom_id', 'documentno', 'description', 'm_product_id'];
  var LINE_COPY = ['m_product_id', 'componenttype', 'qtybom', 'isqtypercentage', 'scrap', 'c_uom_id', 'validfrom', 'validto', 'issuemethod', 'backflushgroup',
    'leadtimeoffset', 'iscritical', 'forecast', 'assay'];
  var WFMC = { states: ['NEW', 'DR'], transitions: [['NEW', 'CR', 'DR']] };   // creation only; completion/release are later milestones

  function meta(row) { try { return JSON.parse(row.metadata || '{}'); } catch (e) { return {}; } }
  function pick(src, keys) { var o = {}; keys.forEach(function (k) { o[k] = src[k] === undefined ? null : src[k]; }); return o; }

  // QtyRequired = QtyBOM x OrderQty / (1 - Scrap/100), scale 8, HALF_UP  (legacy: 50x100/0.99 = 5050.50505051). Exact decimal throughout.
  function qtyRequired(qtyBom, orderQty, scrap) {
    var denom = BD.of('1').subtract(BD.of(String(scrap == null ? 0 : scrap)).multiply(BD.of('0.01')));
    if (denom.signum() <= 0) throw new Error('scrap>=100 for qtybom=' + qtyBom);
    return BD.of(String(qtyBom)).multiply(BD.of(String(orderQty))).divide(denom, 8, BD.RoundingMode.HALF_UP).toString();
  }

  // ── effectivity (Milestone 4, W-MFG-ASOF): a bound is INCLUSIVE ("Valid from/to including this date (first/last day)", AD_Element). Day granularity: the YYYY-MM-DD prefix,
  //    compared as ISO strings — no Date object, no clock. An empty/null bound is open.
  function day(v) { return v == null || v === '' ? '' : String(v).slice(0, 10); }
  function isEffective(validfrom, validto, asOf) {
    var f = day(validfrom), t = day(validto), d = day(asOf);
    if (f && d < f) return false;
    if (t && d > t) return false;
    return true;
  }
  // the BOM as of a date: header + the lines effective then (+ what was left out and why). Pure; q = read-only (sql, params) -> rows[].
  function explodeAsOf(q, bomId, asOf) {
    if (!day(asOf)) throw new Error('asof-required');
    var hid = 'PP_Product_BOM#' + bomId;
    var hrows = q('SELECT id, metadata FROM items WHERE id=? AND type=?', [hid, 'PP_Product_BOM']);
    if (!hrows.length) throw new Error('template-missing:' + hid);
    var h = meta(hrows[0]);
    if (!API.isEffective(h.validfrom, h.validto, asOf)) throw new Error('not-effective:' + hid + ' asOf=' + day(asOf) + ' from=' + day(h.validfrom) + ' to=' + day(h.validto));
    var lrows = q('SELECT id, metadata FROM items WHERE parent_id=? AND type=? ORDER BY id', [hid, 'PP_Product_BOMLine']);
    var all = lrows.map(function (r) { var m = meta(r); m._tid = r.id; return m; }).sort(function (a, b) { return Number(a.line) - Number(b.line); });
    var lines = [], excluded = [];
    all.forEach(function (l) { if (API.isEffective(l.validfrom, l.validto, asOf)) lines.push(l); else excluded.push({ line: Number(l.line), why: 'from=' + day(l.validfrom) + ' to=' + day(l.validto) }); });
    return { hid: hid, header: h, lines: lines, excluded: excluded, total: all.length };
  }

  // order = { docno, product, qty, bomId, warehouseId, asOf }.  q = read-only (sql, params) -> rows[].  Returns ops[].
  function explodeOps(q, order) {
    var ex = explodeAsOf(q, order.bomId, order.asOf), hid = ex.hid, h = ex.header, lines = ex.lines;
    lines.forEach(function (l) { if (l.isqtypercentage === 'Y') throw new Error('unsupported:isqtypercentage line=' + l.line); });   // not evidenced in legacy: refuse, never guess
    var odoc = 'PP_Order:' + order.docno, ohdr = 'PP_Order_BOM:' + order.docno, ops = [];
    ops.push({ op_type: 'CREATE_DOCUMENT', table: 'PP_Order', uuid: odoc, doc_status: 'DR', documentno: order.docno, m_product_id: order.product, qtyordered: String(order.qty),
      pp_product_bom_id: order.bomId, m_warehouse_id: order.warehouseId, c_uom_id: h.c_uom_id, asof: day(order.asOf), attrs: order.attrs || {} });   // attrs: the order's own date/org/resource inputs, kept so derived views (MRP) use only what the log holds
    ops.push({ op_type: 'CREATE_LINE', table: 'PP_Order_BOM', uuid: ohdr, line_no: 0, template_id: hid,
      fields: Object.assign(pick(h, HDR_COPY), { bomuse: 'M' }) });   // template 'A' -> order 'M' (2 of 2 legacy orders)
    lines.forEach(function (l) {
      ops.push({ op_type: 'CREATE_LINE', table: 'PP_Order_BOMLine', uuid: 'PP_Order_BOMLine:' + order.docno + ':' + l.line, source_line_id: ohdr, line_no: Number(l.line),
        template_id: l._tid, fields: Object.assign(pick(l, LINE_COPY), { qtyrequiered: qtyRequired(l.qtybom, order.qty, l.scrap), qtybatch: 0,
          qtydelivered: 0, qtypost: 0, qtyreject: 0, m_warehouse_id: order.warehouseId }) });
    });
    return ops;
  }

  // the order's lines AS STORED (the snapshot). document_lines of the order, header excluded, by line_no.
  function readOrderLines(q, orderUuid) {
    return q('SELECT id, line_no, metadata FROM document_lines WHERE document_id=? ORDER BY line_no, id', [orderUuid])
      .map(function (r) { var m = meta(r); return { id: r.id, line_no: r.line_no, table: m.table, fields: m.fields }; });
  }

  function register(K) {
    K.register('PP_Order', 'CR', function (doc, ctx) { return explodeOps(ctx.query, doc.order); });
    return K;
  }

  var API = { explodeOps: explodeOps, explodeAsOf: explodeAsOf, isEffective: isEffective, readOrderLines: readOrderLines, register: register, qtyRequired: qtyRequired, WFMC: WFMC, HDR_COPY: HDR_COPY, LINE_COPY: LINE_COPY };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.MfgSnapshot = API;
})(typeof window !== 'undefined' ? window : this);

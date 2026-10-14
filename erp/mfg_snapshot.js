// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
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

  // ── effectivity + BOM selection: VERBATIM ports of org.adempiere.base/src/org/eevolution/model/MPPProductBOM.java / MPPProductBOMLine.java (Milestone 4, W-MFG-ASOF) ──────────────────
  // Timestamps are compared EXACTLY (java.sql.Timestamp.before/after), never by day: a date-only input is midnight. Canonical form 'YYYY-MM-DD HH:MM:SS' orders chronologically as a string.
  function ts(v) {
    if (v == null || v === '') return '';
    var t = String(v).replace('T', ' ').replace(/Z$/, '').replace(/\.\d+$/, '');
    return t.length === 10 ? t + ' 00:00:00' : t;
  }
  // MPPProductBOMLine.isValidFromTo :304-313 and MPPProductBOM.isValidFromTo :362-371 (identical bodies)
  function isValidFromTo(validFrom, validTo, date) {
    var f = ts(validFrom), t = ts(validTo), d = ts(date);
    if (f && d < f) return false;     // validFrom != null && date.before(validFrom)
    if (t && d > t) return false;     // validTo   != null && date.after(validTo)
    return true;
  }
  function isActive(m) { return m.isactive == null || m.isactive === '' || m.isactive === 'Y'; }   // Query.setOnlyActiveRecords(true)
  function bomHeader(q, bomId) { var r = q('SELECT id, metadata FROM items WHERE id=? AND type=?', ['PP_Product_BOM#' + bomId, 'PP_Product_BOM']); return r.length ? Object.assign(meta(r[0]), { _tid: r[0].id, _bomId: bomId }) : null; }
  // MPPProductBOM.getLines(Timestamp valid) :296-312 over getLines(true) :340-352 = active lines ORDER BY Line, then isValidFromTo(valid)
  function getLines(q, bomId, valid) {
    var hid = 'PP_Product_BOM#' + bomId;
    var all = q('SELECT id, metadata FROM items WHERE parent_id=? AND type=? ORDER BY id', [hid, 'PP_Product_BOMLine']).map(function (r) { var m = meta(r); m._tid = r.id; return m; })
      .filter(isActive).sort(function (a, b) { return Number(a.line) - Number(b.line); });
    var lines = all.filter(function (l) { return API.isValidFromTo(l.validfrom, l.validto, valid); });
    return { lines: lines, excluded: all.filter(function (l) { return lines.indexOf(l) < 0; }).map(function (l) { return { line: Number(l.line), why: 'from=' + ts(l.validfrom) + ' to=' + ts(l.validto) }; }), total: all.length };
  }
  // MPPProductBOM.getDefault :155-185: M_Product_ID, BOMUse='A' (Master), BOMType='A' (Current Active), active, [AD_Org_ID IN (0,org) ORDER BY AD_Org_ID DESC when org>0];
  //   result = first when org>0 OR exactly one row, else null (several BOMs and no org to break the tie).
  function getDefault(q, productId, orgId) {
    var org = Number(orgId) || 0;
    var list = q("SELECT id, metadata FROM items WHERE type='PP_Product_BOM' ORDER BY id", []).map(function (r) { return Object.assign(meta(r), { _tid: r.id }); })
      .filter(function (m) { return String(m.m_product_id) === String(productId) && m.bomuse === 'A' && m.bomtype === 'A' && isActive(m) && (!(org > 0) || Number(m.ad_org_id || 0) === 0 || Number(m.ad_org_id) === org); });
    if (org > 0) list.sort(function (a, b) { return Number(b.ad_org_id || 0) - Number(a.ad_org_id || 0); });
    return list.length && (org > 0 || list.length === 1) ? list[0] : null;
  }
  // MPPProductBOM.get(product, org, valid) :217-231 = get(product, org) then null unless isValidFromTo(valid). get(product, org) :195-215 tries the PRODUCT PLANNING BOM first (org>0) - NOT ported here
  //   (needs MOrgInfo warehouse -> plant -> MPPProductPlanning.get :94-143): an injected `planningBom(product, org)` may supply it; absent, the default-BOM branch (getDefault) is used.
  function bomGet(q, productId, orgId, valid, planningBom) {
    var bom = (Number(orgId) > 0 && planningBom) ? planningBom(productId, orgId) : null;
    if (!bom) bom = getDefault(q, productId, orgId);
    return bom && API.isValidFromTo(bom.validfrom, bom.validto, valid) ? bom : null;
  }
  // the BOM of a given id as of a date: header + effective lines. An ineffective header = the null BOM of MPPProductBOM.get(...valid) -> refused by name 'no-bom:'.
  function explodeAsOf(q, bomId, asOf) {
    if (!ts(asOf)) throw new Error('asof-required');
    var h = bomHeader(q, bomId);
    if (!h) throw new Error('template-missing:PP_Product_BOM#' + bomId);
    if (!API.isValidFromTo(h.validfrom, h.validto, asOf)) throw new Error('no-bom:PP_Product_BOM#' + bomId + ' asOf=' + ts(asOf) + ' from=' + ts(h.validfrom) + ' to=' + ts(h.validto));
    var g = getLines(q, bomId, asOf);
    return { hid: 'PP_Product_BOM#' + bomId, header: h, lines: g.lines, excluded: g.excluded, total: g.total };
  }

  // order = { docno, product, qty, bomId, warehouseId, asOf }.  q = read-only (sql, params) -> rows[].  Returns ops[].
  function explodeOps(q, order) {
    var ex = explodeAsOf(q, order.bomId, order.asOf), hid = ex.hid, h = ex.header, lines = ex.lines;
    lines.forEach(function (l) { if (l.isqtypercentage === 'Y') throw new Error('unsupported:isqtypercentage line=' + l.line); });   // not evidenced in legacy: refuse, never guess
    var odoc = 'PP_Order:' + order.docno, ohdr = 'PP_Order_BOM:' + order.docno, ops = [];
    ops.push({ op_type: 'CREATE_DOCUMENT', table: 'PP_Order', uuid: odoc, doc_status: 'DR', documentno: order.docno, m_product_id: order.product, qtyordered: String(order.qty),
      pp_product_bom_id: order.bomId, m_warehouse_id: order.warehouseId, c_uom_id: h.c_uom_id, asof: ts(order.asOf), attrs: order.attrs || {} });   // attrs: the order's own date/org/resource inputs, kept so derived views (MRP) use only what the log holds
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

  var API = { explodeOps: explodeOps, explodeAsOf: explodeAsOf, isValidFromTo: isValidFromTo, getLines: getLines, getDefault: getDefault, bomGet: bomGet, ts: ts, readOrderLines: readOrderLines, register: register, qtyRequired: qtyRequired, WFMC: WFMC, HDR_COPY: HDR_COPY, LINE_COPY: LINE_COPY };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.MfgSnapshot = API;
})(typeof window !== 'undefined' ? window : this);

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_order.js — MOrder + MOrderLine + MInOut + MInOutLine model/DocAction classes, ported and REGISTERED into
// model_layer.js (bim-compiler prompts/ERP_MODEL_LAYER.md §CHANGE-LIST A + B — Witness: W-MODEL-ORACLE).
// Java root: org.adempiere.base/src/org/compiere/model/. One-line cite per rule. Writes only through trx.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'), require('./bigdecimal'));
  else root.ModelOrder = factory(root.ModelLayer, root.ModelTrade, root.BigDecimal);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T, BigDecimal) {
  var D = T.D, N = T.N, Y = T.Y, nz = T.nz, HU = T.HU, Z = T.Z;
  var fire = function (trx, timing, table, row) { return ML.fire(trx, timing, table, row); };
  function lines(trx, o, order) { return trx.find('c_orderline', { c_order_id: o.c_order_id }, order || ['line']).filter(function (l) { return l.isactive !== 'N'; }); }
  function copy(src, cols) { var o = {}; cols.forEach(function (c) { if (src[c] != null) o[c] = src[c]; }); return o; }
  var DIMS = ['ad_orgtrx_id', 'c_project_id', 'c_campaign_id', 'c_activity_id', 'user1_id', 'user2_id', 'c_costcenter_id', 'c_department_id'];

  // ══ StandardTaxProvider.calculateOrderTaxTotal :38-110 ∘ MOrderTax.calculateTaxFromLines :312-372 ══════════════
  function calculateOrderTaxTotal(trx, o, lineLevel) {   // lineLevel: MOrderLine.afterSave/afterDelete → updateOrderTax (zero rows dropped); else the doc-level prepareIt path (saves every row)
    var prec = T.precisionOf(trx, o.c_currency_id), pl = trx.get('m_pricelist', o.m_pricelist_id) || {}, incl = Y(pl.istaxincluded);
    var ls = lines(trx, o), total = Z, seen = {}, keep = {};
    ls.forEach(function (l) {
      total = total.add(D(l.linenetamt));
      var tid = String(l.c_tax_id); if (seen[tid]) return; seen[tid] = 1;
      var t = T.tax(trx, l.c_tax_id); if (!t || nz(t.c_taxprovider_id)) return;
      var base = Z, amt = Z, doc = Y(t.isdocumentlevel);
      ls.forEach(function (x) { if (String(x.c_tax_id) === tid || (nz(t.parent_tax_id) && String(x.c_tax_id) === String(t.parent_tax_id))) { base = base.add(D(x.linenetamt)); if (!doc) amt = amt.add(T.calcTax(trx, t, x.linenetamt, incl, prec)); } });
      if (doc) amt = T.calcTax(trx, t, base, incl, prec);
      var vals = { taxamt: N(amt), taxbaseamt: N(incl ? base.subtract(amt) : base), istaxincluded: incl ? 'Y' : 'N' };
      var ot = T.one(trx, 'c_ordertax', { c_order_id: o.c_order_id, c_tax_id: l.c_tax_id });
      // MOrderLine.updateOrderTax :1049-1062 (line level only) — `if (tax.getTaxAmt().signum() != 0) tax.save() else if (!tax.is_new()) tax.delete()`; the doc-level StandardTaxProvider.calculateOrderTaxTotal :54-58 saves every row (§MODEL-ORDERTAX-ZERO)
      if (lineLevel && amt.signum() === 0) { if (ot) trx.del('c_ordertax', ot); return; }
      if (ot) trx.update('c_ordertax', ot, vals);
      else ot = trx.insert('c_ordertax', ML.newPO(trx, 'c_ordertax', Object.assign({ c_order_id: o.c_order_id, c_tax_id: l.c_tax_id, ad_org_id: o.ad_org_id }, vals)));
      keep[tid] = 1;
    });
    var grand = total;
    trx.find('c_ordertax', { c_order_id: o.c_order_id }).forEach(function (ot) {
      if (!keep[String(ot.c_tax_id)]) { trx.del('c_ordertax', ot); return; }          // :2034 DELETE FROM C_OrderTax (stale taxes)
      var t = T.tax(trx, ot.c_tax_id);
      if (t && Y(t.issummary)) { trx.say('§MODEL-TAX summary tax ' + t.c_tax_id + ' child split not ported (named)'); }
      if (!incl) grand = grand.add(D(ot.taxamt));
    });
    trx.update('c_order', o, { totallines: N(total), grandtotal: N(grand) });
    return true;
  }

  // MOrder.beforeSave :1202-1203 `if (getC_DocType_ID() == 0) setC_DocType_ID(0)` — stored as 0, not NULL
  ML.registerModel('c_order', { beforeSave: function (trx, o) { if (!nz(o.c_doctype_id)) o.c_doctype_id = 0; return null; } });

  // ══ MOrderLine — beforeSave (LineNetAmt) + afterSave :967-985 → recalculateTax → updateHeaderTax :1070 ═════════
  ML.registerModel('c_orderline', {
    // MOrderLine.beforeSave :790-940 — header copy (setOrder :227-238), product pricing (:821-850), line no, UOM, LineNetAmt (:365-372), Discount (:681-691).
    // Pricing runs on EVERY save like legacy (bim-compiler prompts/SQLiteIDEMPIERE.md §39 S2b): server-side setPrice when PriceActual = PriceList = 0,
    // UnderLimitPrice, and ProductNotOnPriceList even when the price was keyed — a save that bypasses the window callout (import, process, sync) is refused the same way.
    beforeSave: function (trx, l, isNew) {
      var o = trx.get('c_order', l.c_order_id); if (!o) return null;
      if (isNew && Y(o.processed)) return 'parent processed';
      if (!nz(l.c_bpartner_id) || !nz(l.c_bpartner_location_id) || !nz(l.m_warehouse_id) || !nz(l.c_currency_id)) {
        ['c_bpartner_id', 'c_bpartner_location_id', 'm_warehouse_id', 'dateordered', 'datepromised', 'c_currency_id'].forEach(function (c) { l[c] = o[c]; });
        if (l.ad_org_id == null) l.ad_org_id = o.ad_org_id;
      }
      if (nz(l.c_charge_id) && nz(l.m_product_id)) l.m_product_id = null;
      if (!nz(l.m_product_id)) l.m_attributesetinstance_id = 0;
      else { var perr = PXO.MOrderLine_beforeSavePricing(trx, l, o); if (perr) return perr; }                // :821-850 (S2b)
      if (!nz(l.c_uom_id)) { var p = T.product(trx, l.m_product_id); if (p) l.c_uom_id = p.c_uom_id; }
      if (!Number(l.line)) { var mx = 0; trx.find('c_orderline', { c_order_id: o.c_order_id }).forEach(function (x) { mx = Math.max(mx, Number(x.line) || 0); }); l.line = mx + 10; }
      var prec = T.precisionOf(trx, o.c_currency_id), bd = D(l.priceentered).multiply(D(l.qtyentered));
      if (bd.scale() > prec) bd = bd.setScale(prec, HU);
      l.linenetamt = N(bd);
      if (D(l.pricelist).signum() !== 0) l.discount = N(D(l.pricelist).subtract(D(l.priceactual)).multiply(D(100)).divide(D(l.pricelist), prec, HU));
      return null;
    },
    afterSave: function (trx, l, isNew, old) {
      var o = trx.get('c_order', l.c_order_id); if (!o || Y(o.processed)) return null;       // :971 parent processed → skip
      if (isNew || !old || String(old.c_tax_id) !== String(l.c_tax_id) || String(old.linenetamt) !== String(l.linenetamt)) {
        calculateOrderTaxTotal(trx, o, true);                                                // updateOrderTax + updateHeaderTax (StandardTaxProvider :113-163)
      }
      return null;
    },
    afterDelete: function (trx, l) { var o = trx.get('c_order', l.c_order_id); if (o && !Y(o.processed)) calculateOrderTaxTotal(trx, o, true); return null; }
  });

  // ══ MOrder.reserveStock :1925-2024 ════════════════════════════════════════════════════════════════════════════
  function reserveStock(trx, o, d, ls) {
    var binding = !(d.docsubtypeso === 'ON');                                                  // !dt.isProposal()
    if (o.docaction === 'VO' || (d.docsubtypeso === 'OB' && o.docaction === 'CL')) binding = false;
    var so = Y(o.issotrx), hdrWh = o.m_warehouse_id;
    if (d.docsubtypeso === 'SO' || d.docbasetype === 'POO') hdrWh = 0;                         // :1944-1946
    var vol = Z, wt = Z;
    for (var i = 0; i < ls.length; i++) {
      var l = ls[i];
      if (nz(hdrWh)) { var ch = {}; if (String(hdrWh) !== String(l.m_warehouse_id)) ch.m_warehouse_id = hdrWh; if (String(o.ad_org_id) !== String(l.ad_org_id)) ch.ad_org_id = o.ad_org_id; if (Object.keys(ch).length) trx.update('c_orderline', l, ch); }
      var target = binding ? D(l.qtyordered) : Z;
      var diff = target.compareTo(D(l.qtydelivered)) > 0 ? target.subtract(D(l.qtydelivered)) : Z;
      diff = diff.subtract(D(l.qtyreserved));
      var p = T.product(trx, l.m_product_id);
      if (diff.signum() === 0 || D(l.qtyordered).signum() < 0) {
        if (diff.signum() === 0 || D(l.qtyreserved).signum() === 0) { if (p) { vol = vol.add(D(p.volume).multiply(D(l.qtyordered))); wt = wt.add(D(p.weight).multiply(D(l.qtyordered))); } continue; }
        else if (D(l.qtyordered).signum() < 0 && D(l.qtyreserved).signum() > 0) diff = D(l.qtyreserved).negate();
      }
      if (p) {
        if (T.isStocked(p)) {
          var e = T.reservationAdd(trx, l.m_warehouse_id, l.m_product_id, l.m_attributesetinstance_id, diff, so,
            { ad_table_id: 260, record_id: l.c_orderline_id, c_doctype_id: o.c_doctype_id, documentno: o.documentno, lineno: l.line });
          if (e) return false;
        }
        trx.update('c_orderline', l, { qtyreserved: N(D(l.qtyreserved).add(diff)) });
        vol = vol.add(D(p.volume).multiply(D(l.qtyordered))); wt = wt.add(D(p.weight).multiply(D(l.qtyordered)));
      }
    }
    trx.update('c_order', o, { volume: N(vol), weight: N(wt) });
    return true;
  }
  function autoInOut(sub, isAuto) { return sub === 'WI' || sub === 'WP' || sub === 'WR' || (sub === 'PR' && Y(isAuto)); }   // :2250-2256

  // ══ MOrder DocAction ══════════════════════════════════════════════════════════════════════════════════════════
  var MOrder = {
    prepareIt: function (trx, o) {                                                           // :1536-1721
      var m = fire(trx, 'BEFORE_PREPARE', 'c_order', o); if (m) { T.msg(trx, m); return 'IN'; }
      var d = T.dt(trx, o.c_doctypetarget_id); if (!d) { T.msg(trx, 'No Document Type'); return 'IN'; }
      if (!T.periodOpen(trx, o.dateacct, d.docbasetype)) { T.msg(trx, '@PeriodClosed@'); return 'IN'; }              // :1544-1549
      if (Y(o.issotrx) && o.deliveryviarule === 'S') {
        if (!nz(o.m_shipper_id)) { T.msg(trx, '@FillMandatory@ M_Shipper_ID'); return 'IN'; }
        T.msg(trx, 'calculateFreightCharge (MOrder.java:1726) not ported — named, refused rather than skipped'); return 'IN';
      }
      var ls = lines(trx, o, ['m_product_id']);
      if (!ls.length) { T.msg(trx, '@NoLines@'); return 'IN'; }
      if (o.deliveryrule === 'O') for (var i = 0; i < ls.length; i++) {                      // :1572-1588
        var p0 = T.product(trx, ls[i].m_product_id);
        if (p0 && Y(p0.isexcludeautodelivery)) { T.msg(trx, '@M_Product_ID@ ' + p0.value + ' @IsExcludeAutoDelivery@'); return 'IN'; }
      }
      if (String(o.c_doctype_id || 0) !== String(o.c_doctypetarget_id)) {                   // :1591-1631 convert DocType
        if (nz(o.c_doctype_id)) { var old = T.dt(trx, o.c_doctype_id);
          if (old && old.docsubtypeso === 'SO' && d.docsubtypeso !== 'SO' && ls.some(function (l) { return String(l.m_warehouse_id) !== String(o.m_warehouse_id); })) { T.msg(trx, '@CannotChangeDocType@'); return 'IN'; } }
        if (/^(DR|IP|IN)$/.test(o.docstatus || 'DR') || !nz(o.c_doctype_id)) trx.update('c_order', o, { c_doctype_id: o.c_doctypetarget_id });
        else if (d.docsubtypeso === 'ON' || d.docsubtypeso === 'OB') trx.update('c_order', o, { c_doctype_id: o.c_doctypetarget_id });
        else { T.msg(trx, '@CannotChangeDocType@'); return 'IN'; }
      }
      // :1634-1649 ASI mandatory — products with an attribute set: MAttributeSet.isMandatory gate (named below if set)
      for (var a = 0; a < ls.length; a++) { var pa = T.product(trx, ls[a].m_product_id);
        if (pa && nz(pa.m_attributeset_id) && !nz(ls[a].m_attributesetinstance_id)) { var as = trx.get('m_attributeset', pa.m_attributeset_id);
          if (as && Y(as.ismandatory) && (as.mandatorytype === 'Y' || (as.mandatorytype === 'S' && Y(o.issotrx)))) { T.msg(trx, '@M_AttributeSet_ID@ @IsMandatory@ (@Line@ #' + ls[a].line + ')'); return 'IN'; } } }
      // :1652 explodeBOM — non-stocked verified BOMs
      if (ls.some(function (l) { var p = T.product(trx, l.m_product_id); return p && Y(p.isbom) && Y(p.isverified) && !Y(p.isstocked); })) { T.msg(trx, 'explodeBOM (MOrder.java:1823) not ported — named'); return 'IN'; }
      if (!autoInOut(d.docsubtypeso, d.isautogenerateinout)) { if (!reserveStock(trx, o, d, ls)) { T.msg(trx, 'Cannot reserve Stock -> ' + (trx._msg || '')); return 'IN'; } }
      calculateOrderTaxTotal(trx, o);
      o = trx.get('c_order', o.c_order_id);
      if (D(o.grandtotal).signum() !== 0 && (o.paymentrule === 'P' || o.paymentrule === 'D')) {     // :1672-1686 createPaySchedule
        var term = trx.get('c_paymentterm', o.c_paymentterm_id);
        if (!term) { T.msg(trx, '@ErrorPaymentSchedule@'); return 'IN'; }
        if (trx.find('c_payschedule', { c_paymentterm_id: o.c_paymentterm_id }).length) { T.msg(trx, 'MPaymentTerm.applyOrder schedule (MOrder.java:2054) not ported — named'); return 'IN'; }
      }
      var cm = creditOrder(trx, o, d); if (cm) { T.msg(trx, cm); return 'IN'; }              // :1688-1697
      m = fire(trx, 'AFTER_PREPARE', 'c_order', o); if (m) { T.msg(trx, m); return 'IN'; }
      trx._justPrepared = 'c_order:' + o.c_order_id;
      return 'IP';
    },
    completeIt: function (trx, o) {                                                          // :2108-2246
      var d = T.dt(trx, o.c_doctype_id), sub = d.docsubtypeso;
      if (o.docaction === 'PR') { setProcessed(trx, o, 'N'); return 'IP'; }
      if (sub === 'ON' || sub === 'OB') {                                                    // :2124-2138 offers
        if (sub === 'OB') reserveStock(trx, o, d, lines(trx, o, ['m_product_id']));
        var mo = fire(trx, 'BEFORE_COMPLETE', 'c_order', o) || fire(trx, 'AFTER_COMPLETE', 'c_order', o); if (mo) { T.msg(trx, mo); return 'IN'; }
        setProcessed(trx, o, 'Y'); return 'CO';
      }
      if (sub === 'PR' && !nz(o.c_payment_id) && !nz(o.c_cashline_id)) { setProcessed(trx, o, 'Y'); return 'WP'; }   // :2140-2146
      if (trx._justPrepared !== 'c_order:' + o.c_order_id) { var st = MOrder.prepareIt(trx, o); if (st !== 'IP') return st; }
      trx._justPrepared = null;
      var m = fire(trx, 'BEFORE_COMPLETE', 'c_order', o); if (m) { T.msg(trx, m); return 'IN'; }
      if (!Y(o.isapproved)) trx.update('c_order', o, { isapproved: 'Y' });                 // :2159 approveIt
      // :2170 createCounterDoc — only for an inter-org BP with a counter doctype
      var bp = trx.get('c_bpartner', o.c_bpartner_id);
      if (bp && nz(bp.ad_orgbp_id)) { T.msg(trx, 'createCounterDoc (MOrder.java:2598) not ported — named'); return 'IN'; }
      var shipment = null;
      if (autoInOut(sub, d.isautogenerateinout)) {
        if (o.deliveryrule !== 'F') { var wh = trx.get('m_warehouse', o.m_warehouse_id); if (wh && !Y(wh.isdisallownegativeinv)) trx.update('c_order', o, { deliveryrule: 'F' }); }   // :2181-2186
        shipment = createShipment(trx, o, d, o.dateordered);                                 // realTimePOS=false default → DateOrdered
        if (!shipment) return 'IN';
      }
      if (sub === 'WR' || sub === 'WI' || (sub === 'PR' && Y(d.isautogenerateinvoice))) {
        var inv = MOrder._createInvoice(trx, o, d, shipment, o.dateordered); if (!inv) return 'IN';
      }
      if (Y(o.issotrx) && sub === 'WR' && o.paymentrule === 'M') { T.msg(trx, 'createPOSPayments mixed tender (MOrder.java:2298) not ported — named'); return 'IN'; }
      m = fire(trx, 'AFTER_COMPLETE', 'c_order', o); if (m) { T.msg(trx, m); return 'IN'; }
      if (!Y(o.issotrx) && trx.find('c_orderlandedcost', { c_order_id: o.c_order_id }).length) { T.msg(trx, 'landedCostAllocation (MOrder.java:2283) not ported — named'); return 'IN'; }
      lines(trx, o).forEach(function (l) {                                                   // :2259-2268 updateOverReceipt
        if (!nz(l.m_product_id)) return;
        if (D(l.qtydelivered).signum() > 0 && D(l.qtyordered).compareTo(D(l.qtydelivered)) >= 0)
          trx.find('m_inoutline', { c_orderline_id: l.c_orderline_id }).forEach(function (s) { if (D(s.qtyoverreceipt).signum() > 0) trx.update('m_inoutline', s, { qtyoverreceipt: 0 }); });
      });
      setProcessed(trx, o, 'Y');
      trx.update('c_order', o, { docaction: 'CL' });
      return 'CO';
    },
    // MOrder.voidIt :2680-2760 — reversals of completed shipments/invoices (createReversals :2762, MInOut/MInvoice.reverseCorrectIt)
    // are not ported: an order that HAS them is refused by name; an order without them voids exactly as iDempiere does.
    voidIt: function (trx, o) {
      var m = fire(trx, 'BEFORE_VOID', 'c_order', o); if (m) { T.msg(trx, m); return false; }
      if (nz(o.link_order_id)) { var so = trx.get('c_order', o.link_order_id); if (so) trx.update('c_order', so, { link_order_id: null }); }
      var live = trx.find('m_inout', { c_order_id: o.c_order_id }).concat(trx.find('c_invoice', { c_order_id: o.c_order_id })).filter(function (d) { return !/^(CL|RE|VO)$/.test(d.docstatus || ''); });
      if (live.length) { T.msg(trx, 'createReversals (MOrder.java:2762 → reverseCorrectIt) not ported — ' + live.length + ' shipment/invoice to reverse; named'); return false; }
      if (!Y(o.issotrx) && trx.find('m_matchpo', { c_orderline_id: null }).length) { /* deleteMatchPOCostDetail — P2P, named with the P2P lane */ }
      var ls = lines(trx, o, ['m_product_id']), voided = T.msgText(trx, 'Voided');
      ls.forEach(function (l) {
        var old = D(l.qtyordered);
        if (old.signum() !== 0) { T.addDescription(trx, 'c_orderline', l, voided + ' (' + old.toString() + ')'); trx.update('c_orderline', l, { qtyordered: 0, qtyentered: 0, linenetamt: 0 }); }   // setQty(0) = QtyEntered+QtyOrdered
        if (nz(l.link_orderline_id)) { var sl = trx.get('c_orderline', l.link_orderline_id); if (sl) trx.update('c_orderline', sl, { link_orderline_id: null }); }
      });
      var prec = T.precisionOf(trx, o.c_currency_id), incl = Y((trx.get('m_pricelist', o.m_pricelist_id) || {}).istaxincluded);
      trx.find('c_ordertax', { c_order_id: o.c_order_id }).forEach(function (ot) {           // tax.calculateTaxFromLines + save
        var t = T.tax(trx, ot.c_tax_id), base = Z, amt = Z;
        lines(trx, o).forEach(function (x) { if (String(x.c_tax_id) === String(ot.c_tax_id)) { base = base.add(D(x.linenetamt)); if (!Y(t.isdocumentlevel)) amt = amt.add(T.calcTax(trx, t, x.linenetamt, incl, prec)); } });
        if (Y(t.isdocumentlevel)) amt = T.calcTax(trx, t, base, incl, prec);
        trx.update('c_ordertax', ot, { taxamt: N(amt), taxbaseamt: N(incl ? base.subtract(amt) : base) });
      });
      T.addDescription(trx, 'c_order', o, voided);
      if (!reserveStock(trx, trx.get('c_order', o.c_order_id), T.dt(trx, o.c_doctype_id), lines(trx, o, ['m_product_id']))) { T.msg(trx, 'Cannot unreserve Stock (void)'); return false; }
      trx.find('fact_acct', { ad_table_id: 259, record_id: o.c_order_id }).forEach(function (f) { trx.del('fact_acct', f); });   // MFactAcct.deleteEx
      trx.update('c_order', o, { posted: 'N' });
      m = fire(trx, 'AFTER_VOID', 'c_order', o); if (m) { T.msg(trx, m); return false; }
      trx.update('c_order', o, { totallines: 0, grandtotal: 0, docaction: '--' });
      setProcessed(trx, o, 'Y');
      trx.update('c_order', o, { docstatus: 'VO' });                                          // DocumentEngine.voidIt → STATUS_Voided
      return true;
    },
    approveIt: function (trx, o) { trx.update('c_order', o, { isapproved: 'Y' }); return true; },
    rejectIt: function (trx, o) { trx.update('c_order', o, { isapproved: 'N' }); return true; },
    getSummary: function (trx, o) { return (o.documentno || '') + ': Grand Total=' + o.grandtotal + (o.description ? ' - ' + o.description : ''); }   // :3099-3112
  };
  // MOrder.setProcessed :1127-1140 + PO.setProcessedOn (PO.java:1108-1138, env.now = the recorded clock)
  function setProcessed(trx, o, flag) {
    var ch = { processed: flag }; if (flag === 'Y' && !Number(o.processedon) && trx.env.nowMillis != null) ch.processedon = trx.env.nowMillis;
    trx.update('c_order', o, ch);
    trx.find('c_orderline', { c_order_id: o.c_order_id }).forEach(function (l) { trx.update('c_orderline', l, { processed: flag }); });
    trx.find('c_ordertax', { c_order_id: o.c_order_id }).forEach(function (t) { trx.update('c_ordertax', t, { processed: flag }); });
  }
  // CreditManagerOrder.checkCreditStatus(Prepare) model/credit :48-97 (CHECK_CREDIT_ON_CASH_POS_ORDER / _PREPAY_ORDER default true)
  function creditOrder(trx, o, d) {
    if (!Y(o.issotrx)) return null;
    var bp = trx.get('c_bpartner', o.bill_bpartner_id || o.c_bpartner_id); if (!bp || !(D(o.grandtotal).signum() > 0)) return null;
    if (bp.socreditstatus === 'S') return '@BPartnerCreditStop@ - @TotalOpenBalance@=' + bp.totalopenbalance + ', @SO_CreditLimit@=' + bp.so_creditlimit;
    if (bp.socreditstatus === 'H') return '@BPartnerCreditHold@ - @TotalOpenBalance@=' + bp.totalopenbalance + ', @SO_CreditLimit@=' + bp.so_creditlimit;
    var lim = D(bp.so_creditlimit), st = bp.socreditstatus;                                  // MBPartner.getSOCreditStatus(amt) :823-848
    if (st !== 'X' && st !== 'S' && lim.signum() !== 0 && lim.subtract(D(o.grandtotal)).compareTo(D(bp.totalopenbalance)) < 0)
      return '@BPartnerOverOCreditHold@ - @TotalOpenBalance@=' + bp.totalopenbalance + ', @GrandTotal@=' + o.grandtotal + ', @SO_CreditLimit@=' + bp.so_creditlimit;
    return null;
  }

  function ctorMod() { return (typeof module !== 'undefined' && module.exports) ? require('./model_ctor') : (typeof window !== 'undefined' ? window.ModelCtor : globalThis.ModelCtor); }
  // ══ MOrder.createShipment(dt, movementDate) :2433-2490 ═════════════════════════════════════════════════════════
  function createShipment(trx, o, d, movementDate) {
    var C = ctorMod(), shipment = C.MInOutFromOrder(trx, trx.get('c_order', o.c_order_id), d.c_doctypeshipment_id, movementDate);
    if (!shipment.save()) { T.msg(trx, 'Could not create Shipment'); return null; }
    var oLines = trx.find('c_orderline', { c_order_id: o.c_order_id }, ['line']);            // getLines(true, null)
    for (var i = 0; i < oLines.length; i++) {
      var oLine = oLines[i], ioLine = C.MInOutLine(trx, shipment);
      var MovementQty = D(oLine.qtyordered).subtract(D(oLine.qtydelivered));                // Qty = Ordered - Delivered
      if (MovementQty.signum() === 0 && D(trx.get('c_order', o.c_order_id).processedon).signum() !== 0) continue;   // reactivated + completed again
      var M_Locator_ID = C.storageLocator(trx, oLine.m_warehouse_id, oLine.m_product_id, Number(oLine.m_attributesetinstance_id || 0), MovementQty);
      if (!M_Locator_ID) M_Locator_ID = C.defaultLocator(trx, oLine.m_warehouse_id);
      C.ioSetOrderLine(trx, ioLine, oLine, M_Locator_ID, MovementQty);
      C.ioSetQty(trx, ioLine, MovementQty);
      if (D(oLine.qtyentered).compareTo(D(oLine.qtyordered)) !== 0) C.ioSetQtyEntered(trx, ioLine, MovementQty.multiply(D(oLine.qtyentered)).divide(D(oLine.qtyordered), 6, HU));
      if (!ioLine.save()) { T.msg(trx, 'Could not create Shipment Line'); return null; }
    }
    var res = ML.processIt(trx, 'm_inout', shipment.id(), 'CO');
    if (!res.ok) throw new Error('FailedProcessingDocument - ' + (res.msg || res.status));
    var sh = trx.get('m_inout', shipment.id());
    if (sh.docstatus !== 'CO') { T.msg(trx, '@M_InOut_ID@: ' + (res.msg || '')); return null; }
    return sh;
  }

  function matchMod() { return (typeof module !== 'undefined' && module.exports) ? require('./model_match') : (typeof window !== 'undefined' ? window.ModelMatch : globalThis.ModelMatch); }
  function sameAsi(a, b) { return String(a.m_attributesetinstance_id || 0) === String(b.m_attributesetinstance_id || 0); }
  // IDocsPostProcess (process/IDocsPostProcess.java): the PO instances a completion queues for posting after the document; each
  // entry carries ITS OWN in-memory Posted flag (DocumentEngine.java:367 skips an entry whose instance says Posted=Y).
  function addDocsPostProcess(trx, table, row) { (trx._docsPost = trx._docsPost || []).push({ table: table, id: row[table + '_id'], posted: row.posted }); }
  // ══ MInOut DocAction (prepareIt :1437-1590, completeIt :1630-2159) ════════════════════════════════════════════
  function ioLines(trx, io) { return trx.find('m_inoutline', { m_inout_id: io.m_inout_id }, ['line']).filter(function (l) { return l.isactive !== 'N'; }); }
  var MInOut = {
    prepareIt: function (trx, io) {
      var m = fire(trx, 'BEFORE_PREPARE', 'm_inout', io); if (m) { T.msg(trx, m); return 'IN'; }
      var d = T.dt(trx, io.c_doctype_id);
      if (nz(io.c_order_id) && nz(io.m_rma_id)) { T.msg(trx, '@OrderOrRMA@'); return 'IN'; }
      if (!T.periodOpen(trx, io.dateacct, d.docbasetype)) { T.msg(trx, '@PeriodClosed@'); return 'IN'; }
      var ls = ioLines(trx, io); if (!ls.length) { T.msg(trx, '@NoLines@'); return 'IN'; }
      var vol = Z, wt = Z;
      ls.forEach(function (l) { var p = T.product(trx, l.m_product_id); if (p) { vol = vol.add(D(p.volume).multiply(D(l.movementqty))); wt = wt.add(D(p.weight).multiply(D(l.movementqty))); } });
      trx.update('m_inout', io, { volume: N(vol), weight: N(wt) });                          // :1531-1532
      if (Y(d.isshipconfirm) || Y(d.ispickqaconfirm)) { T.msg(trx, 'createConfirmation (MInOut.java) not ported — named'); return 'IN'; }
      m = fire(trx, 'AFTER_PREPARE', 'm_inout', io); if (m) { T.msg(trx, m); return 'IN'; }
      if (io.docaction !== 'CO') trx.update('m_inout', io, { docaction: 'CO' });
      trx._justPrepared = 'm_inout:' + io.m_inout_id;
      return 'IP';
    },
    completeIt: function (trx, io) {
      if (trx._justPrepared !== 'm_inout:' + io.m_inout_id) { var st = MInOut.prepareIt(trx, io); if (st !== 'IP') return st; }
      trx._justPrepared = null;
      var m = fire(trx, 'BEFORE_COMPLETE', 'm_inout', io); if (m) { T.msg(trx, m); return 'IN'; }
      if (!Y(io.isapproved)) trx.update('m_inout', io, { isapproved: 'Y' });
      var mt = io.movementtype, out = mt.charAt(1) === '-', so = Y(io.issotrx);
      var ls = ioLines(trx, io);
      for (var li = 0; li < ls.length; li++) {
        var sl = ls[li], p = T.product(trx, sl.m_product_id);
        var qty = out ? D(sl.movementqty).negate() : D(sl.movementqty);
        var ol = nz(sl.c_orderline_id) ? trx.get('c_orderline', sl.c_orderline_id) : null;
        var oh = ol ? trx.get('c_order', ol.c_order_id) : null, closed = oh && oh.docstatus === 'CL';
        if (T.isStocked(p)) {
          checkMaterialPolicy(trx, io, sl, p, D(sl.movementqty));                            // :1714 (no manual MA tab rows ported)
          var resv = D(sl.movementqty);
          if (ol && resv.compareTo(D(ol.qtyreserved)) > 0) resv = D(ol.qtyreserved);          // :1736-1747
          var mtrx = null;
          if (!nz(sl.m_attributesetinstance_id)) {
            trx.find('m_inoutlinema', { m_inoutline_id: sl.m_inoutline_id }).forEach(function (ma) {   // :1750-1790
              var qma = out ? D(ma.movementqty).negate() : D(ma.movementqty);
              var e = T.storageAdd(trx, sl.m_locator_id, sl.m_product_id, ma.m_attributesetinstance_id, qma, ma.datematerialpolicy); if (e) throw new Error(e);
              mtrx = trx.insert('m_transaction', ML.newPO(trx, 'm_transaction', { ad_org_id: sl.ad_org_id, movementtype: mt, m_locator_id: sl.m_locator_id, m_product_id: sl.m_product_id,
                m_attributesetinstance_id: ma.m_attributesetinstance_id, movementqty: N(qma), movementdate: io.movementdate, m_inoutline_id: sl.m_inoutline_id }));
            });
            if (ol && mtrx && !closed && D(ol.qtyreserved).signum() > 0 && nz(ol.m_product_id))
              T.reservationAdd(trx, ol.m_warehouse_id, ol.m_product_id, ol.m_attributesetinstance_id, resv.negate(), so,
                { ad_table_id: 320, record_id: sl.m_inoutline_id, c_doctype_id: io.c_doctype_id, documentno: io.documentno, lineno: sl.line });
          }
          if (!mtrx) {                                                                        // :1817-1898 fallback (ASI set on the line)
            var e2 = T.storageAdd(trx, sl.m_locator_id, sl.m_product_id, sl.m_attributesetinstance_id, qty, io.movementdate); if (e2) throw new Error(e2);
            if (ol && nz(ol.m_product_id) && !closed && D(ol.qtyreserved).signum() > 0)
              T.reservationAdd(trx, ol.m_warehouse_id, ol.m_product_id, ol.m_attributesetinstance_id, resv.negate(), so,
                { ad_table_id: 320, record_id: sl.m_inoutline_id, c_doctype_id: io.c_doctype_id, documentno: io.documentno, lineno: sl.line });
            trx.insert('m_transaction', ML.newPO(trx, 'm_transaction', { ad_org_id: sl.ad_org_id, movementtype: mt, m_locator_id: sl.m_locator_id, m_product_id: sl.m_product_id,
              m_attributesetinstance_id: sl.m_attributesetinstance_id || 0, movementqty: N(qty), movementdate: io.movementdate, m_inoutline_id: sl.m_inoutline_id }));
          }
        }
        if (p && ol && !closed && D(ol.qtyordered).signum() >= 0) {                          // :1961-1971 correct order line
          var nr = D(ol.qtyreserved).subtract(D(sl.movementqty));
          if (nr.signum() < 0 || D(ol.qtydelivered).compareTo(D(ol.qtyordered)) > 0) nr = Z;
          trx.update('c_orderline', ol, { qtyreserved: N(nr) });
        }
        if (ol && (so || !nz(sl.m_product_id))) {                                             // :1974-1985
          trx.update('c_orderline', ol, { qtydelivered: N(so ? D(ol.qtydelivered).subtract(qty) : D(ol.qtydelivered).add(qty)), datedelivered: io.movementdate });
        }
        if (p && so && Y(p.iscreateasset) && D(sl.movementqty).signum() > 0) { T.msg(trx, 'Create Asset for SO (MInOut.java:2016) — non-core, named'); return 'IN'; }
        if (!so && nz(sl.m_product_id) && !trx._reversal) {                                    // :2047-2134 Matching
          var MM = matchMod(), matchQty = D(sl.movementqty);
          var iLine = trx.find('c_invoiceline', { m_inoutline_id: sl.m_inoutline_id }).sort(function (a, b) { return Number(a.c_invoiceline_id) - Number(b.c_invoiceline_id); })[0] || null;   // MInvoiceLine.getOfInOutLine
          if (iLine && nz(iLine.m_product_id)) {                                                 // Invoice - Receipt Match
            if (matchQty.compareTo(D(iLine.qtyinvoiced)) > 0) matchQty = D(iLine.qtyinvoiced);
            if (!MM.miGet(trx, sl.m_inoutline_id, iLine.c_invoiceline_id).length) {
              var inv = MM.newMatchInv(trx, iLine, io.movementdate, matchQty);
              if (!sameAsi(sl, iLine)) { var r0 = ML.save(trx, 'c_invoiceline', iLine, { m_attributesetinstance_id: sl.m_attributesetinstance_id || 0 }); if (!r0.ok) throw new Error(r0.error); inv.set('m_attributesetinstance_id', sl.m_attributesetinstance_id || 0); }
              if (!inv.save()) { T.msg(trx, 'Could not create Inv Matching'); return 'IN'; }
              addDocsPostProcess(trx, 'm_matchinv', inv.row);
            }
          }
          if (nz(sl.c_orderline_id)) {                                                           // Link to Order — Ship - PO
            var po = MM.create(trx, null, trx.get('m_inoutline', sl.m_inoutline_id), io.movementdate, matchQty);
            if (po) {
              if (!po.save()) { T.msg(trx, 'Could not create PO Matching'); return 'IN'; }
              if (!Y(po.get('posted'))) addDocsPostProcess(trx, 'm_matchpo', po.row);
              MM.miGetInOut(trx, io.m_inout_id).forEach(function (mi) { addDocsPostProcess(trx, 'm_matchinv', mi); });
            }
            if (ol && !nz(ol.m_attributesetinstance_id) && D(sl.movementqty).compareTo(D(ol.qtyordered)) === 0 && nz(sl.m_attributesetinstance_id)) {   // Update PO with ASI [ 1876965 ]
              var r1 = ML.save(trx, 'c_orderline', trx.get('c_orderline', ol.c_orderline_id), { m_attributesetinstance_id: sl.m_attributesetinstance_id }); if (!r1.ok) throw new Error(r1.error);
            }
          } else if (iLine && nz(iLine.c_orderline_id)) {                                       // No Order — PO(Inv) Matching
            var po2 = MM.create(trx, iLine, trx.get('m_inoutline', sl.m_inoutline_id), io.movementdate, matchQty);
            if (po2) { if (!po2.save()) { T.msg(trx, 'Could not create PO(Inv) Matching'); return 'IN'; } if (!Y(po2.get('posted'))) addDocsPostProcess(trx, 'm_matchpo', po2.row); }
            var ol2 = trx.get('c_orderline', iLine.c_orderline_id);
            if (ol2 && !nz(ol2.m_attributesetinstance_id) && D(sl.movementqty).compareTo(D(ol2.qtyordered)) === 0 && nz(sl.m_attributesetinstance_id)) {
              var r2 = ML.save(trx, 'c_orderline', ol2, { m_attributesetinstance_id: sl.m_attributesetinstance_id }); if (!r2.ok) throw new Error(r2.error);
            }
          }
        }
      }
      m = fire(trx, 'AFTER_COMPLETE', 'm_inout', io); if (m) { T.msg(trx, m); return 'IN'; }
      trx.update('m_inout', io, { processed: 'Y', docaction: 'CL' });
      trx.find('m_inoutline', { m_inout_id: io.m_inout_id }).forEach(function (l) { trx.update('m_inoutline', l, { processed: 'Y' }); });   // MInOut.setProcessed
      return 'CO';
    },
    approveIt: function (trx, io) { trx.update('m_inout', io, { isapproved: 'Y' }); return true; },
    getSummary: function (trx, io) { return (io.documentno || '') + (io.description ? ' - ' + io.description : ''); }
  };
  // MInOut.checkMaterialPolicy — outgoing (C-/V-) FiFo/LiFo over positive storages of the line's locator; incoming V+
  // gets one MA at MovementDate (autoBalanceNegative not ported — named in the log when a negative storage exists).
  function checkMaterialPolicy(trx, io, sl, p, qty) {
    trx.find('m_inoutlinema', { m_inoutline_id: sl.m_inoutline_id }).forEach(function (ma) { if (ma.isautogenerated === 'Y') trx.del('m_inoutlinema', ma); });
    if (qty.signum() === 0 || nz(sl.m_attributesetinstance_id)) return;
    var mt = io.movementtype;
    function ma(asi, q, dmp) { trx.insert('m_inoutlinema', ML.newPO(trx, 'm_inoutlinema', { ad_org_id: sl.ad_org_id, m_inoutline_id: sl.m_inoutline_id, m_attributesetinstance_id: asi || 0, movementqty: N(q), datematerialpolicy: dmp, isautogenerated: 'Y' })); }
    var day = String(io.movementdate || '').slice(0, 10) + ' 00:00:00';
    if (mt === 'V+' || mt === 'C+') { ma(0, qty, day); return; }
    var cat = trx.get('m_product_category', p.m_product_category_id) || {}, cl = trx.get('ad_clientinfo', trx.env.client) || {};
    var fifo = (cat.mmpolicy || (trx.get('ad_client', trx.env.client) || {}).mmpolicy || 'F') === 'F';
    var st = trx.find('m_storageonhand', { m_product_id: sl.m_product_id, m_locator_id: sl.m_locator_id }).filter(function (s) { return D(s.qtyonhand).signum() > 0; })
      .sort(function (a, b) { var x = String(a.datematerialpolicy), y = String(b.datematerialpolicy); return fifo ? (x < y ? -1 : x > y ? 1 : 0) : (x < y ? 1 : x > y ? -1 : 0); });
    var left = qty;
    for (var i = 0; i < st.length && left.signum() !== 0; i++) {
      if (D(st[i].qtyonhand).compareTo(left) >= 0) { ma(st[i].m_attributesetinstance_id, left, st[i].datematerialpolicy); left = Z; }
      else { ma(st[i].m_attributesetinstance_id, D(st[i].qtyonhand), st[i].datematerialpolicy); left = left.subtract(D(st[i].qtyonhand)); }
    }
    if (left.signum() !== 0) ma(sl.m_attributesetinstance_id, left, day);                     // over-delivery
    void cl;
  }

  // setInitialDefaults of the generated documents (MInOut.java:585-600)
  ML.registerModel('m_inout', { initialDefaults: { issotrx: 'N', deliveryrule: 'A', deliveryviarule: 'P', freightcostrule: 'I', docstatus: 'DR', docaction: 'CO', priorityrule: '5', nopackages: 0, isintransit: 'N', isprinted: 'N', sendemail: 'N', isindispute: 'N' } });
  ML.registerDocAction('c_order', MOrder);
  ML.registerDocAction('m_inout', MInOut);

  // ══ process-lane M-class statics — MOVED here from processes/support_copy.js / RMACreateOrder.js / InOutCreateConfirm.js / support_docgen.js
  // (one implementation per responsibility, §CP-OPEN 4b). Code is the process lane's verbatim port; nz() below is the numeric Java getXxx_ID() form.
  var PXO = (function (MLo) {
    var NODE = typeof module !== 'undefined' && module.exports, GL = typeof window !== 'undefined' ? window : globalThis;
    function A() { return NODE ? require('./ad_callout.js') : GL.AdCallout; }
    function R() { return A().RUNTIME; }
    function ML() { return MLo; }
    function nz(v) { return v == null || v === '' ? 0 : Number(v); }
    function Y(v) { return v === 'Y' || v === true; }
    function bd(v) { if (v == null) return null; var a = A(); return v instanceof a.BigDecimal ? v : a.toBD(String(v)); }
    function HU() { return A().RoundingMode.HALF_UP; }
    function ZERO() { return A().Env.ZERO; }
    function say(trx, m) { if (trx && trx.say) trx.say(m); }
    function fkNull(v) { return nz(v) < 1 ? null : v; }                    // X_*.setXxx_ID(int): `if (id < 1) set_Value(col, null)`
    var S = { copyValues: MLo.copyValues };

  function uomPrecision(trx, uomId) { var u = nz(uomId) ? trx.get('c_uom', uomId) : null; return u ? Number(u.stdprecision) : 0; }   // MUOM.getPrecision
  function dayTS(v) { return v == null ? null : A().Timestamp.of(v); }
  // Core.getTaxLookup().get(...) = Tax.get(...) (DefaultTaxLookup.java; ported callouts/tax.js)
  function taxGet(ctx, prod, charge, billDate, shipDate, org, wh, billLoc, shipLoc, drop, isSO, rule) {
    var M = R().M;
    if (M.Core && typeof M.Core.getTaxLookup === 'function') return M.Core.getTaxLookup().get(ctx, prod, charge, billDate, shipDate, org, wh, billLoc, shipLoc, drop, isSO, rule, null);
    return M.Tax.get(ctx, prod, charge, billDate, shipDate, org, wh, billLoc, shipLoc, drop, isSO, rule, null);
  }

  // ══ MOrderLine (MOrderLine.java) ═════════════════════════════════════════════════════════════════════════════
  // setOrder :227-238
  function olSetOrder(line, o) {
    line.set('ad_client_id', o.ad_client_id).set('ad_org_id', o.ad_org_id);
    line.set('c_bpartner_id', o.c_bpartner_id).set('c_bpartner_location_id', o.c_bpartner_location_id).set('m_warehouse_id', o.m_warehouse_id)
      .set('dateordered', o.dateordered).set('datepromised', o.datepromised).set('c_currency_id', o.c_currency_id);
  }
  // setQtyEntered :724-732 — enforce entered-UOM precision
  function olSetQtyEntered(trx, line, q) {
    if (q != null && nz(line.get('c_uom_id')) !== 0) q = bd(q).setScale(uomPrecision(trx, line.get('c_uom_id')), HU());
    line.set('qtyentered', q); return q;
  }
  // setQtyOrdered :738-747 — enforce product UOM precision (MProduct.getUOMPrecision)
  function olSetQtyOrdered(trx, line, q) {
    var p = nz(line.get('m_product_id')) ? trx.get('m_product', line.get('m_product_id')) : null;
    if (q != null && p != null) q = bd(q).setScale(nz(p.c_uom_id) ? uomPrecision(trx, p.c_uom_id) : 0, HU());
    line.set('qtyordered', q); return q;
  }
  // setTax :346-361
  function olSetTax(trx, ctx, line, order) {
    var ii = taxGet(ctx, nz(line.get('m_product_id')), nz(line.get('c_charge_id')), dayTS(line.get('dateordered')), dayTS(line.get('dateordered')),
      nz(line.get('ad_org_id')), nz(line.get('m_warehouse_id')), nz(line.get('c_bpartner_location_id')), nz(line.get('c_bpartner_location_id')),
      nz(order.dropship_location_id), Y(order.issotrx), order.deliveryviarule == null ? null : order.deliveryviarule);
    if (ii === 0) { say(trx, '§MODEL-SEVERE MOrderLine.setTax No Tax found'); return false; }
    line.set('c_tax_id', ii); return true;
  }
  // MOrderLine.getDescriptionStrippingCloseTag :1101-1110 — Pattern "( \\| )?Close \\(.*\\)" split + concat
  function stripCloseTag(d) { return d == null ? d : String(d).replace(/( \| )?Close \(.*\)/g, ''); }


  // MOrderLine.beforeSave :790-850 (the product-pricing part that decides whether the save is refused). A refused save is what PO.save returns false
  // for (ProductNotOnPriceListException / UnderLimitPrice are logged by PO.save, not thrown to the caller).
  function olPricingObj(line) {
    return { getM_Product_ID: function () { return nz(line.get('m_product_id')); }, getC_Order_ID: function () { return nz(line.get('c_order_id')); },
      getC_BPartner_ID: function () { return nz(line.get('c_bpartner_id')); }, getQtyOrdered: function () { return bd(line.get('qtyordered')); }, getDateOrdered: function () { return dayTS(line.get('dateordered')); } };
  }
  function bdz(v) { return v == null ? ZERO() : bd(v); }                    // X_C_OrderLine BigDecimal getters: a NULL column reads as Env.ZERO
  function olBeforeSavePricing(trx, ctx, line, order) {
    var Mm = R().M, plId = nz(order.m_pricelist_id), Env = A().Env;
    if (nz(line.get('c_charge_id')) !== 0 && nz(line.get('m_product_id')) !== 0) line.set('m_product_id', null);       // :816-817
    if (nz(line.get('m_product_id')) === 0) { line.set('m_attributesetinstance_id', 0); return null; }                  // :819-820
    if (Y(line.get('processed'))) return null;                                                                          // :821 else if (!isProcessed())
    var mpp = null;
    function getProductPricing() { mpp = new Mm.MProductPricing(); mpp.setOrderLine(olPricingObj(line), trx); mpp.setM_PriceList_ID(plId); mpp.calculatePrice(); return mpp; }   // :326-334
    if (bdz(line.get('priceactual')).compareTo(Env.ZERO) === 0 && bdz(line.get('pricelist')).compareTo(Env.ZERO) === 0) {  // :824-826 setPrice() :290-322
      if (plId === 0) throw new Error('PriceList unknown!');
      getProductPricing();
      line.set('priceactual', mpp.getPriceStd()).set('pricelist', mpp.getPriceList()).set('pricelimit', mpp.getPriceLimit());
      var qe = bdz(line.get('qtyentered')), qo = bdz(line.get('qtyordered'));
      if (qe.compareTo(qo) === 0) line.set('priceentered', line.get('priceactual'));
      else line.set('priceentered', bdz(line.get('priceactual')).multiply(qo.divide(qe, 12, HU())));
      line.set('discount', mpp.getDiscount());
      if (nz(line.get('c_uom_id')) === 0) line.set('c_uom_id', mpp.getC_UOM_ID());
    }
    if (mpp == null) getProductPricing();                                                                               // :827-828
    var pl = trx.get('m_pricelist', order.m_pricelist_id), enforce = Y(order.issotrx) && pl && Y(pl.enforcepricelimit);   // :831-833
    if (enforce) { var role = trx.get('ad_role', Env.getAD_Role_ID(ctx)); if (role && Y(role.isoverwritepricelimit)) enforce = false; }   // :834-835
    if (enforce && bdz(line.get('pricelimit')).compareTo(Env.ZERO) !== 0 && bdz(line.get('priceactual')).compareTo(bdz(line.get('pricelimit'))) < 0) {   // :836-840
      say(trx, '§MODEL-SEVERE MOrderLine.save UnderLimitPrice PriceEntered=' + line.get('priceentered') + ', PriceLimit=' + line.get('pricelimit')); return 'UnderLimitPrice';
    }
    var dtId = nz(order.c_doctype_id) === 0 ? nz(order.c_doctypetarget_id) : nz(order.c_doctype_id);                   // :843 getParent().getDocTypeID()
    var dt = trx.get('c_doctype', dtId);
    if (!(dt && Y(dt.isnopricelistcheck)) && !mpp.isCalculated()) {                                                     // :846-849
      say(trx, '§MODEL-SEVERE MOrderLine.save ProductNotOnPriceListException Line No:' + line.get('line') + ', Product: ' + nz(line.get('m_product_id')) + ', Price List: ' + plId);
      return 'ProductNotOnPriceList';
    }
    return null;
  }

  // the registered C_OrderLine beforeSave (above) runs the same pricing part on a plain row: a PO-shaped view over the row, the callout runtime bound to THIS
  // trx for the call (read-your-writes, like ad_process.runJava) and restored afterwards, the session role for MRole.getDefault().isOverwritePriceLimit.
  S.MOrderLine_beforeSavePricing = function (trx, row, order) {
    var a = A();
    if (!R().M.MProductPricing && NODE) ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require('./callouts/' + m + '.js'); });   // idempiere.html's script order
    if (!R().M.MProductPricing) { say(trx, '§MODEL-UNPORTED-DEP MOrderLine.beforeSave pricing needs callouts/pricing.js, not loaded on this host — line saved unpriced'); return null; }
    var line = { get: function (c) { return row[c.toLowerCase()]; },
                 set: function (c, v) { row[c.toLowerCase()] = v instanceof a.BigDecimal ? MLo.N(v) : v; return line; } };
    // bind() rewrites RUNTIME.DB, .PO and Env.now (and .now/.log when given opts): every one of them is put back, whatever happens in between (§REVIEW2 R5).
    var RT = R(), sDB = RT.DB, sPO = RT.PO, sNow = RT.now, sEnvNow = a.Env.now, env = trx.env || {};
    a.bind(function (sql, params) { return trx.q(sql, params); });
    try {
      var ctx = new a.Ctx();                                                            // only #AD_Role_ID is read here (MRole.getDefault, :834)
      a.Env.setContext(ctx, a.Env.AD_CLIENT_ID, env.client); a.Env.setContext(ctx, a.Env.AD_ORG_ID, env.org);
      a.Env.setContext(ctx, a.Env.AD_ROLE_ID, env.role != null ? env.role : ((GL.APP && GL.APP.roleId) || 0));
      return olBeforeSavePricing(trx, ctx, line, order);
    } catch (e) {
      // PO.save wraps beforeSave in try/catch (PO.java:2486-2512): an exception there (setPrice() → IllegalStateException "PriceList unknown!", MOrderLine.java:293-296; a pricing SQL error)
      // is logged and save() returns FALSE. The model layer's contract for a refused save is the returned error string — never an exception out of the hook.
      var msg = (e && e.message) || String(e);
      say(trx, '§MODEL-SEVERE MOrderLine.beforeSave ' + msg);
      return msg;
    } finally { RT.DB = sDB; RT.PO = sPO; RT.now = sNow; a.Env.now = sEnvNow; }
  };

  // ══ MOrder.copyLinesFrom(otherOrder, counter, copyASI) (MOrder.java:795-851) ═════════════════════════════════
  S.MOrder_copyLinesFrom = function (trx, ctx, to, other, counter, copyASI) {
    if (Y(to.processed) || Y(to.posted) || other == null) return 0;                              // :797
    var m = ML(), fromLines = trx.find('c_orderline', { c_order_id: other.c_order_id }, ['line']);   // getLines(false,null) ORDER BY Line :925-943
    var count = 0, UC = R().M.MUOMConversion;
    for (var i = 0; i < fromLines.length; i++) {
      var fl = fromLines[i], line = ML().newRecord(trx, 'c_orderline', {});
      // new MOrderLine(this) :185-193 = setInitialDefaults :158-176 + setC_Order_ID + setOrder
      line.set('freightamt', 0).set('linenetamt', 0).set('priceentered', 0).set('priceactual', 0).set('pricelimit', 0).set('pricelist', 0)
        .set('m_attributesetinstance_id', 0).set('qtyentered', 0).set('qtyordered', 0).set('qtydelivered', 0).set('qtyinvoiced', 0).set('qtyreserved', 0)
        .set('isdescription', 'N').set('processed', 'N').set('line', 0);
      line.set('c_order_id', to.c_order_id); olSetOrder(line, to);
      S.copyValues(trx, 'c_orderline', fl, line, to.ad_client_id, to.ad_org_id);                  // :804
      line.set('c_order_id', to.c_order_id);                                                      // :805
      line.set('qtydelivered', 0).set('qtyinvoiced', 0).set('qtyreserved', 0).set('qtylostsales', 0);   // :807-810
      var qe = olSetQtyEntered(trx, line, fl.qtyentered);                                         // :811
      var ordered = UC.convertProductFrom(ctx, nz(line.get('m_product_id')), nz(line.get('c_uom_id')), qe == null ? null : qe);   // :812
      olSetQtyOrdered(trx, line, ordered);                                                        // :813
      line.set('datedelivered', null).set('dateinvoiced', null);                                  // :814-815
      olSetOrder(line, to);                                                                       // :816 setOrder(this)
      if (!counter && other.docstatus === 'CL') line.set('description', stripCloseTag(line.get('description')));   // :818-819
      if (!copyASI) { line.set('m_attributesetinstance_id', 0).set('s_resourceassignment_id', null); }          // :822-826
      line.set('ref_orderline_id', counter ? fkNull(fl.c_orderline_id) : null);                   // :827-830
      line.set('link_orderline_id', null);                                                        // :833
      if (String(nz(to.c_bpartner_id)) !== String(nz(other.c_bpartner_id))) olSetTax(trx, ctx, line, to);       // :835-836
      line.set('processed', 'N');                                                                 // :839
      var ok = line.save(); if (ok) count++;                                                      // :840-841 (PO.save → the registered MOrderLine.beforeSave prices the line, :790-850)
      if (counter) {                                                                              // :843-847 cross link
        var fresh = trx.get('c_orderline', fl.c_orderline_id);
        var r2 = ML().save(trx, 'c_orderline', fresh, { ref_orderline_id: line.id() }); if (!r2.ok) throw new Error('SaveError c_orderline: ' + r2.error);
      }
    }
    if (fromLines.length !== count) say(trx, '§MODEL-SEVERE MOrder.copyLinesFrom Line difference - From=' + fromLines.length + ' <> Saved=' + count);   // :849
    return count;
  };

  // ── PO helpers the doc-from-doc processes share (was support_docgen.js)
  // rows of `table` where col=id ordered like the Java getLines(false) (ORDER BY Line, no IsActive filter)
  S.lines = function (trx, table, col, id) { return trx.find(table, (function (o) { o[col] = id; return o; })({}), ['line']); };
  // PO.saveEx → AdempiereException with the PO's error (PO.java saveEx: throws AdempiereException(CLogger error))
  S.saveEx = function (po) { if (!po.save()) throw new Error(po.error || 'SaveError'); return po; };

  // ══ MOrder ctor + beforeSave (new record) — was inline in RMACreateOrder.js ═══════════════════════════════════
  // new MOrder(ctx, 0, trx) :441-480
  S.MOrder_new = function (trx) {
    var o = MLo.newRecord(trx, 'c_order', {}), now = trx.env.date;
    o.set('docstatus', 'DR').set('docaction', 'PR').set('deliveryrule', 'A').set('freightcostrule', 'I').set('invoicerule', 'I').set('paymentrule', 'P')
      .set('priorityrule', '5').set('deliveryviarule', 'P').set('isdiscountprinted', 'N').set('isselected', 'N').set('istaxincluded', 'N').set('issotrx', 'Y')
      .set('isdropship', 'N').set('sendemail', 'N').set('isapproved', 'N').set('isprinted', 'N').set('iscreditapproved', 'N').set('isdelivered', 'N')
      .set('isinvoiced', 'N').set('istransferred', 'N').set('isselfservice', 'N').set('processed', 'N').set('processing', 'N').set('posted', 'N')
      .set('dateacct', now).set('datepromised', now).set('dateordered', now).set('freightamt', 0).set('chargeamt', 0).set('totallines', 0).set('grandtotal', 0);
    return o;
  };
  function sqlInt(trx, sql, args) { var r = trx.q(sql, args || [])[0]; if (!r) return -1; var v = r[Object.keys(r)[0]]; return v == null ? 0 : Number(v); }   // DB.getSQLValueEx (no row → -1, NULL → 0)
  S.sqlInt = sqlInt;
  // MOrder.beforeSave (new record) :1183-1300 — the parts that change a record built like RMACreateOrder builds it
  S.MOrder_beforeSaveNew = function (trx, o, ctx) {
    var Env = A().Env;
    if (!nz(o.get('ad_org_id'))) { var co = Env.getAD_Org_ID(ctx); if (co !== 0) o.set('ad_org_id', co); }   // :1186-1194
    if (!nz(o.get('c_doctype_id'))) o.set('c_doctype_id', 0);                                                  // :1202-1203
    if (!nz(o.get('m_warehouse_id'))) { var ii = Env.getContextAsInt(ctx, '#M_Warehouse_ID'); if (ii !== 0) o.set('m_warehouse_id', ii); else throw new Error('@FillMandatory@ @M_Warehouse_ID@'); }   // :1206-1215
    var bpFromLoc = 'SELECT C_BPartner_ID FROM C_BPartner_Location WHERE C_BPartner_Location_ID=?', bpFromUser = 'SELECT C_BPartner_ID FROM AD_User WHERE AD_User_ID=?';   // :1237-1238
    if (Number(o.get('c_bpartner_location_id')) > 0 && sqlInt(trx, bpFromLoc, [o.get('c_bpartner_location_id')]) !== Number(o.get('c_bpartner_id'))) o.set('c_bpartner_location_id', null);   // :1240-1245
    if (Number(o.get('ad_user_id') || 0) >= 0 && sqlInt(trx, bpFromUser, [o.get('ad_user_id') || 0]) !== Number(o.get('c_bpartner_id'))) o.set('ad_user_id', null);                           // :1246-1251
    if (Number(o.get('bill_location_id')) > 0 && sqlInt(trx, bpFromLoc, [o.get('bill_location_id')]) !== Number(o.get('bill_bpartner_id'))) o.set('bill_location_id', null);               // :1254-1260
    if (Number(o.get('bill_user_id') || 0) >= 0 && sqlInt(trx, bpFromUser, [o.get('bill_user_id') || 0]) !== Number(o.get('bill_bpartner_id'))) o.set('bill_user_id', null);                // :1261-1266
    if (!nz(o.get('bill_bpartner_id'))) { o.set('bill_bpartner_id', o.get('c_bpartner_id')); o.set('bill_location_id', o.get('c_bpartner_location_id')); }   // :1272-1276
    if (!nz(o.get('bill_location_id'))) o.set('bill_location_id', o.get('c_bpartner_location_id'));           // :1279-1280
    if (!nz(o.get('c_currency_id'))) {                                                                          // :1295-1305
      var cc = sqlInt(trx, 'SELECT C_Currency_ID FROM M_PriceList WHERE M_PriceList_ID=?', [o.get('m_pricelist_id')]);
      o.set('c_currency_id', cc !== 0 && cc !== -1 ? cc : Env.getContextAsInt(ctx, '$C_Currency_ID'));
    }
  };
  // new MOrderLine(order) :185-192 ∘ setInitialDefaults :159-179 ∘ setOrder :227-239
  S.MOrderLine_new = function (trx, order) {
    var l = MLo.newRecord(trx, 'c_orderline', {}), o = trx.get('c_order', order.id());
    l.set('freightamt', 0).set('linenetamt', 0).set('priceentered', 0).set('priceactual', 0).set('pricelimit', 0).set('pricelist', 0).set('m_attributesetinstance_id', 0)
      .set('qtyentered', 0).set('qtyordered', 0).set('qtydelivered', 0).set('qtyinvoiced', 0).set('qtyreserved', 0).set('isdescription', 'N').set('processed', 'N').set('line', 0);
    l.set('c_order_id', o.c_order_id);
    olSetOrder(l, o);
    l.p.priceList = o.m_pricelist_id; l.p.isSOTrx = o.issotrx;                                 // setHeaderInfo :245-251
    return l;
  };
  // MOrderLine.setPrice() :290-325 (+ getProductPricing :332-340; AbstractProductPricing.setOrderLine :98-117 inlined — the order is a pending row)
  S.MOrderLine_setPrice = function (trx, l) {
    var a = A(), D = T.D, M = R().M;
    if (!T.nz(l.get('m_product_id'))) return;
    if (!l.p.priceList) throw new Error('PriceList unknown!');
    var pp = M.Core.getProductPricing();
    pp.m_M_Product_ID = Number(l.get('m_product_id')); pp.m_isSOTrx = T.Y(l.p.isSOTrx);
    pp.m_C_BPartner_ID = Number(l.get('c_bpartner_id') || 0);
    var qty = D(l.get('qtyordered')); if (qty.signum() !== 0) pp.m_Qty = qty;
    pp.m_PriceDate = a.Timestamp.of(l.get('dateordered')); pp.trxName = null; pp.checkVendorBreak();
    pp.setM_PriceList_ID(l.p.priceList);
    pp.calculatePrice();
    l.set('priceactual', pp.getPriceStd()).set('pricelist', pp.getPriceList()).set('pricelimit', pp.getPriceLimit());
    if (D(l.get('qtyentered')).compareTo(D(l.get('qtyordered'))) === 0) l.set('priceentered', l.get('priceactual'));
    else l.set('priceentered', D(l.get('priceactual')).multiply(D(l.get('qtyordered')).divide(D(l.get('qtyentered')), 12, a.RoundingMode.HALF_UP)));
    l.set('discount', pp.getDiscount());
    if (!T.nz(l.get('c_uom_id'))) l.set('c_uom_id', pp.getC_UOM_ID());
  };

  // ══ MInOutConfirm.create(ship, confirmType, checkExisting) :64-93 — was inline in InOutCreateConfirm.js ═══════════
  S.MInOutConfirm_create = function (trx, ship, confirmType, checkExisting) {
    var D = T.D, N = T.N;
    if (checkExisting) {
      var confirmations = trx.find('m_inoutconfirm', { m_inout_id: ship.m_inout_id });      // ship.getConfirmations(false)
      for (var i = 0; i < confirmations.length; i++) if (confirmations[i].confirmtype === confirmType) return confirmations[i];   // :72-76
    }
    var confirm = MLo.newRecord(trx, 'm_inoutconfirm', {});                          // new MInOutConfirm(ship, confirmType) :150-156
    confirm.set('docaction', 'CO').set('docstatus', 'DR').set('isapproved', 'N').set('iscancelled', 'N').set('isindispute', 'N').set('processed', 'N');   // setInitialDefaults :125-131
    confirm.set('ad_client_id', ship.ad_client_id).set('ad_org_id', ship.ad_org_id).set('m_inout_id', ship.m_inout_id).set('confirmtype', confirmType);
    S.saveEx(confirm);                                                              // :81
    var shipLines = S.lines(trx, 'm_inoutline', 'm_inout_id', ship.m_inout_id);     // :82
    for (var j = 0; j < shipLines.length; j++) {                                    // :83-89
      var sLine = shipLines[j], cLine = MLo.newRecord(trx, 'm_inoutlineconfirm', {});   // new MInOutLineConfirm(confirm) :89-94
      cLine.set('differenceqty', 0).set('scrappedqty', 0).set('processed', 'N');    // setInitialDefaults :67-71
      cLine.set('ad_client_id', confirm.get('ad_client_id')).set('ad_org_id', confirm.get('ad_org_id')).set('m_inoutconfirm_id', confirm.id());
      cLine.set('m_inoutline_id', sLine.m_inoutline_id).set('targetqty', sLine.movementqty).set('confirmedqty', sLine.movementqty);   // setInOutLine :103-109
      // beforeSave :194-208 — Difference = Target - Confirmed - Scrapped
      cLine.set('differenceqty', N(D(cLine.get('targetqty')).subtract(D(cLine.get('confirmedqty'))).subtract(D(cLine.get('scrappedqty')))));
      S.saveEx(cLine);
    }
    return trx.get('m_inoutconfirm', confirm.id());
  };

    return S;
  })(ML);

  return Object.assign({}, PXO, { ctorMod: ctorMod, addDocsPostProcess: addDocsPostProcess, MOrder: MOrder, MInOut: MInOut, calculateOrderTaxTotal: calculateOrderTaxTotal, reserveStock: reserveStock, createShipment: createShipment, setProcessed: setProcessed });
});

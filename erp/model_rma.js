// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_rma.js -- MRMA + MRMALine model/DocAction classes REGISTERED into model_layer.js (bim-compiler prompts/SQLiteIDEMPIERE.md §RMA-WINDOW-PORT;
// CARDINAL RULE: a Customer RMA / Vendor RMA saved and completed through the shipped generic window path behaves like legacy iDempiere).
// This file READS the database through the Trx and DECIDES nothing: every rule is the engine verb (erp_engine.js rmaLineSave / completeRMA) -- ONE implementation, the same
// pure functions the bim-compiler parallel run judged against legacy (SD-16). It registers by table name through the generic registry (registerModel / registerDocAction);
// the save path never names a table. Java root org.adempiere.base/src/org/compiere/model/.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'), require('./erp_engine'));
  else root.ModelRma = factory(root.ModelLayer, root.ModelTrade, root.ERPEngine);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T, E) {
  var D = T.D, N = T.N, Y = T.Y, nz = T.nz;
  var fire = function (trx, timing, table, row) { return ML.fire(trx, timing, table, row); };
  function rmaLines(trx, rmaId) { return trx.find('m_rmaline', { m_rma_id: rmaId }, ['line']).filter(function (l) { return l.isactive !== 'N'; }); }

  // MRMA.getOriginalOrder :160-168 (the shipment's order) / isTaxIncluded :908-918 (that order's price list; TRUE when there is none) / getPrecision :822
  function shipmentOf(trx, rma) { return nz(rma.inout_id) ? trx.get('m_inout', rma.inout_id) : null; }
  function isTaxIncluded(trx, rma) {
    var s = shipmentOf(trx, rma), o = s && nz(s.c_order_id) ? trx.get('c_order', s.c_order_id) : null;
    if (!o) return true;
    var pl = nz(o.m_pricelist_id) ? trx.get('m_pricelist', o.m_pricelist_id) : null;
    return !!(pl && Y(pl.istaxincluded));
  }
  function precisionOf(trx, rma) { return T.precisionOf(trx, rma.c_currency_id); }

  // MRMALine.init :105-230 -- the source numbers of a shipment-line row: the invoice line of it (else the order line)
  function shipSource(trx, line) {
    var sl = trx.get('m_inoutline', line.m_inoutline_id); if (!sl) return null;
    var il = trx.find('c_invoiceline', { m_inoutline_id: sl.m_inoutline_id }).sort(function (a, b) { return Number(a.c_invoiceline_id) - Number(b.c_invoiceline_id); })[0] || null;
    var ol = !il && nz(sl.c_orderline_id) ? trx.get('c_orderline', sl.c_orderline_id) : null;
    // MRMALine.checkQty :402-417 -- SUM(Qty) of the OTHER lines of that shipment line on a COMPLETED/CLOSED RMA
    var others = D(0);
    trx.find('m_rmaline', { m_inoutline_id: sl.m_inoutline_id }).forEach(function (o) {
      if (String(o.m_rmaline_id) === String(line.m_rmaline_id)) return;
      var h = trx.get('m_rma', o.m_rma_id); if (h && Y(h.processed) && /^(CO|CL)$/.test(h.docstatus || '')) others = others.add(D(o.qty));
    });
    return { m_product_id: sl.m_product_id, c_charge_id: sl.c_charge_id, shipqty: Number(D(sl.movementqty).toString()),
      priceactual: il ? il.priceactual : ol ? ol.priceactual : null, c_tax_id: il ? il.c_tax_id : ol ? ol.c_tax_id : null,
      origqty: Number(D(il ? il.qtyinvoiced : ol ? ol.qtydelivered : 0).toString()), othersCompletedQty: Number(others.toString()) };
  }

  var MRMALine = {
    // MRMALine.beforeSave :305-398 -> E.rmaLineSave
    beforeSave: function (trx, l, isNew) {
      var rma = nz(l.m_rma_id) ? trx.get('m_rma', l.m_rma_id) : null;
      if (isNew && rma && Y(rma.processed)) return 'ParentComplete';                                      // :307-311
      var prec = rma ? precisionOf(trx, rma) : 2, src = nz(l.m_inoutline_id) ? shipSource(trx, l) : {};
      if (nz(l.m_inoutline_id) && !src) return 'ABSENT:shipment line ' + l.m_inoutline_id;
      if (!nz(l.m_inoutline_id) && nz(l.c_charge_id)) { var ch = trx.get('c_charge', l.c_charge_id); if (ch && ch.chargeamt != null) src.unitamt = ch.chargeamt; }
      else if (!nz(l.m_inoutline_id) && nz(l.m_product_id)) trx.say('§MODEL-UNPORTED-DEP MRMALine.init product-only line: IProductPricing.setRMALine (MRMALine.java:178-228) -- unit amount must be entered');
      var others = trx.find('m_rmaline', { m_rma_id: l.m_rma_id }).filter(function (o) { return String(o.m_rmaline_id) !== String(l.m_rmaline_id); });
      var r = E.rmaLineSave({ m_inoutline_id: nz(l.m_inoutline_id) ? l.m_inoutline_id : null, qty: l.qty, m_product_id: l.m_product_id, c_charge_id: l.c_charge_id, amt: l.amt, c_tax_id: l.c_tax_id }, src, others, prec);
      if (!r.ok) return r.reason;
      var o = r.line;
      if (nz(l.m_inoutline_id)) { l.m_product_id = o.m_product_id; l.c_charge_id = o.c_charge_id; }                // :369-371
      l.qty = o.qty; l.amt = Number(o.amt);
      if (!nz(l.c_tax_id) && o.c_tax_id != null) l.c_tax_id = o.c_tax_id;                                       // :379-381
      if (!nz(l.line)) { var mx = 0; others.forEach(function (x) { mx = Math.max(mx, Number(x.line || 0)); }); l.line = mx + 10; }   // :383-388
      l.linenetamt = o.linenetamt / Math.pow(10, prec);                                                          // :390 setLineNetAmt(getTotalAmt())
      return null;
    },
    // MRMALine.afterSave :525-540 -> updateHeaderAmt -> StandardTaxProvider.updateRMATax + updateHeaderTax (:366-405)
    afterSave: function (trx, l) { return updateHeader(trx, l.m_rma_id); },
    afterDelete: function (trx, l) { return updateHeader(trx, l.m_rma_id); }
  };
  function updateHeader(trx, rmaId) {
    var rma = nz(rmaId) ? trx.get('m_rma', rmaId) : null; if (!rma || Y(rma.processed)) return null;           // :549 only while the document is not processed
    var ls = rmaLines(trx, rmaId), sum = D(0); ls.forEach(function (x) { sum = sum.add(D(x.linenetamt)); });
    if (D(rma.amt).compareTo(sum) !== 0) trx.update('m_rma', rma, { amt: N(sum) });                              // updateHeaderTax SQL: Amt = SUM(LineNetAmt)
    return null;
  }

  // MRMA.prepareIt :347-386 + calculateTaxTotal :392-410 (StandardTaxProvider.calculateRMATaxTotal :293-364) -> E.completeRMA
  var MRMA = {
    prepareIt: function (trx, rma) {
      var m = fire(trx, 'BEFORE_PREPARE', 'm_rma', rma); if (m) { T.msg(trx, m); return 'IN'; }
      var prec = precisionOf(trx, rma), incl = isTaxIncluded(trx, rma), ls = rmaLines(trx, rma.m_rma_id);
      var lines = ls.map(function (l) {
        var o = { m_inoutline_id: nz(l.m_inoutline_id) ? l.m_inoutline_id : null, qty: Number(D(l.qty).toString()), c_tax_id: l.c_tax_id, linenetamt: Math.round(Number(D(l.linenetamt).toString()) * Math.pow(10, prec)), precision: prec };
        if (o.m_inoutline_id) { var s = shipSource(trx, l); o.shipqty = s ? s.shipqty : null; o.othersCompletedQty = s ? s.othersCompletedQty : 0; }
        return o;
      });
      var r = E.completeRMA({ m_rma_id: rma.m_rma_id }, lines, { precision: prec, taxIncluded: incl,
        taxById: function (id) { return T.tax(trx, id); }, taxChildren: function (id) { return trx.find('c_tax', { parent_tax_id: id }); } });
      if (!r.ok) { T.msg(trx, r.reason === 'NoLines' ? '@NoLines@' : r.reason === 'AmtReturned>Shipped' ? '@AmtReturned>Shipped@' : r.reason === 'tax-error' ? 'Error calculating tax' : r.reason); return 'IN'; }
      trx.find('m_rmatax', { m_rma_id: rma.m_rma_id }).forEach(function (t) { trx.del('m_rmatax', t); });       // :395 DELETE FROM M_RMATax
      var div = Math.pow(10, prec);
      r.taxes.forEach(function (t) {
        trx.insert('m_rmatax', ML.newPO(trx, 'm_rmatax', { m_rma_id: rma.m_rma_id, ad_org_id: rma.ad_org_id, c_tax_id: t.c_tax_id, taxbaseamt: t.taxbaseamt / div, taxamt: t.taxamt / div, istaxincluded: incl ? 'Y' : 'N' }));
      });
      trx.update('m_rma', rma, { amt: r.amt / div });                                                              // :362 rma.setAmt(grandTotal)
      m = fire(trx, 'AFTER_PREPARE', 'm_rma', rma); if (m) { T.msg(trx, m); return 'IN'; }
      if (rma.docaction !== 'CO') trx.update('m_rma', rma, { docaction: 'CO' });
      trx._justPrepared = 'm_rma:' + rma.m_rma_id;
      return 'IP';
    },
    completeIt: function (trx, rma) {
      if (trx._justPrepared !== 'm_rma:' + rma.m_rma_id) { var st = MRMA.prepareIt(trx, rma); if (st !== 'IP') return st; }
      trx._justPrepared = null;
      var m = fire(trx, 'BEFORE_COMPLETE', 'm_rma', rma); if (m) { T.msg(trx, m); return 'IN'; }
      if (!Y(rma.isapproved)) trx.update('m_rma', rma, { isapproved: 'Y' });                                       // implicit approval :458-459
      m = fire(trx, 'AFTER_COMPLETE', 'm_rma', rma); if (m) { T.msg(trx, m); return 'IN'; }
      trx.update('m_rma', rma, { processed: 'Y', docaction: 'CL' });                                                // :477-478 setProcessed propagates to the lines (:833-843)
      rmaLines(trx, rma.m_rma_id).forEach(function (l) { trx.update('m_rmaline', l, { processed: 'Y' }); });
      return 'CO';
    }
  };

  ML.registerModel('m_rma', { initialDefaults: { docaction: 'CO', docstatus: 'DR', isapproved: 'N', processed: 'N', amt: 0 } });     // MRMA.setInitialDefaults :81-86
  ML.registerModel('m_rmaline', { initialDefaults: { qty: 1, qtydelivered: 0, qtyinvoiced: 0 }, beforeSave: MRMALine.beforeSave, afterSave: MRMALine.afterSave, afterDelete: MRMALine.afterDelete });   // :86-89
  ML.registerDocAction('m_rma', MRMA);
  return { MRMA: MRMA, MRMALine: MRMALine, isTaxIncluded: isTaxIncluded };
});

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_invoice.js — MInvoice + MInvoiceLine + MPayment + MAllocationHdr/Line model/DocAction classes + MOrder.createInvoice,
// ported and REGISTERED into model_layer.js (bim-compiler prompts/ERP_MODEL_LAYER.md §CHANGE-LIST A12-A13, C, D — W-MODEL-ORACLE).
// Java root: org.adempiere.base/src/org/compiere/model/ (credit managers: model/credit/). One-line cite per rule.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'), require('./model_order'), require('./bigdecimal'));
  else root.ModelInvoice = factory(root.ModelLayer, root.ModelTrade, root.ModelOrder, root.BigDecimal);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T, MO, BigDecimal) {
  var D = T.D, N = T.N, Y = T.Y, nz = T.nz, HU = T.HU, Z = T.Z;
  var fire = function (trx, timing, table, row) { return ML.fire(trx, timing, table, row); };
  var DIMS = ['ad_orgtrx_id', 'c_project_id', 'c_campaign_id', 'c_activity_id', 'user1_id', 'user2_id', 'c_costcenter_id', 'c_department_id'];
  function copy(src, cols) { var o = {}; cols.forEach(function (c) { if (src[c] != null) o[c] = src[c]; }); return o; }
  function invLines(trx, i) { return trx.find('c_invoiceline', { c_invoice_id: i.c_invoice_id }, ['line']).filter(function (l) { return l.isactive !== 'N'; }); }
  function isCM(trx, i) { var d = T.dt(trx, i.c_doctype_id || i.c_doctypetarget_id); return d && String(d.docbasetype || '').charAt(2) === 'C'; }

  // ══ StandardTaxProvider.calculateInvoiceTaxTotal :166-238 ∘ MInvoiceTax.calculateTaxFromLines ═══════════════════
  function calculateInvoiceTaxTotal(trx, inv) {
    var prec = T.precisionOf(trx, inv.c_currency_id), incl = Y(inv.istaxincluded), ls = invLines(trx, inv), total = Z, seen = {}, keep = {};
    ls.forEach(function (l) {
      total = total.add(D(l.linenetamt));
      var tid = String(l.c_tax_id); if (!nz(l.c_tax_id) || seen[tid]) return; seen[tid] = 1;
      var t = T.tax(trx, l.c_tax_id); if (!t || nz(t.c_taxprovider_id)) return;
      var base = Z, amt = Z, doc = Y(t.isdocumentlevel);
      ls.forEach(function (x) { if (String(x.c_tax_id) === tid) { base = base.add(D(x.linenetamt)); if (!doc) amt = amt.add(T.calcTax(trx, t, x.linenetamt, incl, prec)); } });
      if (doc) amt = T.calcTax(trx, t, base, incl, prec);
      var vals = { taxamt: N(amt), taxbaseamt: N(incl ? base.subtract(amt) : base), istaxincluded: incl ? 'Y' : 'N' };
      var it = T.one(trx, 'c_invoicetax', { c_invoice_id: inv.c_invoice_id, c_tax_id: l.c_tax_id });
      if (it) trx.update('c_invoicetax', it, vals);
      else trx.insert('c_invoicetax', ML.newPO(trx, 'c_invoicetax', Object.assign({ c_invoice_id: inv.c_invoice_id, c_tax_id: l.c_tax_id, ad_org_id: inv.ad_org_id }, vals)));
      keep[tid] = 1;
    });
    var grand = total;
    trx.find('c_invoicetax', { c_invoice_id: inv.c_invoice_id }).forEach(function (it) {
      if (!keep[String(it.c_tax_id)]) { trx.del('c_invoicetax', it); return; }
      if (!incl) grand = grand.add(D(it.taxamt));
    });
    trx.update('c_invoice', inv, { totallines: N(total), grandtotal: N(grand) });
  }

  // ══ MInvoiceLine.beforeSave :877-960 (setLineNetAmt :556-564, setTaxAmt :534-550) + afterSave → updateHeaderTax ══════
  ML.registerModel('c_invoiceline', {
    beforeSave: function (trx, l, isNew) {
      var inv = trx.get('c_invoice', l.c_invoice_id); if (!inv) return null;
      if (isNew && Y(inv.processed)) return 'parent processed';
      if (Y(inv.processed)) return null;
      if (nz(l.c_charge_id) && nz(l.m_product_id)) l.m_product_id = null;
      if (!Number(l.line)) { var mx = 0; trx.find('c_invoiceline', { c_invoice_id: inv.c_invoice_id }).forEach(function (x) { mx = Math.max(mx, Number(x.line) || 0); }); l.line = mx + 10; }
      if (!nz(l.c_uom_id)) { var p = T.product(trx, l.m_product_id); if (p) l.c_uom_id = p.c_uom_id; }
      var prec = T.precisionOf(trx, inv.c_currency_id), bd = D(l.priceentered).multiply(D(l.qtyentered));
      if (bd.scale() > prec) bd = bd.setScale(prec, HU);
      l.linenetamt = N(bd);
      if (Y(inv.issotrx) || D(l.taxamt).signum() === 0) {
        var t = nz(l.c_tax_id) ? T.tax(trx, l.c_tax_id) : null;
        if (t && !(Y(t.isdocumentlevel) && Y(inv.issotrx))) {
          var ta = T.calcTax(trx, t, l.linenetamt, Y(inv.istaxincluded), prec);
          l.taxamt = N(ta); l.linetotalamt = N(Y(inv.istaxincluded) ? D(l.linenetamt) : D(l.linenetamt).add(ta));
        }
      }
      return null;
    },
    afterSave: function (trx, l, isNew, old) {                                              // MInvoiceLine.afterSave :1019-1046
      var inv = trx.get('c_invoice', l.c_invoice_id); if (!inv || Y(inv.processed)) return null;
      if (isNew || !old || String(old.c_tax_id) !== String(l.c_tax_id) || String(old.linenetamt) !== String(l.linenetamt)) calculateInvoiceTaxTotal(trx, inv);
      return null;
    },
    afterDelete: function (trx, l) { var inv = trx.get('c_invoice', l.c_invoice_id); if (inv && !Y(inv.processed)) calculateInvoiceTaxTotal(trx, inv); return null; }
  });

  // ══ MOrder.createInvoice(dt, shipment, invoiceDate) :2497-2590 ════════════════════════════════════════════════════
  function createInvoice(trx, o, d, shipment, invoiceDate) {
    var C = MO.ctorMod(), invoice = C.MInvoiceFromOrder(trx, trx.get('c_order', o.c_order_id), d.c_doctypeinvoice_id, invoiceDate);
    if (!invoice.save()) { T.msg(trx, 'Could not create Invoice'); return null; }
    if (shipment) {                                                                           // a Shipment is the base
      if (o.invoicerule !== 'D') trx.update('c_order', o, { invoicerule: 'D' });
      var sLines = trx.find('m_inoutline', { m_inout_id: shipment.m_inout_id }, ['line']);
      for (var i = 0; i < sLines.length; i++) {
        var sLine = sLines[i], iLine = C.MInvoiceLine(trx, invoice);
        C.ilSetShipLine(trx, iLine, sLine);
        C.ilSetQtyEntered(trx, iLine, C.sameOrderLineUOM(trx, sLine) ? sLine.qtyentered : sLine.movementqty);   // Qty = Delivered
        C.ilSetQtyInvoiced(trx, iLine, sLine.movementqty);
        if (!iLine.save()) { T.msg(trx, 'Could not create Invoice Line from Shipment Line'); return null; }
        var sv = ML.save(trx, 'm_inoutline', trx.get('m_inoutline', sLine.m_inoutline_id), { isinvoiced: 'Y' }); if (!sv.ok) trx.say('§MODEL-WARN Could not update Shipment line: ' + sLine.m_inoutline_id);
      }
    } else {                                                                                   // Invoice from Order
      if (o.invoicerule !== 'I') trx.update('c_order', o, { invoicerule: 'I' });
      var oLines = trx.find('c_orderline', { c_order_id: o.c_order_id }, ['line']).filter(function (l) { return l.isactive !== 'N'; });
      for (var j = 0; j < oLines.length; j++) {
        var oLine = oLines[j], il = C.MInvoiceLine(trx, invoice);
        C.ilSetOrderLine(trx, il, oLine);
        C.ilSetQtyInvoiced(trx, il, D(oLine.qtyordered).subtract(D(oLine.qtyinvoiced)));   // Qty = Ordered - Invoiced
        if (D(oLine.qtyordered).compareTo(D(oLine.qtyentered)) === 0) C.ilSetQtyEntered(trx, il, il.get('qtyinvoiced'));
        else C.ilSetQtyEntered(trx, il, D(il.get('qtyinvoiced')).multiply(D(oLine.qtyentered)).divide(D(oLine.qtyordered), 12, HU));
        if (!il.save()) { T.msg(trx, 'Could not create Invoice Line from Order Line'); return null; }
      }
    }
    if (trx.find('c_orderpayschedule', { c_order_id: o.c_order_id }).length) { T.msg(trx, 'copy C_OrderPaySchedule→C_InvoicePaySchedule (MOrder.java:2566) §MODEL-UNPORTED-DEP'); return null; }
    var res = ML.processIt(trx, 'c_invoice', invoice.id(), 'CO');
    if (!res.ok) throw new Error('FailedProcessingDocument - ' + (res.msg || res.status));
    var inv = trx.get('c_invoice', invoice.id());
    trx.update('c_order', trx.get('c_order', o.c_order_id), { c_cashline_id: nz(inv.c_cashline_id) ? inv.c_cashline_id : null });   // :2582 setC_CashLine_ID
    if (inv.docstatus !== 'CO') { T.msg(trx, '@C_Invoice_ID@: ' + (res.msg || '')); return null; }
    return inv;
  }
  MO.MOrder._createInvoice = createInvoice;

  function setProcessedInv(trx, inv, flag) {                                                // MInvoice.setProcessed: lines + taxes
    trx.update('c_invoice', inv, { processed: flag });
    trx.find('c_invoiceline', { c_invoice_id: inv.c_invoice_id }).forEach(function (l) { trx.update('c_invoiceline', l, { processed: flag }); });
    trx.find('c_invoicetax', { c_invoice_id: inv.c_invoice_id }).forEach(function (t) { trx.update('c_invoicetax', t, { processed: flag }); });
  }
  // MInvoice.getAllocatedAmt :1393-1420 (absolute) / testAllocation :1433-1455
  function invAllocated(trx, inv) {
    var s = Z;
    trx.find('c_allocationline', { c_invoice_id: inv.c_invoice_id }).forEach(function (al) { var h = trx.get('c_allocationhdr', al.c_allocationhdr_id);
      if (h && h.isactive === 'Y' && al.isactive !== 'N') s = s.add(D(al.amount)).add(D(al.discountamt)).add(D(al.writeoffamt)); });
    return s;
  }
  function invTestAllocation(trx, inv, beingCompleted) {
    if (!(Y(inv.processed) || beingCompleted)) return false;
    var total = D(inv.grandtotal); if (!Y(inv.issotrx)) total = total.negate(); if (isCM(trx, inv)) total = total.negate();
    var test = total.compareTo(invAllocated(trx, inv)) === 0, ch = test !== Y(inv.ispaid);
    if (ch) trx.update('c_invoice', inv, { ispaid: test ? 'Y' : 'N' });
    return ch;
  }
  function payAllocated(trx, p) {
    var s = Z;
    trx.find('c_allocationline', { c_payment_id: p.c_payment_id }).forEach(function (al) { var h = trx.get('c_allocationhdr', al.c_allocationhdr_id);
      if (h && h.isactive === 'Y' && al.isactive !== 'N') s = s.add(D(al.amount)); });
    return s;
  }
  function payTestAllocation(trx, p) {                                                       // MPayment.testAllocation :966-982
    var total = D(p.payamt); if (!Y(p.isreceipt)) total = total.negate();
    var test = total.compareTo(payAllocated(trx, p)) === 0, ch = test !== Y(p.isallocated);
    if (ch) trx.update('c_payment', p, { isallocated: test ? 'Y' : 'N' });
    return ch;
  }

  // CreditManagerInvoice.checkCreditStatus (model/credit :58-170) — base currency (convertBase identity for schema currency)
  function creditInvoice(trx, inv, action) {
    if (action === 'PR') {
      if (!Y(inv.issotrx)) return null;
      var d = T.dt(trx, inv.c_doctypetarget_id) || {};
      if ((d.docbasetype === 'ARC' && D(inv.grandtotal).signum() < 0) || (d.docbasetype === 'ARI' && D(inv.grandtotal).signum() > 0)) {
        var b0 = trx.get('c_bpartner', inv.c_bpartner_id); if (b0 && b0.socreditstatus === 'S') return '@BPartnerCreditStop@ - @TotalOpenBalance@=' + b0.totalopenbalance + ', @SO_CreditLimit@=' + b0.so_creditlimit;
      }
      return null;
    }
    var o = nz(inv.c_order_id) ? trx.get('c_order', inv.c_order_id) : null, fromPOS = !!(o && nz(o.c_pos_id));
    var bp = trx.get('c_bpartner', inv.c_bpartner_id); if (!bp) return null;
    var amt = D(inv.grandtotal); if (isCM(trx, inv)) amt = amt.negate();                     // getGrandTotal(true) — CM adjusted
    if (action === 'RE') amt = amt.negate();
    var bal = D(bp.totalopenbalance), ch = {};
    if (Y(inv.issotrx)) {
      bal = bal.add(amt);
      if (!bp.firstsale) ch.firstsale = inv.dateinvoiced;
      ch.actuallifetimevalue = N(bp.actuallifetimevalue == null ? amt : D(bp.actuallifetimevalue).add(amt));
      ch.so_creditused = N(bp.so_creditused == null ? amt : D(bp.so_creditused).add(amt));
    } else bal = bal.subtract(amt);
    if (!(inv.paymentrule === 'B' && !fromPOS)) ch.totalopenbalance = N(bal);                 // :163-166 the cash payment already did it
    var after = Object.assign({}, bp, ch);
    ch.socreditstatus = T.creditStatus(trx, after, after.totalopenbalance);
    trx.update('c_bpartner', bp, ch);
    return null;
  }

  // ══ MInvoice DocAction (prepareIt :1716-1820, completeIt :1965-2345) ═══════════════════════════════════════════
  var MInvoice = {
    prepareIt: function (trx, inv) {
      var m = fire(trx, 'BEFORE_PREPARE', 'c_invoice', inv); if (m) { T.msg(trx, m); return 'IN'; }
      var d = T.dt(trx, inv.c_doctypetarget_id);
      if (!d || !T.periodOpen(trx, inv.dateacct, d.docbasetype)) { T.msg(trx, '@PeriodClosed@'); return 'IN'; }   // testPeriodOpen throws
      if (!invLines(trx, inv).length) { T.msg(trx, '@NoLines@'); return 'IN'; }
      if (String(inv.c_doctype_id || 0) !== String(inv.c_doctypetarget_id)) trx.update('c_invoice', inv, { c_doctype_id: inv.c_doctypetarget_id });
      if (!nz(inv.c_doctype_id)) { T.msg(trx, 'No Document Type'); return 'IN'; }
      calculateInvoiceTaxTotal(trx, inv); inv = trx.get('c_invoice', inv.c_invoice_id);
      if (D(inv.grandtotal).signum() !== 0 && (inv.paymentrule === 'P' || inv.paymentrule === 'D') && trx.find('c_payschedule', { c_paymentterm_id: inv.c_paymentterm_id }).length) { T.msg(trx, 'createPaySchedule (MInvoice) not ported — named'); return 'IN'; }
      var cm = creditInvoice(trx, inv, 'PR'); if (cm) { T.msg(trx, cm); return 'IN'; }
      m = fire(trx, 'AFTER_PREPARE', 'c_invoice', inv); if (m) { T.msg(trx, m); return 'IN'; }
      if (inv.docaction !== 'CO') trx.update('c_invoice', inv, { docaction: 'CO' });
      trx._justPrepared = 'c_invoice:' + inv.c_invoice_id;
      return 'IP';
    },
    completeIt: function (trx, inv) {
      if (trx._justPrepared !== 'c_invoice:' + inv.c_invoice_id) { var st = MInvoice.prepareIt(trx, inv); if (st !== 'IP') return st; }
      trx._justPrepared = null;
      var m = fire(trx, 'BEFORE_COMPLETE', 'c_invoice', inv); if (m) { T.msg(trx, m); return 'IN'; }
      if (!Y(inv.isapproved)) trx.update('c_invoice', inv, { isapproved: 'Y' });
      var o = nz(inv.c_order_id) ? trx.get('c_order', inv.c_order_id) : null, fromPOS = !!(o && nz(o.c_pos_id));
      if (inv.paymentrule === 'B' && !fromPOS) {                                              // :2008-2073 Cash → payment
        var ba = trx.find('c_bankaccount', { ad_org_id: inv.ad_org_id }).filter(function (b) { return b.isactive !== 'N' && String(b.c_currency_id) === String(inv.c_currency_id); })
          .sort(function (a, b) { return (b.isdefault === 'Y') - (a.isdefault === 'Y'); })[0];
        if (!ba) { T.msg(trx, '@NoAccountOrgCurrency@'); return 'IN'; }
        var dbt = Y(inv.issotrx) ? 'ARR' : 'APP';
        var dts = trx.q("SELECT * FROM c_doctype WHERE ad_client_id=? AND docbasetype=? AND isactive='Y' ORDER BY isdefault DESC, c_doctype_id", [trx.env.client, dbt]);   // MDocType.getOfDocBaseType
        if (!dts.length) { T.msg(trx, 'No document type '); return 'IN'; }
        var pdt = dts.filter(function (x) { return String(x.ad_org_id) === String(inv.ad_org_id); })[0] || dts[0];
        var p = createPayment(trx, { ad_org_id: inv.ad_org_id, tendertype: 'X', c_bankaccount_id: ba.c_bankaccount_id, c_bpartner_id: inv.c_bpartner_id,
          c_invoice_id: inv.c_invoice_id, c_currency_id: inv.c_currency_id, c_doctype_id: pdt.c_doctype_id, payamt: N(isCM(trx, inv) ? D(inv.grandtotal).negate() : D(inv.grandtotal)),
          isprepayment: 'N', dateacct: inv.dateacct, datetrx: inv.dateinvoiced });
        var pr = ML.processIt(trx, 'c_payment', p.c_payment_id, 'CO');
        if (!pr.ok) { T.msg(trx, 'Cannot Complete the Payment : [' + (pr.msg || '') + ']'); return 'IN'; }
      }
      inv = trx.get('c_invoice', inv.c_invoice_id);
      var so = Y(inv.issotrx), cmf = isCM(trx, inv);
      invLines(trx, inv).forEach(function (l) {
        if (!so && nz(l.m_inoutline_id) && nz(l.m_product_id)) {                             // :2083-2108 Inv-Receipt match
          var rl = trx.get('m_inoutline', l.m_inoutline_id), rcv = rl ? trx.get('m_inout', rl.m_inout_id) : null;
          if (rcv && Y(rcv.processed)) {
            var mv = rcv.movementtype.charAt(1) === '-' ? D(rl.movementqty).negate() : D(rl.movementqty), mq = cmf ? D(l.qtyinvoiced).negate() : D(l.qtyinvoiced);
            if (mv.compareTo(mq) < 0) mq = mv;
            trx.insert('m_matchinv', ML.newPO(trx, 'm_matchinv', { ad_org_id: l.ad_org_id, c_invoiceline_id: l.c_invoiceline_id, m_inoutline_id: l.m_inoutline_id,
              m_product_id: l.m_product_id, m_attributesetinstance_id: l.m_attributesetinstance_id || 0, qty: N(mq), datetrx: inv.dateinvoiced, dateacct: inv.dateacct, processed: 'Y' }));
          }
        }
        if (nz(l.c_orderline_id) && (so || !nz(l.m_product_id))) {                            // :2111-2124
          var ol = trx.get('c_orderline', l.c_orderline_id);
          if (ol && l.qtyinvoiced != null) trx.update('c_orderline', ol, { qtyinvoiced: N(D(ol.qtyinvoiced).add(cmf ? D(l.qtyinvoiced).negate() : D(l.qtyinvoiced))) });
        } else if (nz(l.c_orderline_id) && !so && nz(l.m_product_id)) trx.say('§MODEL-NAMED MMatchPO.create(invoice-first) MInvoice.java:2128 not ported line=' + l.c_invoiceline_id);
      });
      var ce = creditInvoice(trx, inv, 'CO'); if (ce) { T.msg(trx, ce); return 'IN'; }
      if (nz(inv.ad_user_id) && trx.env.now) { var u = trx.get('ad_user', inv.ad_user_id);   // :2193-2203 user last contact
        if (u) trx.update('ad_user', u, { lastcontact: trx.env.now, lastresult: 'Invoice: ' + inv.documentno }); }
      inv = trx.get('c_invoice', inv.c_invoice_id);
      if (inv.paymentrule === 'B') invTestAllocation(trx, inv, true);                          // :2321-2327
      m = fire(trx, 'AFTER_COMPLETE', 'c_invoice', inv); if (m) { T.msg(trx, m); return 'IN'; }
      setProcessedInv(trx, inv, 'Y');
      trx.update('c_invoice', inv, { docaction: 'CL' });
      return 'CO';
    },
    approveIt: function (trx, i) { trx.update('c_invoice', i, { isapproved: 'Y' }); return true; },
    getSummary: function (trx, i) { return (i.documentno || '') + ': Grand Total=' + i.grandtotal + (i.description ? ' - ' + i.description : ''); }
  };

  // ══ MPayment ═════════════════════════════════════════════════════════════════════════════════════════════════
  function createPayment(trx, f) {
    var d = T.dt(trx, f.c_doctype_id) || {};
    var row = ML.newPO(trx, 'c_payment', Object.assign({ isreceipt: Y(d.issotrx) ? 'Y' : 'N', docstatus: 'DR', docaction: 'CO' }, f));   // MPayment.beforeSave: IsReceipt ← doctype
    var r = ML.save(trx, 'c_payment', null, row);
    return r.row;
  }
  var MPayment = {
    prepareIt: function (trx, p) {                                                          // :1905-2036
      var m = fire(trx, 'BEFORE_PREPARE', 'c_payment', p); if (m) { T.msg(trx, m); return 'IN'; }
      if (!T.periodOpen(trx, p.dateacct, Y(p.isreceipt) ? 'ARR' : 'APP')) { T.msg(trx, '@PeriodClosed@'); return 'IN'; }
      if (nz(p.c_order_id) && !nz(p.c_invoice_id)) { var o = trx.get('c_order', p.c_order_id); if (o && o.docstatus === 'WP') { T.msg(trx, 'WebOrder WaitingPayment completion (MPayment.java:1930) not ported — named'); return 'IN'; } }
      if (!Y(p.isreceipt)) { var bp = trx.get('c_bpartner', p.c_bpartner_id); if (bp && (bp.socreditstatus === 'S' || bp.socreditstatus === 'H')) { T.msg(trx, bp.socreditstatus === 'S' ? '@BPartnerCreditStop@' : '@BPartnerCreditHold@'); return 'IN'; } }
      m = fire(trx, 'AFTER_PREPARE', 'c_payment', p); if (m) { T.msg(trx, m); return 'IN'; }
      if (p.docaction !== 'CO') trx.update('c_payment', p, { docaction: 'CO' });
      trx._justPrepared = 'c_payment:' + p.c_payment_id;
      return 'IP';
    },
    completeIt: function (trx, p) {                                                         // :2038-2130
      if (trx._justPrepared !== 'c_payment:' + p.c_payment_id) { var st = MPayment.prepareIt(trx, p); if (st !== 'IP') return st; }
      trx._justPrepared = null;
      var m = fire(trx, 'BEFORE_COMPLETE', 'c_payment', p); if (m) { T.msg(trx, m); return 'IN'; }
      if (!Y(p.isapproved)) trx.update('c_payment', p, { isapproved: 'Y' });
      if (nz(p.c_charge_id)) trx.update('c_payment', p, { isallocated: 'Y' });
      var created = false;                                                                  // CreditManagerPayment :68-128
      if (!nz(p.c_charge_id)) { created = allocateIt(trx, p); payTestAllocation(trx, trx.get('c_payment', p.c_payment_id)); }
      if (nz(p.c_bpartner_id) && !nz(p.c_invoice_id) && !nz(p.c_charge_id) && !trx.find('c_paymentallocate', { c_payment_id: p.c_payment_id }).length && !created) {
        var bp = trx.get('c_bpartner', p.c_bpartner_id), nb = D(bp.totalopenbalance);
        nb = Y(p.isreceipt) ? nb.subtract(D(p.payamt)) : nb.add(D(p.payamt));
        trx.update('c_bpartner', bp, { totalopenbalance: N(nb), socreditstatus: T.creditStatus(trx, bp, nb) });
      }
      var bacc = trx.get('c_bankaccount', p.c_bankaccount_id);
      if (bacc && bacc.banktype === 'C') { T.msg(trx, 'cashbook payment → C_CashLine (MPayment.java:2085) not ported — named'); return 'IN'; }
      p = trx.get('c_payment', p.c_payment_id);
      if (nz(p.c_invoice_id)) { var inv = trx.get('c_invoice', p.c_invoice_id); if (inv && String(inv.c_payment_id) !== String(p.c_payment_id)) trx.update('c_invoice', inv, { c_payment_id: p.c_payment_id }); }   // :2110-2119
      if (nz(p.c_order_id)) { var ord = trx.get('c_order', p.c_order_id); if (ord && String(ord.c_payment_id) !== String(p.c_payment_id)) trx.update('c_order', ord, { c_payment_id: p.c_payment_id }); }
      m = fire(trx, 'AFTER_COMPLETE', 'c_payment', p); if (m) { T.msg(trx, m); return 'IN'; }
      trx.update('c_payment', p, { processed: 'Y', docaction: 'CL' });
      return 'CO';
    },
    approveIt: function (trx, p) { trx.update('c_payment', p, { isapproved: 'Y' }); return true; },
    getSummary: function (trx, p) { return (p.documentno || '') + ': Payment Amount=' + p.payamt; }
  };
  // MPayment.allocateIt :2298 → allocateInvoice :2366-2410 (multi-PaymentAllocate / PaySelection named)
  function allocateIt(trx, p) {
    if (nz(p.c_invoice_id)) {
      var amt = D(p.payamt); if (D(p.overunderamt).signum() < 0 && amt.signum() > 0) amt = amt.add(D(p.overunderamt));
      var inv = trx.get('c_invoice', p.c_invoice_id);
      var dacct = String(inv.dateacct) > String(p.dateacct) ? inv.dateacct : p.dateacct;
      var h = ML.newPO(trx, 'c_allocationhdr', { ad_org_id: p.ad_org_id, ismanual: 'N', datetrx: p.datetrx, dateacct: dacct, c_currency_id: p.c_currency_id,
        description: 'Payment: ' + p.documentno + ' [1]', docstatus: 'DR', docaction: 'CO' });
      var adt = trx.q("SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=? AND docbasetype='CMA' ORDER BY isdefault DESC, c_doctype_id", [trx.env.client])[0];
      if (adt && h.c_doctype_id == null) h.c_doctype_id = adt.c_doctype_id;
      var hr = ML.save(trx, 'c_allocationhdr', null, h).row;
      var rc = Y(p.isreceipt);
      ML.save(trx, 'c_allocationline', null, ML.newPO(trx, 'c_allocationline', { c_allocationhdr_id: hr.c_allocationhdr_id, ad_org_id: hr.ad_org_id,
        amount: N(rc ? amt : amt.negate()), discountamt: N(rc ? D(p.discountamt) : D(p.discountamt).negate()), writeoffamt: N(rc ? D(p.writeoffamt) : D(p.writeoffamt).negate()),
        overunderamt: N(rc ? D(p.overunderamt) : D(p.overunderamt).negate()), c_bpartner_id: p.c_bpartner_id, c_order_id: null, c_invoice_id: p.c_invoice_id, c_payment_id: p.c_payment_id }));
      var r = ML.processIt(trx, 'c_allocationhdr', hr.c_allocationhdr_id, 'CO');
      if (!r.ok) throw new Error('FailedProcessingDocument - ' + (r.msg || r.status));
      return true;
    }
    if (trx.find('c_paymentallocate', { c_payment_id: p.c_payment_id }).length) throw new Error('MPayment.allocateIt multi-invoice C_PaymentAllocate (MPayment.java:2313) not ported — named');
    return false;
  }

  // ══ MAllocationHdr (prepareIt :412-516, completeIt :518-560) + MAllocationLine.processIt :273-373 ═══════════════
  var MAllocationHdr = {
    prepareIt: function (trx, h) {
      var m = fire(trx, 'BEFORE_PREPARE', 'c_allocationhdr', h); if (m) { T.msg(trx, m); return 'IN'; }
      if (!T.periodOpen(trx, h.dateacct, 'CMA')) { T.msg(trx, '@PeriodClosed@'); return 'IN'; }
      var ls = trx.find('c_allocationline', { c_allocationhdr_id: h.c_allocationhdr_id }); if (!ls.length) { T.msg(trx, '@NoLines@'); return 'IN'; }
      var appr = Z;
      for (var i = 0; i < ls.length; i++) { var l = ls[i];
        appr = appr.add(D(l.writeoffamt)).add(D(l.discountamt));
        if (!nz(l.c_bpartner_id)) { T.msg(trx, 'No Business Partner'); return 'IN'; }
        if (nz(l.c_invoice_id)) { var iv = trx.get('c_invoice', l.c_invoice_id); if (iv && Y(iv.ispaid) && !/^(VO|RE)$/.test(iv.docstatus) && D(l.amount).signum() > 0) { T.msg(trx, '@ValidationError@ @C_Invoice_ID@ @IsPaid@'); return 'IN'; }
          if (iv && String(iv.dateacct) > String(h.dateacct)) { T.msg(trx, 'Wrong allocation date'); return 'IN'; } }
        if (nz(l.c_payment_id)) { var py = trx.get('c_payment', l.c_payment_id); if (py && String(py.dateacct) > String(h.dateacct)) { T.msg(trx, 'Wrong allocation date'); return 'IN'; } }
      }
      trx.update('c_allocationhdr', h, { approvalamt: N(appr) });
      m = fire(trx, 'AFTER_PREPARE', 'c_allocationhdr', h); if (m) { T.msg(trx, m); return 'IN'; }
      if (h.docaction !== 'CO') trx.update('c_allocationhdr', h, { docaction: 'CO' });
      trx._justPrepared = 'c_allocationhdr:' + h.c_allocationhdr_id;
      return 'IP';
    },
    completeIt: function (trx, h) {
      if (trx._justPrepared !== 'c_allocationhdr:' + h.c_allocationhdr_id) { var st = MAllocationHdr.prepareIt(trx, h); if (st !== 'IP') return st; }
      trx._justPrepared = null;
      var m = fire(trx, 'BEFORE_COMPLETE', 'c_allocationhdr', h); if (m) { T.msg(trx, m); return 'IN'; }
      if (!Y(h.isapproved)) trx.update('c_allocationhdr', h, { isapproved: 'Y' });
      var ls = trx.find('c_allocationline', { c_allocationhdr_id: h.c_allocationhdr_id }), bps = {};
      ls.forEach(function (l) { if (!bps[l.c_bpartner_id]) { bps[l.c_bpartner_id] = 1; T.setTotalOpenBalance(trx, l.c_bpartner_id); } });   // updateBP :954-968
      ls.forEach(function (l) {                                                               // MAllocationLine.processIt(false)
        var inv = nz(l.c_invoice_id) ? trx.get('c_invoice', l.c_invoice_id) : null;
        if (inv && String(l.c_bpartner_id) !== String(inv.c_bpartner_id)) trx.update('c_allocationline', l, { c_bpartner_id: inv.c_bpartner_id });
        if (nz(l.c_payment_id)) { var p = trx.get('c_payment', l.c_payment_id); payTestAllocation(trx, p); }
        if (nz(l.c_payment_id) && inv) {
          if (Y(inv.ispaid)) trx.update('c_invoice', inv, { c_payment_id: l.c_payment_id });
          if (nz(inv.c_order_id)) { var o = trx.get('c_order', inv.c_order_id); var iv2 = trx.get('c_invoice', inv.c_invoice_id); if (o) trx.update('c_order', o, { c_payment_id: iv2.c_payment_id || null }); }   // :320-327
        }
        if (nz(l.c_cashline_id) && inv) trx.update('c_invoice', inv, { c_cashline_id: l.c_cashline_id });
        if (inv) invTestAllocation(trx, trx.get('c_invoice', inv.c_invoice_id), false);
      });
      m = fire(trx, 'AFTER_COMPLETE', 'c_allocationhdr', h); if (m) { T.msg(trx, m); return 'IN'; }
      trx.update('c_allocationhdr', h, { processed: 'Y', docaction: 'CL' });
      return 'CO';
    },
    approveIt: function (trx, h) { trx.update('c_allocationhdr', h, { isapproved: 'Y' }); return true; },
    getSummary: function (trx, h) { return (h.documentno || '') + ': Total=' + h.approvalamt; }
  };

  // setInitialDefaults: MInvoice.java:438-465, MInvoiceLine.java:150-162, MPayment.java:147-177
  ML.registerModel('c_invoice', { initialDefaults: { docstatus: 'DR', docaction: 'CO', paymentrule: 'P', chargeamt: 0, totallines: 0, grandtotal: 0, issotrx: 'Y', istaxincluded: 'N', isapproved: 'N',
    isdiscountprinted: 'N', ispaid: 'N', sendemail: 'N', isprinted: 'N', istransferred: 'N', isselfservice: 'N', ispayschedulevalid: 'N', isindispute: 'N' } });
  ML.registerModel('c_invoiceline', { initialDefaults: { isdescription: 'N', isprinted: 'Y', linenetamt: 0, priceentered: 0, priceactual: 0, pricelimit: 0, pricelist: 0, m_attributesetinstance_id: 0, taxamt: 0, qtyentered: 0, qtyinvoiced: 0 } });
  // MPayment.beforeSave :670-790 — the derivations (gates on processed edits / IBAN / FX override named in the log when hit)
  ML.registerModel('c_payment', { beforeSave: function (trx, p, isNew) {
    if (!nz(p.c_bankaccount_id)) return '@Mandatory@: @C_BankAccount_ID@';
    if (nz(p.c_charge_id) && isNew) Object.assign(p, { c_order_id: null, c_invoice_id: null, writeoffamt: 0, discountamt: 0, isoverunderpayment: 'N', overunderamt: 0, isprepayment: 'N' });
    if (isNew) p.isprepayment = (!nz(p.c_charge_id) && nz(p.c_bpartner_id) && (nz(p.c_order_id) || (nz(p.c_project_id) && !nz(p.c_invoice_id)))) ? 'Y' : 'N';
    if (Y(p.isprepayment) && isNew) Object.assign(p, { writeoffamt: 0, discountamt: 0, isoverunderpayment: 'N', overunderamt: 0 });
    if (nz(p.c_doctype_id)) { var d = T.dt(trx, p.c_doctype_id); if (d) p.isreceipt = Y(d.issotrx) ? 'Y' : 'N'; }
    if (p.dateacct == null) p.dateacct = p.datetrx;
    if (!Y(p.isoverunderpayment)) p.overunderamt = 0;
    if (isNew && !nz(p.c_charge_id)) { var ba = trx.get('c_bankaccount', p.c_bankaccount_id); if (ba && nz(ba.ad_org_id)) p.ad_org_id = ba.ad_org_id; }
    return null; } });
  ML.registerModel('c_payment', { initialDefaults: { docaction: 'CO', docstatus: 'DR', trxtype: 'S', r_avsaddr: 'X', r_avszip: 'X', isreceipt: 'Y', isapproved: 'N', isreconciled: 'N', isallocated: 'N',
    isonline: 'N', isselfservice: 'N', isdelayedcapture: 'N', isprepayment: 'N', payamt: 0, discountamt: 0, taxamt: 0, writeoffamt: 0, isoverunderpayment: 'N', overunderamt: 0, tendertype: 'K' } });   // setOverUnderAmt(0) :1440-1444 resets the flag to N
  // MAllocationLine.beforeSave :209-231 — BP / Order from the invoice
  ML.registerModel('c_allocationline', { beforeSave: function (trx, l, isNew) {
    var h = trx.get('c_allocationhdr', l.c_allocationhdr_id); if (isNew && h && Y(h.processed)) return 'ParentComplete';
    var inv = nz(l.c_invoice_id) ? trx.get('c_invoice', l.c_invoice_id) : null;
    if (!nz(l.c_bpartner_id) && inv) l.c_bpartner_id = inv.c_bpartner_id;
    if (!nz(l.c_order_id) && inv) l.c_order_id = inv.c_order_id;
    return null; } });
  // AD_ModelValidator "FixedAssets" = org.idempiere.fa.model.ModelValidator.modelChange_InvoiceLine :142-205 — runs on EVERY
  // invoice line in core: BEFORE_NEW/CHANGE sets A_CreateAsset/IsFixedAssetInvoice from the product; AFTER_* rolls the flag
  // onto the header. Registered as validators (the AD_ModelValidator mechanism), writing through ctx.trx.
  function faBefore(ctx, info) {
    var l = info.record, p = nz(l.m_product_id) ? (ctx.trx ? ctx.trx.get('m_product', l.m_product_id) : null) : null, asset = !!(p && Y(p.iscreateasset));
    (info.derived = info.derived || {});
    l.a_createasset = asset ? 'Y' : 'N'; l.isfixedassetinvoice = asset ? 'Y' : 'N';
    if (asset) l.a_asset_group_id = p.a_asset_group_id; else { l.a_asset_group_id = null; l.a_asset_id = null; }
    if (asset && T.isStocked(p)) return 'AssetProductStockedException ' + p.value;
    return null;
  }
  function faAfter(ctx, info) {
    var trx = ctx.trx; if (!trx) return null;
    var inv = trx.get('c_invoice', info.record.c_invoice_id); if (!inv) return null;
    var v = trx.find('c_invoiceline', { c_invoice_id: inv.c_invoice_id }).filter(function (x) { return x.isdescription !== 'Y'; }).some(function (x) { return x.isfixedassetinvoice === 'Y'; }) ? 'Y' : 'N';
    trx.update('c_invoice', inv, { isfixedassetinvoice: v });
    return null;
  }
  if (ML.MV && ML.MV.registerValidator) {
    ['BEFORE_NEW', 'BEFORE_CHANGE'].forEach(function (t) { ML.MV.registerValidator('C_InvoiceLine', t, 'FixedAssets.modelChange_InvoiceLine', faBefore); });
    ['AFTER_NEW', 'AFTER_CHANGE', 'AFTER_DELETE'].forEach(function (t) { ML.MV.registerValidator('C_InvoiceLine', t, 'FixedAssets.invoiceHeaderFlag', faAfter); });
  }
  ML.registerDocAction('c_invoice', MInvoice);
  ML.registerDocAction('c_payment', MPayment);
  ML.registerDocAction('c_allocationhdr', MAllocationHdr);
  return { MInvoice: MInvoice, MPayment: MPayment, MAllocationHdr: MAllocationHdr, createInvoice: createInvoice, calculateInvoiceTaxTotal: calculateInvoiceTaxTotal,
           invTestAllocation: invTestAllocation, payTestAllocation: payTestAllocation, allocateIt: allocateIt };
});

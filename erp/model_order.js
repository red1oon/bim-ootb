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
  function calculateOrderTaxTotal(trx, o) {
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

  // ══ MOrderLine — beforeSave (LineNetAmt) + afterSave :967-985 → recalculateTax → updateHeaderTax :1070 ═════════
  ML.registerModel('c_orderline', {
    // MOrderLine.beforeSave :790-940 — header copy (setOrder :227-238), line no, UOM, LineNetAmt (:365-372), Discount (:681-691).
    // Pricing (getProductPricing / price-limit enforcement) stays with the callout layer — named, not re-derived here.
    beforeSave: function (trx, l, isNew) {
      var o = trx.get('c_order', l.c_order_id); if (!o) return null;
      if (isNew && Y(o.processed)) return 'parent processed';
      if (!nz(l.c_bpartner_id) || !nz(l.c_bpartner_location_id) || !nz(l.m_warehouse_id) || !nz(l.c_currency_id)) {
        ['c_bpartner_id', 'c_bpartner_location_id', 'm_warehouse_id', 'dateordered', 'datepromised', 'c_currency_id'].forEach(function (c) { l[c] = o[c]; });
        if (l.ad_org_id == null) l.ad_org_id = o.ad_org_id;
      }
      if (nz(l.c_charge_id) && nz(l.m_product_id)) l.m_product_id = null;
      if (!nz(l.m_product_id)) l.m_attributesetinstance_id = 0;
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
        calculateOrderTaxTotal(trx, o);                                                      // updateOrderTax + updateHeaderTax (StandardTaxProvider :113-163)
      }
      return null;
    },
    afterDelete: function (trx, l) { var o = trx.get('c_order', l.c_order_id); if (o && !Y(o.processed)) calculateOrderTaxTotal(trx, o); return null; }
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

  // ══ MOrder.createShipment :2433-2490 ═════════════════════════════════════════════════════════════════════════
  function createShipment(trx, o, d, movementDate) {
    var dtShip = nz(d.c_doctypeshipment_id) ? d.c_doctypeshipment_id : null;
    if (!dtShip) { T.msg(trx, '@NotFound@ @C_DocTypeShipment_ID@'); return null; }
    var sd = T.dt(trx, dtShip), so = Y(o.issotrx);
    var mt = sd.docbasetype === 'MMS' ? (so ? 'C-' : 'V-') : sd.docbasetype === 'MMR' ? (so ? 'C+' : 'V+') : null;   // MInOut.setMovementType :1275-1287
    var h = ML.newPO(trx, 'm_inout', Object.assign({ ad_org_id: o.ad_org_id, c_bpartner_id: o.c_bpartner_id, c_bpartner_location_id: o.c_bpartner_location_id,   // MInOut(MOrder) ctor
      ad_user_id: o.ad_user_id, m_warehouse_id: o.m_warehouse_id, issotrx: o.issotrx, c_doctype_id: dtShip, movementtype: mt,
      movementdate: movementDate, dateacct: movementDate, c_order_id: o.c_order_id, deliveryrule: o.deliveryrule, deliveryviarule: o.deliveryviarule,
      m_shipper_id: o.m_shipper_id, freightcostrule: o.freightcostrule, freightamt: o.freightamt, salesrep_id: o.salesrep_id, c_charge_id: o.c_charge_id,
      chargeamt: o.chargeamt, dateordered: o.dateordered, description: o.description, poreference: o.poreference, priorityrule: o.priorityrule,
      isdropship: o.isdropship, dropship_bpartner_id: o.dropship_bpartner_id, dropship_location_id: o.dropship_location_id, dropship_user_id: o.dropship_user_id,
      docstatus: 'DR', docaction: 'CO' }, copy(o, DIMS)));
    h.documentno = T.nextDocNo(trx, dtShip, 'M_InOut', h);                                   // PO.saveNew :3149-3162
    var r = ML.save(trx, 'm_inout', null, h); if (!r.ok) { T.msg(trx, 'Could not create Shipment: ' + r.error); return null; }
    var ship = r.row;
    lines(trx, o).forEach(function (ol) {
      var mq = D(ol.qtyordered).subtract(D(ol.qtydelivered));
      if (mq.signum() === 0 && Number(o.processedon)) return;                               // :2452-2455
      var p = T.product(trx, ol.m_product_id), loc = 0;
      if (p) {
        // MStorageOnHand.getM_Locator_ID :~470 — highest priority locator with enough on hand, else the first
        var cands = trx.q("SELECT s.m_locator_id AS l, s.qtyonhand AS q FROM m_storageonhand s JOIN m_locator l ON l.m_locator_id=s.m_locator_id WHERE l.m_warehouse_id=? AND s.m_product_id=? AND l.isactive='Y' ORDER BY l.priorityno DESC, s.qtyonhand DESC", [ol.m_warehouse_id, ol.m_product_id]);
        for (var i = 0; i < cands.length; i++) { if (cands[i].q != null && mq.compareTo(D(cands[i].q)) <= 0) { loc = cands[i].l; break; } if (!loc) loc = -cands[i].l; }
        loc = Math.abs(loc);
        if (!loc) { var dl = trx.q("SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=? AND isactive='Y' ORDER BY CASE WHEN isdefault='Y' THEN 0 ELSE 1 END, m_locator_id", [ol.m_warehouse_id])[0]; loc = dl ? dl.l : null; }   // MWarehouse.getDefaultLocator
      }
      var qe = mq;
      if (D(ol.qtyentered).compareTo(D(ol.qtyordered)) !== 0) qe = mq.multiply(D(ol.qtyentered)).divide(D(ol.qtyordered), 6, HU);
      var sl = ML.newPO(trx, 'm_inoutline', Object.assign({ m_inout_id: ship.m_inout_id, ad_org_id: ship.ad_org_id, c_orderline_id: ol.c_orderline_id,   // setOrderLine (MInOutLine:~330)
        line: ol.line, c_uom_id: ol.c_uom_id, m_product_id: p ? ol.m_product_id : null, m_attributesetinstance_id: p ? (ol.m_attributesetinstance_id || 0) : null,
        m_locator_id: p && T.isItem(p) ? loc : null, c_charge_id: ol.c_charge_id, description: ol.description, isdescription: ol.isdescription,
        movementqty: N(mq), qtyentered: N(qe), c_projectphase_id: ol.c_projectphase_id, c_projecttask_id: ol.c_projecttask_id }, copy(ol, DIMS)));
      ML.save(trx, 'm_inoutline', null, sl);
    });
    var res = ML.processIt(trx, 'm_inout', ship.m_inout_id, 'CO');                           // :2480 shipment.processIt(Complete)
    if (!res.ok || res.status !== 'CO') { T.msg(trx, '@M_InOut_ID@: ' + (res.msg || res.status)); return null; }
    return trx.get('m_inout', ship.m_inout_id);
  }

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
        if (!so && nz(sl.m_product_id) && nz(sl.c_orderline_id)) {                            // :2088-2108 PO matching (receipt side)
          trx.insert('m_matchpo', ML.newPO(trx, 'm_matchpo', { ad_org_id: sl.ad_org_id, c_orderline_id: sl.c_orderline_id, m_inoutline_id: sl.m_inoutline_id,
            m_product_id: sl.m_product_id, m_attributesetinstance_id: sl.m_attributesetinstance_id || 0, qty: sl.movementqty, datetrx: io.movementdate, dateacct: io.movementdate, processed: 'Y' }));
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
  return { MOrder: MOrder, MInOut: MInOut, calculateOrderTaxTotal: calculateOrderTaxTotal, reserveStock: reserveStock, createShipment: createShipment, setProcessed: setProcessed };
});

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/RMACreateOrder.js — org.adempiere.process.RMACreateOrder, verbatim
// (org.adempiere.base.process/src/org/adempiere/process/RMACreateOrder.java). §CP-PROC-CORE family B — Witness: W-CP-PROC-ORACLE.
// Inline ports (no other lane owns them, JS has no MOrder ctor/beforeSave yet): MOrder.setInitialDefaults (MOrder.java:441-480) +
// the new-record parts of MOrder.beforeSave (:1183-1300); MOrderLine.setInitialDefaults/setOrder/setHeaderInfo/setQty/setPrice
// (MOrderLine.java:159-179,227-251,714-718,290-325). MProductPricing = callouts/pricing.js (RUNTIME.M.Core.getProductPricing).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.adempiere.process.RMACreateOrder', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function RMACreateOrder() { SvrProcess.call(this); this.rmaId = 0; }
    RMACreateOrder.prototype = Object.create(SvrProcess.prototype);
    RMACreateOrder.prototype.prepare = function () { this.rmaId = this.getRecord_ID(); };   // :41-44

    function sqlInt(trx, sql, args) { var r = trx.q(sql, args || [])[0]; if (!r) return -1; var v = r[Object.keys(r)[0]]; return v == null ? 0 : Number(v); }   // DB.getSQLValueEx (no row → -1, NULL → 0)
    // new MOrder(ctx, 0, trx) :441-480
    function newOrder(trx, g) {
      var o = g.ML().newRecord(trx, 'c_order', {}), now = trx.env.date;
      o.set('docstatus', 'DR').set('docaction', 'PR').set('deliveryrule', 'A').set('freightcostrule', 'I').set('invoicerule', 'I').set('paymentrule', 'P')
        .set('priorityrule', '5').set('deliveryviarule', 'P').set('isdiscountprinted', 'N').set('isselected', 'N').set('istaxincluded', 'N').set('issotrx', 'Y')
        .set('isdropship', 'N').set('sendemail', 'N').set('isapproved', 'N').set('isprinted', 'N').set('iscreditapproved', 'N').set('isdelivered', 'N')
        .set('isinvoiced', 'N').set('istransferred', 'N').set('isselfservice', 'N').set('processed', 'N').set('processing', 'N').set('posted', 'N')
        .set('dateacct', now).set('datepromised', now).set('dateordered', now).set('freightamt', 0).set('chargeamt', 0).set('totallines', 0).set('grandtotal', 0);
      return o;
    }
    // MOrder.beforeSave (new record) :1183-1300 — the parts that change a record built like RMACreateOrder builds it
    function orderBeforeSave(trx, o, ctx, A) {
      var T = G().T();
      if (!T.nz(o.get('ad_org_id'))) { var co = A.Env.getAD_Org_ID(ctx); if (co !== 0) o.set('ad_org_id', co); }   // :1186-1194
      if (!T.nz(o.get('c_doctype_id'))) o.set('c_doctype_id', 0);                                                  // :1202-1203
      if (!T.nz(o.get('m_warehouse_id'))) { var ii = A.Env.getContextAsInt(ctx, '#M_Warehouse_ID'); if (ii !== 0) o.set('m_warehouse_id', ii); else throw new Error('@FillMandatory@ @M_Warehouse_ID@'); }   // :1206-1215
      var bpFromLoc = 'SELECT C_BPartner_ID FROM C_BPartner_Location WHERE C_BPartner_Location_ID=?', bpFromUser = 'SELECT C_BPartner_ID FROM AD_User WHERE AD_User_ID=?';   // :1237-1238
      if (Number(o.get('c_bpartner_location_id')) > 0 && sqlInt(trx, bpFromLoc, [o.get('c_bpartner_location_id')]) !== Number(o.get('c_bpartner_id'))) o.set('c_bpartner_location_id', null);   // :1240-1245
      if (Number(o.get('ad_user_id') || 0) >= 0 && sqlInt(trx, bpFromUser, [o.get('ad_user_id') || 0]) !== Number(o.get('c_bpartner_id'))) o.set('ad_user_id', null);                           // :1246-1251
      if (Number(o.get('bill_location_id')) > 0 && sqlInt(trx, bpFromLoc, [o.get('bill_location_id')]) !== Number(o.get('bill_bpartner_id'))) o.set('bill_location_id', null);               // :1254-1260
      if (Number(o.get('bill_user_id') || 0) >= 0 && sqlInt(trx, bpFromUser, [o.get('bill_user_id') || 0]) !== Number(o.get('bill_bpartner_id'))) o.set('bill_user_id', null);                // :1261-1266
      if (!T.nz(o.get('bill_bpartner_id'))) { o.set('bill_bpartner_id', o.get('c_bpartner_id')); o.set('bill_location_id', o.get('c_bpartner_location_id')); }   // :1272-1276
      if (!T.nz(o.get('bill_location_id'))) o.set('bill_location_id', o.get('c_bpartner_location_id'));           // :1279-1280
      if (!T.nz(o.get('c_currency_id'))) {                                                                          // :1295-1305
        var cc = sqlInt(trx, 'SELECT C_Currency_ID FROM M_PriceList WHERE M_PriceList_ID=?', [o.get('m_pricelist_id')]);
        o.set('c_currency_id', cc !== 0 && cc !== -1 ? cc : A.Env.getContextAsInt(ctx, '$C_Currency_ID'));
      }
    }
    // new MOrderLine(order) :185-192 ∘ setInitialDefaults :159-179 ∘ setOrder :227-239
    function newOrderLine(trx, order, g) {
      var l = g.ML().newRecord(trx, 'c_orderline', {}), o = trx.get('c_order', order.id());
      l.set('freightamt', 0).set('linenetamt', 0).set('priceentered', 0).set('priceactual', 0).set('pricelimit', 0).set('pricelist', 0).set('m_attributesetinstance_id', 0)
        .set('qtyentered', 0).set('qtyordered', 0).set('qtydelivered', 0).set('qtyinvoiced', 0).set('qtyreserved', 0).set('isdescription', 'N').set('processed', 'N').set('line', 0);
      l.set('c_order_id', o.c_order_id);
      l.set('ad_client_id', o.ad_client_id).set('ad_org_id', o.ad_org_id).set('c_bpartner_id', o.c_bpartner_id).set('c_bpartner_location_id', o.c_bpartner_location_id)
        .set('m_warehouse_id', o.m_warehouse_id).set('dateordered', o.dateordered).set('datepromised', o.datepromised).set('c_currency_id', o.c_currency_id);
      l.p.priceList = o.m_pricelist_id; l.p.isSOTrx = o.issotrx;                                 // setHeaderInfo :245-251
      return l;
    }
    // MOrderLine.setPrice() :290-325 (+ getProductPricing :332-340; AbstractProductPricing.setOrderLine :98-117 inlined — the order is a pending row)
    function setPrice(trx, l, A, g) {
      var D = g.T().D, R = A.RUNTIME, M = R.M;
      if (!g.T().nz(l.get('m_product_id'))) return;
      if (!l.p.priceList) throw new Error('PriceList unknown!');
      var pp = M.Core.getProductPricing();
      pp.m_M_Product_ID = Number(l.get('m_product_id')); pp.m_isSOTrx = g.T().Y(l.p.isSOTrx);
      pp.m_C_BPartner_ID = Number(l.get('c_bpartner_id') || 0);
      var qty = D(l.get('qtyordered')); if (qty.signum() !== 0) pp.m_Qty = qty;
      pp.m_PriceDate = A.Timestamp.of(l.get('dateordered')); pp.trxName = null; pp.checkVendorBreak();
      pp.setM_PriceList_ID(l.p.priceList);
      pp.calculatePrice();
      l.set('priceactual', pp.getPriceStd()).set('pricelist', pp.getPriceList()).set('pricelimit', pp.getPriceLimit());
      if (D(l.get('qtyentered')).compareTo(D(l.get('qtyordered'))) === 0) l.set('priceentered', l.get('priceactual'));
      else l.set('priceentered', D(l.get('priceactual')).multiply(D(l.get('qtyordered')).divide(D(l.get('qtyentered')), 12, A.RoundingMode.HALF_UP)));
      l.set('discount', pp.getDiscount());
      if (!g.T().nz(l.get('c_uom_id'))) l.set('c_uom_id', pp.getC_UOM_ID());
    }
    // the three identical line blocks :101-117 / :122-140 / :143-160
    function addLine(trx, order, A, g, f) {
      var l = newOrderLine(trx, order, g);
      l.set('ad_org_id', f.org).set('m_product_id', f.product).set('m_attributesetinstance_id', f.asi).set('c_uom_id', f.uom).set('c_tax_id', f.tax)
        .set('m_warehouse_id', f.wh).set('c_currency_id', f.cur);
      l.set('qtyentered', f.qty).set('qtyordered', f.qty);                                       // setQty :714-718
      l.set('c_project_id', f.project).set('c_activity_id', f.activity).set('c_campaign_id', f.campaign);
      setPrice(trx, l, A, g);                                                                      // orderLine.setPrice()
      l.set('priceentered', f.amt).set('priceactual', f.amt);                                      // orderLine.setPrice(line.getAmt()) :269-273
      if (!l.save()) throw new Error('Could not create Order Line');
    }

    RMACreateOrder.prototype.doIt = function () {                                     // :46-173
      var A = X.A, g = G(), T = g.T(), trx = this.get_TrxName(), ctx = this.getCtx();
      var rma = trx.get('m_rma', this.rmaId);                                         // :49
      var shipment = rma && T.nz(rma.inout_id) ? trx.get('m_inout', rma.inout_id) : null;   // MRMA.getShipment :149-154
      var originalOrder = shipment && T.nz(shipment.c_order_id) ? trx.get('c_order', shipment.c_order_id) : null;   // getOriginalOrder :160-168
      if (!rma) throw new Error('No RMA defined');                                    // :55
      if (originalOrder == null) throw new Error('Could not load the original order');   // :60
      var order = newOrder(trx, g);                                                   // :65
      order.set('ad_org_id', rma.ad_org_id);                                          // :66
      order.set('c_bpartner_id', originalOrder.c_bpartner_id).set('c_bpartner_location_id', originalOrder.c_bpartner_location_id).set('ad_user_id', originalOrder.ad_user_id);   // :67-69
      order.set('bill_bpartner_id', originalOrder.bill_bpartner_id).set('bill_location_id', originalOrder.bill_location_id).set('bill_user_id', originalOrder.bill_user_id);   // :70-72
      order.set('salesrep_id', rma.salesrep_id).set('m_pricelist_id', originalOrder.m_pricelist_id).set('issotrx', originalOrder.issotrx);   // :73-75
      order.set('m_warehouse_id', originalOrder.m_warehouse_id).set('c_doctypetarget_id', originalOrder.c_doctypetarget_id);              // :76-77
      order.set('c_paymentterm_id', originalOrder.c_paymentterm_id).set('deliveryrule', originalOrder.deliveryrule);                       // :78-79
      orderBeforeSave(trx, order, ctx, A);
      if (!order.save()) throw new Error('Could not create order');                   // :81
      var originalShipment = shipment;                                                 // :86 rma.getShipment()
      var originalInvoice = null;                                                      // :87 rma.getOriginalInvoice() (MRMA.java:174-200)
      if (shipment) {
        var invId = T.nz(shipment.c_invoice_id) ? Number(shipment.c_invoice_id) : sqlInt(trx, 'SELECT C_Invoice_ID FROM C_Invoice WHERE C_Order_ID=?', [shipment.c_order_id]);
        if (invId > 0) originalInvoice = trx.get('c_invoice', invId);
      }
      var lines = g.lines(trx, 'm_rmaline', 'm_rma_id', rma.m_rma_id);                 // :89 getLines(true) ORDER BY Line, M_RMALine_ID
      lines.sort(function (a, b) { return (Number(a.line) - Number(b.line)) || (Number(a.m_rmaline_id) - Number(b.m_rmaline_id)); });
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i], shipLine = T.nz(line.m_inoutline_id) ? trx.get('m_inoutline', line.m_inoutline_id) : null;   // MRMALine.getShipLine :253
        var qty = A.toBD(String(line.qty));
        if (shipLine != null && T.nz(shipLine.c_orderline_id) && T.nz(line.m_product_id)) {   // :92
          var ool = trx.get('c_orderline', shipLine.c_orderline_id);                   // :96
          addLine(trx, order, A, g, { org: line.ad_org_id, product: ool.m_product_id, asi: ool.m_attributesetinstance_id, uom: ool.c_uom_id, tax: ool.c_tax_id, wh: ool.m_warehouse_id,
            cur: ool.c_currency_id, qty: qty, project: ool.c_project_id, activity: ool.c_activity_id, campaign: ool.c_campaign_id, amt: A.toBD(String(line.amt)) });
        } else if (T.nz(line.m_product_id)) {                                          // :118
          if (originalInvoice != null) {                                               // :120
            addLine(trx, order, A, g, { org: line.ad_org_id, product: line.m_product_id, asi: line.m_attributesetinstance_id, uom: line.c_uom_id, tax: line.c_tax_id,
              wh: originalShipment.m_warehouse_id, cur: originalInvoice.c_currency_id, qty: qty, project: line.c_project_id, activity: line.c_activity_id, campaign: line.c_campaign_id, amt: A.toBD(String(line.amt)) });
          } else if (originalOrder != null) {                                          // :140
            addLine(trx, order, A, g, { org: line.ad_org_id, product: line.m_product_id, asi: line.m_attributesetinstance_id, uom: line.c_uom_id, tax: line.c_tax_id,
              wh: originalOrder.m_warehouse_id, cur: originalOrder.c_currency_id, qty: qty, project: line.c_project_id, activity: line.c_activity_id, campaign: line.c_campaign_id, amt: A.toBD(String(line.amt)) });
          }
        }
      }
      var r = X.save(trx, 'M_RMA', rma, { c_order_id: order.id() });                  // :163-166 rma.setC_Order_ID + save
      if (!r.ok) throw new Error('Could not update RMA document');
      return 'Order Created: ' + trx.get('c_order', order.id()).documentno;           // :168
    };
    return RMACreateOrder;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

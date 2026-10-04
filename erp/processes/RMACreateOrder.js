// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/RMACreateOrder.js — org.adempiere.process.RMACreateOrder, verbatim
// (org.adempiere.base.process/src/org/adempiere/process/RMACreateOrder.java). §CP-PROC-CORE family B — Witness: W-CP-PROC-ORACLE.
// The M-class code (MOrder ctor/beforeSave, MOrderLine ctor/setOrder/setHeaderInfo/setPrice) moved to model_order.js (§CP-OPEN 4b).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.adempiere.process.RMACreateOrder', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function RMACreateOrder() { SvrProcess.call(this); this.rmaId = 0; }
    RMACreateOrder.prototype = Object.create(SvrProcess.prototype);
    RMACreateOrder.prototype.prepare = function () { this.rmaId = this.getRecord_ID(); };   // :41-44

    function MO() { return G().MO(); }
    // the three identical line blocks :101-117 / :122-140 / :143-160
    function addLine(trx, order, A, g, f) {
      var l = MO().MOrderLine_new(trx, order);
      l.set('ad_org_id', f.org).set('m_product_id', f.product).set('m_attributesetinstance_id', f.asi).set('c_uom_id', f.uom).set('c_tax_id', f.tax)
        .set('m_warehouse_id', f.wh).set('c_currency_id', f.cur);
      l.set('qtyentered', f.qty).set('qtyordered', f.qty);                                       // setQty :714-718
      l.set('c_project_id', f.project).set('c_activity_id', f.activity).set('c_campaign_id', f.campaign);
      MO().MOrderLine_setPrice(trx, l);                                                                      // orderLine.setPrice()
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
      var order = MO().MOrder_new(trx);                                                   // :65
      order.set('ad_org_id', rma.ad_org_id);                                          // :66
      order.set('c_bpartner_id', originalOrder.c_bpartner_id).set('c_bpartner_location_id', originalOrder.c_bpartner_location_id).set('ad_user_id', originalOrder.ad_user_id);   // :67-69
      order.set('bill_bpartner_id', originalOrder.bill_bpartner_id).set('bill_location_id', originalOrder.bill_location_id).set('bill_user_id', originalOrder.bill_user_id);   // :70-72
      order.set('salesrep_id', rma.salesrep_id).set('m_pricelist_id', originalOrder.m_pricelist_id).set('issotrx', originalOrder.issotrx);   // :73-75
      order.set('m_warehouse_id', originalOrder.m_warehouse_id).set('c_doctypetarget_id', originalOrder.c_doctypetarget_id);              // :76-77
      order.set('c_paymentterm_id', originalOrder.c_paymentterm_id).set('deliveryrule', originalOrder.deliveryrule);                       // :78-79
      MO().MOrder_beforeSaveNew(trx, order, ctx);
      if (!order.save()) throw new Error('Could not create order');                   // :81
      var originalShipment = shipment;                                                 // :86 rma.getShipment()
      var originalInvoice = null;                                                      // :87 rma.getOriginalInvoice() (MRMA.java:174-200)
      if (shipment) {
        var invId = T.nz(shipment.c_invoice_id) ? Number(shipment.c_invoice_id) : MO().sqlInt(trx, 'SELECT C_Invoice_ID FROM C_Invoice WHERE C_Order_ID=?', [shipment.c_order_id]);
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

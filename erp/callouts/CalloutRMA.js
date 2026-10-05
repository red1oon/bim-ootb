// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutRMA.js — org.adempiere.model.CalloutRMA, ported verbatim, all 5 methods
// (org.adempiere.base.callout/src/org/adempiere/model/CalloutRMA.java). §CP — Witness: W-CP-CALLOUT-ORACLE.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.adempiere.model.CalloutRMA', function (CalloutEngine, R) {
    var Env = R.Env, RM = R.RM, M = R.M;
    function I(v) { return v == null ? 0 : v; }
    function Z(v) { return v == null ? Env.ZERO : v; }
    function PO(t, id) { return R.PO.get(t, id); }
    function curPrecision(doc) { return I(M.MCurrency.getStdPrecision(null, I(doc.getC_Currency_ID()))); }   // MOrder/MInvoice.getPrecision :1086 / :1664
    // MRMA.getShipment :149-154, getOriginalOrder :160-168, getOriginalInvoice :174-199
    function shipment(rma) { return I(rma.getInOut_ID()) !== 0 ? PO('M_InOut', rma.getInOut_ID()) : null; }
    function originalOrder(rma) { var s = shipment(rma); if (s == null || I(s.getC_Order_ID()) === 0) return null; return PO('C_Order', s.getC_Order_ID()); }
    function originalInvoice(rma) {
      var s = shipment(rma); if (s == null) return null;
      var invId = 0;
      if (I(s.getC_Invoice_ID()) !== 0) invId = s.getC_Invoice_ID();
      else invId = R.DB.getSQLValue(null, 'SELECT C_Invoice_ID FROM C_Invoice WHERE C_Order_ID=?', I(s.getC_Order_ID()));
      if (invId <= 0) return null;
      return PO('C_Invoice', invId);
    }
    // MInvoice.getOriginalOrder :3042-3062
    function invoiceOriginalOrder(inv) {
      if (I(inv.getM_RMA_ID()) > 0) {
        var rma = PO('M_RMA', inv.getM_RMA_ID());
        var oo = originalOrder(rma); if (oo != null) return oo;
        var oi = originalInvoice(rma);
        if (I(oi.getC_Order_ID()) > 0) return PO('C_Order', oi.getC_Order_ID());
      } else if (I(inv.getC_Order_ID()) > 0) return PO('C_Order', inv.getC_Order_ID());
      return null;
    }
    // MInvoiceLine.getPrecision :842-858 / MOrderLine.getPrecision :399-425
    function invoiceLinePrecision(il) {
      var i = R.DB.getSQLValue(null, 'SELECT c.StdPrecision FROM C_Currency c INNER JOIN C_Invoice x ON (x.C_Currency_ID=c.C_Currency_ID) WHERE x.C_Invoice_ID=?', I(il.getC_Invoice_ID()));
      if (i < 0) i = 2;
      return i;
    }
    function orderLinePrecision(ol) {
      var cur = I(ol.getC_Currency_ID());
      if (cur === 0) { var o = PO('C_Order', I(ol.getC_Order_ID())); if (o) cur = I(o.getC_Currency_ID()); }   // setOrder(getParent())
      if (cur !== 0) { var c = M.MCurrency.get(null, cur); if (c != null && I(c.get_ID()) !== 0) return I(c.getStdPrecision()); }
      return R.DB.getSQLValue(null, 'SELECT c.StdPrecision FROM C_Currency c INNER JOIN C_Order x ON (x.C_Currency_ID=c.C_Currency_ID) WHERE x.C_Order_ID=?', I(ol.getC_Order_ID()));
    }
    function CalloutRMA() { CalloutEngine.call(this); }
    CalloutRMA.prototype = Object.create(CalloutEngine.prototype);
    var P = CalloutRMA.prototype;

    // docType :59-71
    P.docType = function (ctx, WindowNo, mTab, mField, value) {
      var C_DocType_ID = value;
      if (C_DocType_ID == null || C_DocType_ID === 0) return '';
      var docSOTrx = R.DB.getSQLValueString(null, 'SELECT d.IsSoTrx FROM C_DocType d WHERE C_DocType_ID=?', C_DocType_ID);
      mTab.setValue('IsSOTrx', 'Y' === docSOTrx);
      return '';
    };

    // inoutline :73-131 — product/charge/qty/amt/tax/linenet from the invoice line, else the order line
    P.inoutline = function (ctx, WindowNo, mTab, mField, value) {
      var M_InOutLine_ID = value;
      if (M_InOutLine_ID == null || M_InOutLine_ID === 0) return '';
      var iol = PO('M_InOutLine', M_InOutLine_ID);
      var r = R.DB.query('SELECT C_InvoiceLine_ID AS id FROM C_InvoiceLine WHERE M_InOutLine_ID=? ORDER BY C_InvoiceLine_ID', [M_InOutLine_ID])[0];   // Query.firstId
      var invoiceLine_ID = r ? Number(r.id) : -1;
      if (invoiceLine_ID <= 0) invoiceLine_ID = 0;
      var line, precision, lineNetAmt;
      if (invoiceLine_ID !== 0) {                                   // :86-106
        line = PO('C_InvoiceLine', invoiceLine_ID);
        if (I(line.getM_Product_ID()) !== 0) { mTab.setValue('M_Product_ID', line.getM_Product_ID()); mTab.setValue('C_Charge_ID', null); }
        if (I(line.getC_Charge_ID()) !== 0) { mTab.setValue('C_Charge_ID', line.getC_Charge_ID()); mTab.setValue('M_Product_ID', null); }
        mTab.setValue('Qty', Z(line.getQtyEntered()));
        mTab.setValue('Amt', Z(line.getPriceEntered()));
        mTab.setValue('C_Tax_ID', I(line.getC_Tax_ID()));
        lineNetAmt = Z(line.getQtyEntered()).multiply(Z(line.getPriceEntered()));
        precision = invoiceLinePrecision(line);
        if (lineNetAmt.scale() > precision) lineNetAmt = lineNetAmt.setScale(precision, RM.HALF_UP);
        mTab.setValue('LineNetAmt', lineNetAmt);
      } else if (iol != null && I(iol.getC_OrderLine_ID()) !== 0) {   // :107-128
        line = PO('C_OrderLine', iol.getC_OrderLine_ID());
        if (I(line.getM_Product_ID()) !== 0) { mTab.setValue('M_Product_ID', line.getM_Product_ID()); mTab.setValue('C_Charge_ID', null); }
        if (I(line.getC_Charge_ID()) !== 0) { mTab.setValue('C_Charge_ID', line.getC_Charge_ID()); mTab.setValue('M_Product_ID', null); }
        mTab.setValue('Qty', Z(line.getQtyEntered()));
        mTab.setValue('Amt', Z(line.getPriceEntered()));
        mTab.setValue('C_Tax_ID', I(line.getC_Tax_ID()));
        lineNetAmt = Z(line.getQtyEntered()).multiply(Z(line.getPriceEntered()));
        precision = orderLinePrecision(line);
        if (lineNetAmt.scale() > precision) lineNetAmt = lineNetAmt.setScale(precision, RM.HALF_UP);
        mTab.setValue('LineNetAmt', lineNetAmt);
      }
      return '';
    };

    // product :133-210 — price + tax from the original invoice (else order)
    P.product = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var M_Product_ID = value;
      if (M_Product_ID == null || M_Product_ID === 0) return '';
      var M_RMA_ID = mTab.getValue('M_RMA_ID');
      if (M_RMA_ID == null || M_RMA_ID === 0) return '';
      var AD_Org_ID = mTab.getValue('AD_Org_ID');
      if (AD_Org_ID == null || AD_Org_ID === 0) return '';
      var rma = PO('M_RMA', M_RMA_ID);
      var pp = M.Core.getProductPricing();
      pp.setInitialValues(M_Product_ID, I(rma.getC_BPartner_ID()), Env.ONE, rma.isSOTrx(), null);
      var taxId = 0, precision = 0, order;
      var invoice = originalInvoice(rma);
      if (invoice != null) {                                        // :155-176
        var dropshipLocationId = -1;
        order = invoiceOriginalOrder(invoice);
        if (order != null) dropshipLocationId = I(order.getDropShip_Location_ID());
        pp.setM_PriceList_ID(I(invoice.getM_PriceList_ID()));
        pp.setPriceDate(invoice.getDateInvoiced());
        precision = curPrecision(invoice);
        var deliveryViaRule = null;
        if (I(invoice.getC_Order_ID()) > 0) deliveryViaRule = PO('C_Order', invoice.getC_Order_ID()).getDeliveryViaRule();
        taxId = M.Core.getTaxLookup().get(ctx, M_Product_ID, 0, invoice.getDateInvoiced(), invoice.getDateInvoiced(),
          AD_Org_ID, I(shipment(rma).getM_Warehouse_ID()), I(invoice.getC_BPartner_Location_ID()), I(invoice.getC_BPartner_Location_ID()),
          dropshipLocationId, rma.isSOTrx(), deliveryViaRule, null);
      } else {                                                      // :177-193
        order = originalOrder(rma);
        if (order != null) {
          pp.setM_PriceList_ID(I(order.getM_PriceList_ID()));
          pp.setPriceDate(order.getDateOrdered());
          precision = curPrecision(order);
          taxId = M.Core.getTaxLookup().get(ctx, M_Product_ID, 0, order.getDateOrdered(), order.getDateOrdered(),
            AD_Org_ID, I(order.getM_Warehouse_ID()), I(order.getC_BPartner_Location_ID()), I(order.getC_BPartner_Location_ID()),
            I(order.getDropShip_Location_ID()), rma.isSOTrx(), order.getDeliveryViaRule(), null);
        } else return 'No Invoice/Order found the Shipment/Receipt associated';
      }
      pp.calculatePrice();                                          // :195-207
      mTab.setValue('Qty', Env.ONE);
      mTab.setValue('Amt', pp.getPriceStd());
      if (taxId !== 0) mTab.setValue('C_Tax_ID', taxId);
      var lineNetAmt = Env.ONE.multiply(pp.getPriceStd());
      if (lineNetAmt.scale() > precision) lineNetAmt = lineNetAmt.setScale(precision, RM.HALF_UP);
      mTab.setValue('LineNetAmt', lineNetAmt);
      return '';
    };

    // charge :212-268 — exempt tax + charge amount
    P.charge = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var C_Charge_ID = value;
      if (C_Charge_ID == null || C_Charge_ID === 0) return '';
      var M_RMA_ID = mTab.getValue('M_RMA_ID');
      if (M_RMA_ID == null || M_RMA_ID === 0) return '';
      var AD_Org_ID = mTab.getValue('AD_Org_ID');
      if (AD_Org_ID == null || AD_Org_ID === 0) return '';
      var charge = PO('C_Charge', C_Charge_ID);                     // MCharge.get
      var sql = "SELECT C_Tax_ID FROM C_Tax WHERE AD_Client_ID=? AND IsActive='Y' AND IsTaxExempt='Y' AND ValidFrom < getDate() ORDER BY IsDefault DESC";   // :232-234
      var taxId = R.DB.getSQLValue(null, sql, Env.getAD_Client_ID(ctx));
      mTab.setValue('Qty', Env.ONE);
      mTab.setValue('Amt', Z(charge.getChargeAmt()));
      if (taxId !== 0) mTab.setValue('C_Tax_ID', taxId);
      var rma = PO('M_RMA', M_RMA_ID), precision = 0;
      var invoice = originalInvoice(rma);
      if (invoice != null) precision = curPrecision(invoice);
      else {
        var order = originalOrder(rma);
        if (order != null) precision = curPrecision(order);
        else return 'No Invoice/Order found the Shipment/Receipt associated';
      }
      var lineNetAmt = Env.ONE.multiply(Z(charge.getChargeAmt()));
      if (lineNetAmt.scale() > precision) lineNetAmt = lineNetAmt.setScale(precision, RM.HALF_UP);
      mTab.setValue('LineNetAmt', lineNetAmt);
      return '';
    };

    // inout :275-292 — SalesRep from the shipment
    P.inout = function (ctx, WindowNo, mTab, mField, value) {
      var M_InOut_ID = value;
      if (M_InOut_ID == null || M_InOut_ID === 0) return '';
      var inout = PO('M_InOut', M_InOut_ID);
      if (inout != null && I(inout.get_ID()) !== 0) {
        if (I(inout.getSalesRep_ID()) > 0) mTab.setValue('SalesRep_ID', inout.getSalesRep_ID());
        else mTab.setValue('SalesRep_ID', null);
      }
      return '';
    };
    return CalloutRMA;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

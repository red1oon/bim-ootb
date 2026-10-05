// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutInvoiceBatch.js — org.compiere.model.CalloutInvoiceBatch, ported verbatim (every method).
// Source: org.adempiere.base.callout/src/org/compiere/model/CalloutInvoiceBatch.java (iDempiere @87968daa73).
// bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE (scenarios/cp/CalloutInvoiceBatch.json).
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;

  A.defineCallout('org.compiere.model.CalloutInvoiceBatch', function (CalloutEngine, R) {
    var Env = R.Env, RM = R.RM;
    function M() { return R.M; }
    function fireEE(mTab, msg, info, isError) {
      if (typeof mTab.fireDataStatusEEvent === 'function') mTab.fireDataStatusEEvent(msg, info, isError);
      else R.log('§CALLOUT-STATUS ' + msg + (info ? ' ' + info : ''));
    }
    function CalloutInvoiceBatch() { CalloutEngine.call(this); }
    CalloutInvoiceBatch.prototype = Object.create(CalloutEngine.prototype);
    var P = CalloutInvoiceBatch.prototype;

    // date :53-61
    P.date = function (ctx, WindowNo, mTab, mField, value) {
      if (value == null) return '';
      mTab.setValue('DateAcct', value);
      setDocumentNo(ctx, WindowNo, mTab);
      return '';
    };

    // bPartner :78-172
    P.bPartner = function (ctx, WindowNo, mTab, mField, value) {
      var C_BPartner_ID = value;
      if (C_BPartner_ID == null || C_BPartner_ID === 0) return '';
      var sql = 'SELECT p.AD_Language,p.C_PaymentTerm_ID,' +           // :84-93
        ' COALESCE(p.M_PriceList_ID,g.M_PriceList_ID) AS M_PriceList_ID, p.PaymentRule,p.POReference,' +
        ' p.SO_Description,p.IsDiscountPrinted,' +
        ' p.SO_CreditLimit, p.SO_CreditLimit-p.SO_CreditUsed AS CreditAvailable,' +
        " (select max(lbill.C_BPartner_Location_ID) from C_BPartner_Location lbill where p.C_BPartner_ID=lbill.C_BPartner_ID AND lbill.IsBillTo='Y' AND lbill.IsActive='Y') AS C_BPartner_Location_ID," +
        " (select max(c.AD_User_ID) from AD_User c where p.C_BPartner_ID=c.C_BPartner_ID AND c.IsActive='Y') as AD_User_ID," +
        ' COALESCE(p.PO_PriceList_ID,g.PO_PriceList_ID) AS PO_PriceList_ID, p.PaymentRulePO,p.PO_PaymentTerm_ID ' +
        'FROM C_BPartner p' +
        ' INNER JOIN C_BP_Group g ON (p.C_BP_Group_ID=g.C_BP_Group_ID)' +
        "WHERE p.C_BPartner_ID=? AND p.IsActive='Y'";
      var IsSOTrx = Env.getContext(ctx, WindowNo, 'IsSOTrx') === 'Y';             // :95
      var pstmt = R.DB.prepareStatement(sql);
      pstmt.setInt(1, C_BPartner_ID);
      var rs = pstmt.executeQuery();
      if (rs.next()) {
        var s = rs.getString(IsSOTrx ? 'PaymentRule' : 'PaymentRulePO');             // :106-111 PaymentRule
        if (s != null && s.length !== 0) mTab.setValue('PaymentRule', s);
        if (/C$/.test(Env.getContext(ctx, WindowNo, 'DocBaseType'))) s = 'P';         // Credits (value unused, as in Java)
        var ii = rs.getInt(IsSOTrx ? 'C_PaymentTerm_ID' : 'PO_PaymentTerm_ID');       // :112-115 Payment Term
        if (!rs.wasNull()) mTab.setValue('C_PaymentTerm_ID', ii);
        var locID = rs.getInt('C_BPartner_Location_ID');                             // :117-130 Location
        if (String(C_BPartner_ID) === Env.getContext(ctx, WindowNo, Env.TAB_INFO, 'C_BPartner_ID')) {
          var loc = Env.getContext(ctx, WindowNo, Env.TAB_INFO, 'C_BPartner_Location_ID');
          if (loc.length > 0) locID = parseInt(loc, 10);
        }
        if (locID === 0) mTab.setValue('C_BPartner_Location_ID', null);
        else mTab.setValue('C_BPartner_Location_ID', locID);
        var contID = rs.getInt('AD_User_ID');                                        // :132-143 Contact
        if (String(C_BPartner_ID) === Env.getContext(ctx, WindowNo, Env.TAB_INFO, 'C_BPartner_ID')) {
          var cont = Env.getContext(ctx, WindowNo, Env.TAB_INFO, 'AD_User_ID');
          if (cont.length > 0) contID = parseInt(cont, 10);
        }
        if (contID === 0) mTab.setValue('AD_User_ID', null);
        else mTab.setValue('AD_User_ID', contID);
        if (IsSOTrx) {                                                              // :145-157 CreditAvailable
          var CreditLimit = Number(rs.getObject('SO_CreditLimit') || 0);
          if (CreditLimit !== 0) {
            var CreditAvailable = rs.getObject('CreditAvailable');
            if (!rs.wasNull() && Number(CreditAvailable) < 0) fireEE(mTab, 'CreditLimitOver', String(CreditAvailable), false);
          }
        }
      }
      setDocumentNo(ctx, WindowNo, mTab);                                            // :170-171
      return this.tax(ctx, WindowNo, mTab, mField, value);
    };

    // docType :184-188
    P.docType = function (ctx, WindowNo, mTab, mField, value) {
      setDocumentNo(ctx, WindowNo, mTab);
      return '';
    };

    // setDocumentNo :196-229
    function setDocumentNo(ctx, WindowNo, mTab) {
      var C_InvoiceBatch_ID = Env.getContextAsInt(ctx, WindowNo, 'C_InvoiceBatch_ID');           // Get last line
      var sql = 'SELECT COALESCE(MAX(C_InvoiceBatchLine_ID),0) FROM C_InvoiceBatchLine WHERE C_InvoiceBatch_ID=?';
      var C_InvoiceBatchLine_ID = R.DB.getSQLValue(null, sql, C_InvoiceBatch_ID);
      if (C_InvoiceBatchLine_ID === 0) return;
      var last = R.PO.get('C_InvoiceBatchLine', C_InvoiceBatchLine_ID);
      if (last == null) return;
      var C_DocType_ID = Env.getContextAsInt(ctx, WindowNo, 'C_DocType_ID');            // :206-211 Need to Increase when different DocType or BP
      var C_BPartner_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_ID');
      if (C_DocType_ID === (last.getC_DocType_ID() || 0) && C_BPartner_ID === (last.getC_BPartner_ID() || 0)) return;
      var oldDocNo = last.getDocumentNo();                                           // :213-228 New Number
      if (oldDocNo == null) return;
      var docNo = 0;
      if (/^[+-]?\d+$/.test(String(oldDocNo))) docNo = parseInt(oldDocNo, 10);       // Integer.parseInt, exception → 0
      if (docNo === 0) return;
      mTab.setValue('DocumentNo', String(docNo + 1));
    }

    // charge :242-273
    P.charge = function (ctx, WindowNo, mTab, mField, value) {
      var C_Charge_ID = value;
      if (C_Charge_ID == null || C_Charge_ID === 0) return '';
      var pstmt = R.DB.prepareStatement('SELECT ChargeAmt FROM C_Charge WHERE C_Charge_ID=?');
      pstmt.setInt(1, C_Charge_ID);
      var rs = pstmt.executeQuery();
      if (rs.next()) mTab.setValue('PriceEntered', rs.getBigDecimal(1));
      return this.tax(ctx, WindowNo, mTab, mField, value);
    };

    // tax :287-334
    P.tax = function (ctx, WindowNo, mTab, mField, value) {
      var column = mField.getColumnName();
      if (value == null) return '';
      var C_Charge_ID = 0;
      if (column === 'C_Charge_ID') C_Charge_ID = value;
      else C_Charge_ID = Env.getContextAsInt(ctx, WindowNo, 'C_Charge_ID');
      if (C_Charge_ID === 0) return this.amt(ctx, WindowNo, mTab, mField, value);   // :299-300
      var C_BPartner_Location_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_Location_ID');   // :302-305
      if (C_BPartner_Location_ID === 0) return this.amt(ctx, WindowNo, mTab, mField, value);
      var billDate = Env.getContextAsDate(ctx, WindowNo, 'DateInvoiced');            // :308-317
      var shipDate = billDate;
      var AD_Org_ID = Env.getContextAsInt(ctx, WindowNo, 'AD_Org_ID');
      var M_Warehouse_ID = Env.getContextAsInt(ctx, Env.M_WAREHOUSE_ID);
      var deliveryViaRule = getLineDeliveryViaRule(ctx, WindowNo, mTab);             // :321-325
      var dropshipLocationId = getDropShipLocationId(ctx, WindowNo, mTab);
      var C_Tax_ID = M().Core.getTaxLookup().get(ctx, 0, C_Charge_ID, billDate, shipDate,
        AD_Org_ID, M_Warehouse_ID, C_BPartner_Location_ID, C_BPartner_Location_ID, dropshipLocationId,
        Env.getContext(ctx, WindowNo, 'IsSOTrx') === 'Y', deliveryViaRule, null);
      if (C_Tax_ID === 0) fireEE(mTab, 'CLogger.retrieveError', '', true);            // :328-331
      else mTab.setValue('C_Tax_ID', C_Tax_ID);
      return this.amt(ctx, WindowNo, mTab, mField, value);
    };
    // getLineDeliveryViaRule :343-371
    function getLineDeliveryViaRule(ctx, windowNo, mTab) {
      if (mTab.getValue('C_InvoiceLine_ID') != null) {
        var C_InvoiceLine_ID = mTab.getValue('C_InvoiceLine_ID');
        if (C_InvoiceLine_ID > 0) {
          var il = R.PO.get('C_InvoiceLine', C_InvoiceLine_ID);
          var C_OrderLine_ID = il ? (il.getC_OrderLine_ID() || 0) : 0;
          if (C_OrderLine_ID > 0) { var ol = R.PO.get('C_OrderLine', C_OrderLine_ID); var o = ol ? R.PO.get('C_Order', ol.getC_Order_ID()) : null; return o ? o.getDeliveryViaRule() : null; }
          var M_InOutLine_ID = il ? (il.getM_InOutLine_ID() || 0) : 0;
          if (M_InOutLine_ID > 0) { var iol = R.PO.get('M_InOutLine', M_InOutLine_ID); var io = iol ? R.PO.get('M_InOut', iol.getM_InOut_ID()) : null; return io ? io.getDeliveryViaRule() : null; }
        }
      }
      if (mTab.getValue('C_Invoice_ID') != null) {
        var C_Invoice_ID = mTab.getValue('C_Invoice_ID');
        if (C_Invoice_ID > 0) {
          var inv = R.PO.get('C_Invoice', C_Invoice_ID);
          if (inv && (inv.getC_Order_ID() || 0) > 0) { var ord = R.PO.get('C_Order', inv.getC_Order_ID()); return ord ? ord.getDeliveryViaRule() : null; }
        }
      }
      return null;
    }
    // getDropShipLocationId :380-403
    function getDropShipLocationId(ctx, windowNo, mTab) {
      if (mTab.getValue('C_InvoiceLine_ID') != null) {
        var C_InvoiceLine_ID = mTab.getValue('C_InvoiceLine_ID');
        if (C_InvoiceLine_ID > 0) {
          var il = R.PO.get('C_InvoiceLine', C_InvoiceLine_ID);
          var C_OrderLine_ID = il ? (il.getC_OrderLine_ID() || 0) : 0;
          if (C_OrderLine_ID > 0) { var ol = R.PO.get('C_OrderLine', C_OrderLine_ID); var o = ol ? R.PO.get('C_Order', ol.getC_Order_ID()) : null; return o ? (o.getDropShip_Location_ID() || 0) : 0; }
        }
      }
      if (mTab.getValue('C_Invoice_ID') != null) {
        var C_Invoice_ID = mTab.getValue('C_Invoice_ID');
        if (C_Invoice_ID > 0) {
          var inv = R.PO.get('C_Invoice', C_Invoice_ID);
          if (inv && (inv.getC_Order_ID() || 0) > 0) { var ord = R.PO.get('C_Order', inv.getC_Order_ID()); return ord ? (ord.getDropShip_Location_ID() || 0) : 0; }
        }
      }
      return -1;
    }

    // amt :416-471
    P.amt = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var StdPrecision = 2;                                                          // :421 temporary
      var QtyEntered = mTab.getValue('QtyEntered');                                  // :423-430
      var PriceEntered = mTab.getValue('PriceEntered');
      if (QtyEntered == null) QtyEntered = Env.ZERO;
      if (PriceEntered == null) PriceEntered = Env.ZERO;
      var LineNetAmt = QtyEntered.multiply(PriceEntered);                            // :432-435 Line Net Amt
      if (LineNetAmt.scale() > StdPrecision) LineNetAmt = LineNetAmt.setScale(StdPrecision, RM.HALF_UP);
      var IsTaxIncluded = 'Y' === Env.getContext(ctx, WindowNo, 'IsTaxIncluded');    // :437-455 Calculate Tax Amount
      var TaxAmt = null;
      if (mField.getColumnName() === 'TaxAmt') TaxAmt = mTab.getValue('TaxAmt');
      else {
        var taxID = mTab.getValue('C_Tax_ID');
        if (taxID != null) {
          var tax = M().MTax.get(ctx, taxID);   // new MTax(ctx, C_Tax_ID, null)
          TaxAmt = M().MTax.calculateTax(tax, LineNetAmt, IsTaxIncluded, StdPrecision);
          mTab.setValue('TaxAmt', TaxAmt);
        }
      }
      if (TaxAmt == null) TaxAmt = Env.ZERO;                                         // :457-469
      if (IsTaxIncluded) { mTab.setValue('LineTotalAmt', LineNetAmt); mTab.setValue('LineNetAmt', LineNetAmt.subtract(TaxAmt)); }
      else { mTab.setValue('LineNetAmt', LineNetAmt); mTab.setValue('LineTotalAmt', LineNetAmt.add(TaxAmt)); }
      return '';
    };

    return CalloutInvoiceBatch;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

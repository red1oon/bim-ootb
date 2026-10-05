// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutInvoice.js — org.compiere.model.CalloutInvoice, ported verbatim (every method).
// Source: org.adempiere.base.callout/src/org/compiere/model/CalloutInvoice.java (iDempiere @87968daa73).
// bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE (scenarios/cp/CalloutInvoice.json).
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;

  // MTax.calculateTax (M/MTax.java:340-372) + isZeroTax :310-313 + getChildTaxes :247-266 — shared static form
  // calculateTax(tax, amount, taxIncluded, scale); defined only if tax.js has not (one implementation per responsibility).
  (function (R) {
    var M = R.M, Env = R.Env, RM = R.RM;
    M.MTax = M.MTax || {};
    if (!M.MTax.calculateTax) M.MTax.calculateTax = function (tax, amount, taxIncluded, scale) {
      var rate = tax.getRate() || Env.ZERO;
      if (rate.signum() === 0) return Env.ZERO;                                              // isZeroTax (Null Tax)
      var taxarray = tax.isSummary()
        ? R.PO.list('C_Tax', "Parent_Tax_ID=? AND IsActive='Y' AND AD_Client_ID=?", [tax.getC_Tax_ID(), tax.getAD_Client_ID()])
        : [tax];
      var t = Env.ZERO;
      taxarray.forEach(function (taxc) {
        var multiplier = (taxc.getRate() || Env.ZERO).divide(Env.ONEHUNDRED, 12, RM.HALF_UP);
        if (!taxIncluded) t = t.add(amount.multiply(multiplier).setScale(scale, RM.HALF_UP));
        else { multiplier = multiplier.add(Env.ONE); var base = amount.divide(multiplier, 12, RM.HALF_UP); t = t.add(amount.subtract(base).setScale(scale, RM.HALF_UP)); }
      });
      return t;
    };
    // MRole.getDefault(ctx) — the login role row (AD_Role by #AD_Role_ID), read-only
    M.MRole = M.MRole || {};
    if (!M.MRole.getDefault) M.MRole.getDefault = function (ctx) { return R.PO.get('AD_Role', Env.getAD_Role_ID(ctx)); };
  })(A.RUNTIME);

  A.defineCallout('org.compiere.model.CalloutInvoice', function (CalloutEngine, R) {
    var Env = R.Env, BD = R.BD, RM = R.RM, Timestamp = R.Timestamp;
    function M() { return R.M; }
    // mTab.fireDataStatusEEvent — a UI status line (not a field); logged when the host GridTab carries no status bar
    function fireEE(mTab, msg, info, isError) {
      if (typeof mTab.fireDataStatusEEvent === 'function') mTab.fireDataStatusEEvent(msg, info, isError);
      else R.log('§CALLOUT-STATUS ' + msg + (info ? ' ' + info : ''));
    }
    // GridTabWrapper.create(mTab, I_C_InvoiceLine.class) — a Java-shaped view of the current row
    function tabWrapper(mTab) {
      return new Proxy({ get_Value: function (c) { return mTab.getValue(c); } }, { get: function (t, p) {
        if (p in t) return t[p];
        if (typeof p !== 'string') return undefined;
        var m = /^get(.+)$/.exec(p); if (m) return function () { return mTab.getValue(m[1]); };
        m = /^is(.+)$/.exec(p); if (m) return function () { var v = mTab.getValue('Is' + m[1]); return v === true || v === 'Y'; };
        return undefined;
      } });
    }
    // BigDecimal.valueOf(double) = new BigDecimal(Double.toString(d))
    function valueOfDouble(d) { var t = String(d); if (/e/i.test(t)) t = Number(d).toFixed(20).replace(/0+$/, ''); if (!/\./.test(t)) t += '.0'; return BD.fromString(t); }
    function priceList(ctx, id) { return R.PO.get('M_PriceList', id); }          // new MPriceList(ctx, id, null)

    function CalloutInvoice() { CalloutEngine.call(this); }
    CalloutInvoice.prototype = Object.create(CalloutEngine.prototype);
    var P = CalloutInvoice.prototype;

    // docType :55-107
    P.docType = function (ctx, WindowNo, mTab, mField, value) {
      var C_DocType_ID = value;
      if (C_DocType_ID == null || C_DocType_ID === 0) return '';
      var sql = 'SELECT d.HasCharges,d.IsDocNoControlled,' +        // :61-67
        'd.DocBaseType, ' +
        's.AD_Sequence_ID ' +
        'FROM C_DocType d ' +
        'LEFT OUTER JOIN AD_Sequence s ON (d.DocNoSequence_ID=s.AD_Sequence_ID) ' +
        'WHERE C_DocType_ID=?';
      var pstmt = R.DB.prepareStatement(sql);
      pstmt.setInt(1, C_DocType_ID);
      var rs = pstmt.executeQuery();
      if (rs.next()) {
        Env.setContext(ctx, WindowNo, 'HasCharges', rs.getString('HasCharges'));     // :77-78 Charges
        if (rs.getString('IsDocNoControlled') === 'Y') {                               // :79-84 DocumentNo
          var AD_Sequence_ID = rs.getInt('AD_Sequence_ID');
          mTab.setValue('DocumentNo', M().MSequence.getPreliminaryNo(mTab, AD_Sequence_ID));
        }
        var s = rs.getString('DocBaseType');                                          // :85-87 DocBaseType
        Env.setContext(ctx, WindowNo, 'DocBaseType', s);
        if (s.indexOf('AP') === 0) mTab.setValue('PaymentRule', 'S');                 // :88-92 X_C_Invoice.PAYMENTRULE_Check
        else if (/C$/.test(s)) mTab.setValue('PaymentRule', 'P');                     //        PAYMENTRULE_OnCredit
      }
      return '';
    };

    // bPartner :119-280
    P.bPartner = function (ctx, WindowNo, mTab, mField, value) {
      var C_BPartner_ID = value;
      if (C_BPartner_ID == null || C_BPartner_ID === 0) return '';
      var sql = 'SELECT p.AD_Language,p.C_PaymentTerm_ID,' +           // :125-138
        ' COALESCE(p.M_PriceList_ID,g.M_PriceList_ID) AS M_PriceList_ID, p.PaymentRule,p.POReference,' +
        ' p.SO_Description,p.IsDiscountPrinted,' +
        ' p.SO_CreditLimit, p.SO_CreditLimit-p.SO_CreditUsed AS CreditAvailable,' +
        " (select max(lbill.C_BPartner_Location_ID) from C_BPartner_Location lbill where p.C_BPartner_ID=lbill.C_BPartner_ID AND lbill.IsBillTo='Y' AND lbill.IsActive='Y') AS C_BPartner_Location_ID," +
        " (select max(c.AD_User_ID) from AD_User c where p.C_BPartner_ID=c.C_BPartner_ID AND c.IsActive='Y') as AD_User_ID," +
        " (select max(c.AD_User_ID) from AD_User c where p.C_BPartner_ID=c.C_BPartner_ID AND c.IsActive='Y' AND IsBillTo='Y') as BillTo_User_ID," +
        ' COALESCE(p.PO_PriceList_ID,g.PO_PriceList_ID) AS PO_PriceList_ID, p.PaymentRulePO,p.PO_PaymentTerm_ID, p.SalesRep_ID ' +
        'FROM C_BPartner p' +
        ' INNER JOIN C_BP_Group g ON (p.C_BP_Group_ID=g.C_BP_Group_ID)' +
        "WHERE p.C_BPartner_ID=? AND p.IsActive='Y'";
      var IsSOTrx = Env.getContext(ctx, WindowNo, 'IsSOTrx') === 'Y';             // :140
      var pstmt = R.DB.prepareStatement(sql);
      pstmt.setInt(1, C_BPartner_ID);
      var rs = pstmt.executeQuery();
      if (rs.next()) {
        var salesRep = rs.getInt('SalesRep_ID');                                     // :151-156 Sales Rep
        if (IsSOTrx && salesRep !== 0) mTab.setValue('SalesRep_ID', salesRep);
        var ii = rs.getInt(IsSOTrx ? 'M_PriceList_ID' : 'PO_PriceList_ID');          // :158-177 PriceList
        if (!rs.wasNull()) mTab.setValue('M_PriceList_ID', ii);
        else {
          var i = Env.getContextAsInt(ctx, '#M_PriceList_ID');                       // Env.M_PRICELIST_ID
          if (i !== 0) {
            var pl = priceList(ctx, i);
            if (IsSOTrx === (pl != null && pl.isSOPriceList())) mTab.setValue('M_PriceList_ID', i);
            else {
              var sql2 = "SELECT M_PriceList_ID FROM M_PriceList WHERE AD_Client_ID=? AND IsSOPriceList=? AND IsActive='Y' ORDER BY IsDefault DESC";
              ii = R.DB.getSQLValue(null, sql2, Env.getAD_Client_ID(ctx), IsSOTrx);
              if (ii !== 0) mTab.setValue('M_PriceList_ID', ii);
            }
          }
        }
        var s = rs.getString(IsSOTrx ? 'PaymentRule' : 'PaymentRulePO');             // :179-184 PaymentRule
        if (s != null && s.length !== 0) mTab.setValue('PaymentRule', s);
        if (/C$/.test(Env.getContext(ctx, WindowNo, 'DocBaseType'))) s = 'P';         // Credits are Payment Term (value unused, as in Java)
        ii = rs.getInt(IsSOTrx ? 'C_PaymentTerm_ID' : 'PO_PaymentTerm_ID');           // :185-188 Payment Term
        if (!rs.wasNull()) mTab.setValue('C_PaymentTerm_ID', ii);
        var locID = rs.getInt('C_BPartner_Location_ID');                             // :190-203 Location
        if (String(C_BPartner_ID) === Env.getContext(ctx, WindowNo, Env.TAB_INFO, 'C_BPartner_ID')) {
          var loc = Env.getContext(ctx, WindowNo, Env.TAB_INFO, 'C_BPartner_Location_ID');
          if (loc.length > 0) locID = parseInt(loc, 10);
        }
        if (locID === 0) mTab.setValue('C_BPartner_Location_ID', null);
        else mTab.setValue('C_BPartner_Location_ID', locID);
        var contID = rs.getInt('AD_User_ID');                                        // :205-220 Contact
        if (String(C_BPartner_ID) === Env.getContext(ctx, WindowNo, Env.TAB_INFO, 'C_BPartner_ID')) {
          var cont = Env.getContext(ctx, WindowNo, Env.TAB_INFO, 'AD_User_ID');
          if (cont.length > 0) contID = parseInt(cont, 10);
        }
        var BillTo_User_ID = rs.getInt('BillTo_User_ID');
        if (contID === 0) mTab.setValue('AD_User_ID', null);
        else mTab.setValue('AD_User_ID', BillTo_User_ID > 0 ? BillTo_User_ID : contID);
        if (IsSOTrx) {                                                              // :222-233 CreditAvailable
          var CreditLimit = Number(rs.getObject('SO_CreditLimit') || 0);
          if (CreditLimit !== 0) {
            var CreditAvailable = rs.getObject('CreditAvailable');
            if (!rs.wasNull() && Number(CreditAvailable) < 0) fireEE(mTab, 'CreditLimitOver', String(CreditAvailable), false);
          }
        }
        s = rs.getString('POReference');                                             // :235-238 PO Reference
        if (s != null && s.length !== 0) mTab.setValue('POReference', s);
        s = rs.getString('SO_Description');                                          // :239-242 SO Description
        if (s != null && s.trim().length !== 0) mTab.setValue('Description', s);
        s = rs.getString('IsDiscountPrinted');                                       // :243-248 IsDiscountPrinted
        if (s != null && s.length !== 0) mTab.setValue('IsDiscountPrinted', s);
        else mTab.setValue('IsDiscountPrinted', 'N');
      }
      return '';
    };

    // paymentTerm :282-300 (@Deprecated since 13, still declared → ported)
    P.paymentTerm = function (ctx, WindowNo, mTab, mField, value) {
      var C_PaymentTerm_ID = value;
      var C_Invoice_ID = Env.getContextAsInt(ctx, WindowNo, 'C_Invoice_ID');
      if (C_PaymentTerm_ID == null || C_PaymentTerm_ID === 0 || C_Invoice_ID === 0) return '';   // not saved yet
      var pt = R.PO.get('C_PaymentTerm', C_PaymentTerm_ID);
      if (pt == null) return 'PaymentTerm not found';
      // MPaymentTerm.apply(C_Invoice_ID) writes C_InvoicePaySchedule rows — a model write, never from the callout layer
      R.unportedDep('CalloutInvoice.paymentTerm', 'MPaymentTerm.apply (writes C_InvoicePaySchedule)');
      return '';
    };

    // product :316-373
    P.product = function (ctx, WindowNo, mTab, mField, value) {
      var M_Product_ID = value;
      if (M_Product_ID == null || M_Product_ID === 0) return '';
      mTab.setValue('C_Charge_ID', null);                                            // :321
      if (Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_Product_ID') === M_Product_ID          // :323-328 Set Attribute
        && Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_AttributeSetInstance_ID') !== 0)
        mTab.setValue('M_AttributeSetInstance_ID', Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_AttributeSetInstance_ID'));
      else mTab.setValue('M_AttributeSetInstance_ID', 0);
      var IsSOTrx = Env.getContext(ctx, WindowNo, 'IsSOTrx') === 'Y';              // :331-339 Price
      var C_BPartner_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_ID');
      var Qty = mTab.getValue('QtyInvoiced');
      var pp = M().Core.getProductPricing();
      pp.setInitialValues(M_Product_ID, C_BPartner_ID, Qty, IsSOTrx, null);
      var invoiceDate = Env.getContextAsDate(ctx, WindowNo, 'DateInvoiced');
      pp.setPriceDate(invoiceDate);
      pp.setInvoiceLine(tabWrapper(mTab), null);
      var M_PriceList_ID = Env.getContextAsInt(ctx, WindowNo, 'M_PriceList_ID');   // :342-343
      pp.setM_PriceList_ID(M_PriceList_ID);
      var M_PriceList_Version_ID = Env.getContextAsInt(ctx, WindowNo, 'M_PriceList_Version_ID');   // :346-359
      if (M_PriceList_Version_ID === 0 && M_PriceList_ID > 0) {
        var sql = 'SELECT plv.M_PriceList_Version_ID ' +
          'FROM M_PriceList_Version plv ' +
          'WHERE plv.M_PriceList_ID=? ' +
          ' AND plv.ValidFrom <= ? ' +
          'ORDER BY plv.ValidFrom DESC';
        M_PriceList_Version_ID = R.DB.getSQLValueEx(null, sql, M_PriceList_ID, invoiceDate);
        if (M_PriceList_Version_ID > 0) Env.setContext(ctx, WindowNo, 'M_PriceList_Version_ID', M_PriceList_Version_ID);
      }
      pp.setM_PriceList_Version_ID(M_PriceList_Version_ID);                          // :361
      mTab.setValue('PriceList', pp.getPriceList());                                 // :363-370
      mTab.setValue('PriceLimit', pp.getPriceLimit());
      mTab.setValue('PriceActual', pp.getPriceStd());
      mTab.setValue('PriceEntered', pp.getPriceStd());
      mTab.setValue('C_Currency_ID', pp.getC_Currency_ID());
      mTab.setValue('C_UOM_ID', pp.getC_UOM_ID());
      Env.setContext(ctx, WindowNo, 'EnforcePriceLimit', pp.isEnforcePriceLimit() ? 'Y' : 'N');
      Env.setContext(ctx, WindowNo, 'DiscountSchema', pp.isDiscountSchema() ? 'Y' : 'N');
      return this.tax(ctx, WindowNo, mTab, mField, value);                           // :372
    };

    // charge :387-433
    P.charge = function (ctx, WindowNo, mTab, mField, value) {
      var C_Charge_ID = value;
      if (C_Charge_ID == null || C_Charge_ID === 0) return '';
      if (mTab.getValue('M_Product_ID') != null) {                                   // :393-398 No Product defined
        mTab.setValue('C_Charge_ID', null);
        return 'ChargeExclusively';
      }
      mTab.setValue('M_AttributeSetInstance_ID', null);                              // :399-403
      mTab.setValue('S_ResourceAssignment_ID', null);
      mTab.setValue('C_UOM_ID', 100);                                                // SystemIDs.C_UOM_EACH — EA
      Env.setContext(ctx, WindowNo, 'DiscountSchema', 'N');
      var pstmt = R.DB.prepareStatement('SELECT ChargeAmt FROM C_Charge WHERE C_Charge_ID=?');   // :404-419
      pstmt.setInt(1, C_Charge_ID);
      var rs = pstmt.executeQuery();
      if (rs.next()) {
        mTab.setValue('PriceEntered', rs.getBigDecimal(1));
        mTab.setValue('PriceActual', rs.getBigDecimal(1));
        mTab.setValue('PriceLimit', Env.ZERO);
        mTab.setValue('PriceList', Env.ZERO);
        mTab.setValue('Discount', Env.ZERO);
      }
      return this.tax(ctx, WindowNo, mTab, mField, value);                           // :432
    };

    // tax :448-503
    P.tax = function (ctx, WindowNo, mTab, mField, value) {
      var column = mField.getColumnName();
      if (value == null) return '';
      var M_Product_ID = 0;                                                          // :454-459 Check Product
      if (column === 'M_Product_ID') M_Product_ID = value;
      else M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      var C_Charge_ID = 0;                                                           // :460-464
      if (column === 'C_Charge_ID') C_Charge_ID = value;
      else C_Charge_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_Charge_ID');
      if (M_Product_ID === 0 && C_Charge_ID === 0) return this.amt(ctx, WindowNo, mTab, mField, value);   // :466-467
      var shipC_BPartner_Location_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_Location_ID');     // :469-474 Check Partner Location
      if (shipC_BPartner_Location_ID === 0) return this.amt(ctx, WindowNo, mTab, mField, value);
      var billC_BPartner_Location_ID = shipC_BPartner_Location_ID;
      var billDate = Env.getContextAsDate(ctx, WindowNo, 'DateInvoiced');            // :477-481 Dates
      var shipDate = billDate;
      var AD_Org_ID = Env.getContextAsInt(ctx, WindowNo, 'AD_Org_ID');                // :483
      var M_Warehouse_ID = Env.getContextAsInt(ctx, Env.M_WAREHOUSE_ID);              // :486
      var deliveryViaRule = getLineDeliveryViaRule(ctx, WindowNo, mTab);             // :490-494
      var dropshipLocationId = getDropShipLocationId(ctx, WindowNo, mTab);
      var C_Tax_ID = M().Core.getTaxLookup().get(ctx, M_Product_ID, C_Charge_ID, billDate, shipDate,
        AD_Org_ID, M_Warehouse_ID, billC_BPartner_Location_ID, shipC_BPartner_Location_ID, dropshipLocationId,
        Env.getContext(ctx, WindowNo, 'IsSOTrx') === 'Y', deliveryViaRule, null);
      if (C_Tax_ID === 0) fireEE(mTab, 'CLogger.retrieveError', '', true);            // :497-500
      else mTab.setValue('C_Tax_ID', C_Tax_ID);
      return this.amt(ctx, WindowNo, mTab, mField, value);                           // :502
    };
    // getLineDeliveryViaRule :512-533
    function getLineDeliveryViaRule(ctx, windowNo, mTab) {
      if (mTab.getValue('C_OrderLine_ID') != null) {
        var C_OrderLine_ID = mTab.getValue('C_OrderLine_ID');
        if (C_OrderLine_ID > 0) {
          var ol = R.PO.get('C_OrderLine', C_OrderLine_ID);
          var o = ol ? R.PO.get('C_Order', ol.getC_Order_ID()) : null;
          return o ? o.getDeliveryViaRule() : null;
        }
      }
      if (mTab.getValue('M_InOutLine_ID') != null) {
        var M_InOutLine_ID = mTab.getValue('M_InOutLine_ID');
        if (M_InOutLine_ID > 0) {
          var iol = R.PO.get('M_InOutLine', M_InOutLine_ID);
          var io = iol ? R.PO.get('M_InOut', iol.getM_InOut_ID()) : null;
          return io ? io.getDeliveryViaRule() : null;
        }
      }
      var C_Order_ID = Env.getContextAsInt(ctx, windowNo, 'C_Order_ID', true);
      if (C_Order_ID > 0) { var ord = R.PO.get('C_Order', C_Order_ID); return ord ? ord.getDeliveryViaRule() : null; }
      return null;
    }
    // getDropShipLocationId :542-556
    function getDropShipLocationId(ctx, windowNo, mTab) {
      if (mTab.getValue('C_OrderLine_ID') != null) {
        var C_OrderLine_ID = mTab.getValue('C_OrderLine_ID');
        if (C_OrderLine_ID > 0) {
          var ol = R.PO.get('C_OrderLine', C_OrderLine_ID);
          var o = ol ? R.PO.get('C_Order', ol.getC_Order_ID()) : null;
          return o ? (o.getDropShip_Location_ID() || 0) : 0;
        }
      }
      var C_Order_ID = Env.getContextAsInt(ctx, windowNo, 'C_Order_ID', true);
      if (C_Order_ID > 0) { var ord = R.PO.get('C_Order', C_Order_ID); return ord ? (ord.getDropShip_Location_ID() || 0) : 0; }
      return -1;
    }

    // amt :569-731
    P.amt = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var C_UOM_To_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_UOM_ID');   // :574-579
      var M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      var M_PriceList_ID = Env.getContextAsInt(ctx, WindowNo, 'M_PriceList_ID');
      var StdPrecision = M().MPriceList.getStandardPrecision(ctx, M_PriceList_ID);
      var pl = priceList(ctx, M_PriceList_ID);
      var isEnforcePriceLimit = pl != null && pl.isEnforcePriceLimit();
      var QtyEntered, QtyInvoiced, PriceEntered, PriceActual, PriceLimit, Discount, PriceList;
      QtyEntered = mTab.getValue('QtyEntered');                                      // :582-589 get values
      QtyInvoiced = mTab.getValue('QtyInvoiced');
      PriceEntered = mTab.getValue('PriceEntered');
      PriceActual = mTab.getValue('PriceActual');
      PriceLimit = mTab.getValue('PriceLimit');
      PriceList = mTab.getValue('PriceList');
      var col = mField.getColumnName();
      if (M_Product_ID === 0) {                                                      // :595-610 No Product
        if (col === 'PriceActual') { PriceEntered = value; mTab.setValue('PriceEntered', value); }
        else if (col === 'PriceEntered') { PriceActual = value; mTab.setValue('PriceActual', value); }
      }
      else if ((col === 'QtyInvoiced' || col === 'QtyEntered' || col === 'C_UOM_ID' || col === 'M_Product_ID')   // :611-646 Product Qty changed - recalc price
        && 'N' !== Env.getContext(ctx, WindowNo, 'DiscountSchema')) {
        var C_BPartner_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_ID');
        if (col === 'QtyEntered') QtyInvoiced = M().MUOMConversion.convertProductFrom(ctx, M_Product_ID, C_UOM_To_ID, QtyEntered);
        if (QtyInvoiced == null) QtyInvoiced = QtyEntered;
        var IsSOTrx = Env.getContext(ctx, WindowNo, 'IsSOTrx') === 'Y';
        var pp = M().Core.getProductPricing();
        pp.setInitialValues(M_Product_ID, C_BPartner_ID, QtyInvoiced, IsSOTrx, null);
        var date = mTab.getValue('DateInvoiced');
        pp.setPriceDate(date);
        pp.setInvoiceLine(tabWrapper(mTab), null);
        pp.setM_PriceList_ID(M_PriceList_ID);
        var M_PriceList_Version_ID = Env.getContextAsInt(ctx, WindowNo, 'M_PriceList_Version_ID');
        pp.setM_PriceList_Version_ID(M_PriceList_Version_ID);
        PriceEntered = M().MUOMConversion.convertProductFrom(ctx, M_Product_ID, C_UOM_To_ID, pp.getPriceStd(), 12);
        if (PriceEntered == null) PriceEntered = pp.getPriceStd();
        PriceActual = pp.getPriceStd();
        mTab.setValue('PriceActual', pp.getPriceStd());
        mTab.setValue('PriceEntered', PriceEntered);
        Env.setContext(ctx, WindowNo, 'DiscountSchema', pp.isDiscountSchema() ? 'Y' : 'N');
      }
      else if (col === 'PriceActual') {                                             // :647-658
        PriceActual = value;
        PriceEntered = M().MUOMConversion.convertProductFrom(ctx, M_Product_ID, C_UOM_To_ID, PriceActual, 12);
        if (PriceEntered == null) PriceEntered = PriceActual;
        mTab.setValue('PriceEntered', PriceEntered);
      }
      else if (col === 'PriceEntered') {                                            // :659-670
        PriceEntered = value;
        PriceActual = M().MUOMConversion.convertProductTo(ctx, M_Product_ID, C_UOM_To_ID, PriceEntered, 12);
        if (PriceActual == null) PriceActual = PriceEntered;
        mTab.setValue('PriceActual', PriceActual);
      }
      var epl = Env.getContext(ctx, WindowNo, 'EnforcePriceLimit');                  // :672-676 Check PriceLimit
      var enforce = Env.isSOTrx(ctx, WindowNo) && epl != null && epl !== '' ? epl === 'Y' : isEnforcePriceLimit;
      if (enforce && M().MRole.getDefault(ctx).isOverwritePriceLimit()) enforce = false;
      if (enforce && Number(PriceLimit.toString()) !== 0.0 && PriceActual.compareTo(PriceLimit) < 0) {   // :678-697
        PriceActual = PriceLimit;
        PriceEntered = M().MUOMConversion.convertProductFrom(ctx, M_Product_ID, C_UOM_To_ID, PriceLimit, 12);
        if (PriceEntered == null) PriceEntered = PriceLimit;
        mTab.setValue('PriceActual', PriceLimit);
        mTab.setValue('PriceEntered', PriceEntered);
        fireEE(mTab, 'UnderLimitPrice', '', false);
        if (PriceList.compareTo(Env.ZERO) !== 0) {                                   // Repeat Discount calc (value unused, as in Java)
          Discount = valueOfDouble((Number(PriceList.toString()) - Number(PriceActual.toString())) / Number(PriceList.toString()) * 100.0);
          if (Discount.scale() > 2) Discount = Discount.setScale(2, RM.HALF_UP);
        }
      }
      var LineNetAmt = QtyEntered.multiply(PriceEntered);                            // :699-704 Line Net Amt
      if (LineNetAmt.scale() > StdPrecision) LineNetAmt = LineNetAmt.setScale(StdPrecision, RM.HALF_UP);
      mTab.setValue('LineNetAmt', LineNetAmt);
      var IsSOTrx2 = 'Y' === Env.getContext(ctx, WindowNo, 'IsSOTrx');               // :706-728 Calculate Tax Amount for PO
      if (!IsSOTrx2) {
        var TaxAmt = Env.ZERO;
        if (col === 'TaxAmt') TaxAmt = mTab.getValue('TaxAmt');
        else {
          var taxID = mTab.getValue('C_Tax_ID');
          if (taxID != null) {
            var tax = M().MTax.get(ctx, taxID);   // new MTax(ctx, C_Tax_ID, null)
            TaxAmt = M().MTax.calculateTax(tax, LineNetAmt, isTaxIncluded(ctx, WindowNo), StdPrecision);
            mTab.setValue('TaxAmt', TaxAmt);
          }
        }
        mTab.setValue('LineTotalAmt', LineNetAmt.add(TaxAmt));                       // Add it up
      }
      return '';
    };
    // isTaxIncluded :738-755 (Env.getCtx() is this session's ctx)
    function isTaxIncluded(ctx, WindowNo) {
      var ss = Env.getContext(ctx, WindowNo, 'IsTaxIncluded');
      if (ss.length === 0) {
        var M_PriceList_ID = Env.getContextAsInt(ctx, WindowNo, 'M_PriceList_ID');
        if (M_PriceList_ID === 0) return false;
        ss = R.DB.getSQLValueString(null, 'SELECT IsTaxIncluded FROM M_PriceList WHERE M_PriceList_ID=?', M_PriceList_ID);
        if (ss == null) ss = 'N';
        Env.setContext(ctx, WindowNo, 'IsTaxIncluded', ss);
      }
      return 'Y' === ss;
    }

    // qty :768-866
    P.qty = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      var QtyInvoiced, QtyEntered, PriceActual, PriceEntered, C_UOM_To_ID, QtyEntered1, conversion;
      var col = mField.getColumnName();
      if (M_Product_ID === 0) {                                                      // :776-781 No Product
        QtyEntered = mTab.getValue('QtyEntered');
        mTab.setValue('QtyInvoiced', QtyEntered);
      }
      else if (col === 'C_UOM_ID') {                                                // :782-812 UOM Changed
        C_UOM_To_ID = value;
        QtyEntered = mTab.getValue('QtyEntered');
        QtyEntered1 = QtyEntered.setScale(M().MUOM.getPrecision(ctx, C_UOM_To_ID), RM.HALF_UP);
        if (QtyEntered.compareTo(QtyEntered1) !== 0) { QtyEntered = QtyEntered1; mTab.setValue('QtyEntered', QtyEntered); }
        QtyInvoiced = M().MUOMConversion.convertProductFrom(ctx, M_Product_ID, C_UOM_To_ID, QtyEntered);
        if (QtyInvoiced == null) QtyInvoiced = QtyEntered;
        conversion = QtyEntered.compareTo(QtyInvoiced) !== 0;
        PriceActual = mTab.getValue('PriceActual');
        PriceEntered = M().MUOMConversion.convertProductFrom(ctx, M_Product_ID, C_UOM_To_ID, PriceActual, 12);
        if (PriceEntered == null) PriceEntered = PriceActual;
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
        mTab.setValue('QtyInvoiced', QtyInvoiced);
        mTab.setValue('PriceEntered', PriceEntered);
      }
      else if (col === 'QtyEntered') {                                              // :813-837 QtyEntered changed
        C_UOM_To_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_UOM_ID');
        QtyEntered = value;
        QtyEntered1 = QtyEntered.setScale(M().MUOM.getPrecision(ctx, C_UOM_To_ID), RM.HALF_UP);
        if (QtyEntered.compareTo(QtyEntered1) !== 0) { QtyEntered = QtyEntered1; mTab.setValue('QtyEntered', QtyEntered); }
        QtyInvoiced = M().MUOMConversion.convertProductFrom(ctx, M_Product_ID, C_UOM_To_ID, QtyEntered);
        if (QtyInvoiced == null) QtyInvoiced = QtyEntered;
        conversion = QtyEntered.compareTo(QtyInvoiced) !== 0;
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
        mTab.setValue('QtyInvoiced', QtyInvoiced);
      }
      else if (col === 'QtyInvoiced') {                                             // :838-863 QtyInvoiced changed
        C_UOM_To_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_UOM_ID');
        QtyInvoiced = value;
        var prodUOM = M().MProduct.get(ctx, M_Product_ID).getC_UOM_ID() || 0;         // MProduct.getUOMPrecision() :520-531
        var precision = prodUOM === 0 ? 0 : M().MUOM.getPrecision(ctx, prodUOM);
        var QtyInvoiced1 = QtyInvoiced.setScale(precision, RM.HALF_UP);
        if (QtyInvoiced.compareTo(QtyInvoiced1) !== 0) { QtyInvoiced = QtyInvoiced1; mTab.setValue('QtyInvoiced', QtyInvoiced); }
        QtyEntered = M().MUOMConversion.convertProductTo(ctx, M_Product_ID, C_UOM_To_ID, QtyInvoiced);
        if (QtyEntered == null) QtyEntered = QtyInvoiced;
        conversion = QtyInvoiced.compareTo(QtyEntered) !== 0;
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
        mTab.setValue('QtyEntered', QtyEntered);
      }
      return '';
    };

    // navigateInvoiceLine :868-909
    P.navigateInvoiceLine = function (ctx, WindowNo, mTab, mField, value) {
      var M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      if (M_Product_ID == null || M_Product_ID === 0) { Env.setContext(ctx, WindowNo, 'DiscountSchema', 'N'); return ''; }
      var C_BPartner_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_ID');       // :876-884
      var Qty = mTab.getValue('QtyOrdered');
      var IsSOTrx = Env.getContext(ctx, WindowNo, 'IsSOTrx') === 'Y';
      var pp = M().Core.getProductPricing();
      pp.setInitialValues(M_Product_ID, C_BPartner_ID, Qty, IsSOTrx, null);
      var orderDate = mTab.getValue('DateOrdered');
      pp.setPriceDate(orderDate);
      pp.setInvoiceLine(tabWrapper(mTab), null);
      var M_PriceList_ID = Env.getContextAsInt(ctx, WindowNo, 'M_PriceList_ID');     // :886-903
      pp.setM_PriceList_ID(M_PriceList_ID);
      var M_PriceList_Version_ID = Env.getContextAsInt(ctx, WindowNo, 'M_PriceList_Version_ID');
      if (M_PriceList_Version_ID === 0 && M_PriceList_ID > 0) {
        var sql = 'SELECT plv.M_PriceList_Version_ID ' +
          'FROM M_PriceList_Version plv ' +
          'WHERE plv.M_PriceList_ID=? ' +
          ' AND plv.ValidFrom <= ? ' +
          'ORDER BY plv.ValidFrom DESC';
        M_PriceList_Version_ID = R.DB.getSQLValueEx(null, sql, M_PriceList_ID, orderDate);
        if (M_PriceList_Version_ID > 0) Env.setContext(ctx, WindowNo, 'M_PriceList_Version_ID', M_PriceList_Version_ID);
      }
      pp.setM_PriceList_Version_ID(M_PriceList_Version_ID);
      Env.setContext(ctx, WindowNo, 'EnforcePriceLimit', pp.isEnforcePriceLimit() ? 'Y' : 'N');   // :905-906
      Env.setContext(ctx, WindowNo, 'DiscountSchema', pp.isDiscountSchema() ? 'Y' : 'N');
      return '';
    };

    return CalloutInvoice;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

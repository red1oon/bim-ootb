// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutOrder.js — org.compiere.model.CalloutOrder, ported verbatim (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP —
// Witness: W-CP-CALLOUT-ORACLE, scenarios/cp/CalloutOrder.json). Java: org.adempiere.base.callout/src/org/compiere/model/CalloutOrder.java.
// Every method body keeps the Java branches and order; a branch needing an unported dependency logs §CALLOUT-UNPORTED-DEP.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;

  A.defineCallout('org.compiere.model.CalloutOrder', function (CalloutEngine, R) {
    var BD = R.BD, RM = R.RM, Env = R.Env, Msg = R.Msg, M = R.M, Timestamp = R.Timestamp;
    var TAB_INFO = Env.TAB_INFO;

    // ── local helpers for the model statics this class calls (shared M.* preferred when present, resolved at call time) ──
    // BigDecimal.valueOf(double) — Java builds it from Double.toString(d): plain for 1e-3 <= |d| < 1e7 (always ≥1 fraction
    // digit, e.g. "100.0"), else "d.dddE±n"; the BigDecimal scale follows that text exactly.
    function valueOfDouble(d) {
      if (M.Java && M.Java.valueOfDouble) return M.Java.valueOfDouble(d);
      if (!isFinite(d)) throw new Error('java.lang.NumberFormatException: Infinite or NaN');
      if (d === 0) return BD.fromString(Object.is(d, -0) ? '0.0' : '0.0');
      var e = d.toExponential(), m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(e);
      var sign = m[1], digits = m[2] + (m[3] || ''), exp = Number(m[4]), ad = Math.abs(d), s;
      if (ad >= 1e-3 && ad < 1e7) {
        var pointPos = exp + 1;                                   // digits before the decimal point
        if (pointPos <= 0) s = '0.' + '0'.repeat(-pointPos) + digits;
        else if (pointPos >= digits.length) s = digits + '0'.repeat(pointPos - digits.length) + '.0';
        else s = digits.slice(0, pointPos) + '.' + digits.slice(pointPos);
        return BD.fromString(sign + s);
      }
      var frac = digits.slice(1) || '0';                          // Java sci mantissa d.ddd (≥1 fraction digit)
      var bd = BD.fromString(sign + digits.charAt(0) + '.' + frac);
      return new BD(bd.u, bd.s - exp);
    }
    function dbl(bd) { return bd == null ? 0 : Number(bd.toString()); }   // BigDecimal.doubleValue()
    function priceList(id) { return id ? R.PO.get('M_PriceList', id) : null; }              // MPriceList.get / new MPriceList
    function stdPrecision(M_PriceList_ID) {                                                  // MPriceList.getStandardPrecision :194-198 / :356-364
      if (M.MPriceList && typeof M.MPriceList.getStandardPrecision === 'function') return M.MPriceList.getStandardPrecision(null, M_PriceList_ID);
      var pl = priceList(M_PriceList_ID);
      if (!pl) throw new Error('java.lang.NullPointerException: MPriceList ' + M_PriceList_ID);
      var c = R.PO.get('C_Currency', pl.getC_Currency_ID());
      if (!c) throw new Error('java.lang.NullPointerException: MCurrency ' + pl.getC_Currency_ID());
      return c.get_ValueAsInt('StdPrecision');
    }
    function uomPrecision(C_UOM_ID) {                                                        // MUOM.getPrecision
      if (M.MUOM && typeof M.MUOM.getPrecision === 'function') return M.MUOM.getPrecision(null, C_UOM_ID);
      var u = R.PO.get('C_UOM', C_UOM_ID); return u ? u.get_ValueAsInt('StdPrecision') : 0;
    }
    function productUOMPrecision(M_Product_ID) {                                             // MProduct.getUOMPrecision
      var p = R.PO.get('M_Product', M_Product_ID); return p ? uomPrecision(p.getC_UOM_ID()) : 0;
    }
    function convFrom(ctx, pid, uom, qty, scale) {                                           // MUOMConversion.convertProductFrom
      var U = M.MUOMConversion;
      if (U && typeof U.convertProductFrom === 'function') return scale == null ? U.convertProductFrom(ctx, pid, uom, qty) : U.convertProductFrom(ctx, pid, uom, qty, scale);
      R.unportedDep('CalloutOrder', 'MUOMConversion.convertProductFrom (not loaded)'); return null;
    }
    function convTo(ctx, pid, uom, qty, scale) {                                             // MUOMConversion.convertProductTo
      var U = M.MUOMConversion;
      if (U && typeof U.convertProductTo === 'function') return scale == null ? U.convertProductTo(ctx, pid, uom, qty) : U.convertProductTo(ctx, pid, uom, qty, scale);
      R.unportedDep('CalloutOrder', 'MUOMConversion.convertProductTo (not loaded)'); return null;
    }
    function productPricing() {                                                              // Core.getProductPricing()
      if (M.Core && typeof M.Core.getProductPricing === 'function') return M.Core.getProductPricing();
      throw new Error('IProductPricing not loaded (Core.getProductPricing)');
    }
    // GridTabWrapper.create(mTab, I_C_OrderLine.class) — a read view of the tab's current row
    function orderLineWrapper(mTab) {
      return new Proxy({}, { get: function (t, p) {
        if (typeof p !== 'string') return undefined;
        var m = /^get(.+)$/.exec(p); if (m) return function () { return mTab.getValue(m[1]); };
        m = /^is(.+)$/.exec(p); if (m) return function () { var v = mTab.getValue('Is' + m[1]); return v === true || v === 'Y'; };
        return undefined;
      } });
    }
    // MSequence.getPreliminaryNo :1298-1353
    function getPreliminaryNo(tab, AD_Sequence_ID) {
      var prelim = null;
      if (AD_Sequence_ID > 0) {
        var seq = R.PO.get('AD_Sequence', AD_Sequence_ID);
        var currentNext = seq ? seq.get_ValueAsInt('CurrentNext') : 0;
        if (seq && seq.isSequenceNoLevel()) {
          R.unportedDep('MSequence.getPreliminaryNo', 'AD_Sequence_No (SequenceNoLevel key parts)');
        }
        var decimalPattern = seq ? seq.get_ValueAsString('DecimalPattern') : '';
        if (decimalPattern != null && decimalPattern.length > 0) { R.unportedDep('MSequence.getPreliminaryNo', 'DecimalFormat ' + decimalPattern); prelim = String(currentNext); }
        else prelim = String(currentNext);
      }
      if (prelim == null) prelim = '?';
      return '<' + prelim + '>';
    }

    function CalloutOrder() { CalloutEngine.call(this); this.steps = false; }
    CalloutOrder.prototype = Object.create(CalloutEngine.prototype);
    CalloutOrder.prototype.constructor = CalloutOrder;

    // ══ docType :66-235 ══
    CalloutOrder.prototype.docType = function (ctx, WindowNo, mTab, mField, value) {
      var C_DocType_ID = value;                                                      // :68 Actually C_DocTypeTarget_ID
      if (C_DocType_ID == null || C_DocType_ID === 0) return '';
      var oldDocNo = mTab.getValue('DocumentNo');                                    // :73-78 re-create DocNo
      var newDocNo = (oldDocNo == null);
      if (!newDocNo && oldDocNo.charAt(0) === '<' && oldDocNo.charAt(oldDocNo.length - 1) === '>') newDocNo = true;
      var oldC_DocType_ID = mTab.getValue('C_DocType_ID');
      var sql = 'SELECT d.DocSubTypeSO,d.HasCharges,' + 'd.IsDocNoControlled,' + 's.AD_Sequence_ID,d.IsSOTrx ' +   // :80-85
        'FROM C_DocType d ' + 'LEFT OUTER JOIN AD_Sequence s ON (d.DocNoSequence_ID=s.AD_Sequence_ID) ' + 'WHERE C_DocType_ID=?';
      var oldAD_Sequence_ID = 0, rs;
      if (!newDocNo && oldC_DocType_ID != null && oldC_DocType_ID !== 0) {          // :93-104 old AD_SeqNo for comparison
        rs = R.DB.prepareStatement(sql); rs.setInt(1, oldC_DocType_ID); rs = rs.executeQuery();
        if (rs.next()) oldAD_Sequence_ID = rs.getInt('AD_Sequence_ID');
      }
      var ps = R.DB.prepareStatement(sql); ps.setInt(1, C_DocType_ID); rs = ps.executeQuery();
      var DocSubTypeSO = '', IsSOTrx = true;
      if (rs.next()) {                                                               // :111 we found document type
        DocSubTypeSO = rs.getString('DocSubTypeSO');                                 // :114-117 context OrderType
        if (DocSubTypeSO == null) DocSubTypeSO = '--';
        Env.setContext(ctx, WindowNo, 'OrderType', DocSubTypeSO);
        if (DocSubTypeSO !== 'SO') mTab.setValue('IsDropShip', 'N');                 // :119-120 No Drop Ship other than Standard
        if (DocSubTypeSO === 'WR') mTab.setValue('DeliveryRule', 'F');               // :123-128 Delivery Rule
        else if (DocSubTypeSO === 'PR') mTab.setValue('DeliveryRule', 'R');
        else mTab.setValue('DeliveryRule', 'A');
        if (DocSubTypeSO === 'WR' || DocSubTypeSO === 'PR' || DocSubTypeSO === 'WI') mTab.setValue('InvoiceRule', 'I');   // :131-136 Invoice Rule
        else mTab.setValue('InvoiceRule', 'D');
        if (DocSubTypeSO === 'WR') mTab.setValue('PaymentRule', 'B');                // :139-142 Payment Rule - POS Order
        else mTab.setValue('PaymentRule', 'P');
        if ('N' === rs.getString('IsSOTrx')) IsSOTrx = false;                       // :145-146
        Env.setContext(ctx, WindowNo, 'HasCharges', rs.getString('HasCharges'));    // :149
        if (rs.getString('IsDocNoControlled') === 'Y') {                            // :152-160 DocumentNo
          if (!newDocNo && oldAD_Sequence_ID !== rs.getInt('AD_Sequence_ID')) newDocNo = true;
          if (newDocNo) { var AD_Sequence_ID = rs.getInt('AD_Sequence_ID'); mTab.setValue('DocumentNo', (M.MSequence && M.MSequence.getPreliminaryNo ? M.MSequence.getPreliminaryNo : getPreliminaryNo)(mTab, AD_Sequence_ID)); }
        }
      }
      // :170-174 When BPartner is changed, the Rules are not set if POS or Prepay — re-read and apply
      if (DocSubTypeSO === 'WR' || DocSubTypeSO === 'PR') {
        /* not for POS/PrePay */
      } else {
        sql = 'SELECT PaymentRule,C_PaymentTerm_ID,' + 'InvoiceRule,DeliveryRule,' + 'FreightCostRule,DeliveryViaRule, ' +   // :177-183
          'PaymentRulePO,PO_PaymentTerm_ID ' + 'FROM C_BPartner ' + 'WHERE C_BPartner_ID=?';
        ps = R.DB.prepareStatement(sql);
        var C_BPartner_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_ID');
        ps.setInt(1, C_BPartner_ID);
        rs = ps.executeQuery();
        if (rs.next()) {
          var s = rs.getString(IsSOTrx ? 'PaymentRule' : 'PaymentRulePO');          // :191-194 PaymentRule
          if (s != null && s.length !== 0) mTab.setValue('PaymentRule', s);
          var ii = rs.getInt(IsSOTrx ? 'C_PaymentTerm_ID' : 'PO_PaymentTerm_ID');    // :196-198 Payment Term
          if (!rs.wasNull()) mTab.setValue('C_PaymentTerm_ID', ii);
          s = rs.getString(3); if (s != null && s.length !== 0) mTab.setValue('InvoiceRule', s);        // :200-202
          s = rs.getString(4); if (s != null && s.length !== 0) mTab.setValue('DeliveryRule', s);       // :204-206
          s = rs.getString(5); if (s != null && s.length !== 0) mTab.setValue('FreightCostRule', s);    // :208-210
          s = rs.getString(6); if (s != null && s.length !== 0) mTab.setValue('DeliveryViaRule', s);    // :212-214
        }
      }
      return '';
    };

    // shared by bPartner :254-447 and bPartnerBill :460-640 — the default-price-list fallback (:286-302 / :492-508)
    function defaultPriceList(ctx, mTab, IsSOTrx) {
      var i = Env.getContextAsInt(ctx, '#M_PriceList_ID');
      if (i !== 0) {
        var pl = priceList(i);
        var isSO = pl ? pl.isSOPriceList() : false;
        if (IsSOTrx === isSO) mTab.setValue('M_PriceList_ID', i);
        else {
          var sql2 = "SELECT M_PriceList_ID FROM M_PriceList WHERE AD_Client_ID=? AND IsSOPriceList=? AND IsActive='Y' ORDER BY IsDefault DESC";
          var ii = R.DB.getSQLValue(null, sql2, Env.getAD_Client_ID(ctx), IsSOTrx);
          if (ii !== 0) mTab.setValue('M_PriceList_ID', ii);
        }
      }
    }
    function creditCheck(mTab, rs, IsSOTrx) {                                       // :363-374 / :569-580 CreditAvailable
      if (IsSOTrx) {
        var CreditLimit = dbl(rs.getBigDecimal('SO_CreditLimit'));
        if (CreditLimit !== 0) {
          var ca = rs.getBigDecimal('CreditAvailable');
          if (!rs.wasNull() && dbl(ca) < 0) mTab.fireDataStatusEEvent('CreditLimitOver', dbl(ca).toFixed(2), false);
        }
      }
    }

    // ══ bPartner :254-447 ══
    CalloutOrder.prototype.bPartner = function (ctx, WindowNo, mTab, mField, value) {
      var C_BPartner_ID = value;
      if (C_BPartner_ID == null || C_BPartner_ID === 0) return '';
      var sql = 'SELECT p.AD_Language,p.C_PaymentTerm_ID,' +                         // :259-276
        ' COALESCE(p.M_PriceList_ID,g.M_PriceList_ID) AS M_PriceList_ID, p.PaymentRule,p.POReference,' +
        ' p.SO_Description,p.IsDiscountPrinted,' +
        ' p.InvoiceRule,p.DeliveryRule,p.FreightCostRule,DeliveryViaRule,' +
        ' p.SO_CreditLimit, p.SO_CreditLimit-p.SO_CreditUsed AS CreditAvailable,' +
        " (select max(lship.C_BPartner_Location_ID) from C_BPartner_Location lship where p.C_BPartner_ID=lship.C_BPartner_ID AND lship.IsShipTo='Y' AND lship.IsActive='Y') as C_BPartner_Location_ID," +
        " (select max(c.AD_User_ID) from AD_User c where p.C_BPartner_ID=c.C_BPartner_ID AND c.IsActive='Y') as AD_User_ID," +
        " (select max(c.AD_User_ID) from AD_User c where p.C_BPartner_ID=c.C_BPartner_ID AND c.IsActive='Y' AND IsBillTo='Y') as BillTo_User_ID," +
        " (select max(c.AD_User_ID) from AD_User c where p.C_BPartner_ID=c.C_BPartner_ID AND c.IsActive='Y' AND IsShipTo='Y') as ShipTo_User_ID," +
        ' COALESCE(p.PO_PriceList_ID,g.PO_PriceList_ID) AS PO_PriceList_ID, p.PaymentRulePO,p.PO_PaymentTerm_ID,' +
        " (select max(lbill.C_BPartner_Location_ID) from C_BPartner_Location lbill where p.C_BPartner_ID=lbill.C_BPartner_ID AND lbill.IsBillTo='Y' AND lbill.IsActive='Y') AS Bill_Location_ID, " +
        ' p.SOCreditStatus, ' + ' p.SalesRep_ID ' + 'FROM C_BPartner p' +
        ' INNER JOIN C_BP_Group g ON (p.C_BP_Group_ID=g.C_BP_Group_ID)' + "WHERE p.C_BPartner_ID=? AND p.IsActive='Y'";
      var IsSOTrx = 'Y' === Env.getContext(ctx, WindowNo, 'IsSOTrx');               // :278
      var ps = R.DB.prepareStatement(sql); ps.setInt(1, C_BPartner_ID);
      var rs = ps.executeQuery();
      if (rs.next()) {
        var salesRep = rs.getInt('SalesRep_ID');                                     // :288-293 Sales Rep
        if (IsSOTrx && salesRep !== 0) mTab.setValue('SalesRep_ID', salesRep);
        var ii = rs.getInt(IsSOTrx ? 'M_PriceList_ID' : 'PO_PriceList_ID');         // :295-313 PriceList
        if (!rs.wasNull()) mTab.setValue('M_PriceList_ID', ii);
        else defaultPriceList(ctx, mTab, IsSOTrx);
        mTab.setValue('Bill_BPartner_ID', C_BPartner_ID);                            // :316 Bill-To
        var shipTo_ID = 0, bill_Location_ID = 0;
        if (String(C_BPartner_ID) === Env.getContext(ctx, WindowNo, TAB_INFO, 'C_BPartner_ID')) {   // :321-334 InfoBP selection
          var loc = Env.getContext(ctx, WindowNo, TAB_INFO, 'C_BPartner_Location_ID');
          var locationId = 0;
          if (loc.length > 0) locationId = parseInt(loc, 10);
          if (locationId > 0) {
            var bpLocation = R.PO.get('C_BPartner_Location', locationId);
            if (bpLocation && bpLocation.isBillTo()) bill_Location_ID = locationId;
            if (bpLocation && bpLocation.isShipTo()) shipTo_ID = locationId;
          }
        }
        if (bill_Location_ID === 0) bill_Location_ID = rs.getInt('Bill_Location_ID');   // :335-339
        if (bill_Location_ID === 0) mTab.setValue('Bill_Location_ID', null);
        else mTab.setValue('Bill_Location_ID', bill_Location_ID);
        if (shipTo_ID === 0) shipTo_ID = rs.getInt('C_BPartner_Location_ID');         // :341-347 Ship-To Location
        if (shipTo_ID === 0) mTab.setValue('C_BPartner_Location_ID', null);
        else mTab.setValue('C_BPartner_Location_ID', shipTo_ID);
        var contID = rs.getInt('AD_User_ID');                                         // :350-356 Contact
        if (String(C_BPartner_ID) === Env.getContext(ctx, WindowNo, TAB_INFO, 'C_BPartner_ID')) {
          var cont = Env.getContext(ctx, WindowNo, TAB_INFO, 'AD_User_ID');
          if (cont.length > 0) contID = parseInt(cont, 10);
        }
        var BillTo_User_ID = rs.getInt('BillTo_User_ID'), ShipTo_User_ID = rs.getInt('ShipTo_User_ID');   // :357-368
        if (contID === 0) { mTab.setValue('AD_User_ID', null); mTab.setValue('Bill_User_ID', null); }
        else {
          mTab.setValue('AD_User_ID', ShipTo_User_ID > 0 ? ShipTo_User_ID : contID);
          mTab.setValue('Bill_User_ID', BillTo_User_ID > 0 ? BillTo_User_ID : contID);
        }
        creditCheck(mTab, rs, IsSOTrx);                                               // :371-382 CreditAvailable
        var s = rs.getString('POReference');                                          // :385-387 PO Reference
        if (s != null && s.length !== 0) mTab.setValue('POReference', s);
        s = rs.getString('SO_Description');                                           // :389-391 SO Description
        if (s != null && s.trim().length !== 0) mTab.setValue('Description', s);
        s = rs.getString('IsDiscountPrinted');                                        // :393-397 IsDiscountPrinted
        if (s != null && s.length !== 0) mTab.setValue('IsDiscountPrinted', s);
        else mTab.setValue('IsDiscountPrinted', 'N');
        var OrderType = Env.getContext(ctx, WindowNo, 'OrderType');                  // :400-438 Defaults, if not WR/WI
        mTab.setValue('InvoiceRule', 'D');
        mTab.setValue('DeliveryRule', 'A');
        mTab.setValue('PaymentRule', 'P');
        if (OrderType === 'PR') { mTab.setValue('InvoiceRule', 'I'); mTab.setValue('DeliveryRule', 'R'); }
        else if (OrderType === 'WR') mTab.setValue('PaymentRule', 'B');
        else {
          s = rs.getString(IsSOTrx ? 'PaymentRule' : 'PaymentRulePO');
          if (s != null && s.length !== 0) mTab.setValue('PaymentRule', s);
          ii = rs.getInt(IsSOTrx ? 'C_PaymentTerm_ID' : 'PO_PaymentTerm_ID');
          if (!rs.wasNull()) mTab.setValue('C_PaymentTerm_ID', ii);
          s = rs.getString('InvoiceRule'); if (s != null && s.length !== 0) mTab.setValue('InvoiceRule', s);
          s = rs.getString('DeliveryRule'); if (s != null && s.length !== 0) mTab.setValue('DeliveryRule', s);
          s = rs.getString('FreightCostRule'); if (s != null && s.length !== 0) mTab.setValue('FreightCostRule', s);
          s = rs.getString('DeliveryViaRule'); if (s != null && s.length !== 0) mTab.setValue('DeliveryViaRule', s);
        }
      }
      return '';
    };

    // ══ bPartnerBill :460-640 ══
    CalloutOrder.prototype.bPartnerBill = function (ctx, WindowNo, mTab, mField, value) {
      var bill_BPartner_ID = value;
      if (bill_BPartner_ID == null || bill_BPartner_ID === 0) return '';
      var sql = 'SELECT p.AD_Language,p.C_PaymentTerm_ID,' + 'p.M_PriceList_ID,p.PaymentRule,p.POReference,' +   // :465-476
        'p.SO_Description,p.IsDiscountPrinted,' + 'p.InvoiceRule,p.DeliveryRule,p.FreightCostRule,DeliveryViaRule,' +
        'p.SO_CreditLimit, p.SO_CreditLimit-p.SO_CreditUsed AS CreditAvailable,' +
        "(select max(c.AD_User_ID) from AD_User c where p.C_BPartner_ID=c.C_BPartner_ID AND c.IsActive='Y') as AD_User_ID," +
        "(select max(c.AD_User_ID) from AD_User c where p.C_BPartner_ID=c.C_BPartner_ID AND c.IsActive='Y' AND IsBillTo='Y') as BillTo_User_ID," +
        'p.PO_PriceList_ID, p.PaymentRulePO, p.PO_PaymentTerm_ID,' +
        "(select max(lbill.C_BPartner_Location_ID) from C_BPartner_Location lbill where p.C_BPartner_ID=lbill.C_BPartner_ID AND lbill.IsBillTo='Y' AND lbill.IsActive='Y') AS Bill_Location_ID " +
        'FROM C_BPartner p ' + "WHERE p.C_BPartner_ID=? AND p.IsActive='Y'";
      var IsSOTrx = 'Y' === Env.getContext(ctx, WindowNo, 'IsSOTrx');
      var ps = R.DB.prepareStatement(sql); ps.setInt(1, bill_BPartner_ID);
      var rs = ps.executeQuery();
      if (rs.next()) {
        var ii = rs.getInt(IsSOTrx ? 'M_PriceList_ID' : 'PO_PriceList_ID');         // :488-509 PriceList
        if (!rs.wasNull()) mTab.setValue('M_PriceList_ID', ii);
        else defaultPriceList(ctx, mTab, IsSOTrx);
        var bill_Location_ID = rs.getInt('Bill_Location_ID');                        // :511-528
        if (String(bill_BPartner_ID) === Env.getContext(ctx, WindowNo, TAB_INFO, 'C_BPartner_ID')) {
          var locationId = 0, loc = Env.getContext(ctx, WindowNo, TAB_INFO, 'C_BPartner_Location_ID');
          if (loc.length > 0) locationId = parseInt(loc, 10);
          if (locationId > 0) { var bpLocation = R.PO.get('C_BPartner_Location', locationId); if (bpLocation && bpLocation.isBillTo()) bill_Location_ID = locationId; }
        }
        if (bill_Location_ID === 0) mTab.setValue('Bill_Location_ID', null);
        else mTab.setValue('Bill_Location_ID', bill_Location_ID);
        var BillTo_User_ID = rs.getInt('BillTo_User_ID'), contID = rs.getInt('AD_User_ID');   // :531-545 Contact
        if (String(bill_BPartner_ID) === Env.getContext(ctx, WindowNo, TAB_INFO, 'C_BPartner_ID')) {
          var cont = Env.getContext(ctx, WindowNo, TAB_INFO, 'AD_User_ID');
          if (cont.length > 0) contID = parseInt(cont, 10);
        }
        if (contID === 0) mTab.setValue('Bill_User_ID', null);
        else mTab.setValue('Bill_User_ID', BillTo_User_ID > 0 ? BillTo_User_ID : contID);
        creditCheck(mTab, rs, IsSOTrx);                                               // :548-559
        var s = rs.getString('POReference'); if (s != null && s.length !== 0) mTab.setValue('POReference', s);   // :562-564
        s = rs.getString('SO_Description'); if (s != null && s.trim().length !== 0) mTab.setValue('Description', s);   // :566-568
        s = rs.getString('IsDiscountPrinted');                                        // :570-574
        if (s != null && s.length !== 0) mTab.setValue('IsDiscountPrinted', s); else mTab.setValue('IsDiscountPrinted', 'N');
        var OrderType = Env.getContext(ctx, WindowNo, 'OrderType');                  // :577-597
        mTab.setValue('InvoiceRule', 'D');
        mTab.setValue('PaymentRule', 'P');
        if (OrderType === 'PR') mTab.setValue('InvoiceRule', 'I');
        else if (OrderType === 'WR') mTab.setValue('PaymentRule', 'B');
        else {
          s = rs.getString(IsSOTrx ? 'PaymentRule' : 'PaymentRulePO'); if (s != null && s.length !== 0) mTab.setValue('PaymentRule', s);
          ii = rs.getInt(IsSOTrx ? 'C_PaymentTerm_ID' : 'PO_PaymentTerm_ID'); if (!rs.wasNull()) mTab.setValue('C_PaymentTerm_ID', ii);
          s = rs.getString('InvoiceRule'); if (s != null && s.length !== 0) mTab.setValue('InvoiceRule', s);
        }
      }
      return '';
    };


    // ══ warehouse :653-670 ══
    CalloutOrder.prototype.warehouse = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive()) return '';                                         // assuming it is resetting value
      var M_Warehouse_ID = value;
      if (M_Warehouse_ID == null || M_Warehouse_ID === 0) return '';
      var wh = R.PO.get('M_Warehouse', M_Warehouse_ID);
      var DeliveryRule = mTab.get_ValueAsString('DeliveryRule');
      if ((wh && wh.isDisallowNegativeInv() && DeliveryRule === 'F') || (DeliveryRule == null || DeliveryRule.length === 0))
        mTab.setValue('DeliveryRule', 'A');
      return '';
    };

    // ══ priceListFill :682-718 ══
    CalloutOrder.prototype.priceListFill = function (ctx, WindowNo, mTab, mField, value, readonly) {
      var M_PriceList_ID = mTab.getValue('M_PriceList_ID');
      if (M_PriceList_ID == null || M_PriceList_ID === 0) return '';
      var pl = priceList(M_PriceList_ID);
      if (pl != null && pl.getM_PriceList_ID() === M_PriceList_ID) {
        if (!readonly) {
          mTab.setValue('IsTaxIncluded', pl.isTaxIncluded());                      // :691 Tax Included
          mTab.setValue('C_Currency_ID', pl.getC_Currency_ID());                     // :693 Currency
        }
        Env.setContext(ctx, WindowNo, 'EnforcePriceLimit', pl.isEnforcePriceLimit());   // :696 Price Limit Enforce
        var date = null;                                                              // :699-703 PriceList Version
        if (mTab.getAD_Table_ID() === 259) date = Env.getContextAsDate(ctx, WindowNo, 'DateOrdered');        // I_C_Order.Table_ID
        else if (mTab.getAD_Table_ID() === 318) date = Env.getContextAsDate(ctx, WindowNo, 'DateInvoiced');  // I_C_Invoice.Table_ID
        // MPriceList.getPriceListVersion :332-350 — "M_PriceList_ID=? AND TRUNC(ValidFrom)<=?", active, ValidFrom DESC
        if (date == null) date = new Timestamp(R.now());
        var plv = R.DB.query("SELECT M_PriceList_Version_ID AS v FROM M_PriceList_Version WHERE M_PriceList_ID=? AND date(ValidFrom)<=date(?) AND IsActive='Y' ORDER BY ValidFrom DESC",
          [M_PriceList_ID, date])[0];
        if (plv != null && Number(plv.v) > 0) Env.setContext(ctx, WindowNo, 'M_PriceList_Version_ID', Number(plv.v));
        else Env.setContext(ctx, WindowNo, 'M_PriceList_Version_ID', null);
      }
      return '';
    };
    // ══ priceList :730-733 ══
    CalloutOrder.prototype.priceList = function (ctx, WindowNo, mTab, mField, value) { return this.priceListFill(ctx, WindowNo, mTab, mField, value, false); };
    // ══ priceListReadOnly :736-739 (IDEMPIERE-2676, called on navigate) ══
    CalloutOrder.prototype.priceListReadOnly = function (ctx, WindowNo, mTab, mField, value) { return this.priceListFill(ctx, WindowNo, mTab, mField, value, true); };

    // ══ paymentTerm :741-759 (@Deprecated since 13, no AD binding) ══
    CalloutOrder.prototype.paymentTerm = function (ctx, WindowNo, mTab, mField, value) {
      var C_PaymentTerm_ID = value;
      var C_Order_ID = Env.getContextAsInt(ctx, WindowNo, 'C_Order_ID');
      if (C_PaymentTerm_ID == null || C_PaymentTerm_ID === 0 || C_Order_ID === 0) return '';   // not saved yet
      var pt = R.PO.get('C_PaymentTerm', C_PaymentTerm_ID);
      if (pt == null) return 'PaymentTerm not found';
      R.unportedDep('CalloutOrder.paymentTerm', 'MPaymentTerm.applyOrder (writes C_OrderPaySchedule)');
      return '';
    };

    // inventory status popup :806-845 / :1373-1408 — fires only DataStatus events (no field)
    function inventoryPopup(ctx, WindowNo, mTab, M_Product_ID, QtyOrdered, label) {
      var M_Warehouse_ID = Env.getContextAsInt(ctx, WindowNo, 'M_Warehouse_ID');
      var warehouse = R.PO.get('M_Warehouse', M_Warehouse_ID);
      if (Env.isSOTrx(ctx, WindowNo) && !(warehouse && warehouse.isDisableInventoryPopup()) && (label !== 'qty' || QtyOrdered.signum() > 0)) {
        var product = R.PO.get('M_Product', M_Product_ID);
        if (product && product.isStocked() && Env.getContext(ctx, WindowNo, 'IsDropShip') === 'N'
          && !(product.isBOM() && product.isVerified() && product.isAutoProduce())) {
          if (QtyOrdered == null) QtyOrdered = Env.ZERO;
          var MSR = M.MStorageReservation, MOL = M.MOrderLine;
          if (!MSR || typeof MSR.getQtyAvailable !== 'function') { R.unportedDep('CalloutOrder.' + label, 'MStorageReservation.getQtyAvailable (status event NoQtyAvailable/InsufficientQtyAvailable only — no field)'); return; }
          var M_AttributeSetInstance_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_AttributeSetInstance_ID');
          var available = MSR.getQtyAvailable(M_Warehouse_ID, M_Product_ID, M_AttributeSetInstance_ID, null);
          if (available == null) available = Env.ZERO;
          if (available.signum() === 0) mTab.fireDataStatusEEvent('NoQtyAvailable', '0', false);
          else if (available.compareTo(QtyOrdered) < 0) mTab.fireDataStatusEEvent('InsufficientQtyAvailable', available.toString(), false);
          else {
            var C_OrderLine_ID = mTab.getValue('C_OrderLine_ID'); if (C_OrderLine_ID == null) C_OrderLine_ID = 0;
            if (!MOL || typeof MOL.getNotReserved !== 'function') { R.unportedDep('CalloutOrder.' + label, 'MOrderLine.getNotReserved (status event only)'); return; }
            var notReserved = MOL.getNotReserved(ctx, M_Warehouse_ID, M_Product_ID, M_AttributeSetInstance_ID, C_OrderLine_ID);
            if (notReserved == null) notReserved = Env.ZERO;
            var total = available.subtract(notReserved);
            if (total.compareTo(QtyOrdered) < 0)
              mTab.fireDataStatusEEvent('InsufficientQtyAvailable', Msg.parseTranslation(ctx, '@QtyAvailable@=' + available + ' - @QtyNotReserved@=' + notReserved + ' = ' + total), false);
          }
        }
      }
    }

    // pricing set-up shared by product :769-797 and navigateOrderLine :1446-1471 (the PLV lookup :779-794)
    function pricing(ctx, WindowNo, mTab, M_Product_ID, Qty) {
      var C_BPartner_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_ID');
      var IsSOTrx = Env.getContext(ctx, WindowNo, 'IsSOTrx') === 'Y';
      var pp = productPricing();
      pp.setInitialValues(M_Product_ID, C_BPartner_ID, Qty, IsSOTrx, null);
      var orderDate = mTab.getValue('DateOrdered');
      pp.setPriceDate(orderDate);
      if (typeof pp.setOrderLine === 'function') pp.setOrderLine(orderLineWrapper(mTab), null);
      var M_PriceList_ID = Env.getContextAsInt(ctx, WindowNo, 'M_PriceList_ID');
      pp.setM_PriceList_ID(M_PriceList_ID);
      var M_PriceList_Version_ID = Env.getContextAsInt(ctx, WindowNo, 'M_PriceList_Version_ID');
      if (M_PriceList_Version_ID === 0 && M_PriceList_ID > 0) {
        var sql = 'SELECT plv.M_PriceList_Version_ID ' + 'FROM M_PriceList_Version plv ' + 'WHERE plv.M_PriceList_ID=? ' +
          ' AND plv.ValidFrom <= ? ' + 'ORDER BY plv.ValidFrom DESC';               // Use newest price list - may not be future
        M_PriceList_Version_ID = R.DB.getSQLValueEx(null, sql, M_PriceList_ID, orderDate);
        if (M_PriceList_Version_ID > 0) Env.setContext(ctx, WindowNo, 'M_PriceList_Version_ID', M_PriceList_Version_ID);
      }
      pp.setM_PriceList_Version_ID(M_PriceList_Version_ID);
      return pp;
    }

    // ══ product :762-850 ══
    CalloutOrder.prototype.product = function (ctx, WindowNo, mTab, mField, value) {
      var M_Product_ID = value;
      if (M_Product_ID == null || M_Product_ID === 0) return '';
      mTab.setValue('C_Charge_ID', null);                                           // :768
      if (Env.getContextAsInt(ctx, WindowNo, TAB_INFO, 'M_Product_ID') === M_Product_ID          // :770-774 Set Attribute
        && Env.getContextAsInt(ctx, WindowNo, TAB_INFO, 'M_AttributeSetInstance_ID') !== 0)
        mTab.setValue('M_AttributeSetInstance_ID', Env.getContextAsInt(ctx, WindowNo, TAB_INFO, 'M_AttributeSetInstance_ID'));
      else mTab.setValue('M_AttributeSetInstance_ID', 0);
      var Qty = mTab.getValue('QtyOrdered');                                         // :777
      var pp = pricing(ctx, WindowNo, mTab, M_Product_ID, Qty);
      mTab.setValue('PriceList', pp.getPriceList());                                 // :798-805
      mTab.setValue('PriceLimit', pp.getPriceLimit());
      mTab.setValue('PriceActual', pp.getPriceStd());
      mTab.setValue('PriceEntered', pp.getPriceStd());
      mTab.setValue('C_Currency_ID', pp.getC_Currency_ID());
      mTab.setValue('Discount', pp.getDiscount());
      mTab.setValue('C_UOM_ID', pp.getC_UOM_ID());
      mTab.setValue('QtyOrdered', mTab.getValue('QtyEntered'));
      Env.setContext(ctx, WindowNo, 'EnforcePriceLimit', pp.isEnforcePriceLimit() ? 'Y' : 'N');   // :806-807
      Env.setContext(ctx, WindowNo, 'DiscountSchema', pp.isDiscountSchema() ? 'Y' : 'N');
      inventoryPopup(ctx, WindowNo, mTab, M_Product_ID, mTab.getValue('QtyOrdered'), 'product');   // :809-847
      return this.tax(ctx, WindowNo, mTab, mField, value);                            // :850
    };

    // ══ charge :864-910 ══
    CalloutOrder.prototype.charge = function (ctx, WindowNo, mTab, mField, value) {
      var C_Charge_ID = value;
      if (C_Charge_ID == null || C_Charge_ID === 0) return '';
      if (mTab.getValue('M_Product_ID') != null) {                                   // :869-874 No Product defined
        mTab.setValue('C_Charge_ID', null);
        return 'ChargeExclusively';
      }
      mTab.setValue('M_AttributeSetInstance_ID', null);                              // :875-877
      mTab.setValue('S_ResourceAssignment_ID', null);
      mTab.setValue('C_UOM_ID', 100);                                                // SystemIDs.C_UOM_EACH — EA
      Env.setContext(ctx, WindowNo, 'DiscountSchema', 'N');                         // :879
      var ps = R.DB.prepareStatement('SELECT ChargeAmt FROM C_Charge WHERE C_Charge_ID=?');   // :880-893
      ps.setInt(1, C_Charge_ID);
      var rs = ps.executeQuery();
      if (rs.next()) {
        mTab.setValue('PriceEntered', rs.getBigDecimal(1));
        mTab.setValue('PriceActual', rs.getBigDecimal(1));
        mTab.setValue('PriceLimit', Env.ZERO);
        mTab.setValue('PriceList', Env.ZERO);
        mTab.setValue('Discount', Env.ZERO);
      }
      return this.tax(ctx, WindowNo, mTab, mField, value);                            // :909
    };

    // ══ tax :924-1000 ══
    CalloutOrder.prototype.tax = function (ctx, WindowNo, mTab, mField, value) {
      var column = mField.getColumnName();
      if (value == null) return '';
      var M_Product_ID = 0;                                                          // :931-936 Check Product
      if (column === 'M_Product_ID') M_Product_ID = value;
      else M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      var C_Charge_ID = 0;                                                           // :937-941
      if (column === 'C_Charge_ID') C_Charge_ID = value;
      else C_Charge_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_Charge_ID');
      if (M_Product_ID === 0 && C_Charge_ID === 0) return this.amt(ctx, WindowNo, mTab, mField, value);   // :943-944
      var shipC_BPartner_Location_ID = 0;                                            // :947-953 Check Partner Location
      if (column === 'C_BPartner_Location_ID') shipC_BPartner_Location_ID = value;
      else shipC_BPartner_Location_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_Location_ID');
      if (shipC_BPartner_Location_ID === 0) return this.amt(ctx, WindowNo, mTab, mField, value);
      var billDate = Env.getContextAsDate(ctx, WindowNo, 'DateOrdered');            // :957-975
      var shipDate = Env.getContextAsDate(ctx, WindowNo, 'DatePromised');
      var AD_Org_ID = Env.getContextAsInt(ctx, WindowNo, 'AD_Org_ID');
      var M_Warehouse_ID = Env.getContextAsInt(ctx, WindowNo, 'M_Warehouse_ID');
      var billC_BPartner_Location_ID = Env.getContextAsInt(ctx, WindowNo, 'Bill_Location_ID');
      if (billC_BPartner_Location_ID === 0) billC_BPartner_Location_ID = shipC_BPartner_Location_ID;
      var deliveryViaRule = Env.getContext(ctx, WindowNo, 'DeliveryViaRule', true);   // :978-979
      var dropshipLocationId = Env.getContextAsInt(ctx, WindowNo, 'DropShip_Location_ID', true);
      var isSO = 'Y' === Env.getContext(ctx, WindowNo, 'IsSOTrx');
      var C_Tax_ID;                                                                  // :980-983 Core.getTaxLookup().get(...)
      if (M.Core && typeof M.Core.getTaxLookup === 'function')
        C_Tax_ID = M.Core.getTaxLookup().get(ctx, M_Product_ID, C_Charge_ID, billDate, shipDate, AD_Org_ID, M_Warehouse_ID,
          billC_BPartner_Location_ID, shipC_BPartner_Location_ID, dropshipLocationId, isSO, deliveryViaRule, null);
      else if (M.Tax && typeof M.Tax.get === 'function')
        C_Tax_ID = M.Tax.get(ctx, M_Product_ID, C_Charge_ID, billDate, shipDate, AD_Org_ID, M_Warehouse_ID,
          billC_BPartner_Location_ID, shipC_BPartner_Location_ID, dropshipLocationId, isSO, deliveryViaRule, null);
      else throw new Error('Tax lookup not loaded (Core.getTaxLookup)');
      if (C_Tax_ID === 0) mTab.fireDataStatusEEvent((M.CLogger && M.CLogger.retrieveError) ? M.CLogger.retrieveError() : 'TaxNotFound', '', true);   // :986-987
      else mTab.setValue('C_Tax_ID', C_Tax_ID);
      return this.amt(ctx, WindowNo, mTab, mField, value);                            // :992
    };

    // ══ amt :1005-1190 ══
    CalloutOrder.prototype.amt = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var C_UOM_To_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_UOM_ID');            // :1010-1015
      var M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      var M_PriceList_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_PriceList_ID');
      var StdPrecision = stdPrecision(M_PriceList_ID);
      var plx = priceList(M_PriceList_ID);
      var isEnforcePriceLimit = plx ? plx.isEnforcePriceLimit() : false;
      var QtyEntered, QtyOrdered, PriceEntered, PriceActual, PriceLimit, Discount, PriceList;
      QtyEntered = mTab.getValue('QtyEntered'); if (QtyEntered == null) QtyEntered = Env.ZERO;      // :1018-1023
      QtyOrdered = mTab.getValue('QtyOrdered'); if (QtyOrdered == null) QtyOrdered = Env.ZERO;
      PriceEntered = mTab.getValue('PriceEntered');                                  // :1026-1030
      PriceActual = mTab.getValue('PriceActual');
      Discount = mTab.getValue('Discount');
      PriceLimit = mTab.getValue('PriceLimit');
      PriceList = mTab.getValue('PriceList');
      var col = mField.getColumnName();
      if (M_Product_ID === 0) {                                                      // :1037-1051 No Product
        if (col === 'PriceActual') { PriceEntered = value; mTab.setValue('PriceEntered', value); }
        else if (col === 'PriceEntered') { PriceActual = value; mTab.setValue('PriceActual', value); }
      } else if ((col === 'QtyOrdered' || col === 'QtyEntered' || col === 'C_UOM_ID' || col === 'M_Product_ID')   // :1053-1093
        && !('N' === Env.getContext(ctx, WindowNo, 'DiscountSchema'))) {
        var C_BPartner_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_ID');
        if (col === 'QtyEntered') QtyOrdered = convFrom(ctx, M_Product_ID, C_UOM_To_ID, QtyEntered);
        if (QtyOrdered == null) QtyOrdered = QtyEntered;
        var IsSOTrx = Env.getContext(ctx, WindowNo, 'IsSOTrx') === 'Y';
        var pp = productPricing();
        pp.setInitialValues(M_Product_ID, C_BPartner_ID, QtyOrdered, IsSOTrx, null);
        var date = mTab.getValue('DateOrdered');
        pp.setPriceDate(date);
        if (typeof pp.setOrderLine === 'function') pp.setOrderLine(orderLineWrapper(mTab), null);
        pp.setM_PriceList_ID(M_PriceList_ID);
        var M_PriceList_Version_ID = Env.getContextAsInt(ctx, WindowNo, 'M_PriceList_Version_ID');
        pp.setM_PriceList_Version_ID(M_PriceList_Version_ID);
        PriceEntered = convFrom(ctx, M_Product_ID, C_UOM_To_ID, pp.getPriceStd(), 12);
        if (PriceEntered == null) PriceEntered = pp.getPriceStd();
        PriceActual = pp.getPriceStd();
        Discount = pp.getDiscount();
        PriceLimit = pp.getPriceLimit();
        PriceList = pp.getPriceList();
        mTab.setValue('PriceList', pp.getPriceList());
        mTab.setValue('PriceLimit', pp.getPriceLimit());
        mTab.setValue('PriceActual', pp.getPriceStd());
        mTab.setValue('Discount', pp.getDiscount());
        mTab.setValue('PriceEntered', PriceEntered);
        Env.setContext(ctx, WindowNo, 'DiscountSchema', pp.isDiscountSchema() ? 'Y' : 'N');
      } else if (col === 'PriceActual') {                                            // :1094-1105
        PriceActual = value;
        PriceEntered = convFrom(ctx, M_Product_ID, C_UOM_To_ID, PriceActual, 12);
        if (PriceEntered == null) PriceEntered = PriceActual;
        mTab.setValue('PriceEntered', PriceEntered);
      } else if (col === 'PriceEntered') {                                           // :1106-1117
        PriceEntered = value;
        PriceActual = convTo(ctx, M_Product_ID, C_UOM_To_ID, PriceEntered, 12);
        if (PriceActual == null) PriceActual = PriceEntered;
        mTab.setValue('PriceActual', PriceActual);
      }
      if (col === 'Discount') {                                                      // :1120-1131 Discount entered
        if (dbl(PriceList) !== 0) PriceActual = valueOfDouble((100.0 - dbl(Discount)) / 100.0 * dbl(PriceList));
        if (PriceActual.scale() > StdPrecision) PriceActual = PriceActual.setScale(StdPrecision, RM.HALF_UP);
        PriceEntered = convFrom(ctx, M_Product_ID, C_UOM_To_ID, PriceActual, 12);
        if (PriceEntered == null) PriceEntered = PriceActual;
        mTab.setValue('PriceActual', PriceActual);
        mTab.setValue('PriceEntered', PriceEntered);
      } else {                                                                       // :1133-1142 calculate Discount
        if (PriceList.compareTo(Env.ZERO) === 0) Discount = Env.ZERO;
        else Discount = valueOfDouble((dbl(PriceList) - dbl(PriceActual)) / dbl(PriceList) * 100.0);
        if (Discount.scale() > 2) Discount = Discount.setScale(2, RM.HALF_UP);
        mTab.setValue('Discount', Discount);
      }
      var epl = Env.getContext(ctx, WindowNo, 'EnforcePriceLimit');                 // :1146-1150 Check PriceLimit
      var enforce = Env.isSOTrx(ctx, WindowNo) && epl != null && !(epl === '') ? epl === 'Y' : isEnforcePriceLimit;
      if (enforce && roleOverwritePriceLimit(ctx)) enforce = false;
      if (enforce && dbl(PriceLimit) !== 0.0 && PriceActual.compareTo(PriceLimit) < 0) {   // :1153-1173
        PriceActual = PriceLimit;
        PriceEntered = convFrom(ctx, M_Product_ID, C_UOM_To_ID, PriceLimit, 12);
        if (PriceEntered == null) PriceEntered = PriceLimit;
        mTab.setValue('PriceActual', PriceLimit);
        mTab.setValue('PriceEntered', PriceEntered);
        mTab.fireDataStatusEEvent('UnderLimitPrice', '', false);
        if (PriceList.compareTo(Env.ZERO) !== 0) {                                   // Repeat Discount calc
          Discount = valueOfDouble((dbl(PriceList) - dbl(PriceActual)) / dbl(PriceList) * 100.0);
          if (Discount.scale() > 2) Discount = Discount.setScale(2, RM.HALF_UP);
          mTab.setValue('Discount', Discount);
        }
      }
      var LineNetAmt = QtyEntered.multiply(PriceEntered);                            // :1176-1181 Line Net Amt
      if (LineNetAmt.scale() > StdPrecision) LineNetAmt = LineNetAmt.setScale(StdPrecision, RM.HALF_UP);
      mTab.setValue('LineNetAmt', LineNetAmt);
      return '';
    };
    function roleOverwritePriceLimit(ctx) {                                          // MRole.getDefault().isOverwritePriceLimit()
      var r = R.PO.get('AD_Role', Env.getAD_Role_ID(ctx));
      return r ? r.isOverwritePriceLimit() : false;
    }

    // ══ qty :1197-1370 ══
    CalloutOrder.prototype.qty = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      var QtyOrdered = Env.ZERO, QtyEntered, PriceActual, PriceEntered, conversion, C_UOM_To_ID, QtyEntered1;
      var col = mField.getColumnName();
      if (M_Product_ID === 0) {                                                      // :1206-1212 No Product
        QtyEntered = mTab.getValue('QtyEntered');
        QtyOrdered = QtyEntered;
        mTab.setValue('QtyOrdered', QtyOrdered);
      } else if (col === 'C_UOM_ID') {                                               // :1214-1245 UOM Changed
        C_UOM_To_ID = value;
        QtyEntered = mTab.getValue('QtyEntered');
        QtyEntered1 = QtyEntered.setScale(uomPrecision(C_UOM_To_ID), RM.HALF_UP);
        if (QtyEntered.compareTo(QtyEntered1) !== 0) { QtyEntered = QtyEntered1; mTab.setValue('QtyEntered', QtyEntered); }
        QtyOrdered = convFrom(ctx, M_Product_ID, C_UOM_To_ID, QtyEntered);
        if (QtyOrdered == null) QtyOrdered = QtyEntered;
        conversion = QtyEntered.compareTo(QtyOrdered) !== 0;
        PriceActual = mTab.getValue('PriceActual');
        PriceEntered = convFrom(ctx, M_Product_ID, C_UOM_To_ID, PriceActual, 12);
        if (PriceEntered == null) PriceEntered = PriceActual;
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
        mTab.setValue('QtyOrdered', QtyOrdered);
        mTab.setValue('PriceEntered', PriceEntered);
      } else if (col === 'QtyEntered') {                                             // :1247-1272 QtyEntered changed
        C_UOM_To_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_UOM_ID');
        QtyEntered = value;
        QtyEntered1 = QtyEntered.setScale(uomPrecision(C_UOM_To_ID), RM.HALF_UP);
        if (QtyEntered.compareTo(QtyEntered1) !== 0) { QtyEntered = QtyEntered1; mTab.setValue('QtyEntered', QtyEntered); }
        QtyOrdered = convFrom(ctx, M_Product_ID, C_UOM_To_ID, QtyEntered);
        if (QtyOrdered == null) QtyOrdered = QtyEntered;
        conversion = QtyEntered.compareTo(QtyOrdered) !== 0;
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
        mTab.setValue('QtyOrdered', QtyOrdered);
      } else if (col === 'QtyOrdered') {                                             // :1274-1300 QtyOrdered changed
        C_UOM_To_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_UOM_ID');
        QtyOrdered = value;
        var precision = productUOMPrecision(M_Product_ID);
        var QtyOrdered1 = QtyOrdered.setScale(precision, RM.HALF_UP);
        if (QtyOrdered.compareTo(QtyOrdered1) !== 0) { QtyOrdered = QtyOrdered1; mTab.setValue('QtyOrdered', QtyOrdered); }
        QtyEntered = convTo(ctx, M_Product_ID, C_UOM_To_ID, QtyOrdered);
        if (QtyEntered == null) QtyEntered = QtyOrdered;
        conversion = QtyOrdered.compareTo(QtyEntered) !== 0;
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
        mTab.setValue('QtyEntered', QtyEntered);
      } else {
        QtyOrdered = mTab.getValue('QtyOrdered');                                    // :1301-1305
      }
      if (M_Product_ID !== 0) inventoryPopup(ctx, WindowNo, mTab, M_Product_ID, QtyOrdered, 'qty');   // :1307-1345 Storage
      return '';
    };

    // ══ SalesOrderTenderType :1358-1374 ══
    CalloutOrder.prototype.SalesOrderTenderType = function (ctx, WindowNo, mTab, mField, value, oldValue) {
      if (value == null) return '';
      var tendertype = null;                                                         // new X_C_POSTenderType(ctx, id) — a missing row is an EMPTY PO
      try { tendertype = R.PO.get('C_POSTenderType', value); }
      catch (e) { R.unportedDep('CalloutOrder.SalesOrderTenderType', 'C_POSTenderType table absent from bundle (' + ((e && e.message) || e) + ')'); }
      mTab.setValue('IsPostDated', tendertype ? tendertype.isPostDated() : false);
      mTab.setValue('TenderType', tendertype ? tendertype.getTenderType() : null);
      return '';
    };

    // ══ organization :1377-1398 (C_Order, M_InOut, M_Inventory, M_Requisition) ══
    CalloutOrder.prototype.organization = function (ctx, WindowNo, mTab, mField, value) {
      if (value == null || value === 0) return '';                                   // Return if Organization field is empty
      var m_warehouse_id = mTab.getValue('M_Warehouse_ID');
      if (m_warehouse_id == null || m_warehouse_id === 0) {                          // Only set Warehouse if the field is empty
        var orginfo = R.PO.first('AD_OrgInfo', 'AD_Org_ID=?', [value]);              // MOrgInfo.get
        if (orginfo != null && orginfo.getM_Warehouse_ID() !== 0 && orginfo.getM_Warehouse_ID() != null)
          mTab.setValue('M_Warehouse_ID', orginfo.getM_Warehouse_ID());
      }
      return '';
    };

    // ══ navigateOrderLine :1400-1435 ══
    CalloutOrder.prototype.navigateOrderLine = function (ctx, WindowNo, mTab, mField, value) {
      var M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      if (M_Product_ID == null || M_Product_ID === 0) { Env.setContext(ctx, WindowNo, 'DiscountSchema', 'N'); return ''; }
      var Qty = mTab.getValue('QtyOrdered');
      var pp = pricing(ctx, WindowNo, mTab, M_Product_ID, Qty);
      Env.setContext(ctx, WindowNo, 'EnforcePriceLimit', pp.isEnforcePriceLimit() ? 'Y' : 'N');
      Env.setContext(ctx, WindowNo, 'DiscountSchema', pp.isDiscountSchema() ? 'Y' : 'N');
      return '';
    };
    return CalloutOrder;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

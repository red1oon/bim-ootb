// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutInOut.js — org.compiere.model.CalloutInOut, ported verbatim, all 11 methods
// (org.adempiere.base.callout/src/org/compiere/model/CalloutInOut.java). bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP
// — Witness: W-CP-CALLOUT-ORACLE (scripts/pilot/scenarios/cp/CalloutInOut.json).
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.compiere.model.CalloutInOut', function (CalloutEngine, R) {
    var Env = R.Env, BD = R.BD, RM = R.RM, M = R.M;
    function I(v) { return v == null ? 0 : v; }                 // Java int getter on a NULL column = 0
    function Z(v) { return v == null ? Env.ZERO : v; }          // X_ BigDecimal getter on NULL = Env.ZERO
    function CalloutInOut() { CalloutEngine.call(this); }
    CalloutInOut.prototype = Object.create(CalloutEngine.prototype);
    var P = CalloutInOut.prototype;

    // order :50-115 — C_Order_ID on the shipment/receipt header
    P.order = function (ctx, WindowNo, mTab, mField, value) {
      var C_Order_ID = value;
      if (C_Order_ID == null || C_Order_ID === 0) return '';
      if (this.isCalloutActive()) return '';                        // :57 prevent recursive
      var order = R.PO.get('C_Order', C_Order_ID);                  // :60 new MOrder
      if (order != null && I(order.get_ID()) !== 0) {               // :61-100
        mTab.setValue('DateOrdered', order.getDateOrdered());
        mTab.setValue('POReference', order.getPOReference());
        mTab.setValue('AD_Org_ID', I(order.getAD_Org_ID()));
        mTab.setValue('AD_OrgTrx_ID', I(order.getAD_OrgTrx_ID()));
        mTab.setValue('C_Activity_ID', I(order.getC_Activity_ID()));
        mTab.setValue('C_Campaign_ID', I(order.getC_Campaign_ID()));
        mTab.setValue('C_Project_ID', I(order.getC_Project_ID()));
        mTab.setValue('User1_ID', I(order.getUser1_ID()));
        mTab.setValue('User2_ID', I(order.getUser2_ID()));
        mTab.setValue('C_CostCenter_ID', I(order.getC_CostCenter_ID()));
        mTab.setValue('C_Department_ID', I(order.getC_Department_ID()));
        mTab.setValue('M_Warehouse_ID', I(order.getM_Warehouse_ID()));
        mTab.setValue('DeliveryRule', order.getDeliveryRule());     // :78-85
        mTab.setValue('DeliveryViaRule', order.getDeliveryViaRule());
        mTab.setValue('M_Shipper_ID', I(order.getM_Shipper_ID()));
        mTab.setValue('FreightCostRule', order.getFreightCostRule());
        mTab.setValue('FreightAmt', Z(order.getFreightAmt()));
        mTab.setValue('C_BPartner_ID', I(order.getC_BPartner_ID()));
        mTab.setValue('SalesRep_ID', I(order.getSalesRep_ID()));
        mTab.setValue('C_BPartner_Location_ID', I(order.getC_BPartner_Location_ID()));   // :87 [ 1867464 ]
        if (I(order.getAD_User_ID()) > 0) mTab.setValue('AD_User_ID', order.getAD_User_ID());
        else mTab.setValue('AD_User_ID', null);
        if (order.isDropShip()) {                                   // :93-98
          mTab.setValue('IsDropShip', order.isDropShip());
          mTab.setValue('DropShip_BPartner_ID', I(order.getDropShip_BPartner_ID()));
          mTab.setValue('DropShip_Location_ID', I(order.getDropShip_Location_ID()));
          mTab.setValue('DropShip_User_ID', I(order.getDropShip_User_ID()));
        }
      }
      // :101-109 — the related shipment/receipt doctype (order is "new MOrder" even when not found: ids read as 0)
      var docTypeId = order ? I(order.getC_DocType_ID()) : 0;
      if (docTypeId === 0) docTypeId = order ? I(order.getC_DocTypeTarget_ID()) : 0;
      var relatedDocTypeId = M.MDocType.getShipmentReceiptDocType(docTypeId, ctx);
      mTab.setValue('C_DocType_ID', relatedDocTypeId);
      return '';
    };

    // rma :126-180 — M_RMA_ID on a customer-return / return-to-vendor header
    P.rma = function (ctx, WindowNo, mTab, mField, value) {
      var M_RMA_ID = value;
      if (M_RMA_ID == null || M_RMA_ID === 0) return '';
      if (this.isCalloutActive()) return '';                        // :133
      var rma = R.PO.get('M_RMA', M_RMA_ID);                        // :136
      var originalReceipt = rma ? R.PO.get('M_InOut', I(rma.getInOut_ID())) : null;   // :137 rma.getShipment()
      if (rma != null && I(rma.get_ID()) > 0) {
        mTab.setValue('DateOrdered', originalReceipt.getDateOrdered());     // :140-166
        mTab.setValue('POReference', originalReceipt.getPOReference());
        mTab.setValue('AD_Org_ID', I(originalReceipt.getAD_Org_ID()));
        mTab.setValue('AD_OrgTrx_ID', I(originalReceipt.getAD_OrgTrx_ID()));
        mTab.setValue('C_Activity_ID', I(originalReceipt.getC_Activity_ID()));
        mTab.setValue('C_Campaign_ID', I(originalReceipt.getC_Campaign_ID()));
        mTab.setValue('C_Project_ID', I(originalReceipt.getC_Project_ID()));
        mTab.setValue('User1_ID', I(originalReceipt.getUser1_ID()));
        mTab.setValue('User2_ID', I(originalReceipt.getUser2_ID()));
        mTab.setValue('C_CostCenter_ID', I(originalReceipt.getC_CostCenter_ID()));
        mTab.setValue('C_Department_ID', I(originalReceipt.getC_Department_ID()));
        mTab.setValue('M_Warehouse_ID', I(originalReceipt.getM_Warehouse_ID()));
        mTab.setValue('DeliveryRule', originalReceipt.getDeliveryRule());
        mTab.setValue('DeliveryViaRule', originalReceipt.getDeliveryViaRule());
        mTab.setValue('M_Shipper_ID', I(originalReceipt.getM_Shipper_ID()));
        mTab.setValue('FreightCostRule', originalReceipt.getFreightCostRule());
        mTab.setValue('FreightAmt', Z(originalReceipt.getFreightAmt()));
        mTab.setValue('C_BPartner_ID', I(originalReceipt.getC_BPartner_ID()));
        mTab.setValue('SalesRep_ID', I(originalReceipt.getSalesRep_ID()));
        mTab.setValue('C_BPartner_Location_ID', I(originalReceipt.getC_BPartner_Location_ID()));
        if (I(originalReceipt.getAD_User_ID()) > 0) mTab.setValue('AD_User_ID', originalReceipt.getAD_User_ID());
        else mTab.setValue('AD_User_ID', null);
        var docTypeId = I(rma.getC_DocType_ID());                  // :170-174 Set corresponding document type
        var relatedDocTypeId = M.MDocType.getShipmentReceiptDocType(docTypeId, ctx);
        if (relatedDocTypeId > 0) mTab.setValue('C_DocType_ID', relatedDocTypeId);
      }
      return '';
    };

    // docType :191-253 — IsSOTrx + MovementType from the doctype, DocumentNo preview
    P.docType = function (ctx, WindowNo, mTab, mField, value) {
      var C_DocType_ID = value;
      if (C_DocType_ID == null || C_DocType_ID === 0) return '';
      var sql = 'SELECT d.DocBaseType, d.IsDocNoControlled, s.AD_Sequence_ID, d.IsSOTrx FROM C_DocType d ' +
        'LEFT OUTER JOIN AD_Sequence s ON (d.DocNoSequence_ID=s.AD_Sequence_ID) WHERE C_DocType_ID=?';   // :196-200
      Env.setContext(ctx, WindowNo, 'C_DocTypeTarget_ID', C_DocType_ID);   // :205
      var pstmt = R.DB.prepareStatement(sql); pstmt.setInt(1, C_DocType_ID);
      var rs = pstmt.executeQuery();
      if (rs.next()) {
        var trxFlag = rs.getString('IsSOTrx');                      // :213 BF [2708789]
        var isSOTrxValue = mTab.getValue('IsSOTrx'), isSOTrxValueStr = null;
        var IsSOTrx = 'Y' === trxFlag;
        if (isSOTrxValue != null) {
          if (typeof isSOTrxValue === 'boolean') isSOTrxValueStr = isSOTrxValue ? 'Y' : 'N';
          else isSOTrxValueStr = isSOTrxValue;
        }
        if (!(trxFlag === isSOTrxValueStr)) mTab.setValue('IsSOTrx', trxFlag);   // :225
        mTab.setValue('MovementType', M.MInOut.getMovementType(ctx, C_DocType_ID, IsSOTrx, null));   // :227
        if (rs.getString('IsDocNoControlled') === 'Y') {             // :229-233 DocumentNo
          var AD_Sequence_ID = rs.getInt('AD_Sequence_ID');
          mTab.setValue('DocumentNo', M.MSequence.getPreliminaryNo(mTab, AD_Sequence_ID));
        }
      }
      return '';
    };

    // bpartner :264-333 — receipt side: location + contact; SO side: credit-limit status event
    P.bpartner = function (ctx, WindowNo, mTab, mField, value) {
      var C_BPartner_ID = value;
      if (C_BPartner_ID == null || C_BPartner_ID === 0) return '';
      var sql = 'SELECT p.AD_Language,p.C_PaymentTerm_ID,p.M_PriceList_ID,p.PaymentRule,p.POReference,p.SO_Description,p.IsDiscountPrinted,' +
        'p.SO_CreditLimit-p.SO_CreditUsed AS CreditAvailable,' +
        "(select max(l.C_BPartner_Location_ID) from C_BPartner_Location l where p.C_BPartner_ID=l.C_BPartner_ID AND l.IsActive='Y') as C_BPartner_Location_ID," +
        "(select max(c.AD_User_ID) from AD_User c where p.C_BPartner_ID=c.C_BPartner_ID AND c.IsActive='Y' AND IsShipTo='Y') as ShipTo_User_ID," +
        "(select max(c.AD_User_ID) from AD_User c where p.C_BPartner_ID=c.C_BPartner_ID AND c.IsActive='Y') as AD_User_ID " +
        'FROM C_BPartner p WHERE p.C_BPartner_ID=?';               // :268-278
      var pstmt = R.DB.prepareStatement(sql); pstmt.setInt(1, C_BPartner_ID);
      var rs = pstmt.executeQuery();
      if (rs.next()) {
        var IsSOTrx = 'Y' === Env.getContext(ctx, WindowNo, 'IsSOTrx');   // :289
        if (!IsSOTrx) {
          var ii = rs.getInt('C_BPartner_Location_ID');             // :293-297 Location
          if (rs.wasNull()) mTab.setValue('C_BPartner_Location_ID', null);
          else mTab.setValue('C_BPartner_Location_ID', ii);
          ii = rs.getInt('AD_User_ID');                             // :299-306 Contact
          if (rs.wasNull()) mTab.setValue('AD_User_ID', null);
          else {
            var ShipTo_User_ID = rs.getInt('ShipTo_User_ID');
            mTab.setValue('AD_User_ID', ShipTo_User_ID > 0 ? ShipTo_User_ID : ii);
          }
        }
        if (IsSOTrx) {                                              // :309-316 CreditAvailable
          var ca = rs.getBigDecimal('CreditAvailable');
          if (!rs.wasNull() && ca.signum() < 0) mTab.fireDataStatusEEvent('CreditLimitOver', ca.toString(), false);
        }
      }
      return '';
    };

    // warehouse :345-400 — org from warehouse, default locator into ctx, DeliveryRule vs disallow-negative
    P.warehouse = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive()) return '';
      var M_Warehouse_ID = value;
      if (M_Warehouse_ID == null || M_Warehouse_ID === 0) return '';
      var sql = 'SELECT w.AD_Org_ID, l.M_Locator_ID, w.IsDisallowNegativeInv  FROM M_Warehouse w' +
        " LEFT OUTER JOIN M_Locator l ON (l.M_Warehouse_ID=w.M_Warehouse_ID AND l.IsDefault='Y') WHERE w.M_Warehouse_ID=?";   // :351-354
      var pstmt = R.DB.prepareStatement(sql); pstmt.setInt(1, M_Warehouse_ID);
      var rs = pstmt.executeQuery();
      if (rs.next()) {
        var ii = rs.getInt(1);                                      // :364-367 Org
        var AD_Org_ID = Env.getContextAsInt(ctx, WindowNo, 'AD_Org_ID');
        if (AD_Org_ID !== ii) mTab.setValue('AD_Org_ID', ii);
        ii = rs.getInt(2);                                          // :369-375 Locator
        if (rs.wasNull()) Env.setContext(ctx, WindowNo, 0, 'M_Locator_ID', null);
        else Env.setContext(ctx, WindowNo, 'M_Locator_ID', ii);
      }
      var disallowNegInv = rs.getString(3) === 'Y';                // :377-381 (Java reads rs after next(), same row)
      var DeliveryRule = mTab.get_ValueAsString('DeliveryRule');
      if ((disallowNegInv && DeliveryRule === 'F') || (DeliveryRule == null || DeliveryRule.length === 0))
        mTab.setValue('DeliveryRule', 'A');
      return '';
    };

    // orderLine :412-461 — product/charge, UOM, MovementQty net of this receipt's running qty, dimensions
    P.orderLine = function (ctx, WindowNo, mTab, mField, value) {
      var C_OrderLine_ID = value;
      if (C_OrderLine_ID == null || C_OrderLine_ID === 0) return '';
      var ol = R.PO.get('C_OrderLine', C_OrderLine_ID);             // :418
      if (ol != null && I(ol.get_ID()) !== 0) {
        if (I(ol.getC_Charge_ID()) > 0 && I(ol.getM_Product_ID()) <= 0) {   // :421-430
          mTab.setValue('C_Charge_ID', ol.getC_Charge_ID());
          mTab.setValue('M_Product_ID', null);
          mTab.setValue('M_AttributeSetInstance_ID', null);
        } else {
          mTab.setValue('M_Product_ID', I(ol.getM_Product_ID()));
          mTab.setValue('M_AttributeSetInstance_ID', I(ol.getM_AttributeSetInstance_ID()));
          mTab.setValue('C_Charge_ID', null);
        }
        mTab.setValue('C_UOM_ID', I(ol.getC_UOM_ID()));             // :432
        var MovementQty = Z(ol.getQtyOrdered()).subtract(Z(ol.getQtyDelivered()));   // :433-440 IDEMPIERE-1140
        var runningqty = R.DB.getSQLValueBD(null, 'SELECT SUM(MovementQty) FROM M_InOutLine WHERE M_InOut_ID=? AND M_InOutLine_ID!=? AND C_OrderLine_ID=?',
          Env.getContextAsInt(ctx, WindowNo, 'M_InOut_ID'), Env.getContextAsInt(ctx, WindowNo, 'M_InOutLine_ID'), ol.get_ID());
        if (runningqty != null) MovementQty = MovementQty.subtract(runningqty);
        mTab.setValue('MovementQty', MovementQty);
        var QtyEntered = MovementQty;                               // :442-446
        if (Z(ol.getQtyEntered()).compareTo(Z(ol.getQtyOrdered())) !== 0)
          QtyEntered = QtyEntered.multiply(Z(ol.getQtyEntered())).divide(Z(ol.getQtyOrdered()), 12, RM.HALF_UP);
        mTab.setValue('QtyEntered', QtyEntered);
        mTab.setValue('C_Activity_ID', I(ol.getC_Activity_ID()));   // :448-457
        mTab.setValue('C_Campaign_ID', I(ol.getC_Campaign_ID()));
        mTab.setValue('C_Project_ID', I(ol.getC_Project_ID()));
        mTab.setValue('C_ProjectPhase_ID', I(ol.getC_ProjectPhase_ID()));
        mTab.setValue('C_ProjectTask_ID', I(ol.getC_ProjectTask_ID()));
        mTab.setValue('AD_OrgTrx_ID', I(ol.getAD_OrgTrx_ID()));
        mTab.setValue('User1_ID', I(ol.getUser1_ID()));
        mTab.setValue('User2_ID', I(ol.getUser2_ID()));
        mTab.setValue('C_CostCenter_ID', I(ol.getC_CostCenter_ID()));
        mTab.setValue('C_Department_ID', I(ol.getC_Department_ID()));
      }
      return '';
    };

    // rmaLine :472-511
    P.rmaLine = function (ctx, WindowNo, mTab, mField, value) {
      var M_RMALine_id = value;
      if (M_RMALine_id == null || M_RMALine_id === 0) return '';
      var rl = R.PO.get('M_RMALine', M_RMALine_id);                 // :478
      if (rl != null && I(rl.get_ID()) !== 0) {
        if (I(rl.getC_Charge_ID()) > 0 && I(rl.getM_Product_ID()) <= 0) {   // :481-490
          mTab.setValue('C_Charge_ID', rl.getC_Charge_ID());
          mTab.setValue('M_Product_ID', null);
          mTab.setValue('M_AttributeSetInstance_ID', null);
        } else {
          mTab.setValue('M_Product_ID', I(rl.getM_Product_ID()));
          mTab.setValue('M_AttributeSetInstance_ID', I(rl.getM_AttributeSetInstance_ID()));
          mTab.setValue('C_Charge_ID', null);
        }
        mTab.setValue('C_UOM_ID', rmaLineUOM(rl));                  // :492 MRMALine.getC_UOM_ID
        var MovementQty = Z(rl.getQty()).subtract(Z(rl.getQtyDelivered()));   // :493-496
        mTab.setValue('MovementQty', MovementQty);
        mTab.setValue('QtyEntered', MovementQty);
        mTab.setValue('C_Activity_ID', I(rl.getC_Activity_ID()));   // :498-507
        mTab.setValue('C_Campaign_ID', I(rl.getC_Campaign_ID()));
        mTab.setValue('C_Project_ID', I(rl.getC_Project_ID()));
        mTab.setValue('C_ProjectPhase_ID', I(rl.getC_ProjectPhase_ID()));
        mTab.setValue('C_ProjectTask_ID', I(rl.getC_ProjectTask_ID()));
        mTab.setValue('AD_OrgTrx_ID', I(rl.getAD_OrgTrx_ID()));
        mTab.setValue('User1_ID', I(rl.getUser1_ID()));
        mTab.setValue('User2_ID', I(rl.getUser2_ID()));
        mTab.setValue('C_CostCenter_ID', I(rl.getC_CostCenter_ID()));
        mTab.setValue('C_Department_ID', I(rl.getC_Department_ID()));
      }
      return '';
    };
    // MRMALine.getC_UOM_ID (M/MRMALine.java:557-567; m_ioLine loaded in init() when M_InOutLine_ID != 0)
    function rmaLineUOM(rl) {
      var ioLine = I(rl.getM_InOutLine_ID()) !== 0 ? R.PO.get('M_InOutLine', rl.getM_InOutLine_ID()) : null;
      if (ioLine == null && I(rl.getC_Charge_ID()) !== 0) return 100;   // Each
      else if (ioLine == null && I(rl.getM_Product_ID()) !== 0) return I(R.PO.get('M_Product', rl.getM_Product_ID()).getC_UOM_ID());
      return I(ioLine.getC_UOM_ID());
    }

    // product :522-568 — ASI from info selection, then (receipt side) UOM/MovementQty/default locator
    P.product = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive()) return '';
      var M_Product_ID = value;
      if (M_Product_ID == null || M_Product_ID === 0) return '';
      var M_Locator_ID = 0;                                         // :530-541 Set Attribute & Locator
      if (Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_Product_ID') === M_Product_ID &&
          Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_AttributeSetInstance_ID') !== 0) {
        mTab.setValue('M_AttributeSetInstance_ID', Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_AttributeSetInstance_ID'));
        M_Locator_ID = Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_Locator_ID');
        if (M_Locator_ID !== 0) mTab.setValue('M_Locator_ID', M_Locator_ID);
      } else mTab.setValue('M_AttributeSetInstance_ID', 0);
      var M_Warehouse_ID = Env.getContextAsInt(ctx, WindowNo, 'M_Warehouse_ID');   // :543-548
      var IsSOTrx = 'Y' === Env.getContext(ctx, WindowNo, 'IsSOTrx');
      if (IsSOTrx) return '';
      var product = M.MProduct.get(ctx, M_Product_ID);              // :550-553 Set UOM/Locator/Qty
      mTab.setValue('C_UOM_ID', I(product.getC_UOM_ID()));
      var QtyEntered = mTab.getValue('QtyEntered');
      mTab.setValue('MovementQty', QtyEntered);
      if (M_Locator_ID !== 0) { /* already set */ }                // :554-566
      else if (I(product.getM_Locator_ID()) !== 0) {
        var loc = M.MLocator.get(ctx, product.getM_Locator_ID());
        if (M_Warehouse_ID === I(loc.getM_Warehouse_ID())) mTab.setValue('M_Locator_ID', product.getM_Locator_ID());
      }
      return '';
    };

    // qty :582-680 — QtyEntered/MovementQty/C_UOM_ID conversion tree
    P.qty = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      var MovementQty, QtyEntered, QtyEntered1, C_UOM_To_ID, conversion;
      if (M_Product_ID === 0) {                                     // :589-594 No Product
        QtyEntered = mTab.getValue('QtyEntered');
        mTab.setValue('MovementQty', QtyEntered);
      } else if (mField.getColumnName() === 'C_UOM_ID') {            // :596-620 UOM Changed
        C_UOM_To_ID = value;
        QtyEntered = mTab.getValue('QtyEntered');
        QtyEntered1 = QtyEntered.setScale(M.MUOM.getPrecision(ctx, C_UOM_To_ID), RM.HALF_UP);
        if (QtyEntered.compareTo(QtyEntered1) !== 0) { QtyEntered = QtyEntered1; mTab.setValue('QtyEntered', QtyEntered); }
        MovementQty = M.MUOMConversion.convertProductFrom(ctx, M_Product_ID, C_UOM_To_ID, QtyEntered);
        if (MovementQty == null) MovementQty = QtyEntered;
        conversion = QtyEntered.compareTo(MovementQty) !== 0;
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
        mTab.setValue('MovementQty', MovementQty);
      } else if (Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_UOM_ID') === 0) {   // :622-626 No UOM defined
        QtyEntered = mTab.getValue('QtyEntered');
        mTab.setValue('MovementQty', QtyEntered);
      } else if (mField.getColumnName() === 'QtyEntered') {          // :628-651 QtyEntered changed
        C_UOM_To_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_UOM_ID');
        QtyEntered = value;
        QtyEntered1 = QtyEntered.setScale(M.MUOM.getPrecision(ctx, C_UOM_To_ID), RM.HALF_UP);
        if (QtyEntered.compareTo(QtyEntered1) !== 0) { QtyEntered = QtyEntered1; mTab.setValue('QtyEntered', QtyEntered); }
        MovementQty = M.MUOMConversion.convertProductFrom(ctx, M_Product_ID, C_UOM_To_ID, QtyEntered);
        if (MovementQty == null) MovementQty = QtyEntered;
        conversion = QtyEntered.compareTo(MovementQty) !== 0;
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
        mTab.setValue('MovementQty', MovementQty);
      } else if (mField.getColumnName() === 'MovementQty') {         // :653-676 MovementQty changed
        C_UOM_To_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_UOM_ID');
        MovementQty = value;
        var precision = M.MProduct.getUOMPrecision(M.MProduct.get(ctx, M_Product_ID));
        var MovementQty1 = MovementQty.setScale(precision, RM.HALF_UP);
        if (MovementQty.compareTo(MovementQty1) !== 0) { MovementQty = MovementQty1; mTab.setValue('MovementQty', MovementQty); }
        QtyEntered = M.MUOMConversion.convertProductTo(ctx, M_Product_ID, C_UOM_To_ID, MovementQty);
        if (QtyEntered == null) QtyEntered = MovementQty;
        conversion = MovementQty.compareTo(QtyEntered) !== 0;
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
        mTab.setValue('QtyEntered', QtyEntered);
      }
      return '';
    };

    // asi :691-722 — selected locator; a serialized ASI forces qty 1 (IDEMPIERE-1140)
    P.asi = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive()) return '';
      var M_ASI_ID = value;
      if (M_ASI_ID == null || M_ASI_ID === 0) return '';
      var M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      var M_AttributeSetInstance_ID = Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_AttributeSetInstance_ID');   // :706 Check Selection
      if (M_ASI_ID === M_AttributeSetInstance_ID) {
        var selectedM_Locator_ID = Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_Locator_ID');
        if (selectedM_Locator_ID !== 0) mTab.setValue('M_Locator_ID', selectedM_Locator_ID);
      }
      var asi = M.MAttributeSetInstance.get(ctx, M_ASI_ID, 0);      // :715-720
      if (asi != null && asi.getSerNo() != null) {
        mTab.setValue('MovementQty', Env.ONE);
        mTab.setValue('QtyEntered', Env.ONE);
        var product = M.MProduct.get(ctx, M_Product_ID);
        if (product != null) mTab.setValue('C_UOM_ID', I(product.getC_UOM_ID()));
      }
      return '';
    };

    // navigateInOutLine :729-743 — UOMConversion flag on row navigation
    P.navigateInOutLine = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      if (M_Product_ID !== 0) {
        var product = M.MProduct.get(ctx, M_Product_ID);
        var C_UOM_To_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_UOM_ID');
        var conversion = C_UOM_To_ID !== I(product.getC_UOM_ID());
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
      }
      return '';
    };
    return CalloutInOut;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CostAdjustmentLine.js — @Callout(M_InventoryLine) org.adempiere.base.callout.CostAdjustmentLineASI (.M_AttributeSetInstance_ID)
// and CostAdjustmentLineProduct (.M_Product_ID), verbatim (org.adempiere.base.callout/src/org/adempiere/base/callout/
// CostAdjustmentLineASI.java:51-110, CostAdjustmentLineProduct.java:51-122). §CP — Witness: W-CP-CALLOUT-ORACLE.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  var R = A.RUNTIME, Env = R.Env, M = R.M, Msg = R.Msg, BD = R.BD;
  function I(v) { return v == null ? 0 : v; }
  // the client's schema, or one in the inventory's currency (both classes, ASI :73-83 / Product :79-89)
  function schemaFor(ctx, C_Currency_ID) {
    var as = M.MClient.getAcctSchema(ctx, Env.getAD_Client_ID(ctx));
    if (I(as.getC_Currency_ID()) !== C_Currency_ID) {
      var ass = M.MAcctSchema.getClientAcctSchema(ctx, Env.getAD_Client_ID(ctx));
      for (var i = 0; i < ass.length; i++) if (I(ass[i].getC_Currency_ID()) === C_Currency_ID) as = ass[i];
    }
    return as;
  }
  // MInventory.getCostingMethod (M/MInventory.java) — the inventory's own CostingMethod column
  A.defineColumnCallout('M_InventoryLine', ['M_AttributeSetInstance_ID'], 'org.adempiere.base.callout.CostAdjustmentLineASI',
    function (ctx, WindowNo, mTab, mField, value, oldValue) {
      // :56-63 GridTable.isImporting → importer trx: the page never imports through a GridTab
      var inventory = R.PO.get('M_Inventory', mTab.getValue('M_Inventory_ID'));
      if (inventory == null) throw new Error('java.lang.NullPointerException: M_Inventory_ID');
      var docType = M.MDocType.get(ctx, I(inventory.getC_DocType_ID()));
      if ('CA' === docType.getDocSubTypeInv()) {                    // :66 MDocType.DOCSUBTYPEINV_CostAdjustment
        var costingMethod = inventory.getCostingMethod();
        var productValue = mTab.getValue('M_Product_ID');
        if (productValue == null || productValue === 0) return null;
        var product = M.MProduct.get(ctx, productValue);
        var M_ASI_ID = value != null ? value : 0;
        var AD_Org_ID = I(inventory.getAD_Org_ID()), C_Currency_ID = I(inventory.getC_Currency_ID());
        var as = schemaFor(ctx, C_Currency_ID);
        var cost = M.MProduct.getCostInfo(product, as, AD_Org_ID, M_ASI_ID, costingMethod, inventory.getMovementDate(), ctx);
        if (cost == null) {                                         // :86-91
          if (!('S' === costingMethod)) { mTab.setValue(mField, null); return Msg.getMsg(ctx, 'NoCostingRecord'); }
        }
        if (cost != null) {                                         // :92-98
          var currentCost = mTab.getValue('CurrentCostPrice');
          if (currentCost == null || currentCost.compareTo(cost.getCurrentCostPrice()) === 0) return null;
          mTab.setValue('CurrentCostPrice', cost.getCurrentCostPrice());
          mTab.setValue('NewCostPrice', cost.getCurrentCostPrice());
        }
      }
      return null;
    });
  A.defineColumnCallout('M_InventoryLine', ['M_Product_ID'], 'org.adempiere.base.callout.CostAdjustmentLineProduct',
    function (ctx, WindowNo, mTab, mField, value, oldValue) {
      if (mTab.getValue('M_Inventory_ID') == null) return null;     // :64-65
      var inventory = R.PO.get('M_Inventory', mTab.getValue('M_Inventory_ID'));
      var docType = M.MDocType.get(ctx, I(inventory.getC_DocType_ID()));
      if ('CA' === docType.getDocSubTypeInv()) {
        var costingMethod = inventory.getCostingMethod();
        if (value == null) {                                        // :70-73
          mTab.setValue('CurrentCostPrice', BD.ZERO);
          mTab.setValue('NewCostPrice', BD.ZERO);
        } else {
          var product = M.MProduct.get(ctx, value);
          var as = M.MClient.getAcctSchema(ctx, Env.getAD_Client_ID(ctx));
          var costingLevel = M.MProduct.getCostingLevel(product, as);
          if ('B' === costingLevel) {                               // :78-81 MAcctSchema.COSTINGLEVEL_BatchLot
            mTab.setValue('CurrentCostPrice', BD.ZERO);
            mTab.setValue('NewCostPrice', BD.ZERO);
          } else {
            var asiValue = mTab.getValue('M_AttributeSetInstance_ID');
            var M_ASI_ID = asiValue != null ? asiValue : 0;
            var AD_Org_ID = I(inventory.getAD_Org_ID()), C_Currency_ID = I(inventory.getC_Currency_ID());
            as = schemaFor(ctx, C_Currency_ID);
            var cost = M.MProduct.getCostInfo(product, as, AD_Org_ID, M_ASI_ID, costingMethod, inventory.getMovementDate(), ctx);
            if (cost == null) {
              if (!('S' === costingMethod)) { mTab.setValue(mField, null); return Msg.getMsg(ctx, 'NoCostingRecord'); }
            }
            // :115-116 — Java dereferences cost here even when null (Standard Costing, no record) → NullPointerException
            if (cost == null) throw new Error('java.lang.NullPointerException: Cannot invoke "org.compiere.model.ICostInfo.getCurrentCostPrice()" because "cost" is null');
            mTab.setValue('CurrentCostPrice', cost.getCurrentCostPrice());
            mTab.setValue('NewCostPrice', cost.getCurrentCostPrice());
          }
        }
      }
      return null;
    });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

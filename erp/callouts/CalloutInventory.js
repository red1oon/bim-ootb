// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutInventory.js — org.compiere.model.CalloutInventory.product, ported verbatim
// (org.adempiere.base.callout/src/org/compiere/model/CalloutInventory.java:44-128). §CP — Witness: W-CP-CALLOUT-ORACLE.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.compiere.model.CalloutInventory', function (CalloutEngine, R) {
    var Env = R.Env, M = R.M;
    function CalloutInventory() { CalloutEngine.call(this); }
    CalloutInventory.prototype = Object.create(CalloutEngine.prototype);
    // product :44-128 — fires on M_Product_ID / M_Locator_ID / M_AttributeSetInstance_ID; QtyBook for a physical inventory
    CalloutInventory.prototype.product = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive()) return '';
      var doctypeid = Env.getContextAsInt(ctx, WindowNo, 'C_DocType_ID');   // :50-56 set docSubTypeInv
      var docSubTypeInv = null;
      if (doctypeid > 0) { var dt = M.MDocType.get(ctx, doctypeid); docSubTypeInv = dt.getDocSubTypeInv(); }
      if ('M_Product_ID' === mField.getColumnName()) mTab.setValue('M_AttributeSetInstance_ID', 0);   // :57-60 remove old ASI
      var M_Product_ID = 0;                                          // :62-67 Get Book Value
      var Product = mTab.getValue('M_Product_ID');
      if (Product != null) M_Product_ID = Product;
      if (M_Product_ID === 0) return '';
      var M_Locator_ID = 0;                                          // :68-73
      var Locator = mTab.getValue('M_Locator_ID');
      if (Locator != null) M_Locator_ID = Locator;
      if (M_Locator_ID === 0) return '';
      var M_AttributeSetInstance_ID = 0;                             // :75-79 Set Attribute
      var ASI = mTab.getValue('M_AttributeSetInstance_ID');
      if (ASI != null) M_AttributeSetInstance_ID = ASI;
      if ('M_Product_ID' === mField.getColumnName()) {               // :80-94 Product Selection
        if (Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_Product_ID') === M_Product_ID)
          M_AttributeSetInstance_ID = Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_AttributeSetInstance_ID');
        else M_AttributeSetInstance_ID = 0;
        if (M_AttributeSetInstance_ID !== 0) mTab.setValue('M_AttributeSetInstance_ID', M_AttributeSetInstance_ID);
        else mTab.setValue('M_AttributeSetInstance_ID', 0);
      }
      var bd = null;                                                 // :97-119 Set QtyBook from first storage location
      if ('PI' === docSubTypeInv) {                                  // MDocType.DOCSUBTYPEINV_PhysicalInventory
        try {
          // :101-107 GridTable.isImporting → importer trx: the page never imports through a GridTab (CSV import is a separate path)
          if (mTab.getValue('M_Inventory_ID') == null) return null;
          var inventory = R.PO.get('M_Inventory', mTab.getValue('M_Inventory_ID'));
          bd = M.MStorageOnHand.getQtyOnHandForLocatorWithASIMovementDate(M_Product_ID, M_Locator_ID, M_AttributeSetInstance_ID, inventory.getMovementDate(), null);
          mTab.setValue('QtyBook', bd);
        } catch (e) { return (e && e.message) || String(e); }
      }
      return '';
    };
    return CalloutInventory;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

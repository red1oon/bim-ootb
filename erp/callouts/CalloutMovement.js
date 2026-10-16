// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutMovement.js — org.compiere.model.CalloutMovement, ported verbatim, 3 methods + checkQtyAvailable
// (org.adempiere.base.callout/src/org/compiere/model/CalloutMovement.java). §CP — Witness: W-CP-CALLOUT-ORACLE.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.compiere.model.CalloutMovement', function (CalloutEngine, R) {
    var Env = R.Env, RM = R.RM, M = R.M;
    function I(v) { return v == null ? 0 : v; }
    function unbox(v, what) { if (v == null) throw new Error('java.lang.NullPointerException: ' + what + ' is null'); return v; }   // (Integer) cast unboxing
    function CalloutMovement() { CalloutEngine.call(this); }
    CalloutMovement.prototype = Object.create(CalloutEngine.prototype);
    var P = CalloutMovement.prototype;

    // product :49-70
    P.product = function (ctx, WindowNo, mTab, mField, value) {
      var M_Product_ID = value;
      if (M_Product_ID == null || M_Product_ID === 0) return '';
      if (Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_Product_ID') === M_Product_ID &&       // :55-60 Set Attribute
          Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_AttributeSetInstance_ID') !== 0)
        mTab.setValue('M_AttributeSetInstance_ID', Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'M_AttributeSetInstance_ID'));
      else mTab.setValue('M_AttributeSetInstance_ID', 0);
      var product = M.MProduct.get(ctx, M_Product_ID);              // :62-66
      mTab.setValue('C_UOM_ID', I(product.getC_UOM_ID()));
      mTab.setValue('MovementQty', mTab.getValue('QtyEntered'));
      checkQtyAvailable(ctx, mTab, WindowNo, M_Product_ID, null);
      return '';
    };

    // qty :80-150
    P.qty = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null || mTab.getValue('M_Product_ID') == null) return '';
      var movementQty = Env.ZERO, qtyEntered = Env.ZERO, C_UOM_To_ID = 0, conversion;
      var M_Product_ID = mTab.getValue('M_Product_ID');
      if (mField.getColumnName() === 'C_UOM_ID' || mField.getColumnName() === 'QtyEntered') {   // :89-114 Change Movement Qty
        if (mField.getColumnName() === 'C_UOM_ID') { C_UOM_To_ID = value; qtyEntered = mTab.getValue('QtyEntered'); }
        else if (mField.getColumnName() === 'QtyEntered') { C_UOM_To_ID = unbox(mTab.getValue('C_UOM_ID'), 'C_UOM_ID'); qtyEntered = value; }
        var qtyEntered1 = qtyEntered.setScale(M.MUOM.getPrecision(ctx, C_UOM_To_ID), RM.HALF_UP);
        if (qtyEntered.compareTo(qtyEntered1) !== 0) { qtyEntered = qtyEntered1; mTab.setValue('QtyEntered', qtyEntered); }
        movementQty = M.MUOMConversion.convertProductFrom(ctx, M_Product_ID, C_UOM_To_ID, qtyEntered);
        if (movementQty == null) movementQty = qtyEntered;
        conversion = qtyEntered.compareTo(movementQty) !== 0;
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
        mTab.setValue('MovementQty', movementQty);
      } else if (mField.getColumnName() === 'MovementQty') {        // :115-140 MovementQty
        C_UOM_To_ID = unbox(mTab.getValue('C_UOM_ID'), 'C_UOM_ID');
        movementQty = value;
        var precision = M.MProduct.getUOMPrecision(M.MProduct.get(ctx, M_Product_ID));
        var movementQty1 = movementQty.setScale(precision, RM.HALF_UP);
        if (movementQty.compareTo(movementQty1) !== 0) { movementQty = movementQty1; mTab.setValue('MovementQty', movementQty); }
        qtyEntered = M.MUOMConversion.convertProductTo(ctx, M_Product_ID, C_UOM_To_ID, movementQty);
        if (qtyEntered == null) qtyEntered = movementQty;
        conversion = movementQty.compareTo(qtyEntered) !== 0;
        Env.setContext(ctx, WindowNo, 'UOMConversion', conversion ? 'Y' : 'N');
        mTab.setValue('QtyEntered', qtyEntered);
      } else {                                                      // :141-143 ASI
        movementQty = mTab.getValue('MovementQty');
      }
      checkQtyAvailable(ctx, mTab, WindowNo, M_Product_ID, movementQty);
      return '';
    };

    // locator :158-165
    P.locator = function (ctx, WindowNo, mTab, mField, value) {
      if (value == null) return '';
      var M_Product_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Product_ID');
      checkQtyAvailable(ctx, mTab, WindowNo, M_Product_ID, null);
      return '';
    };

    // checkQtyAvailable :175-198 — status events only (no field)
    function checkQtyAvailable(ctx, mTab, WindowNo, M_Product_ID, MovementQty) {
      if (M_Product_ID !== 0) {
        var product = M.MProduct.get(ctx, M_Product_ID);
        if (product.isStocked()) {
          if (MovementQty == null) MovementQty = mTab.getValue('MovementQty');
          var M_Locator_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_Locator_ID');
          if (M_Locator_ID <= 0) return;                            // If no locator, don't check anything and assume is ok
          var M_AttributeSetInstance_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'M_AttributeSetInstance_ID');
          var available = M.MStorageOnHand.getQtyOnHandForLocator(M_Product_ID, M_Locator_ID, M_AttributeSetInstance_ID, null);
          if (available == null) available = Env.ZERO;
          if (available.signum() === 0) mTab.fireDataStatusEEvent('NoQtyAvailable', '0', false);
          else if (available.compareTo(MovementQty) < 0) mTab.fireDataStatusEEvent('InsufficientQtyAvailable', available.toString(), false);
        }
      }
    }
    return CalloutMovement;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

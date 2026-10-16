// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutRequisition.js — org.compiere.model.CalloutRequisition (product, amt, setPrice), ported verbatim
// (org.adempiere.base.callout/src/org/compiere/model/CalloutRequisition.java). §CP — Witness: W-CP-CALLOUT-ORACLE.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.compiere.model.CalloutRequisition', function (CalloutEngine, R) {
    var Env = R.Env, RM = R.RM, M = R.M;
    // GridTabWrapper (org/adempiere/model/GridTabWrapper.java invoke): getX → value, else 0 (int) / ZERO (BigDecimal); setX → setValue
    function W(tab) { return {
      getInt: function (c) { var v = tab.getValue(c); return v == null ? 0 : v; },
      getBD: function (c) { var v = tab.getValue(c); return v == null ? Env.ZERO : v; },
      get: function (c) { return tab.getValue(c); },
      set: function (c, v) { tab.setValue(c, v); }
    }; }
    function CalloutRequisition() { CalloutEngine.call(this); }
    CalloutRequisition.prototype = Object.create(CalloutEngine.prototype);
    var P = CalloutRequisition.prototype;
    // product :47-60
    P.product = function (ctx, WindowNo, mTab, mField, value) {
      var M_Product_ID = value;
      if (M_Product_ID == null || M_Product_ID === 0) return '';
      var req = W(mTab.getParentTab()), line = W(mTab);
      setPrice(ctx, WindowNo, req, line);
      var product = M.MProduct.get(ctx, M_Product_ID);
      line.set('C_UOM_ID', product.getC_UOM_ID() == null ? 0 : product.getC_UOM_ID());
      return '';
    };
    // amt :71-98
    P.amt = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var req = W(mTab.getParentTab()), line = W(mTab);
      if (mField.getColumnName() === 'Qty' && 'Y' === Env.getContext(ctx, WindowNo, 'DiscountSchema'))   // :78-83 Qty changed - recalc price
        setPrice(ctx, WindowNo, req, line);
      var StdPrecision = Env.getContextAsInt(ctx, WindowNo, 'StdPrecision');
      var Qty = line.getBD('Qty'), PriceActual = line.getBD('PriceActual');
      var LineNetAmt = Qty.multiply(PriceActual);                   // :88-93 Multiply
      if (LineNetAmt.scale() > StdPrecision) LineNetAmt = LineNetAmt.setScale(StdPrecision, RM.HALF_UP);
      line.set('LineNetAmt', LineNetAmt);
      return '';
    };
    // setPrice :100-117
    function setPrice(ctx, WindowNo, req, line) {
      var C_BPartner_ID = line.getInt('C_BPartner_ID');
      var Qty = line.getBD('Qty'), isSOTrx = false;
      var pp = M.Core.getProductPricing();
      pp.setInitialValues(line.getInt('M_Product_ID'), C_BPartner_ID, Qty, isSOTrx, null);
      var M_PriceList_ID = req.getInt('M_PriceList_ID');
      pp.setM_PriceList_ID(M_PriceList_ID);
      var M_PriceList_Version_ID = Env.getContextAsInt(ctx, WindowNo, 'M_PriceList_Version_ID');
      pp.setM_PriceList_Version_ID(M_PriceList_Version_ID);
      var orderDate = req.get('DateRequired');
      pp.setPriceDate(orderDate);
      line.set('PriceActual', pp.getPriceStd());
      Env.setContext(ctx, WindowNo, 'EnforcePriceLimit', pp.isEnforcePriceLimit() ? 'Y' : 'N');   // not used
      Env.setContext(ctx, WindowNo, 'DiscountSchema', pp.isDiscountSchema() ? 'Y' : 'N');
    }
    return CalloutRequisition;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

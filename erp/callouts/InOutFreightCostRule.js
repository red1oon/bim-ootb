// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/InOutFreightCostRule.js — @Callout(M_InOut.FreightCostRule) org.adempiere.base.callout.InOutFreightCostRule, verbatim
// (org.adempiere.base.callout/src/org/adempiere/base/callout/InOutFreightCostRule.java:42-73). §CP — Witness: W-CP-CALLOUT-ORACLE.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  var R = A.RUNTIME, Env = R.Env;
  // ShippingUtil.getBPShipperAccount (org/adempiere/util/ShippingUtil.java:144-156)
  function getBPShipperAccount(shipper_id, c_bpartner_id, c_bpartner_location_id, org_id) {
    var sql = 'SELECT sa.ShipperAccount FROM C_BP_ShippingAcct sa WHERE sa.M_ShippingProcessor_ID IN (SELECT DISTINCT M_ShippingProcessor_ID FROM M_Shipper WHERE M_Shipper_ID = ?) ' +
      "AND sa.IsActive = 'Y' AND sa.C_BPartner_ID = ? AND (sa.C_BPartner_Location_ID IS NULL OR sa.C_BPartner_Location_ID = ?) AND sa.AD_Org_ID IN (0, ?) ORDER BY C_BPartner_Location_ID, AD_Org_ID ";
    try { return R.DB.getSQLValueString(null, sql, shipper_id, c_bpartner_id, c_bpartner_location_id, org_id); }
    catch (e) { R.unportedDep('ShippingUtil.getBPShipperAccount', 'C_BP_ShippingAcct (' + ((e && e.message) || e) + ') → null'); return null; }
  }
  A.defineColumnCallout('M_InOut', ['FreightCostRule'], 'org.adempiere.base.callout.InOutFreightCostRule',
    function (ctx, WindowNo, mTab, mField, value, oldValue) {
      var FreightCostRule = mTab.getValue('FreightCostRule');
      if (FreightCostRule == null) { mTab.setValue('ShipperAccount', null); return ''; }       // :50-54
      if (FreightCostRule === 'U') {                                // :55-66 MInOut.FREIGHTCOSTRULE_CustomerAccount = "U"
        var M_Shipper_ID = Env.getContextAsInt(ctx, WindowNo, 'M_Shipper_ID');
        var C_BPartner_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_ID');
        var C_BPartner_Location_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BPartner_Location_ID');
        var AD_Org_ID = Env.getContextAsInt(ctx, WindowNo, 'AD_Org_ID');
        var shipperAccount = getBPShipperAccount(M_Shipper_ID, C_BPartner_ID, C_BPartner_Location_ID, AD_Org_ID);
        mTab.setValue('ShipperAccount', shipperAccount);
        mTab.setValue('FreightCharges', 'A_Col');                  // MInOut.FREIGHTCHARGES_Collect = "A_Col"
      }
      return '';
    });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

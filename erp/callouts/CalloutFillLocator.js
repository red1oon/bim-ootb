// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutFillLocator.js — org.idempiere.model.CalloutFillLocator.fillLocator, ported verbatim
// (org.adempiere.base/src/org/idempiere/model/CalloutFillLocator.java:37-52). §CP — Witness: W-CP-CALLOUT-ORACLE.
function idSet(v) { return (Number(v) || 0) !== 0; }   // legacy `get<Col>_ID() > 0` for the twin's id law: a row made through the op log has a NEGATIVE synthetic pk (crud_core listTip -opId), so "an id is set" = non-zero (same rule as ModelLayer.idSet; MIGRATE_INSTALL_TENANT §IDLAW-SPEC)
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.idempiere.model.CalloutFillLocator', function (CalloutEngine, R) {
    var Env = R.Env, M = R.M;
    function CalloutFillLocator() { CalloutEngine.call(this); }
    CalloutFillLocator.prototype = Object.create(CalloutEngine.prototype);
    // fillLocator :37-52 — an emptied locator falls back to the window warehouse's default locator
    CalloutFillLocator.prototype.fillLocator = function (ctx, WindowNo, mTab, mField, value) {
      var locatorID = value;
      if (locatorID == null || locatorID === 0) {
        var warehouseID = Env.getContextAsInt(ctx, WindowNo, 'M_Warehouse_ID', true);
        if (idSet(warehouseID)) {
          var wh = M.MWarehouse.get(ctx, warehouseID);
          var defaultLocator = M.MWarehouse.getDefaultLocator(wh);
          if (defaultLocator != null) mTab.setValue(mField, defaultLocator.getM_Locator_ID());
        }
      }
      return '';
    };
    return CalloutFillLocator;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

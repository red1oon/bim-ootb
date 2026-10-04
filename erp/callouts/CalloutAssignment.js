// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutAssignment.js — org.compiere.model.CalloutAssignment, ported verbatim (bim-compiler
// prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE). Java: org.adempiere.base.callout/src/org/compiere/model/CalloutAssignment.java.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;

  A.defineCallout('org.compiere.model.CalloutAssignment', function (CalloutEngine, R) {
    function CalloutAssignment() { CalloutEngine.call(this); }
    CalloutAssignment.prototype = Object.create(CalloutEngine.prototype);
    CalloutAssignment.prototype.constructor = CalloutAssignment;

    // ══ product :47-112 — S_ResourceAssignment_ID → M_Product_ID, Description, Qty ══
    CalloutAssignment.prototype.product = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var S_ResourceAssignment_ID = value;                                         // :52 get value
      if (S_ResourceAssignment_ID === 0) return '';
      var M_Product_ID = 0, Name = null, Description = null, Qty = null;
      var ps = R.DB.prepareStatement('SELECT p.M_Product_ID, ra.Name, ra.Description, ra.Qty ' +   // :60-63
        'FROM S_ResourceAssignment ra' + ' INNER JOIN M_Product p ON (p.S_Resource_ID=ra.S_Resource_ID) ' +
        'WHERE ra.S_ResourceAssignment_ID=?');
      ps.setInt(1, S_ResourceAssignment_ID);
      var rs = ps.executeQuery();
      if (rs.next()) {                                                             // :71-77
        M_Product_ID = rs.getInt(1);
        Name = rs.getString(2);
        Description = rs.getString(3);
        Qty = rs.getBigDecimal(4);
      }
      if (M_Product_ID !== 0) {                                                    // :90-108
        mTab.setValue('M_Product_ID', M_Product_ID);
        if (Description != null) Name += ' (' + Description + ')';
        if (!('.' === Name)) mTab.setValue('Description', Name);
        var variable = 'Qty';                                                      // TimeExpenseLine
        if (mTab.getTableName().indexOf('C_Order') === 0) variable = 'QtyOrdered';
        else if (mTab.getTableName().indexOf('C_Invoice') === 0) variable = 'QtyInvoiced';
        if (Qty != null) mTab.setValue(variable, Qty);
        mTab.setValue('QtyEntered', Qty);                                          // :107 red1 BR2836655 (outside the if, as in Java)
      }
      return '';
    };
    return CalloutAssignment;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

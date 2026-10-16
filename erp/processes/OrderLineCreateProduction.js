// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/OrderLineCreateProduction.js — org.compiere.process.OrderLineCreateProduction, verbatim up to the manufacturing
// boundary (org.adempiere.base.process/src/org/compiere/process/OrderLineCreateProduction.java). §CP-PROC-CORE family B — Witness: W-CP-PROC-ORACLE.
// NAMED DEP (not core, CLAUDE.md §AD-LAYER LAW rule 6): MProduction / MPPProductBOM / M_Production table are absent from the bundle, so from
// :104 on (the first read of M_Production) the process logs §PROC-UNPORTED-DEP and returns '@Error@' (SvrProcess: failed, no ops committed).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.OrderLineCreateProduction', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function OrderLineCreateProduction() { SvrProcess.call(this); this.p_C_OrderLine_ID = 0; }
    OrderLineCreateProduction.prototype = Object.create(SvrProcess.prototype);
    OrderLineCreateProduction.prototype.prepare = function () { this.p_C_OrderLine_ID = this.getRecord_ID(); };   // :48-51
    OrderLineCreateProduction.prototype.doIt = function () {                          // :59-163
      var A = X.A, g = G(), T = g.T(), D = T.D, trx = this.get_TrxName(), ctx = this.getCtx();
      var M = function (k) { return A.Msg.getMsg(ctx, k); };
      if (this.p_C_OrderLine_ID === 0) throw new Error(M('No OrderLine'));            // :66
      var line = trx.get('c_orderline', this.p_C_OrderLine_ID);                       // :69
      if (!line) throw new Error(M('Order line not found'));                          // :71
      var order = trx.get('c_order', line.c_order_id);                                // :72
      if ('CO' !== order.docstatus) throw new Error(M('Order not completed'));        // :73-74
      var doc = trx.get('c_doctype', order.c_doctype_id);                             // :75
      if (D(line.qtyordered).subtract(D(line.qtydelivered)).compareTo(A.Env.ZERO) <= 0) {   // :77
        if (doc == null || doc.docsubtypeso == null) throw new Error('java.lang.NullPointerException: getDocSubTypeSO() is null');   // :79 .equals on null
        if (doc.docsubtypeso !== 'ON') return M('Ordered quantity already shipped');  // :79-82 (Consignment and stock orders both have subtype ON)
      }
      trx.say('§PROC-UNPORTED-DEP OrderLineCreateProduction :85-161 needs M_Production/MProduction + PP_Product_BOM (MPPProductBOM.getDefault) — manufacturing is not core; bundle has no M_Production');
      return '@Error@';
    };
    return OrderLineCreateProduction;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

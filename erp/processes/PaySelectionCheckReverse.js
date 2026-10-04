// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/PaySelectionCheckReverse.js — org.compiere.process.PaySelectionCheckReverse, verbatim
// (org.adempiere.base.process/src/org/compiere/process/PaySelectionCheckReverse.java). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.PaySelectionCheckReverse', function (SvrProcess, X) {
    var ML = X.ML;
    function PaySelectionCheckReverse() { SvrProcess.call(this); }
    PaySelectionCheckReverse.prototype = Object.create(SvrProcess.prototype);
    PaySelectionCheckReverse.prototype.prepare = function () {};                                            // :44
    PaySelectionCheckReverse.prototype.doIt = function () {                                                 // :52-77
      var trx = this.get_TrxName(), PAY = P.PSUP.pay;
      var ps = trx.get('c_payselection', this.getRecord_ID());
      if (ps == null) throw new Error('PO.load: not found C_PaySelection_ID=' + this.getRecord_ID());       // new MPaySelection(ctx, id) → getC_PaySelection_ID()
      var list = trx.find('c_payselectioncheck', { c_payselection_id: ps.c_payselection_id }, ['c_payselectioncheck_id']);   // Query ... setOrderBy(C_PaySelectionCheck_ID)
      for (var i = 0; i < list.length; i++) {
        var psc = list[i];
        if (psc.c_payment_id != null && Number(psc.c_payment_id) > 0) return '@Error@ @C_PaySelectionCheck_ID@ @Processed@';
        trx.find('c_payselectionline', { c_payselectioncheck_id: psc.c_payselectioncheck_id }, ['line']).forEach(function (psl) {   // getPaySelectionLines(false) — ORDER BY Line
          PAY.saveRow(trx, 'c_payselectionline', psl, { c_payselectioncheck_id: null, processed: 'N' });    // setC_PaySelectionCheck_ID(0); setProcessed(false); saveEx()
        });
        var r = ML.remove(trx, 'c_payselectioncheck', psc);                                                  // psc.deleteEx(true)
        if (!r.ok) throw new Error('DeleteError c_payselectioncheck: ' + r.error);
      }
      PAY.saveRow(trx, 'c_payselection', trx.get('c_payselection', ps.c_payselection_id), { processed: 'N' });   // ps.setProcessed(false); saveEx()
      return '@Deleted@ #' + list.length;
    };
    return PaySelectionCheckReverse;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

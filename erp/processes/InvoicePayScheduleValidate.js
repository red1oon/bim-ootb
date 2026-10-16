// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/InvoicePayScheduleValidate.js — org.compiere.process.InvoicePayScheduleValidate, verbatim
// (org.adempiere.base.process/src/org/compiere/process/InvoicePayScheduleValidate.java). §CP — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.InvoicePayScheduleValidate', function (SvrProcess, X) {
    function InvoicePayScheduleValidate() { SvrProcess.call(this); }
    InvoicePayScheduleValidate.prototype = Object.create(SvrProcess.prototype);
    InvoicePayScheduleValidate.prototype.prepare = function () {                     // :45-54
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) if (para[i].getParameter() != null) X.A.RUNTIME.log('§PROC-UNKNOWN-PARA InvoicePayScheduleValidate ' + para[i].getParameterName());
    };
    InvoicePayScheduleValidate.prototype.doIt = function () {                         // :61-94
      var A = X.A, R = A.RUNTIME, Env = A.Env, trx = this.get_TrxName();
      // MInvoicePaySchedule.getInvoicePaySchedule(ctx, 0, Record_ID) (M/MInvoicePaySchedule.java:55-96)
      var schedule = R.DB.query("SELECT ips.C_InvoicePaySchedule_ID AS id FROM C_InvoicePaySchedule ips WHERE IsActive='Y' AND EXISTS (SELECT * FROM C_InvoicePaySchedule x" +
        ' WHERE x.C_InvoicePaySchedule_ID=? AND ips.C_Invoice_ID=x.C_Invoice_ID) ORDER BY DueDate', [this.getRecord_ID()]).map(function (r) { return X.get(trx, 'C_InvoicePaySchedule', r.id); });
      if (schedule.length === 0) throw new Error('InvoicePayScheduleValidate - No Schedule');
      var invoice = X.get(trx, 'C_Invoice', schedule[0].getC_Invoice_ID());               // :70-73
      if (invoice == null || invoice.get_ID() === 0) throw new Error('InvoicePayScheduleValidate - No Invoice');
      var total = Env.ZERO;                                                             // :75-81
      for (var i = 0; i < schedule.length; i++) { var due = schedule[i].getDueAmt(); if (due != null) total = total.add(due); }
      var valid = invoice.getGrandTotal().compareTo(total) === 0;
      var r1 = X.save(trx, 'C_Invoice', invoice, { IsPayScheduleValid: valid });        // :82-84 saveEx
      if (!r1.ok) throw new Error(r1.error || 'SaveError');
      for (var j = 0; j < schedule.length; j++) {                                       // :86-93
        if (schedule[j].isValid() !== valid) { var r2 = X.save(trx, 'C_InvoicePaySchedule', schedule[j], { IsValid: valid }); if (!r2.ok) throw new Error(r2.error || 'SaveError'); }
      }
      var msg = '@OK@';
      if (!valid) msg = '@GrandTotal@ = ' + invoice.getGrandTotal() + ' <> @Total@ = ' + total + '  - @Difference@ = ' + invoice.getGrandTotal().subtract(total);
      return A.Msg.parseTranslation(this.getCtx(), msg);
    };
    return InvoicePayScheduleValidate;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

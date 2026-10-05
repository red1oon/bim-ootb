// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/YearCreatePeriods.js — org.compiere.process.YearCreatePeriods, verbatim
// (org.adempiere.base.process/src/org/compiere/process/YearCreatePeriods.java) + the model code it calls:
// MYear.createStdPeriods (M/MYear.java:209-285), MPeriod ctor/beforeSave/afterSave (M/MPeriod.java:564-574, 799-873).
// §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.YearCreatePeriods', function (SvrProcess, X) {
    var MT = (typeof module !== 'undefined' && module.exports) ? require('../model_trade') : global.ModelTrade;   // MYear.createStdPeriods / MPeriod live in model_trade.js (§CP-OPEN 4b)
    function YearCreatePeriods() { SvrProcess.call(this); this.p_C_Year_ID = 0; this.p_StartDate = null; this.p_DateFormat = null; }
    YearCreatePeriods.prototype = Object.create(SvrProcess.prototype);
    YearCreatePeriods.prototype.prepare = function () {                               // :41-58
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'StartDate') this.p_StartDate = para[i].getParameter();
        else if (name === 'DateFormat') this.p_DateFormat = para[i].getParameter();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA YearCreatePeriods ' + name);
      }
      this.p_C_Year_ID = this.getRecord_ID();
    };
    YearCreatePeriods.prototype.doIt = function () {                                  // :66-77
      var A = X.A, trx = this.get_TrxName();
      var year = X.get(trx, 'C_Year', this.p_C_Year_ID);
      if (this.p_C_Year_ID === 0 || year == null || year.get_ID() !== this.p_C_Year_ID)
        throw A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), '@NotFound@: @C_Year_ID@ - ' + this.p_C_Year_ID));
      MT.MYear_createStdPeriods(trx, this.getCtx(), year, this.p_StartDate, this.p_DateFormat);   // MYear.createStdPeriods(null, StartDate, DateFormat) :209-285
      return '@OK@';                                                                    // :72-73
    };
    return YearCreatePeriods;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

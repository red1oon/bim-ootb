// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/CostCreate.js — org.compiere.process.CostCreate, verbatim
// (org.adempiere.base.process/src/org/compiere/process/CostCreate.java). §CP — Witness: W-CP-PROC-ORACLE.
// Its body is MCostDetail.processProduct (costing engine — model layer, not this lane): called when the model layer
// exports it (ModelLayer.MODEL_STATICS.MCostDetail.processProduct), else a named §PROC-UNPORTED-DEP and "@Error@".
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.CostCreate', function (SvrProcess, X) {
    function CostCreate() { SvrProcess.call(this); this.p_M_Product_ID = 0; }
    CostCreate.prototype = Object.create(SvrProcess.prototype);
    CostCreate.prototype.prepare = function () {                                      // :45-58
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'M_Product_ID') this.p_M_Product_ID = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA CostCreate ' + name);
      }
    };
    CostCreate.prototype.doIt = function () {                                        // :65-75
      var A = X.A, R = A.RUNTIME;
      if (this.p_M_Product_ID === 0) throw A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), '@NotFound@: @M_Product_ID@ = ' + this.p_M_Product_ID));
      var product = R.PO.get('M_Product', this.p_M_Product_ID);
      if (product == null || product.get_ID() !== this.p_M_Product_ID) throw A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), '@NotFound@: @M_Product_ID@ = ' + this.p_M_Product_ID));
      var ML = X.ML, cd = ML && ML.MODEL_STATICS && ML.MODEL_STATICS.MCostDetail;
      if (!cd || typeof cd.processProduct !== 'function') {
        this.get_TrxName().say('§PROC-UNPORTED-DEP CostCreate needs MCostDetail.processProduct (costing engine, model layer) — not exported');
        return '@Error@';
      }
      if (cd.processProduct(this.get_TrxName(), product)) return '@OK@';
      return '@Error@';
    };
    return CostCreate;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

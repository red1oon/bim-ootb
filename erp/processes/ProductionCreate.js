// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ProductionCreate.js — org.compiere.process.ProductionCreate (org.adempiere.base.process/src/org/compiere/process/ProductionCreate.java).
// Manufacturing is NOT core (CLAUDE.md §AD-LAYER LAW rule 6): the process shell is verbatim; MProduction.validateEndProduct / createLines / deleteLines and
// MProductionPlan.* (the M_Production line generator) are a NAMED DEP (§PROC-UNPORTED-DEP) — those branches follow the Java's own "created == 0" return.
// §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE (no table-changing case: the deps are the whole body of work).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.ProductionCreate', function (SvrProcess, X) {
    var MT = (typeof module !== 'undefined' && module.exports) ? require('../model_trade') : global.ModelTrade;   // numbers / MInventoryLine / SimpleDateFormat statics live in model_trade.js (§CP-OPEN 4b)
    function ProductionCreate() { SvrProcess.call(this); this.p_M_Production_ID = 0; this.m_production = null; this.recreate = false; this.newQty = null; this.p_PP_Product_BOM_ID = 0; }
    ProductionCreate.prototype = Object.create(SvrProcess.prototype);
    ProductionCreate.prototype.prepare = function () {                               // :45-65
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if ('Recreate' === name) this.recreate = 'Y' === para[i].getParameter();
        else if ('ProductionQty' === name) this.newQty = para[i].getParameter();
        else if ('PP_Product_BOM_ID' === name) this.p_PP_Product_BOM_ID = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ProductionCreate ' + name);
      }
      this.p_M_Production_ID = this.getRecord_ID();
      this.m_production = this.p_M_Production_ID ? X.get(this.get_TrxName(), 'M_Production', this.p_M_Production_ID) : null;
    };
    ProductionCreate.prototype.doIt = function () {                                  // :68-77
      if (this.m_production == null || this.m_production.get_ID() === 0) throw X.A.AdempiereException('Could not load production header');
      if (this.m_production.isProcessed()) return 'Already processed';
      return this.createLines();
    };
    ProductionCreate.prototype.createLines = function () {                           // :79-112
      var trx = this.get_TrxName(), S = P.PSTK, created = 0, p = this.m_production;
      if (!p.isUseProductionPlan()) {
        MT.dep(trx, 'ProductionCreate: MProduction.validateEndProduct / deleteLines / createLines (M/MProduction.java — manufacturing, not core)');
        if (!this.recreate && 'Y' === String(p.getIsCreated()).toUpperCase()) throw X.A.AdempiereException('Production already created.');
      } else {
        MT.dep(trx, 'ProductionCreate: M_ProductionPlan query + MProductionPlan.deleteLines/createLines (M_ProductionPlan absent from the bundle — manufacturing, not core)');
      }
      if (created === 0) return 'Failed to create production lines';                 // :107-108
      return created + ' production lines were created';
    };
    return ProductionCreate;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

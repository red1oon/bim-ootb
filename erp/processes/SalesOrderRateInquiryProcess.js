// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/SalesOrderRateInquiryProcess.js — org.adempiere.process.SalesOrderRateInquiryProcess
// (org.adempiere.base/src/org/adempiere/process/SalesOrderRateInquiryProcess.java). The pre-checks (:70-112) are verbatim; the rate inquiry itself
// (createShippingTransaction :200-, MShippingTransaction.processOnline = a call to the shipper's carrier web service) is a NAMED DEP
// (§PROC-UNPORTED-DEP) and takes the Java's own failure path (:176-184: process error + "@Error@").
// §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE (INCONCLUSIVE by nature: a successful run needs the external carrier).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.adempiere.process.SalesOrderRateInquiryProcess', function (SvrProcess, X) {
    function SalesOrderRateInquiryProcess() { SvrProcess.call(this); this.p_IsPriviledgedRate = false; }
    SalesOrderRateInquiryProcess.prototype = Object.create(SvrProcess.prototype);
    SalesOrderRateInquiryProcess.prototype.prepare = function () {                   // :64-77
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'IsPriviledgedRate') this.p_IsPriviledgedRate = para[i].getParameter() === 'Y';
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA SalesOrderRateInquiryProcess ' + name);
      }
    };
    SalesOrderRateInquiryProcess.prototype.doIt = function () {                      // :80-190
      var A = X.A, trx = this.get_TrxName(), S = P.PSTK;
      var order = X.get(trx, 'C_Order', this.getRecord_ID());
      if (order == null || !order.getM_Shipper_ID()) throw A.AdempiereException('FillMandatory: M_Shipper_ID');   // FillMandatoryException
      var ci = trx.q('SELECT * FROM AD_ClientInfo WHERE AD_Client_ID=?', [this.getAD_Client_ID()])[0] || {};
      var nz = function (v) { return v == null ? 0 : Number(v); };
      if (nz(ci.c_chargefreight_id) === 0 && nz(ci.m_productfreight_id) === 0) throw A.AdempiereException('Product or Charge for Freight is not defined at Tenant window > Tenant Info tab');
      if (nz(ci.c_uom_weight_id) === 0) throw A.AdempiereException('UOM for Weight is not defined at Tenant window > Tenant Info tab');
      if (nz(ci.c_uom_length_id) === 0) throw A.AdempiereException('UOM for Length is not defined at Tenant window > Tenant Info tab');
      var ols = trx.find('c_orderline', { c_order_id: order.get_ID() }, ['line']);   // MOrder.getLines(false, Line) — active lines
      ols = ols.filter(function (l) { return l.isactive !== 'N'; });
      if (ols.length === 0) throw A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), '@NoLines@'));
      for (var i = 0; i < ols.length; i++) {
        var ol = ols[i];
        if ((nz(ol.m_product_id) > 0 && nz(ol.m_product_id) === nz(ci.m_productfreight_id)) || (nz(ol.c_charge_id) > 0 && nz(ol.c_charge_id) === nz(ci.c_chargefreight_id))) continue;
        else if (nz(ol.m_product_id) > 0) {
          var product = trx.get('m_product', ol.m_product_id);
          if (product && product.producttype === 'S') continue;                       // isService
          if (!product || product.weight == null || Number(product.weight) === 0) throw A.AdempiereException('No weight defined for product ' + (product ? 'MProduct[' + product.m_product_id + '-' + product.name + ']' : ol.m_product_id));
        }
      }
      // :111-120 createShippingTransaction + st.processOnline() — the carrier call
      S.dep(trx, 'SalesOrderRateInquiryProcess: MShippingTransaction.processOnline — external shipping carrier web service (ShippingUtil / IShipping client), not in the bundle');
      this.m_pi.isError = true;                                                       // getProcessInfo().setError(true)
      this.addLog(0, null, null, 'Shipping rate inquiry needs the external carrier service (not available)');
      return '@Error@';                                                               // :176-184
    };
    return SalesOrderRateInquiryProcess;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

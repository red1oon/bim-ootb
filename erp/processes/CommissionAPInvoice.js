// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/CommissionAPInvoice.js — org.compiere.process.CommissionAPInvoice, verbatim
// (org.adempiere.base.process/src/org/compiere/process/CommissionAPInvoice.java). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
// Model code it calls, ported where the shared ctor layer lacks it (ModelCtor does not export MInvoiceNew): new MInvoice(ctx,0,trx)
// setInitialDefaults (MInvoice.java:438-465, same list as model_ctor.js MInvoiceNew), MInvoice.setM_PriceList_ID currency side-effect
// (:1375-1385), MInvoice.setC_DocTypeTarget_ID(String) (:804-822 = ModelCtor.invSetDocTypeTargetBase), MInvoiceLine(invoice) via ModelCtor.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.CommissionAPInvoice', function (SvrProcess, X) {
    function CommissionAPInvoice() { SvrProcess.call(this); }
    CommissionAPInvoice.prototype = Object.create(SvrProcess.prototype);
    CommissionAPInvoice.prototype.prepare = function () {                            // :53-62
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) if (para[i].getParameter() != null) X.A.RUNTIME.log('§PROC-UNKNOWN-PARA CommissionAPInvoice ' + para[i].getParameterName());
    };
    function ctorMod() { return (typeof module !== 'undefined' && module.exports) ? require('../model_ctor.js') : global.ModelCtor; }
    CommissionAPInvoice.prototype.doIt = function () {                               // :69-128
      var A = X.A, R = A.RUNTIME, ML = X.ML, trx = this.get_TrxName(), S = P.PSTK, C = ctorMod(), MI = (typeof module !== 'undefined' && module.exports) ? require('../model_invoice.js') : global.ModelInvoice;
      var comRun = X.get(trx, 'C_CommissionRun', this.getRecord_ID());
      if (comRun == null || comRun.get_ID() === 0) throw new Error('CommissionAPInvoice - No Commission Run');
      if (A.Env.ZERO.compareTo(comRun.getGrandTotal()) === 0) throw new Error(A.Msg.parseTranslation(this.getCtx(), '@GrandTotal@ = 0'));
      var com = X.get(trx, 'C_Commission', comRun.getC_Commission_ID());
      if (com == null || com.get_ID() === 0) throw new Error('CommissionAPInvoice - No Commission');
      if (com.getC_Charge_ID() === 0 && com.getM_Product_ID() === 0) throw new Error('CommissionAPInvoice - No Charge or Product on Commission');
      var bp = trx.get('c_bpartner', com.getC_BPartner_ID());
      if (bp == null) throw new Error('CommissionAPInvoice - No BPartner');
      // Create Invoice — new MInvoice(ctx,0,trx) :438-465
      var inv = MI.MInvoice_new(trx);
      inv.set('ad_client_id', com.getAD_Client_ID()).set('ad_org_id', com.getAD_Org_ID());      // setClientOrg
      C.invSetDocTypeTargetBase(trx, inv, 'API');                                        // setC_DocTypeTarget_ID(MDocType.DOCBASETYPE_APInvoice)
      C.invSetBPartner(trx, inv, bp);                                                    // setBPartner(bp)
      var plId = inv.get('m_pricelist_id');                                              // MInvoice.setM_PriceList_ID also sets the currency
      if (plId) { var pl = trx.get('m_pricelist', plId); if (pl) inv.set('c_currency_id', pl.c_currency_id); }
      inv.set('salesrep_id', this.getAD_User_ID());
      if (com.getC_Currency_ID() !== (inv.get('c_currency_id') || 0)) throw new Error('CommissionAPInvoice - Currency of PO Price List not Commission Currency');
      if (!inv.save()) throw new Error('CommissionAPInvoice - cannot save Invoice');
      // Create Invoice Line
      var iLine = C.MInvoiceLine(trx, inv);
      if (com.getC_Charge_ID() > 0) iLine.set('c_charge_id', com.getC_Charge_ID()); else iLine.set('m_product_id', com.getM_Product_ID());
      C.ilSetQty(trx, iLine, A.BigDecimal.of(1));                                         // setQty(1)
      iLine.set('priceentered', comRun.getGrandTotal()).set('priceactual', comRun.getGrandTotal());   // setPrice(BigDecimal)
      if (!MI.MInvoiceLine_setTax(trx, this.getCtx(), iLine, trx.get('c_invoice', inv.id()) || inv.values())) throw new Error('CommissionAPInvoice - cannot save Invoice Line');   // setTax() :499-528 (false → "No Tax found"; the Java ignores it, the save then fails on mandatory C_Tax_ID)
      MI.MInvoiceLine_defaultUOM(trx, this.getCtx(), iLine);                             // MInvoiceLine.beforeSave :928-934
      if (!iLine.save()) throw new Error('CommissionAPInvoice - cannot save Invoice Line');
      var cr = trx.get('c_commissionrun', comRun.get_ID());
      S.saveEx(X, trx, 'C_CommissionRun', cr, { c_invoice_id: inv.id(), processed: true });   // :114-116
      this.addBufferLog(0, null, null, A.Msg.getElement(this.getCtx(), 'C_Invoice_ID') + ' #' + inv.get('documentno'), 318, 0);
      return '@Created@';
    };
    return CommissionAPInvoice;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

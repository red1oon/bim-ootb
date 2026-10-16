// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/BOMVerify.js — org.compiere.process.BOMVerify, verbatim
// (org.adempiere.base.process/src/org/compiere/process/BOMVerify.java) + MPPProductBOM.getProductBOMs :78-87, getDefault :155-185,
// getLines(false) :340-352 (org.adempiere.base/src/org/eevolution/model/MPPProductBOM.java). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.BOMVerify', function (SvrProcess, X) {
    function BOMVerify() {
      SvrProcess.call(this); this.p_M_Product_ID = 0; this.p_M_Product_Category_ID = 0; this.p_IsReValidate = false; this.p_fromButton = false;
      this.foundproducts = []; this.validproducts = []; this.invalidproducts = []; this.containinvalidproducts = []; this.checkedproducts = [];
    }
    BOMVerify.prototype = Object.create(SvrProcess.prototype);
    function has(list, id) { return list.indexOf(id) >= 0; }
    BOMVerify.prototype.prepare = function () {                                      // :60-79
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'M_Product_ID') this.p_M_Product_ID = para[i].getParameterAsInt();
        else if (name === 'M_Product_Category_ID') this.p_M_Product_Category_ID = para[i].getParameterAsInt();
        else if (name === 'IsReValidate') this.p_IsReValidate = 'Y' === para[i].getParameter();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA BOMVerify ' + name);
      }
      if (this.p_M_Product_ID === 0) this.p_M_Product_ID = this.getRecord_ID();
      this.p_fromButton = this.getRecord_ID() > 0;
    };
    BOMVerify.prototype.doIt = function () {                                         // :87-134
      var A = X.A, trx = this.get_TrxName(), self = this;
      if (this.p_M_Product_ID !== 0) {
        this.checkProduct(X.get(trx, 'M_Product', this.p_M_Product_ID));
        return 'Product Checked';
      }
      var counter = 0, sql = "SELECT M_Product_ID FROM M_Product WHERE IsBOM='Y' AND ";
      sql += this.p_M_Product_Category_ID === 0 ? 'AD_Client_ID=? ' : 'M_Product_Category_ID=? ';
      if (!this.p_IsReValidate) sql += "AND IsVerified<>'Y' ";
      sql += 'ORDER BY Name';
      var rows = trx.q(sql, [this.p_M_Product_Category_ID === 0 ? A.Env.getAD_Client_ID(this.getCtx()) : this.p_M_Product_Category_ID]);
      rows.forEach(function (r) {
        self.p_M_Product_ID = Number(r.m_product_id);
        self.checkProduct(X.get(trx, 'M_Product', self.p_M_Product_ID));
        counter++;
      });
      return '#' + counter;
    };
    BOMVerify.prototype.checkProduct = function (product) {                          // :136-143
      if (product.isBOM() && !has(this.checkedproducts, product.get_ID())) this.validateProduct(product);
    };
    BOMVerify.prototype.log = function (key, args, product) {                        // addLog / addBufferLog by p_fromButton
      var msg = X.A.Msg.getMsg(this.getCtx(), key, args);
      if (this.p_fromButton) this.addLog(0, null, null, msg);
      else this.addBufferLog(0, null, null, msg, 208, product.get_ID());               // MProduct.Table_ID
    };
    BOMVerify.prototype.validateProduct = function (product) {                       // :150-259
      var A = X.A, trx = this.get_TrxName(), self = this, pid = product.get_ID();
      if (!product.isBOM()) return false;
      if (has(this.validproducts, pid)) return true;
      var containsinvalid = false, invalid = false;
      this.foundproducts.push(pid);
      // MPPProductBOM.getProductBOMs(product): Query setClient_ID (AD_Client_ID IN (0, ctx client)), active
      var boms = trx.q('SELECT * FROM PP_Product_BOM WHERE M_Product_ID=? AND AD_Client_ID IN (0,?) AND IsActive=? ORDER BY PP_Product_BOM_ID', [pid, A.Env.getAD_Client_ID(this.getCtx()), 'Y']);
      for (var bi = 0; bi < boms.length; bi++) {
        var bom = boms[bi];
        var bomLines = trx.q('SELECT * FROM PP_Product_BOMLine WHERE PP_Product_BOM_ID=? AND AD_Client_ID IN (0,?) AND IsActive=? ORDER BY Line', [bom.pp_product_bom_id, A.Env.getAD_Client_ID(this.getCtx()), 'Y']);
        var lines = 0;
        for (var li = 0; li < bomLines.length; li++) {
          var bomLine = bomLines[li];
          lines++;
          var pp = X.get(trx, 'M_Product', bomLine.m_product_id), ppId = pp.get_ID();
          if (!pp.isBOM()) continue;
          if (has(this.validproducts, ppId)) continue;
          if (has(this.invalidproducts, ppId)) containsinvalid = true;
          else if (has(this.foundproducts, ppId)) {
            invalid = true;
            this.log('BOMRecursivelyContains', [product.getValue(), pp.getValue()], product);
          } else if (!this.validateProduct(pp)) containsinvalid = true;
        }
        if (lines === 0) { invalid = true; this.log('BOMForProductDoesNotHaveLines', [bom.value, product.getValue()], product); }
        if (invalid || containsinvalid) break;
      }
      if (boms.length === 0) { invalid = true; this.log('BOMMissingForProduct', [product.getValue()], product); }
      else if (this.getDefaultBOM(product) == null) { invalid = true; this.log('BOMNoDefaultBOMForProduct', [product.getValue()], product); }
      this.checkedproducts.push(pid);
      this.foundproducts.splice(this.foundproducts.indexOf(pid), 1);
      var cur = trx.get('m_product', pid);
      if (invalid) { this.invalidproducts.push(pid); P.PSTK.saveEx(X, trx, 'M_Product', cur, { isverified: false }); return false; }
      else if (containsinvalid) { this.containinvalidproducts.push(pid); P.PSTK.saveEx(X, trx, 'M_Product', cur, { isverified: false }); return false; }
      this.validproducts.push(pid); P.PSTK.saveEx(X, trx, 'M_Product', cur, { isverified: true }); return true;
    };
    // MPPProductBOM.getDefault(product, trx) :155-185 — BOMUse 'A' (Master), BOMType 'A' (Current Active); org filter from the login org
    BOMVerify.prototype.getDefaultBOM = function (product) {
      var A = X.A, trx = this.get_TrxName(), orgId = A.Env.getAD_Org_ID(this.getCtx());
      var sql = 'SELECT * FROM PP_Product_BOM WHERE M_Product_ID=? AND BOMUse=? AND BOMType=? ';
      var args = [product.get_ID(), 'A', 'A'];
      if (orgId > 0) sql += 'AND AD_Org_ID IN (0, ' + orgId + ') ';
      sql += 'AND IsActive=? AND AD_Client_ID IN (0,?)';
      args.push('Y', A.Env.getAD_Client_ID(this.getCtx()));
      if (orgId > 0) sql += ' ORDER BY AD_Org_ID Desc';
      var list = trx.q(sql, args);
      if (list.length > 0 && (orgId > 0 || list.length === 1)) return list[0];
      return null;
    };
    return BOMVerify;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

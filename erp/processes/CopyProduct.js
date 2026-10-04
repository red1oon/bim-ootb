// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/CopyProduct.js — org.compiere.process.CopyProduct, verbatim
// (org.adempiere.base.process/src/org/compiere/process/CopyProduct.java). §CP — Witness: W-CP-PROC-ORACLE.
// A source table absent from the bundle (M_Substitute, M_ProductDownload — no DDL in ad_seed.db) is a named §PROC-UNPORTED-DEP: no rows can exist there, count 0.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.CopyProduct', function (SvrProcess, X) {
    function CopyProduct() { SvrProcess.call(this); this.m_copyFromId = 0; }
    CopyProduct.prototype = Object.create(SvrProcess.prototype);
    CopyProduct.prototype.prepare = function () {                                      // :30-45
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'C_CopyFrom_ID') this.m_copyFromId = para[i].getParameterAsInt();
        else if (name === 'M_Product_ID') this.m_copyFromId = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA CopyProduct ' + name);                 // MProcessPara.validateUnknownParameter
      }
    };
    CopyProduct.prototype.doIt = function () {                                         // :49-186
      var A = X.A, trx = this.get_TrxName(), S = P.PSUP, from = this.m_copyFromId;
      var toMProductID = this.getRecord_ID();
      trx.say('§PROC-INFO CopyProduct From M_Product_ID=' + from + ' to ' + toMProductID);   // :52
      if (toMProductID === 0) throw new Error('Target M_Product_ID == 0');             // :53-54
      if (from === 0) throw new Error('Source M_Product_ID == 0');                     // :55-56
      // new Query(ctx, Table, where, trx).setParameters(...).setOnlyActiveRecords(true).list()
      function list(table, where, cond) {
        try { trx.q('SELECT 1 FROM ' + table + ' WHERE 1=0'); } catch (e) { trx.say('§PROC-UNPORTED-DEP CopyProduct table ' + table + ' absent from the bundle — no rows copied'); return []; }
        return trx.find(table, where).filter(function (r) { return r.isactive === 'Y' && (!cond || cond(r)); });
      }
      function fk(v) { return v == null || Number(v) < 1 ? null : v; }                  // X_*.setXxx_ID(int): <1 → null
      var count = 0, i, rec;
      // Copy prices                                                                    :58-72
      var prices = list('m_productprice', { m_product_id: from });
      prices.forEach(function (src) {
        var dst = S.newBare(trx, 'm_productprice');                                      // new MProductPrice(ctx, 0, trx)
        dst.set('m_product_id', toMProductID).set('m_pricelist_version_id', src.m_pricelist_version_id);
        S.MProductPrice_setPrices(trx, dst, src.pricelist, src.pricestd, src.pricelimit);   // priceDst.setPrices(...)
        dst.saveEx();
      });
      count = prices.length;
      // Copy substitutes ("M_Product_ID=? and NOT substitute_ID=?")                  :74-90
      var subs = list('m_substitute', { m_product_id: from }, function (r) { return String(r.substitute_id) !== String(toMProductID); });
      subs.forEach(function (src) {
        var dst = S.newBare(trx, 'm_substitute');
        dst.set('m_product_id', toMProductID).set('substitute_id', src.substitute_id).set('name', src.name).set('description', src.description); dst.saveEx();
      });
      count += subs.length;
      // Copy related ("M_Product_ID=? and NOT relatedProduct_ID=?")                  :92-111
      var related = list('m_relatedproduct', { m_product_id: from }, function (r) { return String(r.relatedproduct_id) !== String(toMProductID); });
      related.forEach(function (src) {
        var dst = S.newBare(trx, 'm_relatedproduct');
        dst.set('m_product_id', toMProductID).set('relatedproduct_id', src.relatedproduct_id).set('relatedproducttype', src.relatedproducttype).set('name', src.name).set('description', src.description); dst.saveEx();
      });
      count += related.length;
      // Copy replenish                                                                :113-133
      var replenish = list('m_replenish', { m_product_id: from });
      replenish.forEach(function (src) {
        var dst = S.newBare(trx, 'm_replenish');
        dst.set('m_product_id', toMProductID).set('m_warehouse_id', src.m_warehouse_id).set('m_warehousesource_id', fk(src.m_warehousesource_id)).set('replenishtype', src.replenishtype)
          .set('m_locator_id', fk(src.m_locator_id)).set('level_min', src.level_min).set('level_max', src.level_max); dst.saveEx();
      });
      count += replenish.length;
      // Copy business partner                                                         :135-160
      var bpList = list('c_bpartner_product', { m_product_id: from });
      bpList.forEach(function (src) {
        var dst = S.newBare(trx, 'c_bpartner_product');
        dst.set('c_bpartner_id', src.c_bpartner_id).set('description', src.description).set('ismanufacturer', src.ismanufacturer).set('m_product_id', toMProductID)
          .set('manufacturer', src.manufacturer).set('qualityrating', src.qualityrating).set('shelflifemindays', src.shelflifemindays).set('shelflifeminpct', src.shelflifeminpct)
          .set('vendorcategory', src.vendorcategory).set('vendorproductno', src.vendorproductno); dst.saveEx();
      });
      count += bpList.length;
      // Copy download                                                                 :162-181
      var dlList = list('m_productdownload', { m_product_id: from });
      dlList.forEach(function (src) {
        var dst = S.newBare(trx, 'm_productdownload');
        dst.set('m_product_id', toMProductID).set('name', src.name).set('downloadurl', src.downloadurl); dst.saveEx();
      });
      count += dlList.length;
      return A.Msg.parseTranslation(this.getCtx(), '@Copied@=' + count);               // :185 (TODO comment :183)
    };
    return CopyProduct;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/M_PriceList_Create.js — org.compiere.process.M_PriceList_Create, verbatim
// (org.adempiere.base.process/src/org/compiere/process/M_PriceList_Create.java). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
// Named equivalences (not behaviour changes):
//  - T_Selection (the permanent scratch table keyed by AD_PInstance_ID, :188-234) is absent from the bundle and is empty again at the end of the
//    Java run (:230 clear, :334 clear) — the selection of one discount line is held in a JS list; the SELECT DISTINCT that fills it is unchanged.
//  - INSERT…SELECT with currencyConvert/nextidfunc/generate_uuid (:236-292) runs as the same SELECT (currencyConvert is the registered SQL function)
//    + trx.insert per row; the key and *_UU are assigned by the host.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.M_PriceList_Create', function (SvrProcess, X) {
    var MT = (typeof module !== 'undefined' && module.exports) ? require('../model_trade') : global.ModelTrade;   // numbers / MInventoryLine / SimpleDateFormat statics live in model_trade.js (§CP-OPEN 4b)
    function M_PriceList_Create() { SvrProcess.call(this); this.p_PriceList_Version_ID = 0; this.p_DeleteOld = false; this.m_plv = null; }
    M_PriceList_Create.prototype = Object.create(SvrProcess.prototype);
    M_PriceList_Create.prototype.prepare = function () {                            // :73-86
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'DeleteOld') this.p_DeleteOld = para[i].getParameterAsBoolean();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA M_PriceList_Create ' + name);
      }
      this.p_PriceList_Version_ID = this.getRecord_ID();
    };
    M_PriceList_Create.prototype.doIt = function () {                               // :94-105
      var A = X.A, trx = this.get_TrxName();
      this.m_plv = X.get(trx, 'M_PriceList_Version', this.p_PriceList_Version_ID);
      if (this.m_plv == null || this.m_plv.get_ID() === 0 || this.m_plv.get_ID() !== this.p_PriceList_Version_ID)
        throw A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), '@NotFound@  @M_PriceList_Version_ID@=' + this.p_PriceList_Version_ID));
      var error = this.checkPrerequisites();
      if (error != null && error.length > 0) throw A.AdempiereException(error);
      return this.create();
    };
    // checkPrerequisites :111-176
    M_PriceList_Create.prototype.checkPrerequisites = function () {
      var A = X.A, R = A.RUNTIME, trx = this.get_TrxName(), S = P.PSTK, DB = R.DB, client = this.m_plv.getAD_Client_ID();
      DB.executeUpdateEx('UPDATE M_Product_PO SET PriceList = 0 WHERE PriceList IS NULL AND AD_Client_ID=?', [client], trx);
      DB.executeUpdateEx('UPDATE M_Product_PO SET PriceLastPO = 0 WHERE PriceLastPO IS NULL AND AD_Client_ID=?', [client], trx);
      DB.executeUpdateEx('UPDATE M_Product_PO SET PricePO = PriceLastPO WHERE (PricePO IS NULL OR PricePO = 0) AND PriceLastPO <> 0 AND AD_Client_ID=?', [client], trx);
      DB.executeUpdateEx('UPDATE	M_Product_PO SET PricePO = 0 WHERE PricePO IS NULL AND AD_Client_ID=?', [client], trx);
      // :134-142 default current vendor — aliased UPDATE (executeUpdateEx cannot carry the alias): the same rows, selected with the alias
      var idc = trx.idCol('m_product_po');
      trx.q("SELECT p." + idc + " AS k FROM M_Product_PO p WHERE IsCurrentVendor = 'N' AND NOT EXISTS (SELECT pp.M_Product_ID FROM M_Product_PO pp WHERE pp.M_Product_ID=p.M_Product_ID GROUP BY pp.M_Product_ID HAVING COUNT(*) > 1) AND AD_Client_ID=?", [client])
        .forEach(function (r) { var cur = trx.get('m_product_po', r.k); if (cur) trx.update('m_product_po', cur, { iscurrentvendor: 'Y', updated: trx.env.now }); });
      // :144-174 only one active current vendor per product (Query.setClient_ID, order M_Product_ID, Created)
      var pos = trx.q("SELECT x." + idc + " AS k, x.m_product_id AS pid FROM M_Product_PO x WHERE IsCurrentVendor='Y' AND IsActive='Y' AND EXISTS (SELECT M_Product_ID FROM M_Product_PO y WHERE y.M_Product_ID=x.M_Product_ID AND IsCurrentVendor='Y' AND IsActive='Y' GROUP BY M_Product_ID HAVING COUNT(*) > 1) AND AD_Client_ID=? ORDER BY x.M_Product_ID, x.Created", [client]);
      var M_Product_ID = 0;
      pos.forEach(function (po) {
        if (M_Product_ID !== Number(po.pid)) { M_Product_ID = Number(po.pid); return; }
        var cur = trx.get('m_product_po', po.k), r = X.save(trx, 'M_Product_PO', cur, { iscurrentvendor: false });
        if (!r.ok) trx.say('§MODEL-PO Not updated M_Product_PO ' + po.k + ': ' + r.error);
      });
      return null;
    };
    // calculate :405-473
    M_PriceList_Create.prototype.calculate = function (base, list, std, limit, fix, add, discount, round, curPrecision, M_Product_ID) {
      var A = X.A, trx = this.get_TrxName(), S = P.PSTK, RMd = A.RoundingMode, BD = A.BigDecimal, calc = null, dd = 0.0;
      var num = function (b) { return Number(b.toString()); };                       // BigDecimal.doubleValue
      if ('L' === base) dd = num(list);
      else if ('S' === base) dd = num(std);
      else if ('X' === base) dd = num(limit);
      else if ('F' === base) calc = fix;
      else if ('P' === base) { MT.dep(trx, 'M_PriceList_Create.calculate base ProductCost :428-441 needs ProductCost.getProductCosts (costing engine) — costs treated as null'); calc = null; }
      else throw new Error('Unknown Base=' + base);                                  // IllegalArgumentException
      if (calc == null) {                                                            // :444-452
        if (add.signum() !== 0) dd += num(add);
        if (discount.signum() !== 0) dd *= 1 - (num(discount) / 100.0);
        calc = MT.bdFromDouble(dd);                                                   // new BigDecimal(double) — the exact binary expansion
      }
      if ('C' === round) calc = calc.setScale(curPrecision, RMd.HALF_UP);            // :455-486
      else if ('D' === round) calc = calc.setScale(1, RMd.HALF_UP);
      else if ('h' === round) calc = calc.setScale(-2, RMd.HALF_UP);
      else if ('5' === round) { var m20 = BD.of(20); calc = calc.multiply(m20).setScale(0, RMd.HALF_UP).divide(m20, 2, RMd.HALF_UP); }
      else if ('N' === round) ;
      else if ('Q' === round) { var m4 = BD.of(4); calc = calc.multiply(m4).setScale(0, RMd.HALF_UP).divide(m4, 2, RMd.HALF_UP); }
      else if ('T' === round) calc = calc.setScale(-1, RMd.HALF_UP);
      else if ('t' === round) calc = calc.setScale(-3, RMd.HALF_UP);
      else if ('0' === round) calc = calc.setScale(0, RMd.HALF_UP);
      return calc;
    };
    M_PriceList_Create.prototype.getSubCategoryWhereClause = function (productCategoryId) {   // :485-540
      var trx = this.get_TrxName(), subTreeRootParentId = 0, cats = [];
      trx.q('SELECT M_Product_Category_ID, M_Product_Category_Parent_ID FROM M_Product_Category').forEach(function (r) {
        var a = Number(r.m_product_category_id), b = Number(r.m_product_category_parent_id || 0);
        if (a === productCategoryId) subTreeRootParentId = b;
        cats.push({ node: a, parent: b });
      });
      function sub(pc, loop) {
        var ret = '';
        cats.forEach(function (n) { if (n.parent === pc) { if (n.node === loop) throw new Error('The product category tree contains a loop on categoryId: ' + loop); ret += sub(n.node, loop) + ','; } });
        return ret + pc;
      }
      return sub(productCategoryId, subTreeRootParentId);
    };
    // create :178-345
    M_PriceList_Create.prototype.create = function () {
      var A = X.A, R = A.RUNTIME, trx = this.get_TrxName(), S = P.PSTK, self = this, DB = R.DB, plvId = this.p_PriceList_Version_ID, info = '';
      if (this.p_DeleteOld) {                                                        // :183-189
        var no = DB.executeUpdateEx('DELETE FROM M_ProductPrice WHERE M_PriceList_Version_ID=?', [plvId], trx);
        info += '@Deleted@=' + no + ' - ';
      }
      var baseId = this.m_plv.getM_Pricelist_Version_Base_ID() || 0;
      var pl = X.get(trx, 'M_PriceList', this.m_plv.getM_PriceList_ID());
      var curPrecision = MT.currencyStdPrecision(trx, pl.getC_Currency_ID());         // MPriceList.getStandardPrecision :356-364
      var dsLines = trx.q('SELECT * FROM M_DiscountSchemaLine WHERE M_DiscountSchema_ID=? ORDER BY SeqNo,M_DiscountSchemaLine_ID', [this.m_plv.getM_DiscountSchema_ID()]);   // MDiscountSchema.getLines :222
      dsLines.forEach(function (row) {
        var dsLine = R.PO.wrap('M_DiscountSchemaLine', row);
        if (!dsLine.isActive()) return;                                              // :201-203
        var message = '#' + dsLine.getSeqNo(), dd = dsLine.getDescription();
        if (dd != null && dd.length > 0) message += ' ' + dd;
        var dlId = dsLine.getM_DiscountSchemaLine_ID(), p2 = baseId, sel, sqlb, args;
        if (p2 === 0) {                                                              // :213-241 Create from PO
          p2 = dsLine.getAD_Client_ID();
          sqlb = 'SELECT DISTINCT po.M_Product_ID FROM M_Product_PO po INNER JOIN M_Product p ON (p.M_Product_ID=po.M_Product_ID) INNER JOIN M_DiscountSchemaLine dl ON (dl.M_DiscountSchemaLine_ID=?) WHERE p.AD_Client_ID IN (?, 0)' +
            " AND p.IsActive='Y' AND po.IsActive='Y' AND (dl.Group1 IS NULL OR p.Group1=dl.Group1) AND (dl.Group2 IS NULL OR p.Group2=dl.Group2) AND (dl.C_BPartner_ID IS NULL OR po.C_BPartner_ID=dl.C_BPartner_ID)" +
            " AND (dl.VendorCategory IS NULL OR po.VendorCategory=dl.VendorCategory) AND (dl.IsIgnoreIsCurrentVendor='Y' OR po.IsCurrentVendor='Y') AND (dl.M_Product_ID IS NULL OR p.M_Product_ID=dl.M_Product_ID)";
        } else {                                                                     // :242-263 Create from Price List
          sqlb = 'SELECT DISTINCT p.M_Product_ID FROM M_ProductPrice pp INNER JOIN M_Product p ON (p.M_Product_ID=pp.M_Product_ID) INNER JOIN M_DiscountSchemaLine dl ON (dl.M_DiscountSchemaLine_ID=?) WHERE pp.M_PriceList_Version_ID=?' +
            " AND p.IsActive='Y' AND pp.IsActive='Y' AND (dl.Group1 IS NULL OR p.Group1=dl.Group1) AND (dl.Group2 IS NULL OR p.Group2=dl.Group2)" +
            ' AND ((dl.C_BPartner_ID IS NULL AND dl.VendorCategory IS NULL) OR EXISTS (SELECT * FROM M_Product_PO po WHERE po.M_Product_ID=p.M_Product_ID AND (dl.C_BPartner_ID IS NULL OR po.C_BPartner_ID=dl.C_BPartner_ID) AND (dl.VendorCategory IS NULL OR po.VendorCategory=dl.VendorCategory)))' +
            ' AND (dl.M_Product_ID IS NULL OR p.M_Product_ID=dl.M_Product_ID)';
        }
        if (dsLine.getM_Product_Category_ID() > 0) sqlb += ' AND p.M_Product_Category_ID IN (' + self.getSubCategoryWhereClause(dsLine.getM_Product_Category_ID()) + ')';
        sel = trx.q(sqlb, [dlId, p2]).map(function (r) { return Number(Object.keys(r).map(function (k) { return r[k]; })[0]); });     // the T_Selection rows
        var selSet = {}; sel.forEach(function (id) { selSet[id] = 1; });
        message += ': @Selected@=' + sel.length;
        if (baseId === 0 || baseId !== plvId) {                                       // :269-277 delete prices in selection
          var del = trx.find('m_productprice', { m_pricelist_version_id: plvId }).filter(function (pp) { return selSet[Number(pp.m_product_id)]; });
          del.forEach(function (pp) { trx.del('m_productprice', pp); });
          message += ', @Deleted@=' + del.length;
        }
        if (baseId !== plvId) {                                                       // :279-325 copy (insert) prices
          var rows;
          var cc = function (col, cur) { return 'COALESCE(currencyConvert(' + col + ', ' + cur + ', pl.C_Currency_ID, dl.ConversionDate, dl.C_ConversionType_ID, plv.AD_Client_ID, plv.AD_Org_ID), 0)'; };
          if (baseId === 0) {
            rows = trx.q('SELECT plv.M_PriceList_Version_ID AS plv, po.M_Product_ID AS pid, plv.AD_Client_ID AS cl, plv.AD_Org_ID AS org, plv.UpdatedBy AS ub, ' +
              cc('po.PriceList', 'po.C_Currency_ID') + ' AS plist, ' + cc('po.PriceList', 'po.C_Currency_ID') + ' AS pstd, ' + cc('po.PricePO', 'po.C_Currency_ID') + ' AS plimit ' +
              'FROM M_Product_PO po INNER JOIN M_PriceList_Version plv ON (plv.M_PriceList_Version_ID=?) INNER JOIN M_PriceList pl ON (pl.M_PriceList_ID=plv.M_PriceList_ID) INNER JOIN M_DiscountSchemaLine dl ON (dl.M_DiscountSchemaLine_ID=?) ' +
              "WHERE po.M_Product_ID IN (" + (sel.length ? sel.join(',') : 'NULL') + ") AND ((dl.C_BPartner_ID IS NULL AND po.IsCurrentVendor='Y') OR (po.C_BPartner_ID=dl.C_BPartner_ID AND (dl.IsIgnoreIsCurrentVendor='Y' OR po.IsCurrentVendor='Y'))) AND po.IsActive='Y'", [plvId, dlId]);
          } else {
            rows = trx.q('SELECT plv.M_PriceList_Version_ID AS plv, pp.M_Product_ID AS pid, plv.AD_Client_ID AS cl, plv.AD_Org_ID AS org, plv.UpdatedBy AS ub, ' +
              cc('pp.PriceList', 'bpl.C_Currency_ID') + ' AS plist, ' + cc('pp.PriceStd', 'bpl.C_Currency_ID') + ' AS pstd, ' + cc('pp.PriceLimit', 'bpl.C_Currency_ID') + ' AS plimit ' +
              'FROM M_ProductPrice pp INNER JOIN M_PriceList_Version plv ON (plv.M_PriceList_Version_ID=?) INNER JOIN M_PriceList pl ON (pl.M_PriceList_ID=plv.M_PriceList_ID) INNER JOIN M_PriceList_Version bplv ON (pp.M_PriceList_Version_ID=bplv.M_PriceList_Version_ID) INNER JOIN M_PriceList bpl ON (bplv.M_PriceList_ID=bpl.M_PriceList_ID) INNER JOIN M_DiscountSchemaLine dl ON (dl.M_DiscountSchemaLine_ID=?) ' +
              "WHERE pp.M_PriceList_Version_ID=? AND pp.M_Product_ID IN (" + (sel.length ? sel.join(',') : 'NULL') + ") AND pp.IsActive='Y'", [plvId, dlId, baseId]);
          }
          rows.forEach(function (r) { trx.insert('m_productprice', { m_pricelist_version_id: r.plv, m_product_id: r.pid, ad_client_id: r.cl, ad_org_id: r.org, isactive: 'Y', created: trx.env.now, createdby: r.ub, updated: trx.env.now, updatedby: r.ub, pricelist: r.plist, pricestd: r.pstd, pricelimit: r.plimit }); });
          message += ' @Inserted@=' + rows.length;
        }
        // :327-352 Calculations — m_plv.getProductPrice(" AND EXISTS (SELECT * FROM T_Selection …)")
        trx.find('m_productprice', { m_pricelist_version_id: plvId }).filter(function (pp) { return selSet[Number(pp.m_product_id)]; }).forEach(function (price) {
          var priceList = MT.bd(price.pricelist), priceStd = MT.bd(price.pricestd), priceLimit = MT.bd(price.pricelimit), pid = Number(price.m_product_id);
          var np = self.calculate(dsLine.getList_Base(), priceList, priceStd, priceLimit, MT.bd(dsLine.getList_Fixed()), MT.bd(dsLine.getList_AddAmt()), MT.bd(dsLine.getList_Discount()), dsLine.getList_Rounding(), curPrecision, pid);
          var ns = self.calculate(dsLine.getStd_Base(), priceList, priceStd, priceLimit, MT.bd(dsLine.getStd_Fixed()), MT.bd(dsLine.getStd_AddAmt()), MT.bd(dsLine.getStd_Discount()), dsLine.getStd_Rounding(), curPrecision, pid);
          var nl = self.calculate(dsLine.getLimit_Base(), priceList, priceStd, priceLimit, MT.bd(dsLine.getLimit_Fixed()), MT.bd(dsLine.getLimit_AddAmt()), MT.bd(dsLine.getLimit_Discount()), dsLine.getLimit_Rounding(), curPrecision, pid);
          S.saveEx(X, trx, 'M_ProductPrice', price, { pricelist: np, pricestd: ns, pricelimit: nl });
        });
        self.addLog(message);                                                         // :354
      });
      var pp = trx.find('m_productprice', { m_pricelist_version_id: plvId });         // :362-364 getProductPrice(true)
      info += ' - @Records@=' + pp.length;
      return info;
    };
    return M_PriceList_Create;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

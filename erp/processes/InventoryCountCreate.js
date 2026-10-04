// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/InventoryCountCreate.js — org.compiere.process.InventoryCountCreate, verbatim
// (org.adempiere.base.process/src/org/compiere/process/InventoryCountCreate.java). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.InventoryCountCreate', function (SvrProcess, X) {
    function InventoryCountCreate() {
      SvrProcess.call(this); this.p_M_Inventory_ID = 0; this.m_inventory = null; this.p_M_Locator_ID = 0; this.p_LocatorValue = null; this.p_ProductValue = null;
      this.p_M_Product_Category_ID = 0; this.p_QtyRange = null; this.p_InventoryCountSetZero = false; this.p_DeleteOld = false; this.m_line = null; this.oldDateMPolicy = null;
    }
    InventoryCountCreate.prototype = Object.create(SvrProcess.prototype);
    InventoryCountCreate.prototype.prepare = function () {                          // :84-110
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'M_Locator_ID') this.p_M_Locator_ID = para[i].getParameterAsInt();
        else if (name === 'LocatorValue') this.p_LocatorValue = para[i].getParameter();
        else if (name === 'ProductValue') this.p_ProductValue = para[i].getParameter();
        else if (name === 'M_Product_Category_ID') this.p_M_Product_Category_ID = para[i].getParameterAsInt();
        else if (name === 'QtyRange') this.p_QtyRange = para[i].getParameter();
        else if (name === 'InventoryCountSet') this.p_InventoryCountSetZero = 'Z' === para[i].getParameter();
        else if (name === 'DeleteOld') this.p_DeleteOld = 'Y' === para[i].getParameter();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA InventoryCountCreate ' + name);
      }
      this.p_M_Inventory_ID = this.getRecord_ID();
    };
    InventoryCountCreate.prototype.doIt = function () {                             // :118-263
      var A = X.A, R = A.RUNTIME, trx = this.get_TrxName(), S = P.PSTK, self = this, id = this.p_M_Inventory_ID;
      this.m_inventory = X.get(trx, 'M_Inventory', id);
      if (this.m_inventory == null || this.m_inventory.get_ID() === 0) throw new Error('Not found: M_Inventory_ID=' + id);
      if (this.m_inventory.isProcessed()) throw A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), '@M_Inventory_ID@ @Processed@'));
      var inv = this.m_inventory.row;
      if (this.p_DeleteOld) {                                                         // :131-148
        var no1 = R.DB.executeUpdate("DELETE FROM M_InventoryLineMA WHERE EXISTS (SELECT * FROM M_InventoryLine l WHERE l.M_InventoryLine_ID=M_InventoryLineMA.M_InventoryLine_ID AND Processed='N' AND M_Inventory_ID=" + id + ')', []);
        if (no1 < 0) S.dep(trx, 'M_InventoryLineMA absent from the bundle (DB.executeUpdate → -1, as Java on error)');
        R.DB.executeUpdate("DELETE FROM M_InventoryLine WHERE Processed='N' AND M_Inventory_ID=" + id, []);
      }
      if (this.p_QtyRange != null && this.p_QtyRange === '=') {                      // :151-176 Create Null Storage records
        var sql0 = 'INSERT INTO M_StorageOnHand (AD_Client_ID, AD_Org_ID, IsActive, Created, CreatedBy, Updated, UpdatedBy, M_Locator_ID, M_Product_ID, M_AttributeSetInstance_ID, QtyOnHand, DateLastInventory, DateMaterialPolicy, M_StorageOnHand_UU) ' +
          "SELECT l.AD_CLIENT_ID, l.AD_ORG_ID, 'Y', getDate(), 0,getDate(), 0, l.M_Locator_ID, p.M_Product_ID, 0, 0,null,trunc(getdate()),generate_uuid() FROM M_Locator l INNER JOIN M_Product p ON (l.AD_Client_ID=p.AD_Client_ID) WHERE l.M_Warehouse_ID=" +
          inv.m_warehouse_id + (this.p_M_Locator_ID !== 0 ? ' AND l.M_Locator_ID=' + this.p_M_Locator_ID : '') +
          " AND l.IsDefault='Y' AND p.IsActive='Y' AND p.IsStocked='Y' and p.ProductType='I' AND NOT EXISTS (SELECT * FROM M_StorageOnHand s INNER JOIN M_Locator sl ON (s.M_Locator_ID=sl.M_Locator_ID) WHERE sl.M_Warehouse_ID=l.M_Warehouse_ID AND s.M_Product_ID=p.M_Product_ID)";
        R.DB.executeUpdate(sql0, []);
        S.dep(trx, 'InventoryCountCreate QtyRange "=": the loop below re-reads M_StorageOnHand but this runtime\'s raw SELECT does not see the rows this Trx just inserted (ad_process.js processDB named limit)');
      }
      var sql = 'SELECT s.M_Product_ID, s.M_Locator_ID, s.M_AttributeSetInstance_ID, s.QtyOnHand, p.M_AttributeSet_ID ,s.DateMaterialPolicy, l.Value AS lvalue, p.Value AS pvalue FROM M_Product p INNER JOIN M_StorageOnHand s ON (s.M_Product_ID=p.M_Product_ID) INNER JOIN M_Locator l ON (s.M_Locator_ID=l.M_Locator_ID) WHERE l.M_Warehouse_ID=? ' +
        "AND p.IsActive='Y' AND p.IsStocked='Y' and p.ProductType='I'";                // :178-185
      var args = [inv.m_warehouse_id];
      if (this.p_M_Locator_ID !== 0) { sql += ' AND s.M_Locator_ID=?'; args.push(this.p_M_Locator_ID); }
      if (this.p_LocatorValue != null && (String(this.p_LocatorValue).trim().length === 0 || this.p_LocatorValue === '%')) this.p_LocatorValue = null;
      if (this.p_LocatorValue != null) { sql += ' AND UPPER(l.Value) LIKE ?'; args.push(String(this.p_LocatorValue).toUpperCase()); }
      if (this.p_ProductValue != null && (String(this.p_ProductValue).trim().length === 0 || this.p_ProductValue === '%')) this.p_ProductValue = null;
      if (this.p_ProductValue != null) { sql += ' AND UPPER(p.Value) LIKE ?'; args.push(String(this.p_ProductValue).toUpperCase()); }
      if (this.p_M_Product_Category_ID !== 0) sql += ' AND p.M_Product_Category_ID IN (' + this.getSubCategoryWhereClause(this.p_M_Product_Category_ID) + ')';
      if (!this.p_DeleteOld) { sql += ' AND NOT EXISTS (SELECT * FROM M_InventoryLine il WHERE il.M_Inventory_ID=? AND il.M_Product_ID=s.M_Product_ID AND il.M_Locator_ID=s.M_Locator_ID AND COALESCE(il.M_AttributeSetInstance_ID,0)=COALESCE(s.M_AttributeSetInstance_ID,0))'; args.push(id); }
      // :208 ORDER BY l.Value, p.Value, s.M_AttributeSetInstance_ID, s.DateMaterialPolicy, s.QtyOnHand DESC — ordered here in JS: Postgres sorts text in the
      // database collation (en_US: case-insensitive first level), SQLite's BINARY would put 'PTable' before 'Plum Tree'; Intl.Collator('en-US') is the same ordering.
      var coll = new Intl.Collator('en-US');
      var count = 0;
      try {                                                                           // :195-241 (catch → log SEVERE, continue)
        var rows = trx.q(sql, args).sort(function (a, b) {
          return coll.compare(String(a.lvalue), String(b.lvalue)) || coll.compare(String(a.pvalue), String(b.pvalue)) ||
            (Number(a.m_attributesetinstance_id || 0) - Number(b.m_attributesetinstance_id || 0)) ||
            (a.datematerialpolicy == null ? (b.datematerialpolicy == null ? 0 : 1) : b.datematerialpolicy == null ? -1 : (String(a.datematerialpolicy) < String(b.datematerialpolicy) ? -1 : String(a.datematerialpolicy) > String(b.datematerialpolicy) ? 1 : 0)) ||
            (Number(b.qtyonhand) - Number(a.qtyonhand));
        });
        rows.forEach(function (r) {
          var QtyOnHand = r.qtyonhand == null ? A.Env.ZERO : S.bd(r.qtyonhand), compare = QtyOnHand.compareTo(A.Env.ZERO), q = self.p_QtyRange;
          if (q == null || (q === '>' && compare > 0) || (q === '<' && compare < 0) || (q === '=' && compare === 0) || (q === 'N' && compare !== 0))
            count += self.createInventoryLine(X, trx, Number(r.m_locator_id || 0), Number(r.m_product_id || 0), Number(r.m_attributesetinstance_id || 0), QtyOnHand, Number(r.m_attributeset_id || 0), r.datematerialpolicy);
        });
      } catch (e) { trx.say('§PROC-SEVERE InventoryCountCreate ' + ((e && e.message) || e)); }
      if (this.p_InventoryCountSetZero) {                                             // :244-252
        // the Java's UPDATE sees this Trx's deletes and inserts (DeleteOld, the lines just created) — trx.find overlays the pending writes
        trx.find('m_inventoryline', { m_inventory_id: id }).forEach(function (l) { trx.update('m_inventoryline', l, { qtycount: 0 }); });
      }
      return '@M_InventoryLine_ID@ - #' + count;                                      // :255-256
    };
    // createInventoryLine :276-337
    InventoryCountCreate.prototype.createInventoryLine = function (X, trx, M_Locator_ID, M_Product_ID, M_AttributeSetInstance_ID, QtyOnHand, M_AttributeSet_ID, dateMPolicy) {
      var S = P.PSTK, inv = this.m_inventory.row, cur = this.m_line ? trx.get('m_inventoryline', this.m_line.m_inventoryline_id) : null;
      if (QtyOnHand.signum() === 0) M_AttributeSetInstance_ID = 0;
      if (cur != null && Number(cur.m_locator_id) === M_Locator_ID && Number(cur.m_product_id) === M_Product_ID) {      // :280-318
        if (QtyOnHand.signum() === 0) return 0;
        var old = this.oldDateMPolicy, sameDate = (dateMPolicy == null && old == null) || (dateMPolicy != null && String(dateMPolicy) === String(old)) || (old != null && String(old) === String(dateMPolicy));
        if (Number(cur.m_attributesetinstance_id || 0) === M_AttributeSetInstance_ID && sameDate) {
          this.m_line = S.saveInventoryLine(X, trx, cur, { qtybook: S.bd(cur.qtybook).add(QtyOnHand), qtycount: S.bd(cur.qtycount).add(QtyOnHand) }, inv);
          return 0;
        } else if (Number(cur.m_attributesetinstance_id || 0) !== 0) {
          this.saveMA(X, trx, cur, Number(cur.m_attributesetinstance_id), S.bd(cur.qtybook), old);
        }
        cur = S.saveInventoryLine(X, trx, cur, { m_attributesetinstance_id: 0, qtybook: S.bd(cur.qtybook).add(QtyOnHand), qtycount: S.bd(cur.qtycount).add(QtyOnHand) }, inv);
        this.m_line = cur;
        this.saveMA(X, trx, cur, M_AttributeSetInstance_ID, QtyOnHand, dateMPolicy);
        return 0;
      }
      var line = null;
      try { line = S.newInventoryLine(X, trx, inv, M_Locator_ID, M_Product_ID, M_AttributeSetInstance_ID, QtyOnHand, QtyOnHand); }   // :321-323
      catch (e) { trx.say('§MODEL-PO save m_inventoryline refused: ' + ((e && e.message) || e)); }
      this.m_line = line;
      this.oldDateMPolicy = dateMPolicy;
      return line ? 1 : 0;
    };
    // new MInventoryLineMA(line, asi, qty, date, true) :M/MInventoryLineMA.java ctor + ma.save()
    InventoryCountCreate.prototype.saveMA = function (X, trx, line, asi, qty, date) {
      var S = P.PSTK, inv = this.m_inventory.row;
      if (date == null) {
        if (asi > 0) S.dep(trx, 'MStorageOnHand.getDateMaterialPolicy (M/MStorageOnHand.java) for MInventoryLineMA');
        date = inv.movementdate;
      }
      try { S.create(X, trx, 'M_InventoryLineMA', { ad_client_id: line.ad_client_id, ad_org_id: line.ad_org_id, m_inventoryline_id: line.m_inventoryline_id, m_attributesetinstance_id: asi, movementqty: qty, datematerialpolicy: date, isautogenerated: 'Y' }); }
      catch (e) { trx.say('§MODEL-PO Could not save M_InventoryLineMA: ' + ((e && e.message) || e)); }
    };
    // getSubCategoryWhereClause / getSubCategoriesString :351-406
    InventoryCountCreate.prototype.getSubCategoryWhereClause = function (productCategoryId) {
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
    return InventoryCountCreate;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

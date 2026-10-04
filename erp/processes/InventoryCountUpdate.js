// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/InventoryCountUpdate.java port — org.compiere.process.InventoryCountUpdate, verbatim
// (org.adempiere.base.process/src/org/compiere/process/InventoryCountUpdate.java). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
// The Java's three raw UPDATEs use a row-value IN, an aliased UPDATE and a (a,b)=(subselect) SET — shapes the runtime's
// executeUpdateEx does not translate — so each is run here as the SELECT of the rows it would touch + trx.update per row (same rows, same values).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.InventoryCountUpdate', function (SvrProcess, X) {
    function InventoryCountUpdate() { SvrProcess.call(this); this.p_M_Inventory_ID = 0; this.p_InventoryCountSetZero = false; }
    InventoryCountUpdate.prototype = Object.create(SvrProcess.prototype);
    InventoryCountUpdate.prototype.prepare = function () {                         // :45-60
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'InventoryCountSet') this.p_InventoryCountSetZero = 'Z' === para[i].getParameter();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA InventoryCountUpdate ' + name);
      }
      this.p_M_Inventory_ID = this.getRecord_ID();
    };
    InventoryCountUpdate.prototype.doIt = function () {                            // :69-114
      var A = X.A, trx = this.get_TrxName(), S = P.PSTK, id = this.p_M_Inventory_ID, userId = this.getAD_User_ID();
      var inventory = X.get(trx, 'M_Inventory', id);
      if (inventory == null || inventory.get_ID() === 0) throw new Error('Not found: M_Inventory_ID=' + id);   // AdempiereSystemError
      // :80-88 Multiple lines for one item → IsActive='N'
      var dup = trx.q('SELECT m_inventoryline_id AS id FROM M_InventoryLine WHERE M_Inventory_ID=? AND (M_Product_ID, M_Locator_ID, M_AttributeSetInstance_ID) IN ' +
        '(SELECT M_Product_ID, M_Locator_ID, M_AttributeSetInstance_ID FROM M_InventoryLine WHERE M_Inventory_ID=? GROUP BY M_Product_ID, M_Locator_ID, M_AttributeSetInstance_ID HAVING COUNT(*) > 1)', [id, id]);
      dup.forEach(function (r) { var l = trx.get('m_inventoryline', r.id); trx.update('m_inventoryline', l, { isactive: 'N' }); });
      var multiple = dup.length;
      // :92 MInventoryLineMA.deleteInventoryMA (M/MInventoryLineMA.java:88-94)
      var delMA = X.A.RUNTIME.DB.executeUpdate('DELETE FROM M_InventoryLineMA WHERE EXISTS (SELECT * FROM M_InventoryLine l WHERE l.M_InventoryLine_ID=M_InventoryLineMA.M_InventoryLine_ID AND M_Inventory_ID=' + id + ')', []);
      if (delMA < 0) S.dep(trx, 'M_InventoryLineMA absent from the bundle (DB.executeUpdate → -1, as Java on error) — DeletedMA not counted');
      // :96-120 per line with matching on-hand: QtyBook = QtyCount = SUM(QtyOnHand), Updated/UpdatedBy; then (Set Count to Zero) QtyCount=0 on every line.
      // The two UPDATEs are folded into one net trx.update per line (the Trx records old→new once; an in-between value that returns to the
      // original is not a change — what a committed Postgres row shows).
      var sums = {};
      trx.q('SELECT l.m_inventoryline_id AS id, (SELECT SUM(QtyOnHand) FROM M_StorageOnHand s WHERE s.M_Product_ID=l.M_Product_ID AND s.M_Locator_ID=l.M_Locator_ID AND s.M_AttributeSetInstance_ID=l.M_AttributeSetInstance_ID) AS q ' +
        'FROM M_InventoryLine l WHERE l.M_Inventory_ID=? AND EXISTS (SELECT * FROM M_StorageOnHand s WHERE s.M_Product_ID=l.M_Product_ID AND s.M_Locator_ID=l.M_Locator_ID AND s.M_AttributeSetInstance_ID=l.M_AttributeSetInstance_ID)', [id])
        .forEach(function (r) { sums[r.id] = r.q; });
      var no = Object.keys(sums).length, zero = this.p_InventoryCountSetZero;
      var allLines = trx.find('m_inventoryline', { m_inventory_id: id });
      allLines.forEach(function (l) {
        var ch = {};
        if (Object.prototype.hasOwnProperty.call(sums, l.m_inventoryline_id)) { ch.qtybook = sums[l.m_inventoryline_id]; ch.qtycount = sums[l.m_inventoryline_id]; ch.updated = trx.env.now; ch.updatedby = userId; }
        if (zero) ch.qtycount = 0;
        if (Object.keys(ch).length) trx.update('m_inventoryline', l, ch);
      });
      if (zero) no = allLines.length;
      if (multiple > 0) return '@M_InventoryLine_ID@ - #' + no + ' --> @InventoryProductMultiple@';   // :122-125
      return '@M_InventoryLine_ID@ - #' + no;                                                         // :126-127
    };
    return InventoryCountUpdate;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

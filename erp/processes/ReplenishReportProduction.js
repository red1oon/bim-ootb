// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ReplenishReportProduction.js — org.compiere.process.ReplenishReportProduction (AD_Process 53267 "Replenish Report", the LIVE class; 125 ReplenishReport is @Deprecated since 13), verbatim
// (org.adempiere.base.process/src/org/compiere/process/ReplenishReportProduction.java, 860 lines). bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §64 — Witness: erp/tests/witness_replenish_diff.js (W-REPLENISH).
// The T_Replenish work table is filled IN MEMORY step by step (each Java statement = one block below, cited) and written once: the process runtime's raw SELECT does not see this Trx's pending writes
// (ad_process.js processDB named limit), so the Java's INSERT...SELECT / UPDATE / DELETE chain on T_Replenish could not run as SQL. M_Replenish / M_Product_PO normalisation (prepareTable) runs as the Java's own SQL.
// ONE QtyToOrder calc: ERPEngine.replenishQtyToOrder (erp_engine.js) - pos_core.js replenishSuggest calls the same function.
// Create paths go through the model layer: MOrder/MOrderLine (POO), MRequisition/MRequisitionLine (POR, model_order.js), MMovement/MMovementLine (MMM, model_movement.js), MDDOrder/MDDOrderLine (DOO, model_dd.js).
// NAMED refusal: PRD (MProduction.createLines - manufacturing is not core, AD-LAYER LAW rule 6; see ProductionCreate.js); a custom ReplenishInterface class must be registered via ReplenishReportProduction.registerReplenishInterface.
(function (global) {
  'use strict';
  var NODE = (typeof module !== 'undefined' && module.exports);
  var P = NODE ? require('../ad_process.js') : global.AdProcess;
  var CUSTOM = {};   // Core.getReplenish(className) :393-401 - the registered ReplenishInterface implementations: name -> function (wh, tReplenishRow) -> BigDecimal|null
  var BRK = (NODE && process.env && process.env.LRR_BREAK) || '';   // witness negative control only: LRR_BREAK=noprod drops the production-line UPDATE (:292-303)
  P.defineProcess('org.compiere.process.ReplenishReportProduction', function (SvrProcess, X) {
    function mods() { return NODE ? { MT: require('../model_trade'), MO: require('../model_order'), ML: require('../model_layer'), CT: require('../model_ctor'), E: require('../erp_engine') } : { MT: global.ModelTrade, MO: global.ModelOrder, ML: global.ModelLayer, CT: global.ModelCtor, E: global.ERPEngine }; }
    function ReplenishReportProduction() {
      SvrProcess.call(this); this.p_M_Warehouse_ID = 0; this.p_C_BPartner_ID = 0; this.p_ReplenishmentCreate = null; this.p_C_DocType_ID = 0; this.m_info = ''; this.p_M_Product_Category_ID = 0; this.isKanban = null; this.rows = [];
    }
    ReplenishReportProduction.prototype = Object.create(SvrProcess.prototype);
    ReplenishReportProduction.prototype.prepare = function () {                         // :80-103
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'M_Warehouse_ID') this.p_M_Warehouse_ID = para[i].getParameterAsInt();
        else if (name === 'C_BPartner_ID') this.p_C_BPartner_ID = para[i].getParameterAsInt();
        else if (name === 'M_Product_Category_ID') this.p_M_Product_Category_ID = para[i].getParameterAsInt();
        else if (name === 'IsKanban') this.isKanban = String(para[i].getParameter());
        else if (name === 'ReplenishmentCreate') this.p_ReplenishmentCreate = String(para[i].getParameter());
        else if (name === 'C_DocType_ID') this.p_C_DocType_ID = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ReplenishReportProduction ' + name);   // MProcessPara.validateUnknownParameter :101 (logs only)
      }
    };
    ReplenishReportProduction.prototype.doIt = function () {                            // :110-148
      var trx = this.get_TrxName(), M = mods();
      if (this.p_ReplenishmentCreate != null && this.p_C_DocType_ID === 0 && this.p_ReplenishmentCreate !== 'PRD') throw new Error('@FillMandatory@ @C_DocType_ID@');   // :117-118
      // MWarehouse.get(ctx, id) :77-90: id 0 -> a new (empty) MWarehouse, get_ID()==0 -> FillMandatory (:121-122); an id that exists nowhere -> null -> the Java's own NullPointerException at :121 (helpful-NPE text kept: the twin does not diverge)
      var wh = this.p_M_Warehouse_ID ? trx.get('m_warehouse', this.p_M_Warehouse_ID) : { m_warehouse_id: 0 };
      if (!wh) throw new Error('Cannot invoke "org.compiere.model.MWarehouse.get_ID()" because "wh" is null');
      if (!Number(wh.m_warehouse_id)) throw new Error('@FillMandatory@ @M_Warehouse_ID@');                      // :121-122
      this.prepareTable(trx);
      this.fillTable(trx, wh, M);
      if (this.p_ReplenishmentCreate == null) return 'OK';                              // :127-128
      var dt = trx.get('c_doctype', this.p_C_DocType_ID);                                // MDocType.get :130
      if (this.p_ReplenishmentCreate !== 'PRD' && (!dt || dt.docbasetype !== this.p_ReplenishmentCreate)) throw new Error('@C_DocType_ID@=' + (dt ? dt.name : '') + ' <> ' + this.p_ReplenishmentCreate);   // :131-132
      var c = this.p_ReplenishmentCreate;
      if (c === 'POO') this.createPO(trx, M);                                            // :134-143
      else if (c === 'POR') this.createRequisition(trx, M);
      else if (c === 'MMM') this.createMovements(trx, M);
      else if (c === 'DOO') this.createDO(trx, M);
      else if (c === 'PRD') this.createProduction(trx, M);
      return this.m_info;                                                                // :144
    };
    function upd(trx, sql) { var n = X.A.RUNTIME.DB.executeUpdateEx(sql, []); return n; }
    ReplenishReportProduction.prototype.prepareTable = function (trx) {               // :157-212 (the Java's SQL, run through the process runtime's executeUpdateEx)
      var n1 = upd(trx, 'UPDATE M_Replenish SET Level_Max = Level_Min WHERE Level_Max < Level_Min');                                  // :160-165 Level_Max must be >= Level_Min
      var n2 = upd(trx, 'UPDATE M_Product_PO SET Order_Min = 1 WHERE Order_Min IS NULL OR Order_Min < 1');                           // :168-173
      var n3 = upd(trx, 'UPDATE M_Product_PO SET Order_Pack = 1 WHERE Order_Pack IS NULL OR Order_Pack < 1');                         // :176-181
      var n4 = upd(trx, "UPDATE M_Product_PO p SET IsCurrentVendor='Y' WHERE IsCurrentVendor<>'Y' AND EXISTS (SELECT pp.M_Product_ID FROM M_Product_PO pp WHERE p.M_Product_ID=pp.M_Product_ID GROUP BY pp.M_Product_ID HAVING COUNT(*) = 1)");   // :184-193
      var n5 = upd(trx, "UPDATE M_Product_PO p SET IsCurrentVendor='N' WHERE IsCurrentVendor = 'Y' AND EXISTS (SELECT pp.M_Product_ID FROM M_Product_PO pp WHERE p.M_Product_ID=pp.M_Product_ID AND pp.IsCurrentVendor='Y' GROUP BY pp.M_Product_ID HAVING COUNT(*) > 1)");   // :196-205
      var n6 = upd(trx, 'DELETE FROM T_Replenish WHERE AD_PInstance_ID=' + this.getAD_PInstance_ID());                               // :208-211 just to be sure
      trx.say('§RRP prepareTable maxLevelFixed=' + n1 + ' orderMinFixed=' + n2 + ' orderPackFixed=' + n3 + ' currentVendorY=' + n4 + ' currentVendorN=' + n5 + ' tempDeleted=' + n6);
    };
    ReplenishReportProduction.prototype.fillTable = function (trx, wh, M) {            // :218-438
      var self = this, MT = M.MT, D = MT.D, N = MT.N, Z = MT.Z, pin = this.getAD_PInstance_ID(), w = this.p_M_Warehouse_ID, rows = [], tag = '§RRP fillTable pinstance=' + pin;
      var reps = trx.find('m_replenish', {}), pos = trx.find('m_product_po', {});       // overlay reads: they see prepareTable's pending writes (a raw SELECT would not)
      function prod(id) { return trx.get('m_product', id); }
      function row(r, bp, omin, opack) {
        return { ad_pinstance_id: pin, m_warehouse_id: r.m_warehouse_id, m_product_id: r.m_product_id, ad_client_id: r.ad_client_id, ad_org_id: r.ad_org_id, qtyonhand: Z, qtyreserved: Z, qtyordered: Z, replenishtype: r.replenishtype,
          level_min: D(r.level_min), level_max: D(r.level_max), c_bpartner_id: bp, order_min: D(omin), order_pack: D(opack), qtytoorder: Z, replenishmentcreate: self.p_ReplenishmentCreate, m_warehousesource_id: null, c_doctype_id: null };
      }
      function catKanban(p) { return (self.p_M_Product_Category_ID === 0 || Number(p.m_product_category_id) === self.p_M_Product_Category_ID) && (self.isKanban == null || p.iskanban === self.isKanban); }
      // INSERT (1) :219-247 - Only Current Vendor: M_Replenish r JOIN M_Product_PO po JOIN M_Product p WHERE po.IsCurrentVendor='Y' AND r.ReplenishType<>'0' AND po.IsActive='Y' AND r.IsActive='Y' AND r.M_Warehouse_ID=? [AND po.C_BPartner_ID=?] [category] [IsKanban]
      reps.forEach(function (r) {
        if (r.replenishtype === '0' || r.isactive !== 'Y' || Number(r.m_warehouse_id) !== w) return;
        var p = prod(r.m_product_id); if (!p || !catKanban(p)) return;
        pos.forEach(function (po) { if (Number(po.m_product_id) === Number(r.m_product_id) && po.iscurrentvendor === 'Y' && po.isactive === 'Y' && (self.p_C_BPartner_ID === 0 || Number(po.c_bpartner_id) === self.p_C_BPartner_ID)) rows.push(row(r, po.c_bpartner_id, po.order_min, po.order_pack)); });
      });
      var n1 = rows.length;
      // INSERT (BP) :250-276 - no partner given: the policies not yet in the table, partner 0, Order_Min 1, Order_Pack 1 (NOT EXISTS ... t.M_Product_ID = r.M_Product_ID)
      if (this.p_C_BPartner_ID === 0) {
        reps.forEach(function (r) {
          if (r.replenishtype === '0' || r.isactive !== 'Y' || Number(r.m_warehouse_id) !== w) return;
          var p = prod(r.m_product_id); if (!p || !catKanban(p)) return;
          if (rows.some(function (t) { return Number(t.m_product_id) === Number(r.m_product_id); })) return;
          rows.push(row(r, 0, 1, 1));
        });
      }
      var n2 = rows.length - n1;
      // UPDATE :279-290 QtyOnHand / QtyReserved (IsSOTrx='Y') / QtyOrdered (IsSOTrx='N') [, C_DocType_ID]
      rows.forEach(function (t) {
        var oh = trx.q('SELECT COALESCE(SUM(s.QtyOnHand),0) AS q FROM M_StorageOnHand s, M_Locator l WHERE s.M_Product_ID=? AND l.M_Locator_ID=s.M_Locator_ID AND l.M_Warehouse_ID=?', [t.m_product_id, t.m_warehouse_id])[0];
        var rs = trx.q("SELECT COALESCE(SUM(s.Qty),0) AS q FROM M_StorageReservation s WHERE s.M_Product_ID=? AND s.M_Warehouse_ID=? AND s.IsSOTrx='Y'", [t.m_product_id, t.m_warehouse_id])[0];
        var od = trx.q("SELECT COALESCE(SUM(s.Qty),0) AS q FROM M_StorageReservation s WHERE s.M_Product_ID=? AND s.M_Warehouse_ID=? AND s.IsSOTrx='N'", [t.m_product_id, t.m_warehouse_id])[0];
        t.qtyonhand = D(oh ? oh.q : 0); t.qtyreserved = D(rs ? rs.q : 0); t.qtyordered = D(od ? od.q : 0);
        if (self.p_C_DocType_ID !== 0) t.c_doctype_id = self.p_C_DocType_ID;
      });
      // UPDATE :292-303 add production lines: QtyReserved - SUM(MovementQty<0), QtyOrdered + SUM(MovementQty>0) of the unprocessed M_ProductionLine at the warehouse's locators
      var prodTouched = 0;
      if (BRK !== 'noprod') rows.forEach(function (t) {
        var neg = trx.q("SELECT COALESCE(SUM(p.MovementQty),0) AS q FROM M_ProductionLine p, M_Locator l WHERE p.M_Product_ID=? AND l.M_Locator_ID=p.M_Locator_ID AND l.M_Warehouse_ID=? AND p.MovementQty < 0 AND p.Processed = 'N'", [t.m_product_id, t.m_warehouse_id])[0];
        var pl = trx.q("SELECT COALESCE(SUM(p.MovementQty),0) AS q FROM M_ProductionLine p, M_Locator l WHERE p.M_Product_ID=? AND l.M_Locator_ID=p.M_Locator_ID AND l.M_Warehouse_ID=? AND p.MovementQty > 0 AND p.Processed = 'N'", [t.m_product_id, t.m_warehouse_id])[0];
        var dn = D(neg ? neg.q : 0), dp = D(pl ? pl.q : 0);
        if (dn.signum() !== 0 || dp.signum() !== 0) prodTouched++;
        t.qtyreserved = t.qtyreserved.subtract(dn); t.qtyordered = t.qtyordered.add(dp);
        if (self.p_C_DocType_ID !== 0) t.c_doctype_id = self.p_C_DocType_ID;
      });
      // DELETE :307-316 inactive products and replenishments (the product inactive, or an inactive M_Replenish row of the same product at this warehouse)
      var before = rows.length;
      rows = rows.filter(function (t) {
        var p = prod(t.m_product_id);
        return !((p && p.isactive === 'N') || reps.some(function (rr) { return Number(rr.m_product_id) === Number(t.m_product_id) && rr.isactive === 'N' && Number(rr.m_warehouse_id) === w; }));
      });
      var nInactive = before - rows.length;
      // :318-326 ensure data consistency (NULL -> 0) - the in-memory columns are never NULL
      // :329-345 QtyToOrder by ReplenishType 1 / 2, Order_Min :348-356, Order_Pack :359-366 - ONE calc (ERPEngine.replenishQtyToOrder)
      rows.forEach(function (t) {
        t.qtytoorder = D(M.E.replenishQtyToOrder({ type: t.replenishtype, onHand: t.qtyonhand.toString(), reserved: t.qtyreserved.toString(), ordered: t.qtyordered.toString(), levelMin: t.level_min.toString(), levelMax: t.level_max.toString(), orderMin: t.order_min.toString(), orderPack: t.order_pack.toString() }));
      });
      // :369-379 Source from other warehouse; :381-390 same source -> NULL
      if (nz(wh.m_warehousesource_id) !== 0) rows.forEach(function (t) { t.m_warehousesource_id = wh.m_warehousesource_id; });
      rows.forEach(function (t) { if (t.m_warehousesource_id != null && Number(t.m_warehouse_id) === Number(t.m_warehousesource_id)) t.m_warehousesource_id = null; });
      // :392-428 Custom Replenishment (ReplenishType '9' rows, after Min/Pack - the custom qty is not Min/Pack-adjusted, as Java)
      var className = wh.replenishmentclass;
      if (className != null && String(className).length > 0) {
        var custom = CUSTOM[className];
        if (!custom) throw new Error('No custom Replenishment class ' + className + ' - java.lang.ClassNotFoundException: ' + className);   // :402-406
        rows.forEach(function (t) {
          if (t.replenishtype !== '9') return;
          var q = null; try { q = custom(wh, t); } catch (e) { trx.say('§PROC-SEVERE ReplenishInterface ' + ((e && e.message) || e)); }
          t.qtytoorder = q == null ? Z : D(q);
        });
      }
      // DELETE :430-436 rows where nothing to order
      before = rows.length; rows = rows.filter(function (t) { return t.qtytoorder.compareTo(D(1)) >= 0; });
      var nGone = before - rows.length;
      rows.forEach(function (t) {                                                        // write once (the Java's rows, in insertion order)
        trx.insert('t_replenish', { ad_pinstance_id: t.ad_pinstance_id, m_warehouse_id: t.m_warehouse_id, m_product_id: t.m_product_id, ad_client_id: t.ad_client_id, ad_org_id: t.ad_org_id, qtyonhand: N(t.qtyonhand), qtyreserved: N(t.qtyreserved), qtyordered: N(t.qtyordered),
          replenishtype: t.replenishtype, level_min: N(t.level_min), level_max: N(t.level_max), c_bpartner_id: t.c_bpartner_id, order_min: N(t.order_min), order_pack: N(t.order_pack), qtytoorder: N(t.qtytoorder), replenishmentcreate: t.replenishmentcreate,
          m_warehousesource_id: t.m_warehousesource_id, c_doctype_id: t.c_doctype_id, updated: trx.env.now || trx.env.date });
      });
      this.rows = rows;
      trx.say(tag + ' insert1=' + n1 + ' insertBP=' + n2 + ' productionLinesTouched=' + prodTouched + ' deletedInactive=' + nInactive + ' deletedNoQty=' + nGone + ' kept=' + rows.length + (BRK ? ' BREAK=' + BRK : ''));
    };
    function nz(v) { return v == null || v === '' ? 0 : Number(v); }
    // getReplenish(where) :826-857 - the T_Replenish rows of this AD_PInstance_ID, ORDER BY M_Warehouse_ID, M_WarehouseSource_ID, C_BPartner_ID (NULLs last, as Postgres); ties keep insertion order (heap order is undefined upstream)
    ReplenishReportProduction.prototype.getReplenish = function (pred) {
      var k = function (v) { return v == null ? Infinity : Number(v); };
      return this.rows.map(function (t, i) { return { t: t, i: i }; }).filter(function (x) { return pred(x.t); }).sort(function (a, b) {
        return (k(a.t.m_warehouse_id) - k(b.t.m_warehouse_id)) || (a.t.m_warehousesource_id == null ? (b.t.m_warehousesource_id == null ? 0 : 1) : b.t.m_warehousesource_id == null ? -1 : Number(a.t.m_warehousesource_id) - Number(b.t.m_warehousesource_id)) || (k(a.t.c_bpartner_id) - k(b.t.c_bpartner_id)) || (a.i - b.i);
      }).map(function (x) { return x.t; });
    };
    function msg(self, key) { return X.A.Msg.getMsg(self.getCtx(), key); }
    function created(self, label) { return X.A.Msg.parseTranslation(self.getCtx(), label); }
    ReplenishReportProduction.prototype.createPO = function (trx, M) {                  // :443-488
      var A = X.A, MO = M.MO, noOrders = 0, info = '', order = null, wh = null, orderId = null, self = this, stop = false;
      var reps = this.getReplenish(function (t) { return t.m_warehousesource_id == null && Number(t.c_bpartner_id) > 0; });   // :450
      reps.forEach(function (rep) {
        if (stop) return;
        if (wh == null || Number(wh.m_warehouse_id) !== Number(rep.m_warehouse_id)) wh = trx.get('m_warehouse', rep.m_warehouse_id);   // :454-455
        var cur = orderId == null ? null : trx.get('c_order', orderId);
        if (cur == null || Number(cur.c_bpartner_id) !== Number(rep.c_bpartner_id) || Number(cur.m_warehouse_id) !== Number(rep.m_warehouse_id)) {   // :457-460
          order = MO.MOrder_new(trx);                                                      // :462 new MOrder(ctx, 0, trx)
          order.set('issotrx', 'N');                                                       // :463 setIsSOTrx(false)
          order.set('c_doctypetarget_id', self.p_C_DocType_ID);                            // :464
          MO.MOrder_setBPartner(trx, order, trx.get('c_bpartner', rep.c_bpartner_id));     // :465-466 setBPartner(new MBPartner(...))
          order.set('salesrep_id', self.getAD_User_ID());                                  // :467
          order.set('description', msg(self, 'Replenishment'));                            // :468
          order.set('ad_org_id', wh.ad_org_id); order.set('m_warehouse_id', wh.m_warehouse_id);   // :470-472
          MO.MOrder_beforeSaveNew(trx, order, self.getCtx());                              // MOrder.beforeSave (new record)
          if (!order.save()) { stop = true; return; }                                      // :473-474 (the Java returns)
          orderId = order.id(); cur = trx.get('c_order', orderId);
          self.addBufferLog(cur.c_order_id, cur.dateordered, null, created(self, '@C_Order_ID@ @Created@'), 259, cur.c_order_id);   // :475-477 MOrder.Table_ID 259
          noOrders++; info += ' - ' + cur.documentno;                                      // :479-481
        }
        var line = MO.MOrderLine_new(trx, order);                    // :484 new MOrderLine(order)
        line.set('m_product_id', rep.m_product_id);                                        // :485
        line.set('qtyentered', rep.qtytoorder).set('qtyordered', rep.qtytoorder);          // :486 setQty = QtyEntered then QtyOrdered
        MO.MOrderLine_setPrice(trx, line);                                                 // :487
        MO.saveEx(line);                                                                   // :488 saveEx
      });
      this.m_info = '#' + noOrders + info;                                                 // :490
    };
    ReplenishReportProduction.prototype.createRequisition = function (trx, M) {         // :494-538
      var MLo = M.ML, MO = M.MO, noReqs = 0, info = '', wh = null, reqId = null, self = this, stop = false;
      var reps = this.getReplenish(function (t) { return t.m_warehousesource_id == null && Number(t.c_bpartner_id) > 0; });   // :501
      reps.forEach(function (rep) {
        if (stop) return;
        if (wh == null || Number(wh.m_warehouse_id) !== Number(rep.m_warehouse_id)) wh = trx.get('m_warehouse', rep.m_warehouse_id);
        var cur = reqId == null ? null : trx.get('m_requisition', reqId);
        if (cur == null || Number(cur.m_warehouse_id) !== Number(rep.m_warehouse_id)) {   // :510-511
          var req = MLo.newRecord(trx, 'm_requisition', {});                               // :513 new MRequisition(ctx, 0, trx)
          req.set('ad_user_id', self.getAD_User_ID()); req.set('c_doctype_id', self.p_C_DocType_ID);   // :514-515
          req.set('description', msg(self, 'Replenishment'));                              // :516
          req.set('ad_org_id', wh.ad_org_id); req.set('m_warehouse_id', wh.m_warehouse_id);   // :518-519
          if (!req.save()) { stop = true; return; }                                        // :520-521
          reqId = req.id(); cur = trx.get('m_requisition', reqId);
          self.addBufferLog(cur.m_requisition_id, cur.datedoc, null, created(self, '@M_Requisition_ID@ @Created@'), 702, cur.m_requisition_id);   // :522-524 MRequisition.Table_ID 702
          noReqs++; info += ' - ' + cur.documentno;
        }
        var hdr = trx.get('m_requisition', reqId);
        var line = MLo.newRecord(trx, 'm_requisitionline', {});                            // :532 new MRequisitionLine(requisition) = setClientOrg + M_Requisition_ID
        line.set('ad_client_id', hdr.ad_client_id).set('ad_org_id', hdr.ad_org_id).set('m_requisition_id', hdr.m_requisition_id);
        line.set('m_product_id', rep.m_product_id).set('c_bpartner_id', rep.c_bpartner_id).set('qty', rep.qtytoorder);   // :533-535
        MO.MRequisitionLine_setPrice(trx, line, hdr.m_pricelist_id);                       // :536 setPrice()
        MO.saveEx(line);                                                                   // :537
      });
      this.m_info = '#' + noReqs + info;
    };
    // MStorageOnHand.getWarehouse(ctx, whId, product, 0, null, FiFo, false, 0, trx) :398-520 - all instances: ORDER BY l.PriorityNo DESC, DateMaterialPolicy [DESC, ASI DESC when not FiFo | , ASI], QtyOnHand DESC
    function storageWarehouse(trx, whId, productId, fifo) {
      var p = trx.get('m_product', productId), useGd = p && p.isuseguaranteedateformpolicy === 'Y';
      var rows = trx.q('SELECT s.M_Locator_ID AS loc, s.M_AttributeSetInstance_ID AS asi, s.QtyOnHand AS q, s.DateMaterialPolicy AS dmp, l.PriorityNo AS pr, a.GuaranteeDate AS gd FROM M_StorageOnHand s INNER JOIN M_Locator l ON (l.M_Locator_ID=s.M_Locator_ID) LEFT OUTER JOIN M_AttributeSetInstance a ON (s.M_AttributeSetInstance_ID=a.M_AttributeSetInstance_ID) WHERE l.M_Warehouse_ID=? AND s.M_Product_ID=? AND s.QtyOnHand <> 0', [whId, productId]);
      var key = function (r) { return String(useGd && r.gd ? r.gd : (r.dmp || '')); }, sgn = fifo ? 1 : -1;
      rows.sort(function (a, b) {
        var c = Number(b.pr || 0) - Number(a.pr || 0); if (c) return c;
        var ka = key(a), kb = key(b); c = ka < kb ? -sgn : ka > kb ? sgn : 0; if (c) return c;
        c = (Number(a.asi || 0) - Number(b.asi || 0)) * sgn; if (c) return c;
        return Number(b.q) - Number(a.q);
      });
      return rows;
    }
    ReplenishReportProduction.prototype.createMovements = function (trx, M) {          // :543-644
      var MLo = M.ML, MT = M.MT, D = MT.D, noMoves = 0, info = '', moveId = null, curSrc = 0, curWh = 0, self = this, stop = false;
      var reps = this.getReplenish(function (t) { return t.m_warehousesource_id != null && Number(t.c_bpartner_id) > 0; });   // :554
      reps.forEach(function (rep) {
        if (stop) return;
        var whSource = trx.get('m_warehouse', rep.m_warehousesource_id), wh = trx.get('m_warehouse', rep.m_warehouse_id);   // :558-563 (the Java compares whSource's OWN source id - always unequal - and reloads; same row)
        if (moveId == null || curSrc !== Number(rep.m_warehousesource_id) || curWh !== Number(rep.m_warehouse_id)) {   // :565-568
          curSrc = Number(rep.m_warehousesource_id); curWh = Number(rep.m_warehouse_id);
          var move = MLo.newRecord(trx, 'm_movement', {});                                 // :572 new MMovement(ctx, 0, trx)
          move.set('c_doctype_id', self.p_C_DocType_ID);
          move.set('description', msg(self, 'Replenishment') + ': ' + whSource.name + '->' + wh.name);   // :574-576
          move.set('ad_org_id', whSource.ad_org_id);                                       // :578
          if (!move.save()) { stop = true; return; }                                       // :579-580
          moveId = move.id(); var cur = trx.get('m_movement', moveId);
          self.addBufferLog(cur.m_movement_id, cur.movementdate, null, created(self, '@M_Movement_ID@ @Created@'), 323, cur.m_movement_id);   // :581-583 MMovement.Table_ID 323
          noMoves++; info += ' - ' + cur.documentno;
        }
        var locTo = M.CT.defaultLocator(trx, wh.m_warehouse_id);                           // :591 wh.getDefaultLocator()
        var product = trx.get('m_product', rep.m_product_id), cat = trx.get('m_product_category', product.m_product_category_id) || {}, cl = trx.get('ad_client', trx.env.client) || {};
        var fifo = (cat.mmpolicy || cl.mmpolicy || 'F') === 'F';                           // MProduct.getMMPolicy :594
        var storages = storageWarehouse(trx, whSource.m_warehouse_id, rep.m_product_id, fifo);   // :595-597
        var target = rep.qtytoorder;
        for (var j = 0; j < storages.length; j++) {
          var s = storages[j];
          if (D(s.q).signum() <= 0) continue;                                              // :603-604
          var loc = trx.get('m_locator', s.loc), lt = loc && nz(loc.m_locatortype_id) ? trx.get('m_locatortype', loc.m_locatortype_id) : null;   // :607-612 IDEMPIERE-2668
          if (lt && lt.isavailableforreplenishment !== 'Y') continue;
          var moveQty = target; if (D(s.q).compareTo(moveQty) < 0) moveQty = D(s.q);       // :614-616
          var line = MLo.newRecord(trx, 'm_movementline', {});                             // :618 new MMovementLine(move)
          var hdr = trx.get('m_movement', moveId);
          line.set('ad_client_id', hdr.ad_client_id).set('ad_org_id', hdr.ad_org_id).set('m_movement_id', hdr.m_movement_id);
          line.set('m_product_id', rep.m_product_id).set('movementqty', moveQty);         // :619-620
          if (D(rep.qtytoorder).compareTo(moveQty) !== 0) line.set('description', 'Total: ' + D(rep.qtytoorder).toString());   // :621-622
          line.set('m_locator_id', s.loc).set('m_attributesetinstance_id', s.asi || 0).set('m_locatorto_id', locTo).set('m_attributesetinstanceto_id', s.asi || 0);   // :623-627
          M.MO.saveEx(line);                                                               // :628
          target = D(target).subtract(moveQty);                                            // :630
          if (target.signum() === 0) break;                                                // :631-632
        }
      });
      if (reps.length === 0) { this.m_info = 'No Source Warehouse'; trx.say('§PROC-WARNING ' + this.m_info); }   // :636-640
      else this.m_info = '#' + noMoves + info;
    };
    ReplenishReportProduction.prototype.createDO = function (trx, M) {                  // :647-751
      var MLo = M.ML, noMoves = 0, info = '', orderId = null, curSrc = 0, curWh = 0, self = this;
      var reps = this.getReplenish(function (t) { return t.m_warehousesource_id != null; });   // :658
      var stop = false;
      reps.forEach(function (rep) {
        if (stop) return;
        var whSource = trx.get('m_warehouse', rep.m_warehousesource_id), wh = trx.get('m_warehouse', rep.m_warehouse_id);   // :661-666
        if (orderId == null || curSrc !== Number(rep.m_warehousesource_id) || curWh !== Number(rep.m_warehouse_id)) {   // :668-671
          curSrc = Number(rep.m_warehousesource_id); curWh = Number(rep.m_warehouse_id);
          var order = MLo.newRecord(trx, 'dd_order', {});                                  // :675 new MDDOrder(ctx, 0, trx)
          order.set('c_doctype_id', self.p_C_DocType_ID);
          order.set('description', msg(self, 'Replenishment') + ': ' + whSource.name + '->' + wh.name);   // :677-679
          order.set('ad_org_id', whSource.ad_org_id);                                      // :681
          order.set('ad_orgtrx_id', wh.ad_org_id);                                         // :683-684 MOrg.get(wh.getAD_Org_ID())
          var bpRow = trx.q('SELECT C_BPartner_ID FROM C_BPartner WHERE AD_OrgBP_ID=?', [wh.ad_org_id])[0], bpId = bpRow ? nz(bpRow.c_bpartner_id) : 0;   // MOrg.getLinkedC_BPartner_ID :286-290
          if (bpId === 0) throw new Error(X.A.Msg.translate(self.getCtx(), 'C_BPartner_ID') + ' @FillMandatory@ ');   // :686-687
          order.set('c_bpartner_id', bpId);                                                // :688-690 setBPartner (the dd_order model's beforeSave completes the partner defaults, MDDOrder.setBPartner :284)
          order.set('dateordered', trx.env.date);                                          // :692 new Timestamp(now)
          order.set('deliveryrule', 'A').set('deliveryviarule', 'D').set('priorityrule', '5');   // :693-695 Availability / Delivery / Medium
          order.set('isindispute', 'N').set('isapproved', 'N').set('isdropship', 'N').set('isdelivered', 'N').set('isintransit', 'N').set('isprinted', 'N').set('isselected', 'N').set('issotrx', 'N');   // :696-704
          var inTransit = 0;                                                               // :706-712 MWarehouse.getForOrg(whSource org) - the LAST in-transit warehouse wins
          trx.q("SELECT M_Warehouse_ID FROM M_Warehouse WHERE AD_Org_ID=? AND IsActive='Y' AND IsInTransit='Y' ORDER BY M_Warehouse_ID", [whSource.ad_org_id]).forEach(function (r) { inTransit = Number(r.m_warehouse_id); });
          if (inTransit) order.set('m_warehouse_id', inTransit);
          if (nz(order.get('m_warehouse_id')) === 0) throw new Error('Warehouse inTransit is @FillMandatory@ ');   // :713-714
          if (!order.save()) { stop = true; return; }                                      // :716-717
          orderId = order.id(); var cur = trx.get('dd_order', orderId);
          self.addBufferLog(cur.dd_order_id, cur.dateordered, null, created(self, '@DD_Order_ID@ @Created@'), 53037, cur.dd_order_id);   // :718-720 MDDOrder.Table_ID
          noMoves++; info += ' - ' + cur.documentno;
        }
        var locTo = M.CT.defaultLocator(trx, wh.m_warehouse_id), locFrom = M.CT.defaultLocator(trx, whSource.m_warehouse_id);   // :727-728
        if (locTo === 0 || locFrom === 0) throw new Error(X.A.Msg.translate(self.getCtx(), 'M_Locator_ID') + ' @FillMandatory@ ');   // :729-730
        var hdr = trx.get('dd_order', orderId), line = MLo.newRecord(trx, 'dd_orderline', {});   // :732 new MDDOrderLine(order) = DD_Order_ID + setOrder
        line.set('ad_client_id', hdr.ad_client_id).set('ad_org_id', hdr.ad_org_id).set('dd_order_id', hdr.dd_order_id);
        line.set('m_product_id', rep.m_product_id);                                        // :733
        line.set('qtyentered', rep.qtytoorder).set('qtyordered', rep.qtytoorder);          // :734 setQty
        // :735-736 `if (QtyToOrder.compareTo(QtyToOrder) != 0) setDescription(...)` - compares the value with itself, never true upstream (kept: no description)
        line.set('m_locator_id', locFrom).set('m_attributesetinstance_id', 0).set('m_locatorto_id', locTo).set('m_attributesetinstanceto_id', 0).set('isinvoiced', 'N');   // :737-742
        M.MO.saveEx(line);                                                                 // :743
      });
      if (reps.length === 0) { this.m_info = 'No Source Warehouse'; trx.say('§PROC-WARNING ' + this.m_info); }   // :745-749
      else this.m_info = '#' + noMoves + info;
    };
    ReplenishReportProduction.prototype.createProduction = function (trx, M) {          // :756-816
      var self = this;
      var reps = this.getReplenish(function (t) {                                       // :763-765 M_WarehouseSource_ID IS NULL AND EXISTS (product IsBOM='Y' AND IsManufactured='Y')
        var p = trx.get('m_product', t.m_product_id); return t.m_warehousesource_id == null && p && p.isbom === 'Y' && p.ismanufactured === 'Y';
      });
      if (reps.length) {
        // NAMED refusal (never silent): MProduction (header + createLines(false) = the BOM explosion into M_ProductionLine, MProduction.java) is manufacturing, not core (AD-LAYER LAW rule 6;
        // processes/ProductionCreate.js carries the same named dependency). The T_Replenish rows this run wrote are real and judged; only the production documents are refused.
        trx.say('§PROC-UNPORTED-DEP ReplenishReportProduction.createProduction: MProduction.createLines (manufacturing - not core) - ' + reps.length + ' T_Replenish row(s) would create production documents');
        throw new Error('MProduction.createLines not ported - named (manufacturing is not core): ' + reps.length + ' production document(s) not created');
      }
      this.m_info = '#0';                                                                // :814 (no row qualifies: the loop body never runs)
      void self;
    };
    return ReplenishReportProduction;
  });
  // the registry of custom ReplenishInterface implementations (Core.getReplenish) - a plugin registers its class here
  P.registerReplenishInterface = function (name, fn) { CUSTOM[name] = fn; };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

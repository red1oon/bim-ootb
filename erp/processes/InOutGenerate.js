// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/InOutGenerate.js - org.compiere.process.InOutGenerate, verbatim
// (org.adempiere.base.process/src/org/compiere/process/InOutGenerate.java). bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §33 - Witness: W-CP-PROC-ORACLE (proc_InOutGenerate.json).
// NAMED, not faked: (1) candidate query = M_InOut_Candidate_v's ORDER branch inlined (the view is not in the bundle; RMA branch not ported). (2) T_Selection path and the
// auto-produce BOM branch (MProduct.isAutoProduce, :373) are not ported (treated as not-BOM). (3) MStorageOnHand.getWarehouse (:376-536) is ported below on trx.q;
// the locator-type filter (:630-640, IDEMPIERE-2668) is applied when M_LocatorType exists. (4) MOrder.getPaymentAmt for the AfterPayment rule: SUM(PayAmt) of completed payments.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.InOutGenerate', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function InOutGenerate() {
      SvrProcess.call(this);
      this.p_Selection = false; this.p_M_Warehouse_ID = 0; this.p_C_BPartner_ID = 0; this.p_DatePromised = null; this.p_IsUnconfirmedInOut = false; this.p_SubtractOnHand = false;
      this.p_docAction = '--'; this.p_ConsolidateDocument = true; this.p_DateShipped = null;
      this.m_shipment = null; this.m_created = 0; this.m_line = 0; this.m_movementDate = null; this.m_lastC_BPartner_Location_ID = -1; this.m_map = {};
    }
    InOutGenerate.prototype = Object.create(SvrProcess.prototype);
    InOutGenerate.prototype.prepare = function () {                                      // :97-129
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'M_Warehouse_ID') this.p_M_Warehouse_ID = para[i].getParameterAsInt();
        else if (name === 'C_BPartner_ID') this.p_C_BPartner_ID = para[i].getParameterAsInt();
        else if (name === 'DatePromised') this.p_DatePromised = para[i].getParameter();   // iso() applied where bound
        else if (name === 'Selection') this.p_Selection = 'Y' === para[i].getParameter();
        else if (name === 'IsUnconfirmedInOut') this.p_IsUnconfirmedInOut = 'Y' === para[i].getParameter();
        else if (name === 'SubtractOnHand') this.p_SubtractOnHand = 'Y' === para[i].getParameter();
        else if (name === 'ConsolidateDocument') this.p_ConsolidateDocument = 'Y' === para[i].getParameter();
        else if (name === 'DocAction') this.p_docAction = para[i].getParameter();
        else if (name === 'MovementDate') this.p_DateShipped = para[i].getParameter();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA InOutGenerate ' + name);
      }
      if (this.p_DateShipped != null) this.p_DateShipped = iso(this.p_DateShipped);
      if (this.p_DateShipped == null) { this.m_movementDate = X.A.Env.getContextAsDate ? iso(X.A.Env.getContextAsDate(this.getCtx(), 'Date')) : null; if (this.m_movementDate == null) this.m_movementDate = new Date().toISOString().slice(0, 10); }
      else this.m_movementDate = this.p_DateShipped;
    };
    InOutGenerate.prototype.doIt = function () {                                         // :136-205
      var trx = this.get_TrxName(), p = [];
      if (this.p_Selection) throw new Error('InOutGenerate: T_Selection (info window) path is not ported');
      if (this.p_M_Warehouse_ID === 0) throw new Error('@NotFound@ @M_Warehouse_ID@');
      var sql = "SELECT o.* FROM c_order o WHERE o.docstatus='CO' AND o.isdelivered='N' AND o.issotrx='Y' AND o.ad_client_id=?" +
        " AND o.c_doctype_id IN (SELECT c_doctype_id FROM c_doctype WHERE docbasetype='SOO' AND docsubtypeso NOT IN ('ON','OB','WR')) AND o.deliveryrule<>'M'" +   // :168-173
        " AND EXISTS (SELECT 1 FROM c_orderline l WHERE l.c_order_id=o.c_order_id AND l.m_warehouse_id=?";                                                       // :175-178
      p.push(this.getAD_Client_ID(), this.p_M_Warehouse_ID);
      if (this.p_DatePromised != null) { sql += ' AND date(l.datepromised)<=date(?)'; p.push(iso(this.p_DatePromised)); }
      sql += " AND l.qtyordered<>l.qtydelivered AND (l.m_product_id IS NULL OR EXISTS (SELECT 1 FROM m_product pr WHERE pr.m_product_id=l.m_product_id AND pr.isexcludeautodelivery='N'))" +   // view terms
        " AND (l.m_product_id IS NOT NULL OR l.c_charge_id IS NOT NULL)" +
        " AND NOT EXISTS (SELECT 1 FROM m_inoutline iol JOIN m_inout io ON io.m_inout_id=iol.m_inout_id WHERE iol.c_orderline_id=l.c_orderline_id AND io.docstatus IN ('DR','IN','IP','WC')))";
      if (this.p_C_BPartner_ID !== 0) { sql += ' AND o.c_bpartner_id=?'; p.push(this.p_C_BPartner_ID); }
      sql += ' ORDER BY ' + 'o.priorityrule, o.m_shipper_id, o.c_bpartner_id, o.c_bpartner_location_id, o.c_order_id';
      return this.generate(trx.q(sql, p));
    };
    function iso(v) { return v instanceof Date ? v.toISOString().slice(0, 10) : (v == null ? v : String(v).slice(0, 10)); }   // dates bind as yyyy-mm-dd text
    function D(A, v) { return A.toBD(String(v == null ? 0 : v)); }
    // MStorageOnHand.getWarehouse :376-536 (+ the locator-type filter of getStorages :624-648)
    InOutGenerate.prototype.getStorages = function (wh, productId, asiId, minGuaranteeDate, fifo) {
      var A = X.A, trx = this.get_TrxName(), key = [wh, productId, asiId, minGuaranteeDate, fifo].join('|');
      if (this.m_map[key]) return this.m_map[key];
      // ONE getWarehouse implementation (model_asi.js storages; AS-3): this file's own copy read a product column that does not exist (isuseguaranteedateformpolicy - the flag is the Attribute Set's)
      var MA = (typeof globalThis !== 'undefined' && globalThis.ModelAsi) || (typeof require === 'function' ? require('../model_asi') : null);
      var rows = MA.storages(trx, { warehouseId: wh, productId: productId, asiId: asiId, minGuaranteeDate: minGuaranteeDate, fifo: fifo, positiveOnly: false });
      rows = rows.filter(function (soh) {                                                // IDEMPIERE-2668: locators enabled for shipping
        var loc = trx.get('m_locator', soh.m_locator_id); if (!loc || !loc.m_locatortype_id) return true;
        var lt = trx.get('m_locatortype', loc.m_locatortype_id); return !lt || lt.isavailableforshipping !== 'N';
      });
      rows.forEach(function (r) { r.qtyonhand = D(A, r.qtyonhand); });                    // in-memory BigDecimal, adjusted like the Java objects, never saved
      return (this.m_map[key] = rows);
    };
    InOutGenerate.prototype.mmPolicyFifo = function (product) {                          // MProduct.getMMPolicy :990-996
      var trx = this.get_TrxName(), pc = product.m_product_category_id ? trx.get('m_product_category', product.m_product_category_id) : null, pol = pc && pc.mmpolicy;
      if (!pol) { var cl = trx.get('ad_client', trx.env.client); pol = cl && cl.mmpolicy; }
      return pol === 'F';
    };
    InOutGenerate.prototype.generate = function (orders) {                               // :213-436
      var A = X.A, Env = A.Env, trx = this.get_TrxName();
      for (var n = 0; n < orders.length; n++) {
        var order = orders[n]; this.statusUpdate('Processing ' + order.documentno);
        if ('P' === order.deliveryrule) {                                                // :222 AfterPayment
          var pay = trx.q("SELECT COALESCE(SUM(payamt),0) AS a FROM c_payment WHERE c_order_id=? AND docstatus IN ('CO','CL')", [order.c_order_id])[0];
          if (D(A, pay && pay.a).compareTo(D(A, order.grandtotal)) < 0) continue;
        }
        if (this.p_M_Warehouse_ID === 0) this.p_M_Warehouse_ID = order.m_warehouse_id;
        if (!this.p_ConsolidateDocument || (this.m_shipment != null && (Number(this.m_shipment.get('c_bpartner_location_id')) !== Number(order.c_bpartner_location_id) ||
            Number(this.m_shipment.get('m_shipper_id') || 0) !== Number(order.m_shipper_id || 0)))) this.completeShipment();   // :236-241
        var minGuaranteeDate = this.m_movementDate, completeOrder = 'O' === order.deliveryrule;
        var sql = 'SELECT l.* FROM c_orderline l WHERE l.c_order_id=? AND l.m_warehouse_id=?', p = [order.c_order_id, this.p_M_Warehouse_ID];
        if (this.p_DatePromised != null) { sql += ' AND (date(l.datepromised)<=date(?) OR l.datepromised IS NULL)'; p.push(iso(this.p_DatePromised)); }
        if ('F' !== order.deliveryrule) sql += " AND (l.m_product_id IS NULL OR EXISTS (SELECT 1 FROM m_product pr WHERE pr.m_product_id=l.m_product_id AND pr.isexcludeautodelivery='N'))";
        if (!this.p_IsUnconfirmedInOut) sql += " AND NOT EXISTS (SELECT 1 FROM m_inoutline iol JOIN m_inout io ON io.m_inout_id=iol.m_inout_id WHERE iol.c_orderline_id=l.c_orderline_id AND io.docstatus IN ('DR','IN','IP','WC'))";
        sql += ' ORDER BY l.c_bpartner_location_id, l.m_product_id, l.line';             // :263 "C_BPartner_Location_ID, M_Product_ID, Line"
        var lines = trx.q(sql, p);
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (Number(line.m_warehouse_id) !== Number(this.p_M_Warehouse_ID)) continue;
          var onHand = Env.ZERO, toDeliver = D(A, line.qtyordered).subtract(D(A, line.qtydelivered));
          var product = line.m_product_id ? trx.get('m_product', line.m_product_id) : null;
          if (product != null && (toDeliver.signum() === 0 || (toDeliver.signum() < 0 && D(A, line.qtyordered).signum() > 0))) continue;
          if (line.c_charge_id && toDeliver.signum() === 0) continue;
          var unconfirmedShippedQty = Env.ZERO;
          if (this.p_IsUnconfirmedInOut && product != null && toDeliver.signum() !== 0) {
            trx.q("SELECT COALESCE(SUM(iol.movementqty),0) AS q FROM m_inoutline iol WHERE iol.c_orderline_id=? AND EXISTS (SELECT 1 FROM m_inout io WHERE io.m_inout_id=iol.m_inout_id AND io.docstatus IN ('DR','IN','IP','WC'))", [line.c_orderline_id])
              .forEach(function (r) { unconfirmedShippedQty = D(A, r.q); });
            toDeliver = toDeliver.subtract(unconfirmedShippedQty); if (toDeliver.signum() < 0) toDeliver = Env.ZERO;
            if (toDeliver.signum() === 0) { if (completeOrder) completeOrder = false; continue; }
          }
          if (product != null && toDeliver.signum() !== 0) {
            if (this.p_SubtractOnHand) {
              var tot = trx.q("SELECT COALESCE(SUM(iol.movementqty),0) AS q FROM m_inoutline iol WHERE EXISTS (SELECT 1 FROM m_inout io WHERE io.m_inout_id=iol.m_inout_id AND io.issotrx='Y' AND io.docstatus IN ('IP','WC') AND io.m_warehouse_id=?) AND iol.m_product_id=?", [this.p_M_Warehouse_ID, line.m_product_id])[0];
              onHand = onHand.subtract(D(A, tot && tot.q));
            } else if (unconfirmedShippedQty.signum() !== 0) onHand = onHand.subtract(unconfirmedShippedQty);
          }
          if ((product == null || product.isstocked !== 'Y') && (D(A, line.qtyordered).signum() === 0 || toDeliver.signum() !== 0)) {   // :348-355
            if ('O' !== order.deliveryrule) this.createLine(order, line, toDeliver, null, false);
            continue;
          }
          if (product == null) continue;
          var storages = this.getStorages(line.m_warehouse_id, line.m_product_id, line.m_attributesetinstance_id || 0, minGuaranteeDate, this.mmPolicyFifo(product));
          for (var j = 0; j < storages.length; j++) {
            onHand = onHand.add(storages[j].qtyonhand);
            if (completeOrder && j === 0) storages[j].qtyonhand = storages[j].qtyonhand.subtract(toDeliver);
          }
          var autoProduce = false;                                                        // :373 named, not ported
          var fullLine = onHand.compareTo(toDeliver) >= 0 || toDeliver.signum() < 0 || autoProduce;
          var rule = order.deliveryrule;
          if (completeOrder && !fullLine) { completeOrder = false; break; }
          else if (fullLine && 'L' === rule) this.createLine(order, line, toDeliver, storages, false);
          else if (('A' === rule || 'P' === rule) && (onHand.signum() > 0 || toDeliver.signum() < 0 || autoProduce)) {
            var deliver = toDeliver; if (deliver.compareTo(onHand) > 0 && !autoProduce) deliver = onHand;
            this.createLine(order, line, deliver, storages, false);
          } else if ('F' === rule) this.createLine(order, line, toDeliver, storages, true);
          else if ('M' === rule) { /* manual */ }
        }
        if (completeOrder && 'O' === order.deliveryrule) {                                // :400-425
          this.m_map = {};
          for (var k = 0; k < lines.length; k++) {
            var ln = lines[k]; if (Number(ln.m_warehouse_id) !== Number(this.p_M_Warehouse_ID)) continue;
            var pr = ln.m_product_id ? trx.get('m_product', ln.m_product_id) : null, td = D(A, ln.qtyordered).subtract(D(A, ln.qtydelivered)), st = null;
            if (pr != null && pr.isstocked === 'Y') st = this.getStorages(ln.m_warehouse_id, ln.m_product_id, ln.m_attributesetinstance_id || 0, minGuaranteeDate, this.mmPolicyFifo(pr));
            this.createLine(order, ln, td, st, false);
          }
        }
        this.m_line += 1000;                                                              // :427
      }
      this.completeShipment();
      return '@Created@ = ' + this.m_created;
    };
    InOutGenerate.prototype.qtyEnteredFix = function (trx, C, ioLine, orderLine, movementQty) {   // setQtyEntered(movement * entered / ordered) when UOMs differ
      var A = X.A;
      if (D(A, orderLine.qtyentered).compareTo(D(A, orderLine.qtyordered)) !== 0)
        C.ioSetQtyEntered(trx, ioLine, movementQty.multiply(D(A, orderLine.qtyentered)).divide(D(A, orderLine.qtyordered), 12, A.RoundingMode.HALF_UP));
    };
    InOutGenerate.prototype.createLine = function (order, orderLine, qty, storages, force) {   // :446-557
      var A = X.A, Env = A.Env, trx = this.get_TrxName(), C = G().ctor(), self = this;
      if (this.m_lastC_BPartner_Location_ID !== Number(orderLine.c_bpartner_location_id || 0)) this.completeShipment();
      this.m_lastC_BPartner_Location_ID = Number(orderLine.c_bpartner_location_id || 0);
      if (this.m_shipment == null) {
        this.m_shipment = C.MInOutFromOrder(trx, order, 0, this.m_movementDate);
        this.m_shipment.set('m_warehouse_id', orderLine.m_warehouse_id);
        var wh = trx.get('m_warehouse', orderLine.m_warehouse_id); if (wh && wh.ad_org_id != null) this.m_shipment.set('ad_org_id', wh.ad_org_id);   // "sets Org too"
        if (Number(order.c_bpartner_id) !== Number(orderLine.c_bpartner_id) && orderLine.c_bpartner_id) this.m_shipment.set('c_bpartner_id', orderLine.c_bpartner_id);
        if (Number(order.c_bpartner_location_id) !== Number(orderLine.c_bpartner_location_id) && orderLine.c_bpartner_location_id) this.m_shipment.set('c_bpartner_location_id', orderLine.c_bpartner_location_id);
        if (!this.m_shipment.save()) throw new Error('Could not create Shipment');
      }
      var sOne = this.m_shipment, line;
      if (storages == null) {                                                             // :478-495 non-inventory lines
        line = C.MInOutLine(trx, sOne); C.ioSetOrderLine(trx, line, orderLine, 0, Env.ZERO); C.ioSetQty(trx, line, qty);
        this.qtyEnteredFix(trx, C, line, orderLine, qty); line.set('line', this.m_line + Number(orderLine.line));
        if (!line.save()) throw new Error('Could not create Shipment Line'); return;
      }
      var list = [], toDeliver = qty, isSO = order.issotrx === 'Y';
      for (var i = 0; i < storages.length; i++) {
        var storage = storages[i], deliver = toDeliver;
        if (storage.qtyonhand.signum() < 0) continue;
        if (deliver.compareTo(storage.qtyonhand) > 0 && storage.qtyonhand.signum() >= 0) { if (!force || (force && i + 1 !== storages.length)) deliver = storage.qtyonhand; }
        if (deliver.signum() === 0) continue;
        var loc = storage.m_locator_id, found = null, olAsi = Number(orderLine.m_attributesetinstance_id || 0);
        for (var ll = 0; ll < list.length; ll++) if (Number(list[ll].get('m_locator_id')) === Number(loc) && Number(list[ll].get('m_attributesetinstance_id') || 0) === olAsi) { found = list[ll]; break; }
        if (found == null) { found = C.MInOutLine(trx, sOne); C.ioSetOrderLine(trx, found, orderLine, loc, isSO ? deliver : Env.ZERO); C.ioSetQty(trx, found, deliver); list.push(found); }
        else C.ioSetQty(trx, found, D(A, found.get('movementqty')).add(deliver));
        this.qtyEnteredFix(trx, C, found, orderLine, D(A, found.get('movementqty')));
        found.set('line', this.m_line + Number(orderLine.line));
        if (!found.save()) throw new Error('Could not create Shipment Line');
        toDeliver = toDeliver.subtract(deliver);
        storage.qtyonhand = storage.qtyonhand.subtract(deliver);                          // in-memory only (:546)
        if (toDeliver.signum() === 0) break;
      }
      if (toDeliver.signum() !== 0) {
        var autoProduce = false;
        if (!force && toDeliver.signum() > 0 && !autoProduce) throw new Error('Not All Delivered - Remainder=' + toDeliver);
        var rest = C.MInOutLine(trx, sOne); C.ioSetOrderLine(trx, rest, orderLine, 0, isSO ? toDeliver : Env.ZERO); C.ioSetQty(trx, rest, toDeliver);
        this.qtyEnteredFix(trx, C, rest, orderLine, D(A, rest.get('movementqty'))); rest.set('line', this.m_line + Number(orderLine.line));
        if (!rest.save()) throw new Error('Could not create Shipment Line');
      }
    };
    InOutGenerate.prototype.completeShipment = function () {                              // :694-717
      var trx = this.get_TrxName(), g = G();
      if (this.m_shipment != null) {
        var id = this.m_shipment.id();
        if ('--' !== this.p_docAction) {
          var res = g.ML().processIt(trx, 'm_inout', id, this.p_docAction);
          if (!res || !res.ok) throw new Error('Shipment Process Failed: ' + id + ' - ' + (res && res.msg));
        }
        var sh = trx.get('m_inout', id);
        this.addBufferLog(sh.m_inout_id, sh.movementdate, null, '@ShipmentProcessed@ ' + sh.documentno, 319, sh.m_inout_id);
        this.m_created++; this.m_map = {};
      }
      this.m_shipment = null; this.m_line = 0;
    };
    return InOutGenerate;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/OrderLineCreateShipment.js — org.compiere.process.OrderLineCreateShipment, verbatim
// (org.adempiere.base.process/src/org/compiere/process/OrderLineCreateShipment.java). §CP-PROC-CORE family B — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.OrderLineCreateShipment', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function OrderLineCreateShipment() { SvrProcess.call(this); this.p_C_OrderLine_ID = 0; this.p_MovementDate = null; }
    OrderLineCreateShipment.prototype = Object.create(SvrProcess.prototype);
    OrderLineCreateShipment.prototype.prepare = function () {                         // :52-73
      var A = X.A, para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;                                         // (Java: no else — a null falls into the next if)
        if (name === 'MovementDate') this.p_MovementDate = para[i].getParameterAsTimestamp();
        else A.RUNTIME.log('§PROC-UNKNOWN-PARA OrderLineCreateShipment ' + name);
      }
      if (this.p_MovementDate == null) this.p_MovementDate = A.Env.getContextAsDate(this.getCtx(), '#Date');   // :65 Env.DATE
      this.p_C_OrderLine_ID = this.getRecord_ID();
    };
    OrderLineCreateShipment.prototype.doIt = function () {                            // :81-123
      var A = X.A, g = G(), C = g.ctor(), T = g.T(), D = T.D, trx = this.get_TrxName(), ctx = this.getCtx();
      var M = function (k) { return A.Msg.getMsg(ctx, k); };
      if (this.p_C_OrderLine_ID === 0) throw new Error(M('No OrderLine'));            // :87
      var line = trx.get('c_orderline', this.p_C_OrderLine_ID);                       // :89
      if (!line) throw new Error(M('Order line not found'));                          // :91
      var order = trx.get('c_order', line.c_order_id);                                // :92
      if ('CO' !== order.docstatus) throw new Error(M('Order not completed'));        // :93
      if (D(line.qtyordered).subtract(D(line.qtydelivered)).compareTo(A.Env.ZERO) <= 0) return M('Ordered quantity already shipped');   // :96
      var dt = trx.q('SELECT C_DocTypeShipment_ID AS d FROM C_DocType WHERE C_DocType_ID=?', [order.c_doctype_id])[0];   // :99-101
      var C_DocTypeShipment_ID = dt ? (dt.d == null ? 0 : Number(dt.d)) : -1;   // DB.getSQLValue: rs.getInt (NULL→0), no row → -1
      var shipment = C.MInOutFromOrder(trx, order, C_DocTypeShipment_ID, this.p_MovementDate.toString());   // :103
      shipment.set('m_warehouse_id', line.m_warehouse_id);                            // :104
      shipment.set('movementdate', line.datepromised);                                // :105
      if (!shipment.save()) throw new Error(M('Cannot save shipment header'));        // :106
      var sline = C.MInOutLine(trx, shipment);                                        // :109
      C.ioSetOrderLine(trx, sline, line, 0, D(line.qtyreserved));                     // :110 setOrderLine(line, 0, QtyReserved)
      C.ioSetQtyEntered(trx, sline, D(line.qtyreserved));                             // :111
      sline.set('c_uom_id', line.c_uom_id);                                           // :112
      C.ioSetQty(trx, sline, D(line.qtyreserved));                                    // :113
      sline.p.m_warehouse_id = line.m_warehouse_id;                                   // :114 setM_Warehouse_ID (field, not a column)
      if (!sline.save()) throw new Error(M('Cannot save Shipment Line'));             // :115
      return trx.get('m_inout', shipment.id()).documentno;                            // :118
    };
    return OrderLineCreateShipment;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

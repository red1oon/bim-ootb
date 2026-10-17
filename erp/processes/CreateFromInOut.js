// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/CreateFromInOut.js - org.compiere.process.CreateFromInOut, verbatim
// (org.adempiere.base.process/src/org/compiere/process/CreateFromInOut.java) + MInOut.createLineFrom / updateFrom (org.adempiere.base/src/org/compiere/model/MInOut.java:3206-3380).
// bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §43 P2 - Witness: W-CREATEFROM-INOUT. The Info Window IS the selection: the rows the user picked are T_Selection / T_Selection_InfoWindow
// rows of this AD_PInstance_ID (written by the generic info-window engine), read here exactly as the Java reads them. NAMED, not faked: the M_RMALine branch of createLineFrom and the
// RMA leg of updateFrom (MRMA.getShipment) are not ported (this corpus has one RMA row); a selection that names an RMA line is refused loudly.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.CreateFromInOut', function (SvrProcess, X) {
    function CreateFromInOut() { SvrProcess.call(this); this.p_M_InOut_ID = 0; this.selectionIDList = []; this.selectionValueMap = {}; this.m_created = 0; }
    CreateFromInOut.prototype = Object.create(SvrProcess.prototype);
    CreateFromInOut.prototype.prepare = function () {                                   // :61-73
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'M_InOut_ID') this.p_M_InOut_ID = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA CreateFromInOut ' + name);
      }
    };
    CreateFromInOut.prototype.doIt = function () {                                      // :75-83
      if (this.p_M_InOut_ID === 0) throw new Error('@NotFound@ @M_InOut_ID@');
      if ((this.getProcessInfo().AD_InfoWindow_ID || 0) > 0) return this.createLines();
      throw new Error('@NotSupported@');
    };
    var DIMS = ['c_project_id', 'c_projectphase_id', 'c_projecttask_id', 'c_activity_id', 'c_campaign_id', 'ad_orgtrx_id', 'user1_id', 'user2_id', 'c_costcenter_id', 'c_department_id'];
    function id0(v) { return v == null || v === '' ? 0 : Number(v); }                   // getXxx_ID(): NULL reads as 0
    function nul(v) { return id0(v) > 0 ? Number(v) : null; }                           // setXxx_ID(0): stored as NULL
    CreateFromInOut.prototype.createLines = function () {                               // :85-257
      var A = X.A, trx = this.get_TrxName(), C = P.PSUP.docgen.ctor(), T = P.PSUP.docgen.T(), self = this;
      var inout = trx.get('m_inout', this.p_M_InOut_ID);
      if (!inout) throw new Error('@NotFound@ @M_InOut_ID@');
      var pin = this.getAD_PInstance_ID();
      trx.q('SELECT t.t_selection_id AS id, CAST(t.viewid AS INTEGER) AS tid FROM t_selection t WHERE t.ad_pinstance_id=?', [pin]).forEach(function (r) {   // :97-122
        if (self.selectionIDList.indexOf(r.id) < 0) self.selectionIDList.push(r.id);
        self.selectionValueMap['T_' + r.id] = r.id;
      });
      trx.q('SELECT t_selection_id AS id, columnname AS c, value_string AS s, value_number AS n, value_date AS d FROM t_selection_infowindow WHERE ad_pinstance_id=? ORDER BY t_selection_id, columnname', [pin]).forEach(function (r) {   // :124-163
        var v = null;
        if (r.s != null) v = r.s; else if (r.n != null) v = /_ID$/i.test(r.c) ? Math.trunc(Number(r.n)) : A.toBD(String(r.n)); else if (r.d != null) v = r.d;
        self.selectionValueMap[r.c + '_' + r.id] = v;
      });
      var map = this.selectionValueMap, m_order = null, m_invoice = null, m_rma = null;
      function get(c, id) { return map[c + '_' + id]; }
      function num(c, id) { var v = get(c, id); return v != null ? Number(v.toString()) : 0; }
      for (var i = 0; i < this.selectionIDList.length; i++) {
        var sel = this.selectionIDList[i];
        var C_Order_ID = num('C_Order_ID', sel); if (C_Order_ID !== 0 && (m_order == null || m_order.c_order_id !== C_Order_ID)) m_order = trx.get('c_order', C_Order_ID);
        var C_Invoice_ID = num('C_Invoice_ID', sel); if (C_Invoice_ID !== 0 && (m_invoice == null || m_invoice.c_invoice_id !== C_Invoice_ID)) m_invoice = trx.get('c_invoice', C_Invoice_ID);
        var M_RMA_ID = num('M_RMA_ID', sel); if (M_RMA_ID !== 0) m_rma = trx.get('m_rma', M_RMA_ID);
        var qv = get('Qty', sel), QtyEntered = qv != null ? A.toBD(qv.toString()) : null;
        var C_UOM_ID = num('C_UOM_ID', sel), M_Locator_ID = num('M_Locator_ID', sel), M_Product_ID = num('M_Product_ID', sel);
        var C_OrderLine_ID = num('C_OrderLine_ID', sel), C_InvoiceLine_ID = num('C_InvoiceLine_ID', sel), M_RMALine_ID = num('M_RMALine_ID', sel);
        var precision = 2;                                                               // :236-242
        if (M_Product_ID !== 0) { var prod = T.product(trx, M_Product_ID); var u = prod ? trx.get('c_uom', prod.c_uom_id) : null; if (u) precision = Number(u.stdprecision); }
        if (QtyEntered == null) throw new Error('Selection row ' + sel + ' has no Qty');
        QtyEntered = QtyEntered.setScale(precision, A.RoundingMode.HALF_DOWN);
        if (m_invoice != null) { var idt = T.dt(trx, m_invoice.c_doctype_id); if (idt && (idt.docbasetype === 'ARC' || idt.docbasetype === 'APC')) QtyEntered = QtyEntered.negate(); }   // isCreditMemo :248-249
        trx.say('§CREATEFROM-INOUT line sel=' + sel + ' orderLine=' + C_OrderLine_ID + ' invoiceLine=' + C_InvoiceLine_ID + ' product=' + M_Product_ID + ' qty=' + QtyEntered.toString() + ' uom=' + C_UOM_ID + ' locator=' + M_Locator_ID);
        this.createLineFrom(trx, C, T, inout, C_OrderLine_ID, C_InvoiceLine_ID, M_RMALine_ID, M_Product_ID, C_UOM_ID, QtyEntered, M_Locator_ID);
        this.m_created++;
      }
      this.updateFrom(trx, inout, m_order, m_invoice, m_rma);                            // :257
      return '@Created@ = ' + this.m_created;                                            // :259-260
    };
    // MInOut.createLineFrom :3206-3290
    CreateFromInOut.prototype.createLineFrom = function (trx, C, T, inout, C_OrderLine_ID, C_InvoiceLine_ID, M_RMALine_ID, M_Product_ID, C_UOM_ID, Qty, M_Locator_ID) {
      var A = X.A, il = C_InvoiceLine_ID !== 0 ? trx.get('c_invoiceline', C_InvoiceLine_ID) : null;
      if (M_RMALine_ID !== 0 && !C_OrderLine_ID && !il) throw new Error('CreateFromInOut: the RMA-line branch of MInOut.createLineFrom is not ported');
      var iol = C.MInOutLine(trx, inout);
      if (M_Product_ID !== 0) iol.set('m_product_id', M_Product_ID);                     // setM_Product_ID(pid, uom) :464-471
      iol.set('c_uom_id', C_UOM_ID || null).set('m_attributesetinstance_id', 0);
      C.ioSetQty(trx, iol, Qty);
      var ol = null;
      if (C_OrderLine_ID !== 0) {
        iol.set('c_orderline_id', C_OrderLine_ID); ol = trx.get('c_orderline', C_OrderLine_ID);
        var qe = A.toBD(String(ol.qtyentered)), qo = A.toBD(String(ol.qtyordered));
        if (qe.compareTo(qo) !== 0) { C.ioSetMovementQty(trx, iol, Qty.multiply(qo).divide(qe, 12, A.RoundingMode.HALF_UP)); iol.set('c_uom_id', ol.c_uom_id); }
        iol.set('m_attributesetinstance_id', ol.m_attributesetinstance_id || 0).set('description', ol.description == null ? null : ol.description);
        DIMS.forEach(function (c) { iol.set(c, nul(ol[c])); });
      } else if (il) {
        if (id0(il.c_orderline_id) > 0) iol.set('c_orderline_id', il.c_orderline_id);
        var ie = A.toBD(String(il.qtyentered)), ii = A.toBD(String(il.qtyinvoiced));
        if (ie.compareTo(ii) !== 0) { C.ioSetMovementQty(trx, iol, Qty.multiply(ii).divide(ie, 12, A.RoundingMode.HALF_UP)); iol.set('c_uom_id', il.c_uom_id); }
        iol.set('description', il.description == null ? null : il.description);
        DIMS.forEach(function (c) { iol.set(c, nul(il[c])); });
      }
      if (M_Product_ID === 0) {                                                          // Charge :3257-3264
        if (ol && id0(ol.c_charge_id) !== 0) iol.set('c_charge_id', ol.c_charge_id);
        else if (il && id0(il.c_charge_id) !== 0) iol.set('c_charge_id', il.c_charge_id);
      }
      iol.set('m_locator_id', M_Locator_ID !== 0 ? M_Locator_ID : null);                 // :3266
      if (!iol.save()) throw new Error('Cannot save Shipment/Receipt Line');             // saveEx
      if (il) { var r = X.save(trx, 'C_InvoiceLine', il, { m_inoutline_id: iol.id() }); if (!r.ok) throw new Error(r.error || 'SaveError'); }   // invoice line link :3268-3273
    };
    // MInOut.updateFrom :3316-3380 (order + invoice legs; the RMA leg is refused above)
    CreateFromInOut.prototype.updateFrom = function (trx, inout, order, invoice, rma) {
      if (rma != null && id0(rma.m_rma_id) !== 0) throw new Error('CreateFromInOut: the RMA leg of MInOut.updateFrom is not ported');
      var ch = {}, cur = trx.get('m_inout', inout.m_inout_id);
      if (order != null && id0(order.c_order_id) !== 0) {
        ch.c_order_id = order.c_order_id; ch.ad_orgtrx_id = nul(order.ad_orgtrx_id); ch.c_project_id = nul(order.c_project_id); ch.c_campaign_id = nul(order.c_campaign_id);
        ch.c_activity_id = nul(order.c_activity_id); ch.salesrep_id = nul(order.salesrep_id); ch.user1_id = nul(order.user1_id); ch.user2_id = nul(order.user2_id);
        ch.c_costcenter_id = nul(order.c_costcenter_id); ch.c_department_id = nul(order.c_department_id);
        if (order.isdropship === 'Y') {
          ch.m_warehouse_id = order.m_warehouse_id; ch.isdropship = order.isdropship; ch.dropship_bpartner_id = nul(order.dropship_bpartner_id);
          ch.dropship_location_id = nul(order.dropship_location_id); ch.dropship_user_id = nul(order.dropship_user_id);
          if (order.deliveryviarule === 'S' && id0(order.m_shipper_id) > 0) { ch.deliveryviarule = order.deliveryviarule; ch.m_shipper_id = order.m_shipper_id; }
        }
      }
      if (invoice != null && id0(invoice.c_invoice_id) !== 0) {
        if (id0(ch.c_order_id != null ? ch.c_order_id : cur.c_order_id) === 0) ch.c_order_id = nul(invoice.c_order_id);
        ch.c_invoice_id = invoice.c_invoice_id; ch.ad_orgtrx_id = nul(invoice.ad_orgtrx_id); ch.c_project_id = nul(invoice.c_project_id); ch.c_campaign_id = nul(invoice.c_campaign_id);
        ch.c_activity_id = nul(invoice.c_activity_id); ch.user1_id = nul(invoice.user1_id); ch.user2_id = nul(invoice.user2_id);
        ch.c_costcenter_id = nul(invoice.c_costcenter_id); ch.c_department_id = nul(invoice.c_department_id);
      }
      var r = X.save(trx, 'M_InOut', cur, ch); if (!r.ok) throw new Error(r.error || 'SaveError');   // saveEx
    };
    return CreateFromInOut;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/CreateFromInvoice.js - org.compiere.process.CreateFromInvoice, verbatim
// (org.adempiere.base.process/src/org/compiere/process/CreateFromInvoice.java) + MInvoice.createLineFrom / updateFrom (org.adempiere.base/src/org/compiere/model/MInvoice.java:3262-3440).
// bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §52 - Witness: W-CREATEFROM-INVOICE-IW. The Info Window (AD_InfoWindow 200024, the C_Invoice.CreateLinesFrom Button) IS the selection: the picked
// rows are T_Selection / T_Selection_InfoWindow rows of this AD_PInstance_ID, written by the generic info-window engine (ad_infowin.js), read here exactly as the Java reads them.
// NAMED, not faked: the M_RMALine branch (setRMALine / getOfRMALine), a line with neither receipt nor order line (setPrice/setTax), a product UOM that needs MUOMConversion - each refuses loudly.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.CreateFromInvoice', function (SvrProcess, X) {
    function CreateFromInvoice() { SvrProcess.call(this); this.p_C_Invoice_ID = 0; this.selectionIDList = []; this.selectionValueMap = {}; this.m_created = 0; }
    CreateFromInvoice.prototype = Object.create(SvrProcess.prototype);
    CreateFromInvoice.prototype.prepare = function () {
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'C_Invoice_ID') this.p_C_Invoice_ID = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA CreateFromInvoice ' + name);
      }
    };
    CreateFromInvoice.prototype.doIt = function () {
      if (this.p_C_Invoice_ID === 0) throw new Error('@NotFound@ @C_Invoice_ID@');
      if ((this.getProcessInfo().AD_InfoWindow_ID || 0) > 0) return this.createLines();
      throw new Error('@NotSupported@');
    };
    // Java's `X_ID > 0` reads `!== 0` here: a record made in this session carries a NEGATIVE tip id until commit (same as CreateFromInOut.js)
    function MO() { return (typeof module !== 'undefined' && module.exports) ? require('../model_order.js') : global.ModelOrder; }
    function id0(v) { return v == null || v === '' ? 0 : Number(v); }
    CreateFromInvoice.prototype.createLines = function () {
      var A = X.A, trx = this.get_TrxName(), C = P.PSUP.docgen.ctor(), T = P.PSUP.docgen.T(), self = this, ML = X.ML;
      if (!trx.get('c_invoice', this.p_C_Invoice_ID)) throw new Error('@NotFound@ @C_Invoice_ID@');
      var pin = this.getAD_PInstance_ID();
      trx.q('SELECT t.t_selection_id AS id, CAST(t.viewid AS INTEGER) AS tid FROM t_selection t WHERE t.ad_pinstance_id=?', [pin]).forEach(function (r) {
        if (self.selectionIDList.indexOf(r.id) < 0) self.selectionIDList.push(r.id);
        var kc = trx.q("SELECT c.columnname AS c FROM ad_column c WHERE c.ad_table_id=? AND c.iskey='Y' ORDER BY c.ad_column_id", [r.tid])[0];   // MTable.get(AD_Table_ID).getKeyColumns()[0]
        self.selectionValueMap[(kc ? kc.c : 'T') + '_' + r.id] = r.id;
      });
      trx.q('SELECT t_selection_id AS id, columnname AS c, value_string AS s, value_number AS n, value_date AS d FROM t_selection_infowindow WHERE ad_pinstance_id=? ORDER BY t_selection_id, columnname', [pin]).forEach(function (r) {
        var v = null;
        if (r.s != null) v = r.s; else if (r.n != null) v = /_ID$/i.test(r.c) ? Math.trunc(Number(r.n)) : A.toBD(String(r.n)); else if (r.d != null) v = r.d;
        self.selectionValueMap[r.c + '_' + r.id] = v;
      });
      var map = this.selectionValueMap, m_order = null, m_inout = null, m_rma = null;
      function get(c, id) { return map[c + '_' + id]; }
      function num(c, id) { var v = get(c, id); return v != null ? Number(v.toString()) : 0; }
      function header(fn) { var h = ML.po(trx, 'c_invoice', self.p_C_Invoice_ID); fn(h); if (!h.save()) throw new Error('Cannot save Invoice'); }   // invoice.setX(); invoice.saveEx()
      for (var i = 0; i < this.selectionIDList.length; i++) {
        var sel = this.selectionIDList[i];
        var C_Order_ID = num('C_Order_ID', sel);
        if (C_Order_ID !== 0 && (m_order == null || Number(m_order.c_order_id) !== C_Order_ID)) { m_order = trx.get('c_order', C_Order_ID); header(function (h) { C.invSetOrder(trx, h, m_order); }); }
        var M_InOut_ID = num('M_InOut_ID', sel);
        if (M_InOut_ID !== 0 && (m_inout == null || Number(m_inout.m_inout_id) !== M_InOut_ID)) { m_inout = trx.get('m_inout', M_InOut_ID); header(function (h) { C.invSetShipment(trx, h, m_inout); }); }
        var M_RMA_ID = num('M_RMA_ID', sel);
        if (M_RMA_ID !== 0 && (m_rma == null || Number(m_rma.m_rma_id) !== M_RMA_ID)) { m_rma = trx.get('m_rma', M_RMA_ID); header(function (h) { h.set('m_rma_id', M_RMA_ID); }); }
        var qv = get('Qty', sel), QtyEntered = qv != null ? A.toBD(qv.toString()) : null;
        var C_UOM_ID = num('C_UOM_ID', sel), M_Product_ID = num('M_Product_ID', sel), C_OrderLine_ID = num('C_OrderLine_ID', sel), M_InOutLine_ID = num('M_InOutLine_ID', sel), M_RMALine_ID = num('M_RMALine_ID', sel);
        var precision = 2;
        if (M_Product_ID !== 0) { var prod = T.product(trx, M_Product_ID), u = prod ? trx.get('c_uom', prod.c_uom_id) : null; if (u) precision = Number(u.stdprecision); }   // MProduct.getUOMPrecision
        if (QtyEntered == null) throw new Error('Selection row ' + sel + ' has no Qty');
        QtyEntered = QtyEntered.setScale(precision, A.RoundingMode.HALF_DOWN);
        trx.say('§CREATEFROM-INVOICE line sel=' + sel + ' orderLine=' + C_OrderLine_ID + ' inoutLine=' + M_InOutLine_ID + ' product=' + M_Product_ID + ' qty=' + QtyEntered.toString() + ' uom=' + C_UOM_ID);
        this.createLineFrom(trx, C, T, C_OrderLine_ID, M_InOutLine_ID, M_RMALine_ID, M_Product_ID, C_UOM_ID, QtyEntered);
        this.m_created++;
      }
      this.updateFrom(trx, m_order);
      return '@Created@ = ' + this.m_created;
    };
    // MInvoice.createLineFrom :3262-3386
    CreateFromInvoice.prototype.createLineFrom = function (trx, C, T, C_OrderLine_ID, M_InOutLine_ID, M_RMALine_ID, M_Product_ID, C_UOM_ID, Qty) {
      var A = X.A, invoice = trx.get('c_invoice', this.p_C_Invoice_ID), il = C.MInvoiceLine(trx, invoice);
      il.set('m_product_id', M_Product_ID || null).set('c_uom_id', C_UOM_ID || null).set('m_attributesetinstance_id', 0);   // setM_Product_ID(pid, uom) MInvoiceLine.java:676-681
      C.ilSetQty(trx, il, Qty);
      var prod = M_Product_ID > 0 ? T.product(trx, M_Product_ID) : null;
      if (M_Product_ID !== 0 && prod && Number(prod.c_uom_id) !== C_UOM_ID) throw new Error('CreateFromInvoice: MUOMConversion.convertProductFrom (product UOM != line UOM) is not ported');
      C.ilSetQtyInvoiced(trx, il, Qty);
      var orderLine = C_OrderLine_ID !== 0 ? trx.get('c_orderline', C_OrderLine_ID) : null, inoutLine = null;
      if (M_RMALine_ID !== 0) throw new Error('CreateFromInvoice: the M_RMALine branch of MInvoice.createLineFrom is not ported');
      if (M_InOutLine_ID !== 0) {
        inoutLine = trx.get('m_inoutline', M_InOutLine_ID);
        if (orderLine == null && id0(inoutLine.c_orderline_id) !== 0) { C_OrderLine_ID = Number(inoutLine.c_orderline_id); orderLine = trx.get('c_orderline', C_OrderLine_ID); }
      } else if (C_OrderLine_ID !== 0) {                                                     // :3293-3317 receipt line of this order line whose open qty == Qty
        var lines = trx.q("SELECT l.* FROM m_inoutline l WHERE l.c_orderline_id=? AND EXISTS (SELECT 1 FROM m_inout io WHERE io.m_inout_id=l.m_inout_id AND io.docstatus IN ('CO','CL')) ORDER BY l.m_inoutline_id", [C_OrderLine_ID]);
        for (var j = 0; j < lines.length; j++) {
          var matched = A.toBD('0');
          trx.find('m_matchinv', { m_inoutline_id: lines[j].m_inoutline_id }).forEach(function (m) { matched = matched.add(A.toBD(String(m.qty))); });
          if (A.toBD(String(lines[j].qtyentered)).subtract(matched).compareTo(Qty) === 0) { inoutLine = lines[j]; M_InOutLine_ID = Number(inoutLine.m_inoutline_id); break; }
        }
      }
      if (inoutLine != null) {
        C.ilSetShipLine(trx, il, inoutLine);                                               // overwrites
        if (Number(il.get('c_uom_id')) !== Number(inoutLine.c_uom_id)) throw new Error('CreateFromInvoice: price UOM conversion after setShipLine (MUOMConversion) is not ported');
      } else if (orderLine != null) C.ilSetOrderLine(trx, il, orderLine);                 // overwrites
      else throw new Error('CreateFromInvoice: a line with neither receipt nor order line (MInvoiceLine.setPrice/setTax) is not ported');
      if (!il.save()) throw new Error('Cannot save Invoice Line');                         // saveEx
    };
    // MInvoice.updateFrom(MOrder) :3393-3436
    CreateFromInvoice.prototype.updateFrom = function (trx, order) {
      if (order == null) return;
      var cur = trx.get('c_invoice', this.p_C_Invoice_ID);
      var r = X.save(trx, 'C_Invoice', cur, { paymentrule: order.paymentrule, c_paymentterm_id: order.c_paymentterm_id, salesrep_id: order.salesrep_id || null });
      if (!r.ok) throw new Error(r.error || 'SaveError');
      if (!trx.find('c_invoicepayschedule', { c_invoice_id: cur.c_invoice_id }).length)          // :3400-3433 copy the order's schedule when the invoice has none (proportional DueAmt)
        MO().copyOrderPaySchedule(trx, order.c_order_id, cur.c_invoice_id, order);
    };
    return CreateFromInvoice;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

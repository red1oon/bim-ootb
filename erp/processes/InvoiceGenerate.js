// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/InvoiceGenerate.js - org.compiere.process.InvoiceGenerate, verbatim
// (org.adempiere.base.process/src/org/compiere/process/InvoiceGenerate.java). bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §33 - Witness: W-CP-PROC-ORACLE (proc_InvoiceGenerate.json).
// NAMED, not faked: (1) the candidate query is C_Invoice_Candidate_v's ORDER branch inlined (the view is not in the bundle); its RMA branch and the invoice-schedule
// frequency terms ('S' with a schedule) are not ported - an order on 'S' with a schedule is skipped with a §PROC-UNPORTED-DEP line. (2) T_Selection (info window) path:
// not ported. (3) per-invoice savepoint (:493-501) needs Trx.setSavepoint; without it the MinimumAmt rollback throws 'No savepoint' exactly like Java.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.InvoiceGenerate', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function InvoiceGenerate() {
      SvrProcess.call(this);
      this.p_Selection = false; this.p_DateInvoiced = null; this.p_AD_Org_ID = 0; this.p_C_BPartner_ID = 0; this.p_C_Order_ID = 0; this.p_M_InOut_ID = 0;
      this.p_ConsolidateDocument = true; this.p_docAction = 'CO';
      this.m_invoice = null; this.m_ship = null; this.m_created = 0; this.m_line = 0; this.m_bp = null; this.p_MinimumAmt = null; this.p_MinimumAmtInvSched = null;
      this.m_savepoint = null; this.m_bpartnerID = 0;
    }
    InvoiceGenerate.prototype = Object.create(SvrProcess.prototype);
    InvoiceGenerate.prototype.prepare = function () {                                   // :88-120
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'Selection') this.p_Selection = 'Y' === para[i].getParameter();
        else if (name === 'DateInvoiced') this.p_DateInvoiced = para[i].getParameter();
        else if (name === 'AD_Org_ID') this.p_AD_Org_ID = para[i].getParameterAsInt();
        else if (name === 'C_BPartner_ID') this.p_C_BPartner_ID = para[i].getParameterAsInt();
        else if (name === 'C_Order_ID') this.p_C_Order_ID = para[i].getParameterAsInt();
        else if (name === 'M_InOut_ID') this.p_M_InOut_ID = para[i].getParameterAsInt();
        else if (name === 'ConsolidateDocument') this.p_ConsolidateDocument = 'Y' === para[i].getParameter();
        else if (name === 'DocAction') this.p_docAction = para[i].getParameter();
        else if (name === 'MinimumAmt') this.p_MinimumAmt = para[i].getParameterAsBigDecimal();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA InvoiceGenerate ' + name);
      }
      if (this.p_DateInvoiced == null) this.p_DateInvoiced = X.A.Env.getContextAsDate ? X.A.Env.getContextAsDate(this.getCtx(), 'Date') : null;   // :111-112 login date
      if (this.p_DateInvoiced == null) this.p_DateInvoiced = new Date().toISOString().slice(0, 10);                                                // :113-114
      if ('CO' !== this.p_docAction) this.p_docAction = 'PR';                                                                                      // :117-118 ACTION_Prepare
    };
    InvoiceGenerate.prototype.doIt = function () {                                      // :127-205
      var trx = this.get_TrxName(), p = [], sql;
      if (this.p_Selection) throw new Error('InvoiceGenerate: T_Selection (info window) path is not ported');
      // C_Invoice_Candidate_v, order branch, inlined (see header) + doIt's own WHERE/ORDER BY
      sql = "SELECT o.* FROM c_order o JOIN c_bpartner bp ON bp.c_bpartner_id=o.c_bpartner_id WHERE o.docstatus IN ('CO','CL') AND o.issotrx='Y' AND o.isactive='Y'" +
        " AND o.c_doctype_id IN (SELECT c_doctype_id FROM c_doctype WHERE docbasetype='SOO' AND docsubtypeso NOT IN ('ON','OB','WR'))" +
        " AND EXISTS (SELECT 1 FROM c_orderline l WHERE l.c_order_id=o.c_order_id AND l.qtyordered<>l.qtyinvoiced AND (o.invoicerule='I'" +
        " OR (o.invoicerule='O' AND NOT EXISTS (SELECT 1 FROM c_orderline z WHERE z.c_order_id=o.c_order_id AND z.qtyordered<>z.qtydelivered))" +
        " OR (o.invoicerule='D' AND l.qtyinvoiced<>l.qtydelivered)" +
        " OR (o.invoicerule='S' AND bp.c_invoiceschedule_id IS NULL)" +
        " OR (o.invoicerule='S' AND bp.c_invoiceschedule_id IS NOT NULL)))";
      if (this.p_AD_Org_ID !== 0) { sql += ' AND o.ad_org_id=?'; p.push(this.p_AD_Org_ID); }
      if (this.p_C_BPartner_ID !== 0) { sql += ' AND o.c_bpartner_id=?'; p.push(this.p_C_BPartner_ID); }
      if (this.p_C_Order_ID !== 0) { sql += ' AND o.c_order_id=?'; p.push(this.p_C_Order_ID); }
      if (this.p_M_InOut_ID !== 0) { sql += ' AND EXISTS (SELECT 1 FROM c_orderline ol JOIN m_inoutline iol ON iol.c_orderline_id=ol.c_orderline_id WHERE ol.c_order_id=o.c_order_id AND iol.m_inout_id=?)'; p.push(this.p_M_InOut_ID); }
      sql += ' ORDER BY o.ad_org_id, o.m_warehouse_id, o.priorityrule, o.c_bpartner_id, o.bill_location_id, o.bill_user_id, o.c_order_id';
      return this.generate(trx.q(sql, p));
    };
    InvoiceGenerate.prototype.generate = function (orders) {                            // :214-364
      var A = X.A, Env = A.Env, trx = this.get_TrxName(), self = this;
      var T = G().T();
      for (var n = 0; n < orders.length; n++) {
        var order = orders[n]; this.p_MinimumAmtInvSched = null;
        this.statusUpdate('Processing ' + order.documentno);
        if (!this.p_ConsolidateDocument || (this.m_bpartnerID !== 0 && this.m_bpartnerID !== order.c_bpartner_id) ||
            (this.m_invoice != null && (Number(this.m_invoice.get('c_bpartner_location_id')) !== Number(order.bill_location_id) ||
              Number(this.m_invoice.get('ad_user_id') || 0) !== Number(order.bill_user_id || 0) || Number(this.m_invoice.get('ad_org_id')) !== Number(order.ad_org_id)))) this.completeInvoice();   // :245-252
        var completeOrder = 'O' === order.invoicerule;                                  // :253 INVOICERULE_AfterOrderDelivered
        var doInvoice = false;
        if ('S' === order.invoicerule) {                                                // :256 CustomerScheduleAfterDelivery
          this.m_bp = trx.get('c_bpartner', order.bill_bpartner_id);
          if (!this.m_bp.c_invoiceschedule_id) { trx.say('§PROC-WARN BPartner has no Schedule - set to After Delivery'); var sr = X.save(trx, 'C_Order', trx.get('c_order', order.c_order_id), { invoicerule: 'D' }); if (!sr.ok) throw new Error(sr.error || 'SaveError'); order = trx.get('c_order', order.c_order_id); }
          else { trx.say('§PROC-UNPORTED-DEP MInvoiceSchedule.canInvoice (InvoiceGenerate.java:268) - schedule orders skipped'); continue; }
        }
        if (doInvoice || 'D' === order.invoicerule) {                                   // :280 AfterDelivery
          this.shipLoop(order);
        } else {
          var oLines = trx.find('c_orderline', { c_order_id: order.c_order_id }, ['line', 'c_orderline_id']);   // :299 getLines(true, null)
          for (var i = 0; i < oLines.length; i++) {
            var oLine = oLines[i];
            var toInvoice = A.toBD(String(oLine.qtyordered)).subtract(A.toBD(String(oLine.qtyinvoiced)));
            if (toInvoice.compareTo(Env.ZERO) === 0 && oLine.m_product_id) continue;                                       // :304-305 (Java != 0 on the id)
            var fullyDelivered = A.toBD(String(oLine.qtyordered)).compareTo(A.toBD(String(oLine.qtydelivered))) === 0;      // :310
            if (completeOrder && !fullyDelivered) { this.addBufferLog(0, null, null, 'Failed CompleteOrder - ' + oLine.c_orderline_id, 260, oLine.c_orderline_id); completeOrder = false; break; }
            else if ('I' === order.invoicerule) {                                       // :321 Immediate
              var qtyEntered = toInvoice;
              if (A.toBD(String(oLine.qtyentered)).compareTo(A.toBD(String(oLine.qtyordered))) !== 0)                      // :326
                qtyEntered = toInvoice.multiply(A.toBD(String(oLine.qtyentered))).divide(A.toBD(String(oLine.qtyordered)), 12, A.RoundingMode.HALF_UP);
              this.createLineFromOrderLine(order, oLine, toInvoice, qtyEntered);
            } else if (!completeOrder) this.addBufferLog(0, null, null, 'Failed: ' + order.invoicerule + ' - ToInvoice=' + toInvoice + ' - ' + oLine.c_orderline_id, 260, oLine.c_orderline_id);
          }
          if ('I' === order.invoicerule) this.m_line += 1000;                           // :337-338
        }
        if (completeOrder && 'O' === order.invoicerule) this.shipLoop(order);           // :342-363
        this.m_bpartnerID = order.c_bpartner_id;                                        // :365
      }
      this.completeInvoice();                                                           // :383
      return '@Created@ = ' + this.m_created;                                           // :384-385
    };
    // :283-296 / :344-361 - the shipments of the order, their lines not yet invoiced
    InvoiceGenerate.prototype.shipLoop = function (order) {
      var trx = this.get_TrxName(), seen = {}, ships = [];
      trx.find('c_orderline', { c_order_id: order.c_order_id }).forEach(function (ol) {
        trx.find('m_inoutline', { c_orderline_id: ol.c_orderline_id }).forEach(function (l) { if (!seen[l.m_inout_id]) { seen[l.m_inout_id] = 1; ships.push(trx.get('m_inout', l.m_inout_id)); } });
      });
      ships.sort(function (a, b) { return Number(b.m_inout_id) - Number(a.m_inout_id); });   // MOrder.getShipments ORDER BY M_InOut_ID DESC
      var olIds = {}; trx.find('c_orderline', { c_order_id: order.c_order_id }).forEach(function (ol) { olIds[ol.c_orderline_id] = 1; });
      for (var i = 0; i < ships.length; i++) {
        var ship = ships[i];
        if (!/^(CO|CL|RE)$/.test(ship.docstatus || '') || ship.docstatus === 'RE') continue;
        var shipLines = trx.find('m_inoutline', { m_inout_id: ship.m_inout_id }, ['line', 'm_inoutline_id']);
        for (var j = 0; j < shipLines.length; j++) {
          var sl = shipLines[j];
          if (!olIds[sl.c_orderline_id]) continue;
          if (sl.isinvoiced !== 'Y') this.createLineFromShipLine(order, ship, sl);
        }
        this.m_line += 1000;
      }
    };
    InvoiceGenerate.prototype.ensureInvoice = function (order, what) {
      var trx = this.get_TrxName(), C = G().ctor();
      if (this.m_invoice == null) {
        if (typeof trx.setSavepoint === 'function') {                                   // :437-441
          if (this.m_savepoint != null && typeof trx.releaseSavepoint === 'function') trx.releaseSavepoint(this.m_savepoint);
          this.m_savepoint = trx.setSavepoint(null);
        }
        this.m_invoice = C.MInvoiceFromOrder(trx, order, 0, this.p_DateInvoiced);       // :442 new MInvoice(order, 0, p_DateInvoiced)
        if (!this.m_invoice.save()) throw new Error('Could not create Invoice (' + what + ')');
      }
    };
    InvoiceGenerate.prototype.createLineFromOrderLine = function (order, oLine, qtyInvoiced, qtyEntered) {   // :424-453
      var trx = this.get_TrxName(), C = G().ctor(); this.ensureInvoice(order, 'o');
      var line = C.MInvoiceLine(trx, this.m_invoice);
      C.ilSetOrderLine(trx, line, oLine); C.ilSetQtyInvoiced(trx, line, qtyInvoiced); C.ilSetQtyEntered(trx, line, qtyEntered);
      line.set('line', this.m_line + Number(oLine.line));
      if (!line.save()) throw new Error('Could not create Invoice Line (o)');
    };
    InvoiceGenerate.prototype.createLineFromShipLine = function (order, ship, sLine) {                       // :461-541
      var A = X.A, trx = this.get_TrxName(), C = G().ctor(), T = G().T(); this.ensureInvoice(order, 's');
      if (this.m_ship == null || this.m_ship.m_inout_id !== ship.m_inout_id) {
        var dt = trx.get('c_doctype', ship.c_doctype_id);
        if (this.m_bp == null || this.m_bp.c_bpartner_id !== ship.c_bpartner_id) this.m_bp = trx.get('c_bpartner', ship.c_bpartner_id);
        var d = String(ship.movementdate).slice(0, 10).split('-'), reference = (dt.printname || dt.name) + ': ' + ship.documentno + ' - ' + d[1] + '/' + d[2] + '/' + d[0];   // en_US date; oracle decides
        this.m_ship = ship;
        var cl = C.MInvoiceLine(trx, this.m_invoice); cl.set('isdescription', 'Y').set('description', reference).set('line', this.m_line + Number(sLine.line) - 2);
        if (!cl.save()) throw new Error('Could not create Invoice Comment Line (sh)');
        if (Number(order.bill_location_id) !== Number(ship.c_bpartner_location_id)) trx.say('§PROC-UNPORTED-DEP MLocation.toString for the ship-to address comment line (InvoiceGenerate.java:513-523)');
      }
      var line = C.MInvoiceLine(trx, this.m_invoice); C.ilSetShipLine(trx, line, sLine);
      if (C.sameOrderLineUOM(trx, sLine)) {
        var docType = trx.get('c_doctype', ship.c_doctype_id), ir = order.invoicerule;
        if (docType.isshipconfirm === 'Y' && (ir === 'D' || ir === 'O' || ir === 'S') && sLine.targetqty != null && A.toBD(String(sLine.targetqty)).signum() !== 0) {
          var te = A.toBD(String(sLine.targetqty)), qe = A.toBD(String(sLine.qtyentered)), mq = A.toBD(String(sLine.movementqty));
          C.ilSetQtyEntered(trx, line, qe.compareTo(te) === 0 ? mq : mq.multiply(qe).divide(te, 12, A.RoundingMode.HALF_UP));
        } else C.ilSetQtyEntered(trx, line, A.toBD(String(sLine.qtyentered)));
      } else C.ilSetQtyEntered(trx, line, A.toBD(String(sLine.movementqty)));
      C.ilSetQtyInvoiced(trx, line, A.toBD(String(sLine.movementqty)));
      line.set('line', this.m_line + Number(sLine.line));
      if (!line.save()) throw new Error('Could not create Invoice Line (s)');
      var r = X.save(trx, 'M_InOutLine', trx.get('m_inoutline', sLine.m_inoutline_id), { isinvoiced: true });   // :543-546 sLine.setIsInvoiced(true); save
      if (!r.ok) throw new Error('Could not update Shipment Line');
    };
    InvoiceGenerate.prototype.completeInvoice = function () {                           // :553-600
      if (this.m_invoice == null) return;
      var A = X.A, trx = this.get_TrxName(), g = G(), invoice = this.m_invoice;
      var order = trx.get('c_order', invoice.get('c_order_id'));
      if (order) {
        invoice.set('paymentrule', order.paymentrule); invoice.set('c_paymentterm_id', order.c_paymentterm_id); g.saveEx(invoice); invoice.load();   // :522-525
        trx.say('§PROC-UNPORTED-DEP MOrderPaySchedule copy to the invoice (InvoiceGenerate.java:526-556) - same block as InOutCreateInvoice, ported there');
      }
      var gt = A.toBD(String(invoice.get('grandtotal') || 0));
      if ((this.p_MinimumAmt != null && this.p_MinimumAmt.signum() !== 0 && gt.compareTo(this.p_MinimumAmt) < 0) ||
          (this.p_MinimumAmtInvSched != null && gt.compareTo(this.p_MinimumAmtInvSched) < 0)) {
        this.addBufferLog(0, null, null, '@NotInvoicedAmt@ ' + gt, 318, 0);
        if (this.m_savepoint != null && typeof trx.rollbackTo === 'function') trx.rollbackTo(this.m_savepoint); else throw new Error('No savepoint');
      } else {
        var res = g.ML().processIt(trx, 'c_invoice', invoice.id(), this.p_docAction);                // :581 m_invoice.processIt(p_docAction)
        if (!res || !res.ok) throw new Error('Invoice Process Failed: ' + invoice.id() + ' - ' + (res && res.msg));
        var inv = trx.get('c_invoice', invoice.id());
        this.addBufferLog(inv.c_invoice_id, inv.dateinvoiced, null, '@InvoiceProcessed@ ' + inv.documentno, 318, inv.c_invoice_id);
        this.m_created++;
      }
      this.m_invoice = null; this.m_ship = null; this.m_line = 0;
    };
    return InvoiceGenerate;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

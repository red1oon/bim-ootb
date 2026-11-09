// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ProjectPhaseGenOrder.js - org.compiere.process.ProjectPhaseGenOrder (AD_Process 216 "Generate Order" on C_ProjectPhase), verbatim
// (org.adempiere.base.process/src/org/compiere/process/ProjectPhaseGenOrder.java:46-170). bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §BIMDOC-ERP-SIDE - Witness: W-BIMDOC (beat 9).
// MOrder(MProject, true, "WI") is ModelOrder.MOrder_fromProject; the line price/tax run through the registered C_OrderLine model (price list, setTax) exactly as MOrderLine.save does.
// Unlike ProjectGenOrder.doIt there is NO category check here (a Service project bills per phase, §BIMDOC-2). Like legacy, the header is saved BEFORE the lines: a phase with nothing
// to order yields an order with 0 lines (message "(0)"), not a refusal.
(function (global) {
  'use strict';
  var node = (typeof module !== 'undefined' && module.exports);
  var P = node ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.ProjectPhaseGenOrder', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function MO() { return G().MO(); }
    function ProjectPhaseGenOrder() { SvrProcess.call(this); this.m_C_ProjectPhase_ID = 0; }
    ProjectPhaseGenOrder.prototype = Object.create(SvrProcess.prototype);
    ProjectPhaseGenOrder.prototype.prepare = function () {                            // :46-58
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        if (para[i].getParameter() == null) continue;
        X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ProjectPhaseGenOrder ' + para[i].getParameterName());
      }
    };
    function nz(v) { return v != null && v !== '' && Number(v) !== 0; }
    // ProjectGenOrder.getProject :120-132
    function getProject(trx, id) {
      var p = nz(id) ? trx.get('c_project', id) : null;
      if (!p) throw new Error('Project not found C_Project_ID=' + id);
      if (!nz(p.m_pricelist_version_id)) throw new Error('Project has no Price List');
      if (!nz(p.m_warehouse_id)) throw new Error('Project has no Warehouse');
      if (!nz(p.c_bpartner_id) || !nz(p.c_bpartner_location_id)) throw new Error('Project has no Business Partner/Location');
      return p;
    }
    ProjectPhaseGenOrder.prototype.doIt = function () {                                // :66-150
      var A = X.A, trx = this.get_TrxName(), D = G().T().D;
      this.m_C_ProjectPhase_ID = this.getRecord_ID();
      if (!nz(this.m_C_ProjectPhase_ID)) throw new Error('C_ProjectPhase_ID == 0');                                            // :70-71
      var phase = trx.get('c_projectphase', this.m_C_ProjectPhase_ID);
      if (!phase) throw new Error('Project phase not found C_ProjectPhase_ID=' + this.m_C_ProjectPhase_ID);
      var project = getProject(trx, phase.c_project_id);                                                                        // :73
      var order = MO().MOrder_fromProject(trx, project, true, 'WI');                                                            // :74
      order.set('description', (order.get('description') == null ? 'null' : order.get('description')) + ' - ' + phase.name);   // :75
      MO().MOrder_beforeSaveNew(trx, order, this.getCtx());
      if (!order.save()) throw new Error('Could not create Order');                                                             // :76-77
      var ctx = this.getCtx(), cur = nz(order.get('c_currency_id')) ? trx.get('c_currency', order.get('c_currency_id')) : null, prec = cur && cur.stdprecision != null ? Number(cur.stdprecision) : 2;
      var logged = [];
      function addLine(line, descr, productId, qty, fixedPrice, withDiscount) {
        var ol = MO().MOrderLine_new(trx, order);
        ol.set('line', line).set('description', descr);
        if (nz(productId)) { var pr = trx.get('m_product', productId); ol.set('m_product_id', productId); if (pr && nz(pr.c_uom_id)) ol.set('c_uom_id', pr.c_uom_id); }   // setM_Product_ID(id, true) :101
        ol.set('m_attributesetinstance_id', 0);
        var q = A.toBD(String(qty == null ? 0 : qty));
        ol.set('qtyentered', q).set('qtyordered', q);                                                                           // setQty
        MO().MOrderLine_setPrice(trx, ol);                                                                                      // setPrice()
        if (fixedPrice != null && D(fixedPrice).signum() !== 0) ol.set('priceentered', A.toBD(String(fixedPrice))).set('priceactual', A.toBD(String(fixedPrice)));   // setPrice(BigDecimal)
        if (withDiscount) { var list = D(ol.get('pricelist')); if (list.signum() !== 0) ol.set('discount', list.subtract(D(ol.get('priceactual'))).multiply(D('100')).divide(list, prec, A.RoundingMode.HALF_UP)); }   // setDiscount() :681-691
        var ok = ol.save();                                                                                                     // setTax() runs in the C_OrderLine beforeSave (setTaxIfMissing)
        if (ok) { var r = trx.get('c_orderline', ol.id()); logged.push(r); }
        return ok;
      }
      var count = 0, msg;
      if (nz(phase.m_product_id)) {                                                                                             // :80-99 an order on Phase level
        var d1 = phase.name + (phase.description ? ' - ' + phase.description : '');
        addLine(phase.seqno, d1, phase.m_product_id, phase.qty, phase.priceactual, false);
        count = 1;
        msg = '@C_Order_ID@ ' + trx.get('c_order', order.id()).documentno + ' (1)';
      } else {
        var lines = trx.find('c_projectline', { c_project_id: phase.c_project_id, c_projectphase_id: phase.c_projectphase_id }, ['line', 'c_projectline_id']);   // MProjectPhase.getLines :263-270
        lines.forEach(function (l) {                                                                                            // :103-121
          if (addLine(l.line, l.description, l.m_product_id, D(l.plannedqty).subtract(D(l.invoicedqty)), l.plannedprice, true)) count++;
        });
        var tasks = trx.find('c_projecttask', { c_projectphase_id: phase.c_projectphase_id }, ['seqno']);                      // MProjectPhase.getTasks :125 ORDER BY SeqNo
        tasks.forEach(function (t) {                                                                                            // :126-143
          var d2 = t.name + (t.description ? ' - ' + t.description : '');
          if (addLine(t.seqno, d2, t.m_product_id, t.qty, null, false)) count++;
        });
        msg = '@C_Order_ID@ ' + trx.get('c_order', order.id()).documentno + ' (' + count + ')';
      }
      var oh = trx.get('c_order', order.id());
      trx.say('§PROJECT-PHASE-GENORDER phase=' + phase.c_projectphase_id + ' project=' + phase.c_project_id + ' order=' + order.id() + ' documentno=' + oh.documentno + ' lines=' + logged.length +
        ' totallines=' + oh.totallines + ' grandtotal=' + oh.grandtotal);
      logged.forEach(function (r) {
        trx.say('§PROJECT-PHASE-GENORDER-LINE order=' + order.id() + ' line=' + r.line + ' product=' + r.m_product_id + ' qty=' + r.qtyordered + ' price=' + r.priceactual + ' amount=' + r.linenetamt + ' desc=' + JSON.stringify(r.description));
      });
      return msg;                                                                                                               // :145-149
    };
    return ProjectPhaseGenOrder;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

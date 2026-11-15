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
    // ProjectGenOrder.getProject :120-132 (static protected, called at :73): the ONE body is in processes/ProjectGenOrder.js
    function getProject(trx, id) { return P.PSUP.projectGenOrder.getProject(trx, id); }
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
      var logged = [];
      function addLine(line, descr, productId, qty, fixedPrice, withDiscount) {                                                  // the order line :90-99 / :103-121 / :126-143: ONE body, ModelOrder.MOrderLine_fromProject
        var r = MO().MOrderLine_fromProject(trx, order, { line: line, description: descr, productId: productId, qty: qty, fixedPrice: fixedPrice, withDiscount: withDiscount });
        if (r.ok) logged.push(trx.get('c_orderline', r.po.id()));
        return r.ok;
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

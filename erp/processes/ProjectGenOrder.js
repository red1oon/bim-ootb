// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ProjectGenOrder.js - org.compiere.process.ProjectGenOrder (AD_Process 164 "Generate Order" / Value C_Project_Generate on the Project window), verbatim
// (org.adempiere.base.process/src/org/compiere/process/ProjectGenOrder.java:40-132). bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §PROJ-PROCS - Witness: W-PROJ-PROCS (case G).
// It REPLACES the old REGISTRY handler registerProjectGenOrder in ad_process.js (a thin buildDoc op-group: no price-list pricing, no tax, no document number, a rejection instead of Java's exception).
// MOrder(MProject,true,"WI") is ModelOrder.MOrder_fromProject; MProject.getLines is ModelProject.getLines; the order line (the Java builds the same line in ProjectPhaseGenOrder) is ModelOrder.MOrderLine_fromProject.
// getProject (:120-131) is `static protected` and ProjectPhaseGenOrder calls it: it is exposed on AdProcess.PSUP.projectGenOrder, resolved at call time.
(function (global) {
  'use strict';
  var node = (typeof module !== 'undefined' && module.exports);
  var P = node ? require('../ad_process.js') : global.AdProcess;
  function nz(v) { return v != null && v !== '' && Number(v) !== 0; }
  // ProjectGenOrder.getProject :120-133 - the project, or the first of the four IllegalArgumentExceptions
  function getProject(trx, id) {
    var p = nz(id) ? trx.get('c_project', id) : null;
    if (!p) throw new Error('Project not found C_Project_ID=' + id);                                                              // :123-124
    if (!nz(p.m_pricelist_version_id)) throw new Error('Project has no Price List');                                               // :125-126
    if (!nz(p.m_warehouse_id)) throw new Error('Project has no Warehouse');                                                        // :127-128
    if (!nz(p.c_bpartner_id) || !nz(p.c_bpartner_location_id)) throw new Error('Project has no Business Partner/Location');       // :129-130
    return p;
  }
  (P.PSUP = P.PSUP || {}).projectGenOrder = { getProject: getProject };
  P.defineProcess('org.compiere.process.ProjectGenOrder', function (SvrProcess, X) {
    function MO() { return P.PSUP.docgen.MO(); }
    function MP() { return node ? require('../model_project') : global.ModelProject; }
    function ProjectGenOrder() { SvrProcess.call(this); this.m_C_Project_ID = 0; }
    ProjectGenOrder.prototype = Object.create(SvrProcess.prototype);
    ProjectGenOrder.prototype.prepare = function () {                                   // :44-58
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        if (para[i].getParameter() == null) continue;
        X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ProjectGenOrder ' + para[i].getParameterName());                                       // MProcessPara.validateUnknownParameter
      }
      this.m_C_Project_ID = this.getRecord_ID();
    };
    ProjectGenOrder.prototype.doIt = function () {                                      // :62-110
      var trx = this.get_TrxName();
      trx.say('§PROC-INFO ProjectGenOrder C_Project_ID=' + this.m_C_Project_ID);
      if (!nz(this.m_C_Project_ID)) throw new Error('C_Project_ID == 0');                                                          // :65-66
      var fromProject = getProject(trx, this.m_C_Project_ID);                                                                      // :68
      var order = MO().MOrder_fromProject(trx, fromProject, true, 'WI');                                                           // :72 new MOrder(fromProject, true, DocSubTypeSO_OnCredit)
      MO().MOrder_beforeSaveNew(trx, order, this.getCtx());
      if (!order.save()) throw new Error('Could not create Order');                                                                // :73-74
      var count = 0, lines = [], saved = [];
      if (String(fromProject.projectcategory) === 'S')                                                                             // :80-84 PROJECTCATEGORY_ServiceChargeProject: thrown AFTER the order was saved; the Trx is rolled back
        throw new Error('Service Charge Projects are on the TODO List');
      lines = MP().getLines(trx, fromProject.c_project_id);                                                                        // :88 fromProject.getLines()
      lines.forEach(function (l) {                                                                                                 // :89-104
        var r = MO().MOrderLine_fromProject(trx, order, { line: l.line, description: l.description, productId: l.m_product_id,
          qty: X.A.toBD(String(l.plannedqty == null ? 0 : l.plannedqty)).subtract(X.A.toBD(String(l.invoicedqty == null ? 0 : l.invoicedqty))), fixedPrice: l.plannedprice, withDiscount: true });
        if (r.ok) { count++; saved.push(trx.get('c_orderline', r.po.id())); }
      });
      if (lines.length !== count) trx.say('§MODEL-SEVERE ProjectGenOrder Lines difference - ProjectLines=' + lines.length + ' <> Saved=' + count);   // :105-106
      var oh = trx.get('c_order', order.id());
      trx.say('§PROJECT-GENORDER project=' + fromProject.c_project_id + ' order=' + order.id() + ' documentno=' + oh.documentno + ' lines=' + count + ' totallines=' + oh.totallines + ' grandtotal=' + oh.grandtotal);
      saved.forEach(function (r) { trx.say('§PROJECT-GENORDER-LINE order=' + order.id() + ' line=' + r.line + ' product=' + r.m_product_id + ' qty=' + r.qtyordered + ' price=' + r.priceactual + ' discount=' + r.discount + ' amount=' + r.linenetamt); });
      return '@C_Order_ID@ ' + oh.documentno + ' (' + count + ')';                                                                  // :109-110
    };
    return ProjectGenOrder;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

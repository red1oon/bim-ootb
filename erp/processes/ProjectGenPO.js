// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ProjectGenPO.js - org.compiere.process.ProjectGenPO (AD_Process 225 "C_Project_GeneratePO" = "Generate PO from Project"), verbatim
// (org.adempiere.base.process/src/org/compiere/process/ProjectGenPO.java:40-216). bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §PROJ-PROCS - Witness: W-PROJ-PROCS (case O).
// MOrder(MProject,false,null) is ModelOrder.MOrder_fromProject; MOrder.setBPartner is MOrder_setBPartner; MProject.getLines/getPhaseLines are ModelProject; MConversionRate.convert is ModelTrade.convert.
// A PO is saved with the line's own org (setClientOrg :157-164: line client, line org, else the context org which is also written back to the line before its own save).
(function (global) {
  'use strict';
  var node = (typeof module !== 'undefined' && module.exports);
  var P = node ? require('../ad_process.js') : global.AdProcess;
  function nz(v) { return v != null && v !== '' && Number(v) !== 0; }
  P.defineProcess('org.compiere.process.ProjectGenPO', function (SvrProcess, X) {
    function MO() { return P.PSUP.docgen.MO(); }
    function MP() { return node ? require('../model_project') : global.ModelProject; }
    function T() { return P.PSUP.docgen.T(); }
    function ProjectGenPO() { SvrProcess.call(this); this.m_C_Project_ID = 0; this.m_C_ProjectPhase_ID = 0; this.m_C_ProjectLine_ID = 0; this.m_ConsolidateDocument = true; this.m_pos = []; }
    ProjectGenPO.prototype = Object.create(SvrProcess.prototype);
    ProjectGenPO.prototype.prepare = function () {                                       // :57-76
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) continue;
        else if (name === 'C_Project_ID') this.m_C_Project_ID = para[i].getParameterAsInt();
        else if (name === 'C_ProjectPhase_ID') this.m_C_ProjectPhase_ID = para[i].getParameterAsInt();
        else if (name === 'C_ProjectLine_ID') this.m_C_ProjectLine_ID = para[i].getParameterAsInt();
        else if (name === 'ConsolidateDocument') this.m_ConsolidateDocument = 'Y' === para[i].getParameter();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ProjectGenPO ' + name);
      }
    };
    ProjectGenPO.prototype.doIt = function () {                                          // :83-111
      var trx = this.get_TrxName(), self = this, project, line;
      trx.say('§PROC-INFO ProjectGenPO C_Project_ID=' + this.m_C_Project_ID + ' - C_ProjectLine_ID=' + this.m_C_ProjectLine_ID + ' - Consolidate=' + this.m_ConsolidateDocument);
      if (this.m_C_ProjectLine_ID !== 0) {                                                // :86-91
        line = trx.get('c_projectline', this.m_C_ProjectLine_ID);
        if (!line) throw new Error('Project line not found C_ProjectLine_ID=' + this.m_C_ProjectLine_ID);
        project = trx.get('c_project', line.c_project_id);
        this.createPO(trx, project, line);
      } else if (this.m_C_ProjectPhase_ID !== 0) {                                        // :93-99
        project = this.project(trx, this.m_C_Project_ID);
        MP().getPhaseLines(trx, project.c_project_id, this.m_C_ProjectPhase_ID).forEach(function (l) { if (l.isactive !== 'N') self.createPO(trx, project, l); });
      } else {                                                                            // :101-108
        project = this.project(trx, this.m_C_Project_ID);
        MP().getLines(trx, project.c_project_id).forEach(function (l) { if (l.isactive !== 'N') self.createPO(trx, project, l); });
      }
      return '';
    };
    ProjectGenPO.prototype.project = function (trx, id) {                                  // new MProject(ctx, id, trx): an id that is no project is an empty one, whose lines are none
      var p = nz(id) ? trx.get('c_project', id) : null;
      if (!p) throw new Error('Project not found C_Project_ID=' + id);
      return p;
    };
    // createPO :115-214 - one project line into a purchase order of its product's vendor
    ProjectGenPO.prototype.createPO = function (trx, project, projectLine) {
      var A = X.A, M = P.PSUP.docgen.ML(), line = projectLine.line, D = M.D, lineChanges = {};
      if (!nz(projectLine.m_product_id)) { this.addLog(line, null, null, 'Line has no Product'); return; }                        // :119-123
      if (nz(projectLine.c_orderpo_id)) { this.addLog(line, null, null, 'Line was ordered previously'); return; }                 // :124-128
      var pos = trx.find('m_product_po', { m_product_id: projectLine.m_product_id }).filter(function (r) { return r.isactive !== 'N'; })   // MProductPO.getOfProduct :48-57: active, ORDER BY IsCurrentVendor DESC
        .sort(function (a, b) { return ((b.iscurrentvendor === 'Y' ? 1 : 0) - (a.iscurrentvendor === 'Y' ? 1 : 0)) || (Number(a.c_bpartner_id) - Number(b.c_bpartner_id)); });
      if (pos.length === 0) { this.addLog(line, null, null, 'Product has no PO record'); return; }                                    // :130-136
      var order = null, i;
      for (i = 0; i < this.m_pos.length; i++) { if (String(this.m_pos[i].get('c_bpartner_id')) === String(pos[0].c_bpartner_id)) { order = this.m_pos[i]; break; } }   // :139-148 try to find PO to C_BPartner
      if (order == null) {                                                                                                          // :150-171 create new Order
        var bp = trx.get('c_bpartner', pos[0].c_bpartner_id);                                                                       // :153 Vendor
        order = MO().MOrder_fromProject(trx, project, false, null);                                                                 // :155 new MOrder(project, false, null)
        var orgId = Number(projectLine.ad_org_id) || 0;
        if (orgId === 0) {                                                                                                          // :157-163
          trx.say('§MODEL-WARNING ProjectGenPO.createPO AD_Org_ID=0');
          orgId = A.Env.getAD_Org_ID(this.getCtx());
          if (orgId !== 0) lineChanges.ad_org_id = orgId;                                                                           // projectLine.setAD_Org_ID(AD_Org_ID): kept by the projectLine.saveEx at :248
        }
        order.set('ad_client_id', projectLine.ad_client_id).set('ad_org_id', orgId);                                                // :164 setClientOrg
        MO().MOrder_setBPartner(trx, order, bp);                                                                                    // :165 setBPartner(bp)
        MO().MOrder_beforeSaveNew(trx, order, this.getCtx());
        MO().saveEx(order);                                                                                                         // :166 saveEx
        if (this.m_ConsolidateDocument) this.m_pos.push(order);                                                                     // :168-169 optionally save for consolidation
      }
      var oh = trx.get('c_order', order.id());
      var ol = MO().MOrderLine_new(trx, order);                                                                                     // :173 new MOrderLine(order)
      MO().MOrderLine_setProduct(trx, ol, projectLine.m_product_id);                                                                // :174 setM_Product_ID(id, true)
      var q = A.toBD(String(projectLine.plannedqty == null ? 0 : projectLine.plannedqty));
      ol.set('qtyentered', q).set('qtyordered', q);                                                                                 // :175 setQty(PlannedQty)
      ol.set('description', projectLine.description);                                                                               // :176
      MO().MOrderLine_setPrice(trx, ol);                                                                                            // :179 setPrice() - the order's price list (the project's)
      if (D(ol.get('priceactual')).signum() === 0) {                                                                                // :180-199 try to find the purchase price
        var poPrice = pos[0].pricepo, cur = pos[0].c_currency_id;
        if (poPrice == null || D(poPrice).signum() === 0) poPrice = pos[0].pricelastpo;                                             // :186-187
        if (poPrice == null || D(poPrice).signum() === 0) poPrice = pos[0].pricelist;                                               // :188-189
        if (poPrice != null && D(poPrice).signum() !== 0) {                                                                         // :191 we have a price
          poPrice = D(poPrice);
          if (String(oh.c_currency_id) !== String(cur)) poPrice = T().convert(trx, poPrice, cur, oh.c_currency_id, oh.dateacct, oh.c_conversiontype_id, oh.ad_org_id);   // :192-197 MConversionRate.convert
          if (poPrice == null) throw new Error('PriceActual is mandatory');                                                         // setPrice(null) -> MOrderLine.setPriceActual :280-285
          ol.set('priceentered', poPrice).set('priceactual', poPrice);                                                              // :198 setPrice(poPrice) :269-273
        }
      }
      MO().MOrderLine_setTax(trx, ol, oh);                                                                                          // :202 setTax()
      MO().saveEx(ol);                                                                                                              // :203 saveEx
      var lr = trx.get('c_orderline', ol.id());
      lineChanges.c_orderpo_id = order.id();                                                                                        // :205-206 update ProjectLine
      M.saveEx(trx, 'c_projectline', trx.get('c_projectline', projectLine.c_projectline_id), lineChanges);                           // :207 saveEx
      this.addBufferLog(order.id(), oh.dateordered, A.toBD(String(lr.line)), A.Msg.getElement(this.getCtx(), 'C_Order_ID') + ':' + oh.documentno, 259, order.id());   // :208-213 MOrder.Table_ID 259
      trx.say('§PROJECT-GENPO line=' + line + ' order=' + order.id() + ' documentno=' + oh.documentno + ' vendor=' + oh.c_bpartner_id + ' product=' + lr.m_product_id + ' qty=' + lr.qtyordered + ' price=' + lr.priceactual + ' amount=' + lr.linenetamt);
    };
    return ProjectGenPO;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

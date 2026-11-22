// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ProjectIssue.js - org.compiere.process.ProjectIssue (AD_Process 224 "Issue to Project" / Value C_Project_Issue, menu 401), ported from
// org.adempiere.base.process/src/org/compiere/process/ProjectIssue.java:56-349. bim-ootb prompts/CAPEX_DASHBOARD.md §INTERNAL-UAT IU1; bim-compiler SQLiteIDEMPIERE.md §UAT-LEDGER row 6.
// Witness: erp/tests/witness_project_issue_process.js (W-PROJECT-ISSUE-PROC).
// The M-class bodies are in model_projectissue.js (MProjectIssue: ctor/getNextLine/doComplete/doReverse) and model_project.js (MProjectLine.setMProjectIssue lives here as the 4 setters it is, :133-140).
// PORTED: doIt's category refusal :115-119, issueInventory :320-348 (the plain issue: Locator + Product + MovementQty + MovementDate + Description) and issueProjectLine :281-313.
// NOT PORTED (named, thrown, never faked): issueReceipt :137-208 (M_InOut_ID) and issueExpense :215-274 (S_TimeExpense_ID). Both feed MProjectIssue.updateBalanceAmt's
//   inOutLine.getPOCost / expenseLine.getLaborCost branches (MProjectIssue.java:559-566), which model_projectissue.js names as unported, so a "Created n" answer would carry a cost legacy does not give.
// MWorkflow.runDocumentActionWorkflow(pi, CO) :1001-1004 is ModelLayer.runWorkflow (sets DocAction=CO, then the DocAction column's workflow, else DocumentEngine.processIt).
(function (global) {
  'use strict';
  var node = (typeof module !== 'undefined' && module.exports);
  var P = node ? require('../ad_process.js') : global.AdProcess;
  function nz(v) { return v != null && v !== '' && Number(v) !== 0; }
  P.defineProcess('org.compiere.process.ProjectIssue', function (SvrProcess, X) {
    function ML() { return P.PSUP.docgen.ML(); }                                                                                                           // ModelLayer, resolved at call time (processes/support_docgen.js, as the other Project processes); MProjectIssue (model_projectissue.js) registers itself into it: the page loads it by its own script tag, a node witness requires it
    function ProjectIssue() {
      SvrProcess.call(this);
      this.m_C_Project_ID = 0; this.m_M_InOut_ID = 0; this.m_S_TimeExpense_ID = 0; this.m_M_Locator_ID = 0; this.m_C_ProjectLine_ID = 0;
      this.m_M_Product_ID = 0; this.m_MovementQty = null; this.m_MovementDate = null; this.m_Description = null; this.m_project = null;                       // :41-67
    }
    ProjectIssue.prototype = Object.create(SvrProcess.prototype);
    ProjectIssue.prototype.prepare = function () {                                                                                                         // :75-105
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) continue;
        else if (name === 'C_Project_ID') this.m_C_Project_ID = para[i].getParameterAsInt();
        else if (name === 'M_InOut_ID') this.m_M_InOut_ID = para[i].getParameterAsInt();
        else if (name === 'S_TimeExpense_ID') this.m_S_TimeExpense_ID = para[i].getParameterAsInt();
        else if (name === 'M_Locator_ID') this.m_M_Locator_ID = para[i].getParameterAsInt();
        else if (name === 'C_ProjectLine_ID') this.m_C_ProjectLine_ID = para[i].getParameterAsInt();
        else if (name === 'M_Product_ID') this.m_M_Product_ID = para[i].getParameterAsInt();
        else if (name === 'M_AttributeSetInstance_ID') continue;                                                                                           // read, never used (@SuppressWarnings("unused"))
        else if (name === 'MovementQty') this.m_MovementQty = para[i].getParameterAsBigDecimal();
        else if (name === 'MovementDate') this.m_MovementDate = para[i].getParameterAsTimestamp();
        else if (name === 'Description') this.m_Description = para[i].getParameterAsString();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ProjectIssue ' + name);                                                                                   // MProcessPara.validateUnknownParameter
      }
    };
    ProjectIssue.prototype.doIt = function () {                                                                                                            // :113-131
      var trx = this.get_TrxName(), cat;
      this.m_project = nz(this.m_C_Project_ID) ? trx.get('c_project', this.m_C_Project_ID) : null;                                                         // new MProject(ctx, id, trx): an id that is no project is an empty one, category null
      cat = this.m_project ? this.m_project.projectcategory : null;
      if (!(cat === 'W' || cat === 'A'))                                                                                                                   // :117-119 PROJECTCATEGORY_WorkOrderJob 'W' / PROJECTCATEGORY_AssetProject 'A'
        throw new Error('Project not Work Order or Asset =' + (cat == null || cat === '' ? 'null' : cat));
      trx.say('§PROC-INFO ProjectIssue project=' + this.m_project.c_project_id + ' category=' + cat);
      if (nz(this.m_M_InOut_ID)) throw new Error('§PROC-UNPORTED ProjectIssue.issueReceipt (:137-208, M_InOut_ID) is not ported - the issue cost branch inOutLine.getPOCost (MProjectIssue.java:559-562) is not either');
      if (nz(this.m_S_TimeExpense_ID)) throw new Error('§PROC-UNPORTED ProjectIssue.issueExpense (:215-274, S_TimeExpense_ID) is not ported - the issue cost branch expenseLine.getLaborCost (MProjectIssue.java:563-566) is not either');
      if (!nz(this.m_M_Locator_ID)) throw new Error('Locator missing');                                                                                    // :126-127
      if (nz(this.m_C_ProjectLine_ID)) return this.issueProjectLine();                                                                                     // :128-129
      return this.issueInventory();                                                                                                                         // :130
    };
    // new MProjectIssue(project) + setMandatory (MProjectIssue.java) saved, completed through the workflow, then a project line takes it (MProjectLine.setMProjectIssue)
    ProjectIssue.prototype.newIssue = function (trx, locatorId, productId, qty, description) {
      var piPO = ML().newRecord(trx, 'c_projectissue', { ad_client_id: this.m_project.ad_client_id, ad_org_id: this.m_project.ad_org_id, c_project_id: this.m_project.c_project_id,
        m_locator_id: locatorId, m_product_id: productId, movementqty: qty });                                                                              // MProjectIssue(project) + setMandatory (MProjectIssue.java new-parent ctor, getNextLine = model beforeSave)
      if (this.m_MovementDate != null) piPO.set('movementdate', this.m_MovementDate);                                                                       // if (m_MovementDate != null) default today
      if (description != null && String(description).length > 0) piPO.set('description', description);
      piPO.saveEx();
      var id = piPO.id(), r = ML().runWorkflow(trx, 'c_projectissue', id, 'CO');                                                                            // MWorkflow.runDocumentActionWorkflow(pi, DocAction.ACTION_Complete)
      if (!r || r.ok === false) throw new Error((r && r.msg) || 'Project Issue ' + id + ' not completed (' + (r && r.status) + ')');                       // processInfo.isError() -> RuntimeException(summary)
      return trx.get('c_projectissue', id);
    };
    ProjectIssue.prototype.issueProjectLine = function () {                                                                                                // :281-313
      var trx = this.get_TrxName(), D = ML().D, pl = trx.get('c_projectline', this.m_C_ProjectLine_ID);
      if (!pl || !nz(pl.m_product_id)) throw new Error('Projet Line has no Product');                                                                       // :285-286 (the Java spelling)
      if (nz(pl.c_projectissue_id)) throw new Error('Projet Line already been issued');                                                                     // :287-288
      if (!nz(this.m_M_Locator_ID)) throw new Error('No Locator');                                                                                          // :289-290
      var plChanges = {};
      if (pl.plannedqty == null || D(pl.plannedqty).signum() === 0) { plChanges.plannedqty = 1; pl = Object.assign({}, pl, plChanges); }                    // :291-292 Set to Qty 1 (saved with the line below)
      var desc = (this.m_Description != null && String(this.m_Description).length > 0) ? this.m_Description : (pl.description != null ? pl.description : null);   // :296-301
      var pi = this.newIssue(trx, this.m_M_Locator_ID, pl.m_product_id, pl.plannedqty, desc);
      var plPO = ML().po(trx, 'c_projectline', trx.get('c_projectline', this.m_C_ProjectLine_ID));
      if (plChanges.plannedqty != null) plPO.set('plannedqty', plChanges.plannedqty);
      this.setMProjectIssue(plPO, pi);                                                                                                                      // :309
      plPO.saveEx();
      this.addLog(pi.line, pi.movementdate, pi.movementqty, null);                                                                                          // :311
      trx.say('§PROJECT-ISSUE-PROC variant=projectline project=' + this.m_project.c_project_id + ' issue=' + pi.c_projectissue_id + ' line=' + pi.line + ' status=' + pi.docstatus + ' qty=' + pi.movementqty + ' projectline=' + pl.c_projectline_id);
      return '@Created@ 1';
    };
    ProjectIssue.prototype.issueInventory = function () {                                                                                                  // :320-348
      var trx = this.get_TrxName(), D = ML().D;
      if (!nz(this.m_M_Locator_ID)) throw new Error('No Locator');                                                                                          // :322-323
      if (!nz(this.m_M_Product_ID)) throw new Error('No Product');                                                                                          // :324-325
      if (this.m_MovementQty == null || D(this.m_MovementQty).signum() === 0) this.m_MovementQty = D(1);                                                    // :327-328 Set to Qty 1
      var pi = this.newIssue(trx, this.m_M_Locator_ID, this.m_M_Product_ID, this.m_MovementQty, this.m_Description);
      var plPO = ML().newRecord(trx, 'c_projectline', { ad_client_id: this.m_project.ad_client_id, ad_org_id: this.m_project.ad_org_id, c_project_id: this.m_project.c_project_id });   // new MProjectLine(project)
      this.setMProjectIssue(plPO, pi);                                                                                                                      // Create Project Line
      plPO.saveEx();
      this.addLog(pi.line, pi.movementdate, pi.movementqty, null);
      trx.say('§PROJECT-ISSUE-PROC variant=inventory project=' + this.m_project.c_project_id + ' issue=' + pi.c_projectissue_id + ' line=' + pi.line + ' status=' + pi.docstatus + ' qty=' + pi.movementqty + ' projectline=' + plPO.id());
      return '@Created@ 1';
    };
    // MProjectLine.setMProjectIssue :133-140
    ProjectIssue.prototype.setMProjectIssue = function (plPO, pi) {
      plPO.set('c_projectissue_id', pi.c_projectissue_id).set('m_product_id', pi.m_product_id).set('committedqty', pi.movementqty);
      if (plPO.get('description') != null) plPO.set('description', pi.description);                                                                         // :138-139 (the Java test is on the LINE's own description)
    };
    return ProjectIssue;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

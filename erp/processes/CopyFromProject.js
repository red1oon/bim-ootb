// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/CopyFromProject.js - org.compiere.process.CopyFromProject (AD_Process 212 "C_Project CopyFrom" = the Project window's "Copy Details" button), verbatim
// (org.adempiere.base.process/src/org/compiere/process/CopyFromProject.java:33-75). bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §PROJ-PROCS - Witness: W-PROJ-PROCS (case K).
// MProject.copyDetailsFrom (:267-274) and the phase/task copy constructors are in model_project.js (ModelProject.copyDetailsFrom).
(function (global) {
  'use strict';
  var node = (typeof module !== 'undefined' && module.exports);
  var P = node ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.CopyFromProject', function (SvrProcess, X) {
    function MP() { return node ? require('../model_project') : global.ModelProject; }
    function CopyFromProject() { SvrProcess.call(this); this.m_C_Project_ID = 0; }
    CopyFromProject.prototype = Object.create(SvrProcess.prototype);
    CopyFromProject.prototype.prepare = function () {                                   // :39-52
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) continue;
        else if (name === 'C_Project_ID') this.m_C_Project_ID = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA CopyFromProject ' + name);
      }
    };
    CopyFromProject.prototype.doIt = function () {                                      // :59-73
      var trx = this.get_TrxName(), toId = this.getRecord_ID();
      trx.say('§PROC-INFO CopyFromProject From C_Project_ID=' + this.m_C_Project_ID + ' to ' + toId);
      if (toId === 0) throw new Error('Target C_Project_ID == 0');                                    // :63-64
      if (this.m_C_Project_ID === 0) throw new Error('Source C_Project_ID == 0');                     // :65-66
      var from = trx.get('c_project', this.m_C_Project_ID), to = trx.get('c_project', toId);          // new MProject(ctx, id, trx)
      if (!from || !to) throw new Error('Project not found C_Project_ID=' + (!from ? this.m_C_Project_ID : toId));
      var no = MP().copyDetailsFrom(trx, to, from);                                                   // :70
      trx.say('§PROJECT-COPYFROM from=' + from.c_project_id + ' to=' + to.c_project_id + ' copied=' + no);
      return '@Copied@=' + no;                                                                        // :72
    };
    return CopyFromProject;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

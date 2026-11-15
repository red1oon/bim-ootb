// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ProjectClose.js - org.compiere.process.ProjectClose (AD_Process 227 "C_Project Close" on the Project window), verbatim
// (org.adempiere.base/src/org/compiere/process/ProjectClose.java:36-89). bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §PROJ-PROCS - Witness: W-PROJ-PROCS (case C).
// The body (every project line Processed, then the project) is ModelProject.close; it has NO refusal in Java (a closed project closes again).
(function (global) {
  'use strict';
  var node = (typeof module !== 'undefined' && module.exports);
  var P = node ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.ProjectClose', function (SvrProcess, X) {
    function MP() { return node ? require('../model_project') : global.ModelProject; }
    function ProjectClose() { SvrProcess.call(this); this.m_C_Project_ID = 0; }
    ProjectClose.prototype = Object.create(SvrProcess.prototype);
    ProjectClose.prototype.prepare = function () {                                      // :45-56
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        if (para[i].getParameter() == null) continue;
        X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ProjectClose ' + para[i].getParameterName());
      }
      this.m_C_Project_ID = this.getRecord_ID();
    };
    ProjectClose.prototype.doIt = function () {                                         // :64-87
      var trx = this.get_TrxName();
      var project = this.m_C_Project_ID ? trx.get('c_project', this.m_C_Project_ID) : null;           // new MProject(ctx, id, trx): an id that is no project is a NEW project, which saveEx refuses (mandatory Value/Name)
      if (!project) throw new Error('Project not found C_Project_ID=' + this.m_C_Project_ID);
      var n = MP().close(trx, project);                                                               // :69-84
      trx.say('§PROJECT-CLOSE project=' + project.c_project_id + ' lines=' + n);
      return '';
    };
    return ProjectClose;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

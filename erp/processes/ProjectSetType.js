// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ProjectSetType.js - org.compiere.process.ProjectSetType (AD_Process 215 "Set Project Type"), verbatim
// (org.adempiere.base.process/src/org/compiere/process/ProjectSetType.java:46-95). bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §BIMDOC-ERP-SIDE - Witness: W-BIMDOC (beat 1).
// The M-class body (MProject.setProjectType :370-378, copyPhasesFrom(MProjectType) :385-405, MProjectPhase/MProjectTask copy constructors) is in model_project.js (ModelProject.setProjectType).
function idSet(v) { return (Number(v) || 0) !== 0; }   // legacy `get<Col>_ID() > 0` for the twin's id law: a row made through the op log has a NEGATIVE synthetic pk (crud_core listTip -opId), so "an id is set" = non-zero (same rule as ModelLayer.idSet; MIGRATE_INSTALL_TENANT §IDLAW-SPEC)
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.ProjectSetType', function (SvrProcess, X) {
    function MP() { return (typeof module !== 'undefined' && module.exports) ? require('../model_project') : global.ModelProject; }
    function ProjectSetType() { SvrProcess.call(this); this.m_C_Project_ID = 0; this.m_C_ProjectType_ID = 0; }
    ProjectSetType.prototype = Object.create(SvrProcess.prototype);
    ProjectSetType.prototype.prepare = function () {                                  // :44-56
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) continue;
        else if (name === 'C_ProjectType_ID') this.m_C_ProjectType_ID = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ProjectSetType ' + name);
      }
    };
    ProjectSetType.prototype.doIt = function () {                                     // :63-81
      var trx = this.get_TrxName();
      this.m_C_Project_ID = this.getRecord_ID();
      var project = this.m_C_Project_ID ? trx.get('c_project', this.m_C_Project_ID) : null;
      if (!project) throw new Error('Project not found C_Project_ID=' + this.m_C_Project_ID);                                              // :68-69
      if (project.c_projecttype_id != null && project.c_projecttype_id !== '' && idSet(project.c_projecttype_id))
        throw new Error('Project already has Type (Cannot overwrite) ' + project.c_projecttype_id);                                        // :70-71
      var type = this.m_C_ProjectType_ID ? trx.get('c_projecttype', this.m_C_ProjectType_ID) : null;
      if (!type) throw new Error('Project Type not found C_ProjectType_ID=' + this.m_C_ProjectType_ID);                                    // :74-75
      MP().setProjectType(trx, project, type);                                                                                            // :78-80 Set & Copy if Service, then save
      return '@OK@';
    };
    return ProjectSetType;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

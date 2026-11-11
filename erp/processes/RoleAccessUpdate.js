// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/RoleAccessUpdate.js — org.compiere.process.RoleAccessUpdate (AD_Process 295, menu "Role Access Update"), verbatim
// (org.adempiere.base.process/src/org/compiere/process/RoleAccessUpdate.java). Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §HARDEN-SPEC H8 — Witness: W-ROLE-ACCESS-UPDATE.
// Why: a plugin started AFTER a company was born adds windows / processes / forms its roles cannot see; legacy's answer is this process (System runs it after installing a plugin).
//   The access logic is MRole.updateAccessRecords, ported once in model_master.js (also run by a new role's afterSave).
function idSet(v) { return (Number(v) || 0) !== 0; }   // legacy `get<Col>_ID() > 0` for the twin's id law: a row made through the op log has a NEGATIVE synthetic pk (crud_core listTip -opId), so "an id is set" = non-zero (same rule as ModelLayer.idSet; MIGRATE_INSTALL_TENANT §IDLAW-SPEC)
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.RoleAccessUpdate', function (SvrProcess, X) {
    function RoleAccessUpdate() { SvrProcess.call(this); this.p_AD_Role_ID = -1; this.p_IsReset = true; }
    RoleAccessUpdate.prototype = Object.create(SvrProcess.prototype);
    // prepare :52-68
    RoleAccessUpdate.prototype.prepare = function () {
      var R = X.A.RUNTIME, para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'AD_Role_ID') this.p_AD_Role_ID = para[i].getParameterAsInt();
        else if (name === 'ResetAccess') this.p_IsReset = 'Y' === para[i].getParameter();
        else R.log('§PROC-UNKNOWN-PARA RoleAccessUpdate ' + name);                     // MProcessPara.validateUnknownParameter
      }
    };
    // doIt :75-104
    RoleAccessUpdate.prototype.doIt = function () {
      var trx = this.get_TrxName(), self = this;
      if (idSet(this.p_AD_Role_ID)) this.updateRole(trx.get('ad_role', this.p_AD_Role_ID));
      else {
        var sql = "SELECT * FROM ad_role WHERE isactive='Y'", params = [];
        if (this.p_AD_Role_ID === 0) { sql += ' AND ad_role_id=?'; params.push(this.p_AD_Role_ID); }   // :86-90 SystemIDs.ROLE_SYSTEM
        if (this.getAD_Client_ID() > 0) { sql += ' AND ad_client_id=?'; params.push(this.getAD_Client_ID()); }   // :95 Query.setClient_ID(getAD_Client_ID() > 0)
        trx.q(sql + ' ORDER BY ad_client_id, name', params).forEach(function (role) { self.updateRole(role); });
      }
      return '';
    };
    // updateRole :107-112 — "<client> - <role>: <updateAccessRecords message>"
    RoleAccessUpdate.prototype.updateRole = function (role) {
      var trx = this.get_TrxName(), MM = (typeof module !== 'undefined' && module.exports) ? require('../model_master.js') : global.ModelMaster;
      var client = trx.q('SELECT name FROM ad_client WHERE ad_client_id=?', [role.ad_client_id])[0];
      var msg = X.A.Msg.parseTranslation(this.getCtx(), MM.updateAccessRecords(trx, role, this.p_IsReset));
      this.addLog(0, null, null, (client ? client.name : role.ad_client_id) + ' - ' + role.name + ': ' + msg);
    };
    return RoleAccessUpdate;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/PeriodStatus.js — org.compiere.process.PeriodStatus, verbatim (org.adempiere.base.process/src/org/compiere/process/
// PeriodStatus.java). bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.PeriodStatus', function (SvrProcess, X) {
    var A = X.A, R = A.RUNTIME, Msg = A.Msg, Env = A.Env;
    function PeriodStatus() { SvrProcess.call(this); this.p_C_Period_IDs = null; this.p_C_PeriodControl_IDs = null; this.p_PeriodAction = null; this.p_C_DocBaseGroup_ID = 0; }
    PeriodStatus.prototype = Object.create(SvrProcess.prototype);
    // prepare :53-83
    PeriodStatus.prototype.prepare = function () {
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'PeriodAction') this.p_PeriodAction = para[i].getParameter();
        else if (name === 'C_DocBaseGroup_ID') this.p_C_DocBaseGroup_ID = para[i].getParameterAsInt();
        else if (name === '*RecordIDs*') ;
        else R.log('§PROC-UNKNOWN-PARA PeriodStatus ' + name);                          // MProcessPara.validateUnknownParameter
      }
      this.p_C_Period_IDs = this.getRecord_IDs();
      if (this.p_C_Period_IDs == null || this.p_C_Period_IDs.length === 0) {
        if (this.getRecord_ID() === 0) {
          // :71-79 IDEMPIERE-2901 — period control IDs on T_Selection (the info-window multi-select path)
          var ids = [];
          try { ids = R.DB.getIDsEx(this.get_TrxName(), 'SELECT T_Selection_ID FROM T_Selection WHERE AD_PInstance_ID=?', this.getAD_PInstance_ID()); }
          catch (e) { R.unportedDep('PeriodStatus.prepare', 'T_Selection (absent from the bundle — no multi-select selection carried)'); }
          if (ids.length > 0) this.p_C_PeriodControl_IDs = ids.slice();
        } else {
          this.p_C_Period_IDs = [this.getRecord_ID()];
        }
      }
    };
    function hasUnpostedDocs(ctx, period, periodControlID) {                            // MPeriod.hasUnpostedDocs :1024-1072
      var cal = R.DB.getSQLValue(null, 'SELECT C_Calendar_ID FROM C_Year WHERE C_Year_ID=?', period.getC_Year_ID());
      var clientCal = R.DB.getSQLValue(null, 'SELECT C_Calendar_ID FROM AD_ClientInfo WHERE AD_Client_ID=?', Env.getAD_Client_ID(ctx));
      var sql = "SELECT 1 FROM RV_UnPosted up WHERE up.DocStatus IN('CO', 'CL', 'RE', 'VO') AND up.AD_Client_ID=? AND up.DateAcct BETWEEN ? AND ? " +
        ' AND AD_Org_ID IN (SELECT AD_Org_ID FROM AD_OrgInfo WHERE AD_Client_ID=? AND (C_Calendar_ID=?' + (cal === clientCal ? ' OR C_Calendar_ID IS NULL' : '') + ')) ';
      var args = [Env.getAD_Client_ID(ctx), period.getStartDate(), period.getEndDate(), Env.getAD_Client_ID(ctx), cal];
      if (periodControlID > 0) { sql += ' AND up.DocBaseType = ? '; args.push(R.PO.get('C_PeriodControl', periodControlID).getDocBaseType()); }
      sql += ' LIMIT 1';
      try { return R.DB.query(sql, args).length > 0; }
      catch (e) { R.unportedDep('MPeriod.hasUnpostedDocs', 'view RV_UnPosted (absent from the bundle) — treated as no unposted docs'); return false; }
    }
    // doIt :86-166
    PeriodStatus.prototype.doIt = function () {
      var no = 0, self = this;
      if ((this.p_C_PeriodControl_IDs == null || this.p_C_PeriodControl_IDs.length === 0) && (this.p_C_Period_IDs == null || this.p_C_Period_IDs.length === 0))
        throw A.AdempiereException(Msg.parseTranslation(this.getCtx(), '@FillMandatory@ @C_Period_ID@'));     // AdempiereUserError
      if (A.isEmpty(this.p_PeriodAction) || 'N' === this.p_PeriodAction) return '-';                       // PERIODACTION_NoAction
      // :100-117 FORCE_POSTING_PRIOR_TO_PERIOD_CLOSE (MSysConfig default true)
      if (('C' === String(this.p_PeriodAction).toUpperCase() || 'P' === String(this.p_PeriodAction).toUpperCase()) && sysConfigBool('FORCE_POSTING_PRIOR_TO_PERIOD_CLOSE', true, this.getAD_Client_ID())) {
        if (this.p_C_Period_IDs != null) {
          this.p_C_Period_IDs.forEach(function (periodID) { var p = R.PO.get('C_Period', periodID); if (hasUnpostedDocs(self.getCtx(), p, 0)) throw A.AdempiereException(Msg.getMsg(self.getCtx(), 'PostUnpostedDocs')); });
        } else {
          this.p_C_PeriodControl_IDs.forEach(function (pcId) { var pc = R.PO.get('C_PeriodControl', pcId); var p = R.PO.get('C_Period', pc.getC_Period_ID()); if (hasUnpostedDocs(self.getCtx(), p, pcId)) throw A.AdempiereException(Msg.getMsg(self.getCtx(), 'PostUnpostedDocs')); });
        }
      }
      var sql = "UPDATE C_PeriodControl SET PeriodStatus=?, PeriodAction='N', Updated=getDate(), UpdatedBy=? WHERE ";
      var wherepc = '';
      if (this.p_C_Period_IDs != null && this.p_C_Period_IDs.length > 0) wherepc += 'C_Period_ID IN (' + this.p_C_Period_IDs.join(',');
      else if (this.p_C_PeriodControl_IDs != null && this.p_C_PeriodControl_IDs.length > 0) wherepc += 'C_PeriodControl_ID IN (' + this.p_C_PeriodControl_IDs.join(',');
      wherepc += ") AND PeriodStatus<>'P' AND PeriodStatus<>?";
      if (this.p_C_DocBaseGroup_ID > 0) wherepc += ' AND DocBaseType IN ( SELECT gl.DocBaseType FROM C_DocBaseGroupLine gl WHERE gl.C_DocBaseGroup_ID = ' + this.p_C_DocBaseGroup_ID + ')';
      sql += wherepc;
      R.DB.getIDsEx(this.get_TrxName(), 'SELECT DISTINCT C_Period_ID FROM C_PeriodControl WHERE ' + wherepc, this.p_PeriodAction);
      no += R.DB.executeUpdateEx(sql, [this.p_PeriodAction, this.getAD_User_ID(), this.p_PeriodAction], this.get_TrxName());
      // :158-165 CacheMgt.reset — no cache in this runtime
      return '@Updated@ #' + no;
    };
    function sysConfigBool(name, dflt, client) {                                       // MSysConfig.getBooleanValue
      try { var r = R.DB.query("SELECT Value AS v FROM AD_SysConfig WHERE Name=? AND AD_Client_ID IN (0,?) AND IsActive='Y' ORDER BY AD_Client_ID DESC, AD_Org_ID DESC", [name, client])[0];
        return r ? 'Y' === r.v : dflt; }
      catch (e) { R.unportedDep('MSysConfig.getBooleanValue(' + name + ')', 'AD_SysConfig absent from the bundle — Java default ' + dflt); return dflt; }
    }
    return PeriodStatus;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

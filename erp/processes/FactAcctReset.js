// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/FactAcctReset.js — org.compiere.process.FactAcctReset, verbatim
// (org.adempiere.base.process/src/org/compiere/process/FactAcctReset.java). §CP — Witness: W-CP-PROC-ORACLE.
// The X_*.Table_ID constants are resolved from AD_Table by name (same ids the generated classes carry).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.FactAcctReset', function (SvrProcess, X) {
    function FactAcctReset() { SvrProcess.call(this); this.p_AD_Client_ID = 0; this.p_AD_Table_ID = 0; this.p_DeletePosting = false; this.p_AlsoWithoutPostings = false;
      this.m_countReset = 0; this.m_countDelete = 0; this.p_DateAcct_From = null; this.p_DateAcct_To = null; }
    FactAcctReset.prototype = Object.create(SvrProcess.prototype);
    // prepare :82-110
    FactAcctReset.prototype.prepare = function () {
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null && para[i].getParameter_To() == null) ;
        else if (name === 'AD_Client_ID') this.p_AD_Client_ID = para[i].getParameterAsInt();
        else if (name === 'AD_Table_ID') this.p_AD_Table_ID = para[i].getParameterAsInt();
        else if (name === 'DeletePosting') this.p_DeletePosting = 'Y' === para[i].getParameter();
        else if (name === 'DateAcct') { this.p_DateAcct_From = para[i].getParameter(); this.p_DateAcct_To = para[i].getParameter_To(); }
        else if (name === 'AlsoWithoutPostings') this.p_AlsoWithoutPostings = 'Y' === para[i].getParameter();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA FactAcctReset ' + name);
      }
    };
    // doIt :117-155
    FactAcctReset.prototype.doIt = function () {
      var R = X.A.RUNTIME, self = this;
      var sql = "SELECT AD_Table_ID, TableName FROM AD_Table t WHERE t.IsView='N'";
      if (this.p_AD_Table_ID > 0) sql += ' AND t.AD_Table_ID=' + this.p_AD_Table_ID;
      sql += " AND EXISTS (SELECT * FROM AD_Column c WHERE t.AD_Table_ID=c.AD_Table_ID AND c.ColumnName='Posted' AND c.IsActive='Y')";
      try {
        var rs = R.DB.prepareStatement(sql).executeQuery();
        while (rs.next()) {
          var AD_Table_ID = rs.getInt(1), TableName = rs.getString(2);
          if (this.p_DeletePosting) this.del(TableName, AD_Table_ID);
          else this.reset(TableName);
        }
      } catch (e) { R.log('§PROC-SEVERE FactAcctReset ' + sql + ' ' + ((e && e.message) || e)); }   // :145-148 log.log(SEVERE) and continue
      return '@Updated@ = ' + this.m_countReset + ', @Deleted@ = ' + this.m_countDelete;
    };
    // reset :161-176
    FactAcctReset.prototype.reset = function (TableName) {
      var DB = X.A.RUNTIME.DB, trx = this.get_TrxName();
      var sql = 'UPDATE ' + TableName + " SET Processing='N' WHERE AD_Client_ID=" + this.p_AD_Client_ID + " AND (Processing<>'N' OR Processing IS NULL)";
      var unlocked = DB.executeUpdate(sql, trx);
      sql = 'UPDATE ' + TableName + " SET Posted='N' WHERE AD_Client_ID=" + this.p_AD_Client_ID + " AND (Posted NOT IN ('Y','N') OR Posted IS NULL) AND Processed='Y'";
      var invalid = DB.executeUpdate(sql, trx);
      this.m_countReset += unlocked + invalid;
    };
    function tid(name) { return X.A.RUNTIME.DB.getSQLValue(null, 'SELECT AD_Table_ID FROM AD_Table WHERE TableName=?', name); }
    // delete :183-355
    FactAcctReset.prototype.del = function (TableName, AD_Table_ID) {
      var A = X.A, R = A.RUNTIME, DB = R.DB, TimeUtil = A.TimeUtil, trx = this.get_TrxName();
      var today = TimeUtil.trunc(new A.Timestamp(R.now()));
      var as = DB.query('SELECT a.* FROM C_AcctSchema a JOIN AD_ClientInfo ci ON ci.C_AcctSchema1_ID=a.C_AcctSchema_ID WHERE ci.AD_Client_ID=?', [this.getAD_Client_ID()])[0];
      var autoPeriod = as != null && as.isautoperiodcontrol === 'Y';
      if (autoPeriod) {                                                                  // :188-201
        var temp = TimeUtil.addDays(today, -Number(as.period_openhistory || 0));
        if (this.p_DateAcct_From == null || this.p_DateAcct_From.before(temp)) this.p_DateAcct_From = temp;
        temp = TimeUtil.addDays(today, Number(as.period_openfuture || 0));
        if (this.p_DateAcct_To == null || this.p_DateAcct_To.after(temp)) this.p_DateAcct_To = temp;
      }
      this.reset(TableName);
      var docBaseType = null;                                                            // :204-258
      if (AD_Table_ID === tid('C_Invoice')) docBaseType = "IN ('API','APC','ARI','ARC','ARF')";
      else if (AD_Table_ID === tid('M_InOut')) docBaseType = "IN ('MMS','MMR')";
      else if (AD_Table_ID === tid('C_Payment')) docBaseType = "IN ('APP','ARR')";
      else if (AD_Table_ID === tid('C_Order')) docBaseType = "IN ('SOO','POO')";
      else if (AD_Table_ID === tid('C_ProjectIssue')) docBaseType = "= 'PJI'";
      else if (AD_Table_ID === tid('C_BankStatement')) docBaseType = "= 'CMB'";
      else if (AD_Table_ID === tid('C_Cash')) docBaseType = "= 'CMC'";
      else if (AD_Table_ID === tid('C_AllocationHdr')) docBaseType = "= 'CMA'";
      else if (AD_Table_ID === tid('GL_Journal') || AD_Table_ID === tid('A_Asset_Reval') || AD_Table_ID === tid('A_Asset_Transfer')) docBaseType = "= 'GLJ'";
      else if (AD_Table_ID === tid('M_Movement')) docBaseType = "= 'MMM'";
      else if (AD_Table_ID === tid('M_Requisition')) docBaseType = "= 'POR'";
      else if (AD_Table_ID === tid('M_Inventory')) docBaseType = "= 'MMI'";
      else if (AD_Table_ID === tid('M_Production')) docBaseType = "= 'MMP'";
      else if (AD_Table_ID === tid('M_MatchInv')) docBaseType = "= 'MXI'";
      else if (AD_Table_ID === tid('M_MatchPO')) docBaseType = "= 'MXP'";
      else if (AD_Table_ID === tid('PP_Order')) docBaseType = "IN ('MOP','MOF','MQO')";
      else if (AD_Table_ID === tid('DD_Order')) docBaseType = "= 'DOO'";
      else if (AD_Table_ID === tid('HR_Process')) docBaseType = "= 'HRP'";
      else if (AD_Table_ID === tid('PP_Cost_Collector')) docBaseType = "= 'MCC'";
      else if (AD_Table_ID === tid('A_Asset_Addition') || AD_Table_ID === tid('A_Asset_Disposed')) docBaseType = "= 'GLD'";
      if (docBaseType == null) { var s0 = TableName + ': Unknown DocBaseType'; this.addLog(s0); return; }   // :260-267
      docBaseType = ' AND pc.DocBaseType ' + docBaseType;
      var sql1 = 'UPDATE ' + TableName + " SET Posted='N', Processing='N' WHERE AD_Client_ID=" + this.p_AD_Client_ID +   // :269-283 Doc
        " AND (Posted<>'N' OR Posted IS NULL OR Processing<>'N' OR Processing IS NULL)" +
        ' AND EXISTS (SELECT 1 FROM C_PeriodControl pc INNER JOIN Fact_Acct fact ON (fact.C_Period_ID=pc.C_Period_ID) ' +
        ' WHERE fact.AD_Table_ID=' + AD_Table_ID + ' AND fact.Record_ID=' + TableName + '.' + TableName + '_ID';
      if (!autoPeriod) sql1 += " AND pc.PeriodStatus = 'O'" + docBaseType;
      if (this.p_DateAcct_From != null) sql1 += ' AND TRUNC(fact.DateAcct) >= ' + DB.TO_DATE(this.p_DateAcct_From);
      if (this.p_DateAcct_To != null) sql1 += ' AND TRUNC(fact.DateAcct) <= ' + DB.TO_DATE(this.p_DateAcct_To);
      sql1 += ')';
      var reset = DB.executeUpdate(sql1, trx);
      var sql2 = 'DELETE FROM Fact_Acct WHERE AD_Client_ID=' + this.p_AD_Client_ID + ' AND AD_Table_ID=' + AD_Table_ID;   // :285-300 Fact
      if (!autoPeriod) sql2 += " AND EXISTS (SELECT 1 FROM C_PeriodControl pc WHERE pc.PeriodStatus = 'O'" + docBaseType + ' AND Fact_Acct.C_Period_ID=pc.C_Period_ID)';
      else sql2 += ' AND EXISTS (SELECT 1 FROM C_PeriodControl pc WHERE Fact_Acct.C_Period_ID=pc.C_Period_ID)';
      if (this.p_DateAcct_From != null) sql2 += ' AND TRUNC(Fact_Acct.DateAcct) >= ' + DB.TO_DATE(this.p_DateAcct_From);
      if (this.p_DateAcct_To != null) sql2 += ' AND TRUNC(Fact_Acct.DateAcct) <= ' + DB.TO_DATE(this.p_DateAcct_To);
      var deleted = DB.executeUpdate(sql2, trx);
      this.m_countReset += reset;
      var dateColumn = 'DateAcct';                                                       // :304-318
      if ([tid('M_Inventory'), tid('M_Movement'), tid('M_Production'), tid('C_ProjectIssue')].indexOf(AD_Table_ID) >= 0) dateColumn = 'MovementDate';
      else if (AD_Table_ID === tid('M_Requisition')) dateColumn = 'DateDoc';
      else if (AD_Table_ID === tid('DD_Order') || AD_Table_ID === tid('PP_Order')) dateColumn = 'DateOrdered';
      var reset3 = 0;
      if (this.p_AlsoWithoutPostings) {                                                  // :320-342
        var sql3 = 'UPDATE ' + TableName + " SET Posted='N', Processing='N' WHERE AD_Client_ID=" + this.p_AD_Client_ID + " AND IsActive='Y'" +
          " AND (Posted<>'N' OR Posted IS NULL OR Processing<>'N' OR Processing IS NULL)" +
          ' AND NOT EXISTS (SELECT 1 FROM Fact_Acct fact WHERE fact.AD_Table_ID=' + AD_Table_ID + ' AND fact.Record_ID=' + TableName + '.' + TableName + '_ID)';
        if (!autoPeriod) sql3 += ' AND EXISTS (SELECT 1 FROM C_PeriodControl pc JOIN C_Period p ON (pc.C_Period_ID=p.C_Period_ID) WHERE TRUNC(' + TableName + '.' + dateColumn + ") BETWEEN p.StartDate AND p.EndDate AND pc.PeriodStatus = 'O'" + docBaseType + ')';
        if (this.p_DateAcct_From != null) sql3 += ' AND TRUNC(' + TableName + '.' + dateColumn + ') >= ' + DB.TO_DATE(this.p_DateAcct_From);
        if (this.p_DateAcct_To != null) sql3 += ' AND TRUNC(' + TableName + '.' + dateColumn + ') <= ' + DB.TO_DATE(this.p_DateAcct_To);
        reset3 = DB.executeUpdate(sql3, trx);
      }
      this.addLog(TableName + ' - Reset=' + (reset + reset3) + ' - Deleted=' + deleted);  // :345-350
      this.m_countReset += reset3;
      this.m_countDelete += deleted;
    };
    return FactAcctReset;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

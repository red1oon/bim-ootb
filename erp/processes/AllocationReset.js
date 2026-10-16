// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/AllocationReset.js — org.compiere.process.AllocationReset, verbatim
// (org.adempiere.base.process/src/org/compiere/process/AllocationReset.java). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.AllocationReset', function (SvrProcess, X) {
    var A = X.A, R = A.RUNTIME, Msg = A.Msg, ML = X.ML;
    function PAY() { return P.PSUP.pay; }
    function AllocationReset() { SvrProcess.call(this); this.p_C_BP_Group_ID = 0; this.p_C_BPartner_ID = 0; this.p_DateAcct_From = null; this.p_DateAcct_To = null;
      this.p_C_AllocationHdr_ID = 0; this.p_AllAllocations = false; }
    AllocationReset.prototype = Object.create(SvrProcess.prototype);
    // prepare :64-96
    AllocationReset.prototype.prepare = function () {
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null && para[i].getParameter_To() == null) ;
        else if (name === 'C_BP_Group_ID') this.p_C_BP_Group_ID = para[i].getParameterAsInt();
        else if (name === 'C_BPartner_ID') this.p_C_BPartner_ID = para[i].getParameterAsInt();
        else if (name === 'C_AllocationHdr_ID') this.p_C_AllocationHdr_ID = para[i].getParameterAsInt();
        else if (name === 'DateAcct') { this.p_DateAcct_From = para[i].getParameter(); this.p_DateAcct_To = para[i].getParameter_To(); }
        else if (name === 'AllAllocations') this.p_AllAllocations = 'Y' === para[i].getParameter();
        else R.log('§PROC-UNKNOWN-PARA AllocationReset ' + name);                          // MProcessPara.validateUnknownParameter
      }
      if (!this.p_AllAllocations && this.getTable_ID() === tableId('C_AllocationHdr') && this.getRecord_ID() > 0) this.p_C_AllocationHdr_ID = this.getRecord_ID();
    };
    function tableId(n) { return R.DB.getSQLValue(null, 'SELECT AD_Table_ID FROM AD_Table WHERE TableName=?', n); }
    function ts(v) { return v == null ? null : String(v.toString()).slice(0, 10); }
    // doIt :104-179
    AllocationReset.prototype.doIt = function () {
      var trx = this.get_TrxName(), count = 0, self = this;
      if (this.p_C_AllocationHdr_ID === 0 && !this.p_AllAllocations) throw A.AdempiereException(Msg.parseTranslation(this.getCtx(), '@Mandatory@: @C_AllocationHdr_ID@'));   // AdempiereUserError
      if (this.p_C_AllocationHdr_ID !== 0) {                                              // :112-125
        var hdr = trx.get('c_allocationhdr', this.p_C_AllocationHdr_ID);
        if (this.del(hdr)) count++; else throw new Error('Cannot delete');
        return '@Deleted@ #' + count;
      }
      var params = [], where = 'EXISTS (SELECT * FROM C_AllocationLine al WHERE C_AllocationHdr.C_AllocationHdr_ID=al.C_AllocationHdr_ID';   // :127
      if (this.p_C_BPartner_ID !== 0) { where += ' AND al.C_BPartner_ID=?'; params.push(this.p_C_BPartner_ID); }
      else if (this.p_C_BP_Group_ID !== 0) { where += ' AND EXISTS (SELECT * FROM C_BPartner bp WHERE bp.C_BPartner_ID=al.C_BPartner_ID AND bp.C_BP_Group_ID=?)'; params.push(this.p_C_BP_Group_ID); }
      else { where += ' AND AD_Client_ID=?'; params.push(this.getAD_Client_ID()); }
      if (this.p_DateAcct_From != null) { where += ' AND TRUNC(C_AllocationHdr.DateAcct) >= ?'; params.push(this.p_DateAcct_From.toString()); }
      if (this.p_DateAcct_To != null) { where += ' AND TRUNC(C_AllocationHdr.DateAcct) <= ?'; params.push(this.p_DateAcct_To.toString()); }
      where += ' AND al.C_CashLine_ID IS NULL)';                                          // Do not delete Cash Trx
      where += ' AND EXISTS (SELECT * FROM C_Period p INNER JOIN C_PeriodControl pc ON (p.C_Period_ID=pc.C_Period_ID AND pc.DocBaseType=\'CMA\') ' +
        'WHERE C_AllocationHdr.DateAcct BETWEEN p.StartDate AND p.EndDate)';              // Open Period
      // Query.setClient_ID(): AND AD_Client_ID=? (Query.java buildSQL)
      var ids = R.DB.query('SELECT C_AllocationHdr_ID AS id FROM C_AllocationHdr WHERE ' + where + ' AND AD_Client_ID=? ORDER BY C_AllocationHdr_ID', params.concat([this.getAD_Client_ID()]));
      ids.forEach(function (r) {
        var h = trx.get('c_allocationhdr', r.id);
        if (h && self.del(h)) count++;
      });
      return '@Deleted@ #' + count;
    };
    // delete :183-196 — hdr.delete(true, trxName); the commit/rollback is the one Trx group
    AllocationReset.prototype.del = function (hdr) {
      var r = ML.remove(this.get_TrxName(), 'c_allocationhdr', hdr);
      if (r.ok) return true;
      this.get_TrxName().say('§PROC-WARN AllocationReset delete refused: ' + r.error);
      return false;
    };
    return AllocationReset;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

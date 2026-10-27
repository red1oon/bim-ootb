// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/RecurringRun.js - org.idempiere.process.RecurringRun (AD_Process 200074 "Recurring Run", IDEMPIERE-2100 Automate Recurring Run), verbatim
// (org.adempiere.base.process/src/org/idempiere/process/RecurringRun.java). bim-compiler prompts/TEAMWORK_FRAMEWORK.md section 41 row F1 - Witness: W-RECURRING (erp/tests/witness_recurring.js).
// WHAT RUNS (doIt :99-172): every ACTIVE C_Recurring of the session client with RunsMax > COUNT(C_Recurring_Run), optionally of ONE C_RecurringGroup and with DateNextRun <= Cut_Date, ordered by
//   Name, C_Recurring_ID; each one is run by MRecurring.executeRun (processes/Recurring.js - ONE port), then on the document it created: the Description tags are replaced (header, then every line;
//   journals not ported, see below), then DocAction is run on it (default CO) - a refusal throws IllegalStateException "PO Process Failed" (the WHOLE run is rolled back, as the process transaction
//   is in legacy), po.saveEx(), and a buffer log {record = the document, date = the DateNextRun the run used, msg = "@Created@ <DocumentNo>"} is written.
// TAGS (replaceTagsInDescription :174-197): Env.parseVariable(description, po, trx, keepUnparseable=true) (model_trade.js parseVariable = DefaultEvaluatee, the ONE port, run per @token@ so that an
//   unresolved token is KEPT as legacy keeps it), then each Prm_* parameter value replaces its @Prm_xxx@ tag; the record is saved only when the text changed.
// TWIN DECISIONS (named): (a) a parameter that the caller did not send reaches the process as NULL (runJava appends a NULL entry for every declared AD_Process_Para); the legacy dialog always sends the
//   dictionary DefaultValue, so the twin takes it: DocAction -> 'CO' (AD_Process_Para 200074/DocAction DefaultValue), Cut_Date -> @#Date@ = the session date. Printed as section-PROC-PARAM. (b) useColumnDateFormat=true
//   (date columns shown in the column's display format inside a Description) is not modelled: a date is shown as stored. (c) MJournalBatch lines (journals of a GL batch) are never reached because the
//   GL Journal Batch copy (RecurringType G) is not ported in Recurring.js and fails there first. (d) the SELECT of due recurrings reads committed rows (a raw query); one process run touches each recurring once,
//   so the pending writes of the same run never matter. (e) Msg.parseTranslation of the log message: the twin's A.Msg.parseTranslation.
(function (global) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var P = NODE ? require('../ad_process.js') : global.AdProcess;
  var ML = NODE ? require('../model_layer') : global.ModelLayer;
  var T = NODE ? require('../model_trade') : global.ModelTrade;
  function RECUR() { return NODE ? require('./Recurring.js') : global.ModelRecurring; }
  function nz(v) { return v == null || v === '' ? 0 : Number(v); }
  function isEmpty(s) { return s == null || String(s) === ''; }

  // Env.parseVariable(expression, po, trxName, useColumnDateFormat=true, useMsgForBoolean=false, keepUnparseable=true) util/Env.java:2070-2131
  function parseVariableKeep(trx, expression, po) {
    if (expression == null || expression.length === 0) return '';
    var inStr = String(expression), out = '', i = inStr.indexOf('@');
    while (i !== -1) {
      out += inStr.slice(0, i); inStr = inStr.slice(i + 1);
      var j = inStr.indexOf('@');
      if (j < 0) { trx.say('§MODEL-SEVERE Env.parseVariable No second tag: ' + inStr); return ''; }                                       // log SEVERE, return ""
      if (j === 0) { out += '@'; inStr = inStr.slice(1); i = inStr.indexOf('@'); continue; }                                           // '@@' escape
      var token = inStr.slice(0, j), value = T.parseVariable(trx, '@' + token + '@', po);                                              // the DefaultEvaluatee value of ONE token ('' when empty)
      out += isEmpty(value) ? '@' + token + '@' : value;                                                                              // keepUnparseable
      inStr = inStr.slice(j + 1); i = inStr.indexOf('@');
    }
    return out + inStr;
  }

  if (P && P.defineProcess) P.defineProcess('org.idempiere.process.RecurringRun', function (SvrProcess, X) {
    function RecurringRun() { SvrProcess.call(this); this.p_C_RecurringGroup_ID = 0; this.p_Cut_Date = null; this.p_DocAction = null; this.prms = []; }
    RecurringRun.prototype = Object.create(SvrProcess.prototype);

    RecurringRun.prototype.prepare = function () {                                                                                    // :63-83
      var trx = this.get_TrxName(), para = this.getParameter(), pid = this.getProcessInfo().AD_Process_ID || 200074, seen = {};
      function dflt(name) { var r = trx.q('SELECT defaultvalue AS d FROM ad_process_para WHERE ad_process_id=? AND columnname=? AND isactive=?', [pid, name, 'Y'])[0]; return r && r.d != null && r.d !== '' ? r.d : null; }
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName(), pv = para[i].getParameter();
        if (pv != null) seen[name] = 1;
        if (name === 'C_RecurringGroup_ID') this.p_C_RecurringGroup_ID = pv == null ? 0 : para[i].getParameterAsInt();
        else if (name === 'Cut_Date') this.p_Cut_Date = pv == null ? null : para[i].getParameterAsTimestamp();
        else if (name === 'DocAction') this.p_DocAction = pv == null ? null : para[i].getParameterAsString();
        else if (name.indexOf('Prm_') === 0) { var prm = pv == null ? null : para[i].getParameterAsString(); if (prm != null && String(prm).trim() !== '') this.prms.push({ name: name, value: prm }); }   // !Util.isEmpty(prm, true)
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA RecurringRun ' + name);                                                              // MProcessPara.validateUnknownParameter
      }
      if (!seen.DocAction) { var d1 = dflt('DocAction'); if (d1 != null) { this.p_DocAction = d1; trx.say('§PROC-PARAM RecurringRun DocAction=' + d1 + ' source=AD_Process_Para default'); } }
      if (!seen.Cut_Date) { var d2 = dflt('Cut_Date'); if (d2 === '@#Date@') { this.p_Cut_Date = X.A.Timestamp.of(trx.env.date); trx.say('§PROC-PARAM RecurringRun Cut_Date=' + trx.env.date + ' source=AD_Process_Para default @#Date@'); } }
    };

    RecurringRun.prototype.replaceTagsInDescription = function (trx, table, id) {                                                     // :174-197
      var po = trx.get(table, id);
      if (!po || !Object.prototype.hasOwnProperty.call(po, 'description')) return;                                                    // po.get_ColumnIndex("Description") >= 0
      var org = po.description == null ? '' : String(po.description), description = parseVariableKeep(trx, org, po);                  // get_ValueAsString: null -> ""
      for (var k = 0; k < this.prms.length; k++) description = description.split('@' + this.prms[k].name + '@').join(this.prms[k].value);   // description.replaceAll(tag, prmValue)
      if (org !== description) ML.saveEx(trx, table, po, { description: description });                                               // set_ValueOfColumn + saveEx
    };

    RecurringRun.prototype.doIt = function () {                                                                                       // :88-172
      var trx = this.get_TrxName(), A = X.A, R = RECUR(), self = this;
      trx.say('§PROC-INFO RecurringRun C_RecurringGroup_ID=' + this.p_C_RecurringGroup_ID + ', Cut_Date=' + this.p_Cut_Date + ', DocAction=' + this.p_DocAction);
      var sql = 'SELECT * FROM c_recurring WHERE runsmax>(SELECT COUNT(*) FROM c_recurring_run WHERE c_recurring_run.c_recurring_id=c_recurring.c_recurring_id)', prm = [];
      if (this.p_C_RecurringGroup_ID > 0) { sql += ' AND c_recurringgroup_id=?'; prm.push(this.p_C_RecurringGroup_ID); }
      if (this.p_Cut_Date != null) { sql += ' AND datenextrun<=?'; prm.push(String(this.p_Cut_Date.toString ? this.p_Cut_Date.toString() : this.p_Cut_Date).slice(0, 19)); }
      sql += " AND isactive='Y' AND ad_client_id=? ORDER BY name, c_recurring_id"; prm.push(this.getAD_Client_ID());                // setOnlyActiveRecords + setClient_ID + setOrderBy
      var recs = trx.q(sql, prm), cnt = 0;
      trx.say('§RECUR RecurringRun due=' + recs.length + ' ids=' + recs.map(function (r) { return r.c_recurring_id; }).join(','));
      recs.forEach(function (rec) {
        trx.say('§PROC-INFO RecurringRun ' + R.toStr(rec));
        self.statusUpdate(A.Msg.parseTranslation(self.getCtx(), '@Processing@') + Math.floor(cnt * 100 / recs.length) + '% - ' + R.toStr(rec));
        cnt++;
        var currdate = rec.datenextrun, ex = R.executeRun(trx, rec.c_recurring_id), msg = ex.msg, po = ex.po;
        if (!po) return;                                                                                                              // getLastPO() == null
        self.replaceTagsInDescription(trx, po.table, po.id);
        var lineTable = po.table === 'c_invoice' ? 'c_invoiceline' : po.table === 'c_order' ? 'c_orderline' : null;                    // MInvoice/MOrder.getLines(): ORDER BY Line
        if (lineTable) trx.find(lineTable, (function (o) { o[po.table + '_id'] = po.id; return o; })({}), ['line']).forEach(function (l) { self.replaceTagsInDescription(trx, lineTable, l[lineTable + '_id']); });
        if (self.p_DocAction != null && (po.table === 'c_invoice' || po.table === 'c_order' || po.table === 'c_payment')) {            // po instanceof DocAction
          var r = ML.processIt(trx, po.table, po.id, self.p_DocAction);
          if (!r.ok) throw new Error('PO Process Failed: ' + po.table + '#' + po.id + ' - ' + (r.msg || r.status));                     // IllegalStateException
        }
        msg = A.Msg.parseTranslation(self.getCtx(), msg);
        self.addBufferLog(po.id, currdate, null, msg, ML.tableIdOf(trx, po.table), po.id);
      });
      return '@OK@';
    };
    return RecurringRun;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

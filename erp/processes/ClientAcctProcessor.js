// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ClientAcctProcessor.js - org.adempiere.process.ClientAcctProcessor (AD_Process 53187 "Tenant Accounting Processor" / Client_Acct_Processor), verbatim
// (org.adempiere.base.process/src/org/adempiere/process/ClientAcctProcessor.java, 252 lines). bim-compiler prompts/TEAMWORK_FRAMEWORK.md section 40.1 (owner: "End of day the books are posted for
// reporting.") / section 41 row F1 - Witness: W-ACCT-PROCESSOR (erp/tests/witness_acct_processor.js, section-ACCTP lines).
// WHAT RUNS (doIt :99-120, postSession :126-239): MClient.isClientAccounting() must be true (CLIENT_ACCOUNTING 'I' or 'Q', else AdempiereUserError "ClientAccountingNotEnabled"); the accounting schemas =
//   the parameter C_AcctSchema_ID or all of the client's; then, for every table that has a Posted column (DocManager.getDocumentsTableID = AD_Table x AD_Column 'Posted', IsView='N', ORDER BY AD_Table_ID;
//   optionally only the AD_Table_ID parameter), the documents  AD_Client_ID=? AND ProcessedOn... AND Processed='Y' AND Posted IN ('N','d') AND IsActive='Y' ORDER BY Created  are posted
//   (DocManager.postDocument(schemas, table, row, force=false, repost=false)) in ProcessedOn order (a first pass collects the distinct ProcessedOn values older than now-2 s; 0 = NULL or 0 comes first),
//   each in ITS OWN transaction (an error in one document never stops the others); the answer log is "<Table>=<n>[(Errors=<e>)] - ..." and the return is "@OK@"; then MCost.create(client).
// TWIN DECISIONS (named): (a) "its own transaction" = a Trx savepoint around each document: a posting that throws or fails is rolled back to it and counted in Errors, the others stay (the same effect the
//   per-document commit has). (b) "now" = the recorded clock trx.env.nowMillis (SELECT CURRENT_TIMESTAMP FROM DUAL); without a recorded clock the wall clock is used and printed (section-ACCTP-CLOCK).
//   (c) DocManager.postDocument returns an error String; the twin's poster returns true/false and writes Posted itself, so a document counts as posted when it ends Posted 'Y' (or 'd' = deferred, not an error).
//   (d) The documents are read with a raw SELECT (committed rows): one run of this process posts each document once, so the run's own pending writes never matter.
//   (e) A table in the dictionary with the Posted column and NO physical table in this DB: legacy's SELECT fails and is logged SEVERE, the loop goes on (:156-159, :213-215) - the same here (section-ACCTP-SQL-ERROR).
// NOT PORTED, NAMED: MCost.create(MClient) (MCost.java:713-766) -> MCost.getCurrentCost (create non-zero costs) is not ported; the products it would visit (those with an unprocessed M_CostDetail) are counted and
//   printed (section-ACCTP-UNPORTED-DEP) - the posting above does not depend on it.
(function (global) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var P = NODE ? require('../ad_process.js') : global.AdProcess;
  var ML = NODE ? require('../model_layer') : global.ModelLayer;
  function nz(v) { return v == null || v === '' ? 0 : Number(v); }

  if (P && P.defineProcess) P.defineProcess('org.adempiere.process.ClientAcctProcessor', function (SvrProcess, X) {
    function ClientAcctProcessor() { SvrProcess.call(this); this.p_C_AcctSchema_ID = 0; this.p_AD_Table_ID = 0; this.m_summary = ''; }
    ClientAcctProcessor.prototype = Object.create(SvrProcess.prototype);

    ClientAcctProcessor.prototype.prepare = function () {                                                                             // :70-85
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'C_AcctSchema_ID') this.p_C_AcctSchema_ID = para[i].getParameterAsInt();
        else if (name === 'AD_Table_ID') this.p_AD_Table_ID = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ClientAcctProcessor ' + name);                                                       // MProcessPara.validateUnknownParameter
      }
    };

    ClientAcctProcessor.prototype.doIt = function () {                                                                                // :92-120
      var trx = this.get_TrxName(), A = X.A;
      trx.say('§PROC-INFO ClientAcctProcessor C_AcctSchema_ID=' + this.p_C_AcctSchema_ID + ', AD_Table_ID=' + this.p_AD_Table_ID);
      var ca = ML.clientAccounting(trx);
      trx.say('§ACCTP CLIENT_ACCOUNTING=' + ca.mode + ' source=' + ca.source);
      if (!(ca.mode === 'I' || ca.mode === 'Q')) throw new Error(A.Msg.parseTranslation(this.getCtx(), '@ClientAccountingNotEnabled@'));   // MClient.isClientAccounting() -> AdempiereUserError
      this.postSession(trx);
      this.costCreate(trx);
      this.addLog(this.m_summary);
      return '@OK@';
    };

    ClientAcctProcessor.prototype.postSession = function (trx) {                                                                      // :126-239
      var self = this, client = this.getAD_Client_ID(), post = trx.env.postImmediate && typeof trx.env.postImmediate === 'function' ? trx.env.postImmediate : null;
      var poster = post || ML.getPoster();
      if (!poster) throw new Error('ClientAcctProcessor: no document poster is registered in this host (model_post.js not loaded)');
      var nowMs = trx.env.nowMillis;
      if (nowMs == null) { nowMs = new Date().getTime(); trx.say('§ACCTP-CLOCK source=wall-clock (no recorded clock in env.nowMillis)'); }
      var value = nowMs - 2000;                                                                                                       // go back 2 seconds to be safe
      var tabs = trx.q("SELECT t.ad_table_id AS id, t.tablename AS name FROM ad_table t, ad_column c WHERE t.ad_table_id=c.ad_table_id AND c.columnname='Posted' AND t.isview='N' ORDER BY t.ad_table_id");   // DocManager.fillDocumentsTableArrays
      var errSeen = {}, processedOns = [0];                                                                                                         // to include potential null values
      tabs.forEach(function (tb) {                                                                                                    // first pass: collect all ProcessedOn
        if (self.p_AD_Table_ID !== 0 && self.p_AD_Table_ID !== Number(tb.id)) return;
        try {
          trx.q('SELECT DISTINCT processedon AS p FROM ' + tb.name + " WHERE ad_client_id=? AND processedon<? AND processed='Y' AND posted IN ('N','d') AND isactive='Y'", [client, value]).forEach(function (r) {
            var p = Number(r.p); if (r.p != null && processedOns.indexOf(p) < 0) processedOns.push(p);
          });
        } catch (e) { sqlErr(tb, e); }                                                                                                // log.log(SEVERE, sql, e)
      });
      var count = {}, countError = {};
      function sqlErr(tb, e) { if (errSeen[tb.name]) return; errSeen[tb.name] = 1; trx.say('§ACCTP-SQL-ERROR ' + tb.name + ': ' + (e && e.message) + ' (reported once per table per run; the loop goes on, as legacy logs SEVERE and continues)'); }
      tabs.forEach(function (tb) { count[tb.name] = 0; countError[tb.name] = 0; });
      processedOns.sort(function (a, b) { return a - b; });
      processedOns.forEach(function (processedOn) {
        tabs.forEach(function (tb) {
          if (self.p_AD_Table_ID !== 0 && self.p_AD_Table_ID !== Number(tb.id)) return;
          var sql = 'SELECT * FROM ' + tb.name + ' WHERE ad_client_id=? AND (processedon' + (processedOn !== 0 ? '=?' : ' IS NULL OR processedon=0') + ") AND processed='Y' AND posted IN ('N','d') AND isactive='Y' ORDER BY created", rows;
          try { rows = trx.q(sql, processedOn !== 0 ? [client, processedOn] : [client]); }
          catch (e) { sqlErr(tb, e); return; }
          var table = String(tb.name).toLowerCase(), key = table + '_id';
          rows.forEach(function (row) {
            count[tb.name]++;
            var ok = true, sp = trx.setSavepoint();                                                                                  // twin decision (a): the document's own transaction
            try {
              var ret = poster(trx, table, row, { repost: false });                                                                   // DocManager.postDocument(m_ass, table, rs, false, false, trx)
              var after = trx.get(table, row[key]);
              ok = ret === true || !!(after && after.posted === 'd');                                                                // twin decision (c); a posting ERROR keeps its Posted='E' + AD_Note (innerTrx.commit() runs in legacy's finally)
            } catch (e) { trx.say('§ACCTP-SEVERE ' + self.getName() + ': ' + tb.name + ' ' + (row[key]) + ' ' + (e && e.message)); ok = false; try { trx.rollbackTo(sp); } catch (e2) { /* savepoint already gone */ } }
            if (!ok) countError[tb.name]++;
            trx.say('§ACCTP post table=' + table + ' id=' + row[key] + ' processedOn=' + processedOn + ' ok=' + ok);
          });
        });
      });
      tabs.forEach(function (tb) {                                                                                                    // :218-238 the summary
        if (count[tb.name] > 0) { self.m_summary += tb.name + '=' + count[tb.name] + (countError[tb.name] > 0 ? '(Errors=' + countError[tb.name] + ')' : '') + ' - '; }
      });
      trx.say('§ACCTP summary ' + (self.m_summary || '(no work)'));
    };

    // MCost.create(MClient) :713-766 - the SELECT is ported, MCost.getCurrentCost is NOT (named)
    ClientAcctProcessor.prototype.costCreate = function (trx) {
      var n = 0;
      try { n = trx.q("SELECT COUNT(*) AS n FROM m_product p WHERE ad_client_id=? AND EXISTS (SELECT * FROM m_costdetail cd WHERE p.m_product_id=cd.m_product_id AND processed='N')", [this.getAD_Client_ID()])[0].n; }
      catch (e) { trx.say('§ACCTP-SQL-ERROR MCost.create: ' + (e && e.message)); return; }                                              // s_log.log(SEVERE, sql, e)
      if (n > 0) trx.say('§ACCTP-UNPORTED-DEP MCost.create(MClient): MCost.getCurrentCost (MCost.java:743) not ported - ' + n + ' product(s) with unprocessed cost details would be visited');
    };
    return ClientAcctProcessor;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ImportGLJournal.js - org.compiere.process.ImportGLJournal, verbatim (org.adempiere.base.process/src/org/compiere/process/ImportGLJournal.java, 847 lines; AD_Process 220 Import_GLJournal, table I_GLJournal = AD_Table 599).
// bim-compiler prompts/MIGRATE_INSTALL_TENANT.md section ENGINE-SPEC (E3a, "Opening journal" row of section 3) - Witness: W-IMPORT-GLJOURNAL (erp/tests/witness_import_gljournal.js). Pattern: processes/ImportInventory.js (working copies of the rows, one JS step per Java statement).
// Steps in legacy order: (1) the SQL phase :106-575 (every DB.executeUpdateEx run on in-memory working copies of the I_GLJournal rows: same WHERE with SQL three-valued logic and AND/OR precedence AS WRITTEN, same SET, the Java
//   subselects run through trx.q with the row's values as parameters; a subselect that returns more than one row fails the statement as PostgreSQL does - printed as the shipped log line PROC-SQL-ERROR, no row of that statement changes),
//   (2) the balance answer logs :577-614 and the Errors refusal :616-637, (3) the journal loop :649-832 (ONE MJournalBatch per Batch DocumentNo, ONE MJournal per journal break, ONE MJournalLine per row, the account found or created by
//   MAccount.get), (4) the closing "not imported" reset and the answer logs :834-844.
// NAMED twin decisions (nothing of ImportGLJournal.java is skipped; each choice prints a PROC-PARAM or IMPORT_GLJOURNAL_ line):
//   (a) a parameter the caller did not send reaches the process as NULL (prepare skips it :69-70, the Java field default stays). AD_Client_ID takes the session client (the dialog always sends it; Java would use 0 and match no row),
//       DeleteOldImported / IsValidateOnly / IsImportOnlyNoErrors take their AD_Process_Para default (N / N / Y) - printed.
//   (b) MJournalBatch.beforeSave sets DateDoc to today when both dates are null (MJournalBatch.java:948-955); the batch the loop creates carries neither, so the twin sets DateDoc AND DateAcct from the session date on the new batch (the clock arm
//       of the generated initial defaults has no entry for GL_JournalBatch, the batch hook of ad_modelval.js answers PeriodNotFound for two null dates, and the dateAcct it derives from DateDoc is not written to the row - all three measured).
//       The batch's DateAcct is therefore the SESSION day, not the journal's: completing the batch needs that day's GLJ period open, as in legacy.
//   (c) MJournal.beforeSave / MJournalLine.beforeSave / afterSave (period, line number, dimensions, accounted amounts, journal and batch totals) are the ONE port in model_trade.js (_jBeforeSave, _jlBeforeSave, _updateJournalTotal,
//       _jUpdateBatch), called around the PO save the way model_trade.js MJournal_copyLinesFrom does; the journal DocAction (Prepare/Complete) is model_journal.js (it did not exist in the twin before this port).
//   (d) PROC-UNPORTED commitEx(): Java commits the I_ErrorMsg marks (:616) BEFORE it refuses the run with "@Errors@=n" (:624, IsValidateOnly or IsImportOnlyNoErrors), so the marked rows stay visible after the failure. SvrProcess.commitEx is a
//       no-op in the twin's one-Trx host and a process that throws commits nothing: the refusal is raised exactly as Java, but the marks of THAT refused run are not persisted. Printed as PROC-UNPORTED when it happens.
//   (e) the batch description's "*Import-<Timestamp>" uses the recorded clock (env.now / env.nowMillis), formatted as java.sql.Timestamp.toString.
//   (f) MEASURED gap of the seed, not of this port: C_Activity has no physical table in erp/ad_seed.db (same as ImportPayment.js (f)): the ActivityValue lookup fails as a statement (PROC-SQL-ERROR) and an ActivityValue row ends
//       'ERR=Invalid Activity,' - the text legacy writes for an unknown value.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  var MT = (typeof module !== 'undefined' && module.exports) ? require('../model_trade') : global.ModelTrade;       // MAccount.get + the MJournal / MJournalLine hooks live in model_trade.js
  P.defineProcess('org.compiere.process.ImportGLJournal', function (SvrProcess, X) {
    function ML() { return X.ML; }
    function nz(v) { return v == null || v === '' ? 0 : Number(v); }
    function ne(a, b) { return a != null && b != null && String(a) !== String(b); }                       // SQL a<>b : NULL is unknown
    function eq(a, b) { return a != null && b != null && String(a) === String(b); }
    function cat(v, s) { return v == null ? null : String(v) + s; }                                       // SQL v||s : NULL||x is NULL
    function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b) && (a == null) === (b == null); }
    function none(v) { return v == null || Number(v) === 0; }                                             // (X IS NULL OR X=0)
    function day(v) { return v == null ? null : String(v).slice(0, 10); }                                 // TRUNC(DateAcct) / TimeUtil.getDay

    function ImportGLJournal() {
      SvrProcess.call(this);
      this.m_AD_Client_ID = 0; this.m_AD_Org_ID = 0; this.m_C_AcctSchema_ID = 0; this.m_DateAcct = null;
      this.m_DeleteOldImported = false; this.m_IsValidateOnly = false; this.m_IsImportOnlyNoErrors = true;       // :44-59
    }
    ImportGLJournal.prototype = Object.create(SvrProcess.prototype);

    // -- prepare :65-91 ---------------------------------------------------------------------------------------------
    ImportGLJournal.prototype.prepare = function () {
      var trx = this.get_TrxName(), para = this.getParameter(), pid = this.getProcessInfo().AD_Process_ID || 220, seen = {};
      function dflt(name) { var r = trx.q('SELECT defaultvalue AS d FROM ad_process_para WHERE ad_process_id=? AND columnname=? AND isactive=?', [pid, name, 'Y'])[0]; return r && r.d != null && r.d !== '' ? r.d : null; }
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName(), pv = para[i].getParameter();
        if (pv == null) continue;                                                                                   // :70 getParameter() == null : nothing
        seen[name] = 1;
        if (name === 'AD_Client_ID') this.m_AD_Client_ID = para[i].getParameterAsInt();                              // :73-74
        else if (name === 'AD_Org_ID') this.m_AD_Org_ID = para[i].getParameterAsInt();                              // :75-76
        else if (name === 'C_AcctSchema_ID') this.m_C_AcctSchema_ID = para[i].getParameterAsInt();                  // :77-78
        else if (name === 'DateAcct') this.m_DateAcct = String(pv).slice(0, 10);                                    // :79-80
        else if (name === 'IsValidateOnly') this.m_IsValidateOnly = 'Y' === pv;                                     // :81-82
        else if (name === 'IsImportOnlyNoErrors') this.m_IsImportOnlyNoErrors = 'Y' === pv;                        // :83-84
        else if (name === 'DeleteOldImported') this.m_DeleteOldImported = 'Y' === pv;                               // :85-86
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ImportGLJournal ' + name);                                           // MProcessPara.validateUnknownParameter :88
      }
      if (!seen.AD_Client_ID) { this.m_AD_Client_ID = Number(this.getAD_Client_ID()); trx.say('§PROC-PARAM ImportGLJournal AD_Client_ID=' + this.m_AD_Client_ID + ' source=session client (not sent)'); }
      ['DeleteOldImported', 'IsValidateOnly', 'IsImportOnlyNoErrors'].forEach(function (n) {
        if (seen[n]) return; var d = dflt(n); if (d == null) return;
        if (n === 'DeleteOldImported') this.m_DeleteOldImported = 'Y' === d; else if (n === 'IsValidateOnly') this.m_IsValidateOnly = 'Y' === d; else this.m_IsImportOnlyNoErrors = 'Y' === d;
        trx.say('§PROC-PARAM ImportGLJournal ' + n + '=' + d + ' source=AD_Process_Para default');
      }, this);
    };

    // -- doIt :98-845 ---------------------------------------------------------------------------------------------------
    ImportGLJournal.prototype.doIt = function () {
      var self = this, trx = this.get_TrxName(), A = X.A, C = this.m_AD_Client_ID, O = this.m_AD_Org_ID, ctx = this.getCtx();
      try { trx.q('SELECT 1 AS x FROM i_gljournal LIMIT 1'); } catch (e) { throw new Error('I_GLJournal has no physical table on this host (AdImportTables.ensure, MIGRATE_INSTALL_TENANT ENGINE-SPEC E3a)'); }
      trx.say('§IMPORT_GLJOURNAL_START IsValidateOnly=' + this.m_IsValidateOnly + ', IsImportOnlyNoErrors=' + this.m_IsImportOnlyNoErrors);   // :100-101
      var nowTs = A.Env.nowStamp(trx.env);
      var R = [];
      function load() { R = trx.find('i_gljournal', {}).map(function (r) { return { id: r.i_gljournal_id, base: Object.assign({}, r), cur: Object.assign({}, r) }; }); }
      function flush() { R.forEach(function (w) { var ch = {}; Object.keys(w.cur).forEach(function (c) { if (!same(w.cur[c], w.base[c])) ch[c] = w.cur[c]; }); if (!Object.keys(ch).length) return; trx.update('i_gljournal', trx.get('i_gljournal', w.id), ch); w.base = Object.assign({}, trx.get('i_gljournal', w.id)); }); }
      function cc(r) { return eq(r.ad_client_id, C); }                                                          // clientCheck :103 " AND AD_Client_ID=<m_AD_Client_ID>"
      function notY(r) { return ne(r.i_isimported, 'Y'); }                                                      // I_IsImported<>'Y'
      function step(label, where, set) {
        var ups = [];
        try { R.forEach(function (w) { if (where(w.cur)) ups.push([w, set(w.cur)]); }); }
        catch (e) { trx.say('§PROC-SQL-ERROR executeUpdate -> -1: ' + ((e && e.message) || e) + ' :: ImportGLJournal ' + label); return -1; }
        ups.forEach(function (u) { Object.keys(u[1]).forEach(function (c) { u[0].cur[c] = u[1][c]; }); });
        trx.say('§IMPORT_GLJOURNAL_STEP ' + label + '=' + ups.length);                                             // log.fine("..." + no)
        return ups.length;
      }
      function err(label, text, where) {                                                                         // SET I_IsImported='E', I_ErrorMsg=I_ErrorMsg||'<text>' WHERE <where> (the caller writes the full WHERE, precedence as Java)
        var no = step(label, where, function (r) { return { i_isimported: 'E', i_errormsg: cat(r.i_errormsg, text) }; });
        if (no !== 0) trx.say('§IMPORT_GLJOURNAL_WARN ' + label + '=' + no + ' (log.warning)');
        return no;
      }
      function warn(label, text, where) {                                                                        // SET I_ErrorMsg=I_ErrorMsg||'WARN=...' only
        var no = step(label, where, function (r) { return { i_errormsg: cat(r.i_errormsg, text) }; });
        if (no !== 0) trx.say('§IMPORT_GLJOURNAL_WARN ' + label + '=' + no + ' (log.warning)');
        return no;
      }
      function scalar(sql, params) { var rs = trx.q(sql, params.map(function (v) { return v === undefined ? null : v; })); if (rs.length > 1) throw new Error('more than one row returned by a subquery used as an expression'); return rs.length ? rs[0][Object.keys(rs[0])[0]] : null; }
      var no;

      //	****	Prepare	****
      load();
      if (this.m_DeleteOldImported) {                                                                            // :108-115 DELETE FROM I_GLJournal WHERE I_IsImported='Y' AND client
        var del = R.filter(function (w) { return eq(w.cur.i_isimported, 'Y') && cc(w.cur); });
        del.forEach(function (w) { trx.del('i_gljournal', trx.get('i_gljournal', w.id)); }); R = R.filter(function (w) { return del.indexOf(w) < 0; });
        trx.say('§IMPORT_GLJOURNAL_DELETE_OLD ' + del.length);
      }
      no = step('Reset', function (r) { return ne(r.i_isimported, 'Y') || r.i_isimported == null; }, function (r) {   // :117-129 Set IsActive, Created/Updated
        return { isactive: r.isactive != null ? r.isactive : 'Y', created: r.created != null ? r.created : nowTs, createdby: r.createdby != null ? r.createdby : 0,
          updated: r.updated != null ? r.updated : nowTs, updatedby: r.updatedby != null ? r.updatedby : 0, i_errormsg: ' ', i_isimported: 'N' }; });
      trx.say('§IMPORT_GLJOURNAL_RESET ' + no);

      step('Set Client from Value', function (r) { return none(r.ad_client_id) && r.clientvalue != null && notY(r); }, function (r) {   // :130-137
        return { ad_client_id: scalar('SELECT c.ad_client_id FROM ad_client c WHERE c.value=?', [r.clientvalue]) }; });
      var md = this.m_DateAcct, as0 = this.m_C_AcctSchema_ID;
      step('Client/DocOrg/Default', function (r) { return notY(r) || r.i_isimported == null; }, function (r) {       // :138-150 Set Default Client, Doc Org, AcctSchema, DatAcct
        var ch = { ad_client_id: r.ad_client_id != null ? r.ad_client_id : C, ad_orgdoc_id: r.ad_orgdoc_id != null ? r.ad_orgdoc_id : O };
        if (as0 !== 0) ch.c_acctschema_id = r.c_acctschema_id != null ? r.c_acctschema_id : as0;
        if (md != null) ch.dateacct = r.dateacct != null ? r.dateacct : md + ' 00:00:00';
        ch.updated = r.updated != null ? r.updated : nowTs; return ch; });

      err('Invalid Doc Org', 'ERR=Invalid Doc Org, ', function (r) {                                              // :151-160
        return (none(r.ad_orgdoc_id) || trx.q("SELECT 1 AS x FROM ad_org oo WHERE oo.ad_org_id=? AND (oo.issummary='Y' OR oo.isactive='N')", [r.ad_orgdoc_id]).length > 0) && notY(r) && cc(r); });

      step('Set AcctSchema from Name', function (r) { return r.c_acctschema_id == null && r.acctschemaname != null && notY(r) && cc(r); }, function (r) {   // :161-168
        return { c_acctschema_id: scalar('SELECT a.c_acctschema_id FROM c_acctschema a WHERE ?=a.name AND ?=a.ad_client_id', [r.acctschemaname, r.ad_client_id]) }; });
      step('Set AcctSchema from Client', function (r) { return r.c_acctschema_id == null && r.acctschemaname == null && notY(r) && cc(r); }, function (r) {   // :169-174
        return { c_acctschema_id: scalar('SELECT c.c_acctschema1_id FROM ad_clientinfo c WHERE c.ad_client_id=?', [r.ad_client_id]) }; });
      err('Invalid AcctSchema', 'ERR=Invalid AcctSchema, ', function (r) {                                        // :175-184
        return (none(r.c_acctschema_id) || trx.q('SELECT 1 AS x FROM c_acctschema a WHERE ?=a.ad_client_id', [r.ad_client_id]).length === 0) && notY(r) && cc(r); });

      step('Set DateAcct', function (r) { return r.dateacct == null && notY(r) && cc(r); }, function () { return { dateacct: nowTs }; });   // :185-192 DateAcct=getDate()

      step('Set DocType', function (r) { return r.c_doctype_id == null && r.doctypename != null && notY(r) && cc(r); }, function (r) {   // :193-200
        return { c_doctype_id: scalar("SELECT d.c_doctype_id FROM c_doctype d WHERE d.name=? AND d.docbasetype='GLJ' AND ?=d.ad_client_id", [r.doctypename, r.ad_client_id]) }; });
      err('Invalid DocType', 'ERR=Invalid DocType, ', function (r) {                                              // :201-209
        return (none(r.c_doctype_id) || trx.q("SELECT 1 AS x FROM c_doctype d WHERE ?=d.ad_client_id AND d.docbasetype='GLJ'", [r.ad_client_id]).length === 0) && notY(r) && cc(r); });

      step('Set GL Category', function (r) { return r.gl_category_id == null && r.categoryname != null && notY(r) && cc(r); }, function (r) {   // :210-217
        return { gl_category_id: scalar('SELECT c.gl_category_id FROM gl_category c WHERE c.name=? AND ?=c.ad_client_id', [r.categoryname, r.ad_client_id]) }; });
      err('Invalid Category', 'ERR=Invalid Category, ', function (r) { return none(r.gl_category_id) && notY(r) && cc(r); });   // :218-225

      step('Set Currency from ISO', function (r) { return r.c_currency_id == null && r.iso_code != null && notY(r) && cc(r); }, function (r) {   // :226-233
        return { c_currency_id: scalar('SELECT c.c_currency_id FROM c_currency c WHERE c.iso_code=? AND c.ad_client_id IN (0,?)', [r.iso_code, r.ad_client_id]) }; });
      step('Set Default Currency', function (r) { return r.c_currency_id == null && r.iso_code == null && notY(r) && cc(r); }, function (r) {   // :234-240
        return { c_currency_id: scalar('SELECT a.c_currency_id FROM c_acctschema a WHERE a.c_acctschema_id=? AND a.ad_client_id=?', [r.c_acctschema_id, r.ad_client_id]) }; });
      err('Invalid Currency', 'ERR=Invalid Currency, ', function (r) { return none(r.c_currency_id) && notY(r) && cc(r); });   // :241-248

      step('Set CurrencyType Value to Spot', function (r) { return r.c_conversiontype_id == null && r.conversiontypevalue == null && eq(r.i_isimported, 'N') && cc(r); }, function () { return { conversiontypevalue: 'S' }; });   // :249-255
      step('Set CurrencyType from Value', function (r) { return r.c_conversiontype_id == null && r.conversiontypevalue != null && notY(r) && cc(r); }, function (r) {   // :256-262
        return { c_conversiontype_id: scalar('SELECT c.c_conversiontype_id FROM c_conversiontype c WHERE c.value=? AND c.ad_client_id IN (0,?)', [r.conversiontypevalue, r.ad_client_id]) }; });
      err('Invalid CurrencyType', 'ERR=Invalid CurrencyType, ', function (r) { return none(r.c_conversiontype_id) && r.conversiontypevalue != null && notY(r) && cc(r); });   // :263-271
      err('No ConversionType', 'ERR=No ConversionType, ', function (r) { return none(r.c_conversiontype_id) && notY(r) && cc(r); });   // :272-279

      step('Set Home CurrencyRate', function (r) {                                                                // :280-287
        return trx.q('SELECT 1 AS x FROM c_acctschema a WHERE a.c_acctschema_id=? AND a.c_currency_id=?', [r.c_acctschema_id, r.c_currency_id]).length > 0 && r.c_currency_id != null && notY(r) && cc(r); }, function () { return { currencyrate: 1 }; });
      function rateWhere(r) { return r.currencyrate == null || (Number(r.currencyrate) === 0 && ML().idSet(r.c_currency_id) && notY(r) && cc(r)); }   // "CurrencyRate IS NULL OR CurrencyRate=0 AND C_Currency_ID>0 AND I_IsImported<>'Y' AND client" - AND binds tighter than OR
      step('Set Org Rate', rateWhere, function (r) {                                                              // :288-300
        return { currencyrate: scalar('SELECT MAX(r.multiplyrate) FROM c_conversion_rate r, c_acctschema s WHERE s.c_acctschema_id=? AND s.ad_client_id=? AND r.c_currency_id=? AND r.c_currency_id_to=s.c_currency_id AND r.ad_client_id=? AND r.ad_org_id=? AND r.c_conversiontype_id=? AND datetime(?) BETWEEN datetime(r.validfrom) AND datetime(r.validto)',
          [r.c_acctschema_id, r.ad_client_id, r.c_currency_id, r.ad_client_id, r.ad_orgdoc_id, r.c_conversiontype_id, r.dateacct]) }; });
      step('Set Client Rate', rateWhere, function (r) {                                                           // :301-320
        return { currencyrate: scalar('SELECT MAX(r.multiplyrate) FROM c_conversion_rate r, c_acctschema s WHERE s.c_acctschema_id=? AND s.ad_client_id=? AND r.c_currency_id=? AND r.c_currency_id_to=s.c_currency_id AND r.ad_client_id=? AND r.c_conversiontype_id=? AND datetime(?) BETWEEN datetime(r.validfrom) AND datetime(r.validto)',
          [r.c_acctschema_id, r.ad_client_id, r.c_currency_id, r.ad_client_id, r.c_conversiontype_id, r.dateacct]) }; });
      err('No Rate', 'ERR=No Rate, ', function (r) { return r.currencyrate == null || (Number(r.currencyrate) === 0 && notY(r) && cc(r)); });   // :313-320 "CurrencyRate IS NULL OR CurrencyRate=0 AND ..."

      var PSEL = " FROM c_period p INNER JOIN c_year y ON (y.c_year_id=p.c_year_id) INNER JOIN ad_clientinfo c ON (c.c_calendar_id=y.c_calendar_id) WHERE c.ad_client_id=? AND datetime(?) BETWEEN datetime(p.startdate) AND datetime(p.enddate) AND p.isactive='Y' AND p.periodtype='S'";   // globalqss Bug 1577712 Financial Period
      step('Set Period', function (r) { return r.c_period_id == null && notY(r) && cc(r); }, function (r) {         // :321-332
        return { c_period_id: scalar('SELECT MAX(p.c_period_id) AS pid' + PSEL, [r.ad_client_id, r.dateacct]) }; });
      err('Invalid Period', 'ERR=Invalid Period, ', function (r) {                                                // :333-345 "C_Period_ID IS NULL OR C_Period_ID NOT IN (...) AND ..." - AND binds tighter than OR
        return r.c_period_id == null || (trx.q('SELECT p.c_period_id AS pid' + PSEL, [r.ad_client_id, r.dateacct]).every(function (p) { return String(p.pid) !== String(r.c_period_id); }) && notY(r) && cc(r)); });
      warn('Period Closed', 'WARN=Period Closed, ', function (r) {                                                // :346-354
        return r.c_period_id != null && trx.q("SELECT 1 AS x FROM c_periodcontrol pc WHERE pc.c_period_id=? AND pc.docbasetype='GLJ' AND pc.periodstatus='O'", [r.c_period_id]).length === 0 && notY(r) && cc(r); });

      step('Set Actual PostingType', function (r) { return r.postingtype == null && notY(r) && cc(r); }, function () { return { postingtype: 'A' }; });   // :355-360
      err('Invalid PostingType', 'ERR=Invalid PostingType, ', function (r) {                                      // :361-369 "PostingType IS NULL OR NOT EXISTS (...) AND ..."
        return r.postingtype == null || (trx.q('SELECT 1 AS x FROM ad_ref_list r WHERE r.ad_reference_id=125 AND r.value=?', [r.postingtype]).length === 0 && notY(r) && cc(r)); });

      //	** Account Elements (optional) **  (C_ValidCombination_ID IS NULL OR C_ValidCombination_ID=0)
      function noVC(r) { return none(r.c_validcombination_id); }
      step('Set Org from Value', function (r) { return none(r.ad_org_id) && r.orgvalue != null && noVC(r) && notY(r); }, function (r) {   // :374-381 (no client check, as Java)
        var v = scalar("SELECT o.ad_org_id FROM ad_org o WHERE o.value=? AND o.issummary='N' AND ?=o.ad_client_id", [r.orgvalue, r.ad_client_id]); return { ad_org_id: v != null ? v : r.ad_org_id }; });
      step('Set Org from Doc Org', function (r) { return none(r.ad_org_id) && r.orgvalue == null && r.ad_orgdoc_id != null && Number(r.ad_orgdoc_id) !== 0 && noVC(r) && notY(r) && cc(r); }, function (r) { return { ad_org_id: r.ad_orgdoc_id }; });   // :382-387
      err('Invalid Org', 'ERR=Invalid Org, ', function (r) {                                                      // :388-397
        return (none(r.ad_org_id) || trx.q("SELECT 1 AS x FROM ad_org oo WHERE oo.ad_org_id=? AND (oo.issummary='Y' OR oo.isactive='N')", [r.ad_org_id]).length > 0) && noVC(r) && notY(r) && cc(r); });

      step('Set Account from Value', function (r) { return r.account_id == null && r.accountvalue != null && noVC(r) && notY(r) && cc(r); }, function (r) {   // :398-408
        return { account_id: scalar("SELECT MAX(ev.c_elementvalue_id) FROM c_elementvalue ev INNER JOIN c_element e ON (e.c_element_id=ev.c_element_id) INNER JOIN c_acctschema_element ase ON (e.c_element_id=ase.c_element_id AND ase.elementtype='AC') WHERE ev.value=? AND ev.issummary='N' AND ?=ase.c_acctschema_id AND ?=ev.ad_client_id",
          [r.accountvalue, r.c_acctschema_id, r.ad_client_id]) }; });
      err('Invalid Account', 'ERR=Invalid Account, ', function (r) { return none(r.account_id) && noVC(r) && notY(r) && cc(r); });   // :409-416

      // the six dimension lookups share one shape: SET <id>=(SELECT ... WHERE <value>=i.<Value> AND IsSummary='N' AND client) WHERE <id> IS NULL AND <Value> IS NOT NULL AND (VC) AND I_IsImported<>'Y' AND client / the matching ERR statement
      function dim(label, line, errLine, idCol, valCol, sql, errText) {
        step('Set ' + label + ' from Value', function (r) { return r[idCol] == null && r[valCol] != null && noVC(r) && notY(r) && cc(r); }, function (r) { var o = {}; o[idCol] = scalar(sql, [r[valCol], r.ad_client_id]); return o; });   // :line
        err('Invalid ' + label, errText, function (r) { return r[idCol] == null && r[valCol] != null && noVC(r) && notY(r) && cc(r); });                                                                               // :errLine
      }
      dim('BPartner', 418, 425, 'c_bpartner_id', 'bpartnervalue', "SELECT bp.c_bpartner_id FROM c_bpartner bp WHERE bp.value=? AND bp.issummary='N' AND ?=bp.ad_client_id", 'ERR=Invalid BPartner, ');   // :418-432
      step('Set Product from Value', function (r) { return r.m_product_id == null && (r.productvalue != null || r.upc != null || r.sku != null) && noVC(r) && notY(r) && cc(r); }, function (r) {   // :433-441
        return { m_product_id: scalar("SELECT MAX(p.m_product_id) FROM m_product p WHERE (p.value=? OR p.upc=? OR p.sku=?) AND p.issummary='N' AND ?=p.ad_client_id", [r.productvalue, r.upc, r.sku, r.ad_client_id]) }; });
      err('Invalid Product', 'ERR=Invalid Product, ', function (r) { return r.m_product_id == null && (r.productvalue != null || r.upc != null || r.sku != null) && noVC(r) && notY(r) && cc(r); });   // :442-449
      dim('Project', 451, 458, 'c_project_id', 'projectvalue', "SELECT p.c_project_id FROM c_project p WHERE p.value=? AND p.issummary='N' AND ?=p.ad_client_id", 'ERR=Invalid Project, ');   // :450-465
      dim('Campaign', 468, 475, 'c_campaign_id', 'campaignvalue', "SELECT p.c_campaign_id FROM c_campaign p WHERE p.value=? AND p.issummary='N' AND ?=p.ad_client_id", 'ERR=Invalid Campaign, ');   // :466-482 IDEMPIERE-539
      dim('Activity', 484, 491, 'c_activity_id', 'activityvalue', "SELECT p.c_activity_id FROM c_activity p WHERE p.value=? AND p.issummary='N' AND ?=p.ad_client_id", 'ERR=Invalid Activity, ');   // :483-498
      dim('SalesRegion', 500, 507, 'c_salesregion_id', 'salesregionvalue', "SELECT p.c_salesregion_id FROM c_salesregion p WHERE p.value=? AND p.issummary='N' AND ?=p.ad_client_id", 'ERR=Invalid SalesRegion, ');   // :499-514
      dim('OrgTrx', 517, 524, 'ad_orgtrx_id', 'orgtrxvalue', "SELECT o.ad_org_id FROM ad_org o WHERE o.value=? AND o.issummary='N' AND ?=o.ad_client_id", 'ERR=Invalid OrgTrx, ');   // :516-531

      //	Source Amounts
      step('Set 0 Source Dr', function (r) { return r.amtsourcedr == null && notY(r) && cc(r); }, function () { return { amtsourcedr: 0 }; });   // :533-539
      step('Set 0 Source Cr', function (r) { return r.amtsourcecr == null && notY(r) && cc(r); }, function () { return { amtsourcecr: 0 }; });   // :540-545
      warn('Zero Source Balance', 'WARN=Zero Source Balance, ', function (r) { return r.amtsourcedr != null && r.amtsourcecr != null && (Number(r.amtsourcedr) - Number(r.amtsourcecr)) === 0 && notY(r) && cc(r); });   // :546-553
      //	Accounted Amounts (Only if No Error)
      function round2(a, b) { var v = A.toBD(String(a)).multiply(A.toBD(String(b))).setScale(2, A.RoundingMode.HALF_UP); return Number(v.toString()); }   // ROUND(x, 2) HARDCODED rounding :556
      step('Calculate Acct Dr', function (r) { return r.amtacctdr == null || (Number(r.amtacctdr) === 0 && eq(r.i_isimported, 'N') && cc(r)); }, function (r) {   // :555-560 "AmtAcctDr IS NULL OR AmtAcctDr=0 AND I_IsImported='N' AND client"
        return { amtacctdr: r.amtsourcedr == null || r.currencyrate == null ? null : round2(r.amtsourcedr, r.currencyrate) }; });
      step('Calculate Acct Cr', function (r) { return r.amtacctcr == null || (Number(r.amtacctcr) === 0 && eq(r.i_isimported, 'N') && cc(r)); }, function (r) {   // :561-566
        return { amtacctcr: r.amtsourcecr == null || r.currencyrate == null ? null : round2(r.amtsourcecr, r.currencyrate) }; });
      warn('Zero Acct Balance', 'WARN=Zero Acct Balance, ', function (r) {                                        // :567-575
        return r.amtsourcedr != null && r.amtsourcecr != null && (Number(r.amtsourcedr) - Number(r.amtsourcecr)) !== 0 && r.amtacctdr != null && r.amtacctcr != null && (Number(r.amtacctdr) - Number(r.amtacctcr)) === 0 && notY(r) && cc(r); });

      /*********************************************************************/
      //	Get Balance :577-614
      var sSrc = null, sAcct = null, anyN = false, hasSrc = false, hasAcct = false;
      R.forEach(function (w) { var r = w.cur; if (!(eq(r.i_isimported, 'N') && cc(r))) return; anyN = true;
        if (r.amtsourcedr != null && r.amtsourcecr != null) { sSrc = (sSrc || 0) + Number(r.amtsourcedr) - Number(r.amtsourcecr); hasSrc = true; }       // SUM() skips NULLs: SUM(Dr)-SUM(Cr)
        if (r.amtacctdr != null && r.amtacctcr != null) { sAcct = (sAcct || 0) + Number(r.amtacctdr) - Number(r.amtacctcr); hasAcct = true; } });
      if (anyN) {
        var srcV = hasSrc ? Math.round(sSrc * 1e6) / 1e6 : null, acctV = hasAcct ? Math.round(sAcct * 1e6) / 1e6 : null;
        if (srcV != null && srcV === 0 && acctV != null && acctV === 0) trx.say('§IMPORT_GLJOURNAL_BALANCE Import Balance = 0'); else trx.say('§IMPORT_GLJOURNAL_BALANCE Balance Source=' + srcV + ', Acct=' + acctV + ' (log.warning)');   // :585-593
        if (srcV != null) this.addLog(0, null, A.toBD(String(srcV)), '@AmtSourceDr@ - @AmtSourceCr@');            // :598-599
        if (acctV != null) this.addLog(0, null, A.toBD(String(acctV)), '@AmtAcctDr@ - @AmtAcctCr@');              // :600-601
      }
      flush();                                                                                                    // commitEx() :616 (the raw UPDATEs are in the Trx before the PO-level loop)

      //	Count Errors :618-637
      var errors = R.filter(function (w) { return w.cur.i_isimported != null && !/^(Y|N)$/.test(String(w.cur.i_isimported)) && cc(w.cur); }).length;
      if (errors !== 0) {
        if (this.m_IsValidateOnly || this.m_IsImportOnlyNoErrors) {
          trx.say('§PROC-UNPORTED ImportGLJournal commitEx() before the @Errors@ refusal (:616/:624): the I_ErrorMsg marks of this refused run are not persisted (SvrProcess.commitEx is a no-op in the one-Trx host) - named');   // (d)
          throw new Error('@Errors@=' + errors);                                                                  // :624
        }
      } else if (this.m_IsValidateOnly) { return '@Errors@=' + errors; }                                          // :626-629
      trx.say('§IMPORT_GLJOURNAL_VALIDATED Validation Errors=' + errors);                                         // :631-632

      /*********************************************************************/
      var noInsert = 0, noInsertJournal = 0, noInsertLine = 0;
      var batch = null, BatchDocumentNo = '', journal = null, JournalDocumentNo = '', DateAcct = null, wasCreateNewBatch = false;   // :641-647
      function tsToString(ms) { var s = new Date(ms).toISOString().slice(0, 23).replace('T', ' '); return s.replace(/0+$/, '').replace(/\.$/, '.0'); }   // java.sql.Timestamp.toString
      var stamp = trx.env.nowMillis != null ? tsToString(trx.env.nowMillis) : nowTs + '.0';
      var todoRows = trx.find('i_gljournal', {}).filter(function (r) { return eq(r.i_isimported, 'N') && cc(r); });   // :649-651 WHERE I_IsImported='N' AND client
      function nvl(a, id) { return a != null ? String(a) : id + ' '; }
      todoRows.sort(function (a, b) {                                                                             // :652-655 ORDER BY NVL(BatchDocumentNo, id||' '), NVL(JournalDocumentNo, id||' '), C_AcctSchema_ID, PostingType, C_DocType_ID, GL_Category_ID, C_Currency_ID, TRUNC(DateAcct), Line, I_GLJournal_ID
        function c(x, y) { return x < y ? -1 : x > y ? 1 : 0; }
        return c(nvl(a.batchdocumentno, a.i_gljournal_id), nvl(b.batchdocumentno, b.i_gljournal_id)) || c(nvl(a.journaldocumentno, a.i_gljournal_id), nvl(b.journaldocumentno, b.i_gljournal_id)) || nz(a.c_acctschema_id) - nz(b.c_acctschema_id)
          || c(String(a.postingtype), String(b.postingtype)) || nz(a.c_doctype_id) - nz(b.c_doctype_id) || nz(a.gl_category_id) - nz(b.gl_category_id) || nz(a.c_currency_id) - nz(b.c_currency_id)
          || c(day(a.dateacct), day(b.dateacct)) || nz(a.line) - nz(b.line) || nz(a.i_gljournal_id) - nz(b.i_gljournal_id); });
      trx.say('§IMPORT_GLJOURNAL_LOOP rows=' + todoRows.length);
      try {
        for (var i = 0; i < todoRows.length; i++) {
          var imp = todoRows[i], impBatchDocumentNo = imp.batchdocumentno == null ? '' : imp.batchdocumentno;
          //	New Batch if Batch Document No changes :664-681
          if (imp.iscreatenewbatch === 'Y'
            || (journal != null && nz(journal.c_acctschema_id) !== nz(imp.c_acctschema_id))
            || (imp.batchdocumentno == null && !wasCreateNewBatch)
            || BatchDocumentNo !== impBatchDocumentNo) batch = null;
          if (imp.iscreatenewbatch === 'Y') wasCreateNewBatch = true;                                             // :672-673
          if (imp.iscreatenewbatch === 'Y' || (batch == null && imp.batchdocumentno != null)) {                   // :675-679
            BatchDocumentNo = impBatchDocumentNo;                                                                 // cannot compare real DocumentNo
            var bpo = ML().newRecord(trx, 'gl_journalbatch', {});                                                 // :684 new MJournalBatch(ctx, 0, trx) -> setInitialDefaults
            bpo.set('ad_client_id', imp.ad_client_id).set('ad_org_id', imp.ad_orgdoc_id);                         // :685 setClientOrg
            if (imp.batchdocumentno != null && String(imp.batchdocumentno).length > 0) bpo.set('documentno', imp.batchdocumentno);   // :686-688
            bpo.set('c_doctype_id', imp.c_doctype_id).set('postingtype', imp.postingtype);                        // :689-690
            bpo.set('description', (imp.batchdescription == null || String(imp.batchdescription).length === 0 ? '*Import-' : imp.batchdescription + ' *Import-') + stamp);   // :691-697
            bpo.set('datedoc', trx.env.date).set('dateacct', trx.env.date);                                       // (b) MJournalBatch.beforeSave :948-961 (DateDoc = today, DateAcct = DateDoc)
            if (!bpo.save()) {                                                                                    // :698-710
              trx.say('§IMPORT_GLJOURNAL_SEVERE Batch not saved');
              if (bpo.error) { this.addLog(0, null, null, String(bpo.error)); throw new Error(String(bpo.error)); }
              break;
            }
            batch = bpo.row; noInsert++; journal = null;                                                          // :711-712
          }
          //	Journal :714-765
          var impJournalDocumentNo = imp.journaldocumentno == null ? '' : imp.journaldocumentno, impDateAcct = day(imp.dateacct);
          if (journal == null || imp.iscreatenewjournal === 'Y' || JournalDocumentNo !== impJournalDocumentNo
            || nz(journal.c_doctype_id) !== nz(imp.c_doctype_id) || nz(journal.gl_category_id) !== nz(imp.gl_category_id) || journal.postingtype !== imp.postingtype
            || nz(journal.c_currency_id) !== nz(imp.c_currency_id) || impDateAcct !== DateAcct) {
            JournalDocumentNo = impJournalDocumentNo; DateAcct = impDateAcct;                                     // :726-727
            var jpo = ML().newRecord(trx, 'gl_journal', {});                                                      // :729 new MJournal(ctx, 0, trx) -> setInitialDefaults
            if (batch != null) jpo.set('gl_journalbatch_id', batch.gl_journalbatch_id);                           // :730-731
            jpo.set('ad_client_id', imp.ad_client_id).set('ad_org_id', imp.ad_orgdoc_id);                         // :732 setClientOrg
            var jdesc = imp.batchdescription; if (jdesc == null || String(jdesc).length === 0) jdesc = '(Import)';   // :734-737
            jpo.set('description', jdesc);
            if (imp.journaldocumentno != null && String(imp.journaldocumentno).length > 0) jpo.set('documentno', imp.journaldocumentno);   // :739-740
            jpo.set('c_acctschema_id', imp.c_acctschema_id).set('c_doctype_id', imp.c_doctype_id).set('gl_category_id', imp.gl_category_id).set('postingtype', imp.postingtype);   // :742-745
            jpo.set('gl_budget_id', nz(imp.gl_budget_id) === 0 ? null : imp.gl_budget_id);                        // :746 setGL_Budget_ID (0 -> NULL)
            if (nz(imp.c_currency_id) !== 0) jpo.set('c_currency_id', imp.c_currency_id);                         // :748 MJournal.setCurrency (:192-200)
            if (nz(imp.c_conversiontype_id) !== 0) jpo.set('c_conversiontype_id', imp.c_conversiontype_id);
            if (imp.currencyrate != null && Number(imp.currencyrate) === 0) jpo.set('currencyrate', imp.currencyrate);   // only when the rate is ZERO (as Java compareTo(ZERO)==0)
            jpo.set('c_period_id', imp.c_period_id);                                                              // :750
            MT._jSetDateAcct(trx, ctx, jpo, imp.dateacct);                                                        // :751 setDateAcct "sets Period if not defined"
            jpo.set('datedoc', imp.dateacct);                                                                     // :752
            var jerr = MT._jBeforeSave(trx, ctx, jpo, true);                                                      // :753 save() -> MJournal.beforeSave (c)
            if (jerr || !jpo.save()) {
              trx.say('§IMPORT_GLJOURNAL_SEVERE Journal not saved' + (jerr ? ' :: ' + jerr : ''));
              var jex = jerr || jpo.error; if (jex) { this.addLog(0, null, null, String(jex)); throw new Error(String(jex)); }
              break;
            }
            MT._jUpdateBatch(trx, jpo.row);                                                                       // MJournal.afterSave -> updateBatch
            journal = jpo.row; noInsertJournal++;                                                                 // :764
          }
          //	Lines :767-831
          var lpo = ML().newRecord(trx, 'gl_journalline', {}), jr = trx.get('gl_journal', journal.gl_journal_id);  // :768 new MJournalLine(journal)
          lpo.set('ad_client_id', jr.ad_client_id).set('ad_org_id', jr.ad_org_id).set('gl_journal_id', jr.gl_journal_id).set('c_currency_id', jr.c_currency_id).set('c_conversiontype_id', jr.c_conversiontype_id).set('dateacct', jr.dateacct);   // MJournalLine(parent) ctor :98-108
          lpo.set('description', imp.description);                                                                // :770
          if (nz(imp.c_currency_id) !== 0) lpo.set('c_currency_id', imp.c_currency_id);                           // :772 MJournalLine.setCurrency (:138-145)
          if (nz(imp.c_conversiontype_id) !== 0) lpo.set('c_conversiontype_id', imp.c_conversiontype_id);
          if (imp.currencyrate != null && Number(imp.currencyrate) === 0) lpo.set('currencyrate', imp.currencyrate);   // MJournalLine.setCurrency: the rate is set only when it is ZERO (as Java compareTo/signum == 0); a non-zero rate keeps the ctor default 1
          //	Set/Get Account Combination :774-799
          var vcId;
          if (nz(imp.c_validcombination_id) === 0) {
            var acct = MT.MAccount_get(trx, imp.ad_client_id, imp.c_acctschema_id, { AD_Org_ID: nz(imp.ad_org_id), Account_ID: nz(imp.account_id), C_SubAcct_ID: 0, M_Product_ID: nz(imp.m_product_id), C_BPartner_ID: nz(imp.c_bpartner_id),
              AD_OrgTrx_ID: nz(imp.ad_orgtrx_id), C_LocFrom_ID: nz(imp.c_locfrom_id), C_LocTo_ID: nz(imp.c_locto_id), C_SalesRegion_ID: nz(imp.c_salesregion_id), C_Project_ID: nz(imp.c_project_id), C_Campaign_ID: nz(imp.c_campaign_id),
              C_Activity_ID: nz(imp.c_activity_id), User1_ID: nz(imp.user1_id), User2_ID: nz(imp.user2_id), UserElement1_ID: 0, UserElement2_ID: 0 });   // :775-781 MAccount.get(...)
            if (acct == null || nz(acct.c_validcombination_id) === 0) {                                           // :784-791
              var ie = trx.get('i_gljournal', imp.i_gljournal_id), se = ML().save(trx, 'i_gljournal', ie, { i_errormsg: 'ERROR creating Account', i_isimported: 'N' });
              if (!se.ok) throw new Error('SaveError i_gljournal: ' + se.error);                                   // imp.saveEx()
              continue;
            }
            vcId = acct.c_validcombination_id; lpo.set('c_validcombination_id', vcId);                            // :794-795
          } else { vcId = imp.c_validcombination_id; lpo.set('c_validcombination_id', vcId); }                    // :799
          lpo.set('line', imp.line);                                                                              // :801
          lpo.set('amtsourcecr', imp.amtsourcecr).set('amtsourcedr', imp.amtsourcedr);                            // :802-803
          //	line.setAmtAcct(AmtAcctDr, AmtAcctCr) - only if not 0 :195-229
          var aDr = imp.amtacctdr, aCr = imp.amtacctcr, rateDR = 0, rateCR = 0;
          if (aDr != null && Number(aDr) !== 0) { rateDR = Number(aDr) / Number(imp.amtsourcedr); lpo.set('amtacctdr', aDr); }
          if (aCr != null && Number(aCr) !== 0) { rateCR = Number(aCr) / Number(imp.amtsourcecr); lpo.set('amtacctcr', aCr); }
          if (rateDR !== 0 && rateCR !== 0 && rateDR !== rateCR) { trx.say('§IMPORT_GLJOURNAL_WARN Rates Different DR=' + rateDR + '(used) <> CR=' + rateCR + '(ignored)'); rateCR = 0; }
          if (rateDR < 0 || !isFinite(rateDR) || isNaN(rateDR)) trx.say('§IMPORT_GLJOURNAL_WARN DR Rate ignored - ' + rateDR);
          else if (rateCR < 0 || !isFinite(rateCR) || isNaN(rateCR)) trx.say('§IMPORT_GLJOURNAL_WARN CR Rate ignored - ' + rateCR);
          else { if (rateDR !== 0) lpo.set('currencyrate', rateDR); if (rateCR !== 0) lpo.set('currencyrate', rateCR); }
          lpo.set('dateacct', imp.dateacct);                                                                      // :805
          if (nz(imp.c_uom_id) !== 0) lpo.set('c_uom_id', imp.c_uom_id);                                          // :807
          lpo.set('qty', imp.qty == null ? 0 : imp.qty);                                                          // :808 X_I_GLJournal.getQty (NULL -> ZERO)
          var lerr = MT._jlBeforeSave(trx, ctx, lpo, true);                                                       // :809 line.save() -> MJournalLine.beforeSave (c)
          if (!lerr && lpo.save()) {
            MT._updateJournalTotal(trx, lpo.get('gl_journal_id'));                                                // MJournalLine.afterSave -> updateJournalTotal
            var chs = { c_validcombination_id: vcId, gl_journal_id: journal.gl_journal_id, gl_journalline_id: lpo.row.gl_journalline_id, i_isimported: 'Y', processed: 'Y' };   // :810-816
            if (batch != null) chs.gl_journalbatch_id = batch.gl_journalbatch_id;                                 // :812-813
            var sv = ML().save(trx, 'i_gljournal', trx.get('i_gljournal', imp.i_gljournal_id), chs);              // :817 imp.save()
            if (sv.ok) noInsertLine++;                                                                            // :818
          } else if (lerr) trx.say('§IMPORT_GLJOURNAL_SEVERE line refused :: ' + lerr);
        }
      } catch (e) { trx.say('§IMPORT_GLJOURNAL_SEVERE ' + ((e && e.message) || e)); }                             // :822-826 catch (Exception e) { log.log(SEVERE) }

      //	Set Error to indicator to not imported :834-840
      load();
      no = step('Set not imported', function (r) { return notY(r) && cc(r); }, function () { return { i_isimported: 'N', updated: nowTs }; });
      flush();
      this.addLog(0, null, A.toBD(String(no)), '@Errors@');                                                       // :839
      this.addLog(0, null, A.toBD(String(noInsert)), '@GL_JournalBatch_ID@: @Inserted@');                         // :841
      this.addLog(0, null, A.toBD(String(noInsertJournal)), '@GL_Journal_ID@: @Inserted@');                       // :842
      this.addLog(0, null, A.toBD(String(noInsertLine)), '@GL_JournalLine_ID@: @Inserted@');                      // :843
      trx.say('§IMPORT_GLJOURNAL client=' + C + ' org=' + O + ' batches=' + noInsert + ' journals=' + noInsertJournal + ' lines=' + noInsertLine + ' errors=' + no);
      return '';                                                                                                  // :844
    };
    return ImportGLJournal;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

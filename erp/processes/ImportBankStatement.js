// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ImportBankStatement.js - org.compiere.process.ImportBankStatement, verbatim (org.adempiere.base.process/src/org/compiere/process/ImportBankStatement.java, 540 lines; AD_Process 221 Import_BankStatement, table I_BankStatement = AD_Table 600).
// bim-compiler prompts/MIGRATE_INSTALL_TENANT.md section E3D-SPEC, lane IB - Witness: W-IMPORT-BANKSTATEMENT (erp/tests/witness_import_bankstatement.js). Pattern: processes/ImportGLJournal.js / ImportPayment.js (working copies of the rows, one JS step per Java statement).
// Steps in legacy order: (1) the SQL phase :94-313 (each DB.executeUpdateEx runs on in-memory working copies of the I_BankStatement rows: same WHERE with SQL three-valued logic and AND/OR precedence AS WRITTEN, same SET, the Java
//   subselects run through trx.q with the row's values as parameters; a subselect that returns more than one row fails the statement as PostgreSQL does - printed as the shipped log line PROC-SQL-ERROR, no row of that statement changes),
//   (2) the duplicate detection :315-363, (3) the statement loop :366-525 (a new MBankStatement for every account / name / reference / date break, ONE MBankStatementLine per row), (4) the closing "not imported" reset and the answer logs :527-536.
// WHAT LEGACY DOES NOT DO (read from the Java, not guessed): it never resolves ChargeName, PaymentDocumentNo, InvoiceDocumentNo, BPartnerValue, TrxType, IBAN or CreatePayment to ids - a caller fills C_Charge_ID / C_Payment_ID / C_Invoice_ID / C_BPartner_ID itself;
//   it never reads the row's Line (the lines are numbered 10, 20 ... per statement :374/:457/:506); it never copies the row's C_BPartner_ID / C_Invoice_ID / TrxType to the line (MBankStatementLine.beforeSave derives BP / invoice from the payment).
// NAMED twin decisions (nothing of ImportBankStatement.java is skipped; each choice prints a PROC-PARAM / IMPORT_BANKSTATEMENT_ line):
//   (a) a parameter the caller did not send reaches the process as NULL (prepare skips it :64, the Java field default stays 0 / false). AD_Client_ID takes the session client (the dialog always sends it; Java would use 0 and match no row),
//       DeleteOldImported takes its AD_Process_Para default (N) - printed. AD_Org_ID / C_BankAccount_ID stay 0 exactly as the Java field defaults.
//   (b) PROC-UNPORTED commitEx() :364 - a no-op in the twin's one-Trx host. Nothing is lost: this Java never refuses a run after that point, so no mark of an earlier phase is ever dropped by a later failure.
//   (c) SQL numeric compare (TrxAmt + ChargeAmt + InterestAmt <> StmtAmt :237-243) runs on the sqlite REAL values rounded to 6 decimals (PostgreSQL NUMERIC is exact; the twin's columns are not).
//   (d) the main loop's ORDER BY :369 is completed with I_BankStatement_ID as the last key (PostgreSQL leaves ties unspecified; the twin needs a deterministic order). NULLs sort last as in PostgreSQL ascending.
//   (e) MBankStatement.setStatementDate(new Timestamp(now)) / setName(getStatementDate().toString()) (MBankStatement.java:122-125) use the recorded clock (env.now / env.nowMillis), formatted as java.sql.Timestamp.toString.
//   (f) the line beforeSave / afterSave (charge, line number, header totals) is
//       model_trade.js MBankStatementLine_saveEx - the ONE port, called around the PO save. The bank statement DocAction is NOT part of this process (legacy has no DocAction parameter): statements are created Drafted.
//   (g) MBankStatement.beforeSave :258-273 (doc type CMB, ending balance) is done inline before the statement save: ad_modelval.js has a port (installMBankStatementSaveHooks) that NO kernel path calls (measured: a statement saved through the PO layer had C_DocType_ID NULL).
//       Lane BS may register a shared beforeSave; the values are the same either way.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  var MT = (typeof module !== 'undefined' && module.exports) ? require('../model_trade') : global.ModelTrade;
  P.defineProcess('org.compiere.process.ImportBankStatement', function (SvrProcess, X) {
    function ML() { return X.ML; }
    function nz(v) { return v == null || v === '' ? 0 : Number(v); }
    function ne(a, b) { return a != null && b != null && String(a) !== String(b); }                       // SQL a<>b : NULL is unknown
    function eq(a, b) { return a != null && b != null && String(a) === String(b); }
    function cat(v, s) { return v == null ? null : String(v) + s; }                                       // SQL v||s : NULL||x is NULL
    function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b) && (a == null) === (b == null); }
    function r6(v) { return Math.round(Number(v) * 1e6); }
    function tsNorm(v) { if (v == null) return null; var s = String(v).replace('T', ' '); return s.length <= 10 ? s + ' 00:00:00' : s.slice(0, 19); }   // Timestamp.equals on the stored text
    function cmpS(a, b) { if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1; a = String(a); b = String(b); return a < b ? -1 : a > b ? 1 : 0; }

    function ImportBankStatement() {
      SvrProcess.call(this);
      this.p_AD_Client_ID = 0; this.p_AD_Org_ID = 0; this.p_C_BankAccount_ID = 0; this.p_deleteOldImported = false;   // :43-50
    }
    ImportBankStatement.prototype = Object.create(SvrProcess.prototype);

    // -- prepare :58-78 ---------------------------------------------------------------------------------------------
    ImportBankStatement.prototype.prepare = function () {
      var trx = this.get_TrxName(), para = this.getParameter(), pid = this.getProcessInfo().AD_Process_ID || 221, seen = {};
      function dflt(name) { var r = trx.q('SELECT defaultvalue AS d FROM ad_process_para WHERE ad_process_id=? AND columnname=? AND isactive=?', [pid, name, 'Y'])[0]; return r && r.d != null && r.d !== '' ? r.d : null; }
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName(), pv = para[i].getParameter();
        if (pv == null) continue;                                                                                   // :64 getParameter() == null : nothing
        seen[name] = 1;
        if (name === 'AD_Client_ID') this.p_AD_Client_ID = para[i].getParameterAsInt();                              // :66-67
        else if (name === 'AD_Org_ID') this.p_AD_Org_ID = para[i].getParameterAsInt();                              // :68-69
        else if (name === 'C_BankAccount_ID') this.p_C_BankAccount_ID = para[i].getParameterAsInt();                // :70-71
        else if (name === 'DeleteOldImported') this.p_deleteOldImported = 'Y' === pv;                               // :72-73
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ImportBankStatement ' + name);                                      // MProcessPara.validateUnknownParameter :74-75
      }
      if (!seen.AD_Client_ID) { this.p_AD_Client_ID = Number(this.getAD_Client_ID()); trx.say('§PROC-PARAM ImportBankStatement AD_Client_ID=' + this.p_AD_Client_ID + ' source=session client (not sent)'); }
      if (!seen.DeleteOldImported) { var d = dflt('DeleteOldImported'); if (d != null) { this.p_deleteOldImported = 'Y' === d; trx.say('§PROC-PARAM ImportBankStatement DeleteOldImported=' + d + ' source=AD_Process_Para default'); } }
    };

    // -- doIt :86-537 ---------------------------------------------------------------------------------------------------
    ImportBankStatement.prototype.doIt = function () {
      var trx = this.get_TrxName(), A = X.A, C = this.p_AD_Client_ID, O = this.p_AD_Org_ID, pBank = this.p_C_BankAccount_ID, ctx = this.getCtx();
      try { trx.q('SELECT 1 AS x FROM i_bankstatement LIMIT 1'); } catch (e) { throw new Error('I_BankStatement has no physical table on this host (AdImportTables.ensure, MIGRATE_INSTALL_TENANT E3D-SPEC lane IB)'); }
      trx.say('§IMPORT_BANKSTATEMENT_START AD_Org_ID=' + O + ', C_BankAccount_ID' + pBank);                          // :88-89
      var nowTs = trx.env.now || (trx.env.nowMillis != null ? new Date(trx.env.nowMillis).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' '));
      var R = [];
      function load() { R = trx.find('i_bankstatement', {}).map(function (r) { return { id: r.i_bankstatement_id, base: Object.assign({}, r), cur: Object.assign({}, r) }; }); }
      function flush() { R.forEach(function (w) { var ch = {}; Object.keys(w.cur).forEach(function (c) { if (!same(w.cur[c], w.base[c])) ch[c] = w.cur[c]; }); if (!Object.keys(ch).length) return; trx.update('i_bankstatement', trx.get('i_bankstatement', w.id), ch); w.base = Object.assign({}, trx.get('i_bankstatement', w.id)); }); }
      function cc(r) { return eq(r.ad_client_id, C); }                                                          // clientCheck :92 " AND AD_Client_ID=<p_AD_Client_ID>"
      function notY(r) { return ne(r.i_isimported, 'Y'); }                                                      // I_IsImported<>'Y'
      function isNull(r) { return r.i_isimported == null; }
      function step(label, where, set) {
        var ups = [];
        try { R.forEach(function (w) { if (where(w.cur)) ups.push([w, set(w.cur)]); }); }
        catch (e) { trx.say('§PROC-SQL-ERROR executeUpdate -> -1: ' + ((e && e.message) || e) + ' :: ImportBankStatement ' + label); return -1; }
        ups.forEach(function (u) { Object.keys(u[1]).forEach(function (c) { u[0].cur[c] = u[1][c]; }); });
        trx.say('§IMPORT_BANKSTATEMENT_STEP ' + label + '=' + ups.length);
        return ups.length;
      }
      function err(label, text, where) {                                                                         // SET I_IsImported='E', I_ErrorMsg=I_ErrorMsg||'<text>' WHERE <where> (the caller writes the full WHERE, precedence as Java)
        var no = step(label, where, function (r) { return { i_isimported: 'E', i_errormsg: cat(r.i_errormsg, text) }; });
        if (no !== 0) trx.say('§IMPORT_BANKSTATEMENT_WARN ' + label + '=' + no + ' (log.warning)');
        return no;
      }
      function scalar(sql, params) { var rs = trx.q(sql, params.map(function (v) { return v === undefined ? null : v; })); if (rs.length > 1) throw new Error('more than one row returned by a subquery used as an expression'); return rs.length ? rs[0][Object.keys(rs[0])[0]] : null; }
      var no;

      //	****	Prepare	****
      load();
      if (this.p_deleteOldImported) {                                                                            // :96-103 DELETE FROM I_BankStatement WHERE I_IsImported='Y' AND client
        var del = R.filter(function (w) { return eq(w.cur.i_isimported, 'Y') && cc(w.cur); });
        del.forEach(function (w) { trx.del('i_bankstatement', trx.get('i_bankstatement', w.id)); }); R = R.filter(function (w) { return del.indexOf(w) < 0; });
        trx.say('§IMPORT_BANKSTATEMENT_DELETE_OLD ' + del.length);
      }
      no = step('Reset', function (r) { return ne(r.i_isimported, 'Y') || isNull(r) || r.ad_client_id == null || r.ad_org_id == null || eq(r.ad_client_id, 0) || eq(r.ad_org_id, 0); }, function (r) {   // :105-118 Set Client, Org, IsActive, Created/Updated
        return { ad_client_id: nz(r.ad_client_id) === 0 ? C : r.ad_client_id, ad_org_id: nz(r.ad_org_id) === 0 ? O : r.ad_org_id, isactive: r.isactive != null ? r.isactive : 'Y',
          created: r.created != null ? r.created : nowTs, createdby: r.createdby != null ? r.createdby : 0, updated: r.updated != null ? r.updated : nowTs, updatedby: r.updatedby != null ? r.updatedby : 0,
          i_errormsg: ' ', i_isimported: 'N' }; });
      trx.say('§IMPORT_BANKSTATEMENT_RESET ' + no);

      err('Invalid Org', 'ERR=Invalid Org, ', function (r) {                                                      // :120-127
        return (r.ad_org_id == null || nz(r.ad_org_id) === 0 || trx.q("SELECT 1 AS x FROM ad_org oo WHERE oo.ad_org_id=? AND (oo.issummary='Y' OR oo.isactive='N')", [r.ad_org_id]).length > 0) && notY(r) && cc(r); });

      //	Set Bank Account :129-173 (the WHERE of each is "a AND b OR c" + clientCheck, i.e. (a AND b) OR (c AND client): ported AS WRITTEN)
      step('Bank Account (With Routing No)', function (r) { return (r.c_bankaccount_id == null && notY(r)) || (isNull(r) && cc(r)); }, function (r) {   // :130-145
        return { c_bankaccount_id: scalar("SELECT a.c_bankaccount_id FROM c_bankaccount a, c_bank b WHERE b.isownbank='Y' AND a.ad_client_id=? AND a.c_bank_id=b.c_bank_id AND a.accountno=? AND (b.routingno=? OR b.swiftcode=?)",
          [r.ad_client_id, r.bankaccountno, r.routingno, r.routingno]) }; });
      step('Bank Account (Without Routing No)', function (r) { return (r.c_bankaccount_id == null && notY(r)) || (isNull(r) && cc(r)); }, function (r) {   // :147-162
        return { c_bankaccount_id: scalar("SELECT a.c_bankaccount_id FROM c_bankaccount a, c_bank b WHERE b.isownbank='Y' AND a.c_bank_id=b.c_bank_id AND a.accountno=? AND a.ad_client_id=?", [r.bankaccountno, r.ad_client_id]) }; });
      step('Bank Account', function (r) { return (r.c_bankaccount_id == null && r.bankaccountno == null && notY(r)) || (isNull(r) && cc(r)); }, function (r) {   // :164-173 the process parameter
        return { c_bankaccount_id: scalar('SELECT a.c_bankaccount_id FROM c_bankaccount a WHERE a.c_bankaccount_id=? AND a.ad_client_id=?', [pBank, r.ad_client_id]) }; });
      err('Invalid Bank Account', 'ERR=Invalid Bank Account, ', function (r) { return (r.c_bankaccount_id == null && notY(r)) || (isNull(r) && cc(r)); });   // :175-182

      //	Set Currency :185-209
      step('Set Currency', function (r) { return r.c_currency_id == null && notY(r) && cc(r); }, function (r) {   // :186-191
        return { c_currency_id: scalar('SELECT c.c_currency_id FROM c_currency c WHERE ?=c.iso_code AND c.ad_client_id IN (0,?)', [r.iso_code, r.ad_client_id]) }; });
      step('Set Currency (Bank Account)', function (r) { return r.c_currency_id == null && r.iso_code == null && cc(r); }, function (r) {   // :193-199
        return { c_currency_id: scalar('SELECT c_currency_id FROM c_bankaccount WHERE c_bankaccount_id=?', [r.c_bankaccount_id]) }; });
      err('Invalid Currency', 'ERR=Invalid Currency,', function (r) { return r.c_currency_id == null && ne(r.i_isimported, 'E') && notY(r) && cc(r); });   // :201-209 (no space after the comma, as legacy)

      //	Set Amount :213-244
      step('Charge Amount', function (r) { return r.chargeamt == null && notY(r) && cc(r); }, function () { return { chargeamt: 0 }; });             // :213-219
      step('Interest Amount', function (r) { return r.interestamt == null && notY(r) && cc(r); }, function () { return { interestamt: 0 }; });       // :221-227
      step('Transaction Amount', function (r) { return r.trxamt == null && notY(r) && cc(r); }, function (r) {                                         // :229-235
        return { trxamt: r.stmtamt == null || r.interestamt == null || r.chargeamt == null ? null : (r6(r.stmtamt) - r6(r.interestamt) - r6(r.chargeamt)) / 1e6 }; });
      err('Invalid Amount', 'Err=Invalid Amount, ', function (r) {                                                // :237-243 (capital E, lower rr, as legacy)
        return r.trxamt != null && r.chargeamt != null && r.interestamt != null && r.stmtamt != null && (r6(r.trxamt) + r6(r.chargeamt) + r6(r.interestamt)) !== r6(r.stmtamt) && notY(r) && cc(r); });

      //	Set Valuta Date :246-252
      step('Valuta Date', function (r) { return r.valutadate == null && notY(r) && cc(r); }, function (r) { return { valutadate: r.statementlinedate }; });

      //	Check Payment<->Invoice / Payment<->BPartner / Invoice<->BPartner / Invoice.BPartner<->Payment.BPartner :255-312 (no I_IsImported test in these WHEREs, only the client)
      function pay(r) { return r.c_payment_id == null ? null : trx.q('SELECT c_invoice_id, c_bpartner_id FROM c_payment WHERE c_payment_id=?', [r.c_payment_id])[0] || null; }
      function inv(r) { return r.c_invoice_id == null ? null : trx.q('SELECT c_invoice_id, c_bpartner_id FROM c_invoice WHERE c_invoice_id=?', [r.c_invoice_id])[0] || null; }
      err('Payment<->Invoice', 'Err=Invalid Payment<->Invoice, ', function (r) { var p = pay(r); return !!p && r.c_invoice_id != null && p.c_invoice_id != null && ne(p.c_invoice_id, r.c_invoice_id) && cc(r); });   // :255-267
      err('Payment<->BPartner', 'Err=Invalid Payment<->BPartner, ', function (r) { var p = pay(r); return !!p && r.c_bpartner_id != null && p.c_bpartner_id != null && ne(p.c_bpartner_id, r.c_bpartner_id) && cc(r); });   // :270-282
      err('Invoice<->BPartner', 'Err=Invalid Invoice<->BPartner, ', function (r) { var v = inv(r); return !!v && r.c_bpartner_id != null && v.c_bpartner_id != null && ne(v.c_bpartner_id, r.c_bpartner_id) && cc(r); });   // :285-297
      err('Invoice.BPartner<->Payment.BPartner', 'Err=Invalid Invoice.BPartner<->Payment.BPartner, ', function (r) {                                   // :300-312
        var p = pay(r), v = inv(r); return !!p && !!v && ne(p.c_invoice_id, v.c_invoice_id) && ne(v.c_bpartner_id, p.c_bpartner_id) && cc(r); });

      //	Detect Duplicates :315-363 - the 12 concatenated EFT fields; any NULL makes the whole concatenation NULL (never equal)
      var dupNo = 0;
      var lines = trx.q('SELECT l.c_bankstatementline_id AS lid, l.efttrxid AS t, l.eftamt AS a, l.eftstatementlinedate AS sd, l.eftvalutadate AS vd, l.efttrxtype AS tt, l.eftcurrency AS cu, l.eftreference AS rf, s.eftstatementreference AS sr, l.eftcheckno AS ck, l.eftmemo AS mm, l.eftpayee AS py, l.eftpayeeaccount AS pa FROM c_bankstatementline l, c_bankstatement s WHERE s.c_bankstatement_id=l.c_bankstatement_id');
      function concat12(parts) { var s = ''; for (var i = 0; i < parts.length; i++) { if (parts[i] == null) return null; s += String(parts[i]); } return s; }
      lines.forEach(function (l) { l.k = concat12([l.t, l.a, l.sd, l.vd, l.tt, l.cu, l.rf, l.sr, l.ck, l.mm, l.py, l.pa]); });
      R.forEach(function (w) {
        var i = w.cur; if (!(eq(i.i_isimported, 'N') && i.efttrxid != null)) return;                              // :315-323 (SELECT ... WHERE i.I_isImported='N' AND i.EftTrxID IS NOT NULL)
        var k = concat12([i.efttrxid, i.eftamt, i.eftstatementlinedate, i.eftvalutadate, i.efttrxtype, i.eftcurrency, i.eftreference, i.eftstatementreference, i.eftcheckno, i.eftmemo, i.eftpayee, i.eftpayeeaccount]);
        if (k == null) return;
        lines.forEach(function (l) {
          if (l.k == null || l.k !== k) return;
          if (!cc(i)) return;                                                                                     // pupdt WHERE I_BankStatement_ID=? AND client :327-330
          i.i_isimported = 'E'; i.i_errormsg = cat(i.i_errormsg, 'Err=Duplicate[Line_ID=' + l.lid + ',EDTTrxID=' + i.efttrxid + ']'); dupNo++;   // :336-345
        });
      });
      if (dupNo !== 0) trx.say('§IMPORT_BANKSTATEMENT_STEP Duplicates=' + dupNo);
      flush();
      trx.say('§PROC-UNPORTED ImportBankStatement commitEx() :364 - no-op in the twin one-Trx host (nothing is refused after it in this Java, so no mark is lost)');

      //	Import Bank Statement :366-525
      var todo = trx.find('i_bankstatement', {}).filter(function (r) { return eq(r.i_isimported, 'N'); });         // :367-368 WHERE I_IsImported='N' (NOT client-limited, as legacy)
      todo.sort(function (a, b) {                                                                                  // ORDER BY C_BankAccount_ID, Name, StatementDate, EftStatementReference, Line
        return cmpS(a.c_bankaccount_id == null ? null : String(1e9 + Number(a.c_bankaccount_id)), b.c_bankaccount_id == null ? null : String(1e9 + Number(b.c_bankaccount_id))) || cmpS(a.name, b.name) || cmpS(tsNorm(a.statementdate), tsNorm(b.statementdate))
          || cmpS(a.eftstatementreference, b.eftstatementreference) || ((a.line == null ? 1e18 : Number(a.line)) - (b.line == null ? 1e18 : Number(b.line))) || (Number(a.i_bankstatement_id) - Number(b.i_bankstatement_id)); });
      trx.say('§IMPORT_BANKSTATEMENT_LOOP rows=' + todo.length);
      function tsToString(ms) { var s = new Date(ms).toISOString().slice(0, 23).replace('T', ' '); return s.replace(/0+$/, '').replace(/\.$/, '.0'); }   // java.sql.Timestamp.toString
      var stamp = trx.env.nowMillis != null ? tsToString(trx.env.nowMillis) : nowTs + '.0';
      var statement = null, account = null, lineNo = 10, noInsert = 0, noInsertLine = 0;
      try {
        for (var q = 0; q < todo.length; q++) {
          var imp = todo[q];
          //	Get the bank account for the first statement :385-431
          if (account == null) { account = trx.get('c_bankaccount', imp.c_bankaccount_id); statement = null; trx.say('§IMPORT_BANKSTATEMENT_INFO New Statement, Account=' + (account && account.accountno)); }
          //	Create a new Bank Statement for every account
          else if (nz(account.c_bankaccount_id) !== nz(imp.c_bankaccount_id)) { account = trx.get('c_bankaccount', imp.c_bankaccount_id); statement = null; trx.say('§IMPORT_BANKSTATEMENT_INFO New Statement, Account=' + (account && account.accountno)); }
          //	Create a new Bank Statement for every statement name
          else if (statement.name != null && imp.name != null) { if (String(statement.name) !== String(imp.name)) { statement = null; trx.say('§IMPORT_BANKSTATEMENT_INFO New Statement, Statement Name=' + imp.name); } }
          //	Create a new Bank Statement for every statement reference
          else if (statement.eftstatementreference != null && imp.eftstatementreference != null) { if (String(statement.eftstatementreference) !== String(imp.eftstatementreference)) { statement = null; trx.say('§IMPORT_BANKSTATEMENT_INFO New Statement, Statement Reference=' + imp.eftstatementreference); } }
          //	Create a new Bank Statement for every statement date
          else if (statement.statementdate != null && imp.statementdate != null) { if (tsNorm(statement.statementdate) !== tsNorm(imp.statementdate)) { statement = null; trx.say('§IMPORT_BANKSTATEMENT_INFO New Statement, Statement Date=' + imp.statementdate); } }

          //	New Statement :432-458
          if (statement == null) {
            var spo = ML().newRecord(trx, 'c_bankstatement', {});                                                 // new MBankStatement(account) -> MBankStatement(account, false) (MBankStatement.java:117-127)
            spo.set('ad_client_id', account.ad_client_id).set('ad_org_id', account.ad_org_id).set('c_bankaccount_id', account.c_bankaccount_id);   // setClientOrg(account), setC_BankAccount_ID
            spo.set('statementdate', nowTs).set('dateacct', nowTs).set('beginningbalance', account.currentbalance == null ? 0 : account.currentbalance).set('name', stamp).set('ismanual', 'N');   // :122-126
            spo.set('endingbalance', 0);                                                                          // :436 setEndingBalance(ZERO)
            if (imp.name != null) spo.set('name', imp.name);                                                      // :439-441
            if (imp.statementdate != null) spo.set('statementdate', imp.statementdate);                           // :442-444
            if (imp.dateacct != null) spo.set('dateacct', imp.dateacct); else spo.set('dateacct', spo.get('statementdate'));   // :445-449
            if (nz(spo.get('c_doctype_id')) <= 0) { var dt = trx.q("SELECT c_doctype_id FROM c_doctype WHERE docbasetype='CMB' AND isactive='Y' AND ad_client_id IN (0,?) ORDER BY ad_client_id DESC, isdefault DESC, c_doctype_id", [account.ad_client_id])[0]; if (dt) spo.set('c_doctype_id', dt.c_doctype_id); }   // MBankStatement.beforeSave :260-262 (named (g): no active hook for c_bankstatement in the twin kernel)
            spo.set('endingbalance', nz(spo.get('beginningbalance')) + nz(spo.get('statementdifference')));   // :271 Ending = Beginning + StatementDifference (:264-269 Beginning from the account is already set by the constructor :124)
            spo.set('description', imp.description).set('eftstatementreference', imp.eftstatementreference).set('eftstatementdate', imp.eftstatementdate);   // :450-452
            if (spo.save()) { noInsert++; statement = spo.row; } else { trx.say('§IMPORT_BANKSTATEMENT_SEVERE statement not saved :: ' + spo.error); statement = Object.assign({}, spo.row || {}, { c_bankstatement_id: 0 }); }   // :453-456
            lineNo = 10;                                                                                          // :457
          }

          //	New StatementLine :460-512
          var lpo = MT.MBankStatementLine_new(trx, statement);                                                    // new MBankStatementLine(statement, lineNo) :461 (ctor :114-118: setClientOrg, statement id, setStatementLineDate)
          lpo.set('line', lineNo);
          //	Copy statement line data
          lpo.set('referenceno', imp.referenceno).set('description', imp.linedescription);                       // :464-465
          lpo.set('statementlinedate', imp.statementlinedate).set('valutadate', imp.statementlinedate).set('dateacct', imp.statementlinedate);   // :466 MBankStatementLine.setStatementLineDate (:135-140) also sets ValutaDate and DateAcct
          lpo.set('valutadate', imp.valutadate);                                                                  // :467
          lpo.set('isreversal', imp.isreversal === 'Y' ? 'Y' : 'N');                                              // :468
          lpo.set('c_currency_id', imp.c_currency_id);                                                            // :469
          lpo.set('trxamt', imp.trxamt == null ? 0 : imp.trxamt).set('stmtamt', imp.stmtamt == null ? 0 : imp.stmtamt);   // :470-471 X_I_BankStatement.getTrxAmt / getStmtAmt (NULL -> ZERO)
          if (nz(imp.c_charge_id) !== 0) lpo.set('c_charge_id', imp.c_charge_id);                                 // :472-475
          lpo.set('interestamt', imp.interestamt == null ? 0 : imp.interestamt).set('chargeamt', imp.chargeamt == null ? 0 : imp.chargeamt);   // :476-477
          lpo.set('memo', imp.memo);                                                                              // :478
          if (nz(imp.c_payment_id) !== 0) lpo.set('c_payment_id', imp.c_payment_id);                              // :479-482
          //	Copy statement line reference data :484-495
          lpo.set('efttrxid', imp.efttrxid).set('efttrxtype', imp.efttrxtype).set('eftcheckno', imp.eftcheckno).set('eftreference', imp.eftreference).set('eftmemo', imp.eftmemo).set('eftpayee', imp.eftpayee).set('eftpayeeaccount', imp.eftpayeeaccount);
          lpo.set('eftstatementlinedate', imp.eftstatementlinedate).set('eftvalutadate', imp.eftvalutadate).set('eftcurrency', imp.eftcurrency).set('eftamt', imp.eftamt == null ? 0 : imp.eftamt);   // :492-495 (getEftAmt NULL -> ZERO)
          //	Save statement line :497-511
          var saved = false, lerr = null;
          try { MT.MBankStatementLine_saveEx(trx, ctx, lpo); saved = true; } catch (e) { lerr = (e && e.message) || String(e); }   // line.save(): beforeSave -> insert -> afterSave (updateHeader)
          if (saved) {
            var chs = { c_bankstatement_id: statement.c_bankstatement_id, c_bankstatementline_id: lpo.row.c_bankstatementline_id, i_isimported: 'Y', processed: 'Y' };   // :500-504
            var sv = ML().save(trx, 'i_bankstatement', trx.get('i_bankstatement', imp.i_bankstatement_id), chs);   // imp.saveEx()
            if (!sv.ok) throw new Error('SaveError i_bankstatement: ' + sv.error);
            noInsertLine++; lineNo += 10;                                                                         // :505-506
          } else {
            var sv2 = ML().save(trx, 'i_bankstatement', trx.get('i_bankstatement', imp.i_bankstatement_id), { i_isimported: 'N', i_errormsg: 'Err=Error saving C_BankStatementLine -> ' + lerr });   // :508-510 (imp.save())
            trx.say('§IMPORT_BANKSTATEMENT_SEVERE line not saved :: ' + lerr + (sv2.ok ? '' : ' / row not marked: ' + sv2.error));
          }
        }
      } catch (e) { trx.say('§IMPORT_BANKSTATEMENT_SEVERE ' + ((e && e.message) || e)); }                       // :516-519 catch (Exception e) { log.log(SEVERE) }

      //	Set Error to indicator to not imported :527-531
      load();
      no = step('Set not imported', function (r) { return notY(r) && cc(r); }, function () { return { i_isimported: 'N', updated: nowTs }; });
      flush();
      this.addLog(0, null, A.toBD(String(no)), '@Errors@');                                                       // :532
      this.addLog(0, null, A.toBD(String(noInsert)), '@C_BankStatement_ID@: @Inserted@');                         // :534
      this.addLog(0, null, A.toBD(String(noInsertLine)), '@C_BankStatementLine_ID@: @Inserted@');                 // :535
      trx.say('§IMPORT_BANKSTATEMENT client=' + C + ' org=' + O + ' statements=' + noInsert + ' lines=' + noInsertLine + ' errors=' + no);
      return '';                                                                                                  // :536
    };
    return ImportBankStatement;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

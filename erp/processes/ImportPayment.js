// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ImportPayment.js - org.compiere.process.ImportPayment, verbatim (org.adempiere.base.process/src/org/compiere/process/ImportPayment.java, 572 lines; AD_Process 343 Import_Payment).
// bim-compiler prompts/TEAMWORK_FRAMEWORK.md section 40 (a) / 41 row B, prompts/POS_PLUGIN_LOCAL_FIRST.md section 5/9 - Witness: W-IMPORT-PAYMENT (erp/tests/witness_import_payment.js). Pattern: processes/ImportOrder.js.
// Steps in legacy order: (1) the SQL phase :99-447 fills defaults and marks errors on the I_Payment rows, (2) the payment loop :449-559 (ONE new MPayment per I_IsImported='N' row, ordered by C_BankAccount_ID,
//   CheckNo, DateTrx, R_AuthCode; payment.save(), the row marked imported, then processIt(DocAction) only when DocAction was given), (3) the closing "not imported" reset and the answer logs :561-569.
// HOW THE SQL PHASE RUNS: as ImportOrder.js - the ~45 DB.executeUpdate statements each read what the previous ones wrote, and the twin's raw-SQL bridge sees only committed tables, so the phase runs on in-memory working
//   copies of the I_Payment rows: one JS step per Java statement, same WHERE (SQL three-valued logic: a NULL compares as unknown), same SET, the lookups (C_BankAccount, C_Currency, C_DocType ...) are the Java subselects run
//   through trx.q with the row's values as parameters; a subselect that returns more than one row fails the statement as PostgreSQL does (DB.executeUpdate logs and returns -1: no row of that statement changes -
//   printed as the shipped log line  section-PROC-SQL-ERROR). The copies are written back to the Trx (trx.update = the raw UPDATE, no model events) before the PO-level loop and read again after it.
// NAMED twin decisions (nothing of ImportPayment.java is skipped; each choice prints a  PROC-PARAM or  IMPORT_PAYMENT_ line):
//   (a) a parameter the caller did not send reaches the process as NULL (runJava appends a NULL entry for every declared AD_Process_Para). Java would throw NullPointerException for AD_Org_ID (:67) and
//       C_BankAccount_ID (:69) - the dialog always sends them; the twin takes AD_Org_ID 0 and C_BankAccount_ID 0, which legacy answers "@NotFound@ @C_BankAccount_ID@ - 0" (:89-90). DeleteOldImported takes its
//       AD_Process_Para default (N). DocAction NOT sent stays NULL exactly as the Java field default (:52): payments are saved and never processed (:542). AD_Process_Para 343/DocAction has no DefaultValue (measured), so
//       the twin invents none; a default that a site adds to the dictionary is used and printed (PROC-PARAM).
//   (b) processIt in the twin writes the document straight into the Trx (Java mutates the in-memory MPayment and saves it afterwards), so the unit [setDocAction + processIt + saveEx] runs behind a Trx savepoint:
//       when processIt or the closing saveEx fails (Java: IllegalStateException :547 / DB exception, caught :556-559) its effects are dropped and the payment + I_Payment row already saved (:534-540) stay.
//   (c) PO.saveNew stores an empty String as NULL (PO.java:3953-3955): MPaymentValidate.checkNumeric(null) = "" (:425-426) therefore ends as NULL on C_Payment.
//   (d) MBankAccount.get cache (:88, :465-469) is not modelled; the bank account is read from C_BankAccount (log line only in Java).
//   (f) MEASURED gap of the seed, not of this port: C_Activity has no physical table in erp/ad_seed.db, so the ActivityValue lookup (:409-417) fails as a statement (printed PROC-SQL-ERROR ... no such table: c_activity) and an ActivityValue
//       row therefore always ends 'ERR=No Activity,' - the same text legacy writes for an unknown value. A real activity cannot be resolved until the table is materialised.
//   (e) an error message of the process is raised untranslated ("@NotFound@ @C_BankAccount_ID@ - 0"), like the other ports (CreateFromInOut.js).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.ImportPayment', function (SvrProcess, X) {
    function ML() { return X.ML; }
    function nz(v) { return v == null || v === '' ? 0 : Number(v); }
    function ne(a, b) { return a != null && b != null && String(a) !== String(b); }                       // SQL a<>b : NULL is unknown
    function eq(a, b) { return a != null && b != null && String(a) === String(b); }                       // SQL a=b
    function cat(v, s) { return v == null ? null : String(v) + s; }                                       // SQL v||s : NULL||x is NULL
    function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b) && (a == null) === (b == null); }
    function idNum(v) { return ML().isNewId(v) ? 1e15 + Number(String(v).slice(5)) : Number(v); }
    function digits(s) { return s == null ? '' : String(s).replace(/[^0-9]/g, ''); }                      // MPaymentValidate.checkNumeric :423-435 (Character.isDigit; ASCII digits in this data)
    function nul(s) { return s === '' ? null : s; }                                                       // (c)

    function ImportPayment() {
      SvrProcess.call(this);
      this.p_AD_Org_ID = 0; this.p_C_BankAccount_ID = 0; this.p_deleteOldImported = false; this.m_docAction = null;     // :46-52
    }
    ImportPayment.prototype = Object.create(SvrProcess.prototype);

    // -- prepare :60-78 ---------------------------------------------------------------------------------------
    ImportPayment.prototype.prepare = function () {
      var trx = this.get_TrxName(), para = this.getParameter(), pid = this.getProcessInfo().AD_Process_ID || 343;
      function dflt(name) { var r = trx.q('SELECT defaultvalue AS d FROM ad_process_para WHERE ad_process_id=? AND columnname=? AND isactive=?', [pid, name, 'Y'])[0]; return r && r.d != null && r.d !== '' ? r.d : null; }
      function note(name, val, src) { trx.say('§PROC-PARAM ImportPayment ' + name + '=' + val + ' source=' + src); }
      var seen = {}, x = para;
      for (var i = 0; i < x.length; i++) {
        var name = x[i].getParameterName(), pv = x[i].getParameter();
        if (pv != null) seen[name] = 1;
        if (name === 'AD_Org_ID') this.p_AD_Org_ID = pv == null ? 0 : x[i].getParameterAsInt();                    // :66-67
        else if (name === 'C_BankAccount_ID') this.p_C_BankAccount_ID = pv == null ? 0 : x[i].getParameterAsInt();   // :68-69
        else if (name === 'DeleteOldImported') this.p_deleteOldImported = 'Y' === pv;                                  // :70-71
        else if (name === 'DocAction') this.m_docAction = pv == null ? null : pv;                                      // :72-73
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ImportPayment ' + name);                                              // MProcessPara.validateUnknownParameter :75
      }
      // twin decision (a): a parameter that was not sent takes its AD_Process_Para default where the dictionary has one
      if (!seen.DeleteOldImported) { var d2 = dflt('DeleteOldImported'); this.p_deleteOldImported = 'Y' === d2; if (d2 != null) note('DeleteOldImported', d2, 'AD_Process_Para default'); }
      if (!seen.DocAction) { var d3 = dflt('DocAction'); if (d3 != null) { this.m_docAction = d3; note('DocAction', d3, 'AD_Process_Para default'); } }
      if (!seen.AD_Org_ID) note('AD_Org_ID', this.p_AD_Org_ID, 'not sent (Java would throw NullPointerException); twin takes 0');
    };

    // -- doIt :85-570 ------------------------------------------------------------------------------------------
    ImportPayment.prototype.doIt = function () {
      var self = this, trx = this.get_TrxName(), A = X.A;
      try { trx.q('SELECT 1 AS x FROM i_payment LIMIT 1'); } catch (e) { throw new Error('I_Payment has no physical table on this host (AdImportTables.ensure, TEAMWORK_FRAMEWORK section 41 row B)'); }
      var pBank = this.p_C_BankAccount_ID, pOrg = this.p_AD_Org_ID;
      var ba = pBank ? trx.q('SELECT * FROM c_bankaccount WHERE c_bankaccount_id=?', [pBank])[0] : null;          // MBankAccount.get(ctx, id) :88
      if (pBank === 0 || !ba || Number(ba.c_bankaccount_id) !== pBank) throw new Error('@NotFound@ @C_BankAccount_ID@ - ' + pBank);   // :89-90 AdempiereUserError
      if (pOrg !== nz(ba.ad_org_id) && nz(ba.ad_org_id) !== 0) pOrg = nz(ba.ad_org_id);                           // :91-92
      var C = Number(ba.ad_client_id), O = pOrg;
      var nowTs = trx.env.now || (trx.env.nowMillis != null ? new Date(trx.env.nowMillis).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' '));   // getDate()
      var R = [];                                                                                          // working copies of the I_Payment rows: { id, base, cur }
      function load() { R = trx.find('i_payment', {}).map(function (r) { return { id: r.i_payment_id, base: Object.assign({}, r), cur: Object.assign({}, r) }; }); }
      function flush() {                                                                                    // the raw UPDATEs reach the Trx (no model events, like DB.executeUpdate)
        R.forEach(function (w) {
          var ch = {}; Object.keys(w.cur).forEach(function (c) { if (!same(w.cur[c], w.base[c])) ch[c] = w.cur[c]; });
          if (!Object.keys(ch).length) return;
          trx.update('i_payment', trx.get('i_payment', w.id), ch); w.base = Object.assign({}, trx.get('i_payment', w.id));
        });
      }
      function cc(r) { return eq(r.ad_client_id, C); }                                                       // clientCheck " AND AD_Client_ID=" + ba.getAD_Client_ID() :97
      function notY(r) { return ne(r.i_isimported, 'Y'); }                                                    // I_IsImported<>'Y'
      function notYn(r) { return ne(r.i_isimported, 'Y') || r.i_isimported == null; }                         // (I_IsImported<>'Y' OR I_IsImported IS NULL)
      // one Java statement: where(row) -> bool, set(row) -> {col:value} on the pre-statement snapshot; an exception inside = the statement failed (PG error): nothing changes, -1
      function step(label, where, set) {
        var ups = [];
        try { R.forEach(function (w) { if (where(w.cur)) ups.push([w, set(w.cur)]); }); }
        catch (e) { trx.say('§PROC-SQL-ERROR executeUpdate -> -1: ' + ((e && e.message) || e) + ' :: ImportPayment ' + label); return -1; }
        ups.forEach(function (u) { Object.keys(u[1]).forEach(function (c) { u[0].cur[c] = u[1][c]; }); });
        return ups.length;
      }
      function err(label, text, where, guard) {                                                               // I_IsImported='E', I_ErrorMsg=I_ErrorMsg||'...'
        var no = step(label, function (r) { return where(r) && guard(r) && cc(r); }, function (r) { return { i_isimported: 'E', i_errormsg: cat(r.i_errormsg, text) }; });
        if (no !== 0) trx.say('§IMPORT_PAYMENT_WARN ' + label + '=' + no + ' (log.warning)');
        return no;
      }
      function scalar(sql, params) { var rs = trx.q(sql, params.map(function (v) { return v === undefined ? null : v; })); if (rs.length > 1) throw new Error('more than one row returned by a subquery used as an expression'); return rs.length ? rs[0][Object.keys(rs[0])[0]] : null; }
      var no, noY = function (r) { return notY(r); }, noYE = function (r) { return ne(r.i_isimported, 'E') && notY(r); };

      //	****	Prepare	****
      load();
      if (this.p_deleteOldImported) {                                                                         // :102-108 Delete Old Imported
        var del = R.filter(function (w) { return eq(w.cur.i_isimported, 'Y') && cc(w.cur); });
        del.forEach(function (w) { trx.del('i_payment', trx.get('i_payment', w.id)); }); R = R.filter(function (w) { return del.indexOf(w) < 0; });
      }
      step('Reset', function (r) { return ne(r.i_isimported, 'Y') || r.i_isimported == null || r.ad_client_id == null || r.ad_org_id == null || eq(r.ad_client_id, 0) || eq(r.ad_org_id, 0); }, function (r) {   // :110-123 Set Client, Org, IsActive, Created/Updated
        return { ad_client_id: r.ad_client_id != null ? r.ad_client_id : C, ad_org_id: r.ad_org_id != null ? r.ad_org_id : O, isactive: r.isactive != null ? r.isactive : 'Y', created: r.created != null ? r.created : nowTs, createdby: r.createdby != null ? r.createdby : 0,
                 updated: r.updated != null ? r.updated : nowTs, updatedby: r.updatedby != null ? r.updatedby : 0, i_errormsg: ' ', i_isimported: 'N' }; });
      err('Invalid Org', 'ERR=Invalid Org, ', function (r) {                                                   // :125-132
        return r.ad_org_id == null || Number(r.ad_org_id) === 0 || trx.q("SELECT 1 AS x FROM ad_org oo WHERE oo.ad_org_id=? AND (oo.issummary='Y' OR oo.isactive='N')", [r.ad_org_id]).length > 0; }, noY);

      //	Set Bank Account
      step('Bank Account (With Routing No)', function (r) { return r.c_bankaccount_id == null && notYn(r) && cc(r); }, function (r) {                                                     // :135-152 (the OR of :145 is ported as written)
        return { c_bankaccount_id: scalar("SELECT a.c_bankaccount_id FROM c_bankaccount a, c_bank b WHERE b.isownbank='Y' AND a.ad_client_id=? AND a.c_bank_id=b.c_bank_id AND a.accountno=? AND b.routingno=? OR b.swiftcode=?", [r.ad_client_id, r.bankaccountno, r.routingno, r.routingno]) }; });
      step('Bank Account (Without Routing No)', function (r) { return r.c_bankaccount_id == null && notYn(r) && cc(r); }, function (r) {                                                // :154-169
        return { c_bankaccount_id: scalar("SELECT a.c_bankaccount_id FROM c_bankaccount a, c_bank b WHERE b.isownbank='Y' AND a.c_bank_id=b.c_bank_id AND a.accountno=? AND a.ad_client_id=?", [r.bankaccountno, r.ad_client_id]) }; });
      step('Bank Account', function (r) { return r.c_bankaccount_id == null && r.bankaccountno == null && notYn(r) && cc(r); }, function (r) {                                              // :171-180 the process parameter
        return { c_bankaccount_id: scalar('SELECT a.c_bankaccount_id FROM c_bankaccount a WHERE a.c_bankaccount_id=? AND a.ad_client_id=?', [pBank, r.ad_client_id]) }; });
      err('Invalid Bank Account', 'ERR=Invalid Bank Account, ', function (r) { return r.c_bankaccount_id == null; }, function (r) { return notYn(r); });          // :182-189

      //	Set Currency
      step('Set Currency', function (r) { return r.c_currency_id == null && notY(r) && cc(r); }, function (r) {                                                                           // :192-199
        return { c_currency_id: scalar('SELECT c.c_currency_id FROM c_currency c WHERE ?=c.iso_code AND c.ad_client_id IN (0,?)', [r.iso_code, r.ad_client_id]) }; });
      step('Set Currency (Bank Account)', function (r) { return r.c_currency_id == null && r.iso_code == null && cc(r); }, function (r) {                                                  // :201-207
        return { c_currency_id: scalar('SELECT c_currency_id FROM c_bankaccount WHERE c_bankaccount_id=?', [r.c_bankaccount_id]) }; });
      err('No Currency', 'ERR=No Currency,', function (r) { return r.c_currency_id == null; }, noYE);                                                                                       // :209-216

      //	Set Amount (:218-249)
      [['chargeamt', 'Charge Amount'], ['taxamt', 'Tax Amount'], ['writeoffamt', 'WriteOff Amount'], ['discountamt', 'Discount Amount']].forEach(function (a) {
        step(a[1], function (r) { return r[a[0]] == null && notY(r) && cc(r); }, function () { var o = {}; o[a[0]] = 0; return o; }); });
      //	Set Date (:252-267)
      step('Trx Date', function (r) { return r.datetrx == null && notY(r) && cc(r); }, function (r) { return { datetrx: r.created }; });
      step('Acct Date', function (r) { return r.dateacct == null && notY(r) && cc(r); }, function (r) { return { dateacct: r.datetrx }; });

      //	Invoice (:269-277)
      step('Set Invoice from DocumentNo', function (r) { return r.c_invoice_id == null && r.invoicedocumentno != null && notY(r) && cc(r); }, function (r) {
        return { c_invoice_id: scalar('SELECT MAX(ii.c_invoice_id) FROM c_invoice ii WHERE ?=ii.documentno AND ?=ii.ad_client_id', [r.invoicedocumentno, r.ad_client_id]) }; });
      //	BPartner (:279-305)
      step('Set BP from Value', function (r) { return r.c_bpartner_id == null && r.bpartnervalue != null && notY(r) && cc(r); }, function (r) {
        return { c_bpartner_id: scalar('SELECT MAX(bp.c_bpartner_id) FROM c_bpartner bp WHERE ?=bp.value AND ?=bp.ad_client_id', [r.bpartnervalue, r.ad_client_id]) }; });
      step('Set BP from Invoice', function (r) { return r.c_bpartner_id == null && r.c_invoice_id != null && notY(r) && cc(r); }, function (r) {
        return { c_bpartner_id: scalar('SELECT MAX(ii.c_bpartner_id) FROM c_invoice ii WHERE ?=ii.c_invoice_id AND ?=ii.ad_client_id', [r.c_invoice_id, r.ad_client_id]) }; });
      err('No BPartner', 'ERR=No BPartner,', function (r) { return r.c_bpartner_id == null; }, noYE);

      //	Check combinations (:308-366): no I_IsImported filter, only the client check
      function pay(r) { return r.c_payment_id == null ? null : trx.get('c_payment', r.c_payment_id); }
      function inv(r) { return r.c_invoice_id == null ? null : trx.get('c_invoice', r.c_invoice_id); }
      function chk(label, text, pred) {
        var n = step(label, function (r) { return cc(r) && pred(r); }, function (r) { return { i_isimported: 'E', i_errormsg: cat(r.i_errormsg, text) }; });
        if (n !== 0) trx.say('§IMPORT_PAYMENT_NOTE ' + label + '=' + n);
      }
      chk('Payment<->Invoice Mismatch', 'Err=Invalid Payment<->Invoice, ', function (r) { var p = pay(r); return !!p && r.c_invoice_id != null && p.c_invoice_id != null && ne(p.c_invoice_id, r.c_invoice_id); });
      chk('Payment<->BPartner Mismatch', 'Err=Invalid Payment<->BPartner, ', function (r) { var p = pay(r); return !!p && r.c_bpartner_id != null && p.c_bpartner_id != null && ne(p.c_bpartner_id, r.c_bpartner_id); });
      chk('Invoice<->BPartner Mismatch', 'Err=Invalid Invoice<->BPartner, ', function (r) { var v = inv(r); return !!v && r.c_bpartner_id != null && v.c_bpartner_id != null && ne(v.c_bpartner_id, r.c_bpartner_id); });
      chk('Invoice.BPartner<->Payment.BPartner Mismatch', 'Err=Invalid Invoice.BPartner<->Payment.BPartner, ', function (r) { var v = inv(r), p = pay(r); return !!v && !!p && ne(p.c_invoice_id, v.c_invoice_id) && ne(v.c_bpartner_id, p.c_bpartner_id); });

      //	TrxType (:368-375) / TenderType (:377-384)
      step('TrxType Default', function (r) { return r.trxtype == null && notY(r) && cc(r); }, function () { return { trxtype: 'S' }; });                //	MPayment.TRXTYPE_Sales
      step('TenderType Default', function (r) { return r.tendertype == null && notY(r) && cc(r); }, function () { return { tendertype: 'K' }; });        //	MPayment.TENDERTYPE_Check

      //	Document Type (:386-407) - no default doc type step in this process
      step('Set DocType', function (r) { return r.c_doctype_id == null && r.doctypename != null && notY(r) && cc(r); }, function (r) {
        return { c_doctype_id: scalar("SELECT d.c_doctype_id FROM c_doctype d WHERE d.name=? AND d.docbasetype IN ('ARR','APP') AND ?=d.ad_client_id", [r.doctypename, r.ad_client_id]) }; });
      err('Invalid DocTypeName', 'ERR=Invalid DocTypeName, ', function (r) { return r.c_doctype_id == null && r.doctypename != null; }, noY);
      err('No DocType', 'ERR=No DocType, ', function (r) { return r.c_doctype_id == null; }, noY);

      //	Activity (:409-426)
      step('Set Activity from Value', function (r) { return r.c_activity_id == null && r.activityvalue != null && notY(r) && cc(r); }, function (r) {
        return { c_activity_id: scalar('SELECT MAX(ac.c_activity_id) FROM c_activity ac WHERE ?=ac.value AND ac.ad_client_id IN (0,?)', [r.activityvalue, r.ad_client_id]) }; });
      err('No Activity', 'ERR=No Activity,', function (r) { return r.c_activity_id == null && r.activityvalue != null; }, noYE);
      // Charge (:428-445)
      step('Set Charge from Name', function (r) { return r.c_charge_id == null && r.chargename != null && notY(r) && cc(r); }, function (r) {
        return { c_charge_id: scalar('SELECT MAX(cc.c_charge_id) FROM c_charge cc WHERE ?=cc.name AND ?=cc.ad_client_id', [r.chargename, r.ad_client_id]) }; });
      err('No Charge', 'ERR=No Charge,', function (r) { return r.c_charge_id == null && r.chargename != null; }, noYE);
      flush();                                                                                               // commitEx() :447

      //	Import Bank Statement :449-559 - the payments
      function nl(x) { return x == null ? 1e18 : Number(x); }
      function cmpS(a, b) { if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1; a = String(a); b = String(b); return a < b ? -1 : a > b ? 1 : 0; }
      var impRows = trx.find('i_payment', {}).filter(function (r) { return eq(r.i_isimported, 'N') && cc(r); }).sort(function (a, b) {                                  // :450-452 ORDER BY C_BankAccount_ID, CheckNo, DateTrx, R_AuthCode
        return (nl(a.c_bankaccount_id) - nl(b.c_bankaccount_id)) || cmpS(a.checkno, b.checkno) || cmpS(a.datetrx, b.datetrx) || cmpS(a.r_authcode, b.r_authcode) || (idNum(a.i_payment_id) - idNum(b.i_payment_id)); });
      var noInsert = 0, docAction = this.m_docAction;
      try {
        impRows.forEach(function (imp) {
          //	New Payment
          var f = {
            ad_client_id: imp.ad_client_id, ad_org_id: imp.ad_org_id,                                                                                    // setAD_Org_ID :473 (client from the context)
            documentno: imp.documentno, ponum: imp.ponum,                                                                                                // :474-475
            trxtype: imp.trxtype, tendertype: imp.tendertype,                                                                                            // :477-478
            c_bankaccount_id: imp.c_bankaccount_id, routingno: imp.routingno, accountno: nul(digits(imp.accountno)), iban: imp.iban, swiftcode: imp.swiftcode,   // :480-483 (setAccountNo = checkNumeric)
            checkno: nul(digits(imp.checkno)), micr: nul(digits(imp.micr)),                                                                              // :484-485
            creditcardnumber: nul(digits(imp.creditcardnumber)), creditcardvv: nul(digits(imp.creditcardvv)), swipe: imp.swipe,                         // :490, :495-496
            dateacct: imp.datetrx, datetrx: imp.datetrx,                                                                                                 // :498-499 DateAcct := DateTrx
            c_bpartner_id: imp.c_bpartner_id, c_invoice_id: imp.c_invoice_id, c_doctype_id: imp.c_doctype_id, c_currency_id: imp.c_currency_id, c_charge_id: imp.c_charge_id,   // :500-504
            chargeamt: imp.chargeamt, taxamt: imp.taxamt == null ? 0 : imp.taxamt,                                                                       // :505-506
            payamt: imp.payamt == null ? 0 : imp.payamt, writeoffamt: imp.writeoffamt == null ? 0 : imp.writeoffamt, discountamt: imp.discountamt == null ? 0 : imp.discountamt,   // :508-511 (MPayment setters: null -> 0)
            a_city: imp.a_city, a_country: imp.a_country, a_email: imp.a_email, a_ident_dl: imp.a_ident_dl, a_ident_ssn: imp.a_ident_ssn, a_name: imp.a_name, a_state: imp.a_state, a_street: imp.a_street, a_zip: imp.a_zip,   // :514-522
            r_authcode: imp.r_authcode, r_info: imp.r_info, r_pnref: imp.r_pnref, r_respmsg: imp.r_respmsg, r_result: imp.r_result, orig_trxid: imp.orig_trxid, voiceauthcode: imp.voiceauthcode, description: imp.description, c_activity_id: imp.c_activity_id   // :523-531
          };
          if (imp.creditcardtype != null) f.creditcardtype = imp.creditcardtype;                                                                          // :488-489
          var mm = nz(imp.creditcardexpmm), yy = nz(imp.creditcardexpyy);
          if (mm !== 0 && mm >= 1 && mm <= 12) f.creditcardexpmm = mm;                                                                                    // :491-492 (+ MPayment.setCreditCardExpMM ignores 0 / >12)
          if (yy !== 0) f.creditcardexpyy = yy > 1999 ? yy - 2000 : yy;                                                                                    // :493-494 (+ MPayment.setCreditCardExpYY)
          var row = ML().newPO(trx, 'c_payment', f), sv;                                                                                                   // new MPayment(m_ctx, 0, trx) :472
          sv = ML().save(trx, 'c_payment', null, row);                                                                                                     // payment.save() :534
          if (!sv.ok) { trx.say('§IMPORT_PAYMENT_SAVE_REFUSED row=' + imp.i_payment_id + ' documentno=' + imp.documentno + ' :: ' + String(sv.error).replace(/\s+/g, ' ').slice(0, 220)); return; }   // legacy: save() false -> the row is skipped silently (stays N)
          var payId = sv.row.c_payment_id;
          var live = trx.get('i_payment', imp.i_payment_id), s2 = ML().save(trx, 'i_payment', live, { c_payment_id: payId, i_isimported: 'Y', processed: 'Y' });   // :536-539 imp.saveEx()
          if (!s2.ok) throw new Error('SaveError i_payment: ' + s2.error);
          noInsert++;                                                                                                                                      // :540
          if (docAction != null && String(docAction).length > 0) {                                                                                         // :542
            var sp = trx.setSavepoint(), ok = false;
            try {
              var before = Object.assign({}, trx.get('c_payment', payId));
              trx.update('c_payment', trx.get('c_payment', payId), { docaction: docAction });                                                              // payment.setDocAction(m_docAction) :544
              var pr = ML().processIt(trx, 'c_payment', payId, docAction);                                                                                 // payment.processIt(m_docAction) :545
              if (!pr || !pr.ok) throw new Error('Payment Process Failed: ' + payId + ' - ' + (pr && pr.msg));                                             // :547 IllegalStateException
              var now = trx.get('c_payment', payId), chg = {};
              Object.keys(now).forEach(function (c) { if (!same(now[c], before[c])) chg[c] = now[c]; });
              if (Object.keys(chg).length) { var s3 = ML().save(trx, 'c_payment', before, chg); if (!s3.ok) throw new Error('SaveError c_payment: ' + s3.error); }   // payment.saveEx() :550
              ok = true;
            } finally { if (!ok) trx.rollbackTo(sp); }
          }
        });
      } catch (e) {                                                                                                                                        // :556-559 log.log(Level.SEVERE, sql, e): logged, the loop ends, the process goes on
        trx.say('§IMPORT_PAYMENT_EXCEPTION ' + String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 300) + ((typeof process !== 'undefined' && process.env && process.env.IMPORT_DEBUG) ? ' ' + (e && e.stack) : ''));
      }

      //	Set Error to indicator to not imported (:561-565)
      load();
      no = step('Set not imported', function (r) { return notY(r) && cc(r); }, function () { return { i_isimported: 'N', updated: nowTs }; });
      flush();
      this.addLog(0, null, A.toBD(String(no)), '@Errors@');                                                                                                // :566
      this.addLog(0, null, A.toBD(String(noInsert)), '@C_Payment_ID@: @Inserted@');                                                                         // :568
      trx.say('§IMPORT_PAYMENT client=' + C + ' org=' + O + ' bank=' + pBank + ' docAction=' + docAction + ' payments=' + noInsert + ' errors=' + no);
      return '';                                                                                                                                         // :569
    };
    return ImportPayment;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

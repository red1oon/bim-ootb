// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ImportInvoice.js - org.compiere.process.ImportInvoice, verbatim (org.adempiere.base.process/src/org/compiere/process/ImportInvoice.java, 815 lines; AD_Process 207 Import_Invoice).
// bim-compiler prompts/MIGRATE_INSTALL_TENANT.md ENGINE-SPEC E3b (open AR/AP invoices on an Opening Charge, the cut-over method of B3-SCOUT) - Witness: W-IMPORT-INVOICE (erp/tests/witness_import_invoice.js).
// Steps in legacy order: (1) the SQL phase :99-510 that fills defaults and marks errors on the I_Invoice rows, (2) the new-BPartner loop :515-640, (3) the invoice loop :651-802 (ONE C_Invoice per
// (BPartner, BPartner Location, DocumentNo), DocumentNo copied from the row, ONE processIt per invoice), (4) the closing "not imported" reset and the answer :804-815 (the Java answer is "", the counts
// go to addLog).
// HOW THE SQL PHASE RUNS: identical to processes/ImportOrder.js (its header explains it in full): ImportInvoice.java issues ~50 DB.executeUpdate statements, each reading what the previous ones wrote, so the
//   SQL phase runs on in-memory working copies of the I_Invoice rows: one JS step per Java statement, same WHERE (SQL three-valued logic: a NULL compares as unknown), same SET, the lookups are the Java
//   subselects run through trx.q with the row's values as parameters, a subselect that returns more than one row fails the statement as PostgreSQL does (DB.executeUpdate logs and returns -1: no row of that
//   statement changes). The copies are written back to the Trx (trx.update = the raw UPDATE, no model events) before the PO-level loops and read again after them.
// NAMED, not faked (each prints §PROC-UNPORTED ImportInvoice ... and writes "ERR=Not ported: ..." into I_ErrorMsg of the row, never a silent skip):
//   (1) :546-553 a BPartner that does not exist yet is created from the names (new MBPartner + setValue/setName + save) - MBPartner's constructor defaults (BP group, price list, payment rule ...) are not ported.
//   (2) :577-593 a Location / BP Location that matches none of the partner's is created (new MLocation + new MBPartnerLocation(bp)).
//   (3) :616-626 a Contact that matches none of the partner's users is created (new MUser(bp)).
//   In each case legacy's own continue/no-save path is kept, so the row ends with legacy's "ERR=No BPartner, " too.
// Twin decisions (stated): (a) a parameter the caller did not send reaches the process as NULL (runJava appends a NULL entry for every declared AD_Process_Para); Java would throw a NullPointerException for
//   AD_Client_ID / AD_Org_ID (the dialog always sends them) and take DocAction null as a processIt(null). The twin reads AD_Process_Para.DefaultValue (207: AD_Org_ID -1, DocAction PR, DeleteOldImported empty) and,
//   where that is empty (AD_Client_ID), the session client; each choice prints §PROC-PARAM. An empty DocAction reaches the process as NULL (runtime parameter mapping), so the default PR applies there too: the invoice is Prepared, not Drafted, unless the caller sends another action. (b) processIt in the
//   twin writes the document straight into the Trx (Java mutates the in-memory MInvoice and saves it afterwards), so the unit [setDocAction + processIt + saveEx] runs behind a Trx savepoint: when processIt
//   or the closing saveEx fails (Java: IllegalStateException, caught at :793-797) its effects are dropped and the header + lines already saved stay - what the database holds after the failed saveEx in legacy.
//   (c) the unique-index refusal comes from ModelLayer.save (ML.uniqueError, B0), logged as §IMPORT_INVOICE_COLLISION. (d) DateValue (:62, m_DateValue) is assigned in legacy but never read: not ported.
//   (e) commitEx() (:510, :649) has no meaning inside the caller's Trx: the working copies are flushed to the Trx at those points instead. (f) MInvoiceLine.beforeSave's default UOM for a charge line (:928-934) is
//   run explicitly (MInvoiceLine_defaultUOM) as processes/CommissionAPInvoice.js does, the twin's shared line hook derives a UOM from a product only.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.ImportInvoice', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function ML() { return X.ML; }
    function nz(v) { return v == null || v === '' ? 0 : Number(v); }
    function ne(a, b) { return a != null && b != null && String(a) !== String(b); }                       // SQL a<>b : NULL is unknown
    function eq(a, b) { return a != null && b != null && String(a) === String(b); }                       // SQL a=b
    function cat(v, s) { return v == null ? null : String(v) + s; }                                       // SQL v||s : NULL||x is NULL
    function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b) && (a == null) === (b == null); }
    function idNum(v) { return ML().isNewId(v) ? 1e15 + Number(String(v).slice(5)) : Number(v); }

    function ImportInvoice() {
      SvrProcess.call(this);
      this.m_AD_Client_ID = 0; this.m_AD_Org_ID = 0; this.m_deleteOldImported = false; this.m_docAction = 'PR';     // :47-55 (MInvoice.DOCACTION_Prepare)
    }
    ImportInvoice.prototype = Object.create(SvrProcess.prototype);

    // ── prepare :63-83 ──────────────────────────────────────────────────────────────────────────────────────
    ImportInvoice.prototype.prepare = function () {
      var trx = this.get_TrxName(), para = this.getParameter(), pid = this.getProcessInfo().AD_Process_ID || 207;
      function dflt(name) { var r = trx.q('SELECT defaultvalue AS d FROM ad_process_para WHERE ad_process_id=? AND columnname=? AND isactive=?', [pid, name, 'Y'])[0]; return r && r.d != null && r.d !== '' ? r.d : null; }
      function note(name, val, src) { trx.say('§PROC-PARAM ImportInvoice ' + name + '=' + val + ' source=' + src); }
      var seen = {};
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (name === 'AD_Client_ID') { seen[name] = 1; this.m_AD_Client_ID = para[i].getParameter() == null ? null : para[i].getParameterAsInt(); }   // :68
        else if (name === 'AD_Org_ID') { seen[name] = 1; this.m_AD_Org_ID = para[i].getParameter() == null ? null : para[i].getParameterAsInt(); }       // :70
        else if (name === 'DeleteOldImported') { seen[name] = 1; this.m_deleteOldImported = para[i].getParameter() == null ? null : 'Y' === para[i].getParameter(); }   // :72
        else if (name === 'DocAction') { seen[name] = 1; this.m_docAction = para[i].getParameter() == null ? null : para[i].getParameter(); }            // :74
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ImportInvoice ' + name);                                                                                 // MProcessPara.validateUnknownParameter :77
      }
      // twin decision (a): a parameter that was not sent takes its AD_Process_Para default
      if (this.m_AD_Client_ID == null || !seen.AD_Client_ID) { var d0 = dflt('AD_Client_ID'); this.m_AD_Client_ID = d0 != null ? Number(d0) : this.getAD_Client_ID(); note('AD_Client_ID', this.m_AD_Client_ID, d0 != null ? 'AD_Process_Para default' : 'session client (no default; Java would throw NullPointerException)'); }
      if (this.m_AD_Org_ID == null || !seen.AD_Org_ID) { var d1 = dflt('AD_Org_ID'); this.m_AD_Org_ID = d1 != null ? Number(d1) : 0; note('AD_Org_ID', this.m_AD_Org_ID, 'AD_Process_Para default'); }
      if (this.m_deleteOldImported == null || !seen.DeleteOldImported) { var d2 = dflt('DeleteOldImported'); this.m_deleteOldImported = 'Y' === d2; note('DeleteOldImported', this.m_deleteOldImported ? 'Y' : 'N', 'AD_Process_Para default'); }
      if (this.m_docAction == null) { var d3 = dflt('DocAction'); this.m_docAction = d3 != null ? d3 : 'PR'; note('DocAction', this.m_docAction, 'AD_Process_Para default'); }
    };

    // ── doIt :90-815 ─────────────────────────────────────────────────────────────────────────────────────
    ImportInvoice.prototype.doIt = function () {
      var self = this, trx = this.get_TrxName(), A = X.A, ctx = this.getCtx(), C = this.m_AD_Client_ID, O = this.m_AD_Org_ID;
      try { trx.q('SELECT 1 AS x FROM i_invoice LIMIT 1'); } catch (e) { throw new Error('I_Invoice has no physical table on this host (AdImportTables.ensure, ENGINE-SPEC E3b)'); }
      var nowTs = A.Env.nowStamp(trx.env);   // getDate()
      var R = [];                                                                                          // working copies of the I_Invoice rows: { id, base, cur }
      function load() { R = trx.find('i_invoice', {}, null, self.m_deleteOldImported ? undefined : { exclude: { i_isimported: 'Y' } }).map(function (r) { return { id: r.i_invoice_id, base: Object.assign({}, r), cur: Object.assign({}, r) }; }); }
      function flush() {                                                                                    // the raw UPDATEs reach the Trx (no model events, like DB.executeUpdate)
        R.forEach(function (w) {
          var ch = {}; Object.keys(w.cur).forEach(function (c) { if (!same(w.cur[c], w.base[c])) ch[c] = w.cur[c]; });
          if (!Object.keys(ch).length) return;
          trx.update('i_invoice', trx.get('i_invoice', w.id), ch); w.base = Object.assign({}, trx.get('i_invoice', w.id));
        });
      }
      function cc(r) { return eq(r.ad_client_id, C); }                                                       // clientCheck " AND AD_Client_ID=" + m_AD_Client_ID
      function notY(r) { return ne(r.i_isimported, 'Y'); }                                                    // I_IsImported<>'Y'
      // one Java statement: where(row) -> bool, set(row) -> {col:value} computed on the pre-statement snapshot; an exception inside = the statement failed (PG error): nothing changes, -1
      function step(label, where, set) {
        var ups = [];
        try { R.forEach(function (w) { if (where(w.cur)) ups.push([w, set(w.cur)]); }); }
        catch (e) { trx.say('§PROC-SQL-ERROR executeUpdate -> -1: ' + ((e && e.message) || e) + ' :: ImportInvoice ' + label); return -1; }
        ups.forEach(function (u) { Object.keys(u[1]).forEach(function (c) { u[0].cur[c] = u[1][c]; }); });
        return ups.length;
      }
      function err(label, text, where, extra) {                                                               // the "Invalid X" statements: I_IsImported='E', I_ErrorMsg=I_ErrorMsg||'ERR=...'
        var no = step(label, function (r) { return where(r) && (extra ? extra(r) : true) && notY(r) && cc(r); }, function (r) { return { i_isimported: 'E', i_errormsg: cat(r.i_errormsg, text) }; });
        if (no !== 0) trx.say('§IMPORT_INVOICE_WARN ' + label + '=' + no + ' (log.warning)');
        return no;
      }
      function scalar(sql, params) { var rs = trx.q(sql, params); if (rs.length > 1) throw new Error('more than one row returned by a subquery used as an expression'); return rs.length ? rs[0][Object.keys(rs[0])[0]] : null; }
      function row1(sql, params) { var rs = trx.q(sql, params); if (rs.length > 1) throw new Error('more than one row returned by a subquery used as an expression'); return rs[0] || null; }
      var no;

      // ****	Prepare	****
      load();
      if (this.m_deleteOldImported) {                                                                         // :99-106 Delete Old Imported
        var del = R.filter(function (w) { return eq(w.cur.i_isimported, 'Y') && cc(w.cur); });
        del.forEach(function (w) { trx.del('i_invoice', trx.get('i_invoice', w.id)); }); R = R.filter(function (w) { return del.indexOf(w) < 0; });
      }
      step('Reset', function (r) { return ne(r.i_isimported, 'Y') || r.i_isimported == null; }, function (r) {   // :108-119 Set Client, Org, IsActive, Created/Updated
        return { ad_client_id: r.ad_client_id != null ? r.ad_client_id : C, ad_org_id: r.ad_org_id != null ? r.ad_org_id : O, isactive: r.isactive != null ? r.isactive : 'Y', created: r.created != null ? r.created : nowTs, createdby: r.createdby != null ? r.createdby : 0,
                 updated: r.updated != null ? r.updated : nowTs, updatedby: r.updatedby != null ? r.updatedby : 0, i_errormsg: ' ', i_isimported: 'N' }; });
      err('Invalid Org', 'ERR=Invalid Org, ', function (r) {                                                   // :121-129
        return r.ad_org_id == null || Number(r.ad_org_id) === 0 || trx.q("SELECT 1 AS x FROM ad_org oo WHERE oo.ad_org_id=? AND (oo.issummary='Y' OR oo.isactive='N')", [r.ad_org_id]).length > 0; });

      //	Document Type - PO - SO
      function docTypeByName(r, baseSql) { return scalar('SELECT c_doctype_id FROM c_doctype d WHERE d.name=? AND d.docbasetype' + baseSql + ' AND ?=d.ad_client_id', [r.doctypename, r.ad_client_id]); }
      step('Set PO DocType', function (r) { return r.c_doctype_id == null && eq(r.issotrx, 'N') && r.doctypename != null && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeByName(r, " IN ('API','APC')") }; });             // :131-136
      step('Set SO DocType', function (r) { return r.c_doctype_id == null && eq(r.issotrx, 'Y') && r.doctypename != null && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeByName(r, " IN ('ARI','ARC')") }; });             // :138-143
      step('Set DocType', function (r) { return r.c_doctype_id == null && r.doctypename != null && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeByName(r, " IN ('API','ARI','APC','ARC')") }; });                    // :145-151
      err('Invalid DocTypeName', 'ERR=Invalid DocTypeName, ', function (r) { return r.c_doctype_id == null && r.doctypename != null; });                                                                                                // :153-159
      //	DocType Default
      function docTypeDefault(r, baseSql) { return scalar("SELECT MAX(c_doctype_id) FROM c_doctype d WHERE d.isdefault='Y' AND d.docbasetype" + baseSql + ' AND ?=d.ad_client_id', [r.ad_client_id]); }
      step('Set PO Default DocType', function (r) { return r.c_doctype_id == null && eq(r.issotrx, 'N') && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeDefault(r, "='API'") }; });                                          // :161-166
      step('Set SO Default DocType', function (r) { return r.c_doctype_id == null && eq(r.issotrx, 'Y') && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeDefault(r, "='ARI'") }; });                                          // :168-173
      step('Set Default DocType', function (r) { return r.c_doctype_id == null && r.issotrx == null && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeDefault(r, " IN ('ARI','API')") }; });                              // :175-180
      err('No DocType', 'ERR=No DocType, ', function (r) { return r.c_doctype_id == null; });                                                                                                                                          // :182-188

      //	Set IsSOTrx
      function dtBase(r, b) { return r.c_doctype_id != null && trx.q('SELECT 1 AS x FROM c_doctype d WHERE ?=d.c_doctype_id AND d.docbasetype=? AND ?=d.ad_client_id', [r.c_doctype_id, b, r.ad_client_id]).length > 0; }
      step('Set IsSOTrx=Y', function (r) { return dtBase(r, 'ARI') && r.c_doctype_id != null && notY(r) && cc(r); }, function () { return { issotrx: 'Y' }; });                                                                                  // :191-196
      step('Set IsSOTrx=N', function (r) { return dtBase(r, 'API') && r.c_doctype_id != null && notY(r) && cc(r); }, function () { return { issotrx: 'N' }; });                                                                                  // :197-202

      // Set Currency
      step('Set Currency', function (r) { return r.c_currency_id == null && r.iso_code != null && notY(r) && cc(r); }, function (r) {                                                                                                  // :205-212
        return { c_currency_id: scalar('SELECT c_currency_id FROM c_currency c WHERE ?=c.iso_code AND c.ad_client_id IN (0,?)', [r.iso_code, r.ad_client_id]) }; });
      no = step('No Currency', function (r) { return r.c_currency_id == null && r.iso_code != null && ne(r.i_isimported, 'E') && notY(r) && cc(r); }, function (r) {                                                                // :214-221 (the text has NO trailing blank and the extra I_IsImported<>'E' term: kept)
        return { i_isimported: 'E', i_errormsg: cat(r.i_errormsg, 'ERR=No Currency,') }; });
      if (no !== 0) trx.say('§IMPORT_INVOICE_WARN No Currency=' + no + ' (log.warning)');

      //	Price List
      step('Set Default Currency PriceList', function (r) { return r.m_pricelist_id == null && notY(r) && cc(r); }, function (r) {                                                                                                     // :224-229
        return { m_pricelist_id: scalar("SELECT MAX(m_pricelist_id) FROM m_pricelist p WHERE p.isdefault='Y' AND p.c_currency_id=? AND p.issopricelist=? AND ?=p.ad_client_id", [r.c_currency_id, r.issotrx, r.ad_client_id]) }; });
      step('Set Default PriceList', function (r) { return r.m_pricelist_id == null && r.c_currency_id == null && notY(r) && cc(r); }, function (r) {                                                                                   // :230-235
        return { m_pricelist_id: scalar("SELECT MAX(m_pricelist_id) FROM m_pricelist p WHERE p.isdefault='Y' AND p.issopricelist=? AND ?=p.ad_client_id", [r.issotrx, r.ad_client_id]) }; });
      step('Set Currency PriceList', function (r) { return r.m_pricelist_id == null && notY(r) && cc(r); }, function (r) {                                                                                                            // :236-241
        return { m_pricelist_id: scalar('SELECT MAX(m_pricelist_id) FROM m_pricelist p WHERE p.c_currency_id=? AND p.issopricelist=? AND ?=p.ad_client_id', [r.c_currency_id, r.issotrx, r.ad_client_id]) }; });
      step('Set PriceList', function (r) { return r.m_pricelist_id == null && r.c_currency_id == null && notY(r) && cc(r); }, function (r) {                                                                                         // :242-247
        return { m_pricelist_id: scalar('SELECT MAX(m_pricelist_id) FROM m_pricelist p WHERE p.issopricelist=? AND ?=p.ad_client_id', [r.issotrx, r.ad_client_id]) }; });
      err('No PriceList', 'ERR=No PriceList, ', function (r) { return r.m_pricelist_id == null; });                                                                                                                                    // :249-256

      //	Payment Term
      step('Set PaymentTerm', function (r) { return r.c_paymentterm_id == null && r.paymenttermvalue != null && notY(r) && cc(r); }, function (r) {                                                                                    // :258-263
        return { c_paymentterm_id: scalar('SELECT c_paymentterm_id FROM c_paymentterm p WHERE ?=p.value AND ?=p.ad_client_id', [r.paymenttermvalue, r.ad_client_id]) }; });
      step('Set Default PaymentTerm', function (r) { return r.c_paymentterm_id == null && r.paymenttermvalue == null && notY(r) && cc(r); }, function (r) {                                                                              // :264-269
        return { c_paymentterm_id: scalar("SELECT MAX(c_paymentterm_id) FROM c_paymentterm p WHERE p.isdefault='Y' AND ?=p.ad_client_id", [r.ad_client_id]) }; });
      err('No PaymentTerm', 'ERR=No PaymentTerm, ', function (r) { return r.c_paymentterm_id == null; });                                                                                                                              // :271-278

      //	Project / Activity / Charge (globalqss)
      step('Set Project', function (r) { return r.c_project_id == null && r.projectvalue != null && notY(r) && cc(r); }, function (r) {                                                                                                 // :281-286
        return { c_project_id: scalar('SELECT c_project_id FROM c_project p WHERE ?=p.value AND ?=p.ad_client_id', [r.projectvalue, r.ad_client_id]) }; });
      err('Invalid Project', 'ERR=Invalid Project, ', function (r) { return r.c_project_id == null && r.projectvalue != null; });                                                                                                        // :287-293
      step('Set Activity', function (r) { return r.c_activity_id == null && r.activityvalue != null && notY(r) && cc(r); }, function (r) {                                                                                               // :295-300
        return { c_activity_id: scalar('SELECT c_activity_id FROM c_activity p WHERE ?=p.value AND ?=p.ad_client_id', [r.activityvalue, r.ad_client_id]) }; });
      err('Invalid Activity', 'ERR=Invalid Activity, ', function (r) { return r.c_activity_id == null && r.activityvalue != null; });                                                                                                    // :301-307
      step('Set Charge', function (r) { return r.c_charge_id == null && r.chargename != null && notY(r) && cc(r); }, function (r) {                                                                                                       // :310-315
        return { c_charge_id: scalar('SELECT c_charge_id FROM c_charge p WHERE ?=p.name AND ?=p.ad_client_id', [r.chargename, r.ad_client_id]) }; });
      err('Invalid Charge', 'ERR=Invalid Charge, ', function (r) { return r.c_charge_id == null && r.chargename != null; });                                                                                                              // :316-322

      //	BP from EMail / ContactName / Value / Default
      step('Set BP from EMail', function (r) { return r.c_bpartner_id == null && r.email != null && notY(r) && cc(r); }, function (r) {                                                                                                  // :326-332
        var u = row1('SELECT c_bpartner_id AS b, ad_user_id AS u FROM ad_user u WHERE ?=u.email AND ?=u.ad_client_id AND u.c_bpartner_id IS NOT NULL', [r.email, r.ad_client_id]);
        return { c_bpartner_id: u ? u.b : null, ad_user_id: u ? u.u : null }; });
      step('Set BP from ContactName', function (r) {                                                                                                                                                                                       // :334-342
        return r.c_bpartner_id == null && r.contactname != null && trx.q('SELECT 1 AS x FROM ad_user u WHERE ?=u.name AND ?=u.ad_client_id AND u.c_bpartner_id IS NOT NULL GROUP BY name HAVING COUNT(*)=1', [r.contactname, r.ad_client_id]).length > 0 && notY(r) && cc(r); },
        function (r) { var u = row1('SELECT c_bpartner_id AS b, ad_user_id AS u FROM ad_user u WHERE ?=u.name AND ?=u.ad_client_id AND u.c_bpartner_id IS NOT NULL', [r.contactname, r.ad_client_id]); return { c_bpartner_id: u ? u.b : null, ad_user_id: u ? u.u : null }; });
      step('Set BP from Value', function (r) { return r.c_bpartner_id == null && r.bpartnervalue != null && notY(r) && cc(r); }, function (r) {                                                                                         // :343-349
        return { c_bpartner_id: scalar('SELECT MAX(c_bpartner_id) FROM c_bpartner bp WHERE ?=bp.value AND ?=bp.ad_client_id', [r.bpartnervalue, r.ad_client_id]) }; });
      step('Set Default BP', function (r) { return r.c_bpartner_id == null && r.bpartnervalue == null && r.name == null && notY(r) && cc(r); }, function (r) {                                                                          // :351-358 (AD_ClientInfo.C_BPartnerCashTrx_ID)
        return { c_bpartner_id: scalar('SELECT c_bpartnercashtrx_id FROM ad_clientinfo c WHERE ?=c.ad_client_id', [r.ad_client_id]) }; });

      //	Set Country / Region
      step('Set Country', function (r) { return r.c_bpartner_id == null && r.c_country_id == null && r.countrycode != null && notY(r) && cc(r); }, function (r) {                                                                       // :360-367
        return { c_country_id: scalar('SELECT c_country_id FROM c_country c WHERE ?=c.countrycode AND c.ad_client_id IN (0, ?)', [r.countrycode, r.ad_client_id]) }; });
      err('Invalid Country', 'ERR=Invalid Country, ', function (r) { return r.c_bpartner_id == null && r.c_country_id == null; });                                                                                                      // :368-375 (no CountryCode term in legacy's WHERE: kept)
      step('Set Region Default', function (r) { return r.c_bpartner_id == null && r.c_region_id == null && r.regionname == null && notY(r) && cc(r); }, function (r) {                                                                  // :377-384
        return { regionname: scalar("SELECT MAX(name) FROM c_region r WHERE r.isdefault='Y' AND r.c_country_id=? AND r.ad_client_id IN (0, ?)", [r.c_country_id, r.ad_client_id]) }; });
      step('Set Region', function (r) { return r.c_bpartner_id == null && r.c_region_id == null && r.regionname != null && notY(r) && cc(r); }, function (r) {                                                                           // :386-393
        return { c_region_id: scalar('SELECT c_region_id FROM c_region r WHERE r.name=? AND r.c_country_id=? AND r.ad_client_id IN (0, ?)', [r.regionname, r.c_country_id, r.ad_client_id]) }; });
      err('Invalid Region', 'ERR=Invalid Region, ', function (r) {                                                                                                                                                                         // :395-403
        return r.c_bpartner_id == null && r.c_region_id == null && trx.q("SELECT 1 AS x FROM c_country c WHERE c.c_country_id=? AND c.hasregion='Y'", [r.c_country_id]).length > 0; });

      //	Existing Location ? Exact Match
      step('Found Location', function (r) { return r.c_bpartner_id != null && r.c_bpartner_location_id == null && eq(r.i_isimported, 'N') && cc(r); }, function (r) {                                                                       // :406-419
        var l = row1('SELECT bpl.c_bpartner_location_id AS id FROM c_bpartner_location bpl INNER JOIN c_location l ON (bpl.c_location_id=l.c_location_id) WHERE ?=bpl.c_bpartner_id AND bpl.ad_client_id=?' +
          ' AND ((? IS NULL AND l.address1 IS NULL) OR ?=l.address1) AND ((? IS NULL AND l.address2 IS NULL) OR ?=l.address2) AND ((? IS NULL AND l.city IS NULL) OR ?=l.city) AND ((? IS NULL AND l.postal IS NULL) OR ?=l.postal)' +
          ' AND COALESCE(?,0)=COALESCE(l.c_region_id,0) AND COALESCE(?,0)=COALESCE(l.c_country_id,0)',
          [r.c_bpartner_id, r.ad_client_id, r.address1, r.address1, r.address2, r.address2, r.city, r.city, r.postal, r.postal, r.c_region_id, r.c_country_id]);
        return { c_bpartner_location_id: l ? l.id : null }; });
      step('Set BP Location from BP', function (r) { return r.c_bpartner_id != null && r.c_bpartner_location_id == null && notY(r) && cc(r); }, function (r) {                                                                              // :421-429
        return { c_bpartner_location_id: scalar("SELECT MAX(c_bpartner_location_id) FROM c_bpartner_location l WHERE l.c_bpartner_id=? AND ?=l.ad_client_id AND ((l.isbillto='Y' AND ?='Y') OR ?='N')", [r.c_bpartner_id, r.ad_client_id, r.issotrx, r.issotrx]) }; });
      err('No BP Location', 'ERR=No BP Location, ', function (r) { return r.c_bpartner_id != null && r.c_bpartner_location_id == null; });                                                                                                // :431-438

      //	Product
      step('Set Product from Value', function (r) { return r.m_product_id == null && r.productvalue != null && notY(r) && cc(r); }, function (r) {                                                                                       // :440-445
        return { m_product_id: scalar('SELECT MAX(m_product_id) FROM m_product p WHERE ?=p.value AND ?=p.ad_client_id', [r.productvalue, r.ad_client_id]) }; });
      step('Set Product from UPC', function (r) { return r.m_product_id == null && r.upc != null && notY(r) && cc(r); }, function (r) {                                                                                                  // :447-452
        return { m_product_id: scalar('SELECT MAX(m_product_id) FROM m_product p WHERE ?=p.upc AND ?=p.ad_client_id', [r.upc, r.ad_client_id]) }; });
      step('Set Product from SKU', function (r) { return r.m_product_id == null && r.sku != null && notY(r) && cc(r); }, function (r) {                                                                                                  // :454-459
        return { m_product_id: scalar('SELECT MAX(m_product_id) FROM m_product p WHERE ?=p.sku AND ?=p.ad_client_id', [r.sku, r.ad_client_id]) }; });
      err('Invalid Product', 'ERR=Invalid Product, ', function (r) { return r.m_product_id == null && (r.productvalue != null || r.upc != null || r.sku != null); });                                                                      // :461-468
      err('Product and Charge', 'ERR=Product and Charge, ', function (r) { return r.m_product_id != null && r.c_charge_id != null; });                                                                                                     // :470-477 (globalqss: charge and product are exclusive)

      //	Tax
      step('Set Tax', function (r) { return r.c_tax_id == null && r.taxindicator != null && notY(r) && cc(r); }, function (r) {                                                                                                           // :479-484
        return { c_tax_id: scalar('SELECT MAX(c_tax_id) FROM c_tax t WHERE ?=t.taxindicator AND ?=t.ad_client_id', [r.taxindicator, r.ad_client_id]) }; });
      err('Invalid Tax', 'ERR=Invalid Tax, ', function (r) { return r.c_tax_id == null && r.taxindicator != null; });                                                                                                                       // :486-493

      // Set 1099 Box
      step('Set C_1099Box_ID', function (r) { return r.c_1099box_id == null && r.c_1099box_value != null && notY(r) && eq(r.issotrx, 'N') && cc(r); }, function (r) {                                                                  // :495-501
        return { c_1099box_id: scalar('SELECT c_1099box_id FROM c_1099box a WHERE ?=a.value AND a.ad_client_id=?', [r.c_1099box_value, r.ad_client_id]) }; });
      err('Invalid C_1099Box_Value', 'ERR=Invalid C_1099Box_Value, ', function (r) { return r.c_1099box_id == null && r.c_1099box_value != null; }, function (r) { return eq(r.issotrx, 'N'); });                                       // :502-509

      flush();                                                                                               // commitEx() :510 - the raw UPDATEs are in the Trx before the PO-level loops

      // -- New BPartner ---------------------------------------------------
      //	Go through Invoice Records w/o C_BPartner_ID (:515-640)
      function equalsNull(c1, c2) { return String(c1 == null ? '' : c1).toLowerCase() === String(c2 == null ? '' : c2).toLowerCase(); }   // MLocation.equalsNull (case-insensitive, null = "")
      function unported(imp, branch, javaLines) {
        trx.say('§PROC-UNPORTED ImportInvoice ' + branch + ' (ImportInvoice.java:' + javaLines + ') row=' + imp.i_invoice_id + ' bpartnervalue=' + imp.bpartnervalue + ' name=' + imp.name);
        var live = trx.get('i_invoice', imp.i_invoice_id), msg = cat(live.i_errormsg, 'ERR=Not ported: ' + branch + ', ');
        var sv = ML().save(trx, 'i_invoice', live, { i_errormsg: msg }); if (!sv.ok) throw new Error('SaveError i_invoice: ' + sv.error);
      }
      var bpRows = trx.find('i_invoice', {}, null, { exclude: { i_isimported: 'Y' } }).filter(function (r) { return eq(r.i_isimported, 'N') && r.c_bpartner_id == null && cc(r); }).sort(function (a, b) { return idNum(a.i_invoice_id) - idNum(b.i_invoice_id); });
      bpRows.forEach(function (rec) {
        var imp = Object.assign({}, rec);
        if (imp.bpartnervalue == null) { if (imp.email != null) imp.bpartnervalue = imp.email; else if (imp.name != null) imp.bpartnervalue = imp.name; else return; }   // :526-534 (continue)
        if (imp.name == null) { if (imp.contactname != null) imp.name = imp.contactname; else imp.name = imp.bpartnervalue; }                                          // :535-541
        //	BPartner
        var bp = imp.bpartnervalue != null && String(imp.bpartnervalue).length ? trx.q('SELECT * FROM c_bpartner WHERE value=? AND ad_client_id=?', [imp.bpartnervalue, self.getAD_Client_ID()])[0] : null;   // MBPartner.get(ctx, Value, trx) :543
        if (!bp) { unported(imp, 'new BPartner from names', '546-553'); return; }
        imp.c_bpartner_id = bp.c_bpartner_id;                                                                                                                        // :554
        //	BP Location
        var bpl = null, bpls = trx.q("SELECT * FROM c_bpartner_location WHERE c_bpartner_id=? AND isactive='Y' ORDER BY c_bpartner_location_id", [bp.c_bpartner_id]);          // bp.getLocations(true) :557
        for (var i = 0; bpl == null && i < bpls.length; i++) {
          if (nz(imp.c_bpartner_location_id) === nz(bpls[i].c_bpartner_location_id)) bpl = bpls[i];                                                                  // :560-561
          else if (nz(imp.c_location_id) === nz(bpls[i].c_location_id)) bpl = bpls[i];                                                                               // Same Location ID :563-565
          else if (nz(imp.c_location_id) === 0) {                                                                                                                   // Same Location Info :567-575
            var loc = trx.q('SELECT * FROM c_location WHERE c_location_id=?', [bpls[i].c_location_id])[0] || {};
            if ((nz(imp.c_country_id) === 0 || nz(loc.c_country_id) === nz(imp.c_country_id)) && (nz(imp.c_region_id) === 0 || nz(loc.c_region_id) === nz(imp.c_region_id)) &&
                equalsNull(imp.postal, loc.postal) && equalsNull('', loc.postal_add) && equalsNull(imp.city, loc.city) && equalsNull(imp.address1, loc.address1) && equalsNull(imp.address2, loc.address2)) bpl = bpls[i];
          }
        }
        if (bpl == null) { unported(imp, 'new Location / BP Location', '577-593'); return; }                                                                        // New Location (MLocation + MBPartnerLocation)
        imp.c_location_id = bpl.c_location_id; imp.c_bpartner_location_id = bpl.c_bpartner_location_id;                                                              // :594-595
        //	User/Contact
        if (imp.contactname != null || imp.email != null || imp.phone != null) {                                                                                     // :598-600
          var users = trx.q("SELECT * FROM ad_user WHERE c_bpartner_id=? AND isactive = 'Y' ORDER BY ad_user_id", [bp.c_bpartner_id]), user = null;                    // bp.getContacts(true)
          for (var j = 0; user == null && j < users.length; j++) {
            var nm = users[j].name;
            if (nm === imp.contactname || nm === imp.name) { user = users[j]; imp.ad_user_id = user.ad_user_id; }                                                    // :605-610
          }
          if (user == null) { unported(imp, 'new Contact (AD_User)', '616-626'); return; }
        }
        var live = trx.get('i_invoice', imp.i_invoice_id), ch = {}; Object.keys(imp).forEach(function (c) { if (!same(imp[c], live[c])) ch[c] = imp[c]; });
        if (Object.keys(ch).length) { var sv = ML().save(trx, 'i_invoice', live, ch); if (!sv.ok) throw new Error('SaveError i_invoice: ' + sv.error); }                  // imp.saveEx() :627
      });
      load();
      err('No BPartner', 'ERR=No BPartner, ', function (r) { return r.c_bpartner_id == null; });                // :641-647
      flush();                                                                                               // commitEx() :649

      // -- New Invoices ---------------------------------------------------
      var noInsert = 0, noInsertLine = 0, MI = G().MI(), CT = G().ctor(), docAction = this.m_docAction;
      var impRows = trx.find('i_invoice', {}, null, { exclude: { i_isimported: 'Y' } }).filter(function (r) { return eq(r.i_isimported, 'N') && cc(r); }).sort(function (a, b) {                                // :657-659 ORDER BY C_BPartner_ID, C_BPartner_Location_ID, I_Invoice_ID
        function nl(x) { return x == null ? 1e18 : Number(x); }
        return (nl(a.c_bpartner_id) - nl(b.c_bpartner_id)) || (nl(a.c_bpartner_location_id) - nl(b.c_bpartner_location_id)) || (idNum(a.i_invoice_id) - idNum(b.i_invoice_id)); });
      var oldBP = 0, oldLoc = 0, oldDocNo = '', invoice = null, lineNo = 0;
      // :682-692 / :783-792: setDocAction + processIt + saveEx for the finished invoice, behind a savepoint (twin decision b)
      function finishInvoice() {
        if (!invoice) return;
        var id = invoice.id(), sp = trx.setSavepoint(), ok = false;
        try {
          if (docAction != null && String(docAction).length > 0) {
            var before = Object.assign({}, trx.get('c_invoice', id));
            trx.update('c_invoice', trx.get('c_invoice', id), { docaction: docAction });                                    // invoice.setDocAction(m_docAction)
            var pr = ML().processIt(trx, 'c_invoice', id, docAction);                                                      // invoice.processIt(m_docAction)
            if (!pr || !pr.ok) throw new Error('Invoice Process Failed: ' + id + ' - ' + (pr && pr.msg));                     // :684-687 IllegalStateException
            var now = trx.get('c_invoice', id), chg = {};
            Object.keys(now).forEach(function (c) { if (!same(now[c], before[c])) chg[c] = now[c]; });
            if (Object.keys(chg).length) { var sv = ML().save(trx, 'c_invoice', before, chg); if (!sv.ok) throw new Error('SaveError c_invoice: ' + sv.error); }   // invoice.saveEx() :689
          }
          ok = true;
        } finally { if (!ok) trx.rollbackTo(sp); }
      }
      // MInvoiceLine.setPrice() :429-443 -> setPrice(M_PriceList_ID, C_BPartner_ID) :445-469 (Core.getProductPricing().setInvoiceLine + setM_PriceList_ID); the same call model_invoice.js ilBeforeSaveChecks makes
      function ilSetPrice(line, inv) {
        if (nz(line.get('m_product_id')) === 0 || line.get('isdescription') === 'Y') return;                                  // :431, :449
        if (!nz(inv.m_pricelist_id) || !nz(inv.c_bpartner_id)) throw new Error('setPrice - PriceList unknown!');             // :435-438
        var bd = function (v) { return A.toBD(String(v == null ? 0 : v)); };
        var mpp = new A.RUNTIME.M.MProductPricing();
        mpp.setInvoiceLine({ getM_Product_ID: function () { return nz(line.get('m_product_id')); }, getC_Invoice_ID: function () { return nz(line.get('c_invoice_id')); },
          getQtyInvoiced: function () { return bd(line.get('qtyinvoiced')); }, getQtyEntered: function () { return bd(line.get('qtyentered')); } }, trx);               // :452
        mpp.setM_PriceList_ID(nz(inv.m_pricelist_id));                                                                         // :453
        line.set('priceactual', mpp.getPriceStd()).set('pricelist', mpp.getPriceList()).set('pricelimit', mpp.getPriceLimit()); // :455-457
        var qe = bd(line.get('qtyentered')), qi = bd(line.get('qtyinvoiced'));
        if (qe.compareTo(qi) === 0) line.set('priceentered', line.get('priceactual')); else line.set('priceentered', bd(line.get('priceactual')).multiply(qi.divide(qe, 6, A.RoundingMode.HALF_UP)));   // :459-463
        if (nz(line.get('c_uom_id')) === 0) line.set('c_uom_id', mpp.getC_UOM_ID());                                          // :464-465
      }
      try {
        impRows.forEach(function (rec) {
          var imp = Object.assign({}, rec), cmpDocNo = imp.documentno == null ? '' : String(imp.documentno);
          //	New Invoice
          if (oldBP !== nz(imp.c_bpartner_id) || oldLoc !== nz(imp.c_bpartner_location_id) || oldDocNo !== cmpDocNo) {                                                             // :678-680
            if (invoice != null) { finishInvoice(); }                                                                                                                               // :681-690
            oldBP = nz(imp.c_bpartner_id); oldLoc = nz(imp.c_bpartner_location_id);                                                                                                  // :692-693
            oldDocNo = imp.documentno == null ? '' : String(imp.documentno);                                                                                                         // :694-696
            //
            var o = MI.MInvoice_new(trx);                                                                                                                                            // new MInvoice(getCtx(), 0, trx) :698
            o.set('ad_client_id', imp.ad_client_id).set('ad_org_id', imp.ad_org_id);                                                                                                 // setClientOrg :699
            o.set('c_doctypetarget_id', imp.c_doctype_id);                                                                                                                           // :700
            o.set('issotrx', imp.issotrx === 'Y' ? 'Y' : 'N');                                                                                                                       // :701
            if (imp.documentno != null) o.set('documentno', imp.documentno);                                                                                                         // :702-703 the DocumentNo of the row IS the invoice's
            //
            o.set('c_bpartner_id', imp.c_bpartner_id); o.set('c_bpartner_location_id', imp.c_bpartner_location_id);                                                                  // :705-706
            if (nz(imp.ad_user_id) !== 0) o.set('ad_user_id', imp.ad_user_id);                                                                                                       // :707-708
            //
            if (imp.description != null) o.set('description', imp.description);                                                                                                      // :710-711
            o.set('c_paymentterm_id', imp.c_paymentterm_id); o.set('m_pricelist_id', imp.m_pricelist_id);                                                                            // :712-713
            { const plr = imp.m_pricelist_id != null ? trx.get('m_pricelist', imp.m_pricelist_id) : null; if (plr && plr.m_pricelist_id != null) o.set('istaxincluded', plr.istaxincluded); }   // MInvoice.beforeSave takes IsTaxIncluded from the price list (:1219-1239 priceListImmutable family); stated here as ImportOrder.js does for MOrder.setM_PriceList_ID
            //	SalesRep from Import or the person running the import
            if (nz(imp.salesrep_id) !== 0) o.set('salesrep_id', imp.salesrep_id);                                                                                                    // :715-716
            if (nz(o.get('salesrep_id')) === 0) o.set('salesrep_id', self.getAD_User_ID());                                                                                          // :717-718
            //
            if (nz(imp.ad_orgtrx_id) !== 0) o.set('ad_orgtrx_id', imp.ad_orgtrx_id);                                                                                                 // :720-721
            if (nz(imp.c_activity_id) !== 0) o.set('c_activity_id', imp.c_activity_id);                                                                                              // :722-723
            if (nz(imp.c_campaign_id) !== 0) o.set('c_campaign_id', imp.c_campaign_id);                                                                                              // :724-725
            if (nz(imp.c_project_id) !== 0) o.set('c_project_id', imp.c_project_id);                                                                                                 // :726-727
            //
            if (imp.dateinvoiced != null) o.set('dateinvoiced', imp.dateinvoiced);                                                                                                   // :729-730
            if (imp.dateacct != null) o.set('dateacct', imp.dateacct);                                                                                                               // :731-732
            //
            MI.MInvoice_beforeSaveNew(trx, o, ctx);                                                                                                                                  // MInvoice.beforeSave defaults (new record) :1144-1283 - model_invoice.js
            try { G().saveEx(o); }                                                                                                                                                   // invoice.saveEx() :734
            catch (e) { var m = /violates unique constraint "([^"]+)"/.exec(String(e && e.message)); if (m) trx.say('§IMPORT_INVOICE_COLLISION index=' + m[1] + ' documentno=' + imp.documentno + ' bpartner=' + imp.c_bpartner_id + ' row=' + imp.i_invoice_id + ' (' + String(e.message).replace(/\s+/g, ' ').slice(0, 220) + ')'); throw e; }
            invoice = o; noInsert++;
            lineNo = 10;                                                                                                                                                             // :736
          }
          var ch = { c_invoice_id: invoice.id() };                                                                                                                                   // imp.setC_Invoice_ID(invoice.getC_Invoice_ID()) :738
          var invRow = function () { return trx.get('c_invoice', invoice.id()); };
          //	New InvoiceLine
          var line = CT.MInvoiceLine(trx, invoice);                                                                                                                                  // new MInvoiceLine(invoice) :740
          if (imp.linedescription != null) line.set('description', imp.linedescription);                                                                                             // :741-742
          line.set('line', lineNo); lineNo += 10;                                                                                                                                    // :743-744
          if (nz(imp.m_product_id) !== 0) {                                                                                                                                          // :745-746 line.setM_Product_ID(id, true) = setProduct: product + its UOM, ASI 0
            var prod = trx.get('m_product', imp.m_product_id);
            line.set('m_product_id', imp.m_product_id); line.set('c_uom_id', prod ? prod.c_uom_id : null); line.set('m_attributesetinstance_id', 0);
          }
          // globalqss - import invoice with charges
          if (nz(imp.c_charge_id) !== 0) line.set('c_charge_id', imp.c_charge_id);                                                                                                   // :748-749
          // globalqss - [2855673] - assign dimensions to lines also in case they're different
          if (nz(imp.c_activity_id) !== 0) line.set('c_activity_id', imp.c_activity_id);                                                                                             // :751-752
          if (nz(imp.c_campaign_id) !== 0) line.set('c_campaign_id', imp.c_campaign_id);                                                                                             // :753-754
          if (nz(imp.c_project_id) !== 0) line.set('c_project_id', imp.c_project_id);                                                                                                // :755-756
          //
          CT.ilSetQty(trx, line, A.toBD(String(imp.qtyordered == null ? 0 : imp.qtyordered)));                                                                                       // line.setQty(imp.getQtyOrdered()) :758 = setQtyEntered (entered-UOM precision) then QtyInvoiced := QtyEntered (product-UOM precision)
          ilSetPrice(line, invRow());                                                                                                                                                // line.setPrice() :759
          var pa = A.toBD(String(imp.priceactual == null ? 0 : imp.priceactual));
          if (pa.compareTo(A.Env.ZERO) !== 0) { line.set('priceentered', pa).set('priceactual', pa); }                                                                               // :760-762 line.setPrice(imp.getPriceActual())
          if (nz(imp.c_tax_id) !== 0) line.set('c_tax_id', imp.c_tax_id);                                                                                                            // :763-764
          else {                                                                                                                                                                     // :765-769 line.setTax(); imp.setC_Tax_ID(line.getC_Tax_ID())
            MI.MInvoiceLine_setTax(trx, ctx, line, invRow());                                                                                                                        // (its boolean is ignored, as in Java; a missing tax fails line.saveEx on the mandatory column)
            ch.c_tax_id = line.get('c_tax_id');
          }
          var ta = imp.taxamt == null ? null : A.toBD(String(imp.taxamt));
          if (ta != null && ta.compareTo(A.Env.ZERO) !== 0) line.set('taxamt', ta);                                                                                                  // :771-772
          line.set('c_1099box_id', ML().idSet(imp.c_1099box_id) ? imp.c_1099box_id : null);                                                                                             // :773 setC_1099Box_ID(int): < 1 = NULL
          MI.MInvoiceLine_defaultUOM(trx, ctx, line);                                                                                                                                // twin decision (f): MInvoiceLine.beforeSave :928-934
          G().saveEx(line);                                                                                                                                                          // line.saveEx() :774
          ch.c_invoiceline_id = line.id(); ch.i_isimported = 'Y'; ch.processed = 'Y';                                                                                                // :776-778
          var live = trx.get('i_invoice', imp.i_invoice_id), sv2 = ML().save(trx, 'i_invoice', live, ch);                                                                            // imp.save() :780
          if (sv2.ok) noInsertLine++; else trx.say('§IMPORT_INVOICE_WARN imp.save() refused for I_Invoice ' + imp.i_invoice_id + ': ' + sv2.error);
        });
        if (invoice != null) finishInvoice();                                                                                                                                        // :783-792
      } catch (e) {                                                                                                                                                                  // :793-797 log.log(Level.SEVERE, "CreateInvoice", e): logged, the loop ends, the process goes on
        trx.say('§IMPORT_INVOICE_EXCEPTION ' + String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 300) + ((typeof process !== 'undefined' && process.env && process.env.IMPORT_DEBUG) ? ' ' + (e && e.stack) : ''));
        var mm = /violates unique constraint "([^"]+)"/.exec(String(e && e.message));
        if (mm && !trx.log.some(function (l) { return l.indexOf('§IMPORT_INVOICE_COLLISION') === 0 && l.indexOf('index=' + mm[1]) > 0; }))
          trx.say('§IMPORT_INVOICE_COLLISION index=' + mm[1] + ' documentno=' + (invoice ? invoice.get('documentno') : '?') + ' bpartner=' + (invoice ? invoice.get('c_bpartner_id') : '?') + ' (' + String(e.message).replace(/\s+/g, ' ').slice(0, 220) + ')');
      }

      //	Set Error to indicator to not imported (:804-808)
      load();
      no = step('Set not imported', function (r) { return notY(r) && cc(r); }, function () { return { i_isimported: 'N', updated: nowTs }; });
      flush();
      this.addLog(0, null, A.toBD(String(no)), '@Errors@');                                                                                                                          // :809
      this.addLog(0, null, A.toBD(String(noInsert)), '@C_Invoice_ID@: @Inserted@');                                                                                                  // :811
      this.addLog(0, null, A.toBD(String(noInsertLine)), '@C_InvoiceLine_ID@: @Inserted@');                                                                                          // :812
      trx.say('§IMPORT_INVOICE client=' + C + ' org=' + O + ' docAction=' + docAction + ' invoices=' + noInsert + ' lines=' + noInsertLine + ' errors=' + no);
      return '';                                                                                                                                                                     // :813 return ""
    };
    return ImportInvoice;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ImportOrder.js - org.compiere.process.ImportOrder, verbatim (org.adempiere.base.process/src/org/compiere/process/ImportOrder.java, 809 lines; AD_Process 206 Import_Order).
// bim-compiler prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §13.2 B2, prompts/TEAMWORK_FRAMEWORK.md §38.8 - Witness: W-IMPORT-ORDER (erp/tests/witness_import_order.js).
// Steps in legacy order: (1) the SQL phase :99-490 that fills defaults and marks errors on the I_Order rows, (2) the new-BPartner loop :495-631, (3) the order loop :633-794 (ONE C_Order per
// (BPartner, BillTo, Location, DocumentNo), DocumentNo copied from the row, ONE processIt per order), (4) the closing "not imported" reset and the answer "#orders/lines" :796-808.
// HOW THE SQL PHASE RUNS: ImportOrder.java issues ~60 DB.executeUpdate statements, each reading what the previous ones wrote. The twin's raw-SQL bridge (ad_process.js processDB.executeUpdateEx) evaluates a statement
//   against the committed tables, so a statement could not see an earlier one's pending writes (its named limit). The SQL phase therefore runs on in-memory working copies of the I_Order rows: one JS step per Java
//   statement, same WHERE (SQL three-valued logic: a NULL compares as unknown), same SET, the lookups (C_DocType, M_PriceList, ...) are the Java subselects run through trx.q with the row's values as parameters, a
//   subselect that returns more than one row fails the statement as PostgreSQL does (DB.executeUpdate logs and returns -1: no row of that statement changes). The copies are written back to the Trx
//   (trx.update = the raw UPDATE, no model events) before the PO-level loops and read again after them. The I_Order rows read are the transaction's own view (pending inserts of the caller included).
//   Master data read by the lookups is the committed tables (rows the same transaction created are not seen).
// NAMED, not faked (each prints §PROC-UNPORTED ImportOrder ... and writes "ERR=Not ported: ..." into I_ErrorMsg of the row, never a silent skip):
//   (1) :524-535 a BPartner that does not exist yet is created from the names (new MBPartner + setValue/setName + save) - MBPartner's constructor defaults (BP group, price list, payment rule ...) are not ported.
//   (2) :558-576 a Location / BP Location that matches none of the partner's is created (new MLocation + new MBPartnerLocation(bp)).
//   (3) :596-606 a Contact that matches none of the partner's users is created (new MUser(bp)).
//   In each case legacy's own continue/no-save path is kept, so the row ends with legacy's "ERR=No BPartner, " too.
// Twin decisions (stated): (a) a parameter the caller did not send reaches the process as NULL (runJava appends a NULL entry for every declared AD_Process_Para); Java would throw a NullPointerException for AD_Client_ID /
//   AD_Org_ID (the dialog always sends them) and take DocAction null as "no processing". The twin reads AD_Process_Para.DefaultValue (206: AD_Org_ID -1, DocAction PR, DeleteOldImported N) and, where that is empty
//   (AD_Client_ID), the session client; each choice prints §PROC-PARAM. (b) processIt in the twin writes the document straight into the Trx (Java mutates the in-memory MOrder and saves it afterwards), so the
//   unit [setDocAction + processIt + saveEx] runs behind a Trx savepoint: when processIt or the closing saveEx fails (Java: IllegalStateException / DB exception, caught at :786-790) its effects are dropped and
//   the header + lines already saved stay - what the database holds after the failed saveEx in legacy. (c) the unique-index refusal comes from ModelLayer.save (ML.uniqueError, B0), logged as §IMPORT_ORDER_COLLISION.
//   (d) DateValue (:65-66, m_DateValue) is assigned in legacy but never read, so it is not ported.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.ImportOrder', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function ML() { return X.ML; }
    function nz(v) { return v == null || v === '' ? 0 : Number(v); }
    function ne(a, b) { return a != null && b != null && String(a) !== String(b); }                       // SQL a<>b : NULL is unknown
    function eq(a, b) { return a != null && b != null && String(a) === String(b); }                       // SQL a=b
    function cat(v, s) { return v == null ? null : String(v) + s; }                                       // SQL v||s : NULL||x is NULL
    function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b) && (a == null) === (b == null); }
    function idNum(v) { return ML().isNewId(v) ? 1e15 + Number(String(v).slice(5)) : Number(v); }

    function ImportOrder() {
      SvrProcess.call(this);
      this.m_AD_Client_ID = 0; this.m_AD_Org_ID = 0; this.m_deleteOldImported = false; this.m_docAction = 'PR';     // :54-61 (MOrder.DOCACTION_Prepare)
    }
    ImportOrder.prototype = Object.create(SvrProcess.prototype);

    // ── prepare :69-86 ──────────────────────────────────────────────────────────────────────────────────────
    ImportOrder.prototype.prepare = function () {
      var trx = this.get_TrxName(), para = this.getParameter(), pid = this.getProcessInfo().AD_Process_ID || 206;
      function dflt(name) { var r = trx.q('SELECT defaultvalue AS d FROM ad_process_para WHERE ad_process_id=? AND columnname=? AND isactive=?', [pid, name, 'Y'])[0]; return r && r.d != null && r.d !== '' ? r.d : null; }
      function note(name, val, src) { trx.say('§PROC-PARAM ImportOrder ' + name + '=' + val + ' source=' + src); }
      var seen = {};
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (name === 'AD_Client_ID') { seen[name] = 1; this.m_AD_Client_ID = para[i].getParameter() == null ? null : para[i].getParameterAsInt(); }   // :73
        else if (name === 'AD_Org_ID') { seen[name] = 1; this.m_AD_Org_ID = para[i].getParameter() == null ? null : para[i].getParameterAsInt(); }       // :75
        else if (name === 'DeleteOldImported') { seen[name] = 1; this.m_deleteOldImported = para[i].getParameter() == null ? null : 'Y' === para[i].getParameter(); }   // :77
        else if (name === 'DocAction') { seen[name] = 1; this.m_docAction = para[i].getParameter() == null ? null : para[i].getParameter(); }            // :79
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ImportOrder ' + name);                                                                                 // MProcessPara.validateUnknownParameter :81
      }
      // twin decision (a): a parameter that was not sent takes its AD_Process_Para default
      if (this.m_AD_Client_ID == null || !seen.AD_Client_ID) { var d0 = dflt('AD_Client_ID'); this.m_AD_Client_ID = d0 != null ? Number(d0) : this.getAD_Client_ID(); note('AD_Client_ID', this.m_AD_Client_ID, d0 != null ? 'AD_Process_Para default' : 'session client (no default; Java would throw NullPointerException)'); }
      if (this.m_AD_Org_ID == null || !seen.AD_Org_ID) { var d1 = dflt('AD_Org_ID'); this.m_AD_Org_ID = d1 != null ? Number(d1) : 0; note('AD_Org_ID', this.m_AD_Org_ID, 'AD_Process_Para default'); }
      if (this.m_deleteOldImported == null || !seen.DeleteOldImported) { var d2 = dflt('DeleteOldImported'); this.m_deleteOldImported = 'Y' === d2; note('DeleteOldImported', this.m_deleteOldImported ? 'Y' : 'N', 'AD_Process_Para default'); }
      if (this.m_docAction == null) { var d3 = dflt('DocAction'); this.m_docAction = d3 != null ? d3 : 'PR'; note('DocAction', this.m_docAction, 'AD_Process_Para default'); }
    };

    // ── doIt :93-808 ─────────────────────────────────────────────────────────────────────────────────────
    ImportOrder.prototype.doIt = function () {
      var self = this, trx = this.get_TrxName(), A = X.A, ctx = this.getCtx(), C = this.m_AD_Client_ID, O = this.m_AD_Org_ID;
      try { trx.q('SELECT 1 AS x FROM i_order LIMIT 1'); } catch (e) { throw new Error('I_Order has no physical table on this host (AdImportTables.ensure, TEAM_REPLICATION_PLUGIN_STUDY §13.2 B1)'); }
      var nowTs = trx.env.now || (trx.env.nowMillis != null ? new Date(trx.env.nowMillis).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' '));   // getDate()
      var R = [];                                                                                          // working copies of the I_Order rows: { id, base, cur }
      function load() { R = trx.find('i_order', {}, null, self.m_deleteOldImported ? undefined : { exclude: { i_isimported: 'Y' } }).map(function (r) { return { id: r.i_order_id, base: Object.assign({}, r), cur: Object.assign({}, r) }; }); }
      function flush() {                                                                                    // the raw UPDATEs reach the Trx (no model events, like DB.executeUpdate)
        R.forEach(function (w) {
          var ch = {}; Object.keys(w.cur).forEach(function (c) { if (!same(w.cur[c], w.base[c])) ch[c] = w.cur[c]; });
          if (!Object.keys(ch).length) return;
          trx.update('i_order', trx.get('i_order', w.id), ch); w.base = Object.assign({}, trx.get('i_order', w.id));
        });
      }
      function cc(r) { return eq(r.ad_client_id, C); }                                                       // clientCheck " AND AD_Client_ID=" + m_AD_Client_ID
      function notY(r) { return ne(r.i_isimported, 'Y'); }                                                    // I_IsImported<>'Y'
      // one Java statement: where(row) -> bool, set(row) -> {col:value} computed on the pre-statement snapshot; an exception inside = the statement failed (PG error): nothing changes, -1
      function step(label, where, set) {
        var ups = [];
        try { R.forEach(function (w) { if (where(w.cur)) ups.push([w, set(w.cur)]); }); }
        catch (e) { trx.say('§PROC-SQL-ERROR executeUpdate -> -1: ' + ((e && e.message) || e) + ' :: ImportOrder ' + label); return -1; }
        ups.forEach(function (u) { Object.keys(u[1]).forEach(function (c) { u[0].cur[c] = u[1][c]; }); });
        return ups.length;
      }
      function err(label, text, where) {                                                                      // the "Invalid X" statements: I_IsImported='E', I_ErrorMsg=I_ErrorMsg||'ERR=...'
        var no = step(label, function (r) { return where(r) && notY(r) && cc(r); }, function (r) { return { i_isimported: 'E', i_errormsg: cat(r.i_errormsg, text) }; });
        if (no !== 0) trx.say('§IMPORT_ORDER_WARN ' + label + '=' + no + ' (log.warning)');
        return no;
      }
      function scalar(sql, params) { var rs = trx.q(sql, params); if (rs.length > 1) throw new Error('more than one row returned by a subquery used as an expression'); return rs.length ? rs[0][Object.keys(rs[0])[0]] : null; }
      function row1(sql, params) { var rs = trx.q(sql, params); if (rs.length > 1) throw new Error('more than one row returned by a subquery used as an expression'); return rs[0] || null; }
      var no;

      // ****	Prepare	****
      load();
      if (this.m_deleteOldImported) {                                                                         // :99-106 Delete Old Imported
        var del = R.filter(function (w) { return eq(w.cur.i_isimported, 'Y') && cc(w.cur); });
        del.forEach(function (w) { trx.del('i_order', trx.get('i_order', w.id)); }); R = R.filter(function (w) { return del.indexOf(w) < 0; });
      }
      step('Reset', function (r) { return ne(r.i_isimported, 'Y') || r.i_isimported == null; }, function (r) {   // :108-121 Set Client, Org, IsActive, Created/Updated
        return { ad_client_id: r.ad_client_id != null ? r.ad_client_id : C, ad_org_id: r.ad_org_id != null ? r.ad_org_id : O, isactive: r.isactive != null ? r.isactive : 'Y', created: r.created != null ? r.created : nowTs, createdby: r.createdby != null ? r.createdby : 0,
                 updated: r.updated != null ? r.updated : nowTs, updatedby: r.updatedby != null ? r.updatedby : 0, i_errormsg: ' ', i_isimported: 'N' }; });
      err('Invalid Org', 'ERR=Invalid Org, ', function (r) {                                                   // :123-131
        return r.ad_org_id == null || Number(r.ad_org_id) === 0 || trx.q("SELECT 1 AS x FROM ad_org oo WHERE oo.ad_org_id=? AND (oo.issummary='Y' OR oo.isactive='N')", [r.ad_org_id]).length > 0; });

      //	Document Type - PO - SO
      function docTypeByName(r, baseSql) { return scalar('SELECT c_doctype_id FROM c_doctype d WHERE d.name=? AND d.docbasetype' + baseSql + ' AND ?=d.ad_client_id', [r.doctypename, r.ad_client_id]); }
      step('Set PO DocType', function (r) { return r.c_doctype_id == null && eq(r.issotrx, 'N') && r.doctypename != null && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeByName(r, "='POO'") }; });                    // :133-138
      step('Set SO DocType', function (r) { return r.c_doctype_id == null && eq(r.issotrx, 'Y') && r.doctypename != null && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeByName(r, "='SOO'") }; });                    // :139-144
      step('Set DocType', function (r) { return r.c_doctype_id == null && r.doctypename != null && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeByName(r, " IN ('SOO','POO')") }; });                              // :145-151
      err('Invalid DocTypeName', 'ERR=Invalid DocTypeName, ', function (r) { return r.c_doctype_id == null && r.doctypename != null; });                                                                                              // :152-158
      //	DocType Default
      function docTypeDefault(r, baseSql) { return scalar("SELECT MAX(c_doctype_id) FROM c_doctype d WHERE d.isdefault='Y' AND d.docbasetype" + baseSql + ' AND ?=d.ad_client_id', [r.ad_client_id]); }
      step('Set PO Default DocType', function (r) { return r.c_doctype_id == null && eq(r.issotrx, 'N') && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeDefault(r, "='POO'") }; });                                          // :160-165
      step('Set SO Default DocType', function (r) { return r.c_doctype_id == null && eq(r.issotrx, 'Y') && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeDefault(r, "='SOO'") }; });                                          // :166-171
      step('Set Default DocType', function (r) { return r.c_doctype_id == null && r.issotrx == null && notY(r) && cc(r); }, function (r) { return { c_doctype_id: docTypeDefault(r, " IN ('SOO','POO')") }; });                                // :172-177
      err('No DocType', 'ERR=No DocType, ', function (r) { return r.c_doctype_id == null; });                                                                                                                                          // :178-185

      //	Set IsSOTrx
      function dtBase(r, b) { return r.c_doctype_id != null && trx.q('SELECT 1 AS x FROM c_doctype d WHERE ?=d.c_doctype_id AND d.docbasetype=? AND ?=d.ad_client_id', [r.c_doctype_id, b, r.ad_client_id]).length > 0; }
      step('Set IsSOTrx=Y', function (r) { return dtBase(r, 'SOO') && r.c_doctype_id != null && notY(r) && cc(r); }, function () { return { issotrx: 'Y' }; });                                                                                  // :187-192
      step('Set IsSOTrx=N', function (r) { return dtBase(r, 'POO') && r.c_doctype_id != null && notY(r) && cc(r); }, function () { return { issotrx: 'N' }; });                                                                                  // :193-198

      //	Price List
      step('Set Default Currency PriceList', function (r) { return r.m_pricelist_id == null && notY(r) && cc(r); }, function (r) {                                                                                                       // :200-206
        return { m_pricelist_id: scalar("SELECT MAX(m_pricelist_id) FROM m_pricelist p WHERE p.isdefault='Y' AND p.c_currency_id=? AND p.issopricelist=? AND ?=p.ad_client_id", [r.c_currency_id, r.issotrx, r.ad_client_id]) }; });
      step('Set Default PriceList', function (r) { return r.m_pricelist_id == null && r.c_currency_id == null && notY(r) && cc(r); }, function (r) {                                                                                     // :207-212
        return { m_pricelist_id: scalar("SELECT MAX(m_pricelist_id) FROM m_pricelist p WHERE p.isdefault='Y' AND p.issopricelist=? AND ?=p.ad_client_id", [r.issotrx, r.ad_client_id]) }; });
      step('Set Currency PriceList', function (r) { return r.m_pricelist_id == null && notY(r) && cc(r); }, function (r) {                                                                                                              // :213-218
        return { m_pricelist_id: scalar('SELECT MAX(m_pricelist_id) FROM m_pricelist p WHERE p.c_currency_id=? AND p.issopricelist=? AND ?=p.ad_client_id', [r.c_currency_id, r.issotrx, r.ad_client_id]) }; });
      step('Set PriceList', function (r) { return r.m_pricelist_id == null && r.c_currency_id == null && notY(r) && cc(r); }, function (r) {                                                                                           // :219-224
        return { m_pricelist_id: scalar('SELECT MAX(m_pricelist_id) FROM m_pricelist p WHERE p.issopricelist=? AND ?=p.ad_client_id', [r.issotrx, r.ad_client_id]) }; });
      err('No PriceList', 'ERR=No PriceList, ', function (r) { return r.m_pricelist_id == null; });                                                                                                                                    // :226-233

      // @Trifon - Import Order Source
      step('Set Order Source', function (r) { return r.c_ordersource_id == null && r.c_ordersourcevalue != null && notY(r) && cc(r); }, function (r) {                                                                                  // :235-240
        return { c_ordersource_id: scalar('SELECT c_ordersource_id FROM c_ordersource p WHERE ?=p.value AND ?=p.ad_client_id', [r.c_ordersourcevalue, r.ad_client_id]) }; });
      err('Not Found Order Source', 'ERR=Not Found Order Source, ', function (r) { return r.c_ordersource_id == null && r.c_ordersourcevalue != null; });                                                                                  // :242-247

      //	Payment Term
      step('Set PaymentTerm', function (r) { return r.c_paymentterm_id == null && r.paymenttermvalue != null && notY(r) && cc(r); }, function (r) {                                                                                    // :250-255
        return { c_paymentterm_id: scalar('SELECT c_paymentterm_id FROM c_paymentterm p WHERE ?=p.value AND ?=p.ad_client_id', [r.paymenttermvalue, r.ad_client_id]) }; });
      step('Set Default PaymentTerm', function (r) { return r.c_paymentterm_id == null && r.paymenttermvalue == null && notY(r) && cc(r); }, function (r) {                                                                              // :256-261
        return { c_paymentterm_id: scalar("SELECT MAX(c_paymentterm_id) FROM c_paymentterm p WHERE p.isdefault='Y' AND ?=p.ad_client_id", [r.ad_client_id]) }; });
      err('No PaymentTerm', 'ERR=No PaymentTerm, ', function (r) { return r.c_paymentterm_id == null; });                                                                                                                              // :263-270

      //	Warehouse
      step('Set Warehouse', function (r) { return r.m_warehouse_id == null && notY(r) && cc(r); }, function (r) {                                                                                                                       // :272-277 (Warehouse for Org)
        return { m_warehouse_id: scalar('SELECT MAX(m_warehouse_id) FROM m_warehouse w WHERE ?=w.ad_client_id AND ?=w.ad_org_id', [r.ad_client_id, r.ad_org_id]) }; });
      step('Set Only Client Warehouse', function (r) {                                                                                                                                                                                    // :279-287
        return r.m_warehouse_id == null && trx.q('SELECT 1 AS x FROM m_warehouse w WHERE w.ad_client_id=? GROUP BY ad_client_id HAVING COUNT(*)=1', [r.ad_client_id]).length > 0 && notY(r) && cc(r); },
        function (r) { return { m_warehouse_id: scalar('SELECT m_warehouse_id FROM m_warehouse w WHERE ?=w.ad_client_id', [r.ad_client_id]) }; });
      err('No Warehouse', 'ERR=No Warehouse, ', function (r) { return r.m_warehouse_id == null; });                                                                                                                                  // :289-296

      //	BP from EMail / ContactName / Value / Default
      step('Set BP from EMail', function (r) { return r.c_bpartner_id == null && r.email != null && notY(r) && cc(r); }, function (r) {                                                                                                  // :298-304
        var u = row1('SELECT c_bpartner_id AS b, ad_user_id AS u FROM ad_user u WHERE ?=u.email AND ?=u.ad_client_id AND u.c_bpartner_id IS NOT NULL', [r.email, r.ad_client_id]);
        return { c_bpartner_id: u ? u.b : null, ad_user_id: u ? u.u : null }; });
      step('Set BP from ContactName', function (r) {                                                                                                                                                                                       // :306-313
        return r.c_bpartner_id == null && r.contactname != null && trx.q('SELECT 1 AS x FROM ad_user u WHERE ?=u.name AND ?=u.ad_client_id AND u.c_bpartner_id IS NOT NULL GROUP BY name HAVING COUNT(*)=1', [r.contactname, r.ad_client_id]).length > 0 && notY(r) && cc(r); },
        function (r) { var u = row1('SELECT c_bpartner_id AS b, ad_user_id AS u FROM ad_user u WHERE ?=u.name AND ?=u.ad_client_id AND u.c_bpartner_id IS NOT NULL', [r.contactname, r.ad_client_id]); return { c_bpartner_id: u ? u.b : null, ad_user_id: u ? u.u : null }; });
      step('Set BP from Value', function (r) { return r.c_bpartner_id == null && r.bpartnervalue != null && notY(r) && cc(r); }, function (r) {                                                                                         // :315-320
        return { c_bpartner_id: scalar('SELECT MAX(c_bpartner_id) FROM c_bpartner bp WHERE ?=bp.value AND ?=bp.ad_client_id', [r.bpartnervalue, r.ad_client_id]) }; });
      step('Set Default BP', function (r) { return r.c_bpartner_id == null && r.bpartnervalue == null && r.name == null && notY(r) && cc(r); }, function (r) {                                                                          // :322-329 (AD_ClientInfo.C_BPartnerCashTrx_ID)
        return { c_bpartner_id: scalar('SELECT c_bpartnercashtrx_id FROM ad_clientinfo c WHERE ?=c.ad_client_id', [r.ad_client_id]) }; });

      //	Set Country / Region
      step('Set Country', function (r) { return r.c_bpartner_id == null && r.c_country_id == null && r.countrycode != null && notY(r) && cc(r); }, function (r) {                                                                       // :331-338
        return { c_country_id: scalar('SELECT c_country_id FROM c_country c WHERE ?=c.countrycode AND c.ad_client_id IN (0, ?)', [r.countrycode, r.ad_client_id]) }; });
      err('Invalid Country', 'ERR=Invalid Country, ', function (r) { return r.c_bpartner_id == null && r.c_country_id == null; });                                                                                                      // :340-346
      step('Set Region Default', function (r) { return r.c_bpartner_id == null && r.c_region_id == null && r.regionname == null && notY(r) && cc(r); }, function (r) {                                                                  // :348-356
        return { regionname: scalar("SELECT MAX(name) FROM c_region r WHERE r.isdefault='Y' AND r.c_country_id=? AND r.ad_client_id IN (0, ?)", [r.c_country_id, r.ad_client_id]) }; });
      step('Set Region', function (r) { return r.c_bpartner_id == null && r.c_region_id == null && r.regionname != null && notY(r) && cc(r); }, function (r) {                                                                           // :358-365
        return { c_region_id: scalar('SELECT c_region_id FROM c_region r WHERE r.name=? AND r.c_country_id=? AND r.ad_client_id IN (0, ?)', [r.regionname, r.c_country_id, r.ad_client_id]) }; });
      err('Invalid Region', 'ERR=Invalid Region, ', function (r) {                                                                                                                                                                         // :367-375
        return r.c_bpartner_id == null && r.c_region_id == null && trx.q("SELECT 1 AS x FROM c_country c WHERE c.c_country_id=? AND c.hasregion='Y'", [r.c_country_id]).length > 0; });

      //	Existing Location ? Exact Match
      step('Found Location', function (r) { return r.c_bpartner_id != null && r.c_bpartner_location_id == null && eq(r.i_isimported, 'N') && cc(r); }, function (r) {                                                                       // :377-391
        var l = row1('SELECT bpl.c_bpartner_location_id AS id FROM c_bpartner_location bpl INNER JOIN c_location l ON (bpl.c_location_id=l.c_location_id) WHERE ?=bpl.c_bpartner_id AND bpl.ad_client_id=?' +
          ' AND ((? IS NULL AND l.address1 IS NULL) OR ?=l.address1) AND ((? IS NULL AND l.address2 IS NULL) OR ?=l.address2) AND ((? IS NULL AND l.city IS NULL) OR ?=l.city) AND ((? IS NULL AND l.postal IS NULL) OR ?=l.postal)' +
          ' AND COALESCE(?,0)=COALESCE(l.c_region_id,0) AND COALESCE(?,0)=COALESCE(l.c_country_id,0)',
          [r.c_bpartner_id, r.ad_client_id, r.address1, r.address1, r.address2, r.address2, r.city, r.city, r.postal, r.postal, r.c_region_id, r.c_country_id]);
        return { billto_id: l ? l.id : null, c_bpartner_location_id: l ? l.id : null }; });
      step('Set BP BillTo from BP', function (r) { return r.c_bpartner_id != null && r.billto_id == null && notY(r) && cc(r); }, function (r) {                                                                                           // :392-400
        return { billto_id: scalar("SELECT MAX(c_bpartner_location_id) FROM c_bpartner_location l WHERE l.c_bpartner_id=? AND ?=l.ad_client_id AND ((l.isbillto='Y' AND ?='Y') OR (l.ispayfrom='Y' AND ?='N'))", [r.c_bpartner_id, r.ad_client_id, r.issotrx, r.issotrx]) }; });
      step('Set BP Location from BP', function (r) { return r.c_bpartner_id != null && r.c_bpartner_location_id == null && notY(r) && cc(r); }, function (r) {                                                                              // :402-411
        return { c_bpartner_location_id: scalar("SELECT MAX(c_bpartner_location_id) FROM c_bpartner_location l WHERE l.c_bpartner_id=? AND ?=l.ad_client_id AND ((l.isshipto='Y' AND ?='Y') OR ?='N')", [r.c_bpartner_id, r.ad_client_id, r.issotrx, r.issotrx]) }; });
      err('No BP Location', 'ERR=No BP Location, ', function (r) { return r.c_bpartner_id != null && (r.billto_id == null || r.c_bpartner_location_id == null); });                                                                      // :413-419

      //	Product
      step('Set Product from Value', function (r) { return r.m_product_id == null && r.productvalue != null && notY(r) && cc(r); }, function (r) {                                                                                       // :421-427
        return { m_product_id: scalar('SELECT MAX(m_product_id) FROM m_product p WHERE ?=p.value AND ?=p.ad_client_id', [r.productvalue, r.ad_client_id]) }; });
      step('Set Product from UPC', function (r) { return r.m_product_id == null && r.upc != null && notY(r) && cc(r); }, function (r) {                                                                                                  // :429-434
        return { m_product_id: scalar('SELECT MAX(m_product_id) FROM m_product p WHERE ?=p.upc AND ?=p.ad_client_id', [r.upc, r.ad_client_id]) }; });
      step('Set Product from SKU', function (r) { return r.m_product_id == null && r.sku != null && notY(r) && cc(r); }, function (r) {                                                                                                  // :436-441
        return { m_product_id: scalar('SELECT MAX(m_product_id) FROM m_product p WHERE ?=p.sku AND ?=p.ad_client_id', [r.sku, r.ad_client_id]) }; });
      err('Invalid Product', 'ERR=Invalid Product, ', function (r) { return r.m_product_id == null && (r.productvalue != null || r.upc != null || r.sku != null); });                                                                      // :443-450

      //	Charge
      step('Set Charge', function (r) { return r.c_charge_id == null && r.chargename != null && notY(r) && cc(r); }, function (r) {                                                                                                       // :452-457
        return { c_charge_id: scalar('SELECT c_charge_id FROM c_charge c WHERE ?=c.name AND ?=c.ad_client_id', [r.chargename, r.ad_client_id]) }; });
      err('Invalid Charge', 'ERR=Invalid Charge, ', function (r) { return r.c_charge_id == null && r.chargename != null; });                                                                                                              // :458-465
      err('Product and Charge', 'ERR=Product and Charge, ', function (r) { return r.m_product_id != null && r.c_charge_id != null; });                                                                                                     // :467-474

      //	Tax
      step('Set Tax', function (r) { return r.c_tax_id == null && r.taxindicator != null && notY(r) && cc(r); }, function (r) {                                                                                                           // :476-481
        return { c_tax_id: scalar('SELECT MAX(c_tax_id) FROM c_tax t WHERE ?=t.taxindicator AND ?=t.ad_client_id', [r.taxindicator, r.ad_client_id]) }; });
      err('Invalid Tax', 'ERR=Invalid Tax, ', function (r) { return r.c_tax_id == null && r.taxindicator != null; });                                                                                                                       // :483-489

      flush();                                                                                               // commitEx() :491 - the raw UPDATEs are in the Trx before the PO-level loops

      // -- New BPartner ---------------------------------------------------
      //	Go through Order Records w/o C_BPartner_ID (:495-621)
      function equalsNull(c1, c2) { return String(c1 == null ? '' : c1).toLowerCase() === String(c2 == null ? '' : c2).toLowerCase(); }   // MLocation.equalsNull (case-insensitive, null = "")
      function unported(imp, branch, javaLines) {
        trx.say('§PROC-UNPORTED ImportOrder ' + branch + ' (ImportOrder.java:' + javaLines + ') row=' + imp.i_order_id + ' bpartnervalue=' + imp.bpartnervalue + ' name=' + imp.name);
        var live = trx.get('i_order', imp.i_order_id), msg = cat(live.i_errormsg, 'ERR=Not ported: ' + branch + ', ');
        var sv = ML().save(trx, 'i_order', live, { i_errormsg: msg }); if (!sv.ok) throw new Error('SaveError i_order: ' + sv.error);
      }
      var bpRows = trx.find('i_order', {}, null, { exclude: { i_isimported: 'Y' } }).filter(function (r) { return eq(r.i_isimported, 'N') && r.c_bpartner_id == null && cc(r); }).sort(function (a, b) { return idNum(a.i_order_id) - idNum(b.i_order_id); });
      bpRows.forEach(function (rec) {
        var imp = Object.assign({}, rec);
        if (imp.bpartnervalue == null) { if (imp.email != null) imp.bpartnervalue = imp.email; else if (imp.name != null) imp.bpartnervalue = imp.name; else return; }   // :505-512 (continue)
        if (imp.name == null) { if (imp.contactname != null) imp.name = imp.contactname; else imp.name = imp.bpartnervalue; }                                          // :514-520
        //	BPartner
        var bp = imp.bpartnervalue != null && String(imp.bpartnervalue).length ? trx.q('SELECT * FROM c_bpartner WHERE value=? AND ad_client_id=?', [imp.bpartnervalue, self.getAD_Client_ID()])[0] : null;   // MBPartner.get(ctx, Value, trx) :523
        if (!bp) { unported(imp, 'new BPartner from names', '524-529'); return; }
        imp.c_bpartner_id = bp.c_bpartner_id;                                                                                                                        // :531
        //	BP Location
        var bpl = null, bpls = trx.q("SELECT * FROM c_bpartner_location WHERE c_bpartner_id=? AND isactive='Y' ORDER BY c_bpartner_location_id", [bp.c_bpartner_id]);          // bp.getLocations(true) :534
        for (var i = 0; bpl == null && i < bpls.length; i++) {
          if (nz(imp.c_bpartner_location_id) === nz(bpls[i].c_bpartner_location_id)) bpl = bpls[i];                                                                  // :538-539
          else if (nz(imp.c_location_id) === nz(bpls[i].c_location_id)) bpl = bpls[i];                                                                               // Same Location ID :541-543
          else if (nz(imp.c_location_id) === 0) {                                                                                                                   // Same Location Info :544-551
            var loc = trx.q('SELECT * FROM c_location WHERE c_location_id=?', [bpls[i].c_location_id])[0] || {};
            if ((nz(imp.c_country_id) === 0 || nz(loc.c_country_id) === nz(imp.c_country_id)) && (nz(imp.c_region_id) === 0 || nz(loc.c_region_id) === nz(imp.c_region_id)) &&
                equalsNull(imp.postal, loc.postal) && equalsNull('', loc.postal_add) && equalsNull(imp.city, loc.city) && equalsNull(imp.address1, loc.address1) && equalsNull(imp.address2, loc.address2)) bpl = bpls[i];
          }
        }
        if (bpl == null) { unported(imp, 'new Location / BP Location', '558-576'); return; }                                                                        // New Location (MLocation + MBPartnerLocation)
        imp.c_location_id = bpl.c_location_id; imp.billto_id = bpl.c_bpartner_location_id; imp.c_bpartner_location_id = bpl.c_bpartner_location_id;                     // :578-580
        //	User/Contact
        if (imp.contactname != null || imp.email != null || imp.phone != null) {                                                                                     // :583-587
          var users = trx.q("SELECT * FROM ad_user WHERE c_bpartner_id=? AND isactive = 'Y' ORDER BY ad_user_id", [bp.c_bpartner_id]), user = null;                    // bp.getContacts(true)
          for (var j = 0; user == null && j < users.length; j++) {
            var nm = users[j].name;
            if (nm === imp.contactname || nm === imp.name) { user = users[j]; imp.ad_user_id = user.ad_user_id; }                                                    // :591-596
          }
          if (user == null) { unported(imp, 'new Contact (AD_User)', '598-606'); return; }
        }
        var live = trx.get('i_order', imp.i_order_id), ch = {}; Object.keys(imp).forEach(function (c) { if (!same(imp[c], live[c])) ch[c] = imp[c]; });
        if (Object.keys(ch).length) { var sv = ML().save(trx, 'i_order', live, ch); if (!sv.ok) throw new Error('SaveError i_order: ' + sv.error); }                    // imp.saveEx() :609
      });
      load();
      err('No BPartner', 'ERR=No BPartner, ', function (r) { return r.c_bpartner_id == null; });                // :623-629
      flush();                                                                                               // commitEx() :631

      // -- New Orders -----------------------------------------------------
      var noInsert = 0, noInsertLine = 0, MO = G().MO(), docAction = this.m_docAction;
      var impRows = trx.find('i_order', {}, null, { exclude: { i_isimported: 'Y' } }).filter(function (r) { return eq(r.i_isimported, 'N') && cc(r); }).sort(function (a, b) {                                   // :639-641 ORDER BY C_BPartner_ID, BillTo_ID, C_BPartner_Location_ID, I_Order_ID
        function nl(x) { return x == null ? 1e18 : Number(x); }
        return (nl(a.c_bpartner_id) - nl(b.c_bpartner_id)) || (nl(a.billto_id) - nl(b.billto_id)) || (nl(a.c_bpartner_location_id) - nl(b.c_bpartner_location_id)) || (idNum(a.i_order_id) - idNum(b.i_order_id)); });
      var oldBP = 0, oldBillTo = 0, oldLoc = 0, oldDocNo = '', order = null, lineNo = 0;
      // :668-676 / :773-781 (and the closing order.saveEx() :677/:782): setDocAction + processIt + saveEx for the finished order, behind a savepoint (twin decision b)
      function finishOrder() {
        if (!order) return;
        var id = order.id(), sp = trx.setSavepoint(), ok = false;
        try {
          if (docAction != null && String(docAction).length > 0) {
            var before = Object.assign({}, trx.get('c_order', id));
            trx.update('c_order', trx.get('c_order', id), { docaction: docAction });                                        // order.setDocAction(m_docAction)
            var pr = ML().processIt(trx, 'c_order', id, docAction);                                                        // order.processIt(m_docAction)
            if (!pr || !pr.ok) throw new Error('Order Process Failed: ' + id + ' - ' + (pr && pr.msg));                       // :672-675 IllegalStateException
            var now = trx.get('c_order', id), chg = {};
            Object.keys(now).forEach(function (c) { if (!same(now[c], before[c])) chg[c] = now[c]; });
            if (Object.keys(chg).length) { var sv = ML().save(trx, 'c_order', before, chg); if (!sv.ok) throw new Error('SaveError c_order: ' + sv.error); }   // order.saveEx() :677
          }
          ok = true;
        } finally { if (!ok) trx.rollbackTo(sp); }
      }
      try {
        impRows.forEach(function (rec) {
          var imp = Object.assign({}, rec), cmpDocNo = imp.documentno == null ? '' : String(imp.documentno);
          //	New Order
          if (oldBP !== nz(imp.c_bpartner_id) || oldLoc !== nz(imp.c_bpartner_location_id) || oldBillTo !== nz(imp.billto_id) || oldDocNo !== cmpDocNo) {                                 // :656-659
            if (order != null) { finishOrder(); }                                                                                                                                   // :660-678
            oldBP = nz(imp.c_bpartner_id); oldLoc = nz(imp.c_bpartner_location_id); oldBillTo = nz(imp.billto_id);                                                                   // :679-682
            oldDocNo = imp.documentno == null ? '' : String(imp.documentno);                                                                                                         // :683-685
            //
            var o = MO.MOrder_new(trx);                                                                                                                                              // new MOrder(getCtx(), 0, trx) :686
            o.set('ad_client_id', imp.ad_client_id).set('ad_org_id', imp.ad_org_id);                                                                                                 // setClientOrg :687
            o.set('c_doctypetarget_id', imp.c_doctype_id);                                                                                                                           // :688
            o.set('issotrx', imp.issotrx === 'Y' ? 'Y' : 'N');                                                                                                                       // :689
            if (imp.deliveryrule != null) o.set('deliveryrule', imp.deliveryrule);                                                                                                   // :690-692
            if (imp.documentno != null) o.set('documentno', imp.documentno);                                                                                                         // :693-694 the DocumentNo of the row IS the order's
            //	Ship Partner
            o.set('c_bpartner_id', imp.c_bpartner_id); o.set('c_bpartner_location_id', imp.c_bpartner_location_id);                                                                  // :696-697
            if (nz(imp.ad_user_id) !== 0) o.set('ad_user_id', imp.ad_user_id);                                                                                                       // :698-699
            //	Bill Partner
            o.set('bill_bpartner_id', imp.c_bpartner_id); o.set('bill_location_id', imp.billto_id);                                                                                  // :701-702
            if (imp.description != null) o.set('description', imp.description);                                                                                                      // :704-705
            o.set('c_paymentterm_id', imp.c_paymentterm_id); o.set('m_pricelist_id', imp.m_pricelist_id); o.set('m_warehouse_id', imp.m_warehouse_id);                               // :706-708
            if (nz(imp.m_shipper_id) !== 0) o.set('m_shipper_id', imp.m_shipper_id);                                                                                                 // :709-710
            //	SalesRep from Import or the person running the import
            if (nz(imp.salesrep_id) !== 0) o.set('salesrep_id', imp.salesrep_id);                                                                                                    // :712-713
            if (nz(o.get('salesrep_id')) === 0) o.set('salesrep_id', self.getAD_User_ID());                                                                                          // :714-715
            //
            if (nz(imp.ad_orgtrx_id) !== 0) o.set('ad_orgtrx_id', imp.ad_orgtrx_id);                                                                                                 // :717-718
            if (nz(imp.c_activity_id) !== 0) o.set('c_activity_id', imp.c_activity_id);                                                                                              // :719-720
            if (nz(imp.c_campaign_id) !== 0) o.set('c_campaign_id', imp.c_campaign_id);                                                                                              // :721-722
            if (nz(imp.c_project_id) !== 0) o.set('c_project_id', imp.c_project_id);                                                                                                 // :723-724
            //
            if (imp.dateordered != null) o.set('dateordered', imp.dateordered);                                                                                                      // :726-727
            if (imp.dateacct != null) o.set('dateacct', imp.dateacct);                                                                                                               // :728-729
            // Set Order Source
            if (nz(imp.c_ordersource_id) > 0) o.set('c_ordersource_id', imp.c_ordersource_id);                                                                                       // :731-733
            //
            MO.MOrder_beforeSaveNew(trx, o, ctx);                                                                                                                                    // MOrder.beforeSave defaults (new record) - model_order.js
            try { MO.saveEx(o); }                                                                                                                                                    // order.saveEx() :735
            catch (e) { var m = /violates unique constraint "([^"]+)"/.exec(String(e && e.message)); if (m) trx.say('§IMPORT_ORDER_COLLISION index=' + m[1] + ' documentno=' + imp.documentno + ' bpartner=' + imp.c_bpartner_id + ' row=' + imp.i_order_id + ' (' + String(e.message).replace(/\s+/g, ' ').slice(0, 220) + ')'); throw e; }
            order = o; noInsert++;
            lineNo = 10;                                                                                                                                                             // :737
          }
          var ch = { c_order_id: order.id() };                                                                                                                                       // imp.setC_Order_ID(order.getC_Order_ID()) :739
          //	New OrderLine
          var line = MO.MOrderLine_new(trx, order);                                                                                                                                  // new MOrderLine(order) :741
          line.set('line', lineNo); lineNo += 10;                                                                                                                                    // :742-743
          if (nz(imp.m_product_id) !== 0) {                                                                                                                                          // :744-745 line.setM_Product_ID(id, true) = setProduct: product + its UOM, ASI 0
            var prod = trx.get('m_product', imp.m_product_id);
            line.set('m_product_id', imp.m_product_id); line.set('c_uom_id', prod ? prod.c_uom_id : null); line.set('m_attributesetinstance_id', 0);
          }
          if (nz(imp.c_charge_id) !== 0) line.set('c_charge_id', imp.c_charge_id);                                                                                                   // :746-747
          var qty = A.toBD(String(imp.qtyordered == null ? 0 : imp.qtyordered)), HU = A.RoundingMode.HALF_UP;                                                                          // line.setQty(imp.getQtyOrdered()) :748 = setQtyEntered (entered-UOM precision) then QtyOrdered := QtyEntered
          function uomPrec(uomId) { var u = nz(uomId) ? trx.get('c_uom', uomId) : null; return u ? Number(u.stdprecision) : 0; }
          if (nz(line.get('c_uom_id')) !== 0) qty = qty.setScale(uomPrec(line.get('c_uom_id')), HU);
          line.set('qtyentered', qty);
          var p2 = nz(line.get('m_product_id')) ? trx.get('m_product', line.get('m_product_id')) : null, qo = qty;
          if (p2 != null) qo = qty.setScale(nz(p2.c_uom_id) ? uomPrec(p2.c_uom_id) : 0, HU);
          line.set('qtyordered', qo);
          MO.MOrderLine_setPrice(trx, line);                                                                                                                                         // line.setPrice() :749
          var pa = A.toBD(String(imp.priceactual == null ? 0 : imp.priceactual));
          if (pa.compareTo(A.Env.ZERO) !== 0) { line.set('priceentered', pa).set('priceactual', pa); }                                                                               // :750-751 line.setPrice(imp.getPriceActual())
          if (nz(imp.c_tax_id) !== 0) line.set('c_tax_id', imp.c_tax_id);                                                                                                            // :752-753
          else {                                                                                                                                                                     // :754-758 line.setTax(); imp.setC_Tax_ID(line.getC_Tax_ID())
            var lv = line.values(); MO.MOrderLine_setTaxIfMissing(trx, lv, trx.get('c_order', order.id()));
            line.set('c_tax_id', lv.c_tax_id); ch.c_tax_id = lv.c_tax_id;
          }
          if (imp.freightamt != null) line.set('freightamt', imp.freightamt);                                                                                                        // :759-760
          if (imp.linedescription != null) line.set('description', imp.linedescription);                                                                                             // :761-762
          MO.saveEx(line);                                                                                                                                                           // line.saveEx() :763
          ch.c_orderline_id = line.id(); ch.i_isimported = 'Y'; ch.processed = 'Y';                                                                                                  // :764-766
          var live = trx.get('i_order', imp.i_order_id), sv2 = ML().save(trx, 'i_order', live, ch);                                                                                  // imp.save() :768
          if (sv2.ok) noInsertLine++; else trx.say('§IMPORT_ORDER_WARN imp.save() refused for I_Order ' + imp.i_order_id + ': ' + sv2.error);
        });
        if (order != null) finishOrder();                                                                                                                                            // :771-785
      } catch (e) {                                                                                                                                                                  // :786-790 log.log(Level.SEVERE, "Order - " + sql, e): logged, the loop ends, the process goes on
        trx.say('§IMPORT_ORDER_EXCEPTION ' + String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 300) + ((typeof process !== 'undefined' && process.env && process.env.IMPORT_DEBUG) ? ' ' + (e && e.stack) : ''));
        var mm = /violates unique constraint "([^"]+)"/.exec(String(e && e.message));
        if (mm && !trx.log.some(function (l) { return l.indexOf('§IMPORT_ORDER_COLLISION') === 0 && l.indexOf('index=' + mm[1]) > 0 && l.indexOf('documentno=' + (order && order.get('documentno'))) > 0; }))
          trx.say('§IMPORT_ORDER_COLLISION index=' + mm[1] + ' documentno=' + (order ? order.get('documentno') : '?') + ' bpartner=' + (order ? order.get('c_bpartner_id') : '?') + ' (' + String(e.message).replace(/\s+/g, ' ').slice(0, 220) + ')');
      }

      //	Set Error to indicator to not imported (:796-800)
      load();
      no = step('Set not imported', function (r) { return notY(r) && cc(r); }, function () { return { i_isimported: 'N', updated: nowTs }; });
      flush();
      this.addLog(0, null, A.toBD(String(no)), '@Errors@');                                                                                                                          // :801
      this.addLog(0, null, A.toBD(String(noInsert)), '@C_Order_ID@: @Inserted@');                                                                                                    // :803
      this.addLog(0, null, A.toBD(String(noInsertLine)), '@C_OrderLine_ID@: @Inserted@');                                                                                            // :804
      trx.say('§IMPORT_ORDER client=' + C + ' org=' + O + ' docAction=' + docAction + ' orders=' + noInsert + ' lines=' + noInsertLine + ' errors=' + no);
      return '#' + noInsert + '/' + noInsertLine;                                                                                                                                    // :805-807
    };
    return ImportOrder;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

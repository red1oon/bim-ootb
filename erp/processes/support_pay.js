// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/support_pay.js — helpers the family-C (pay / bank / match) processes share. bim-compiler
// prompts/ERP_IDEMPIERE_UX_PARITY.md §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE. Registered on AdProcess.PSUP.pay.
// Java root org.adempiere.base/src/org/compiere/model/. Holds the model hooks that delete an allocation / a match row
// exercises and that model_*.js does not carry yet (MAllocationHdr.beforeDelete/afterDelete, MAllocationLine.beforeDelete +
// processIt(reverse)); registered into ModelLayer only when no other lane already registered the same hook.
(function (global) {
  'use strict';
  var node = (typeof module !== 'undefined' && module.exports);
  var P = node ? require('../ad_process.js') : global.AdProcess;
  var S = P.PSUP = P.PSUP || {};
  var G = S.pay = {};
  G.ctor = function () { return node ? require('../model_ctor') : global.ModelCtor; };
  G.T = function () { return node ? require('../model_trade') : global.ModelTrade; };
  G.ML = function () { return node ? require('../model_layer') : global.ModelLayer; };
  G.MI = function () { return node ? require('../model_invoice') : global.ModelInvoice; };
  G.A = function () { return node ? require('../ad_callout.js') : global.AdCallout; };
  G.R = function () { return G.A().RUNTIME; };
  // PO.saveEx → AdempiereException with the PO's error
  G.saveEx = function (po) { if (!po.save()) throw new Error(po.error || 'SaveError'); return po; };
  // ML.save on a plain row with a changes map, throwing like saveEx
  G.saveRow = function (trx, table, row, changes) { var r = G.ML().save(trx, table, row, changes); if (!r.ok) throw new Error(r.error || 'SaveError'); return r.row; };
  G.po = function (trx, table, id) { var r = trx.get(table, id); return r ? G.ML().po(trx, table, r) : null; };
  G.sysConfigBool = function (name, dflt, client) {                                   // MSysConfig.getBooleanValue
    try { var r = trx0q(name, client); return r ? 'Y' === r.v : dflt; }
    catch (e) { G.R().unportedDep('MSysConfig.getBooleanValue(' + name + ')', 'AD_SysConfig absent from the bundle — Java default ' + dflt); return dflt; }
  };
  function trx0q(name, client) {
    return G.R().DB.query("SELECT Value AS v FROM AD_SysConfig WHERE Name=? AND AD_Client_ID IN (0,?) AND IsActive='Y' ORDER BY AD_Client_ID DESC, AD_Org_ID DESC", [name, client || 0])[0];
  }
  // PO.setStandardDefaults (PO.java:1973-2001) sets Processed/Processing/Posted='N' only on tables that HAVE those columns; ModelLayer.newPO
  // sets all three unconditionally, so a new row on a table without e.g. Posted/Processing carries phantom columns (C_PaySelectionLine,
  // C_PaySelectionCheck). Strip the phantom ones from the unsaved handle before save (local mitigation — model_layer.js is not this lane's file).
  G.stripStdDefaults = function (trx, po) {
    var cols = G.ML().columnsOf(trx, po.table);
    ['processed', 'processing', 'posted'].forEach(function (c) { if (!cols[c] && Object.prototype.hasOwnProperty.call(po.ch, c)) delete po.ch[c]; });
    return po;
  };
  // MFactAcct.deleteEx(AD_Table_ID, Record_ID, trxName) (MFactAcct.java:74-96): back up to T_Fact_Acct_History, then delete
  G.factDeleteEx = function (trx, tableId, recordId) {
    var rows = trx.find('fact_acct', { ad_table_id: tableId, record_id: recordId }), hasHist = true;
    try { trx.q('SELECT 1 FROM t_fact_acct_history LIMIT 1'); } catch (e) { hasHist = false; }
    rows.forEach(function (f) { if (hasHist) trx.insert('t_fact_acct_history', Object.assign({}, f)); trx.del('fact_acct', f); });
    return rows.length;
  };

  // ── MAllocationLine.processIt(reverse=true) — MAllocationLine.java:273-373 (does not update the line)
  G.allocLineProcessIt = function (trx, line, reverse) {
    var T = G.T(), MI = G.MI(), ML = G.ML(), R = G.R(), nz = T.nz;
    var C_Invoice_ID = line.c_invoice_id, C_Payment_ID = line.c_payment_id, C_CashLine_ID = line.c_cashline_id;
    var invoice = nz(C_Invoice_ID) ? trx.get('c_invoice', C_Invoice_ID) : null;           // getInvoice()
    var invCh = {};
    // :288-310 Update Payment
    if (nz(C_Payment_ID)) {
      var payment = trx.get('c_payment', C_Payment_ID);
      if (String(line.c_bpartner_id) !== String(payment.c_bpartner_id)) trx.say('§PROC-WARN AllocationLine C_BPartner_ID different - Invoice=' + line.c_bpartner_id + ' - Payment=' + payment.c_bpartner_id);
      if (reverse) {
        var cashbook = 'X' === payment.tendertype && !G.sysConfigBool('CASH_AS_PAYMENT', true, payment.ad_client_id);   // MPayment.isCashbookTrx :237-239
        if (!cashbook) G.saveRow(trx, 'c_payment', payment, { isallocated: 'N' });
      } else if (MI.payTestAllocation(trx, payment)) { /* payment.testAllocation() already wrote the row */ }
    }
    // :313-345 Payment - Invoice
    if (nz(C_Payment_ID) && invoice != null) {
      if (reverse) invCh.c_payment_id = null;                                             // invoice.setC_Payment_ID(0)
      else if (T.Y(invoice.ispaid)) invCh.c_payment_id = C_Payment_ID;
      R.DB.executeUpdate('UPDATE C_Order SET C_Payment_ID=' + (reverse ? 'NULL ' : '(SELECT C_Payment_ID FROM C_Invoice WHERE C_Invoice_ID=' + C_Invoice_ID + ') ') +
        'WHERE C_Order.C_Order_ID = (SELECT i.C_Order_ID FROM C_Invoice i WHERE i.C_Invoice_ID=' + C_Invoice_ID + ')', []);
    }
    // :348-377 Cash - Invoice
    if (nz(C_CashLine_ID) && invoice != null) {
      if (reverse) invCh.c_cashline_id = null; else invCh.c_cashline_id = C_CashLine_ID;
      R.DB.executeUpdate('UPDATE C_Order SET C_CashLine_ID=' + (reverse ? 'NULL ' : '(SELECT C_CashLine_ID FROM C_Invoice WHERE C_Invoice_ID=' + C_Invoice_ID + ') ') +
        'WHERE C_Order.C_Order_ID = (SELECT i.C_Order_ID FROM C_Invoice i WHERE i.C_Invoice_ID=' + C_Invoice_ID + ')', []);
    }
    // :380-385 Update Balance / Credit used — invoice.testAllocation() && invoice.save() (the in-memory setC_Payment_ID(0) is
    // only persisted when IsPaid changed — Java quirk kept)
    if (invoice != null) {
      var inv = trx.get('c_invoice', invoice.c_invoice_id);
      if (MI.invTestAllocation(trx, inv, false)) G.saveRow(trx, 'c_invoice', trx.get('c_invoice', invoice.c_invoice_id), invCh);
    }
    return line.c_bpartner_id;
  };

  // ── model hooks (registered once, only if absent)
  function register() {
    var ML = G.ML(), T = G.T(), nz = T.nz;
    var M = ML.MODEL;
    var hdr = M.c_allocationhdr || {}, al = M.c_allocationline || {};
    var bps = {};
    if (!hdr.beforeDelete) ML.registerModel('c_allocationhdr', {
      // MAllocationHdr.beforeDelete :319-349
      beforeDelete: function (trx, h) {
        if (T.Y(h.posted)) {
          if (!T.periodOpen(trx, h.datetrx, 'CMA')) throw new Error('@PeriodClosed@');   // MPeriod.testPeriodOpen(DateTrx, CMA, Org)
          trx.update('c_allocationhdr', h, { posted: 'N' });
          G.factDeleteEx(trx, trx.q("SELECT ad_table_id AS t FROM ad_table WHERE lower(tablename)='c_allocationhdr'")[0].t, h.c_allocationhdr_id);
        }
        G.saveRow(trx, 'c_allocationhdr', h, { isactive: 'N' });                           // setIsActive(false); saveEx()
        var list = [];
        trx.find('c_allocationline', { c_allocationhdr_id: h.c_allocationhdr_id }, ['c_allocationline_id']).forEach(function (line) {   // getLines(true)
          if (list.indexOf(String(line.c_bpartner_id)) < 0) list.push(String(line.c_bpartner_id));
          var r = ML.remove(trx, 'c_allocationline', line);                                // line.deleteEx(true, trxName)
          if (!r.ok) throw new Error('DeleteError c_allocationline: ' + r.error);
        });
        bps[h.c_allocationhdr_id] = list;
        return null;
      },
      // MAllocationHdr.afterDelete :352-363
      afterDelete: function (trx, h) {
        (bps[h.c_allocationhdr_id] || []).forEach(function (bp) { T.setTotalOpenBalance(trx, bp); });
        delete bps[h.c_allocationhdr_id];
        return null;
      }
    });
    if (!al.beforeDelete) ML.registerModel('c_allocationline', {
      // MAllocationLine.beforeDelete :234-240 — setIsActive(false) (in memory); processIt(true)
      beforeDelete: function (trx, l) { G.allocLineProcessIt(trx, l, true); return null; }
    });
  }
  try { register(); } catch (e) { if (typeof console !== 'undefined') console.log('§PROC-SUPPORT-PAY register failed ' + (e && e.message)); }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

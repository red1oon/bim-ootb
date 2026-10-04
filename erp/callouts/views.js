// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/views.js — the two iDempiere DB VIEWS the payment-family callouts SELECT from, which the bundle (ad_seed.db)
// does not carry: C_Payment_v (CalloutBankStatement.payment :126) and C_Invoice_v (CalloutPaySelection.invoice :114).
// Extracted from the live definitions (pg_get_viewdef on idempiere_pilot, 2026-10-04), translated to SQLite and created as
// TEMP views on first use (session-only; nothing is written to the bundle). Columns not overridden by the view's CASE
// expressions pass through as-is, enumerated from the bundle table so a slimmer bundle still yields a valid view.
// (prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE scenarios/cp/CalloutBankStatement.json, CalloutPaySelection.json)
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  var R = A.RUNTIME, M = R.M;
  var done = {};
  function cols(t) { try { return R.DB.query('PRAGMA table_info(' + t + ')').map(function (r) { return String(r.name).toLowerCase(); }); } catch (e) { return []; } }
  function neg(col, cond) { return 'CASE WHEN ' + cond + ' THEN ' + col + ' * -1 ELSE ' + col + ' END'; }
  var DEF = {
    // C_Payment_v: PayAmt/DiscountAmt/WriteOffAmt/TaxAmt/OverUnderAmt negated when IsReceipt<>'Y'; MultiplierAP ±1
    c_payment_v: function () {
      var c = cols('c_payment'); if (!c.length) return null;
      var over = { payamt: 1, discountamt: 1, writeoffamt: 1, taxamt: 1, overunderamt: 1 };
      var sel = c.map(function (x) { return over[x] ? neg('c_payment.' + x, "c_payment.isreceipt <> 'Y'") + ' AS ' + x : 'c_payment.' + x; });
      sel.push("CASE c_payment.isreceipt WHEN 'Y' THEN 1 ELSE -1 END AS multiplierap");
      return 'CREATE TEMP VIEW IF NOT EXISTS c_payment_v AS SELECT ' + sel.join(', ') + ' FROM c_payment';
    },
    // C_Invoice_v: credit memos (3rd char of DocBaseType = 'C') negate ChargeAmt/TotalLines/GrandTotal; pay-schedule branch UNION
    c_invoice_v: function (withDue) {
      var c = cols('c_invoice'); if (!c.length) return null;
      var cm = "substr(d.docbasetype, 3, 1) = 'C'", ap = "substr(d.docbasetype, 2, 1) = 'P'";
      var over = { chargeamt: 1, totallines: 1, grandtotal: 1, reversal_id: 1 };
      var plain = c.filter(function (x) { return !over[x] && x !== 'c_invoice_id'; });
      var due1 = withDue ? 'paymenttermduedate(i.c_paymentterm_id, i.dateinvoiced)' : 'NULL';
      var a = 'SELECT i.c_invoice_id, NULL AS c_invoicepayschedule_id, ' + plain.map(function (x) { return 'i.' + x; }).join(', ') +
        ', ' + neg('i.chargeamt', cm) + ' AS chargeamt, ' + neg('i.totallines', cm) + ' AS totallines, ' + neg('i.grandtotal', cm) + ' AS grandtotal' +
        ', CASE WHEN ' + cm + ' THEN -1.0 ELSE 1.0 END AS multiplier, CASE WHEN ' + ap + ' THEN -1.0 ELSE 1.0 END AS multiplierap, d.docbasetype, ' +
        due1 + ' AS duedate, i.reversal_id FROM c_invoice i JOIN c_doctype d ON i.c_doctype_id = d.c_doctype_id WHERE i.ispayschedulevalid <> \'Y\'';
      var hasIps = cols('c_invoicepayschedule').length > 0;
      if (!hasIps) return 'CREATE TEMP VIEW IF NOT EXISTS c_invoice_v AS ' + a;
      var b = 'SELECT i.c_invoice_id, ips.c_invoicepayschedule_id, ' + plain.map(function (x) { return 'i.' + x; }).join(', ') +
        ', NULL AS chargeamt, NULL AS totallines, ' + neg('ips.dueamt', cm) + ' AS grandtotal' +
        ', CASE WHEN ' + cm + ' THEN -1 ELSE 1 END AS multiplier, CASE WHEN ' + ap + ' THEN -1 ELSE 1 END AS multiplierap, d.docbasetype, ips.duedate, i.reversal_id ' +
        'FROM c_invoice i JOIN c_doctype d ON i.c_doctype_id = d.c_doctype_id JOIN c_invoicepayschedule ips ON i.c_invoice_id = ips.c_invoice_id ' +
        "WHERE i.ispayschedulevalid = 'Y' AND ips.isvalid = 'Y'";
      return 'CREATE TEMP VIEW IF NOT EXISTS c_invoice_v AS ' + a + ' UNION ' + b;
    }
  };
  // ensureView(name) — create the TEMP view once per bound DB; true when it exists afterwards
  M.ensureView = function (name) {
    name = String(name).toLowerCase();
    var key = name + '@' + (R.DB ? R.DB.__id || (R.DB.__id = Math.random()) : 0);
    if (done[key]) return true;
    try { if (R.DB.query("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=?", [name]).length) return (done[key] = true); } catch (e) {}
    var f = DEF[name]; if (!f) return false;
    try {
      R.DB.query(f(true));
      if (name === 'c_invoice_v') {
        try { R.DB.query('SELECT duedate FROM c_invoice_v LIMIT 1'); }
        catch (e1) {                                  // paymentTermDueDate UDF absent: the view's DueDate column cannot be computed
          R.DB.query('DROP VIEW IF EXISTS temp.c_invoice_v'); R.DB.query(f(false));
          R.unportedDep('C_Invoice_v.DueDate', 'SQL function paymentTermDueDate (column left NULL; no core callout reads it)');
        }
      }
      return (done[key] = true);
    } catch (e) { R.unportedDep('view ' + name, (e && e.message) || String(e)); return false; }
  };

  // currencyConvertInvoice(p_C_Invoice_ID, p_Currency_To_ID, p_Amt, p_ConversionDate) — the live adempiere.currencyconvertinvoice
  // (pg_get_functiondef, 2026-10-04), called by CalloutPaySelection.invoice :108-109. Built on sqlfn.js currencyRound/currencyConvert.
  M.currencyConvertInvoice = function (p_C_Invoice_ID, p_Currency_To_ID, p_Amt, p_ConversionDate) {
    var F = M.SqlFn || {}, D = function (v) { return v == null ? null : R.toBD(v); };
    var i = R.DB.query('SELECT AD_Client_ID AS cl, AD_Org_ID AS org, DateAcct AS da, C_Currency_ID AS cur, C_ConversionType_ID AS ct, CurrencyRate AS cr, ' +
      'GrandTotal AS gt, IsOverrideCurrencyRate AS ov FROM C_Invoice WHERE C_Invoice_ID=?', [p_C_Invoice_ID])[0] || {};
    var b = R.DB.query('SELECT sc.C_Currency_ID AS c FROM AD_ClientInfo ci JOIN C_AcctSchema sc ON ci.C_AcctSchema1_ID=sc.C_AcctSchema_ID WHERE ci.AD_Client_ID=?', [i.cl])[0];
    var v_BaseCurrency_ID = b ? Number(b.c) : null, amt = p_Amt != null ? D(p_Amt) : D(i.gt), rate = D(i.cr);
    if (v_BaseCurrency_ID === Number(p_Currency_To_ID) && rate != null && rate.signum() > 0 && Number(i.cur) !== Number(p_Currency_To_ID) && i.ov === 'Y')
      return F.currencyround(amt == null ? null : amt.multiply(rate), p_Currency_To_ID, null);
    return F.currencyconvert(amt, i.cur, p_Currency_To_ID, p_ConversionDate != null ? p_ConversionDate : i.da, i.ct, i.cl, i.org);
  };
  // register it alongside sqlfn.js's UDFs (that registrar is wrapped, not replaced)
  var baseReg = R.registerSqlFunctions;
  R.registerSqlFunctions = function (reg) {
    var names = typeof baseReg === 'function' ? baseReg(reg) : [];
    reg('currencyconvertinvoice', function (a, b, c, d) { var v = M.currencyConvertInvoice(a, b, c, d); return v == null ? null : (v instanceof R.BD ? v.toString() : (v && v.toString ? v.toString() : v)); });
    return (names || []).concat(['currencyconvertinvoice']);
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

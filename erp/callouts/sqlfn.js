// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/sqlfn.js — the iDempiere PL/pgSQL functions the callout/pricing SQL calls, ported as SQLite UDFs
// (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-SUPPORT-ORACLE). Source of truth = the LIVE
// definitions on the pilot DB (pg_get_functiondef, adempiere schema): bompricestd/list/limit, currencyrate,
// currencyconvert, currencyround, currencybase, invoiceopen (+ the C_Invoice_v view it reads), invoicediscount,
// paymenttermdiscount, paymenttermduedate, paymenttermduedays (incl. IsDueFixed), invoicewriteoff, nextbusinessday, getdate, trunc(date[,fmt]). NUMERIC math goes through BigDecimal and returns
// TEXT (exact) — SQLite coerces it when SQL arithmetic touches it. Registered by the host on its sql.js db:
//   AdCallout.RUNTIME.registerSqlFunctions(function (name, fn) { db.create_function(name, fn); })
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  var R = A.RUNTIME, M = R.M, BD = R.BD, RM = R.RM, Timestamp = R.Timestamp, TimeUtil = R.TimeUtil;
  function q(where, sql, p) { return M.Java.q(where, sql, p); }
  function D(v) { return v == null ? null : R.toBD(v); }
  function out(bd) { return bd == null ? null : bd.toString(); }
  function day(v) { return v == null ? null : TimeUtil.getDay(Timestamp.of(v)); }
  function nowTs() { return new Timestamp(R.now()); }
  // PostgreSQL numeric division: result scale = max(16 - weight-ish, operand scales) — 20 digits is ≥ PG for these magnitudes
  function pdiv(a, b) { return a.divide(b, Math.max(20, a.scale(), b.scale()), RM.HALF_UP); }
  // PG ROUND(numeric, n): half away from zero
  function round(a, n) { return a.setScale(n, RM.HALF_UP); }

  var F = {};
  // bomPriceStd / bomPriceList / bomPriceLimit (identical bodies, one column) — the live adempiere.bompricestd etc.
  function bomPrice(col) {
    var fn = function (Product_ID, PriceList_Version_ID) {
      var r = q('bomPrice' + col, 'SELECT COALESCE(SUM(' + col + '), 0) AS v FROM M_ProductPrice WHERE IsActive=\'Y\' AND M_PriceList_Version_ID=? AND M_Product_ID=?', [PriceList_Version_ID, Product_ID])[0];
      var v_Price = D(r ? r.v : 0);
      if (v_Price.compareTo(BD.ZERO) === 0) {                                                       // No Price - Check if BOM
        q('bomPrice' + col, "SELECT b.M_ProductBOM_ID AS id, b.BOMQty AS qty FROM M_Product_BOM b, M_Product p WHERE b.M_ProductBOM_ID=p.M_Product_ID AND b.M_Product_ID=? " +
          "AND b.M_ProductBOM_ID != ? AND (p.IsBOM='N' OR p.IsVerified='Y') AND b.IsActive='Y'", [Product_ID, Product_ID]).forEach(function (bom) {
          var v_ProductPrice = fn(bom.id, PriceList_Version_ID);
          v_Price = v_Price.add(D(bom.qty).multiply(D(v_ProductPrice)));
        });
      }
      return v_Price;
    };
    return fn;
  }
  F.bompricestd = bomPrice('PriceStd'); F.bompricelist = bomPrice('PriceList'); F.bompricelimit = bomPrice('PriceLimit');

  // currencyRate(from, to, convDate, convType, client, org)
  F.currencyrate = function (p_CurFrom_ID, p_CurTo_ID, p_ConvDate, p_ConversionType_ID, p_Client_ID, p_Org_ID) {
    try {
      if (p_CurFrom_ID != null && p_CurTo_ID != null && Number(p_CurFrom_ID) === Number(p_CurTo_ID)) return BD.ONE;
      var v_ConvDate = p_ConvDate != null ? Timestamp.of(p_ConvDate) : nowTs(), v_ConversionType_ID;
      if (p_ConversionType_ID == null || Number(p_ConversionType_ID) === 0) {
        var ct = q('currencyRate', "SELECT C_ConversionType_ID AS c FROM C_ConversionType WHERE IsActive='Y' AND IsDefault='Y' AND AD_Client_ID IN (0,?) ORDER BY AD_Client_ID DESC LIMIT 1", [p_Client_ID])[0];
        v_ConversionType_ID = ct ? ct.c : null;
      } else v_ConversionType_ID = p_ConversionType_ID;
      var cf = q('currencyRate', 'SELECT MAX(IsEuro) AS e, MAX(IsEMUMember) AS m, MAX(EMUEntryDate) AS d, MAX(EMURate) AS r FROM C_Currency WHERE C_Currency_ID = ?', [p_CurFrom_ID])[0];
      if (!cf || cf.e == null) return null;                                                          // From Currency Not Found
      var ctt = q('currencyRate', 'SELECT MAX(IsEuro) AS e, MAX(IsEMUMember) AS m, MAX(EMUEntryDate) AS d, MAX(EMURate) AS r FROM C_Currency WHERE C_Currency_ID = ?', [p_CurTo_ID])[0];
      if (!ctt || ctt.e == null) return null;                                                        // To Currency Not Found
      var ge = function (d) { return d != null && !v_ConvDate.before(Timestamp.of(d)); };          // v_ConvDate >= EMUEntryDate (NULL → false)
      if (cf.e === 'Y' && ctt.m === 'Y' && ge(ctt.d)) return D(ctt.r);                              // Fixed - From Euro to EMU
      if (ctt.e === 'Y' && cf.m === 'Y' && ge(cf.d)) return pdiv(BD.ONE, D(cf.r));                  // Fixed - From EMU to Euro
      if (cf.m === 'Y' && cf.m === 'Y' && ge(cf.d) && ge(ctt.d)) return pdiv(D(ctt.r), D(cf.r));    // Fixed - From EMU to EMU (the live body tests cf twice)
      var v_CurrencyFrom = p_CurFrom_ID, v_CurrencyTo = p_CurTo_ID;
      if ((cf.m === 'Y' && ge(cf.d)) || (ctt.m === 'Y' && ge(ctt.d))) {
        var eu = q('currencyRate', "SELECT MAX(C_Currency_ID) AS c FROM C_Currency WHERE IsEuro = 'Y'")[0];
        if (!eu || eu.c == null) return null;                                                        // Euro Not Found
        if (cf.m === 'Y' && ge(cf.d)) v_CurrencyFrom = eu.c; else v_CurrencyTo = eu.c;
      }
      var r = q('currencyRate', "SELECT MultiplyRate AS m FROM C_Conversion_Rate WHERE IsActive='Y' AND C_Currency_ID=? AND C_Currency_ID_To=? AND C_ConversionType_ID=? " +
        'AND ? BETWEEN ValidFrom AND ValidTo AND AD_Client_ID IN (0,?) AND AD_Org_ID IN (0,?) ORDER BY AD_Client_ID DESC, AD_Org_ID DESC, ValidFrom DESC',
        [v_CurrencyFrom, v_CurrencyTo, v_ConversionType_ID, TimeUtil.getDay(v_ConvDate).toString(), p_Client_ID, p_Org_ID])[0];
      var v_Rate = r ? D(r.m) : null;
      if (v_Rate == null) return null;                                                               // Conversion Rate Not Found
      if (cf.m === 'Y' && ge(cf.d)) return pdiv(v_Rate, D(cf.r));                                     // Currency From was EMU
      if (ctt.m === 'Y' && ge(ctt.d)) return v_Rate.multiply(D(ctt.r));                               // Currency To was EMU
      return v_Rate;
    } catch (e) { R.log('§SQLFN currencyRate ' + ((e && e.message) || e)); return null; }           // EXCEPTION WHEN OTHERS → NULL
  };
  // currencyRound(amount, curTo, costing)
  F.currencyround = function (p_Amount, p_CurTo_ID, p_Costing) {
    if (p_Amount == null || p_CurTo_ID == null) return p_Amount == null ? null : D(p_Amount);
    var c = q('currencyRound', 'SELECT MAX(StdPrecision) AS s, MAX(CostingPrecision) AS c FROM C_Currency WHERE C_Currency_ID = ?', [p_CurTo_ID])[0];
    if (!c || c.s == null) return D(p_Amount);
    if (p_Costing === 'Y') return round(D(p_Amount), Number(c.c));
    return round(D(p_Amount), Number(c.s));
  };
  // currencyConvert(amount, from, to, convDate, convType, client, org)
  F.currencyconvert = function (p_Amount, p_CurFrom_ID, p_CurTo_ID, p_ConvDate, p_ConversionType_ID, p_Client_ID, p_Org_ID) {
    if ((p_Amount != null && D(p_Amount).signum() === 0) || (p_CurFrom_ID != null && p_CurTo_ID != null && Number(p_CurFrom_ID) === Number(p_CurTo_ID))) return p_Amount == null ? null : D(p_Amount);
    if (p_Amount == null || p_CurFrom_ID == null || p_CurTo_ID == null) return null;
    var v_Rate = F.currencyrate(p_CurFrom_ID, p_CurTo_ID, p_ConvDate, p_ConversionType_ID, p_Client_ID, p_Org_ID);
    if (v_Rate == null) return null;
    return F.currencyround(D(p_Amount).multiply(D(v_Rate)), p_CurTo_ID, null);
  };
  // currencyBase(amount, from, convDate, client, org)
  F.currencybase = function (p_Amount, p_CurFrom_ID, p_ConvDate, p_Client_ID, p_Org_ID) {
    var c = q('currencyBase', 'SELECT MAX(ac.C_Currency_ID) AS c FROM AD_ClientInfo ci, C_AcctSchema ac WHERE ci.C_AcctSchema1_ID=ac.C_AcctSchema_ID AND ci.AD_Client_ID=?', [p_Client_ID])[0];
    if (!c || c.c == null) return null;
    if (Number(p_CurFrom_ID) === Number(c.c)) return p_Amount == null ? null : D(p_Amount);
    return F.currencyconvert(p_Amount, p_CurFrom_ID, c.c, p_ConvDate, null, p_Client_ID, p_Org_ID);
  };
  // C_Invoice_v rows of one invoice (the view is absent from the bundle; its definition, transcribed): grandtotal/multipliers by DocBaseType
  function invoiceV(id) {
    var h = q('invoiceOpen', 'SELECT i.C_Currency_ID AS cur, i.GrandTotal AS gt, i.IsPayScheduleValid AS v, d.DocBaseType AS dbt FROM C_Invoice i JOIN C_DocType d ON i.C_DocType_ID=d.C_DocType_ID WHERE i.C_Invoice_ID=?', [id])[0];
    if (!h) return [];
    var cm = String(h.dbt || '').charAt(2) === 'C', ap = String(h.dbt || '').charAt(1) === 'P';
    var mult = cm ? BD.fromString('-1.0') : BD.fromString('1.0'), multAP = ap ? BD.fromString('-1.0') : BD.fromString('1.0');
    if (h.v !== 'Y') { var g = D(h.gt); return [{ cur: h.cur, gt: g == null ? null : (cm ? g.negate() : g), mult: mult, multAP: multAP }]; }
    return q('invoiceOpen', "SELECT DueAmt AS a FROM C_InvoicePaySchedule WHERE C_Invoice_ID=? AND IsValid='Y'", [id]).map(function (s) {
      var g = D(s.a); return { cur: h.cur, gt: cm ? g.negate() : g, mult: cm ? BD.of(-1) : BD.of(1), multAP: ap ? BD.of(-1) : BD.of(1) };
    });
  }
  function maxBD(list) { var m = null; list.forEach(function (x) { if (x != null && (m == null || x.compareTo(m) > 0)) m = x; }); return m; }
  // invoiceOpen(C_Invoice_ID, C_InvoicePaySchedule_ID)
  F.invoiceopen = function (p_C_Invoice_ID, p_C_InvoicePaySchedule_ID) {
    var rows = invoiceV(p_C_Invoice_ID);
    var v_Currency_ID = rows.length ? rows.map(function (r) { return Number(r.cur); }).reduce(function (a, b) { return Math.max(a, b); }) : null;
    var v_TotalOpenAmt = null;                                                                       // SUM over no rows = NULL
    rows.forEach(function (r) { if (r.gt != null) v_TotalOpenAmt = v_TotalOpenAmt == null ? r.gt : v_TotalOpenAmt.add(r.gt); });
    var v_MultiplierAP = maxBD(rows.map(function (r) { return r.multAP; })), v_MultiplierCM = maxBD(rows.map(function (r) { return r.mult; }));
    var pr = q('invoiceOpen', 'SELECT StdPrecision AS p FROM C_Currency WHERE C_Currency_ID = ?', [v_Currency_ID])[0];
    var v_Precision = pr ? Number(pr.p) : null;
    var v_Min = v_Precision == null ? null : new BD(1n, v_Precision);                               // 1/10^v_Precision
    var v_PaidAmt = BD.ZERO;
    q('invoiceOpen', "SELECT a.AD_Client_ID AS cl, a.AD_Org_ID AS org, al.Amount AS amt, al.DiscountAmt AS dis, al.WriteOffAmt AS wo, a.C_Currency_ID AS cur, a.DateTrx AS dt " +
      "FROM C_AllocationLine al INNER JOIN C_AllocationHdr a ON (al.C_AllocationHdr_ID=a.C_AllocationHdr_ID) WHERE al.C_Invoice_ID = ? AND a.IsActive='Y'", [p_C_Invoice_ID]).forEach(function (ar) {
      var v_Temp = D(ar.amt).add(D(ar.dis)).add(D(ar.wo));
      var conv = F.currencyconvert(v_MultiplierAP == null ? null : v_Temp.multiply(v_MultiplierAP), ar.cur, v_Currency_ID, ar.dt, null, ar.cl, ar.org);
      v_PaidAmt = (v_PaidAmt == null || conv == null) ? null : v_PaidAmt.add(D(conv));                // NUMERIC + NULL = NULL
    });
    if (p_C_InvoicePaySchedule_ID != null && Number(p_C_InvoicePaySchedule_ID) > 0) {                // Do we have a Payment Schedule ?
      var v_Remaining = v_PaidAmt;
      q('invoiceOpen', "SELECT C_InvoicePaySchedule_ID AS id, DueAmt AS a FROM C_InvoicePaySchedule WHERE C_Invoice_ID = ? AND IsValid='Y' ORDER BY DueDate", [p_C_Invoice_ID]).forEach(function (s) {
        var due = D(s.a);
        if (Number(s.id) === Number(p_C_InvoicePaySchedule_ID)) {
          v_TotalOpenAmt = (v_MultiplierCM == null || v_Remaining == null) ? null : due.multiply(v_MultiplierCM).subtract(v_Remaining);
          if (v_Remaining != null && due.subtract(v_Remaining).signum() < 0) v_TotalOpenAmt = BD.ZERO;
        } else {
          v_Remaining = v_Remaining == null ? null : v_Remaining.subtract(due);
          if (v_Remaining != null && v_Remaining.signum() < 0) v_Remaining = BD.ZERO;
        }
      });
    } else {
      v_TotalOpenAmt = (v_TotalOpenAmt == null || v_PaidAmt == null) ? null : v_TotalOpenAmt.subtract(v_PaidAmt);
    }
    if (v_TotalOpenAmt != null && v_Min != null && v_TotalOpenAmt.compareTo(v_Min.negate()) > 0 && v_TotalOpenAmt.compareTo(v_Min) < 0) v_TotalOpenAmt = BD.ZERO;   // Ignore Rounding
    if (v_Precision == null) return null;                                                             // ROUND(x, NULL) = NULL
    return round(v_TotalOpenAmt == null ? BD.ZERO : v_TotalOpenAmt, v_Precision);
  };
  // nextBusinessDay(date, client)
  F.nextbusinessday = function (p_Date, p_AD_Client_ID) {
    var v_nextDate = day(p_Date);
    var co = q('nextBusinessDay', 'SELECT COALESCE(MAX(co.C_Country_ID), 100) AS c FROM AD_Client cl JOIN AD_Language l ON cl.AD_Language = l.AD_Language JOIN C_Country co ON l.CountryCode = co.CountryCode WHERE cl.AD_Client_ID = ?', [p_AD_Client_ID])[0];
    var v_country = co ? co.c : 100, v_isHoliday = true;
    for (;;) {
      var dow = new Date(v_nextDate.getTime()).getUTCDay();                                         // TO_CHAR(d,'D'): Sat=7 → +2, Sun=1 → +1
      v_nextDate = TimeUtil.addDays(v_nextDate, dow === 6 ? 2 : dow === 0 ? 1 : 0);
      v_isHoliday = false;
      var nbd = q('nextBusinessDay', "SELECT Date1 AS d FROM C_NonBusinessDay WHERE AD_Client_ID=? AND IsActive ='Y' AND Date1 >= ? AND COALESCE(C_Country_ID,0) IN (0, ?) ORDER BY Date1", [p_AD_Client_ID, v_nextDate.toString(), v_country]);
      for (var i = 0; i < nbd.length; i++) {
        if (v_nextDate.getTime() !== day(nbd[i].d).getTime()) break;
        v_nextDate = TimeUtil.addDays(v_nextDate, 1); v_isHoliday = true;
      }
      if (v_isHoliday === false) break;
    }
    return v_nextDate;
  };
  // paymentTermDiscount(amount, currency, paymentTerm, docDate, payDate)
  F.paymenttermdiscount = function (Amount, Currency_ID, PaymentTerm_ID, DocDate, PayDate) {
    var v_Currency = Currency_ID;
    if (v_Currency != null && Number(v_Currency) === 0) {
      var c = q('paymentTermDiscount', 'SELECT COALESCE(MAX(C_Currency_ID),0) AS c FROM AD_ClientInfo ci, C_AcctSchema s, C_PaymentTerm pt WHERE ci.AD_Client_ID = s.AD_Client_ID AND ci.AD_Client_ID = pt.AD_Client_ID AND pt.C_PaymentTerm_ID = ?', [PaymentTerm_ID])[0];
      v_Currency = c ? c.c : 0;
    }
    var pr = q('paymentTermDiscount', 'SELECT StdPrecision AS p FROM C_Currency WHERE C_Currency_ID = ?', [v_Currency])[0];
    var v_Precision = pr ? Number(pr.p) : null;                                                      // plpgsql SELECT INTO with no row → NULL
    var v_Min = v_Precision == null ? null : new BD(1n, v_Precision);
    if (Amount == null || PaymentTerm_ID == null || DocDate == null) return BD.ZERO;                 // No Data - No Discount
    var Discount = BD.ZERO;
    q('paymentTermDiscount', 'SELECT * FROM C_PaymentTerm WHERE C_PaymentTerm_ID = ?', [PaymentTerm_ID]).forEach(function (p) {
      var dd = Timestamp.of(DocDate);
      var d1 = TimeUtil.getDay(TimeUtil.addDays(dd, Number(p.discountdays || 0) + Number(p.gracedays || 0)));
      var d2 = TimeUtil.getDay(TimeUtil.addDays(dd, Number(p.discountdays2 || 0) + Number(p.gracedays || 0)));
      if (p.isnextbusinessday === 'Y') { d1 = F.nextbusinessday(d1, p.ad_client_id); d2 = F.nextbusinessday(d2, p.ad_client_id); }
      var pay = PayDate == null ? null : day(PayDate);                                              // NULL compare → false
      if (pay != null && !d1.before(pay)) Discount = pdiv(D(Amount).multiply(D(p.discount)), BD.of(100));
      else if (pay != null && !d2.before(pay)) Discount = pdiv(D(Amount).multiply(D(p.discount2)), BD.of(100));
    });
    if (v_Min != null && Discount.compareTo(v_Min.negate()) > 0 && Discount.compareTo(v_Min) < 0) Discount = BD.ZERO;
    if (v_Precision == null) return null;
    return round(Discount, v_Precision);
  };
  // invoiceDiscount(C_Invoice_ID, payDate, C_InvoicePaySchedule_ID)
  F.invoicediscount = function (p_C_Invoice_ID, p_PayDate, p_C_InvoicePaySchedule_ID) {
    try {
      var i = q('invoiceDiscount', 'SELECT ci.IsDiscountLineAmt AS dla, i.GrandTotal AS gt, i.TotalLines AS tl, i.C_PaymentTerm_ID AS pt, i.DateInvoiced AS di, i.IsPayScheduleValid AS psv, C_Currency_ID AS cur ' +
        'FROM AD_ClientInfo ci, C_Invoice i WHERE ci.AD_Client_ID=i.AD_Client_ID AND i.C_Invoice_ID=?', [p_C_Invoice_ID])[0] || {};
      var v_Amount;
      if (i.dla === 'Y') {
        var s = q('invoiceDiscount', "SELECT COALESCE(SUM(l.LineNetAmt), 0) AS v FROM C_InvoiceLine l LEFT JOIN C_Charge c ON l.C_Charge_ID = c.C_Charge_ID WHERE l.C_Invoice_ID = ? AND COALESCE(c.isexcludedfromdiscount, 'N') = 'N'", [p_C_Invoice_ID])[0];
        v_Amount = D(s ? s.v : 0);
      } else v_Amount = D(i.gt);
      if (v_Amount != null && v_Amount.signum() === 0) return BD.ZERO;                              // Anything to discount?
      var v_PayDate = p_PayDate != null ? Timestamp.of(p_PayDate) : nowTs();
      if (i.psv === 'Y' && p_C_InvoicePaySchedule_ID != null && Number(p_C_InvoicePaySchedule_ID) > 0) {
        var ps = q('invoiceDiscount', 'SELECT COALESCE(MAX(DiscountAmt),0) AS v FROM C_InvoicePaySchedule WHERE C_InvoicePaySchedule_ID=? AND DiscountDate >= ?', [p_C_InvoicePaySchedule_ID, v_PayDate.toString()])[0];
        return D(ps ? ps.v : 0);
      }
      return F.paymenttermdiscount(v_Amount, i.cur, i.pt, i.di, p_PayDate);                          // note: passes p_PayDate, not v_PayDate (as the live body)
    } catch (e) { R.log('§SQLFN invoiceDiscount ' + ((e && e.message) || e)); return null; }        // EXCEPTION WHEN OTHERS → NULL
  };
  // ── adempiere.add_months(timestamptz, numeric) = datetime + interval '1 month' * TRUNC(months): PG clamps the day to the month end
  function addMonths(ts, n) {
    var d = new Date(ts.getTime()), m = d.getUTCMonth() + Math.trunc(Number(n || 0)), y = d.getUTCFullYear();
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Timestamp(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  }
  function monthStart(ts) { var d = new Date(ts.getTime()); return new Timestamp(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
  function monthLastDay(ts) { var d = new Date(ts.getTime()); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); }
  function plusDays(ts, n) { return new Timestamp(ts.getTime() + Number(n) * 86400000); }
  // paymentTermDueDate(PaymentTerm_ID, DocDate) -- adempiere.paymenttermduedate (plpgsql, \sf on the idempiere DB)
  F.paymenttermduedate = function (PaymentTerm_ID, DocDate) {
    var doc = Timestamp.of(DocDate); if (doc == null) return null;                                   // TRUNC(NULL) = NULL
    var DueDate = TimeUtil.getDay(doc);                                                                // DueDate := TRUNC(DocDate)
    q('paymentTermDueDate', 'SELECT * FROM C_PaymentTerm WHERE C_PaymentTerm_ID = ?', [PaymentTerm_ID]).forEach(function (p) {
      if (p.isduefixed === 'Y') {
        var FirstDay = monthStart(doc);                                                                // TRUNC(DocDate,'MM')
        var NoDays = Math.round((TimeUtil.getDay(doc).getTime() - FirstDay.getTime()) / 86400000);
        DueDate = plusDays(FirstDay, Number(p.fixmonthday) - 1);                                       // starting on 1st
        DueDate = addMonths(DueDate, p.fixmonthoffset);
        if (NoDays > Number(p.fixmonthcutoff)) DueDate = addMonths(DueDate, 1);
      } else DueDate = plusDays(TimeUtil.getDay(doc), Number(p.netdays));
    });
    return DueDate;
  };
  // paymentTermDueDays(PaymentTerm_ID, DocDate, PayDate) -- adempiere.paymenttermduedays (plpgsql, \sf), incl. the IsDueFixed branch
  F.paymenttermduedays = function (PaymentTerm_ID, DocDate, PayDate) {
    var doc = Timestamp.of(DocDate);
    if ((PaymentTerm_ID != null && Number(PaymentTerm_ID) === 0) || doc == null) return 0;
    var v_PayDate = Timestamp.of(PayDate) || nowTs(), DueDate = null;
    q('paymentTermDueDays', 'SELECT * FROM C_PaymentTerm WHERE C_PaymentTerm_ID = ?', [PaymentTerm_ID]).forEach(function (p) {
      if (p.isduefixed === 'Y') {
        var calDueDate = TimeUtil.getDay(doc), MaxDayCut = monthLastDay(calDueDate), cut = Number(p.fixmonthcutoff), fmd = Number(p.fixmonthday);
        if (cut > MaxDayCut) calDueDate = plusDays(monthStart(calDueDate), MaxDayCut - 1);              // last day of month
        else calDueDate = plusDays(monthStart(calDueDate), cut - 1);                                    // set day FixMonthCutoff
        var off = Number(p.fixmonthoffset);
        if (doc.after(calDueDate)) off = off + 1;                                                       // DocDate (timestamp) > calDueDate
        calDueDate = addMonths(calDueDate, off);
        var MaxDay = monthLastDay(calDueDate);
        if (fmd > MaxDay || (fmd >= 30 && MaxDay > fmd)) calDueDate = plusDays(monthStart(calDueDate), MaxDay - 1);   // 32 -> 28, 30 -> 31
        else calDueDate = plusDays(monthStart(calDueDate), fmd - 1);
        DueDate = calDueDate;
      } else DueDate = plusDays(TimeUtil.getDay(doc), Number(p.netdays));
    });
    if (DueDate == null) return 0;
    return Math.round((TimeUtil.getDay(v_PayDate).getTime() - DueDate.getTime()) / 86400000);        // EXTRACT(day FROM interval)
  };
  // invoiceWriteOff(C_Invoice_ID) -- adempiere.invoicewriteoff: 0 unless sysconfig PAYSELECTION_CUSTOM_INVOICEWRITEOFF_FUNCTION names a function
  F.invoicewriteoff = function (p_C_Invoice_ID) {
    var h = q('invoiceWriteOff', 'SELECT AD_Client_ID AS c FROM C_Invoice WHERE C_Invoice_ID=?', [p_C_Invoice_ID])[0];
    var cl = h ? h.c : null;
    var sc = q('invoiceWriteOff', "SELECT Value AS v FROM AD_SysConfig WHERE Name='PAYSELECTION_CUSTOM_INVOICEWRITEOFF_FUNCTION' AND AD_Client_ID IN (0,?) AND AD_Org_ID IN (0,0) AND IsActive='Y' ORDER BY AD_Client_ID DESC, AD_Org_ID DESC LIMIT 1", [cl])[0];
    var custom = sc && sc.v != null ? String(sc.v) : '';                                              // get_Sysconfig(name,'',client,0)
    if (custom.length > 0) {                                                                          // EXECUTE 'SELECT '||custom||'('||id||')'
      var f = F[custom.toLowerCase()];
      if (typeof f === 'function') return D(f(p_C_Invoice_ID));
      R.log('§SQLFN invoiceWriteOff custom function ' + custom + ' not ported'); return null;
    }
    return BD.ZERO;
  };
  F.getdate = function () { return nowTs(); };                                                        // statement_timestamp()
  // trunc(datetime[, format]) — CAST(... AS DATE) / DATE_Trunc
  F.trunc = function (dt, fmt) {
    if (dt == null) return null;
    if (typeof dt === 'number') return Math.trunc(dt);                                                // numeric trunc
    var t = Timestamp.of(dt); if (t == null) return dt;
    var d = new Date(t.getTime());
    if (fmt === 'Q') return new Timestamp(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
    if (fmt === 'Y' || fmt === 'YEAR') return new Timestamp(Date.UTC(d.getUTCFullYear(), 0, 1));
    if (fmt === 'MM' || fmt === 'MONTH') return new Timestamp(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    return TimeUtil.getDay(t);
  };
  M.SqlFn = F;

  // SQLite binds a UDF by (name, nArg) and sql.js takes nArg from fn.length — each wrapper declares the PL/pgSQL arity
  var ARITY = { bompricestd: [2], bompricelist: [2], bompricelimit: [2], currencyrate: [6], currencyround: [3], currencyconvert: [7],
    currencybase: [5], invoiceopen: [2], invoicediscount: [3], paymenttermdiscount: [5], paymenttermduedate: [2], paymenttermduedays: [3], invoicewriteoff: [1], nextbusinessday: [2], getdate: [0], trunc: [1, 2] };
  function conv(v) { if (v instanceof BD) return out(v); if (v instanceof Timestamp) return v.toString(); return v; }
  function arity(fn, n) {
    switch (n) {
      case 0: return function () { return conv(fn()); };
      case 1: return function (a) { return conv(fn(a)); };
      case 2: return function (a, b) { return conv(fn(a, b)); };
      case 3: return function (a, b, c) { return conv(fn(a, b, c)); };
      case 5: return function (a, b, c, d, e) { return conv(fn(a, b, c, d, e)); };
      case 6: return function (a, b, c, d, e, f) { return conv(fn(a, b, c, d, e, f)); };
      case 7: return function (a, b, c, d, e, f, g) { return conv(fn(a, b, c, d, e, f, g)); };
    }
    throw new Error('arity ' + n);
  }
  R.registerSqlFunctions = function (reg) {
    var names = Object.keys(ARITY);
    names.forEach(function (n) { ARITY[n].forEach(function (k) { reg(n, arity(F[n], k)); }); });
    return names;
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

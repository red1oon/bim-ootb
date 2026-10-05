// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/currency.js — MConversionRate + MConversionType.getDefault + MCurrency precision statics, ported verbatim
// (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-SUPPORT-ORACLE). Fills AdCallout.RUNTIME.M.
// M = org.adempiere.base/src/org/compiere/model. Read-only (MConversionRate.setRate :163-227 is a write → not ported).
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  var R = A.RUNTIME, M = R.M, Env = R.Env, RM = R.RM, TimeUtil = R.TimeUtil;
  function DB() { return R.DB; }

  // ── shared Java helpers (BigDecimal.valueOf(double) = new BigDecimal(Double.toString(d))) ──────────────────
  M.Java = M.Java || {};
  M.Java.valueOfDouble = M.Java.valueOfDouble || function (d) {
    if (!isFinite(d)) throw new Error('NumberFormatException: ' + d);
    var a = Math.abs(d), s;
    if (a === 0 || (a >= 1e-3 && a < 1e7)) {                    // Double.toString: plain notation, ≥1 fraction digit
      s = String(d); if (s.indexOf('e') >= 0) s = d.toFixed(20).replace(/0+$/, '');
      if (s.indexOf('.') < 0) s += '.0';
      return R.BD.fromString(s);
    }
    var e = d.toExponential(), m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(e);   // computerized sci notation "d.dddE±n"
    var frac = m[3] || '0', exp = parseInt(m[4], 10);
    var bd = R.BD.fromString(m[1] + m[2] + '.' + frac);         // mantissa, scale = frac digits
    return new R.BD(bd.u, bd.s - exp);
  };
  // safe query — a table absent from this bundle slice is an UNPORTED-DEP (empty result), never a silent pass
  M.Java.q = M.Java.q || function (where, sql, params) {
    try { return DB().query(sql, params || []); }
    catch (e) { var m = String((e && e.message) || e); if (/no such (table|column)/.test(m)) { R.unportedDep(where, 'bundle table/column: ' + m); return []; } throw e; }
  };

  // DB.getSQLValue (non-Ex): an SQL error is logged and returns -1 (U/DB.java) — a bundle-absent table is that path + a named dep
  M.Java.sv = M.Java.sv || function (where, sql) {
    var a = Array.prototype.slice.call(arguments, 2);
    try { return DB().getSQLValue.apply(null, [null, sql].concat(a)); }
    catch (e) { R.unportedDep(where, 'bundle table/column: ' + ((e && e.message) || e) + ' → DB.getSQLValue -1'); return -1; }
  };
  // ── MCurrency (M/MCurrency.java) ─────────────────────────────────────────────────────────────────────────
  M.MCurrency = {
    get: function (ctx, id) { return R.PO.get('C_Currency', id); },
    getStdPrecision: function (ctx, C_Currency_ID) { var c = M.MCurrency.get(ctx, C_Currency_ID); return c.getStdPrecision(); },          // :242-246
    getCostingPrecision: function (ctx, C_Currency_ID) { var c = M.MCurrency.get(ctx, C_Currency_ID); return c.getCostingPrecision(); }   // :268-271
  };
  // ── MClient.getC_Currency_ID (M/MClient.java:311-318 → MClientInfo acct schema 1 currency) ─────────────────
  M.MClient = M.MClient || {};
  M.MClient.getC_Currency_ID = function (ctx, AD_Client_ID) {
    var cid = AD_Client_ID == null ? Env.getAD_Client_ID(ctx) : AD_Client_ID;
    var r = DB().query('SELECT a.C_Currency_ID AS c FROM AD_ClientInfo ci JOIN C_AcctSchema a ON a.C_AcctSchema_ID=ci.C_AcctSchema1_ID WHERE ci.AD_Client_ID=?', [cid])[0];
    return r ? Number(r.c) : 0;
  };
  // ── MConversionType.getDefault (M/MConversionType.java:53-72) ─────────────────────────────────────────────
  M.MConversionType = {
    TYPE_SPOT: 114,
    getDefault: function (AD_Client_ID) {
      return M.Java.sv('MConversionType.getDefault', "SELECT C_ConversionType_ID FROM C_ConversionType WHERE IsActive='Y' AND AD_Client_ID IN (0,?) ORDER BY IsDefault DESC, AD_Client_ID DESC", AD_Client_ID);
    }
  };
  // ── MConversionRate (M/MConversionRate.java) ─────────────────────────────────────────────────────────────
  var MConversionRate = M.MConversionRate = {
    // convertBase :67-74
    convertBase: function (ctx, Amt, CurFrom_ID, ConvDate, C_ConversionType_ID, AD_Client_ID, AD_Org_ID) {
      return MConversionRate.convert(ctx, Amt, CurFrom_ID, M.MClient.getC_Currency_ID(ctx), ConvDate, C_ConversionType_ID, AD_Client_ID, AD_Org_ID);
    },
    // convert :86-155 — overloads (ctx, Amt, from, to, client, org) / (…, ConvDate, type, client, org [, isCosting])
    convert: function (ctx, Amt, CurFrom_ID, CurTo_ID, a, b, c, d, isCosting) {
      var ConvDate, C_ConversionType_ID, AD_Client_ID, AD_Org_ID;
      if (c === undefined) { ConvDate = null; C_ConversionType_ID = 0; AD_Client_ID = a; AD_Org_ID = b; }       // :86-91
      else { ConvDate = a; C_ConversionType_ID = b; AD_Client_ID = c; AD_Org_ID = d; }
      if (Amt == null) throw new Error('Required parameter missing - Amt');                                       // :130-131
      if (CurFrom_ID === CurTo_ID || Amt.compareTo(Env.ZERO) === 0) return Amt;                                   // :133-134
      var retValue = MConversionRate.getRate(CurFrom_ID, CurTo_ID, ConvDate, C_ConversionType_ID, AD_Client_ID, AD_Org_ID);   // :136-138
      if (retValue == null) return null;
      retValue = retValue.multiply(Amt);                                                                          // :143-147
      var stdPrecision = isCosting ? M.MCurrency.getCostingPrecision(ctx, CurTo_ID) : M.MCurrency.getStdPrecision(ctx, CurTo_ID);
      if (retValue.scale() > stdPrecision) retValue = retValue.setScale(stdPrecision, RM.HALF_UP);
      return retValue;
    },
    // getRate :229-286
    getRate: function (CurFrom_ID, CurTo_ID, ConvDate, ConversionType_ID, AD_Client_ID, AD_Org_ID) {
      if (CurFrom_ID === CurTo_ID) return Env.ONE;
      var C_ConversionType_ID = ConversionType_ID;                                                                // :236-239
      if (C_ConversionType_ID === 0 || C_ConversionType_ID == null) C_ConversionType_ID = M.MConversionType.getDefault(AD_Client_ID);
      if (ConvDate == null) ConvDate = TimeUtil.getDay(null);                                                     // :241-243 (TimeUtil.getDay(null) = today)
      var sql = 'SELECT MultiplyRate FROM C_Conversion_Rate WHERE C_Currency_ID=? AND C_Currency_ID_To=? AND C_ConversionType_ID=?' +
        " AND ? BETWEEN ValidFrom AND ValidTo AND AD_Client_ID IN (0,?) AND AD_Org_ID IN (0,?) AND IsActive = 'Y' " +
        'ORDER BY AD_Client_ID DESC, AD_Org_ID DESC, ValidFrom DESC';                                              // :245-256
      var rs = DB().prepareStatement(sql);
      rs.setInt(1, CurFrom_ID); rs.setInt(2, CurTo_ID); rs.setInt(3, C_ConversionType_ID);
      rs.setTimestamp(4, TimeUtil.getDay(ConvDate)); rs.setInt(5, AD_Client_ID); rs.setInt(6, AD_Org_ID);
      var r = rs.executeQuery(), retValue = null;
      if (r.next()) retValue = r.getBigDecimal(1);
      return retValue;
    }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/uom.js — MUOMConversion + MUOM statics, ported verbatim (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP —
// Witness: W-CP-SUPPORT-ORACLE). Fills AdCallout.RUNTIME.M. M = org.adempiere.base/src/org/compiere/model.
// Server path throughout (Ini.isClient()=false on the ZK server, the oracle's path). Read-only.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  var R = A.RUNTIME, M = R.M, Env = R.Env, RM = R.RM, BD = R.BD, Timestamp = R.Timestamp;
  function DB() { return R.DB; }
  function vd(d) { return M.Java.valueOfDouble(d); }

  // ── MUOM (M/MUOM.java) ──────────────────────────────────────────────────────────────────────────────────
  var X12 = { SECOND: '03', MINUTE: 'MJ', HOUR: 'HR', DAY: 'DA', DAY_WORK: 'WD', WEEK: 'WK', MONTH: 'MO', MONTH_WORK: 'WM', YEAR: 'YR' };   // :45-61
  function wrapUOM(po) {
    if (!po) return null;
    var x = function () { return po.getX12DE355(); };
    return Object.assign(Object.create(null), {
      po: po, getC_UOM_ID: function () { return po.getC_UOM_ID(); }, getStdPrecision: function () { return po.getStdPrecision(); },
      getCostingPrecision: function () { return po.getCostingPrecision(); }, getX12DE355: x,
      // round :276-283 — note setScale uses getStdPrecision() even when !stdPrecision (as the Java does)
      round: function (qty, stdPrecision) {
        var precision = po.getStdPrecision();
        if (!stdPrecision) precision = po.getCostingPrecision();
        if (qty.scale() > precision) return qty.setScale(po.getStdPrecision(), RM.HALF_UP);
        return qty;
      },
      isSecond: function () { return X12.SECOND === x(); }, isMinute: function () { return X12.MINUTE === x(); },         // :295-364
      isHour: function () { return X12.HOUR === x(); }, isDay: function () { return X12.DAY === x(); },
      isWorkDay: function () { return X12.DAY_WORK === x(); }, isWeek: function () { return X12.WEEK === x(); },
      isMonth: function () { return X12.MONTH === x(); }, isWorkMonth: function () { return X12.MONTH_WORK === x(); },
      isYear: function () { return X12.YEAR === x(); }
    });
  }
  var MUOM = M.MUOM = {
    X12_MINUTE: X12.MINUTE,
    get: function (ctx, C_UOM_ID) { if (C_UOM_ID === undefined) { C_UOM_ID = ctx; } return wrapUOM(R.PO.get('C_UOM', C_UOM_ID)); },
    getMinute_UOM_ID: function (ctx) { return M.Java.sv('MUOM.getMinute_UOM_ID', "SELECT C_UOM_ID FROM C_UOM WHERE IsActive='Y' AND X12DE355=?", X12.MINUTE); },   // :68-83
    getDefault_UOM_ID: function (ctx) {                                                                            // :85-92
      return M.Java.sv('MUOM.getDefault_UOM_ID', 'SELECT C_UOM_ID FROM C_UOM WHERE AD_Client_ID IN (0,?) ORDER BY IsDefault DESC, AD_Client_ID DESC, C_UOM_ID', Env.getAD_Client_ID(ctx));
    },
    getPrecision: function (ctx, C_UOM_ID) { var uom = MUOM.get(ctx, C_UOM_ID); return uom.getStdPrecision(); }     // :157-161
  };

  // ── MUOMConversion (M/MUOMConversion.java) ───────────────────────────────────────────────────────────────
  var GETRATE = vd(123.456);                                                                                        // :712
  function conv(row) {                                                                                              // a C_UOM_Conversion row, Java getters
    return { getC_UOM_ID: function () { return Number(row.c_uom_id); }, getC_UOM_To_ID: function () { return Number(row.c_uom_to_id); },
      getM_Product_ID: function () { return Number(row.m_product_id || 0); },
      getMultiplyRate: function () { return R.toBD(row.multiplyrate); }, getDivideRate: function () { return R.toBD(row.dividerate); } };
  }
  var U = M.MUOMConversion = M.MUOMConversion || {};
  U.GETRATE = GETRATE;
  // convert(ctx, from, to, qty) :64-77 ; convert(from, to, qty, StdPrecision) :395-455 (int first arg = the static overload)
  U.convert = function (a, b, c, d) {
    if (typeof a === 'number') return U.convertUOM(a, b, c, d);
    var ctx = a, C_UOM_ID = b, C_UOM_To_ID = c, qty = d;
    if (qty == null || qty.compareTo(Env.ZERO) === 0 || C_UOM_ID === C_UOM_To_ID) return qty;
    var retValue = U.getRate(ctx, C_UOM_ID, C_UOM_To_ID);
    if (retValue != null) {
      var uom = MUOM.get(ctx, C_UOM_To_ID);
      if (uom != null) return uom.round(retValue.multiply(qty), true);
      return retValue.multiply(qty);
    }
    return null;
  };
  // getRate(ctx, from, to) :87-97 ; getRate(from, to) :381-384
  U.getRate = function (a, b, c) {
    if (c === undefined) return U.convertUOM(a, b, GETRATE, false);
    var C_UOM_ID = b, C_UOM_To_ID = c;
    if (C_UOM_ID === C_UOM_To_ID) return Env.ONE;
    return U.getRatePoint(a, C_UOM_ID, C_UOM_To_ID);
  };
  // getRate(ctx, Point) :148-160 — server: direct table lookup, else derive
  U.getRatePoint = function (ctx, x, y) {
    var retValue = U.getRate(x, y);
    if (retValue != null) return retValue;
    return U.deriveRate(ctx, x, y);
  };
  // convertToMinutes :107-120
  U.convertToMinutes = function (ctx, C_UOM_ID, qty) {
    if (qty == null) return 0;
    var C_UOM_To_ID = MUOM.getMinute_UOM_ID(ctx);
    if (C_UOM_ID === C_UOM_To_ID) return Math.trunc(Number(qty.toString()));
    var result = U.convert(ctx, C_UOM_ID, C_UOM_To_ID, qty);
    if (result == null) return 0;
    return Math.trunc(Number(result.toString()));
  };
  // getEndDate :130-140
  U.getEndDate = function (ctx, startDate, C_UOM_ID, qty) {
    var minutes = U.convertToMinutes(ctx, C_UOM_ID, qty);
    return new Timestamp(startDate.getTime() + minutes * 60000);
  };
  // createRates :169-210 — the CLIENT cache (Ini.isClient()); kept for completeness, not on the server path
  U.createRates = function (ctx) {
    var out = {};
    DB().query("SELECT C_UOM_ID AS a, C_UOM_To_ID AS b, MultiplyRate AS m, DivideRate AS d FROM C_UOM_Conversion WHERE IsActive='Y' AND M_Product_ID IS NULL AND AD_Client_ID IN (0,?)", [Env.getAD_Client_ID(ctx)]).forEach(function (r) {
      var mr = R.toBD(r.m), dr = R.toBD(r.d);
      if (mr != null) out[r.a + ',' + r.b] = mr;
      if (dr == null && mr != null) dr = Env.ONE.divide(mr, 0, RM.HALF_UP);      // Env.ONE.divide(mr, HALF_UP) keeps scale 0
      if (dr != null) out[r.b + ',' + r.a] = dr;
    });
    return out;
  };
  // deriveRate :216-376 — time UOM table, BigDecimal.valueOf(double) exactly as the Java literals
  U.deriveRate = function (ctx, C_UOM_ID, C_UOM_To_ID) {
    if (C_UOM_ID === C_UOM_To_ID) return Env.ONE;
    var from = MUOM.get(ctx, C_UOM_ID), to = MUOM.get(ctx, C_UOM_To_ID);
    if (from == null || to == null) return null;
    if (from.isMinute()) {                                                                                         // :232-249
      if (to.isHour()) return vd(1.0 / 60.0); if (to.isDay()) return vd(1.0 / 1440.0); if (to.isWorkDay()) return vd(1.0 / 480.0);
      if (to.isWeek()) return vd(1.0 / 10080.0); if (to.isMonth()) return vd(1.0 / 43200.0); if (to.isWorkMonth()) return vd(1.0 / 9600.0);
      if (to.isYear()) return vd(1.0 / 525600.0);
    }
    if (from.isHour()) {                                                                                           // :251-268
      if (to.isMinute()) return vd(60.0); if (to.isDay()) return vd(1.0 / 24.0); if (to.isWorkDay()) return vd(1.0 / 8.0);
      if (to.isWeek()) return vd(1.0 / 168.0); if (to.isMonth()) return vd(1.0 / 720.0); if (to.isWorkMonth()) return vd(1.0 / 160.0);
      if (to.isYear()) return vd(1.0 / 8760.0);
    }
    if (from.isDay()) {                                                                                            // :270-287
      if (to.isMinute()) return vd(1440.0); if (to.isHour()) return vd(24.0); if (to.isWorkDay()) return vd(3.0);
      if (to.isWeek()) return vd(1.0 / 7.0); if (to.isMonth()) return vd(1.0 / 30.0); if (to.isWorkMonth()) return vd(1.0 / 20.0);
      if (to.isYear()) return vd(1.0 / 365.0);
    }
    if (from.isWorkDay()) {                                                                                        // :289-306
      if (to.isMinute()) return vd(480.0); if (to.isHour()) return vd(8.0); if (to.isDay()) return vd(1.0 / 3.0);
      if (to.isWeek()) return vd(1.0 / 5); if (to.isMonth()) return vd(1.0 / 20.0); if (to.isWorkMonth()) return vd(1.0 / 20.0);
      if (to.isYear()) return vd(1.0 / 240.0);
    }
    if (from.isWeek()) {                                                                                           // :308-325
      if (to.isMinute()) return vd(10080.0); if (to.isHour()) return vd(168.0); if (to.isDay()) return vd(7.0);
      if (to.isWorkDay()) return vd(5.0); if (to.isMonth()) return vd(1.0 / 4.0); if (to.isWorkMonth()) return vd(1.0 / 4.0);
      if (to.isYear()) return vd(1.0 / 50.0);
    }
    if (from.isMonth()) {                                                                                          // :327-344
      if (to.isMinute()) return vd(43200.0); if (to.isHour()) return vd(720.0); if (to.isDay()) return vd(30.0);
      if (to.isWorkDay()) return vd(20.0); if (to.isWeek()) return vd(4.0); if (to.isWorkMonth()) return vd(1.5);
      if (to.isYear()) return vd(1.0 / 12.0);
    }
    if (from.isWorkMonth()) {                                                                                      // :346-363
      if (to.isMinute()) return vd(9600.0); if (to.isHour()) return vd(160.0); if (to.isDay()) return vd(20.0);
      if (to.isWorkDay()) return vd(20.0); if (to.isWeek()) return vd(4.0); if (to.isMonth()) return vd(20.0 / 30.0);
      if (to.isYear()) return vd(1.0 / 12.0);
    }
    if (from.isYear()) {                                                                                           // :365-382
      if (to.isMinute()) return vd(518400.0); if (to.isHour()) return vd(8640.0); if (to.isDay()) return vd(365.0);
      if (to.isWorkDay()) return vd(240.0); if (to.isWeek()) return vd(50.0); if (to.isMonth()) return vd(12.0);
      if (to.isWorkMonth()) return vd(12.0);
    }
    return null;
  };
  // convert(int from, int to, qty, StdPrecision) :395-455
  U.convertUOM = function (C_UOM_From_ID, C_UOM_To_ID, qty, StdPrecision) {
    if (qty == null || qty.compareTo(Env.ZERO) === 0 || C_UOM_From_ID === C_UOM_To_ID) return qty;
    var retValue = null, precision = 2;
    var ps = DB().prepareStatement('SELECT c.MultiplyRate, uomTo.StdPrecision, uomTo.CostingPrecision FROM C_UOM_Conversion c' +
      ' INNER JOIN C_UOM uomTo ON (c.C_UOM_TO_ID=uomTo.C_UOM_ID) ' +
      "WHERE c.IsActive='Y' AND c.C_UOM_ID=? AND c.C_UOM_TO_ID=?  AND c.M_Product_ID IS NULL ORDER BY c.AD_Client_ID DESC, c.AD_Org_ID DESC");
    ps.setInt(1, C_UOM_From_ID); ps.setInt(2, C_UOM_To_ID);
    var rs = ps.executeQuery();
    if (rs.next()) { retValue = rs.getBigDecimal(1); precision = rs.getInt(StdPrecision ? 2 : 3); }
    if (retValue == null) return null;
    if (GETRATE.equals(qty)) return retValue;                                                                       // :441-443 (BigDecimal.equals — scale-sensitive)
    retValue = retValue.multiply(qty);
    if (retValue.scale() > precision) retValue = retValue.setScale(precision, RM.HALF_UP);
    return retValue;
  };
  // convertProductTo :464-509
  U.convertProductTo = function (ctx, M_Product_ID, C_UOM_To_ID, qtyPrice, precision) {
    if (precision === undefined) precision = -1;
    if (qtyPrice == null || qtyPrice.signum() === 0 || M_Product_ID === 0 || C_UOM_To_ID === 0) return qtyPrice;
    var retValue = U.getProductRateTo(ctx, M_Product_ID, C_UOM_To_ID);
    if (retValue != null) {
      if (Env.ONE.compareTo(retValue) === 0) return qtyPrice;
      if (precision >= 0) return retValue.multiply(qtyPrice).setScale(precision, RM.HALF_UP);
      var uom = MUOM.get(ctx, C_UOM_To_ID);
      if (uom != null) return uom.round(retValue.multiply(qtyPrice), true);
      return retValue.multiply(qtyPrice);
    }
    return null;
  };
  function genericRates(ctx, M_Product_ID, C_UOM_To_ID) {                                                           // the Query fall-back :540-544 / :652-656
    var p = R.PO.get('M_Product', M_Product_ID);
    return DB().query("SELECT * FROM C_UOM_Conversion WHERE C_UOM_ID=? AND C_UOM_TO_ID=? AND M_Product_ID IS NULL AND AD_Client_ID IN (0, ?) AND IsActive='Y' ORDER BY AD_Client_ID Desc",
      [p ? p.getC_UOM_ID() : null, C_UOM_To_ID, Env.getAD_Client_ID(ctx)]).map(conv);
  }
  // getProductRateTo :519-560
  U.getProductRateTo = function (ctx, M_Product_ID, C_UOM_To_ID) {
    if (M_Product_ID === 0) return null;
    var rates = U.getProductConversions(ctx, M_Product_ID), i, rate;
    for (i = 0; i < rates.length; i++) {
      rate = rates[i];
      if (rate.getC_UOM_To_ID() === C_UOM_To_ID) {
        if (rate.getMultiplyRate().compareTo(Env.ONE) >= 0) return rate.getMultiplyRate();
        return U.getOppositeRate(rate.getDivideRate(), 50);
      }
    }
    var conversions = genericRates(ctx, M_Product_ID, C_UOM_To_ID);
    for (i = 0; i < conversions.length; i++) {
      rate = conversions[i];
      if (rate.getC_UOM_To_ID() === C_UOM_To_ID) {
        if (rate.getMultiplyRate().compareTo(Env.ONE) >= 0) return rate.getMultiplyRate();
        return U.getOppositeRate(rate.getDivideRate(), 50);
      }
    }
    return null;
  };
  // convertProductFrom :571-621
  U.convertProductFrom = function (ctx, M_Product_ID, C_UOM_To_ID, qtyPrice, precision) {
    if (precision === undefined) precision = -1;
    if (qtyPrice == null || qtyPrice.compareTo(Env.ZERO) === 0 || C_UOM_To_ID === 0 || M_Product_ID === 0) return qtyPrice;
    var retValue = U.getProductRateFrom(ctx, M_Product_ID, C_UOM_To_ID);
    if (retValue != null) {
      if (Env.ONE.compareTo(retValue) === 0) return qtyPrice;
      if (precision >= 0) return retValue.multiply(qtyPrice).setScale(precision, RM.HALF_UP);
      var uom = MUOM.get(ctx, C_UOM_To_ID);
      if (uom != null) return uom.round(retValue.multiply(qtyPrice), true);
      return retValue.multiply(qtyPrice);
    }
    return null;
  };
  // getProductRateFrom :631-660
  U.getProductRateFrom = function (ctx, M_Product_ID, C_UOM_To_ID) {
    if (M_Product_ID === 0) return null;
    var rates = U.getProductConversions(ctx, M_Product_ID), i;
    for (i = 0; i < rates.length; i++) if (rates[i].getC_UOM_To_ID() === C_UOM_To_ID) return rates[i].getDivideRate();
    var conversions = genericRates(ctx, M_Product_ID, C_UOM_To_ID);
    for (i = 0; i < conversions.length; i++) if (conversions[i].getC_UOM_To_ID() === C_UOM_To_ID) return conversions[i].getDivideRate();
    return null;
  };
  // getProductConversions :669-707 — the product's own UOM 1:1 first, then its active product conversions
  U.getProductConversions = function (ctx, M_Product_ID) {
    if (M_Product_ID === 0) return [];
    var p = R.PO.get('M_Product', M_Product_ID), list = [];
    if (p) list.push(conv({ c_uom_id: p.getC_UOM_ID(), c_uom_to_id: p.getC_UOM_ID(), m_product_id: M_Product_ID, multiplyrate: '1', dividerate: '1' }));   // MUOMConversion(MProduct) :771-782
    DB().query("SELECT * FROM C_UOM_Conversion WHERE M_Product_ID=? AND EXISTS (SELECT 1 FROM M_Product p WHERE C_UOM_Conversion.M_Product_ID=p.M_Product_ID AND C_UOM_Conversion.C_UOM_ID=p.C_UOM_ID) AND IsActive='Y'",
      [M_Product_ID]).forEach(function (r) { list.push(conv(r)); });
    return list;
  };
  // getOppositeRate :903-914
  U.getOppositeRate = function (rate, scale) { return Env.ONE.divide(rate, scale == null ? 12 : scale, RM.HALF_UP); };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

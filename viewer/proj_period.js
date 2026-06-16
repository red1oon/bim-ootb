/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// proj_period.js — BIM → Project FINANCE lane §F8: period control on the accounting date.
//
//   resolvePeriod(db, dateAcct, docBaseType, clientId) — the C_Period covering DateAcct + its
//     C_PeriodControl status for that DocBaseType. open === (PeriodStatus === 'O'). This is iDempiere's
//     real gate: a document can only post into a period whose control is Open for its base type
//     ('C'=closed, 'N'=never opened, 'P'=permanently closed all refuse).
//   conversionRateAsOf(db, fromCur, toCur, dateAcct) — the multiply-rate valid AS OF the accounting date
//     (validfrom ≤ DateAcct ≤ validto), honouring the rate's validity window (not just the latest).
// EXTRACT-only — reads the seed's own c_period / c_periodcontrol / c_conversion_rate; invents nothing.
(function (global) {
  'use strict';
  function _scalar(db, sql, params) { var r = db.exec(sql, params || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }

  function resolvePeriod(db, dateAcct, docBaseType, clientId) {
    var d = String(dateAcct).slice(0, 10);
    // standard period (PeriodType 'S') covering the date, for the client (period dates are stored as 00:00:00).
    var clause = clientId != null ? " AND AD_Client_ID=" + Number(clientId) : "";
    var pr = db.exec("SELECT C_Period_ID,Name,StartDate,EndDate FROM C_Period WHERE PeriodType='S' AND date(StartDate)<=date(?) AND date(EndDate)>=date(?)" + clause + " ORDER BY C_Period_ID LIMIT 1", [d, d]);
    if (!pr.length || !pr[0].values.length) return { ok: false, open: false, status: null, reason: 'no-period', dateAcct: d, docBaseType: docBaseType };
    var p = pr[0].values[0];
    var status = _scalar(db, "SELECT PeriodStatus FROM C_PeriodControl WHERE C_Period_ID=? AND DocBaseType=?", [p[0], docBaseType]);
    return {
      ok: true, periodId: p[0], name: p[1], startDate: p[2], endDate: p[3],
      docBaseType: docBaseType, status: status, open: status === 'O', dateAcct: d
    };
  }

  function conversionRateAsOf(db, fromCur, toCur, dateAcct) {
    if (Number(fromCur) === Number(toCur)) return { ok: true, rate: '1', sameCurrency: true };
    var d = String(dateAcct).slice(0, 10);
    var rate = _scalar(db, "SELECT multiplyrate FROM C_Conversion_Rate WHERE c_currency_id=? AND c_currency_id_to=? AND isactive='Y' AND date(validfrom)<=date(?) AND date(validto)>=date(?) ORDER BY validfrom DESC LIMIT 1", [fromCur, toCur, d, d]);
    return { ok: rate != null, rate: rate != null ? String(rate) : null, dateAcct: d };
  }

  var API = { resolvePeriod: resolvePeriod, conversionRateAsOf: conversionRateAsOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ProjPeriod = API;
})(typeof self !== 'undefined' ? self : this);

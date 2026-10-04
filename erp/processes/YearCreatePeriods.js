// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/YearCreatePeriods.js — org.compiere.process.YearCreatePeriods, verbatim
// (org.adempiere.base.process/src/org/compiere/process/YearCreatePeriods.java) + the model code it calls:
// MYear.createStdPeriods (M/MYear.java:209-285), MPeriod ctor/beforeSave/afterSave (M/MPeriod.java:564-574, 799-873).
// §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.YearCreatePeriods', function (SvrProcess, X) {
    function YearCreatePeriods() { SvrProcess.call(this); this.p_C_Year_ID = 0; this.p_StartDate = null; this.p_DateFormat = null; }
    YearCreatePeriods.prototype = Object.create(SvrProcess.prototype);
    YearCreatePeriods.prototype.prepare = function () {                               // :41-58
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'StartDate') this.p_StartDate = para[i].getParameter();
        else if (name === 'DateFormat') this.p_DateFormat = para[i].getParameter();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA YearCreatePeriods ' + name);
      }
      this.p_C_Year_ID = this.getRecord_ID();
    };
    // MYear.getYearAsInt :121-147 (the Integer.parseInt path; the StringTokenizer fallback takes the first token's digits)
    function yearAsInt(fy) {
      if (/^\s*-?\d+\s*$/.test(fy)) return parseInt(fy, 10);
      var tok = String(fy || '').split(/[\/\-, \t\n\r\f]+/).filter(Boolean)[0];
      if (tok) { if (/^\d+$/.test(tok)) { var y = parseInt(tok, 10); return tok.length === 2 ? 2000 + y : y; } }
      return 0;
    }
    YearCreatePeriods.prototype.doIt = function () {                                  // :66-77
      var A = X.A, R = A.RUNTIME, trx = this.get_TrxName(), S = P.PSTK;
      var year = X.get(trx, 'C_Year', this.p_C_Year_ID);
      if (this.p_C_Year_ID === 0 || year == null || year.get_ID() !== this.p_C_Year_ID)
        throw A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), '@NotFound@: @C_Year_ID@ - ' + this.p_C_Year_ID));
      // MYear.createStdPeriods(null, StartDate, DateFormat) :209-285
      var dateFormat = this.p_DateFormat;
      if (dateFormat == null || dateFormat === '') dateFormat = 'MMM-yy';                // :223
      var yr = yearAsInt(year.getFiscalYear());
      var sd = this.p_StartDate, y, m, d;
      if (sd != null) { var dt = new Date(sd.getTime()); y = dt.getUTCFullYear(); m = dt.getUTCMonth(); d = dt.getUTCDate(); }   // :230-236 start date wins
      else { y = yr; m = 0; d = 1; }                                                    // :237-242
      for (var month = 0; month < 12; month++) {                                        // :250
        var start = new Date(Date.UTC(y, m, d));
        var name = S.formatDate(trx, dateFormat, start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
        var endD = new Date(Date.UTC(y, m + 1, d - 1));                                 // :256-258 +1 month, -1 day
        var startS = ts(start), endS = ts(endD);
        // MPeriod.findByCalendar(ctx, start, calendar, trx) :169 — the period of this calendar that contains the date
        var found = trx.q('SELECT p.c_period_id AS id FROM C_Period p INNER JOIN C_Year y ON (p.C_Year_ID=y.C_Year_ID) WHERE y.C_Calendar_ID=? AND p.IsActive=? AND p.PeriodType=? AND date(?) BETWEEN date(p.StartDate) AND date(p.EndDate) ORDER BY p.C_Period_ID',
          [year.getC_Calendar_ID(), 'Y', 'S', startS])[0];
        if (found == null) {
          // MPeriod(MYear, PeriodNo, name, start, end) :564-574 — new MPeriod(ctx,0,trx) (PeriodType 'S' :541-543) + setClientOrg(year)
          this.savePeriod(X, trx, null, { ad_client_id: year.getAD_Client_ID(), ad_org_id: year.getAD_Org_ID(), periodtype: 'S', c_year_id: year.getC_Year_ID(), periodno: month + 1, name: name, startdate: startS, enddate: endS }, year);
        } else {
          var cur = X.get(trx, 'C_Period', found.id);                                    // :267-272 MPeriod.getCopy + setters
          this.savePeriod(X, trx, cur.row || cur, { c_year_id: year.getC_Year_ID(), periodno: month + 1, name: name, startdate: startS, enddate: endS }, year);
        }
        y = start.getUTCFullYear(); m = start.getUTCMonth();
        var nx = new Date(Date.UTC(y, m + 1, d)); y = nx.getUTCFullYear(); m = nx.getUTCMonth(); d = nx.getUTCDate();   // :280 first day of next month (end+1)
      }
      return '@OK@';                                                                    // :72-73
    };
    function ts(dt) { function p(n) { return n < 10 ? '0' + n : '' + n; } return dt.getUTCFullYear() + '-' + p(dt.getUTCMonth() + 1) + '-' + p(dt.getUTCDate()) + ' 00:00:00'; }
    // MPeriod.saveEx = beforeSave :799-846 → write → afterSave :849-873 (new: one C_PeriodControl per distinct DocBaseType of the client's active doc types)
    YearCreatePeriods.prototype.savePeriod = function (X, trx, row, fields, year) {
      var S = P.PSTK, isNew = row == null;
      var sd = fields.startdate != null ? fields.startdate : row.startdate, ed = fields.enddate != null ? fields.enddate : row.enddate;
      if (sd == null) throw new Error('SaveError C_Period');                              // :803-806
      if (String(ed) < String(sd)) throw new Error('SaveError C_Period: ' + ed + ' < ' + sd);   // :815-820
      var cal = year.getC_Calendar_ID(), pid = isNew ? 0 : row.c_period_id;              // :824-843 overlap with another period of the calendar
      var ov = trx.q('SELECT p.c_period_id AS id, p.name AS name FROM C_Period p WHERE p.C_Year_ID IN (SELECT y.C_Year_ID FROM C_Year y WHERE y.C_Calendar_ID=?) AND (date(?) BETWEEN date(p.StartDate) AND date(p.EndDate) OR date(?) BETWEEN date(p.StartDate) AND date(p.EndDate)) AND p.PeriodType=?',
        [cal, sd, ed, isNew ? fields.periodtype : row.periodtype]).filter(function (r) { return r.id !== pid; });
      if (ov.length) throw new Error('SaveError C_Period: Period overlaps with: ' + ov[0].name);
      var saved = isNew ? S.create(X, trx, 'C_Period', fields) : S.saveEx(X, trx, 'C_Period', row, fields);
      if (isNew) {                                                                       // :849-873
        var types = trx.q('SELECT DISTINCT docbasetype FROM C_DocType WHERE AD_Client_ID=? AND IsActive=?', [year.getAD_Client_ID(), 'Y']);
        types.forEach(function (t) {
          // MPeriodControl(period, DocBaseType) :71-77 + initial defaults PeriodAction 'N' + PeriodStatus NeverOpened 'N' (M/MPeriodControl.java:67-70); setClientOrg(AD_Client_ID, 0)
          S.create(X, trx, 'C_PeriodControl', { ad_client_id: year.getAD_Client_ID(), ad_org_id: 0, c_period_id: saved.c_period_id, docbasetype: t.docbasetype, periodaction: 'N', periodstatus: 'N' });
        });
      }
    };
    return YearCreatePeriods;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

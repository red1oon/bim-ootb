// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/support.js — the model statics the core callouts call, ported verbatim (bim-compiler
// prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE). Fills AdCallout.RUNTIME.M.
// M = org.adempiere.base/src/org/compiere/model. Read-only: no callout support method writes a row.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  var R = A.RUNTIME, M = R.M, BD = R.BD, RM = R.RM, Env = R.Env, Msg = R.Msg, Timestamp = R.Timestamp, TimeUtil = R.TimeUtil;
  function DB() { return R.DB; }
  function PO() { return R.PO; }

  // ── MRefList.getListName (M/MRefList.java) ─────────────────────────────────────────────────────────────
  M.MRefList = {
    getListName: function (ctx, AD_Reference_ID, value) {
      var r = DB().query('SELECT Name AS n FROM AD_Ref_List WHERE AD_Reference_ID=? AND Value=?', [AD_Reference_ID, value])[0];
      return r ? r.n : '';
    }
  };
  // ── MDocType.get (M/MDocType.java) ─────────────────────────────────────────────────────────────────────
  M.MDocType = { get: function (ctx, id) { return PO().get('C_DocType', id); } };

  // ── MPeriod (M/MPeriod.java) — testPeriodOpen :917-955, isOpen :291-322 / :726-790, get :117, findByCalendar :169 ──
  function PeriodClosedException(dateAcct, docBaseType) {      // exceptions/PeriodClosedException.java:29-34
    var dt = dateAcct.toString() + '.0';                        // java.sql.Timestamp.toString
    return R.AdempiereException(Msg.parseTranslation(null, '@PeriodClosed@ @Date@=' + dt + ', @DocBaseType@=' +
      M.MRefList.getListName(null, 183, docBaseType)));         // X_C_DocType.DOCBASETYPE_AD_Reference_ID = 183
  }
  var MPeriod = M.MPeriod = {
    getC_Calendar_ID: function (ctx, AD_Org_ID) {               // :981-997
      var cal = 0;
      if (AD_Org_ID !== 0) { var oi = DB().query('SELECT C_Calendar_ID AS c FROM AD_OrgInfo WHERE AD_Org_ID=?', [AD_Org_ID])[0]; cal = oi && oi.c != null ? Number(oi.c) : 0; }
      if (cal === 0) { var ci = DB().query('SELECT C_Calendar_ID AS c FROM AD_ClientInfo WHERE AD_Client_ID=?', [Env.getAD_Client_ID(ctx)])[0]; cal = ci && ci.c != null ? Number(ci.c) : 0; }
      return cal;
    },
    findByCalendar: function (ctx, DateAcct, C_Calendar_ID) {   // :169-221
      var rows = DB().query("SELECT * FROM C_Period WHERE C_Year_ID IN (SELECT C_Year_ID FROM C_Year WHERE C_Calendar_ID= ?) " +
        "AND date(?) BETWEEN date(StartDate) AND date(EndDate) AND IsActive=? AND PeriodType=?", [C_Calendar_ID, TimeUtil.getDay(DateAcct), 'Y', 'S']);
      var ret = null;
      rows.forEach(function (r) { if (r.periodtype === 'S') ret = PO().wrap('C_Period', r); });
      return ret;
    },
    get: function (ctx, DateAcct, AD_Org_ID) { if (DateAcct == null) return null; return MPeriod.findByCalendar(ctx, DateAcct, MPeriod.getC_Calendar_ID(ctx, AD_Org_ID)); },
    getC_Period_ID: function (ctx, DateAcct, AD_Org_ID) { var p = MPeriod.get(ctx, DateAcct, AD_Org_ID || 0); return p == null ? 0 : p.getC_Period_ID(); },
    isOpenStatic: function (ctx, DateAcct, DocBaseType, AD_Org_ID, forPosting) {   // :291-322
      if (DateAcct == null) return false;
      if (DocBaseType == null) return false;
      var period = MPeriod.get(ctx, DateAcct, AD_Org_ID);
      if (period == null) return false;
      return MPeriod.isOpenPeriod(ctx, period, DocBaseType, DateAcct, !!forPosting);
    },
    isOpenPeriod: function (ctx, period, DocBaseType, dateAcct, forPosting) {       // :726-790
      if (!period.isActive()) return false;
      var as = DB().query('SELECT a.* FROM C_AcctSchema a JOIN AD_ClientInfo ci ON ci.C_AcctSchema1_ID=a.C_AcctSchema_ID WHERE ci.AD_Client_ID=?', [period.getAD_Client_ID()])[0];
      if (as && as.autoperiodcontrol === 'Y') {
        var today = TimeUtil.trunc(new Timestamp(R.now()));
        var first = TimeUtil.addDays(today, -Number(as.period_openhistory || 0));
        var last = TimeUtil.addDays(today, Number(as.period_openfuture || 0));
        var date1, date2;
        if (dateAcct != null) { date1 = TimeUtil.trunc(dateAcct); date2 = date1; }
        else { date1 = period.getStartDate(); date2 = period.getEndDate(); }
        if (date1.before(first)) return false;
        if (date2.after(last)) return false;
        // :766-774 (as.setC_Period_ID + saveEx when today falls in this period) is a WRITE — not done from a callout
        if (MPeriod.isInPeriod(period, today) && Number(as.c_period_id || 0) !== period.getC_Period_ID())
          R.unportedDep('MPeriod.isOpen', 'C_AcctSchema.C_Period_ID update (a write; the callout path never saves)');
        return true;
      }
      if (DocBaseType == null) return false;
      var pc = DB().query('SELECT PeriodStatus AS s FROM C_PeriodControl WHERE C_Period_ID=? AND DocBaseType=?', [period.getC_Period_ID(), DocBaseType])[0];
      if (pc == null) return false;
      return forPosting ? (pc.s === 'O' || pc.s === 'C') : pc.s === 'O';             // MPeriodControl.isOpen :157-164
    },
    isInPeriod: function (period, date) {                       // :675-689
      if (date == null) return false;
      var d = TimeUtil.getDay(date);
      if (d.before(TimeUtil.getDay(period.getStartDate()))) return false;
      if (d.after(TimeUtil.getDay(period.getEndDate()))) return false;
      return true;
    },
    // testPeriodOpen :917-955 — (ctx, date, docBaseType|C_DocType_ID, AD_Org_ID)
    testPeriodOpen: function (ctx, dateAcct, dt, AD_Org_ID) {
      var base = dt;
      if (typeof dt === 'number') { var d = M.MDocType.get(ctx, dt); base = d ? d.getDocBaseType() : null; }
      if (!MPeriod.isOpenStatic(ctx, dateAcct, base, AD_Org_ID || 0)) throw PeriodClosedException(dateAcct, base);
    }
  };
  M.PeriodClosedException = PeriodClosedException;

  // MUOMConversion (incl. getOppositeRate) lives in callouts/uom.js — one implementation.
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

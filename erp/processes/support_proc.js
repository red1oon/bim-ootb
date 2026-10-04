// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/support_proc.js — model statics the core processes share, ported verbatim (bim-compiler
// prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-PROC-ORACLE). Registered on AdProcess.PSUP; resolved at call time.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  var S = P.PSUP = P.PSUP || {};
  function A() { return (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout; }
  function R() { return A().RUNTIME; }
  // MSysConfig.getValue / getBooleanValue / getIntValue (M/MSysConfig.java getValue(Name, default, AD_Client_ID, AD_Org_ID))
  S.sysConfig = function (name, dflt, client, org) {
    try {
      var r = R().DB.query("SELECT Value AS v FROM AD_SysConfig WHERE Name=? AND AD_Client_ID IN (0,?) AND AD_Org_ID IN (0,?) AND IsActive='Y' ORDER BY AD_Client_ID DESC, AD_Org_ID DESC", [name, client || 0, org || 0])[0];
      return r ? r.v : dflt;
    } catch (e) { R().unportedDep('MSysConfig.getValue(' + name + ')', 'AD_SysConfig absent from the bundle — Java default ' + dflt); return dflt; }
  };
  S.sysConfigBool = function (name, dflt, client, org) { var v = S.sysConfig(name, dflt ? 'Y' : 'N', client, org); return v == null ? dflt : 'Y' === String(v); };
  S.sysConfigInt = function (name, dflt, client, org) { var v = S.sysConfig(name, dflt == null ? null : String(dflt), client, org); return v == null ? dflt : parseInt(v, 10); };
  // MPeriod.hasUnpostedDocs (M/MPeriod.java:1024-1072)
  S.hasUnpostedDocs = function (ctx, period, periodControlID) {
    var Env = A().Env, DB = R().DB;
    var cal = DB.getSQLValue(null, 'SELECT C_Calendar_ID FROM C_Year WHERE C_Year_ID=?', period.getC_Year_ID());
    var clientCal = DB.getSQLValue(null, 'SELECT C_Calendar_ID FROM AD_ClientInfo WHERE AD_Client_ID=?', Env.getAD_Client_ID(ctx));
    var sql = "SELECT 1 FROM RV_UnPosted up WHERE up.DocStatus IN('CO', 'CL', 'RE', 'VO') AND up.AD_Client_ID=? AND up.DateAcct BETWEEN ? AND ? " +
      ' AND AD_Org_ID IN (SELECT AD_Org_ID FROM AD_OrgInfo WHERE AD_Client_ID=? AND (C_Calendar_ID=?' + (cal === clientCal ? ' OR C_Calendar_ID IS NULL' : '') + ')) ';
    var args = [Env.getAD_Client_ID(ctx), period.getStartDate(), period.getEndDate(), Env.getAD_Client_ID(ctx), cal];
    if (periodControlID > 0) { sql += ' AND up.DocBaseType = ? '; args.push(R().PO.get('C_PeriodControl', periodControlID).getDocBaseType()); }
    sql += ' LIMIT 1';
    try { return DB.query(sql, args).length > 0; }
    catch (e) { R().unportedDep('MPeriod.hasUnpostedDocs', 'view RV_UnPosted (absent from the bundle) — treated as no unposted docs'); return false; }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

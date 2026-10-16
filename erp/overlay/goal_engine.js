// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// goal_engine.js — PERFORMANCE GOAL ENGINE (bim-compiler prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY D1; Witness: W-GOAL-ENGINE).
// Ports MGoal.updateGoal -> MMeasure.updateCalculatedGoals (MMeasure.java:500-541) / updateRequests (:558-595): the SQL is BUILT FROM THE DICTIONARY ROWS (PA_Goal, PA_Measure, PA_MeasureCalc, R_RequestType)
// exactly as MMeasureCalc.getSqlPI (MMeasureCalc.java:153-189) / MRequestType.getSqlPI (:417-457) + MMeasureCalc.addRestrictions (:400-613) + MRole.addAccessSQL's client/org where (MRole.java:1110-1260) build it,
// then run. No per-goal code: a new PA_MeasureCalc row works with zero host code. The Postgres-isms the dictionary SQL uses (TRUNC(d,fmt), currencyBase, invoiceOpen, the RV_C_Invoice / C_Invoice_v views)
// are provided to SQLite by install(db). PURE apart from install(): evaluate(q, goalId, ctx) with q(sql, params) -> [{lowercase col: value}].
(function (global) {
  'use strict';
  var TRUNC_OF = { '1': 'Y', '3': 'Q', '5': 'MM', '7': 'D', '8': 'DD' };      // MMeasureCalc.getSqlPI: Week -> "D" (the pg trunc() ELSE branch = plain date: a legacy quirk kept)
  var TRUNC_OF_REQ = { '1': 'Y', '3': 'Q', '5': 'MM', '7': 'W', '8': 'DD' };  // MRequestType.getSqlPI: Week -> "W" (also falls to the ELSE branch)
  function day(s) { return String(s == null ? '' : s).slice(0, 10); }
  // pg trunc(timestamp, format) (adempiere.trunc): Q / Y|YEAR / MM|MONTH / DD|DY truncate, anything else is the plain DATE
  function trunc(v, fmt) {
    var d = day(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    var y = d.slice(0, 4), m = Number(d.slice(5, 7)), f = String(fmt || '').toUpperCase();
    if (f === 'Y' || f === 'YEAR') return y + '-01-01';
    if (f === 'Q') return y + '-' + ('0' + (Math.floor((m - 1) / 3) * 3 + 1)).slice(-2) + '-01';
    if (f === 'MM' || f === 'MONTH') return y + '-' + d.slice(5, 7) + '-01';
    return d;                                                                   // DD, DY and the ELSE branch
  }
  var VIEWS = [
    // adempiere.c_invoice_v (pg_get_viewdef): per invoice, or per VALID pay schedule row when IsPayScheduleValid='Y'; credit memo (3rd DocBaseType letter 'C') negates, AP (2nd letter 'P') multiplierAP -1.
    // Columns the dictionary SQL needs are kept; duedate (paymenttermduedate) is NOT ported (§DASH-UNPORTED duedate) - no PA_MeasureCalc row reads it.
    "CREATE TEMP VIEW IF NOT EXISTS c_invoice_v AS " +
    "SELECT i.c_invoice_id, i.ad_client_id, i.ad_org_id, i.isactive, i.issotrx, i.docstatus, i.processed, i.c_doctype_id, i.dateinvoiced, i.dateacct, i.c_bpartner_id, i.c_currency_id, i.c_conversiontype_id, i.ispaid, i.ispayschedulevalid, " +
    "NULL AS c_invoicepayschedule_id, CASE WHEN substr(d.docbasetype,3,1)='C' THEN i.grandtotal*-1 ELSE i.grandtotal END AS grandtotal, CASE WHEN substr(d.docbasetype,3,1)='C' THEN -1.0 ELSE 1.0 END AS multiplier, " +
    "CASE WHEN substr(d.docbasetype,2,1)='P' THEN -1.0 ELSE 1.0 END AS multiplierap, d.docbasetype FROM c_invoice i JOIN c_doctype d ON i.c_doctype_id=d.c_doctype_id WHERE i.ispayschedulevalid <> 'Y' " +
    "UNION SELECT i.c_invoice_id, i.ad_client_id, i.ad_org_id, i.isactive, i.issotrx, i.docstatus, i.processed, i.c_doctype_id, i.dateinvoiced, i.dateacct, i.c_bpartner_id, i.c_currency_id, i.c_conversiontype_id, i.ispaid, i.ispayschedulevalid, " +
    "ips.c_invoicepayschedule_id, CASE WHEN substr(d.docbasetype,3,1)='C' THEN ips.dueamt*-1 ELSE ips.dueamt END, CASE WHEN substr(d.docbasetype,3,1)='C' THEN -1 ELSE 1 END, CASE WHEN substr(d.docbasetype,2,1)='P' THEN -1 ELSE 1 END, d.docbasetype " +
    "FROM c_invoice i JOIN c_doctype d ON i.c_doctype_id=d.c_doctype_id JOIN c_invoicepayschedule ips ON i.c_invoice_id=ips.c_invoice_id WHERE i.ispayschedulevalid='Y' AND ips.isvalid='Y'",
    // adempiere.rv_c_invoice: c_invoice LEFT JOIN doctype (bpartner / location joins are LEFT too, so they never drop an invoice); GrandTotal sign-corrected for credit memos.
    "CREATE TEMP VIEW IF NOT EXISTS rv_c_invoice AS SELECT i.c_invoice_id, i.ad_client_id, i.ad_org_id, i.isactive, i.issotrx, i.docstatus, i.processed, i.c_doctype_id, i.dateinvoiced, i.dateacct, i.c_bpartner_id, i.c_currency_id, " +
    "CASE WHEN substr(d.docbasetype,3,1)='C' THEN i.grandtotal*-1 ELSE i.grandtotal END AS grandtotal, d.docbasetype FROM c_invoice i LEFT JOIN c_doctype d ON i.c_doctype_id=d.c_doctype_id"
  ];
  function mkq(db) { return function (sql, p) { var st = db.prepare(sql), out = []; try { if (p) st.bind(p); while (st.step()) { var o = st.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); out.push(k); } } finally { st.free(); } return out; }; }
  function install(db) {
    var q = mkq(db), AP = (typeof module !== 'undefined' && module.exports) ? require('./invoice_open.js') : global.OverlayInvoiceOpen;
    db.create_function('trunc', function (v, f) { return trunc(v, f); });
    db.create_function('invoiceopen', function (id, ips) {                      // adempiere.invoiceopen(C_Invoice_ID, C_InvoicePaySchedule_ID) over the SHARED transcription in ad_process
      var inv = q('SELECT i.*, d.docbasetype FROM c_invoice i LEFT JOIN c_doctype d ON d.c_doctype_id=i.c_doctype_id WHERE i.c_invoice_id=?', [id])[0];
      return inv ? AP.invoiceOpen(q, inv, ips == null ? 0 : ips) : null; });
    db.create_function('currencybase', function (amt, cur, date, client, org) {  // adempiere.currencybase: into the client's AD_ClientInfo.C_AcctSchema1 currency; same currency -> as is; no rate -> NULL
      var ci = q('SELECT s.c_currency_id AS c FROM ad_clientinfo ci JOIN c_acctschema s ON s.c_acctschema_id=ci.c_acctschema1_id WHERE ci.ad_client_id=?', [client])[0];
      if (!ci) return null; if (Number(cur) === Number(ci.c)) return amt; if (!Number(amt)) return amt;
      var r = AP.conversionRate(q, cur, ci.c, date, client, org); if (r == null) return null;
      var pr = q('SELECT stdprecision AS p FROM c_currency WHERE c_currency_id=?', [ci.c])[0], f = Math.pow(10, pr ? Number(pr.p) : 2);
      return Math.round(Number(amt) * r * f) / f; });
    // TEMP views: they live in the connection's temp schema and are NEVER part of db.export() / the saved database; a view the core itself ships (main schema) is left alone.
    VIEWS.forEach(function (v) { var nm = /VIEW IF NOT EXISTS (\w+)/.exec(v)[1]; if (!has(q, nm, 'main')) db.run(v); });
    return db;
  }
  // MRole client / org where (getClientWhere(false) / getOrgWhere(false)): access = { clientIds:[0,client,...], orgIds:null (all orgs) | [0, org, ...] }
  function accessSql(alias, access) {
    var s = ''; if (!access) return s;
    if (access.clientIds && access.clientIds.length) s += ' AND ' + alias + '.AD_Client_ID IN (' + access.clientIds.join(',') + ')';
    if (access.orgIds) { var o = access.orgIds.filter(function (x, i, a) { return a.indexOf(x) === i; }); s += o.length === 1 ? ' AND ' + alias + '.AD_Org_ID=' + o[0] : ' AND (' + alias + '.AD_Org_ID IN (' + o.join(',') + '))'; }
    return s;
  }
  function aliasOf(sql) { var m = /\bFROM\s+(\w+)(?:\s+(\w+))?/i.exec(sql); return m ? (m[2] && !/^(WHERE|JOIN|LEFT|INNER|ON)$/i.test(m[2]) ? m[2] : m[1]) : null; }
  function has(q, t, schema) { try { return q("SELECT 1 AS x FROM " + (schema === 'main' ? 'sqlite_master' : 'sqlite_master') + " WHERE type IN ('table','view') AND lower(name)=?", [t]).length > 0; } catch (e) { return false; } }
  function restrictionSql(q, goalId, orgColumn) {   // MMeasureCalc.addRestrictions org part (:405-444); every other restriction type is named unported (zero rows on the pilot)
    if (!has(q, 'pa_goalrestriction')) return { sql: '' };
    var rows = q("SELECT goalrestrictiontype AS t, org_id AS o FROM pa_goalrestriction WHERE pa_goal_id=? AND isactive='Y'", [goalId]), orgs = [];
    for (var i = 0; i < rows.length; i++) { if (String(rows[i].t) === 'O') orgs.push(Number(rows[i].o)); else return { unported: 'GoalRestrictionType ' + rows[i].t }; }
    return { sql: orgs.length === 1 ? ' AND ' + orgColumn + '=' + orgs[0] : orgs.length > 1 ? ' AND ' + orgColumn + ' IN (' + orgs.join(',') + ')' : '' };
  }
  function div6(a, b) {                              // MGoal.setGoalPerformance: actual/target at scale 6 HALF_UP; target 0 -> 0
    if (!Number(b)) return '0.000000';
    var r = Number(a) / Number(b), s = Math.round((r + (r < 0 ? -1e-12 : 1e-12)) * 1e6); return (s / 1e6).toFixed(6);
  }
  function evaluate(q, goalId, ctx, over) {
    ctx = ctx || {}; over = over || {};
    var g = q('SELECT * FROM pa_goal WHERE pa_goal_id=?', [goalId])[0];
    if (!g) return { ok: false, reason: 'no PA_Goal ' + goalId };
    var m = q('SELECT * FROM pa_measure WHERE pa_measure_id=?', [g.pa_measure_id])[0];
    if (!m) return { ok: false, reason: 'no PA_Measure ' + g.pa_measure_id };
    var scope = String(over.scope != null ? over.scope : g.measurescope), inTime = String(m.measuredatatype) === 'T' && scope !== '0', today = day(ctx.today), sql, alias;
    if (String(m.measuretype) === 'C') {
      var c = q('SELECT * FROM pa_measurecalc WHERE pa_measurecalc_id=?', [m.pa_measurecalc_id])[0];
      if (!c) return { ok: false, reason: 'Not found PA_MeasureCalc_ID=' + m.pa_measurecalc_id };
      sql = String(c.selectclause) + ' ' + String(c.whereclause);
      if (c.datecolumn && inTime) { var t = TRUNC_OF[scope] || 'DD'; sql += " AND TRUNC(" + c.datecolumn + ",'" + t + "')=TRUNC('" + today + "','" + t + "')"; }
      alias = aliasOf(sql); var rs = restrictionSql(q, goalId, c.orgcolumn || 'AD_Org_ID'); if (rs.unported) return { ok: false, reason: 'INCONCLUSIVE ' + rs.unported + ' not ported' };
      sql += rs.sql + accessSql(alias, ctx.access);
    } else if (String(m.measuretype) === 'Q') {
      if (!Number(m.r_requesttype_id)) return { ok: false, reason: 'PA_Measure ' + m.pa_measure_id + ' has no R_RequestType_ID' };
      sql = "SELECT COUNT(*) FROM R_Request WHERE R_RequestType_ID=" + Number(m.r_requesttype_id) + " AND Processed<>'Y'";
      if (inTime) { var t2 = TRUNC_OF_REQ[scope] || 'DD'; sql += " AND TRUNC(Created,'" + t2 + "')=TRUNC('" + today + "','" + t2 + "')"; }
      var rq = restrictionSql(q, goalId, 'AD_Org_ID'); if (rq.unported) return { ok: false, reason: 'INCONCLUSIVE ' + rq.unported + ' not ported' };
      sql += rq.sql + accessSql('R_Request', ctx.access);
    } else return { ok: false, reason: 'MeasureType ' + m.measuretype + ' not ported (INCONCLUSIVE)' };
    var rows; try { rows = q(sql); } catch (e) { return { ok: false, reason: 'SQL failed: ' + String(e.message).slice(0, 120), sql: sql }; }
    var raw = rows.length ? rows[0][Object.keys(rows[0])[0]] : null, actual = raw == null ? 0 : Math.round(Number(raw) * 1e6) / 1e6;   // MMeasure: SQL may return no rows or null -> ZERO
    var perf = div6(actual, g.measuretarget);
    return { ok: true, goalId: Number(goalId), actual: actual, target: Number(g.measuretarget), performance: perf, percent: Math.trunc(Number(perf) * 100), scope: scope, sql: sql };
  }
  var api = { install: install, evaluate: evaluate, trunc: trunc, accessSql: accessSql, _div6: div6 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.GoalEngine = api;
})(typeof window !== 'undefined' ? window : this);

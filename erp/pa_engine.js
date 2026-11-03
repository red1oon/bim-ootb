// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — pa_engine.js: iDempiere Performance Analysis (PA) on the SQLite twin. Implementing bim-ootb prompts/CAPEX_DASHBOARD.md §5.14 (R2/G1) — Witness: W-PA-ENGINE
//   (erp/tests/witness_pa_engine.js). READ THE LOG (§PA_*); the exit code is not evidence.
// ONE job: the SAME PA rows (PA_MeasureCalc / PA_Measure / PA_Goal / PA_ColorSchema) give the SAME value, performance and colour as legacy — over the local SQLite DB only (no WS, no
//   network). Ported from ~/idempiere-dev-setup/idempiere/org.adempiere.base/src/org/compiere/model/ (file:line on each rule). Nothing dashboard-specific lives here.
// Twinned legacy behaviours (CARDINAL RULE — not "fixed"): a failed / empty measure SQL is 0 (DB.java:1393-1404, MMeasure.java:530-535) — the engine ALSO returns state
//   OK|EMPTY|ERROR so a witness can print INCONCLUSIVE; goals are read through the COMMITTED reader (MGoal.getMeasureGoals :150-163 reads with no trx), so a goal is not computed
//   inside its own create and scores against the previously committed target (§5.4 a/b).
// Ported partially, NAMED (each logs once per call when it applies): role access = client + org (MRole.addAccessSQL :2074-2130, getClientWhere :1110, getOrgWhere :1192) — NOT table
//   access, record access, dependent access, summary-org expansion; goal restrictions (PA_GoalRestriction) and user-role lookup → INCONCLUSIVE; measure types other than C → INCONCLUSIVE.
(function (root) {
  'use strict';
  var BD = (typeof module !== 'undefined' && module.exports) ? require('./bigdecimal.js') : root.BigDecimal;
  var RM = BD.RoundingMode;
  var MEASURETYPE_Calculated = 'C', MEASUREDATATYPE_QtyAmountInTime = 'T', MEASUREDISPLAY_Total = '0';   // X_PA_Measure / X_PA_Goal constants
  var TRUNC = { '1': 'Y', '3': 'Q', '5': 'MM', '7': 'D' };   // MMeasureCalc.getSqlPI :166-174 (Year Y, Quarter Q, Month MM, Week D, else DD)
  var REFRESH = 'ZK_DASHBOARD_PERFORMANCE_REFRESH_INTERVAL', REFRESH_DEFAULT = 1800000;   // MGoal.updateGoal :390-393

  // ── numbers: SQLite hands back JS Numbers; every value crosses into BigDecimal here and stays there ──
  function bd(v) {
    if (v == null || v === '') return null;
    if (v instanceof BD) return v;
    if (typeof v === 'bigint') return BD.of(v);
    if (typeof v === 'number') {
      if (!isFinite(v)) return null;
      if (Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER) return BD.of(v);
      var s = String(v); if (/e/i.test(s)) s = v.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
      return BD.fromString(s);
    }
    return BD.fromString(String(v).trim());
  }
  function first(row) { if (!row) return null; var k = Object.keys(row); return k.length ? row[k[0]] : null; }

  // ── E9 MColorSchema.getColor :231-262 (line for line) ──
  function schemaColorId(cs, percent) {
    var m1 = +cs.mark1percent || 0, m2 = +cs.mark2percent || 0, m3 = +cs.mark3percent || 0, m4 = +cs.mark4percent || 0;
    var c1 = +cs.ad_printcolor1_id || 0, c2 = +cs.ad_printcolor2_id || 0, c3 = +cs.ad_printcolor3_id || 0, c4 = +cs.ad_printcolor4_id || 0, id;
    if (percent <= m1 || m2 === 0) id = c1;
    else if (percent <= m2 || m3 === 0) id = c2;
    else if (percent <= m3 || m4 === 0) id = c3;
    else id = c4;
    if (id === 0) id = c3 !== 0 ? c3 : c2 !== 0 ? c2 : c1;
    return id;   // 0 → Color.black (:255)
  }
  // AD_PrintColor.Code is java.awt.Color's int RGB (MPrintColor.getColor → new Color(int)); white/black are java.awt.Color.white / .black
  function hexOf(code) { var n = (Number(code) >>> 0) & 0xFFFFFF; return '#' + ('000000' + n.toString(16)).slice(-6); }
  var WHITE = { id: 0, name: 'white', hex: '#ffffff' }, BLACK = { id: 0, name: 'black', hex: '#000000' };

  // ── E6 MGoal.setGoalPerformance :428-441 · E7 getPercent :453-457 ──
  function performance(actual, target) {
    actual = bd(actual) || BD.ZERO; target = bd(target) || BD.ZERO;
    return target.signum() !== 0 ? actual.divide(target, 6, RM.HALF_UP) : BD.ZERO;
  }
  function percent(perf) { return Number(bd(perf).multiply(BD.of(100)).setScale(0, RM.DOWN).toString()); }   // BigDecimal.intValue() truncates toward zero

  // ── SQL helpers (depth-0 scan: the main SELECT, not a sub-select — AccessSqlParser.getMainSql) ──
  function depth0(sql) {   // copy of sql with quoted text and parenthesised parts blanked, same length
    var out = '', d = 0, q = false;
    for (var i = 0; i < sql.length; i++) {
      var c = sql[i];
      if (q) { out += ' '; if (c === "'") q = false; continue; }
      if (c === "'") { q = true; out += ' '; continue; }
      if (c === '(') { d++; out += ' '; continue; }
      if (c === ')') { d--; out += ' '; continue; }
      out += d === 0 ? c : ' ';
    }
    return out;
  }
  var NOT_ALIAS = /^(WHERE|INNER|LEFT|RIGHT|FULL|JOIN|CROSS|ON|GROUP|ORDER|HAVING|UNION|LIMIT)$/i;
  function mainTable(sql) {   // first table of the main FROM, its synonym if it has one (MRole.addAccessSQL :2098-2104)
    var m = /\bFROM\s+([A-Za-z_][\w.]*)(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?/i.exec(depth0(sql));
    if (!m) return '';
    return m[2] && !NOT_ALIAS.test(m[2]) ? m[2] : m[1];
  }
  function tsLiteral(d) {   // DB_PostgreSQL.TO_DATE(day, dayOnly=true) :446-462 — converted to SQLite by the to_timestamp port (callouts/sqlfn.js)
    return "TO_TIMESTAMP('" + String(d).slice(0, 10) + "','YYYY-MM-DD')";
  }

  function create(host) {
    // host = { q(sql, params) → rows (the COMMITTED reader), convertSql(sql), ctx: {client, org, role, user}, now() → 'YYYY-MM-DD HH:MM:SS', log(line) }
    var log = host.log || function () {};
    var conv = host.convertSql || function (s) { return s; };
    function q(sql, p) { return host.q(conv(sql), p || []); }

    // ── E2 role access: MRole.addAccessSQL(sql, null, fullyQualified=true, rw=false) — client + org part ──
    function orgAccess(role) {
      var useUser = role.isuseuserorgaccess === 'Y';
      var rows = useUser
        ? q("SELECT AD_Client_ID AS c, AD_Org_ID AS o FROM AD_User_OrgAccess WHERE AD_User_ID=? AND IsActive='Y'", [host.ctx.user])   // MRole.loadOrgAccess :832, :861
        : q("SELECT AD_Client_ID AS c, AD_Org_ID AS o FROM AD_Role_OrgAccess WHERE AD_Role_ID=? AND IsActive='Y'", [role.ad_role_id]);   // :893
      var summ = rows.length ? q('SELECT COUNT(*) AS n FROM AD_Org WHERE IsSummary=\'Y\' AND AD_Org_ID IN (' + rows.map(function (r) { return Number(r.o); }).join(',') + ')') : [{ n: 0 }];
      if (Number(first(summ[0])) > 0) log('§PA_ACCESS_SUMMARY_ORG role=' + role.ad_role_id + ' summaryOrgs=' + first(summ[0]) + ' (MRole.java:933-950 dependents NOT expanded)');
      return rows;
    }
    function inList(col, set) {
      var v = Array.from(set);
      if (v.length === 1) return col + '=' + v[0];
      return col + ' IN (' + v.join(',') + ')';
    }
    function addAccessSQL(sql, role) {
      var ret = sql, orderBy = '', p = sql.lastIndexOf(' ORDER BY ');
      if (p !== -1) { orderBy = sql.slice(p); ret = sql.slice(0, p); }
      ret += /\sWHERE\s/i.test(' ' + depth0(ret) + ' ') ? ' AND ' : ' WHERE ';
      var t = mainTable(ret), allOrgs = role.isaccessallorgs === 'Y', client = Number(role.ad_client_id);
      if (allOrgs) ret += t + '.' + (client === 0 ? 'AD_Client_ID=0' : 'AD_Client_ID IN (0,' + client + ')');   // getClientWhere :1113-1117 (rw=false)
      else {
        var rows = orgAccess(role), cs = new Set(['0']), os = new Set(['0']);
        rows.forEach(function (r) { cs.add(String(Number(r.c))); os.add(String(Number(r.o))); });   // :1121-1127 / :1197-1205 (rw=false adds "0")
        ret += t + '.' + inList('AD_Client_ID', cs) + ' AND ' + inList(t + '.AD_Org_ID', os);
      }
      log('§PA_ACCESS_PARTIAL role=' + role.ad_role_id + ' table=' + t + ' ported=client,org not=table,record,dependent');
      return ret + orderBy;
    }
    function roleFor(goal) {   // E3 MMeasure.updateCalculatedGoals :508-519
      if (Number(goal.ad_role_id) > 0) return { role: q('SELECT * FROM AD_Role WHERE AD_Role_ID=?', [Number(goal.ad_role_id)])[0] || null, how: 'goal' };
      if (Number(goal.ad_user_id) > 0) return { role: null, how: 'user', unported: true };   // MUser.getRoles(org) order not ported → INCONCLUSIVE
      log('§PA_ROLE_FALLBACK goal=' + goal.pa_goal_id + ' role=' + host.ctx.role + ' (MRole.getDefault — "could result in wrong data", MMeasure.java:519)');
      return { role: q('SELECT * FROM AD_Role WHERE AD_Role_ID=?', [host.ctx.role])[0] || null, how: 'default' };
    }

    // ── E1 MMeasureCalc.getSqlPI :153-189 ──
    function sqlPI(mc, measureScope, measureDataType, reportDate, role) {
      var sb = String(mc.selectclause || '') + ' ' + String(mc.whereclause || '');
      if (mc.datecolumn && measureDataType === MEASUREDATATYPE_QtyAmountInTime && measureScope !== MEASUREDISPLAY_Total) {
        var tr = TRUNC[measureScope] || 'DD', d = tsLiteral(reportDate || host.now());
        sb += ' AND TRUNC(' + mc.datecolumn + ",'" + tr + "')=TRUNC(" + d + ",'" + tr + "')";
      }
      var sql = addAccessSQL(sb, role);
      if (sql.indexOf('@') >= 0) {   // Env.parseContext(ctx, 0, sql, false, false): an unparsable variable → "" (the SQL then fails → 0, like legacy)
        var bad = false;
        sql = sql.replace(/@([#$]?\w+)@/g, function (_, n) { var v = (host.ctxVar || function () { return null; })(n); if (v == null) { bad = true; return ''; } return String(v); });
        if (bad) { log('§PA_CTX_UNPARSABLE measurecalc=' + mc.pa_measurecalc_id); sql = ''; }
      }
      return sql;
    }

    // ── E4 DB.getSQLValueBD + MMeasure.java:530-535: first column of first row; error / no row / NULL → 0 ──
    function value(sql) {
      if (!sql) return { actual: BD.ZERO, state: 'ERROR', err: 'empty sql' };
      try {
        var rows = q(sql), v = rows.length ? first(rows[0]) : null;
        if (v == null) return { actual: BD.ZERO, state: 'EMPTY' };
        return { actual: bd(v), state: 'OK' };
      } catch (e) { return { actual: BD.ZERO, state: 'ERROR', err: String(e && e.message || e) }; }
    }

    // calcMeasure(measure row, goal row) → { actual: BigDecimal, state: OK|EMPTY|ERROR|INCONCLUSIVE, sql, why }
    function calcMeasure(measure, goal) {
      if (measure.measuretype !== MEASURETYPE_Calculated) { log('§PA_TYPE_UNSUPPORTED measure=' + measure.pa_measure_id + ' type=' + measure.measuretype); return { actual: null, state: 'INCONCLUSIVE', why: 'type ' + measure.measuretype + ' not ported' }; }
      var nr = Number(first(q('SELECT COUNT(*) AS n FROM PA_GoalRestriction WHERE PA_Goal_ID=? AND IsActive=\'Y\'', [Number(goal.pa_goal_id)])[0]) || 0);
      if (nr) { log('§PA_RESTRICTION_UNSUPPORTED goal=' + goal.pa_goal_id + ' n=' + nr); return { actual: null, state: 'INCONCLUSIVE', why: 'goal restrictions not ported' }; }
      var mc = q('SELECT * FROM PA_MeasureCalc WHERE PA_MeasureCalc_ID=?', [Number(measure.pa_measurecalc_id)])[0];
      if (!mc) { log('§PA_MEASURE_ERROR measure=' + measure.pa_measure_id + ' err=Not found PA_MeasureCalc_ID=' + measure.pa_measurecalc_id); return { actual: null, state: 'ERROR', why: 'no PA_MeasureCalc (legacy: return false, goal not updated, MMeasure.java:521-525)' }; }
      var r = roleFor(goal);
      if (r.unported || !r.role) return { actual: null, state: 'INCONCLUSIVE', why: r.unported ? 'goal role via user roles not ported' : 'role not found' };
      var sql = sqlPI(mc, goal.measurescope, measure.measuredatatype, null, r.role), v = value(sql);
      log('§PA_CALC measure=' + JSON.stringify(measure.name) + ' goal=' + goal.pa_goal_id + ' sql=' + JSON.stringify(sql) + ' actual=' + v.actual + ' state=' + v.state + (v.err ? ' err=' + JSON.stringify(v.err) : ''));
      if (v.state === 'ERROR') log('§PA_MEASURE_ERROR measure=' + measure.pa_measure_id + ' value=0 (legacy: error logged, 0 shown)');
      if (v.state === 'EMPTY') log('§PA_MEASURE_NULL measure=' + measure.pa_measure_id + ' value=0');
      return { actual: v.actual, state: v.state, sql: sql, err: v.err };
    }

    // colorFor(goal) — E8 MGoal.getColor :463-475
    function colorFor(goal) {
      if (!bd(goal.measuretarget) || bd(goal.measuretarget).signum() === 0) return WHITE;
      var cs = q('SELECT * FROM PA_ColorSchema WHERE PA_ColorSchema_ID=?', [Number(goal.pa_colorschema_id)])[0];
      if (!cs) return BLACK;
      var id = schemaColorId(cs, percent(goal.goalperformance == null ? 0 : goal.goalperformance));
      if (!id) return BLACK;
      var pc = q('SELECT AD_PrintColor_ID AS id, Name AS name, Code AS code FROM AD_PrintColor WHERE AD_PrintColor_ID=?', [id])[0];
      return pc ? { id: Number(pc.id), name: pc.name, hex: hexOf(pc.code) } : BLACK;
    }

    // E5 + MMeasure.updateCalculatedGoals :500-541 — every active goal of the measure, read COMMITTED (getMeasureGoals :150-163), written through `write`
    function updateMeasureGoals(measureId, write) {
      var measure = q('SELECT * FROM PA_Measure WHERE PA_Measure_ID=?', [Number(measureId)])[0];
      if (!measure) return [];
      var goals = q("SELECT * FROM PA_Goal WHERE IsActive='Y' AND PA_Measure_ID=? ORDER BY SeqNo", [Number(measureId)]), now = host.now(), out = [];
      goals.forEach(function (g) {
        var c = calcMeasure(measure, g);
        if (c.state === 'INCONCLUSIVE' || c.actual == null) { out.push({ goal: g, calc: c, written: false }); return; }
        var perf = performance(c.actual, g.measuretarget);   // setMeasureActual → setGoalPerformance on the (stale) goal object's own target
        var changes = { measureactual: Number(c.actual.toString()), goalperformance: Number(perf.toString()), datelastrun: now, updated: now, updatedby: host.ctx.user };
        write(g, changes);
        log('§PA_PERF goal=' + JSON.stringify(g.name) + ' actual=' + c.actual + ' target=' + (g.measuretarget == null ? 0 : g.measuretarget) + ' performance=' + perf + ' percent=' + percent(perf));
        out.push({ goal: Object.assign({}, g, changes), calc: c, performance: perf, written: true });
      });
      return out;
    }
    function sysInterval() {
      var r = q("SELECT Value AS v FROM AD_SysConfig WHERE Name=? AND AD_Client_ID IN (0,?) AND IsActive='Y' ORDER BY AD_Client_ID DESC, AD_Org_ID DESC", [REFRESH, host.ctx.client])[0];
      var n = r ? parseInt(r.v, 10) : NaN;
      return isFinite(n) ? n : REFRESH_DEFAULT;   // MSysConfig.getIntValue(name, 1800000, client)
    }
    function ms(ts) { return ts ? Date.parse(String(ts).replace(' ', 'T') + 'Z') : NaN; }
    // updateGoal(goalId, {force}) — MGoal.updateGoal :383-415 (the renderer's call with force=false, WPAWidget.java:54); writes straight to the DB through host.run
    function updateGoal(goalId, opts) {
      opts = opts || {};
      var g = q('SELECT * FROM PA_Goal WHERE PA_Goal_ID=?', [Number(goalId)])[0];
      if (!g) return { updated: false, why: 'no goal' };
      if (host.readOnly) return { updated: false, why: 'read-only session (Env.isReadOnlySession)' };
      var stale = !g.datelastrun || (ms(host.now()) - ms(g.datelastrun)) > sysInterval();
      if (!opts.force && !stale) { log('§PA_NOT_DUE goal=' + goalId + ' datelastrun=' + g.datelastrun + ' interval=' + sysInterval()); return { updated: false, why: 'not due' }; }
      var res = updateMeasureGoals(g.pa_measure_id, function (row, ch) {
        var cols = Object.keys(ch);
        host.run(conv('UPDATE PA_Goal SET ' + cols.map(function (c) { return c + '=?'; }).join(',') + ' WHERE PA_Goal_ID=?'), cols.map(function (c) { return ch[c]; }).concat([Number(row.pa_goal_id)]));
      });
      return { updated: res.some(function (r) { return r.written; }), goals: res };
    }
    return { calcMeasure: calcMeasure, updateGoal: updateGoal, updateMeasureGoals: updateMeasureGoals, colorFor: colorFor, sqlPI: sqlPI, addAccessSQL: addAccessSQL, sysInterval: sysInterval };
  }

  // E10(a) MGoal.afterSave :594-603 — registered as the core model class of PA_Goal (layered registry, owner 'core'). The goals are re-read COMMITTED (trx.q, the host reader) and the
  //   results written into the SAME Trx (legacy: the measure object carries the goal's trxName) — so the §5.4 (a)/(b) behaviours fall out of the port, nothing emulated.
  function install(ML, hostFor) {
    ML.registerModel('pa_goal', {
      afterSave: function (trx, row, isNew, old) {
        var changed = function (c) { return !old || String(old[c]) !== String(row[c]); };
        if (!(isNew || changed('measuretarget') || changed('measurescope'))) return;
        var E = create(hostFor(trx));
        E.updateMeasureGoals(row.pa_measure_id, function (g, ch) { trx.update('pa_goal', g, ch); });
      }
    });
  }

  var api = { create: create, install: install, performance: performance, percent: percent, schemaColorId: schemaColorId, hexOf: hexOf, mainTable: mainTable, bd: bd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PAEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

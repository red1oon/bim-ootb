// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// capex/pa_tiles.js — the dashboard's numbers read from iDempiere Performance Analysis ROWS (spec: prompts/CAPEX_DASHBOARD.md §5.64 / §5.66 PR B). Pure apart from the in-memory page DB; no DOM, no fetch.
// HOW: the source's rows (adapters.js shape, A = the twin store, B = legacy) are loaded into in-memory SQLite "page DBs" holding ONLY the filtered population (§5.66 D2 revised: a filter narrows the rows,
//   never rewrites a formula, as a legacy goal restriction; POP says per slot whether the Status filter applies, as today's page). Each tile slot below names a PA_MeasureCalc by its UU (D4: data, no formula); the kernel's ONE engine (erp/goal_engine.js evaluateCalc,
//   the MMeasureCalc.getSqlPI port incl. Env.parseContext) runs that row there. Money rows carry @$C_Currency_ID@ and are evaluated once per currency present (D3). The page DB's SYSDATE is the page's day.
// NOT moved (named in §5.66): Stage (needs an AD_Chart reader), BIM documents (its measure belongs in the BIM Document plugin's pack), Last updated (a date, not a PA number), the drill rows and the project
//   page (record views). Those come from tiles.js compute(), whose result this module starts from and overrides slot by slot.
// compute(deps, data, f) -> { tiles, drill, pop, formula, caveat, pa: { judged, errors[], slots } }   deps = { SQL (sql.js), GE (GoalEngine), AC (AdCallout, callouts/sqlfn.js loaded), T (CapexTiles), log }
(function (root) {
  'use strict';
  var U = function (s) { return '5a0c3e1e-0b7d-4c1e-9f3a-cafe' + s; };
  var BIND = {   // slot -> PA_MeasureCalc_UU (the row's Name is in the comment; the row itself is the definition)
    total: U('00010001'), closed: U('00010002'), active: U('00010003'), completed_year: U('00010011'), approvals: U('00010012'),   // Total / Closed / Active Projects, Completed this Year (scope Year), Approval Pending
    green: U('00040001'), amber: U('00040002'), red: U('00040003'), none: U('00040004'),                                    // CAPEX Health Green / Amber / Red / No EVM data
    ontime: U('00040005'), delayed: U('00040006'), atrisk: U('00040007'), nosched: U('00040008'), avg_delay: U('00040009'),   // CAPEX Schedule ... / Average Delay (days)
    within: U('00040010'), over: U('00040011'), notstarted: U('00040012'),                                                   // CAPEX Budget Within / Over / Not started
    approved: U('00010070'), actual: U('00010071'), committed: U('00010072'), invoiced: U('00010073'), actual_pct: U('00010074'), overrun: U('00010075'),   // 202611131300_CAPEX-PAGE-MEASURES.sql
    forecast: U('00010076'), basis: U('00010077'), contract: U('00010078'), verified: U('00010079'), physical: U('00010080'), spent: U('00010081'),
    openpo: U('00010082'), openpo_amt: U('00010083'), overcommitted: U('00010084'), nopo: U('00010085'), ready: U('00010086'), closing: U('00010088'),
    handover_done: U('00010002')   // CAPEX Closed Projects over S (Handover › done = the processed projects of the filtered set)
  };
  var SCOPE = { completed_year: '1' };
  // which population a slot reads (data, like the binding): 'P' = the Org / Category / Project filters only; every other slot = 'S', those plus the Status filter. Today's page meaning, kept (§5.66 D2 revised):
  //   the Total / Closed / Active / Closing / Completed-this-year rows state their own status, and Forecast / Over-committed / No-PO read the active projects of P.
  var POP = { total: 'P', closed: 'P', active_p: 'P', closing: 'P', completed_year: 'P', forecast: 'P', basis: 'P', overcommitted: 'P', nopo: 'P' };   // QtyAmountInTime rows judged per year (X_PA_Goal MEASURESCOPE_Year), as the legacy goal of that measure
  var CHILD = { phases: 'C_Project_ID', lines: 'C_Project_ID', orders: 'C_Project_ID', issues: 'C_Project_ID', receipts: 'C_Project_ID', vinvoices: 'C_Project_ID', payments: 'C_Project_ID', bimdocs: 'C_Project_ID' };
  function yes(v) { return v === 'Y' || v === true || v === 1 || v === '1'; }

  // the filtered population (D2): org, category, project (by Value) and status choose the projects; child rows follow their project; reference rows (orgs, C_Phase, currencies, workflow) stay whole
  function population(data, f, noStatus) {
    var st = noStatus ? 'all' : (f.status || 'all');
    return (data.projects || []).filter(function (p) {
      if (f.org && String(p.AD_Org_ID) !== String(f.org)) return false;
      if (f.category && p.ProjectCategory !== f.category) return false;
      if (f.project && p.Value !== f.project) return false;
      var act = yes(p.IsActive) && !yes(p.Processed);
      return st === 'all' ? true : st === 'active' ? act : st === 'closed' ? yes(p.Processed) : st === 'inactive' ? !yes(p.IsActive) : true;
    });
  }
  function pageDb(deps, data, P, today) {
    var A = deps.A, db = new deps.SQL.Database(), ids = {}, phIds = {};
    P.forEach(function (p) { ids[String(p.C_Project_ID)] = 1; });
    A.ENTITIES.forEach(function (e) {
      var spec = A.COLS[e]; if (!spec) return;
      db.run('CREATE TABLE "' + spec.table + '" (' + spec.cols.map(function (c) { return '"' + c + '"'; }).join(',') + ')');
      var rows = e === 'projects' ? P : (data[e] || []);
      if (CHILD[e]) rows = rows.filter(function (r) { return ids[String(r[CHILD[e]])]; });
      if (e === 'phases') rows.forEach(function (r) { phIds[String(r.C_ProjectPhase_ID)] = 1; });
      if (e === 'tasks') rows = rows.filter(function (r) { return phIds[String(r.C_ProjectPhase_ID)]; });
      if (!rows.length) return;
      var st = db.prepare('INSERT INTO "' + spec.table + '" VALUES (' + spec.cols.map(function () { return '?'; }).join(',') + ')');
      rows.forEach(function (r) { st.run(spec.cols.map(function (c) { var v = r[c]; return v === undefined ? null : v; })); }); st.free();
    });
    deps.GE.install(db);
    deps.AC.RUNTIME.registerSqlFunctions(function (n, fn) { db.create_function(n, fn); });
    var now = today + ' 00:00:00'; db.create_function('statement_timestamp', function () { return now; }); db.create_function('getdate', function () { return now; });   // the page DB's session clock = the page's day
    return db;
  }
  function mkq(db) { return function (s, p) { var st = db.prepare(s), o = []; try { if (p) st.bind(p); while (st.step()) { var x = st.getAsObject(), k = {}; Object.keys(x).forEach(function (c) { k[c.toLowerCase()] = x[c]; }); o.push(k); } } finally { st.free(); } return o; }; }

  function compute(deps, data, f) {
    f = f || {}; var log = deps.log || function () {}, base = deps.T.compute(data, f), T = JSON.parse(JSON.stringify(base.tiles)), un = {};
    (data.unavailable || []).forEach(function (u) { un[u] = 1; });
    var pa = { judged: 0, errors: [], slots: {} };
    if (un.pacalc || !(data.pacalc || []).length) { pa.errors.push('no PA_MeasureCalc rows in this source'); log('§PA_TILES_PAGE none (no PA_MeasureCalc rows: ' + (un.pacalc ? 'no read type' : 'empty') + ')'); return { tiles: base.tiles, drill: base.drill, pop: base.pop, formula: base.formula, caveat: base.caveat, pa: pa }; }
    var Pp = population(data, f, true), P = population(data, f), dbP = pageDb(deps, data, Pp, f.today), db = pageDb(deps, data, P, f.today), qP = mkq(dbP), q = mkq(db), byUu = {}, ctx0 = { today: f.today, convertSql: deps.AC.convertSql };
    q('SELECT pa_measurecalc_id AS i, pa_measurecalc_uu AS u, isactive AS a FROM PA_MeasureCalc').forEach(function (r) { if (r.a !== 'N') byUu[String(r.u)] = r.i; });
    var missing = Object.keys(BIND).filter(function (k) { return byUu[BIND[k]] == null; });
    if (missing.length) { pa.errors.push('CAPEX PA rows not installed on this source: ' + missing.join(',')); log('§PA_TILES_PAGE fallback tiles.js (CAPEX PA rows not installed on this source: missing=' + missing.length + ' of ' + Object.keys(BIND).length + ')'); db.close(); dbP.close(); return { tiles: base.tiles, drill: base.drill, pop: base.pop, formula: base.formula, caveat: base.caveat, pa: pa }; }
    function ev(slot, env) {
      var id = byUu[BIND[slot === 'active_p' ? 'active' : slot]]; if (id == null) { pa.errors.push(slot + ': no active PA_MeasureCalc ' + BIND[slot]); return null; }
      var r = deps.GE.evaluateCalc(POP[slot] === 'P' ? qP : q, id, env ? Object.assign({ env: env }, ctx0) : ctx0, SCOPE[slot] || null); pa.judged++;
      pa.slots[slot + (env ? '@' + env.$C_Currency_ID : '')] = r.ok ? r.actual + (r.state === 'EMPTY' ? ' (EMPTY)' : '') : 'ERROR ' + r.reason;
      if (!r.ok) { pa.errors.push(slot + ': ' + r.reason); return null; }
      return r;
    }
    function count(slot) { var r = ev(slot); return r ? r.actual : null; }
    function curs(table, slot) { return (POP[slot] === 'P' ? qP : q)('SELECT DISTINCT C_Currency_ID AS c FROM "' + table + '" WHERE C_Currency_ID IS NOT NULL ORDER BY 1').map(function (r) { return String(r.c); }); }
    function perCur(slot, table, cents) { var m = {}; curs(table, slot).forEach(function (c) { var r = ev(slot, { $C_Currency_ID: c }); if (r && r.state === 'OK') m[c] = cents ? Math.round(r.actual * 100) : r.actual; }); return m; }
    var none = Pp.length === 0, nA = count('active'), nAp = count('active_p');
    T.total_projects = { n: count('total'), closed: count('closed'), vacuous: none };
    T.active_projects = base.tiles.active_projects.closingWhy ? { n: nAp, closing: null, closingWhy: base.tiles.active_projects.closingWhy, vacuous: none } : { n: nAp, closing: count('closing'), vacuous: none };
    T.approved_budget = { cur: perCur('approved', 'C_Project', true) };
    T.actual_cost = { cur: perCur('actual', 'C_Project', true), pctOfPlan: perCur('actual_pct', 'C_Project', false) };
    T.committed_cost = { cur: perCur('committed', 'C_Project', true), invoiced: perCur('invoiced', 'C_Project', true) };
    if (!base.tiles.forecast_cost.inconclusive) T.forecast_cost = { cur: perCur('forecast', 'C_Project', true), basisDiffers: count('basis') };
    T.completed_year = { vacuous: none, n: f.today ? count('completed_year') : null };
    var A0 = !nA;   // the classification tiles judge the active population: empty = vacuous (tiles.js classTile)
    function cls(name, build) { var b = base.tiles[name]; return b.inconclusive ? b : A0 ? { vacuous: true } : build(); }
    T.health = cls('health', function () { return { green: count('green'), amber: count('amber'), red: count('red'), none: count('none'), n: nA }; });
    T.physical_spent = cls('physical_spent', function () { return { physical: perCur('physical', 'C_Project', false), spent: perCur('spent', 'C_Project', false), caveat: base.caveat }; });
    T.schedule = cls('schedule', function () { var r = { ontime: count('ontime'), delayed: count('delayed'), atrisk: count('atrisk'), nosched: count('nosched'), n: nA }, d = ev('avg_delay'); r.avgDelay = d && d.state === 'OK' ? d.actual : null; return r; });
    T.budget_status = cls('budget_status', function () { return { within: count('within'), over: count('over'), notstarted: count('notstarted'), overrun: perCur('overrun', 'C_Project', true) }; });
    if (!base.tiles.approvals.inconclusive) T.approvals = { n: count('approvals') };
    if (!base.tiles.committed_contract.notinstalled) { var cc = perCur('contract', 'C_Order', true); T.committed_contract = { cur: cc }; if (!Object.keys(cc).length) T.committed_contract.vacuous = true; }
    if (!base.tiles.committed_verified.notinstalled) { var cv = perCur('verified', 'C_Project', true); T.committed_verified = { cur: cv }; if (!Object.keys(cv).length) T.committed_verified.vacuous = true; }
    T.procurement.overcommitted = { n: count('overcommitted') };
    if (!base.tiles.procurement.openpo.notinstalled) { T.procurement.openpo = { n: count('openpo'), projects: base.tiles.procurement.openpo.projects, cur: perCur('openpo_amt', 'C_Order', true) }; T.procurement.nopo = { n: count('nopo') }; }
    T.handover = P.length === 0 ? { vacuous: true } : { ready: count('ready'), done: count('handover_done') };
    db.close(); dbP.close();
    log('§PA_TILES_PAGE source=' + (data.source || '?') + ' P=' + Pp.length + ' S=' + P.length + ' active=' + nA + ' judged=' + pa.judged + ' errors=' + pa.errors.length + (pa.errors.length ? ' first=' + JSON.stringify(pa.errors[0]) : ''));
    return { tiles: T, drill: base.drill, pop: { P: Pp.length, S: P.length, A: nA }, formula: base.formula, caveat: base.caveat, pa: pa };
  }
  var API = { compute: compute, population: population, BIND: BIND, SCOPE: SCOPE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CapexPaTiles = API;
})(typeof window !== 'undefined' ? window : this);

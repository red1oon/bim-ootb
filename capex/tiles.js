// capex/tiles.js — THE one place every dashboard formula lives (spec: prompts/CAPEX_DASHBOARD.md §3). Pure: no DOM, no fetch, no clock.
// compute(data, filters) -> { tiles, pop } ; flatten(tiles) -> { tileName: canonical string } ; twin(flatA, flatB, log) -> verdict.
// Money is held as integer minor units (x100) so sums are exact; currencies are never added together (one entry per C_Currency_ID).
(function (root) {
  'use strict';
  var CAVEAT = 'Physical = planned-weighted phase progress. Spent = issued material cost + budget (payment-based financial progress is not in the ERP).';
  // formula footnotes (shown under tiles whose formula the client never stated) — built from iDempiere columns
  var FORMULA = {
    total_projects: 'COUNT(C_Project); closed = Processed=\'Y\'',
    active_projects: 'COUNT(C_Project WHERE IsActive=\'Y\' AND Processed=\'N\'); closing = C_Phase.Name=\'Closed\'',
    approved_budget: 'SUM(C_Project.PlannedAmt) per C_Currency_ID',
    actual_cost: 'SUM(C_Project.ProjectBalanceAmt); % of plan = Actual / SUM(PlannedAmt)',
    committed_cost: 'SUM(C_Project.CommittedAmt); invoiced = SUM(C_Project.InvoicedAmt)',
    forecast_cost: 'PROPOSED (awaiting the client, §6 Q3): per ACTIVE project EAC = Spent + (Budget - Done) / CPI, CPI = Done / Spent; Spent = ProjectBalanceAmt, Budget = PlannedAmt, Done = SUM(C_ProjectPhase.PlannedAmt WHERE IsComplete=\'Y\'); a project with Spent or Done at 0 gives no value; summed per C_Currency_ID',
    completed_year: 'COUNT(C_Project WHERE Processed=\'Y\' AND year(DateFinish)=year(today))',
    health: 'per project: PV=SUM(C_ProjectPhase.PlannedAmt WHERE EndDate<=today), EV=SUM(PlannedAmt WHERE IsComplete=\'Y\'), AC=ProjectBalanceAmt; SPI=EV/PV, CPI=EV/AC (AC>0). No EVM data = PV is 0. Green = every index >=0.9 AND no phase overdue (IsComplete=\'N\' AND EndDate<today; else Amber, §5.44), Red = every index <0.9, Amber = mixed. PROVISIONAL: only 0.9 is the client\'s',
    stage: 'COUNT(C_Project) GROUP BY C_Project.C_Phase_ID -> C_Phase.Name (client stage mapping pending)',
    physical_spent: 'Physical = SUM(phase.PlannedAmt WHERE IsComplete=\'Y\') / SUM(phase.PlannedAmt); Spent = SUM(ProjectBalanceAmt) / SUM(PlannedAmt)',
    schedule: 'per project: No schedule data = no phase with StartDate and EndDate; At Risk = SPI<0.9; Delayed = a phase with IsComplete=\'N\' AND EndDate<today; else On Time. Average Delay = mean of max(today-EndDate) over Delayed + At Risk',
    budget_status: 'per project: Not started = ProjectBalanceAmt NULL/0; Over = ProjectBalanceAmt > COALESCE(PlannedAmt,0); else Within. Overrun = SUM(ProjectBalanceAmt-PlannedAmt) over Over',
    approvals: 'COUNT(AD_WF_Activity WHERE WFState=\'OS\' AND Processed=\'N\')',
    last_updated: 'MAX(C_Project.Updated)',
    committed_contract: 'PROPOSED (§6 Q4): SUM(C_Order.GrandTotal) of completed purchase orders (IsSOTrx=\'N\', DocStatus=\'CO\') on the filtered projects, per currency',
    committed_verified: 'PROPOSED (§6 Q4): SUM(ProjectBalanceAmt) of the filtered projects that have a processed C_ProjectIssue, per currency; overlaps Actual Cost (iDempiere adds an issue\'s cost to it)',
    proc_openpo: 'PROPOSED (§5.51): COUNT and SUM(GrandTotal) per currency of C_Order WHERE IsSOTrx=\'N\' AND DocStatus NOT IN (CO, CL, VO, RE) on the filtered projects',
    proc_overcommitted: 'PROPOSED (§5.51): active projects with CommittedAmt > PlannedAmt (PlannedAmt > 0)',
    proc_nopo: 'PROPOSED (§5.51): active projects with PlannedAmt > 0 and no purchase order (C_Order IsSOTrx=\'N\') at all',
    handover_ready: 'PROPOSED (§5.51): active projects with at least one C_ProjectPhase and every phase IsComplete=\'Y\'',
    handover_done: 'PROPOSED (§5.51): COUNT(C_Project WHERE Processed=\'Y\') on the filtered projects',
    bim_documents: 'issued = COUNT(deliverables whose latest revision has DocStatus=\'CO\'); deliverables = COUNT(DISTINCT C_Project_ID, DeliverableNo) over active BIM_Document rows of the filtered projects; latest = highest Revision'
  };
  var NEEDS = { active_projects_sub: ['phaseRef'], health: ['phases'], forecast_cost: ['phases'], stage: ['phaseRef'], physical_spent: ['phases'], schedule: ['phases'], approvals: ['wf'], bim_documents: ['bimdocs'], committed_contract: ['orders'], committed_verified: ['issues'], proc_openpo: ['orders'], proc_nopo: ['orders'] };

  function process_s2() { return !(typeof process !== 'undefined' && process.env && process.env.HEALTH_BREAK === '1'); }   // witness falsifier only (HEALTH_BREAK=1 restores the pre-§5.44 rule)
  function cents(v) { return v == null || v === '' ? null : Math.round(Number(v) * 100); }
  function day(s) { return s ? String(s).slice(0, 10) : null; }
  function dnum(s) { var d = day(s); return d ? Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000 : null; }
  function yes(v) { return v === 'Y' || v === true || v === 1 || v === '1'; }
  function cur(p) { return p.C_Currency_ID == null ? 'none' : String(p.C_Currency_ID); }

  // per-currency sum of one column; NULLs ignored (SQL SUM); no non-null value at all -> {} (vacuous)
  // SUM then round ONCE (the tile's own formula, and what legacy's PA measure does: SELECT SUM(PlannedAmt) … → one value). Rounding each project to the cent first drifted by up to
  // ½ cent per project: pa_probe legacy=14989562.481 vs tile 14989562.49 (prompts/CAPEX_DASHBOARD.md §5.9). Exact: the value's own decimal digits as a BigInt at 1e-9, half away from zero.
  var SCALE = 9;
  function nano(v) {
    if (v == null || v === '') return null;
    var s = String(v).trim(), neg = s.charAt(0) === '-'; if (neg || s.charAt(0) === '+') s = s.slice(1);
    if (/e/i.test(s)) s = Number(s).toFixed(SCALE);
    var parts = s.split('.'), frac = ((parts[1] || '') + '000000000').slice(0, SCALE);
    if (!/^\d*$/.test(parts[0]) || !/^\d*$/.test(frac)) return null;
    var b = BigInt((parts[0] || '0') + frac); return neg ? -b : b;
  }
  function nanoToCents(b) {
    var unit = BigInt(Math.pow(10, SCALE - 2)), half = unit / BigInt(2), neg = b < BigInt(0), a = neg ? -b : b;
    var c = (a + half) / unit; return Number(neg ? -c : c);
  }
  function sumBy(list, f) {
    var m = {}; list.forEach(function (p) { var n = nano(f(p)); if (n == null) return; var k = cur(p); m[k] = (m[k] || BigInt(0)) + n; });
    Object.keys(m).forEach(function (k) { m[k] = nanoToCents(m[k]); }); return m;
  }
  function ratioBy(numMap, denMap) {
    var r = {}; Object.keys(denMap).forEach(function (k) { if (denMap[k] > 0 && numMap[k] != null) r[k] = numMap[k] / denMap[k]; }); return r;   // numerator never recorded (all NULL) => no data, not 0%
  }

  function compute(data, f) {
    f = f || {}; var today = f.today, tn = dnum(today), un = {};
    (data.unavailable || []).forEach(function (u) { un[u] = 1; });
    function blocked(name) { var n = NEEDS[name] || []; for (var i = 0; i < n.length; i++) if (un[n[i]]) return 'no read type for ' + n[i]; return null; }
    var phName = {}; (data.phaseRef || []).forEach(function (r) { phName[r.C_Phase_ID] = r.Name; });
    var byProj = {}; (data.phases || []).forEach(function (ph) { (byProj[ph.C_Project_ID] = byProj[ph.C_Project_ID] || []).push(ph); });

    var P = data.projects.filter(function (p) {
      return (!f.org || String(p.AD_Org_ID) === String(f.org)) && (!f.category || p.ProjectCategory === f.category) && (!f.project || p.Value === f.project);   // f.project = one project by Value (§15.1)
    });
    var isActive = function (p) { return yes(p.IsActive) && !yes(p.Processed); };
    var S = P.filter(function (p) {
      var st = f.status || 'all';
      return st === 'all' ? true : st === 'active' ? isActive(p) : st === 'closed' ? yes(p.Processed) : st === 'inactive' ? !yes(p.IsActive) : true;
    });
    var A = S.filter(isActive);
    var T = {};

    var none = P.length === 0;      // empty population => 'no data', never a 0 that looks like a result
    T.total_projects = { n: P.length, closed: P.filter(function (p) { return yes(p.Processed); }).length, vacuous: none };
    var act = P.filter(isActive);
    var b = blocked('active_projects_sub');
    T.active_projects = { vacuous: none, n: act.length, closing: b ? null : act.filter(function (p) { return phName[p.C_Phase_ID] === 'Closed'; }).length, closingWhy: b };
    T.approved_budget = { cur: sumBy(S, function (p) { return p.PlannedAmt; }) };
    T.actual_cost = { cur: sumBy(S, function (p) { return p.ProjectBalanceAmt; }) };
    T.actual_cost.pctOfPlan = ratioBy(T.actual_cost.cur, sumBy(S.filter(function (p) { return p.PlannedAmt != null; }), function (p) { return p.PlannedAmt; }));
    T.committed_cost = { cur: sumBy(S, function (p) { return p.CommittedAmt; }), invoiced: sumBy(S, function (p) { return p.InvoicedAmt; }) };
    // §5.38 Q3 (PROPOSED): EAC = Spent + (Budget - Done) / CPI, CPI = Done / Spent, over ACTIVE projects that have Spent > 0 and Done > 0; one SUM per currency, rounded once (the PA measure's own shape)
    var fb = blocked('forecast_cost');
    T.forecast_cost = fb ? { inconclusive: fb } : { cur: {} };
    if (!fb) { var fsum = {}, basis = 0; act.forEach(function (p) {
      var spent = cents(p.ProjectBalanceAmt), bud = cents(p.PlannedAmt) || 0, done = (byProj[p.C_Project_ID] || []).reduce(function (a, ph) { return a + (yes(ph.IsComplete) ? (cents(ph.PlannedAmt) || 0) : 0); }, 0);
      if (!(spent > 0) || !(done > 0)) return; if (done / spent < 0.5 || done / spent > 2) basis++;
      var rs = Number(p.ProjectBalanceAmt), rd = (byProj[p.C_Project_ID] || []).reduce(function (a, ph) { return a + (yes(ph.IsComplete) ? (Number(ph.PlannedAmt) || 0) : 0); }, 0);   // §5.66: the value from the row's own amounts, rounded ONCE after the sum (§5.9); per-project cents drifted 338.27 vs exact 338.275 -> 338.28
      fsum[cur(p)] = (fsum[cur(p)] || 0) + rs + ((Number(p.PlannedAmt) || 0) - rd) * rs / rd; });
      Object.keys(fsum).forEach(function (k) { T.forecast_cost.cur[k] = Math.round(fsum[k] * 100); }); T.forecast_cost.basisDiffers = basis; }   // §5.45: CPI outside 0.5..2 = Spent and Done are not on one basis (proposed bound)
    T.completed_year = { vacuous: none, n: tn == null ? null : P.filter(function (p) { return yes(p.Processed) && p.DateFinish && day(p.DateFinish).slice(0, 4) === today.slice(0, 4); }).length };

    // classification tiles — population A
    function evm(p) {
      var ph = byProj[p.C_Project_ID] || [], bac = 0, pv = 0, ev = 0, dated = 0, overdue = 0;
      ph.forEach(function (x) {
        var a = cents(x.PlannedAmt) || 0; bac += a;
        if (x.EndDate && day(x.EndDate) <= today) pv += a;
        if (yes(x.IsComplete)) ev += a;
        if (x.StartDate && x.EndDate) dated++;
        if (!yes(x.IsComplete) && x.EndDate && day(x.EndDate) < today) overdue = Math.max(overdue, tn - dnum(x.EndDate));
      });
      var ac = cents(p.ProjectBalanceAmt) || 0;
      return { bac: bac, pv: pv, ev: ev, dated: dated, overdue: overdue, ac: ac, spi: pv > 0 ? ev / pv : null, cpi: ac > 0 ? ev / ac : null };
    }
    var E = A.map(function (p) { return { p: p, e: evm(p) }; });
    var BK = { health: {}, schedule: {}, budget: {} };   // §5.49: project id -> bucket, filled by the SAME loops that count the tiles
    function classTile(name, build) { var w = blocked(name); return w ? { inconclusive: w } : (A.length ? build() : { vacuous: true }); }

    T.health = classTile('health', function () {
      var r = { green: 0, amber: 0, red: 0, none: 0 };
      E.forEach(function (x) {
        if (!(x.e.pv > 0)) { r.none++; BK.health[x.p.C_Project_ID] = 'none'; return; }
        var idx = [x.e.spi]; if (x.e.cpi != null) idx.push(x.e.cpi);
        var ok = idx.filter(function (v) { return v >= 0.9; }).length;
        var cls = ok === idx.length ? 'green' : ok === 0 ? 'red' : 'amber';
        if (cls === 'green' && x.e.overdue > 0 && process_s2()) cls = 'amber';   // §5.44: never Green while a phase is overdue
        r[cls]++; BK.health[x.p.C_Project_ID] = cls;
      }); r.n = A.length; return r;
    });
    T.stage = classTile('stage', function () {
      var m = {}; A.forEach(function (p) { var k = p.C_Phase_ID == null ? '(no phase)' : (phName[p.C_Phase_ID] || ('C_Phase#' + p.C_Phase_ID)); m[k] = (m[k] || 0) + 1; });
      return { stages: m, n: A.length };
    });
    T.physical_spent = classTile('physical_spent', function () {
      var bac = {}, ev = {};
      E.forEach(function (x) { var k = cur(x.p); bac[k] = (bac[k] || 0) + x.e.bac; ev[k] = (ev[k] || 0) + (byProj[x.p.C_Project_ID] || []).reduce(function (a, ph) { return a + (yes(ph.IsComplete) ? (cents(ph.PlannedAmt) || 0) : 0); }, 0); });
      return { physical: ratioBy(ev, bac), spent: ratioBy(sumBy(A, function (p) { return p.ProjectBalanceAmt; }), sumBy(A.filter(function (p) { return p.PlannedAmt != null; }), function (p) { return p.PlannedAmt; })), caveat: CAVEAT };
    });
    T.schedule = classTile('schedule', function () {
      var r = { ontime: 0, delayed: 0, atrisk: 0, nosched: 0, delaySum: 0, delayN: 0 };
      E.forEach(function (x) {
        var id = x.p.C_Project_ID;
        if (!x.e.dated) { r.nosched++; BK.schedule[id] = 'nosched'; return; }
        if (x.e.pv > 0 && x.e.spi < 0.9) { r.atrisk++; BK.schedule[id] = 'atrisk'; r.delaySum += x.e.overdue; r.delayN++; }
        else if (x.e.overdue > 0) { r.delayed++; BK.schedule[id] = 'delayed'; r.delaySum += x.e.overdue; r.delayN++; }
        else { r.ontime++; BK.schedule[id] = 'ontime'; }
      });
      r.avgDelay = r.delayN ? r.delaySum / r.delayN : null; r.n = A.length; return r;
    });
    T.budget_status = classTile('budget_status', function () {
      var r = { within: 0, over: 0, notstarted: 0, overrun: {} };
      A.forEach(function (p) {
        var ac = cents(p.ProjectBalanceAmt) || 0, pl = cents(p.PlannedAmt) || 0;
        if (ac === 0) { r.notstarted++; BK.budget[p.C_Project_ID] = 'notstarted'; } else if (ac > pl) { r.over++; BK.budget[p.C_Project_ID] = 'over'; r.overrun[cur(p)] = (r.overrun[cur(p)] || 0) + ((Number(p.ProjectBalanceAmt) || 0) - (Number(p.PlannedAmt) || 0)); } else { r.within++; BK.budget[p.C_Project_ID] = 'within'; }
      }); Object.keys(r.overrun).forEach(function (k) { r.overrun[k] = Math.round(r.overrun[k] * 100); }); r.n = A.length; return r;   // §5.66: summed from the amounts, rounded once (§5.9)
    });
    var w = blocked('approvals');
    T.approvals = w ? { inconclusive: w } : { n: (data.wf || []).filter(function (a) { return a.WFState === 'OS' && !yes(a.Processed); }).length };
    // §5.36B: BIM documents issued for construction / deliverables (the plugin's rule, erp/plugins/bim_document.mjs computeProgress): one deliverable = (project, deliverable no) at its LATEST revision.
    var bd = data.bimdocs;
    if (blocked('bim_documents') || bd == null) T.bim_documents = { notinstalled: true };
    else {
      var ids = {}; S.forEach(function (p) { ids[String(p.C_Project_ID)] = 1; });
      var latest = {};
      bd.forEach(function (r) {
        if (r.IsActive === 'N' || !ids[String(r.C_Project_ID)]) return;
        var k = r.C_Project_ID + '|' + r.DeliverableNo, c = latest[k], rv = Number(r.Revision) || 0, id = Number(r.BIM_Document_ID) || 0;
        if (!c || rv > c.rv || (rv === c.rv && id > c.id)) latest[k] = { rv: rv, id: id, st: r.DocStatus };
      });
      var lk = Object.keys(latest); T.bim_documents = lk.length ? { total: lk.length, issued: lk.filter(function (k) { return latest[k].st === 'CO'; }).length } : { vacuous: true };
    }
    // §5.38 Q4 (PROPOSED), the page side of measures 1000040/1000041: unavailable entity = not installed / no read type, never 0
    var sid = {}; S.forEach(function (p) { sid[String(p.C_Project_ID)] = p; });
    if (blocked('committed_contract') || data.orders == null) T.committed_contract = { notinstalled: true };
    else { var oc = (data.orders || []).filter(function (o) { return o.IsSOTrx === 'N' && o.DocStatus === 'CO' && sid[String(o.C_Project_ID)]; }); T.committed_contract = { cur: sumBy(oc, function (o) { return o.GrandTotal; }), n: oc.length }; if (!oc.length) T.committed_contract.vacuous = true; }
    if (blocked('committed_verified') || data.issues == null) T.committed_verified = { notinstalled: true };
    else { var has = {}; (data.issues || []).forEach(function (i) { if (yes(i.Processed)) has[String(i.C_Project_ID)] = 1; });
      var vp = S.filter(function (p) { return has[String(p.C_Project_ID)]; }); T.committed_verified = { cur: sumBy(vp, function (p) { return p.ProjectBalanceAmt; }), n: vp.length }; if (!vp.length) T.committed_verified.vacuous = true; }
    // §5.51 (PROPOSED): Procurement Risks and Handover, same populations as the tiles above; project lists kept for the drill
    var PRL = { openpo: [], overcommitted: [], nopo: [] }, HOL = { ready: [], done: [] }, procNeeds = blocked('proc_openpo') || data.orders == null;
    T.procurement = { overcommitted: { n: 0 } };
    act.forEach(function (p) { var pl = cents(p.PlannedAmt), cm = cents(p.CommittedAmt); if (pl > 0 && cm != null && cm > pl) PRL.overcommitted.push(p); });
    T.procurement.overcommitted.n = PRL.overcommitted.length;
    if (procNeeds) { T.procurement.openpo = { notinstalled: true }; T.procurement.nopo = { notinstalled: true }; }
    else {
      var OPENX = { CO: 1, CL: 1, VO: 1, RE: 1 }, po = (data.orders || []).filter(function (o) { return o.IsSOTrx === 'N' && sid[String(o.C_Project_ID)]; }), openO = po.filter(function (o) { return !OPENX[o.DocStatus]; });
      if (typeof process !== 'undefined' && process.env && process.env.PH_BREAK === '1') openO = po.filter(function (o) { return !{ CO: 1, CL: 1, RE: 1 }[o.DocStatus]; });   // witness falsifier: a voided PO counted as open
      var withOpen = {}, withAny = {}; openO.forEach(function (o) { withOpen[String(o.C_Project_ID)] = 1; }); po.forEach(function (o) { withAny[String(o.C_Project_ID)] = 1; });
      PRL.openpo = S.filter(function (p) { return withOpen[String(p.C_Project_ID)]; });
      PRL.nopo = act.filter(function (p) { return cents(p.PlannedAmt) > 0 && !withAny[String(p.C_Project_ID)]; });
      T.procurement.openpo = { n: openO.length, projects: PRL.openpo.length, cur: sumBy(openO.map(function (o) { return { C_Currency_ID: o.C_Currency_ID, v: o.GrandTotal }; }), function (x) { return x.v; }) };
      T.procurement.nopo = { n: PRL.nopo.length };
    }
    A.forEach(function (p) { var ph = byProj[p.C_Project_ID] || []; if (ph.length && ph.every(function (x) { return yes(x.IsComplete); })) HOL.ready.push(p); });
    S.forEach(function (p) { if (yes(p.Processed)) HOL.done.push(p); });
    T.handover = S.length === 0 ? { vacuous: true } : { ready: HOL.ready.length, done: HOL.done.length };
    var up = P.map(function (p) { return p.Updated; }).filter(Boolean).sort();
    T.last_updated = up.length ? { v: up[up.length - 1] } : { vacuous: true };
    // §5.49 drill: key -> the project rows behind each number (same populations and same buckets as the tiles above)
    function info(p) { var e = evm(p); return { id: p.C_Project_ID, Value: p.Value, Name: p.Name, cur: cur(p), planned: p.PlannedAmt, spent: p.ProjectBalanceAmt, committed: p.CommittedAmt, due: e.pv / 100, done: e.ev / 100, late: Math.round(e.overdue), health: BK.health[p.C_Project_ID] || null, schedule: BK.schedule[p.C_Project_ID] || null, budget: BK.budget[p.C_Project_ID] || null, stage: phName[p.C_Phase_ID] || null }; }
    var D = {}, put = function (k, p) { (D[k] = D[k] || []).push(info(p)); };
    P.forEach(function (p) { put('total_projects', p); });
    act.forEach(function (p) { put('active_projects', p); });
    S.forEach(function (p) { if (p.PlannedAmt != null) put('approved_budget', p); if (p.ProjectBalanceAmt != null) put('actual_cost', p); if (p.CommittedAmt != null) put('committed_cost', p); });
    P.forEach(function (p) { if (tn != null && yes(p.Processed) && p.DateFinish && day(p.DateFinish).slice(0, 4) === today.slice(0, 4)) put('completed_year', p); });
    if (!fb) act.forEach(function (p) { var sp = cents(p.ProjectBalanceAmt), dn = (byProj[p.C_Project_ID] || []).reduce(function (a, ph) { return a + (yes(ph.IsComplete) ? (cents(ph.PlannedAmt) || 0) : 0); }, 0); if (sp > 0 && dn > 0) put('forecast_cost', p); });
    A.forEach(function (p) {
      ['health', 'schedule', 'budget'].forEach(function (t) { if (BK[t][p.C_Project_ID]) put(t + ':' + BK[t][p.C_Project_ID], p); });
      put('stage:' + (p.C_Phase_ID == null ? '(no phase)' : (phName[p.C_Phase_ID] || ('C_Phase#' + p.C_Phase_ID))), p);
    });
    PRL.openpo.forEach(function (p) { put('proc:openpo', p); }); PRL.overcommitted.forEach(function (p) { put('proc:overcommitted', p); }); PRL.nopo.forEach(function (p) { put('proc:nopo', p); }); HOL.ready.forEach(function (p) { put('handover:ready', p); }); HOL.done.forEach(function (p) { put('handover:done', p); });
    ['proc:openpo', 'proc:overcommitted', 'proc:nopo', 'handover:ready', 'handover:done'].forEach(function (k) { if (!D[k]) D[k] = []; });
    Object.keys(BK).forEach(function (t) { var names = { health: ['green', 'amber', 'red', 'none'], schedule: ['ontime', 'delayed', 'atrisk', 'nosched'], budget: ['within', 'over', 'notstarted'] }[t]; names.forEach(function (b) { if (!D[t + ':' + b]) D[t + ':' + b] = []; }); });
    return { tiles: T, drill: D, pop: { P: P.length, S: S.length, A: A.length }, formula: FORMULA, caveat: CAVEAT };
  }

  // canonical strings (what the twin compares and the DOM exposes as data-value)
  function m2s(m) { var k = Object.keys(m).sort(); return k.length ? k.map(function (c) { return c + ':' + (m[c] / 100).toFixed(2); }).join(',') : 'no data'; }
  function r2s(m) { var k = Object.keys(m).sort(); return k.length ? k.map(function (c) { return c + ':' + m[c].toFixed(4); }).join(',') : 'no data'; }
  function flatten(T) {
    var o = {}, t;
    function st(x, f) { return x.inconclusive ? 'INCONCLUSIVE' : x.vacuous ? 'no data' : x.pending ? 'PENDING' : f(x); }
    t = T.total_projects; o.total_projects = t.vacuous ? 'no data' : t.n; o.total_projects_closed = t.vacuous ? 'no data' : t.closed;
    t = T.active_projects; o.active_projects = t.vacuous ? 'no data' : t.n; o.active_projects_closing = t.vacuous ? 'no data' : t.closing == null ? 'INCONCLUSIVE' : t.closing;
    o.approved_budget = m2s(T.approved_budget.cur);
    o.actual_cost = m2s(T.actual_cost.cur); o.actual_cost_pct_of_plan = r2s(T.actual_cost.pctOfPlan);
    o.committed_cost = m2s(T.committed_cost.cur); o.committed_invoiced = m2s(T.committed_cost.invoiced);
    o.forecast_cost = T.forecast_cost.inconclusive ? 'INCONCLUSIVE' : m2s(T.forecast_cost.cur);
    o.completed_year = T.completed_year.vacuous || T.completed_year.n == null ? 'no data' : T.completed_year.n;
    o.health = st(T.health, function (x) { return 'green=' + x.green + ' amber=' + x.amber + ' red=' + x.red + ' none=' + x.none; });
    o.stage = st(T.stage, function (x) { return Object.keys(x.stages).sort().map(function (k) { return k + '=' + x.stages[k]; }).join(';'); });
    o.physical = st(T.physical_spent, function (x) { return r2s(x.physical); });
    o.spent = st(T.physical_spent, function (x) { return r2s(x.spent); });
    o.schedule = st(T.schedule, function (x) { return 'ontime=' + x.ontime + ' delayed=' + x.delayed + ' atrisk=' + x.atrisk + ' nosched=' + x.nosched; });
    o.avg_delay = st(T.schedule, function (x) { return x.avgDelay == null ? 'no data' : x.avgDelay.toFixed(2); });
    o.budget_status = st(T.budget_status, function (x) { return 'within=' + x.within + ' over=' + x.over + ' notstarted=' + x.notstarted; });
    o.actual_overrun = st(T.budget_status, function (x) { return m2s(x.overrun); });
    o.approvals = st(T.approvals, function (x) { return x.n; });
    t = T.committed_contract; o.committed_contract = t.notinstalled ? 'no data (not installed)' : t.vacuous ? 'no data' : m2s(t.cur);
    t = T.committed_verified; o.committed_verified = t.notinstalled ? 'no data (not installed)' : t.vacuous ? 'no data' : m2s(t.cur);
    t = T.bim_documents; o.bim_documents = t.notinstalled ? 'no data (not installed)' : t.vacuous ? 'no data' : t.issued + '/' + t.total;
    t = T.procurement; o.proc_openpo = t.openpo.notinstalled ? 'no data (not installed)' : t.openpo.n + ' / ' + m2s(t.openpo.cur); o.proc_overcommitted = t.overcommitted.n; o.proc_nopo = t.nopo.notinstalled ? 'no data (not installed)' : t.nopo.n;
    t = T.handover; o.handover_ready = t.vacuous ? 'no data' : t.ready; o.handover_done = t.vacuous ? 'no data' : t.done;
    o.last_updated = T.last_updated.vacuous ? 'no data' : T.last_updated.v;
    Object.keys(o).forEach(function (k) { o[k] = String(o[k]); });
    return o;
  }

  // PER_SOURCE (prompts/CAPEX_DASHBOARD.md §12.6, owner 2026-11-02): a tile whose value is by definition the source's own write clock (MAX(Updated)) — printed, never MATCH/DIFF.
  var PER_SOURCE = ['last_updated'];
  function twin(a, b, log) {
    log = log || function () {}; var match = 0, diff = 0, inc = 0, per = 0;
    Object.keys(a).forEach(function (k) {
      var va = a[k], vb = b[k], v;
      if (PER_SOURCE.indexOf(k) >= 0) v = 'PER_SOURCE';
      else if (va === 'INCONCLUSIVE' || vb === 'INCONCLUSIVE' || vb === undefined || va === 'no data (not installed)' || vb === 'no data (not installed)' || (va === 'PENDING' && vb === 'PENDING')) v = 'INCONCLUSIVE';   // pending/unreadable: nothing was judged
      else if (va === 'no data' && vb === 'no data') v = 'INCONCLUSIVE';          // both empty: nothing was judged
      else v = va === vb ? 'MATCH' : 'DIFF';
      if (v === 'MATCH') match++; else if (v === 'DIFF') diff++; else if (v === 'PER_SOURCE') per++; else inc++;
      log('§DASH_TWIN tile=' + k + ' sqlite=' + va + ' legacy=' + vb + ' ' + v);
    });
    var verdict = diff ? 'FAIL' : match ? 'PASS' : 'INCONCLUSIVE';
    log('§DASH_TWIN_VERDICT ' + verdict + ' match=' + match + ' diff=' + diff + ' inconclusive=' + inc + ' per_source=' + per);
    return { verdict: verdict, match: match, diff: diff, inconclusive: inc, per_source: per };
  }

  // §5.54 the project page: everything one project's tabs draw, from the same rows and buckets as compute(). Pure: no DOM, no fetch, no clock (today comes in f.today).
  function projectDetail(data, f, id) {
    var p = (data.projects || []).filter(function (x) { return String(x.C_Project_ID) === String(id); })[0]; if (!p) return null;
    f = f || {}; var today = f.today, tn = dnum(today), un = {}; (data.unavailable || []).forEach(function (u) { un[u] = 1; });
    var R = compute(data, { today: today, status: 'all', org: '', category: '', project: p.Value }), row = ((R.drill || {}).total_projects || [])[0] || {};
    var phases = (data.phases || []).filter(function (x) { return String(x.C_Project_ID) === String(id); }).sort(function (a, b) { return (a.SeqNo || 0) - (b.SeqNo || 0) || String(a.C_ProjectPhase_ID) - String(b.C_ProjectPhase_ID); });
    var tasksBy = {}, taskRowsBy = {}; (data.tasks || []).forEach(function (k) { tasksBy[k.C_ProjectPhase_ID] = (tasksBy[k.C_ProjectPhase_ID] || 0) + 1;
      (taskRowsBy[k.C_ProjectPhase_ID] = taskRowsBy[k.C_ProjectPhase_ID] || []).push({ id: k.C_ProjectTask_ID, name: k.Name, planned: Number(k.PlannedAmt) || 0, start: k.BIM_StartDate ? day(k.BIM_StartDate) : null, end: k.BIM_EndDate ? day(k.BIM_EndDate) : null }); });
    var out = { id: p.C_Project_ID, Value: p.Value, Name: p.Name, cur: p.C_Currency_ID == null ? 'none' : String(p.C_Currency_ID), health: row.health || null, schedule: row.schedule || null, budget: row.budget || null, late: row.late || 0, phases: [], why: [] };
    var due = 0, done = 0, pl = 0, cm = 0;
    phases.forEach(function (x) {
      var complete = yes(x.IsComplete), end = x.EndDate ? day(x.EndDate) : null, start = x.StartDate ? day(x.StartDate) : null, late = 0, st;
      if (complete) st = 'complete'; else if (end && end < today) { st = 'overdue'; late = Math.round(tn - dnum(end)); } else if (start && end && start <= today && today <= end) st = 'inprogress'; else st = 'tocome';
      var a = Number(x.PlannedAmt) || 0, c = Number(x.CommittedAmt) || 0; pl += a; cm += c; if (end && end <= today) due += a; if (complete) done += a;
      out.phases.push({ id: x.C_ProjectPhase_ID, name: x.Name, seq: x.SeqNo, start: start, end: end, planned: a, committed: c, status: st, lateDays: late, tasks: tasksBy[x.C_ProjectPhase_ID] || 0, taskRows: (taskRowsBy[x.C_ProjectPhase_ID] || []).slice().sort(function (a, b) { return (a.start || '9') < (b.start || '9') ? -1 : (a.start || '9') > (b.start || '9') ? 1 : String(a.name) < String(b.name) ? -1 : 1; }), early: complete && end && end > today });
    });
    var ln = (data.lines || []).filter(function (l) { return String(l.C_Project_ID) === String(id); });
    var sumL = function (k) { return ln.reduce(function (a, l) { return a + (Number(l[k]) || 0); }, 0); };
    out.money = { planned: p.PlannedAmt == null ? null : Number(p.PlannedAmt), spent: p.ProjectBalanceAmt == null ? null : Number(p.ProjectBalanceAmt), due: due, done: done, committed: p.CommittedAmt == null ? null : Number(p.CommittedAmt), invoiced: p.InvoicedAmt == null ? null : Number(p.InvoicedAmt), lineCommitted: sumL('CommittedAmt'), lineInvoiced: sumL('InvoicedAmt'), lines: ln.length };
    out.totals = { phasePlanned: pl, phaseCommitted: cm };
    var cpi = out.money.spent > 0 && done > 0 ? done / out.money.spent : null; out.forecast = { basisDiffers: cpi != null && (cpi < 0.5 || cpi > 2) };
    out.orders = (un.orders || data.orders == null) ? null : { rows: (data.orders || []).filter(function (o) { return String(o.C_Project_ID) === String(id) && o.IsSOTrx === 'N'; }).map(function (o) { return { id: o.C_Order_ID, status: o.DocStatus, total: Number(o.GrandTotal), cur: o.C_Currency_ID, open: !{ CO: 1, CL: 1, VO: 1, RE: 1 }[o.DocStatus] }; }) };
    if (out.orders) out.orders.open = out.orders.rows.filter(function (r) { return r.open; }).length;
    // §5.59 the supply chain after the PO, a DRILL (never a tile): per purchase order its receipts, vendor invoices and payments; null when the server lacks any of the three entities
    out.chain = null;
    if (!(un.receipts || un.vinvoices || un.payments) && data.receipts != null && data.vinvoices != null && data.payments != null && out.orders) {
      var dn2 = function (st) { return st === 'CO' || st === 'CL'; }, mine = function (a) { return (a || []).filter(function (x) { return String(x.C_Project_ID) === String(id); }); };
      var rc = mine(data.receipts).filter(function (x) { return x.IsSOTrx === 'N' && dn2(x.DocStatus); }), iv = mine(data.vinvoices).filter(function (x) { return x.IsSOTrx === 'N' && dn2(x.DocStatus); }), py = mine(data.payments).filter(function (x) { return x.IsReceipt === 'N' && dn2(x.DocStatus); });
      var poRows = (data.orders || []).filter(function (o) { return String(o.C_Project_ID) === String(id) && o.IsSOTrx === 'N'; }), poSet = {}, invSet = {};
      var rows = poRows.map(function (o) {
        poSet[o.C_Order_ID] = 1; var mi = iv.filter(function (x) { return String(x.C_Order_ID) === String(o.C_Order_ID); }), si = mi.filter(function (x) { return String(x.C_Currency_ID) === String(o.C_Currency_ID); }), ids = {};
        mi.forEach(function (x) { ids[x.C_Invoice_ID] = 1; invSet[x.C_Invoice_ID] = 1; });
        var mp = py.filter(function (x) { return String(x.C_Order_ID) === String(o.C_Order_ID) || (x.C_Invoice_ID != null && ids[x.C_Invoice_ID]); }), sp = mp.filter(function (x) { return String(x.C_Currency_ID) === String(o.C_Currency_ID); }), mr = rc.filter(function (x) { return String(x.C_Order_ID) === String(o.C_Order_ID); });
        var invoiced = si.reduce(function (a, x) { return a + (Number(x.GrandTotal) || 0); }, 0), paid = sp.reduce(function (a, x) { return a + (Number(x.PayAmt) || 0); }, 0), stage = !dn2(o.DocStatus) ? 'unfinished' : invoiced > 0 ? (paid >= invoiced ? 'paid' : 'invoiced') : mr.length ? 'received' : 'ordered';
        return { order: o.C_Order_ID, status: o.DocStatus, total: Number(o.GrandTotal), cur: o.C_Currency_ID, received: mr.length, invoiced: invoiced, paid: paid, stage: stage, otherCur: (mi.length - si.length) + (mp.length - sp.length),
          docs: { receipts: mr.map(function (x) { return x.M_InOut_ID; }), invoices: mi.map(function (x) { return x.C_Invoice_ID; }), payments: mp.map(function (x) { return x.C_Payment_ID; }) } };
      });
      var strip = { ordered: 0, received: 0, invoiced: 0, paid: 0 }; rows.forEach(function (r) { if (strip[r.stage] != null) strip[r.stage]++; });
      out.chain = { rows: rows, strip: strip, unlinked: { receipts: rc.filter(function (x) { return !poSet[x.C_Order_ID]; }).length, invoices: iv.filter(function (x) { return !poSet[x.C_Order_ID]; }).length,
        payments: py.filter(function (x) { return !poSet[x.C_Order_ID] && !(x.C_Invoice_ID != null && invSet[x.C_Invoice_ID]); }).length } };
    }
    if (un.bimdocs || data.bimdocs == null) out.docs = null;
    else { var latest = {}; (data.bimdocs || []).forEach(function (r) { if (r.IsActive === 'N' || String(r.C_Project_ID) !== String(id)) return; var k = r.DeliverableNo, rv = Number(r.Revision) || 0, i = Number(r.BIM_Document_ID) || 0, c = latest[k]; if (!c || rv > c.rev || (rv === c.rev && i > c.i)) latest[k] = { no: k, rev: rv, i: i, status: r.DocStatus, name: r.Name }; });
      var lr = Object.keys(latest).sort().map(function (k) { return latest[k]; }); out.docs = { rows: lr, total: lr.length, issued: lr.filter(function (r) { return r.status === 'CO'; }).length }; }
    // plain-words statements, each naming the rows it came from (never typed text about a number the rows do not hold)
    out.phases.forEach(function (x) {
      if (x.status === 'overdue') out.why.push({ kind: 'overdue', src: { phase: x.name }, text: x.name + ' is overdue: it ended ' + x.end + ' and is not ticked complete' });
      if (x.early) out.why.push({ kind: 'early', src: { phase: x.name }, text: x.name + ' is ticked complete before its end date (' + x.end + ')' });
    });
    if (out.budget === 'within' && out.money.planned > 0) out.why.push({ kind: 'budget', src: { budget: 'within' }, text: 'Budget is within plan: ' + (100 * (out.money.spent || 0) / out.money.planned).toFixed(2) + '% spent' });
    else if (out.budget === 'over') out.why.push({ kind: 'budget', src: { budget: 'over' }, text: 'Spent is above plan' });
    else if (out.budget === 'notstarted') out.why.push({ kind: 'budget', src: { budget: 'notstarted' }, text: 'No cost has been booked yet' });
    if (out.forecast.basisDiffers) out.why.push({ kind: 'basis', src: { cpi: cpi }, text: 'Spent and Done are not measured on one basis, so the forecast is an alarm, not a result' });
    return out;
  }

  var API = { projectDetail: projectDetail, _sumBy: sumBy, compute: compute, flatten: flatten, twin: twin, PER_SOURCE: PER_SOURCE, FORMULA: FORMULA, CAVEAT: CAVEAT };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CapexTiles = API;
})(typeof window !== 'undefined' ? window : this);

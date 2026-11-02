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
    forecast_cost: 'definition pending (client)',
    completed_year: 'COUNT(C_Project WHERE Processed=\'Y\' AND year(DateFinish)=year(today))',
    health: 'per project: PV=SUM(C_ProjectPhase.PlannedAmt WHERE EndDate<=today), EV=SUM(PlannedAmt WHERE IsComplete=\'Y\'), AC=ProjectBalanceAmt; SPI=EV/PV, CPI=EV/AC (AC>0). No EVM data = PV is 0. Green = every index >=0.9, Red = every index <0.9, Amber = mixed. PROVISIONAL: only 0.9 is the client\'s',
    stage: 'COUNT(C_Project) GROUP BY C_Project.C_Phase_ID -> C_Phase.Name (client stage mapping pending)',
    physical_spent: 'Physical = SUM(phase.PlannedAmt WHERE IsComplete=\'Y\') / SUM(phase.PlannedAmt); Spent = SUM(ProjectBalanceAmt) / SUM(PlannedAmt)',
    schedule: 'per project: No schedule data = no phase with StartDate and EndDate; At Risk = SPI<0.9; Delayed = a phase with IsComplete=\'N\' AND EndDate<today; else On Time. Average Delay = mean of max(today-EndDate) over Delayed + At Risk',
    budget_status: 'per project: Not started = ProjectBalanceAmt NULL/0; Over = ProjectBalanceAmt > COALESCE(PlannedAmt,0); else Within. Overrun = SUM(ProjectBalanceAmt-PlannedAmt) over Over',
    approvals: 'COUNT(AD_WF_Activity WHERE WFState=\'OS\' AND Processed=\'N\')',
    last_updated: 'MAX(C_Project.Updated)'
  };
  var NEEDS = { active_projects_sub: ['phaseRef'], health: ['phases'], stage: ['phaseRef'], physical_spent: ['phases'], schedule: ['phases'], approvals: ['wf'] };

  function cents(v) { return v == null || v === '' ? null : Math.round(Number(v) * 100); }
  function day(s) { return s ? String(s).slice(0, 10) : null; }
  function dnum(s) { var d = day(s); return d ? Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000 : null; }
  function yes(v) { return v === 'Y' || v === true || v === 1 || v === '1'; }
  function cur(p) { return p.C_Currency_ID == null ? 'none' : String(p.C_Currency_ID); }

  // per-currency sum of one column; NULLs ignored (SQL SUM); no non-null value at all -> {} (vacuous)
  function sumBy(list, f) {
    var m = {}; list.forEach(function (p) { var c = cents(f(p)); if (c == null) return; m[cur(p)] = (m[cur(p)] || 0) + c; }); return m;
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
    T.forecast_cost = { pending: true };
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
    function classTile(name, build) { var w = blocked(name); return w ? { inconclusive: w } : (A.length ? build() : { vacuous: true }); }

    T.health = classTile('health', function () {
      var r = { green: 0, amber: 0, red: 0, none: 0 };
      E.forEach(function (x) {
        if (!(x.e.pv > 0)) { r.none++; return; }
        var idx = [x.e.spi]; if (x.e.cpi != null) idx.push(x.e.cpi);
        var ok = idx.filter(function (v) { return v >= 0.9; }).length;
        r[ok === idx.length ? 'green' : ok === 0 ? 'red' : 'amber']++;
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
        if (!x.e.dated) { r.nosched++; return; }
        if (x.e.pv > 0 && x.e.spi < 0.9) { r.atrisk++; r.delaySum += x.e.overdue; r.delayN++; }
        else if (x.e.overdue > 0) { r.delayed++; r.delaySum += x.e.overdue; r.delayN++; }
        else r.ontime++;
      });
      r.avgDelay = r.delayN ? r.delaySum / r.delayN : null; r.n = A.length; return r;
    });
    T.budget_status = classTile('budget_status', function () {
      var r = { within: 0, over: 0, notstarted: 0, overrun: {} };
      A.forEach(function (p) {
        var ac = cents(p.ProjectBalanceAmt) || 0, pl = cents(p.PlannedAmt) || 0;
        if (ac === 0) r.notstarted++; else if (ac > pl) { r.over++; r.overrun[cur(p)] = (r.overrun[cur(p)] || 0) + (ac - pl); } else r.within++;
      }); r.n = A.length; return r;
    });
    var w = blocked('approvals');
    T.approvals = w ? { inconclusive: w } : { n: (data.wf || []).filter(function (a) { return a.WFState === 'OS' && !yes(a.Processed); }).length };
    var up = P.map(function (p) { return p.Updated; }).filter(Boolean).sort();
    T.last_updated = up.length ? { v: up[up.length - 1] } : { vacuous: true };
    return { tiles: T, pop: { P: P.length, S: S.length, A: A.length }, formula: FORMULA, caveat: CAVEAT };
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
    o.forecast_cost = 'PENDING';
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
      else if (va === 'INCONCLUSIVE' || vb === 'INCONCLUSIVE' || vb === undefined || (va === 'PENDING' && vb === 'PENDING')) v = 'INCONCLUSIVE';   // pending/unreadable: nothing was judged
      else if (va === 'no data' && vb === 'no data') v = 'INCONCLUSIVE';          // both empty: nothing was judged
      else v = va === vb ? 'MATCH' : 'DIFF';
      if (v === 'MATCH') match++; else if (v === 'DIFF') diff++; else if (v === 'PER_SOURCE') per++; else inc++;
      log('§DASH_TWIN tile=' + k + ' sqlite=' + va + ' legacy=' + vb + ' ' + v);
    });
    var verdict = diff ? 'FAIL' : match ? 'PASS' : 'INCONCLUSIVE';
    log('§DASH_TWIN_VERDICT ' + verdict + ' match=' + match + ' diff=' + diff + ' inconclusive=' + inc + ' per_source=' + per);
    return { verdict: verdict, match: match, diff: diff, inconclusive: inc, per_source: per };
  }
  var API = { compute: compute, flatten: flatten, twin: twin, PER_SOURCE: PER_SOURCE, FORMULA: FORMULA, CAVEAT: CAVEAT };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CapexTiles = API;
})(typeof window !== 'undefined' ? window : this);

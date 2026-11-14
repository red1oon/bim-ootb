// capex/tiles.js — what the dashboard needs that is NOT a PA row (spec: prompts/CAPEX_DASHBOARD.md §3, §5.75): populations, availability, the three not-moved tiles, the drill's row view,
//   the canonical strings (flatten), the twin comparison and the project page. The formulas of every moved tile are PA_MeasureCalc rows (capex/pa_tiles.js). Pure: no DOM, no fetch, no clock.
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

  // ── §5.75 step 4: the moved formulas are GONE from this file. Every count, sum, ratio and bucket is a PA_MeasureCalc row, run by capex/pa_tiles.js through the kernel's goal_engine.
  //   What is left here is not a formula of a tile that has a row: the populations, which entity a tile needs, the three tiles that are not moved (Stage, BIM documents, Last updated: §5.66),
  //   and the drill's row VIEW. frame() is what pa_tiles.compute() starts from; compute() is the page when a source has NO CAPEX PA rows: every moved tile says so, never a number.
  var NOPA = 'CAPEX PA rows not installed';
  function frame(data, f) {
    f = f || {}; var today = f.today, tn = dnum(today), un = {};
    (data.unavailable || []).forEach(function (u) { un[u] = 1; });
    function blocked(name) { var n = NEEDS[name] || []; for (var i = 0; i < n.length; i++) if (un[n[i]]) return 'no read type for ' + n[i]; return null; }
    var phName = {}; (data.phaseRef || []).forEach(function (r) { phName[r.C_Phase_ID] = r.Name; });
    var byProj = {}; (data.phases || []).forEach(function (ph) { (byProj[ph.C_Project_ID] = byProj[ph.C_Project_ID] || []).push(ph); });
    var P = (data.projects || []).filter(function (p) {
      return (!f.org || String(p.AD_Org_ID) === String(f.org)) && (!f.category || p.ProjectCategory === f.category) && (!f.project || p.Value === f.project);   // f.project = one project by Value (§15.1)
    });
    var isActive = function (p) { return yes(p.IsActive) && !yes(p.Processed); };
    var S = P.filter(function (p) {
      var st = f.status || 'all';
      return st === 'all' ? true : st === 'active' ? isActive(p) : st === 'closed' ? yes(p.Processed) : st === 'inactive' ? !yes(p.IsActive) : true;
    });
    var A = S.filter(isActive), T = {};
    // Stage (not moved: needs an AD_Chart reader in the twin, §5.66)
    var stageKey = function (p) { return p.C_Phase_ID == null ? '(no phase)' : (phName[p.C_Phase_ID] || ('C_Phase#' + p.C_Phase_ID)); };
    var sw = blocked('stage');
    T.stage = sw ? { inconclusive: sw } : A.length ? (function () { var m = {}; A.forEach(function (p) { var k = stageKey(p); m[k] = (m[k] || 0) + 1; }); return { stages: m, n: A.length }; })() : { vacuous: true };
    // §5.36B BIM documents (not moved: its measure belongs in the BIM Document plugin's pack): one deliverable = (project, deliverable no) at its LATEST revision
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
    // Last updated (not moved: a date, not a PA number)
    var up = P.map(function (p) { return p.Updated; }).filter(Boolean).sort();
    T.last_updated = up.length ? { v: up[up.length - 1] } : { vacuous: true };
    // the drill's row VIEW: one project as the panel shows it. due / done / late are the row's own display columns (a record view of its phases), not a tile; the health / schedule / budget labels
    //   are NOT decided here: pa_tiles sets them from the PA bucket the project is in.
    function info(p) {
      var ph = byProj[p.C_Project_ID] || [], due = 0, done = 0, late = 0;
      ph.forEach(function (x) { var a = cents(x.PlannedAmt) || 0; if (x.EndDate && day(x.EndDate) <= today) due += a; if (yes(x.IsComplete)) done += a; if (!yes(x.IsComplete) && x.EndDate && day(x.EndDate) < today) late = Math.max(late, tn - dnum(x.EndDate)); });
      return { id: p.C_Project_ID, Value: p.Value, Name: p.Name, cur: cur(p), planned: p.PlannedAmt, spent: p.ProjectBalanceAmt, committed: p.CommittedAmt, due: due / 100, done: done / 100, late: Math.round(late), health: null, schedule: null, budget: null, stage: phName[p.C_Phase_ID] || null };
    }
    var view = {}, stageDrill = {};
    P.forEach(function (p) { view[String(p.C_Project_ID)] = info(p); });
    A.forEach(function (p) { var k = 'stage:' + stageKey(p); (stageDrill[k] = stageDrill[k] || []).push(view[String(p.C_Project_ID)]); });
    var noOrders = !!(blocked('proc_openpo') || data.orders == null);
    // which tile cannot be judged on this source, and why (an entity the server does not serve): the PA path keeps these states instead of asking a row that has no table to read
    var flags = { closingWhy: blocked('active_projects_sub'), forecast_cost: blocked('forecast_cost'), health: blocked('health'), physical_spent: blocked('physical_spent'), schedule: blocked('schedule'), budget_status: null,
      approvals: blocked('approvals'), committed_contract: !!(blocked('committed_contract') || data.orders == null), committed_verified: !!(blocked('committed_verified') || data.issues == null), procurement: noOrders };
    return { tiles: T, flags: flags, view: view, stageDrill: stageDrill, pop: { P: P.length, S: S.length, A: A.length }, formula: FORMULA, caveat: CAVEAT };
  }
  // compute(data, f) — a source WITHOUT the CAPEX PA rows. The three not-moved tiles are real; every moved tile is in its empty state and carries noPa (flatten prints "no data (CAPEX PA rows not installed)").
  function compute(data, f) {
    var fr = frame(data, f), T = fr.tiles, np = function (o) { o.noPa = true; return o; };
    T.total_projects = np({ vacuous: true, n: null, closed: null });
    T.active_projects = np({ vacuous: true, n: null, closing: null });
    T.approved_budget = np({ cur: {} });
    T.actual_cost = np({ cur: {}, pctOfPlan: {} });
    T.committed_cost = np({ cur: {}, invoiced: {} });
    T.forecast_cost = np({ inconclusive: NOPA });
    T.completed_year = np({ vacuous: true, n: null });
    T.health = np({ inconclusive: NOPA }); T.physical_spent = np({ inconclusive: NOPA }); T.schedule = np({ inconclusive: NOPA }); T.budget_status = np({ inconclusive: NOPA });
    T.approvals = np({ inconclusive: NOPA });
    T.committed_contract = np({ vacuous: true, cur: {} }); T.committed_verified = np({ vacuous: true, cur: {} });
    T.procurement = np({ overcommitted: { n: null }, openpo: { notinstalled: true }, nopo: { notinstalled: true } });
    T.handover = np({ vacuous: true });
    return { tiles: T, drill: fr.stageDrill, pop: fr.pop, formula: fr.formula, caveat: fr.caveat };
  }

  // canonical strings (what the twin compares and the DOM exposes as data-value)
  function m2s(m) { var k = Object.keys(m).sort(); return k.length ? k.map(function (c) { return c + ':' + (m[c] / 100).toFixed(2); }).join(',') : 'no data'; }
  function r2s(m) { var k = Object.keys(m).sort(); return k.length ? k.map(function (c) { return c + ':' + m[c].toFixed(4); }).join(',') : 'no data'; }
  function flatten(T) {
    var o = {}, t;
    function st(x, f) { return x.inconclusive ? 'INCONCLUSIVE' : x.vacuous ? 'no data' : x.pending ? 'PENDING' : f(x); }
    var NP = 'no data (' + NOPA + ')';
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
    // a source without the CAPEX PA rows: every key of a moved tile says so (§5.75 step 4)
    var KEYS = { total_projects: ['total_projects', 'total_projects_closed'], active_projects: ['active_projects', 'active_projects_closing'], approved_budget: ['approved_budget'], actual_cost: ['actual_cost', 'actual_cost_pct_of_plan'],
      committed_cost: ['committed_cost', 'committed_invoiced'], forecast_cost: ['forecast_cost'], completed_year: ['completed_year'], health: ['health'], physical_spent: ['physical', 'spent'], schedule: ['schedule', 'avg_delay'],
      budget_status: ['budget_status', 'actual_overrun'], approvals: ['approvals'], committed_contract: ['committed_contract'], committed_verified: ['committed_verified'], procurement: ['proc_openpo', 'proc_overcommitted', 'proc_nopo'], handover: ['handover_ready', 'handover_done'] };
    Object.keys(KEYS).forEach(function (t) { if (T[t] && T[t].noPa) KEYS[t].forEach(function (k) { o[k] = NP; }); });
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
      else if (va === 'INCONCLUSIVE' || vb === 'INCONCLUSIVE' || vb === undefined || va === 'no data (not installed)' || vb === 'no data (not installed)' || /^no data \(CAPEX PA rows/.test(va) || /^no data \(CAPEX PA rows/.test(String(vb)) || (va === 'PENDING' && vb === 'PENDING')) v = 'INCONCLUSIVE';   // pending/unreadable: nothing was judged
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
  function projectDetail(data, f, id, comp) {   // comp (§5.75 step 3): the compute to take the project's health / schedule / budget from - the page and the node harness pass the PA one; absent = compute() here
    var p = (data.projects || []).filter(function (x) { return String(x.C_Project_ID) === String(id); })[0]; if (!p) return null;
    f = f || {}; var today = f.today, tn = dnum(today), un = {}; (data.unavailable || []).forEach(function (u) { un[u] = 1; });
    var R = (comp || compute)(data, { today: today, status: 'all', org: '', category: '', project: p.Value }), row = ((R.drill || {}).total_projects || [])[0] || {};
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
    // "basis differs" is the PA row CAPEX Forecast basis differs: the project is flagged when that row selects it (R.members.basis, from pa_tiles); without the rows nothing is flagged (§5.75 step 4)
    out.forecast = { basisDiffers: !!(R.members && (R.members.basis || []).map(String).indexOf(String(id)) >= 0) };
    out.orders = (un.orders || data.orders == null) ? null : { rows: (data.orders || []).filter(function (o) { return String(o.C_Project_ID) === String(id) && o.IsSOTrx === 'N'; }).map(function (o) { return { id: o.C_Order_ID, status: o.DocStatus, total: Number(o.GrandTotal), cur: o.C_Currency_ID, open: !{ CO: 1, CL: 1, VO: 1, RE: 1 }[o.DocStatus] }; }) };
    if (out.orders) out.orders.open = out.orders.rows.filter(function (r) { return r.open; }).length;
    // §5.59 the supply chain after the PO, a DRILL (never a tile): per purchase order its receipts, vendor invoices and payments; null when the server lacks any of the three entities
    out.chain = null;
    if (!(un.receipts || un.vinvoices || un.payments) && data.receipts != null && data.vinvoices != null && data.payments != null && out.orders) {
      var dn2 = function (st) { return st === 'CO' || st === 'CL'; }, mine = function (a) { return (a || []).filter(function (x) { return String(x.C_Project_ID) === String(id); }); };
      var rc = mine(data.receipts).filter(function (x) { return x.IsSOTrx === 'N' && dn2(x.DocStatus); }), iv = mine(data.vinvoices).filter(function (x) { return x.IsSOTrx === 'N' && dn2(x.DocStatus); }), py = (data.payments || []).filter(function (x) { return x.IsReceipt === 'N' && dn2(x.DocStatus) && (String(x.C_Project_ID) === String(id) || (x.C_Invoice_ID != null && iv.some(function (i) { return String(i.C_Invoice_ID) === String(x.C_Invoice_ID); }))); });   // a payment belongs to the project by its own Project OR by its INVOICE: the Payment window hides Project once an invoice is picked (UAT dry run 2026-11-14)
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
    if (out.forecast.basisDiffers) out.why.push({ kind: 'basis', src: { row: 'CAPEX Forecast basis differs' }, text: 'Spent and Done are not measured on one basis, so the forecast is an alarm, not a result' });
    return out;
  }

  var API = { projectDetail: projectDetail, _sumBy: sumBy, frame: frame, NOPA: NOPA, compute: compute, flatten: flatten, twin: twin, PER_SOURCE: PER_SOURCE, FORMULA: FORMULA, CAVEAT: CAVEAT };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CapexTiles = API;
})(typeof window !== 'undefined' ? window : this);

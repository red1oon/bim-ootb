// capex/dash.js — the page. Every number comes from CapexTiles.compute(data, filters); this file only draws. Spec: prompts/CAPEX_DASHBOARD.md
// Rendered numbers carry data-flat="<tile key>" + data-value="<canonical string>" so a witness can compare them with an independent SQL result.
(function () {
  'use strict';
  var CFG = Object.assign({
    title: 'CAPEX Project Management — Executive Dashboard',
    subtitle: 'Single view of all projects · Plan · Monitor · Control · Deliver',
    brand: 'PMO', brandSub: 'Project Management Office',
    erpDb: '../erp/ad_seed.db', sqlJs: '../erp/sqljs/sql-wasm.js', sqlWasm: '../erp/sqljs/sql-wasm.wasm',
    legacySnapshot: 'legacy_snapshot.json', buildingsBase: '../buildings/', viewerUrl: '../viewer/viewer.html'
  }, window.CAPEX_CFG || {});
  var Q = new URLSearchParams(location.search);
  if (Q.get('db')) CFG.erpDb = Q.get('db');
  if (Q.get('snapshot')) CFG.legacySnapshot = Q.get('snapshot');
  if (Q.get('buildings')) CFG.buildingsBase = Q.get('buildings');
  var TODAY = Q.get('today') || new Date().toISOString().slice(0, 10);
  var T = window.CapexTiles, AD = window.CapexAdapters;
  var $ = function (id) { return document.getElementById(id); };
  var S = { sources: {}, cur: 'sqlite', view: 'dashboard', flat: null, res: null, bim: {} };
  var log = function (m) { console.log(m); (window.__capexLog = window.__capexLog || []).push(m); };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function h(tag, cls, html, flatKey) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html;
    if (flatKey) { e.setAttribute('data-flat', flatKey); e.setAttribute('data-value', S.flat[flatKey]); } return e;
  }
  function data() { return S.sources[S.cur]; }
  function curInfo(id) { var c = (data().currencies || []).filter(function (r) { return String(r.C_Currency_ID) === String(id); })[0]; return c || { ISO_Code: 'cur#' + id, StdPrecision: 2 }; }
  function money(mapCents) {      // one span per currency — currencies are never added together
    var ks = Object.keys(mapCents).sort();
    if (!ks.length) return '<span class="nodata">no data</span>';
    return ks.map(function (k) {
      var ci = curInfo(k), p = ci.StdPrecision == null ? 2 : +ci.StdPrecision;
      return '<div class="big money" data-cur="' + esc(k) + '"><span class="cur">' + esc(ci.ISO_Code) + '</span>' + (mapCents[k] / 100).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p }) + '</div>';
    }).join('');
  }
  function pctMap(m) {
    var ks = Object.keys(m).sort(); if (!ks.length) return '<span class="nodata">no data</span>';
    return ks.map(function (k) { return '<span class="pct" data-cur="' + esc(k) + '">' + (ks.length > 1 ? esc(curInfo(k).ISO_Code) + ' ' : '') + Math.round(m[k] * 100) + '%</span>'; }).join(' · ');
  }
  function state(x, why) { return x.inconclusive ? '<span class="nodata">n/a — ' + esc(x.inconclusive) + ' (INCONCLUSIVE)</span>' : x.vacuous ? '<span class="nodata">no data</span>' : x.pending ? '<span class="pending">definition pending (client)</span>' : null; }
  function note(k) { return '<div class="note">ƒ ' + esc(S.res.formula[k]) + '</div>'; }
  function card(title, body, k, cls) { var c = h('div', 'card ' + (cls || ''), '<h3>' + esc(title) + '</h3>'); c.setAttribute('data-tile', k); c.insertAdjacentHTML('beforeend', body + (k ? note(k) : '')); return c; }

  function fillFlat(root) {       // every [data-flat] element inside root gets its canonical value
    [].forEach.call(root.querySelectorAll('[data-flat]'), function (e) { e.setAttribute('data-value', S.flat[e.getAttribute('data-flat')]); });
  }
  function fl(k, inner, tag) { return '<' + (tag || 'span') + ' data-flat="' + k + '">' + inner + '</' + (tag || 'span') + '>'; }

  function dashboard() {
    var t = S.res.tiles, v = $('view'); v.innerHTML = '';
    var k = h('div', 'grid kpis');
    k.appendChild(card('Total Projects (All)', '<div class="big">' + fl('total_projects', S.flat.total_projects) + '</div><div class="subv">Closed: ' + fl('total_projects_closed', S.flat.total_projects_closed) + '</div>', 'total_projects'));
    k.appendChild(card('Active Projects', '<div class="big">' + fl('active_projects', S.flat.active_projects) + '</div><div class="subv">' + (S.flat.active_projects_closing === 'INCONCLUSIVE' ? 'in closing phase: n/a (INCONCLUSIVE)' : fl('active_projects_closing', S.flat.active_projects_closing) + ' in phase “Closed”') + '</div>', 'active_projects'));
    k.appendChild(card('Approved Budget', fl('approved_budget', money(t.approved_budget.cur), 'div') + '<div class="subv">planned amount</div>', 'approved_budget'));
    k.appendChild(card('Actual Cost', fl('actual_cost', money(t.actual_cost.cur), 'div') + '<div class="subv">% of plan: ' + fl('actual_cost_pct_of_plan', pctMap(t.actual_cost.pctOfPlan)) + '</div>', 'actual_cost'));
    k.appendChild(card('Committed Cost', fl('committed_cost', money(t.committed_cost.cur), 'div') + '<div class="subv">invoiced: ' + fl('committed_invoiced', Object.keys(t.committed_cost.invoiced).length ? Object.keys(t.committed_cost.invoiced).sort().map(function (c) { return esc(curInfo(c).ISO_Code) + ' ' + (t.committed_cost.invoiced[c] / 100).toFixed(2); }).join(' · ') : 'no data') + '</div>', 'committed_cost'));
    k.appendChild(card('Forecast Cost at Completion', fl('forecast_cost', '<span class="pending">definition pending (client)</span>', 'div'), 'forecast_cost'));
    k.appendChild(card('Projects Completed this year', '<div class="big">' + fl('completed_year', S.flat.completed_year) + '</div><div class="subv">year ' + esc(TODAY.slice(0, 4)) + '</div>', 'completed_year'));
    v.appendChild(k);

    var g = h('div', 'grid panels');
    // Project Health donut
    var x = t.health, hb = state(x);
    if (!hb) {
      var segs = [['Green', x.green, 'var(--ok)', 'green'], ['Amber', x.amber, 'var(--warn)', 'amber'], ['Red', x.red, 'var(--bad)', 'red'], ['No EVM data', x.none, 'var(--none)', 'none']], R = 42, C = 2 * Math.PI * R, off = 0, svg = '';
      segs.forEach(function (s) { if (!s[1]) return; var len = C * s[1] / x.n; svg += '<circle r="' + R + '" cx="55" cy="55" fill="none" stroke="' + s[2] + '" stroke-width="14" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 55 55)"/>'; off += len; });
      hb = '<div class="donut"><svg width="110" height="110">' + svg + '<text x="55" y="55" text-anchor="middle" font-size="20" font-weight="700" fill="currentColor">' + x.n + '</text><text x="55" y="70" text-anchor="middle" font-size="9" fill="var(--mut)">ACTIVE</text></svg><div>' +
        segs.map(function (s) { return '<div class="row"><span><i class="dot" style="background:' + s[2] + '"></i>' + s[0] + '</span><b data-flat-part="health_' + s[3] + '">' + s[1] + ' (' + Math.round(100 * s[1] / x.n) + '%)</b></div>'; }).join('') + '</div></div>' + fl('health', '', 'span');
    }
    g.appendChild(card('Project Health (Active)', hb, 'health'));
    // Stage
    x = t.stage; var sb = state(x);
    if (!sb) { var mx = Math.max.apply(null, Object.keys(x.stages).map(function (k) { return x.stages[k]; })); sb = Object.keys(x.stages).sort().map(function (k) { return '<div class="row"><span>' + esc(k) + '</span><b>' + x.stages[k] + '</b></div><div class="bar"><i style="width:' + (100 * x.stages[k] / mx) + '%"></i></div>'; }).join('') + fl('stage', '', 'span'); }
    g.appendChild(card('Project Stage (pipeline)', sb, 'stage'));
    // Physical vs spent
    x = t.physical_spent; var pb = state(x);
    if (!pb) pb = '<div class="row"><span>Physical</span><b>' + fl('physical', pctMap(x.physical)) + '</b></div><div class="row"><span>Spent</span><b>' + fl('spent', pctMap(x.spent)) + '</b></div><div class="note">' + esc(x.caveat) + '</div>';
    g.appendChild(card('Physical vs Spent', pb, 'physical_spent'));
    // Schedule
    x = t.schedule; var cb = state(x);
    if (!cb) {
      var pc = function (n) { return x.n ? Math.round(100 * n / x.n) + '%' : ''; };
      cb = [['On Time', x.ontime, 'var(--ok)'], ['Delayed', x.delayed, 'var(--bad)'], ['At Risk (SPI<0.9)', x.atrisk, 'var(--warn)'], ['No schedule data', x.nosched, 'var(--none)']].map(function (r) { return '<div class="row"><span><i class="dot" style="background:' + r[2] + '"></i>' + r[0] + '</span><b>' + r[1] + ' <small>' + pc(r[1]) + '</small></b></div>'; }).join('') +
        '<div class="row"><span>Average Delay</span><b>' + fl('avg_delay', x.avgDelay == null ? '<span class="nodata">no data</span>' : Math.round(x.avgDelay) + ' days') + '</b></div>' + fl('schedule', '', 'span');
    }
    g.appendChild(card('Schedule Performance', cb, 'schedule'));
    // Budget status
    x = t.budget_status; var bb = state(x);
    if (!bb) bb = [['Within Budget', x.within, 'var(--ok)'], ['Over Budget', x.over, 'var(--bad)'], ['Not Started (no cost)', x.notstarted, 'var(--none)']].map(function (r) { return '<div class="row"><span><i class="dot" style="background:' + r[2] + '"></i>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') +
      '<div class="row"><span>Actual Overrun</span><b>' + fl('actual_overrun', Object.keys(x.overrun).length ? money(x.overrun) : '<span class="nodata">no data</span>') + '</b></div>' + fl('budget_status', '', 'span');
    g.appendChild(card('Budget Status', bb, 'budget_status'));
    v.appendChild(g); fillFlat(v);
  }

  function projectsTable(cols, rowFn, head) {
    var P = data().projects.filter(function (p) { return passes(p); });
    var v = $('view'); v.innerHTML = '';
    if (!P.length) { v.innerHTML = '<div class="card"><span class="nodata">no data — no C_Project rows match the filters</span></div>'; return; }
    var tb = '<table data-tile="' + head + '"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + P.map(rowFn).join('') + '</tbody></table>';
    v.innerHTML = tb;
  }
  function passes(p) { var f = filters(); return (!f.org || String(p.AD_Org_ID) === f.org) && (!f.category || p.ProjectCategory === f.category) && (!f.project || p.Value === f.project) && ({ all: 1, active: p.IsActive === 'Y' && p.Processed !== 'Y', closed: p.Processed === 'Y', inactive: p.IsActive !== 'Y' }[f.status]); }
  function orgName(id) { var o = (data().orgs || []).filter(function (r) { return String(r.AD_Org_ID) === String(id); })[0]; return o ? o.Name : 'Org #' + id; }
  function amt(p, k) { return p[k] == null ? '<span class="nodata">—</span>' : (+p[k]).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function bimLink(p) { var b = S.bim[p.Value]; return b ? '<a class="bim" href="' + esc(CFG.viewerUrl + '?db=' + encodeURIComponent(b) + '&record=' + p.C_Project_ID) + '">BIM</a>' : ''; }
  function projects() {
    projectsTable(['Value', 'Name', 'Org', 'Currency', 'Planned', 'Actual', 'Committed', 'Phase', 'BIM'], function (p) {
      var ph = (data().phaseRef || []).filter(function (r) { return r.C_Phase_ID == p.C_Phase_ID; })[0];
      return '<tr data-project="' + p.C_Project_ID + '"><td>' + esc(p.Value) + '</td><td>' + esc(p.Name) + '</td><td>' + esc(orgName(p.AD_Org_ID)) + '</td><td data-cur="' + p.C_Currency_ID + '">' + esc(curInfo(p.C_Currency_ID).ISO_Code) + '</td><td class="n" data-col="PlannedAmt">' + amt(p, 'PlannedAmt') + '</td><td class="n">' + amt(p, 'ProjectBalanceAmt') + '</td><td class="n">' + amt(p, 'CommittedAmt') + '</td><td>' + (p.C_Phase_ID == null ? '' : esc(ph ? ph.Name : 'C_Phase#' + p.C_Phase_ID)) + '</td><td>' + bimLink(p) + '</td></tr>';
    }, 'projects');
  }
  function budget() {
    projectsTable(['Value', 'Currency', 'Planned', 'Committed', 'Invoiced', 'Actual (ProjectBalanceAmt)'], function (p) {
      return '<tr data-project="' + p.C_Project_ID + '"><td>' + esc(p.Value) + '</td><td>' + esc(curInfo(p.C_Currency_ID).ISO_Code) + '</td><td class="n">' + amt(p, 'PlannedAmt') + '</td><td class="n">' + amt(p, 'CommittedAmt') + '</td><td class="n">' + amt(p, 'InvoicedAmt') + '</td><td class="n">' + amt(p, 'ProjectBalanceAmt') + '</td></tr>';
    }, 'budget');
  }
  function simple(title, body, k) { var v = $('view'); v.innerHTML = ''; v.appendChild(card(title, body, k)); fillFlat(v); }

  var PROJECT = Q.get('project') || '';   // ?project=<C_Project.Value> — one project, same filter for both sources (prompts/CAPEX_DASHBOARD.md §15.1); shown in the filter bar
  function filters() { return { org: $('fOrg').value, category: $('fCat').value, status: $('fStatus').value, project: PROJECT, today: TODAY }; }
  function render() {
    var d = data(); if (!d) { $('view').innerHTML = '<div class="card"><span class="nodata">no data source loaded</span></div>'; $('foot').textContent = '§DASH_NODATA no source'; return; }
    var f = filters(); S.res = T.compute(d, f); S.flat = T.flatten(S.res.tiles);
    log('§DASH_RENDER source=' + S.cur + ' today=' + TODAY + ' filters=' + JSON.stringify({ org: f.org, category: f.category, status: f.status, project: f.project }) + ' pop=' + JSON.stringify(S.res.pop));
    Object.keys(S.flat).forEach(function (k) { log('§DASH_TILE source=' + S.cur + ' tile=' + k + ' value=' + S.flat[k]); });
    $('lastUpdated').textContent = S.flat.last_updated; $('lastUpdated').setAttribute('data-value', S.flat.last_updated);
    var b = $('badgeApprovals'); b.textContent = S.res.tiles.approvals.n != null ? S.res.tiles.approvals.n : ''; b.setAttribute('data-value', S.flat.approvals);
    ({ dashboard: dashboard, projects: projects, budget: budget,
       procurement: function () { simple('Procurement Risks', '<span class="pending">definition pending (client)</span>', null); },
       handover: function () { simple('Handover', '<span class="pending">definition pending (client)</span>', null); },
       approvals: function () { var a = S.res.tiles.approvals; simple('Approval Pending', a.inconclusive ? state(a) : '<div class="big">' + fl('approvals', a.n) + '</div>', 'approvals'); } })[S.view]();
    $('foot').textContent = 'Source: ' + S.cur + (d.meta && d.meta.url ? ' (' + d.meta.url + ')' : '') + (d.unavailable && d.unavailable.length ? ' · unavailable entities: ' + d.unavailable.join(', ') : '') + ' · date used: ' + TODAY;
    window.__capex = { flat: S.flat, source: S.cur, rendered: true, twin: S.twin || null };
  }

  function fillSelects() {
    var d = data(), P = d ? d.projects : [];
    var oIds = [], cats = []; P.forEach(function (p) { if (p.AD_Org_ID != null && oIds.indexOf(String(p.AD_Org_ID)) < 0) oIds.push(String(p.AD_Org_ID)); if (p.ProjectCategory && cats.indexOf(p.ProjectCategory) < 0) cats.push(p.ProjectCategory); });
    var keep = [$('fOrg').value, $('fCat').value, $('fStatus').value];
    $('fOrg').innerHTML = '<option value="">All Organizations</option>' + oIds.map(function (i) { return '<option value="' + i + '">' + esc(orgName(i)) + '</option>'; }).join('');
    $('fCat').innerHTML = '<option value="">All</option>' + cats.sort().map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    $('fStatus').innerHTML = [['active', 'Active Projects'], ['all', 'All'], ['closed', 'Closed'], ['inactive', 'Inactive']].map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
    if (keep[0]) $('fOrg').value = keep[0]; if (keep[1]) $('fCat').value = keep[1]; if (keep[2]) $('fStatus').value = keep[2]; else $('fStatus').value = 'active';
  }
  async function probeBim() {      // the BIM link appears only when the building file answers HEAD 200
    S.bim = {}; var d = data(); if (!d) return;
    for (var i = 0; i < d.projects.length; i++) {
      var val = d.projects[i].Value; if (!val) continue; var url = CFG.buildingsBase + encodeURIComponent(val) + '_extracted.db';
      try { var r = await fetch(url, { method: 'HEAD' }); if (r.ok) S.bim[val] = url; } catch (e) {}
    }
    log('§DASH_BIM buildings_found=' + Object.keys(S.bim).length + ' of=' + d.projects.length);
  }
  function runTwin() {
    if (!S.sources.sqlite || !S.sources.legacy) { log('§DASH_TWIN skipped reason=' + (S.sources.legacy ? 'no sqlite source' : 'no legacy snapshot (' + CFG.legacySnapshot + ' not present — run tools/legacy_snapshot.js while the legacy server is up)')); return; }
    var f = filters(), a = T.flatten(T.compute(S.sources.sqlite, f).tiles), b = T.flatten(T.compute(S.sources.legacy, f).tiles);
    S.twin = T.twin(a, b, log);
  }
  async function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('script ' + src)); }; document.head.appendChild(s); }); }

  async function boot() {
    document.title = CFG.title; $('title').textContent = CFG.title; $('subtitle').textContent = CFG.subtitle; $('brandName').textContent = CFG.brand; $('brandSub').textContent = CFG.brandSub; $('brandMark').textContent = (CFG.brand || '?').slice(0, 2).toUpperCase();
    log('§DASH_TODAY ' + TODAY + (Q.get('today') ? ' (from ?today=)' : ' (browser date)'));
    try {
      await loadScript(CFG.sqlJs);
      var SQL = await initSqlJs({ locateFile: function () { return CFG.sqlWasm; } });
      S.sources.sqlite = await AD.loadSqlite(SQL, CFG.erpDb);
      var d = S.sources.sqlite; log('§DASH_SOURCE sqlite url=' + CFG.erpDb + ' projects=' + d.projects.length + ' phases=' + d.phases.length + ' tasks=' + d.tasks.length + ' lines=' + d.lines.length + ' unavailable=[' + d.unavailable.join(',') + ']');
    } catch (e) { log('§DASH_SOURCE sqlite FAIL ' + e.message); }
    try { S.sources.legacy = await AD.loadSnapshot(CFG.legacySnapshot); log('§DASH_SOURCE legacy snapshot projects=' + S.sources.legacy.projects.length + ' unavailable=[' + S.sources.legacy.unavailable.join(',') + ']'); }
    catch (e) { log('§DASH_SOURCE legacy none (' + CFG.legacySnapshot + ')'); }
    S.cur = (Q.get('source') === 'legacy' && S.sources.legacy) ? 'legacy' : S.sources.sqlite ? 'sqlite' : (S.sources.legacy ? 'legacy' : 'none');   // ?source=legacy opens the snapshot (§5.27)
    $('src').innerHTML = Object.keys(S.sources).map(function (k) { return '<option value="' + k + '">' + (k === 'sqlite' ? 'A · SQLite ERP DB' : 'B · Legacy iDempiere') + '</option>'; }).join('');
    if (PROJECT) { var fp = $('fProject'); fp.hidden = false; fp.textContent = 'Project: ' + PROJECT; }
    $('src').value = S.cur; $('srcInfo').textContent = S.sources.legacy ? '' : 'Source B (legacy) not loaded';
    fillSelects(); await probeBim(); runTwin(); render();
    $('src').onchange = function () { S.cur = this.value; fillSelects(); probeBim().then(render); };
    ['fOrg', 'fCat', 'fStatus'].forEach(function (id) { $(id).onchange = function () { runTwin(); render(); }; });
    window.onhashchange = nav; nav();
  }
  function nav() {
    S.view = (location.hash || '#dashboard').slice(1); if (!{ dashboard: 1, projects: 1, budget: 1, procurement: 1, approvals: 1, handover: 1 }[S.view]) S.view = 'dashboard';
    [].forEach.call(document.querySelectorAll('#nav a'), function (a) { a.classList.toggle('on', a.getAttribute('data-view') === S.view); });
    if (data()) render(); else render();
  }
  boot();
})();

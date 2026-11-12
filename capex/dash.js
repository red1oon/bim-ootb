// capex/dash.js — the page. Every number comes from CapexTiles.compute(data, filters); this file only draws. Spec: prompts/CAPEX_DASHBOARD.md
// Rendered numbers carry data-flat="<tile key>" + data-value="<canonical string>" so a witness can compare them with an independent SQL result.
(function () {
  'use strict';
  var CFG = Object.assign({
    title: 'CAPEX Project Management — Executive Dashboard',
    subtitle: 'Single view of all projects · Plan · Monitor · Control · Deliver',
    brand: 'PMO', brandSub: 'Project Management Office',
    erpDb: '../erp/ad_seed.db', sqlJs: '../erp/sqljs/sql-wasm.js', sqlWasm: '../erp/sqljs/sql-wasm.wasm',
    legacySnapshot: 'legacy_snapshot.json', buildingsBase: '../buildings/', viewerUrl: '../viewer/viewer.html', erpUrl: '../erp/idempiere.html', legacyUi: 'http://localhost:8088/webui/index.zul'
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
  // §5.50: the formula is one click away, not on the glance: a collapsed ƒ marker per tile (the text is unchanged, still in the DOM and in the guide)
  function note(k) { return '<details class="note"><summary title="How this is calculated">ƒ formula</summary><div>' + esc(S.res.formula[k]) + '</div></details>'; }
  var DRILLABLE = { total_projects: 1, active_projects: 1, approved_budget: 1, actual_cost: 1, committed_cost: 1, forecast_cost: 1, completed_year: 1 };   // §5.49: tiles whose number opens the projects behind it
  function card(title, body, k, cls) { var c = h('div', 'card ' + (cls || ''), '<h3>' + esc(title) + '</h3>'); c.setAttribute('data-tile', k); if (DRILLABLE[k]) c.setAttribute('data-drill', k); c.insertAdjacentHTML('beforeend', body + (k ? note(k) : '')); return c; }

  function fillFlat(root) {       // every [data-flat] element inside root gets its canonical value
    [].forEach.call(root.querySelectorAll('[data-flat]'), function (e) { e.setAttribute('data-value', S.flat[e.getAttribute('data-flat')]); });
  }
  function fl(k, inner, tag) { return '<' + (tag || 'span') + ' data-flat="' + k + '">' + inner + '</' + (tag || 'span') + '>'; }

  function split(key, label, x) {   // §5.38 Q4: the proposed committed split, one line each; unavailable entity = not installed, never 0
    var v = x.notinstalled ? 'no data (not installed)' : x.vacuous ? 'no data' : Object.keys(x.cur).sort().map(function (c) { return esc(curInfo(c).ISO_Code) + ' ' + (x.cur[c] / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }).join(' · ');
    return '<div class="subv"' + (key === 'committed_verified' ? ' title="Overlaps Actual Cost: iDempiere adds an issue\'s cost to the project balance"' : '') + '>' + label + ': ' + fl(key, v) + '</div>';
  }
  function dashboardClassic() {
    var t = S.res.tiles, v = $('view'); v.innerHTML = '';
    var k = h('div', 'grid kpis');
    k.appendChild(card('Total Projects (All)', '<div class="big">' + fl('total_projects', S.flat.total_projects) + '</div><div class="subv">Closed: ' + fl('total_projects_closed', S.flat.total_projects_closed) + '</div>', 'total_projects'));
    k.appendChild(card('Active Projects', '<div class="big">' + fl('active_projects', S.flat.active_projects) + '</div><div class="subv">' + (S.flat.active_projects_closing === 'INCONCLUSIVE' ? 'in closing phase: n/a (INCONCLUSIVE)' : fl('active_projects_closing', S.flat.active_projects_closing) + ' in phase “Closed”') + '</div>', 'active_projects'));
    k.appendChild(card('Approved Budget', fl('approved_budget', money(t.approved_budget.cur), 'div') + '<div class="subv">planned amount</div>', 'approved_budget'));
    k.appendChild(card('Actual Cost', fl('actual_cost', money(t.actual_cost.cur), 'div') + '<div class="subv">% of plan: ' + fl('actual_cost_pct_of_plan', pctMap(t.actual_cost.pctOfPlan)) + '</div>', 'actual_cost'));
    k.appendChild(card('Committed Cost', fl('committed_cost', money(t.committed_cost.cur), 'div') + '<div class="subv">invoiced: ' + fl('committed_invoiced', Object.keys(t.committed_cost.invoiced).length ? Object.keys(t.committed_cost.invoiced).sort().map(function (c) { return esc(curInfo(c).ISO_Code) + ' ' + (t.committed_cost.invoiced[c] / 100).toFixed(2); }).join(' · ') : 'no data') + '</div>' + split('committed_contract', 'contract (proposed)', t.committed_contract) + split('committed_verified', 'verified (proposed)', t.committed_verified), 'committed_cost'));
    k.appendChild(card('Forecast Cost at Completion (proposed)', t.forecast_cost.inconclusive ? '<span class="nodata">n/a — ' + esc(t.forecast_cost.inconclusive) + ' (INCONCLUSIVE)</span>' : fl('forecast_cost', money(t.forecast_cost.cur), 'div') + '<div class="subv" title="EAC = Spent + (Budget − Done) ÷ CPI. Proposed, awaiting the client.">proposed formula</div>' + (t.forecast_cost.basisDiffers ? '<div class="subv warn" data-basis="differs" title="CPI is outside 0.5–2 on ' + t.forecast_cost.basisDiffers + ' project(s): Spent and Done are not on one basis, so read this forecast as an alarm, not a result">⚠ basis differs</div>' : ''), 'forecast_cost'));
    k.appendChild(card('BIM Documents issued for construction', '<div class="big">' + fl('bim_documents', t.bim_documents.notinstalled ? '<span class="nodata" title="The BIM Document module is not installed on this server">no data (not installed)</span>' : t.bim_documents.vacuous ? '<span class="nodata">no data</span>' : t.bim_documents.issued + ' / ' + t.bim_documents.total) + '</div><div class="subv">issued / deliverables</div>', 'bim_documents'));
    k.appendChild(card('Projects Completed this year', '<div class="big">' + fl('completed_year', S.flat.completed_year) + '</div><div class="subv">year ' + esc(TODAY.slice(0, 4)) + '</div>', 'completed_year'));
    v.appendChild(k);

    var g = h('div', 'grid panels');
    // Project Health donut
    var x = t.health, hb = state(x);
    if (!hb) {
      var segs = [['Green', x.green, 'var(--ok)', 'green'], ['Amber', x.amber, 'var(--warn)', 'amber'], ['Red', x.red, 'var(--bad)', 'red'], ['No EVM data', x.none, 'var(--none)', 'none']], R = 42, C = 2 * Math.PI * R, off = 0, svg = '';
      segs.forEach(function (s) { if (!s[1]) return; var len = C * s[1] / x.n; svg += '<circle r="' + R + '" cx="55" cy="55" fill="none" stroke="' + s[2] + '" stroke-width="14" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 55 55)"/>'; off += len; });
      hb = '<div class="donut"><svg width="110" height="110">' + svg + '<text x="55" y="55" text-anchor="middle" font-size="20" font-weight="700" fill="currentColor">' + x.n + '</text><text x="55" y="70" text-anchor="middle" font-size="9" fill="var(--mut)">ACTIVE</text></svg><div>' +
        segs.map(function (s) { return '<div class="row" data-drill="health:' + s[3] + '"><span><i class="dot" style="background:' + s[2] + '"></i>' + s[0] + '</span><b data-flat-part="health_' + s[3] + '">' + s[1] + ' (' + Math.round(100 * s[1] / x.n) + '%)</b></div>'; }).join('') + '</div></div>' + fl('health', '', 'span');
    }
    g.appendChild(card('Project Health (Active)', hb, 'health'));
    // Stage
    x = t.stage; var sb = state(x);
    if (!sb) { var mx = Math.max.apply(null, Object.keys(x.stages).map(function (k) { return x.stages[k]; })); sb = Object.keys(x.stages).sort().map(function (k) { return '<div class="row" data-drill="stage:' + esc(k) + '"><span>' + esc(k) + '</span><b>' + x.stages[k] + '</b></div><div class="bar"><i style="width:' + (100 * x.stages[k] / mx) + '%"></i></div>'; }).join('') + fl('stage', '', 'span'); }
    g.appendChild(card('Project Stage (pipeline)', sb, 'stage'));
    // Physical vs spent
    x = t.physical_spent; var pb = state(x);
    if (!pb) pb = '<div class="row"><span>Physical</span><b>' + fl('physical', pctMap(x.physical)) + '</b></div><div class="row"><span>Spent</span><b>' + fl('spent', pctMap(x.spent)) + '</b></div><details class="note"><summary title="How Physical and Spent are measured">how measured</summary><div>' + esc(x.caveat) + '</div></details>';
    g.appendChild(card('Physical vs Spent', pb, 'physical_spent'));
    // Schedule
    x = t.schedule; var cb = state(x);
    if (!cb) {
      var pc = function (n) { return x.n ? Math.round(100 * n / x.n) + '%' : ''; };
      cb = [['On Time', x.ontime, 'var(--ok)', 'ontime'], ['Delayed', x.delayed, 'var(--bad)', 'delayed'], ['At Risk (SPI<0.9)', x.atrisk, 'var(--warn)', 'atrisk'], ['No schedule data', x.nosched, 'var(--none)', 'nosched']].map(function (r) { return '<div class="row" data-drill="schedule:' + r[3] + '"><span><i class="dot" style="background:' + r[2] + '"></i>' + r[0] + '</span><b>' + r[1] + ' <small>' + pc(r[1]) + '</small></b></div>'; }).join('') +
        '<div class="row"><span>Average Delay</span><b>' + fl('avg_delay', x.avgDelay == null ? '<span class="nodata">no data</span>' : Math.round(x.avgDelay) + ' days') + '</b></div>' + fl('schedule', '', 'span');
    }
    g.appendChild(card('Schedule Performance', cb, 'schedule'));
    // Budget status
    x = t.budget_status; var bb = state(x);
    if (!bb) bb = [['Within Budget', x.within, 'var(--ok)', 'within'], ['Over Budget', x.over, 'var(--bad)', 'over'], ['Not Started (no cost)', x.notstarted, 'var(--none)', 'notstarted']].map(function (r) { return '<div class="row" data-drill="budget:' + r[3] + '"><span><i class="dot" style="background:' + r[2] + '"></i>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') +
      '<div class="row"><span>Actual Overrun</span><b>' + fl('actual_overrun', Object.keys(x.overrun).length ? money(x.overrun) : '<span class="nodata">no data</span>') + '</b></div>' + fl('budget_status', '', 'span');
    g.appendChild(card('Budget Status', bb, 'budget_status'));
    v.appendChild(g); fillFlat(v);
  }


  // ── §5.53 themes: skin (colour tokens) and layout (which shared pieces are drawn). Nothing here computes: every number comes from S.res (tiles.js) and S.res.drill.
  var THEMES = { classic: 'Classic', executive: 'Executive' }, SKINS = { light: 'Light', dark: 'Dark' };
  function pref(name, allowed, dflt) {
    var v = Q.get(name), ok = function (x) { return x && allowed[x]; };
    if (ok(v)) { try { localStorage.setItem('capex.' + name, v); } catch (e) {} return v; }   // an explicit choice is remembered; storage that throws changes nothing
    try { v = localStorage.getItem('capex.' + name); } catch (e) { v = null; }
    return ok(v) ? v : dflt;
  }
  S.theme = pref('theme', THEMES, 'classic'); S.skin = pref('skin', SKINS, 'light');
  function applySkin() { document.body.setAttribute('data-skin', S.skin); }
  function remember(name, v) { try { localStorage.setItem('capex.' + name, v); } catch (e) {} }
  var HCOL = { green: 'var(--ok)', amber: 'var(--warn)', red: 'var(--bad)', none: 'var(--none)' }, HNAME = { green: 'Green', amber: 'Amber', red: 'Red', none: 'No data' };
  function num(v) { return v == null || v === '' ? null : Number(v); }
  function meter(parts) { return '<div class="meter">' + parts.map(function (p) { return '<i style="width:' + Math.max(0, Math.min(100, p[0])).toFixed(1) + '%;background:' + p[1] + (p[2] ? ';opacity:' + p[2] : '') + '"></i>'; }).join('') + '</div>'; }
  function oneCur(m) { var k = Object.keys(m || {}); return k.length === 1 ? k[0] : null; }
  function segBar(x) {   // health as ONE segmented bar; every segment is a drill target and its label is a word + count, never colour alone
    var items = [['green', x.green], ['amber', x.amber], ['red', x.red], ['none', x.none]];
    return '<div class="xseg">' + items.map(function (i) { return '<div class="seg-' + i[0] + '" data-drill="health:' + i[0] + '" style="flex:' + Math.max(i[1], .6) + '" title="' + HNAME[i[0]] + ': ' + i[1] + '" tabindex="0">' + i[1] + '</div>'; }).join('') + '</div>' +
      '<div class="leg">' + items.map(function (i) { return '<span><i class="dot" style="background:' + HCOL[i[0]] + '"></i>' + HNAME[i[0]] + '</span>'; }).join('') + '</div>' + fl('health', '', 'span');
  }
  function reasonOf(r) { var a = []; if ((r.schedule === 'delayed' || r.schedule === 'atrisk') && r.late > 0) a.push(r.late + ' days behind'); if (r.budget === 'over') a.push('spent above plan'); return a.join(' · '); }
  var TIP = null;
  function tipEl() { if (!TIP) { TIP = h('div', 'tip', ''); TIP.id = 'tip'; TIP.hidden = true; document.body.appendChild(TIP); } return TIP; }
  function showTip(r, ev, anchor) {
    var t = tipEl(), why = reasonOf(r), box = anchor.getBoundingClientRect();
    t.innerHTML = '<b>' + esc(r.Value) + '</b> <span class="chip" style="background:' + HCOL[r.health || 'none'] + '">' + HNAME[r.health || 'none'] + '</span>' +
      '<div class="r"><span>Planned</span><span>' + esc(curInfo(r.cur).ISO_Code) + ' ' + (+r.planned).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '</span></div>' +
      '<div class="r"><span>Spent</span><span>' + (r.planned > 0 ? (100 * (r.spent || 0) / r.planned).toFixed(1) + '%' : '—') + '</span></div>' +
      '<div class="r"><span>Behind schedule</span><span>' + r.late + ' days</span></div>' + (why ? '<div class="why">' + esc(why) + '</div>' : '') + '<div class="hint">click to open the project</div>';
    t.setAttribute('data-planned', r.planned); t.setAttribute('data-spent', r.spent || 0); t.setAttribute('data-late', r.late);
    t.hidden = false; var th = t.offsetHeight, tw = t.offsetWidth;   // placed beside the bubble, flipped left/above when it would leave the viewport
    var lx = box.left + box.width / 2 + 16; if (lx + tw > window.innerWidth - 8) lx = box.left + box.width / 2 - 16 - tw;
    t.style.left = Math.max(8, lx) + 'px'; t.style.top = Math.max(8, Math.min(window.innerHeight - th - 8, box.top + box.height / 2 - th / 2)) + 'px';
  }
  function hideTip() { if (TIP) TIP.hidden = true; }
  function bubbleMap(rows) {
    var plotted = rows.filter(function (r) { return num(r.planned) > 0; }), np = rows.length - plotted.length;
    var curs = {}; plotted.forEach(function (r) { curs[r.cur] = 1; }); var same = Object.keys(curs).length <= 1, maxPl = Math.max.apply(null, plotted.map(function (r) { return +r.planned; }).concat([1]));
    var W = 760, H = 330, L = 56, B = 40, Tp = 14, R = 14, maxLate = Math.max.apply(null, plotted.map(function (r) { return r.late; }).concat([0])), maxPct = Math.max.apply(null, plotted.map(function (r) { return 100 * (r.spent || 0) / r.planned; }).concat([100]));
    var xmax = Math.max(14, Math.ceil(maxLate / 14) * 14), ymax = Math.max(100, Math.ceil(maxPct / 20) * 20);
    var X = function (d) { return L + (W - L - R) * d / xmax; }, Y = function (s) { return Tp + (H - Tp - B) * (1 - s / ymax); };
    var svg = '<svg class="bubmap" width="100%" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Portfolio map: days behind schedule against budget spent">';
    svg += '<rect x="' + X(Math.min(18, xmax * .3)) + '" y="' + Tp + '" width="' + (W - R - X(Math.min(18, xmax * .3))) + '" height="' + (Y(80) - Tp) + '" fill="var(--bad)" opacity=".07"/><rect x="' + L + '" y="' + Y(80) + '" width="' + (X(Math.min(18, xmax * .3)) - L) + '" height="' + (H - B - Y(80)) + '" fill="var(--ok)" opacity=".06"/>';
    for (var v = 0; v <= ymax; v += 20) svg += '<line class="xgrid" data-v="' + v + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--line)"/><text x="' + (L - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end" fill="var(--mut)" font-size="11">' + v + '%</text>';
    for (var d = 0; d <= xmax; d += xmax / 5) svg += '<text x="' + X(d) + '" y="' + (H - B + 16) + '" text-anchor="middle" fill="var(--mut)" font-size="11">' + Math.round(d) + '</text>';
    svg += '<text x="' + ((W + L) / 2) + '" y="' + (H - 6) + '" text-anchor="middle" fill="var(--mut)" font-size="12">days behind schedule →</text><text transform="translate(14 ' + ((H - B) / 2) + ') rotate(-90)" text-anchor="middle" fill="var(--mut)" font-size="12">budget spent →</text>';
    svg += '<text x="' + (L + 10) + '" y="' + (Y(80) + 22) + '" fill="var(--ok)" font-size="12" font-weight="700">ON TRACK</text><text x="' + (W - R - 10) + '" y="' + (Tp + 20) + '" text-anchor="end" fill="var(--bad)" font-size="12" font-weight="700">LATE AND OVER BUDGET</text>';
    var placed = [];
    plotted.slice().sort(function (a, b) { return b.planned - a.planned; }).forEach(function (r) {
      var pct = 100 * (r.spent || 0) / r.planned, rad = same ? 7 + Math.sqrt(r.planned / maxPl) * 22 : 11, cx = X(r.late), cy = Y(pct), nud = 0;
      placed.forEach(function (q) { if (Math.abs(q.cx - cx) < 9 && Math.abs(q.cy - cy) < 9) nud++; }); if (nud) cx += nud * 12;
      placed.push({ cx: cx, cy: cy });
      svg += '<circle class="bub" tabindex="0" role="img" data-open-project="' + esc(r.id) + '" data-late="' + r.late + '" data-spentpct="' + pct.toFixed(1) + '" data-nudged="' + (nud ? 1 : 0) + '" cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + HCOL[r.health || 'none'] + '" fill-opacity=".74" stroke="var(--card)" stroke-width="2" aria-label="' + esc(r.Value) + ': ' + HNAME[r.health || 'none'] + ', ' + r.late + ' days behind, ' + pct.toFixed(0) + ' percent spent"/>';
      if (rad >= 20) svg += '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" fill="#fff" font-size="10.5" font-weight="700" pointer-events="none">' + esc(String(r.Value).slice(0, 9)) + '</text>';
    });
    svg += '</svg>';
    var tbl = '<table id="mapTable" style="display:none"><thead><tr><th>Project</th><th>Health</th><th>Days behind</th><th>Spent</th><th>Planned</th></tr></thead><tbody>' + plotted.map(function (r) { return '<tr data-open-project="' + esc(r.id) + '"><td>' + esc(r.Value) + '</td><td>' + HNAME[r.health || 'none'] + '</td><td>' + r.late + '</td><td>' + (100 * (r.spent || 0) / r.planned).toFixed(1) + '%</td><td>' + esc(curInfo(r.cur).ISO_Code) + ' ' + (+r.planned).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '</td></tr>'; }).join('') + '</tbody></table>';
    return '<button type="button" id="mapTableBtn" class="tag btn">Table view</button><div id="mapWrap">' + svg + tbl + '</div><div class="subv notplotted" data-n="' + np + '">' + (np ? 'not plotted: ' + np + ' (no planned amount)' : 'every active project is plotted') + (same ? ' · bubble size = planned amount' : ' · size not shown: several currencies') + '</div>';
  }
  function dashboardExecutive() {
    var t = S.res.tiles, v = $('view'), D = S.res.drill || {}, rows = D.active_projects || [];
    v.innerHTML = '';
    var hero = h('div', 'grid xhero');
    var ap = oneCur(t.approved_budget.cur), pctA = ap ? (t.actual_cost.pctOfPlan || {})[ap] : null, cm = ap ? t.committed_cost.cur[ap] : null;
    hero.appendChild(card('Approved budget', fl('approved_budget', money(t.approved_budget.cur), 'div') + '<div class="subv">' + S.res.pop.S + ' projects · ' + S.res.pop.A + ' active</div>' + (pctA != null ? meter([[100 * pctA, 'var(--acc)']]) + '<div class="subv">' + fl('actual_cost_pct_of_plan', pctMap(t.actual_cost.pctOfPlan)) + ' spent</div>' : '<div class="subv">' + fl('actual_cost_pct_of_plan', pctMap(t.actual_cost.pctOfPlan)) + ' spent</div>'), 'approved_budget'));
    hero.appendChild(card('Spent so far', fl('actual_cost', money(t.actual_cost.cur), 'div') + '<div class="subv">committed ' + fl('committed_cost', moneyTxt(t.committed_cost.cur)) + '</div>' + (ap && pctA != null && t.approved_budget.cur[ap] ? meter([[100 * pctA, 'var(--acc)'], [100 * Math.max(0, (cm || 0) - t.actual_cost.cur[ap]) / t.approved_budget.cur[ap], 'var(--acc)', .4]]) + '<div class="subv">solid = spent, light = committed beyond spent</div>' : ''), 'actual_cost'));
    hero.appendChild(card('Forecast at completion · proposed', t.forecast_cost.inconclusive ? '<span class="nodata">n/a — ' + esc(t.forecast_cost.inconclusive) + '</span>' : fl('forecast_cost', money(t.forecast_cost.cur), 'div') + '<div class="subv" title="EAC = Spent + (Budget − Done) ÷ CPI. Proposed, awaiting the client.">proposed formula</div>' + (t.forecast_cost.basisDiffers ? '<div class="subv warn" data-basis="differs" title="CPI is outside 0.5–2 on ' + t.forecast_cost.basisDiffers + ' project(s): Spent and Done are not on one basis, so read this forecast as an alarm, not a result">⚠ basis differs</div>' : ''), 'forecast_cost'));
    var hb = state(t.health); hero.appendChild(card('Project health (active)', hb || '<div class="big">' + t.health.n + '<span class="cur" style="margin-left:6px">active projects</span></div>' + segBar(t.health), 'health'));
    v.appendChild(hero);
    var mid = h('div', 'grid xmid');
    var mc = card('Portfolio map · where every project stands', bubbleMap(rows), null); mc.setAttribute('data-tile', 'portfolio_map'); mid.appendChild(mc);
    var att = (D['health:red'] || []).concat(D['health:amber'] || []).slice(0, 6);
    var ac = card('Needs attention', att.length ? att.map(function (r) { return '<div class="att-row" data-open-project="' + esc(r.id) + '" tabindex="0"><div><b>' + esc(r.Value) + '</b><small>' + esc(reasonOf(r) || 'see the project') + '</small></div><span class="chip" style="background:' + HCOL[r.health] + '">' + HNAME[r.health] + '</span></div>'; }).join('') + '<div class="subv" style="margin-top:8px">click a row to open the project</div>' : '<span class="nodata">no project is red or amber</span>', null); ac.setAttribute('data-tile', 'attention');
    var st = t.stage, sb = state(st), col = h('div', 'xcol'); col.appendChild(ac);
    if (!sb) { var mx = Math.max.apply(null, Object.keys(st.stages).map(function (k) { return st.stages[k]; })); sb = Object.keys(st.stages).sort().map(function (k) { return '<div class="row" data-drill="stage:' + esc(k) + '"><span>' + esc(k) + '</span><b>' + st.stages[k] + '</b></div>' + meter([[100 * st.stages[k] / mx, 'var(--acc)']]); }).join('') + fl('stage', '', 'span'); }
    col.appendChild(card('Project stage', sb, 'stage')); mid.appendChild(col); v.appendChild(mid); fillFlat(v);
    v.querySelectorAll('circle.bub, .att-row').forEach(function (e) { e.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); } }); });
    v.querySelectorAll('circle.bub').forEach(function (e) {
      var r = rows.filter(function (x) { return String(x.id) === e.getAttribute('data-open-project'); })[0];
      ['mouseover', 'focus'].forEach(function (n) { e.addEventListener(n, function (ev) { showTip(r, ev, e); e.setAttribute('stroke', 'var(--ink)'); e.setAttribute('stroke-width', '3'); }); });
      ['mouseout', 'blur'].forEach(function (n) { e.addEventListener(n, function () { hideTip(); e.setAttribute('stroke', 'var(--card)'); e.setAttribute('stroke-width', '2'); }); });
    });
    var tb = $('mapTableBtn'); if (tb) tb.onclick = function () { var T2 = $('mapTable'), on = T2.style.display === 'none'; T2.style.display = on ? '' : 'none'; document.querySelector('#mapWrap svg').style.display = on ? 'none' : ''; tb.textContent = on ? 'Chart view' : 'Table view'; };
  }
  function dashboard() { var v = $('view'); v.setAttribute('data-theme', S.theme); ({ classic: dashboardClassic, executive: dashboardExecutive })[S.theme](); }
  document.addEventListener('click', function (ev) {   // a bubble, an attention row or a table row opens ONE project in the drill panel
    var el = ev.target.closest && ev.target.closest('#view [data-open-project]'); if (!el) return;
    var rs = ((S.res.drill || {}).active_projects || []).filter(function (r) { return String(r.id) === el.getAttribute('data-open-project'); }); if (rs.length) openDrillRows(rs, rs[0].Value, 'project:' + rs[0].id);
  });

  // ── §5.54 the project page: one project in narrow tabs. projectDetail() (tiles.js) does all the work; this only draws it.
  var PTABS = [['overview', 'Overview'], ['schedule', 'Schedule'], ['cost', 'Cost'], ['procurement', 'Procurement'], ['documents', 'Documents']];
  var PSTAT = { complete: ['Complete', 'var(--acc)'], inprogress: ['In progress', 'var(--warn)'], overdue: ['Overdue', 'var(--bad)'], tocome: ['To come', 'var(--none)'] };
  function fmt(v, d) { return v == null ? '<span class="nodata">—</span>' : (+v).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); }
  function projectPage() {
    var v = $('view'); v.innerHTML = ''; v.setAttribute('data-theme', S.theme);
    var d = T.projectDetail(data(), { today: TODAY }, S.projId), root = h('div', 'ppage'); root.setAttribute('data-page', 'project');
    if (!d) { root.innerHTML = '<a id="pBack" href="#dashboard">‹ Dashboard</a><div class="card"><span class="nodata">no such project in this data source</span></div>'; v.appendChild(root); return; }
    var ci = curInfo(d.cur), iso = esc(ci.ISO_Code || ''), erp = S.cur === 'legacy' ? CFG.legacyUi + '?Action=Zoom&TableName=C_Project&Record_ID=' + d.id : CFG.erpUrl + '?window=130&record=' + d.id;
    var COLV = { green: 'var(--ok)', amber: 'var(--warn)', red: 'var(--bad)', none: 'var(--none)', ontime: 'var(--ok)', delayed: 'var(--bad)', atrisk: 'var(--warn)', nosched: 'var(--none)', within: 'var(--ok)', over: 'var(--bad)', notstarted: 'var(--none)' };
    var chip = function (kind, val, label) { return val ? '<span class="pchip" data-kind="' + kind + '" style="background:' + (COLV[val] || 'var(--none)') + '">' + esc(label) + '</span>' : ''; };
    var W = { green: 'Green', amber: 'Amber', red: 'Red', none: 'No data' }, SW = { ontime: 'On time', delayed: 'Delayed' + (d.late ? ' ' + d.late + ' days' : ''), atrisk: 'At risk' + (d.late ? ' · ' + d.late + ' days' : ''), nosched: 'No schedule' }, BW = { within: 'Budget within plan', over: 'Over budget', notstarted: 'No cost yet' };
    root.innerHTML = '<div class="pcrumb"><a id="pBack" href="#dashboard">‹ Dashboard</a> <span>/ Projects /</span> <b>' + esc(d.Value) + '</b></div>' +
      '<div class="phead"><h2>' + esc(d.Value) + '</h2>' + (d.Name && d.Name !== d.Value ? '<span class="pname">' + esc(d.Name) + '</span>' : '') + chip('health', d.health, W[d.health] || '') + chip('schedule', d.schedule, SW[d.schedule] || '') + chip('budget', d.budget, BW[d.budget] || '') + '<a class="erp-link" href="' + esc(erp) + '" target="_blank" rel="noopener">Open in iDempiere ↗</a></div>';
    var tl = h('div', 'ptabs'); tl.setAttribute('role', 'tablist');
    PTABS.forEach(function (t) { var b = h('button', 'ptab', esc(t[1])); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('data-tab', t[0]); b.setAttribute('aria-selected', t[0] === S.tab ? 'true' : 'false'); b.tabIndex = t[0] === S.tab ? 0 : -1; b.onclick = function () { location.hash = '#project/' + d.id + '/' + t[0]; }; tl.appendChild(b); });
    tl.addEventListener('keydown', function (ev) { var i = PTABS.map(function (t) { return t[0]; }).indexOf(S.tab), n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: PTABS.length - 1 }[ev.key]; if (n == null) return; ev.preventDefault(); n = (n + PTABS.length) % PTABS.length; S.refocusTab = true; location.hash = '#project/' + d.id + '/' + PTABS[n][0]; });
    root.appendChild(tl);
    var panel = function (k, html) { var p = h('div', 'ppanel', html); p.setAttribute('role', 'tabpanel'); p.setAttribute('data-panel', k); p.hidden = k !== S.tab; root.appendChild(p); };
    var m = d.money, pp = function (k, label, val, sub) { return '<div class="card"><h3>' + label + '</h3><div class="big" data-pp="' + k + '" data-value="' + (val == null ? '' : val) + '"><span class="cur">' + iso + '</span>' + fmt(val) + '</div>' + (sub || '') + '</div>'; };
    var spentPct = m.planned > 0 ? 100 * (m.spent || 0) / m.planned : null, donePct = m.planned > 0 ? 100 * m.done / m.planned : null, duePct = m.planned > 0 ? 100 * m.due / m.planned : null;
    panel('overview', '<div class="pgrid">' + pp('planned', 'Approved', m.planned, '<div class="subv">' + d.phases.length + ' phases</div>') +
      pp('spent', 'Spent', m.spent, spentPct != null ? meter([[spentPct, 'var(--acc)']]) + '<div class="subv">' + spentPct.toFixed(2) + '% of plan</div>' : '') +
      '<div class="card"><h3>Due vs done</h3><div class="big"><span class="cur">' + iso + '</span><span data-pp="due" data-value="' + m.due + '">' + fmt(m.due) + '</span></div><div class="subv">due · done <span data-pp="done" data-value="' + m.done + '">' + fmt(m.done) + '</span></div>' + (donePct != null ? meter([[Math.min(100, donePct), 'var(--acc)']]) + '<div class="subv">done is ' + donePct.toFixed(1) + '% of plan, due ' + duePct.toFixed(1) + '%</div>' : '') + '</div>' +
      '<div class="card"><h3>Forecast · proposed</h3><div class="subv">the figure is on the dashboard tile</div>' + (d.forecast.basisDiffers ? '<div class="subv warn" data-basis="differs">⚠ basis differs</div>' : '<div class="subv">basis consistent</div>') + '</div></div>' +
      '<div class="card"><h3>In plain words</h3><ul class="why">' + (d.why.length ? d.why.map(function (w) { return '<li data-kind="' + w.kind + '">' + esc(w.text) + '</li>'; }).join('') : '<li class="nodata">nothing flagged</li>') + '</ul><div class="subv">Each line is generated from this project\'s rows. Nothing here is typed.</div></div>');
    var ph = d.phases, dated = ph.filter(function (x) { return x.start && x.end; }), body;
    if (!ph.length) body = '<div class="card"><span class="nodata">this project has no phases</span></div>';
    else {
      var t0 = dated.length ? Math.min.apply(null, dated.map(function (x) { return Date.parse(x.start); })) : 0, t1 = dated.length ? Math.max.apply(null, dated.map(function (x) { return Date.parse(x.end); })) : 1, td = Date.parse(TODAY), lo = Math.min(t0, td), hi = Math.max(t1, td), Wd = 760, L = 150, X = function (t) { return L + (Wd - L - 10) * (t - lo) / Math.max(1, hi - lo); };
      var svg = '<svg width="100%" viewBox="0 0 ' + Wd + ' ' + (40 + ph.length * 32) + '" role="img" aria-label="Phases against today">';
      ph.forEach(function (x, i) { var y = 12 + i * 32; svg += '<text x="0" y="' + (y + 15) + '" fill="var(--ink)" font-size="12.5" font-weight="600">' + esc(String(x.name).slice(0, 22)) + '</text>';
        if (x.start && x.end) svg += '<rect class="pbar" tabindex="0" data-phase="' + esc(x.name) + '" data-status="' + x.status + '" data-late="' + x.lateDays + '" x="' + X(Date.parse(x.start)) + '" y="' + y + '" width="' + Math.max(6, X(Date.parse(x.end)) - X(Date.parse(x.start))) + '" height="20" rx="4" fill="' + PSTAT[x.status][1] + '"><title>' + esc(x.name) + ': ' + PSTAT[x.status][0] + (x.lateDays ? ', ' + x.lateDays + ' days late' : '') + ', ' + x.start + ' to ' + x.end + '</title></rect>';
        else svg += '<rect class="pbar" data-phase="' + esc(x.name) + '" data-status="' + x.status + '" data-late="' + x.lateDays + '" x="' + L + '" y="' + y + '" width="6" height="20" rx="3" fill="var(--none)"><title>no dates</title></rect>'; });
      svg += '<line x1="' + X(td) + '" x2="' + X(td) + '" y1="2" y2="' + (14 + ph.length * 32) + '" stroke="var(--ink)" stroke-dasharray="4 3"/><text x="' + X(td) + '" y="' + (32 + ph.length * 32) + '" text-anchor="middle" fill="var(--ink)" font-size="11" font-weight="700">today</text></svg>';
      body = '<div class="card"><h3>Phases against today</h3>' + svg + '<div class="leg">' + Object.keys(PSTAT).map(function (k) { return '<span><i class="dot" style="background:' + PSTAT[k][1] + '"></i>' + PSTAT[k][0] + '</span>'; }).join('') + '</div></div>' +
        '<div class="card tscroll"><table id="phTable"><thead><tr><th>Phase</th><th>Start</th><th>End</th><th>Planned</th><th>Tasks</th><th>Status</th></tr></thead><tbody>' + ph.map(function (x) { return '<tr data-phase="' + esc(x.name) + '"><td>' + esc(x.name) + '</td><td>' + esc(x.start || '—') + '</td><td>' + esc(x.end || '—') + '</td><td class="n">' + fmt(x.planned) + '</td><td class="n">' + x.tasks + '</td><td>' + PSTAT[x.status][0] + (x.lateDays ? ' · ' + x.lateDays + ' d' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    if (ph.length) {   // §5.58 task bars under their phase; no dates on the server = said so, never drawn from a guess
      var trs = []; ph.forEach(function (x) { (x.taskRows || []).forEach(function (k) { trs.push({ ph: x, k: k }); }); });
      var tdat = trs.filter(function (r) { return r.k.start && r.k.end; });
      if (!trs.length) body += '<div class="card"><h3>Tasks</h3><span class="nodata" data-taskdates="none">this project has no tasks</span></div>';
      else if (!tdat.length) body += '<div class="card"><h3>Tasks</h3><span class="nodata" data-taskdates="none">no task dates on this server (' + trs.length + ' tasks)</span></div>';
      else {
        var u0 = Math.min.apply(null, tdat.map(function (r) { return Date.parse(r.k.start); })), u1 = Math.max.apply(null, tdat.map(function (r) { return Date.parse(r.k.end); })), tdy = Date.parse(TODAY), ulo = Math.min(u0, tdy), uhi = Math.max(u1, tdy), UW = 760, UL = 210, UX = function (t) { return UL + (UW - UL - 10) * (t - ulo) / Math.max(1, uhi - ulo); };
        var tsv = '<svg width="100%" viewBox="0 0 ' + UW + ' ' + (30 + trs.length * 22) + '" role="img" aria-label="Tasks against today">';
        trs.forEach(function (r, i) { var y = 6 + i * 22, k = r.k; tsv += '<text x="0" y="' + (y + 13) + '" fill="var(--ink)" font-size="11.5">' + esc(String(k.name).slice(0, 30)) + '</text>';
          if (k.start && k.end) tsv += '<rect class="tbar" tabindex="0" data-task="' + esc(k.name) + '" data-phase="' + esc(r.ph.name) + '" data-start="' + k.start + '" data-end="' + k.end + '" x="' + UX(Date.parse(k.start)) + '" y="' + y + '" width="' + Math.max(4, UX(Date.parse(k.end)) - UX(Date.parse(k.start))) + '" height="14" rx="3" fill="' + PSTAT[r.ph.status][1] + '"><title>' + esc(k.name) + ': ' + k.start + ' to ' + k.end + '</title></rect>';
          else tsv += '<rect class="tbar" data-task="' + esc(k.name) + '" data-phase="' + esc(r.ph.name) + '" x="' + UL + '" y="' + y + '" width="4" height="14" rx="2" fill="var(--none)"><title>no dates</title></rect>'; });
        tsv += '<line x1="' + UX(tdy) + '" x2="' + UX(tdy) + '" y1="0" y2="' + (8 + trs.length * 22) + '" stroke="var(--ink)" stroke-dasharray="4 3"/></svg>';
        body += '<div class="card" data-taskdates="' + tdat.length + '/' + trs.length + '"><h3>Tasks against today</h3>' + tsv + '<div class="subv">' + tdat.length + ' of ' + trs.length + ' tasks carry dates from the 4D programme</div></div>';
      }
    }
    panel('schedule', body);
    var mxp = Math.max.apply(null, ph.map(function (x) { return Math.max(x.planned, x.committed); }).concat([1]));
    panel('cost', ph.length ? '<div class="card tscroll"><table id="costTable"><thead><tr><th>Phase</th><th>Planned</th><th>Committed</th><th>Share</th></tr></thead><tbody>' + ph.map(function (x) { return '<tr data-phase="' + esc(x.name) + '" data-planned="' + x.planned + '" data-committed="' + x.committed + '"><td>' + esc(x.name) + '</td><td class="n">' + fmt(x.planned) + '</td><td class="n">' + fmt(x.committed) + '</td><td class="bars"><i class="bl" style="width:' + (100 * x.planned / mxp).toFixed(1) + '%"></i>' + (x.committed ? '<i class="bc" style="width:' + (100 * x.committed / mxp).toFixed(1) + '%"></i>' : '') + '</td></tr>'; }).join('') +
      '<tr class="total" data-planned="' + d.totals.phasePlanned + '" data-committed="' + d.totals.phaseCommitted + '"><td>Total</td><td class="n">' + fmt(d.totals.phasePlanned) + '</td><td class="n">' + fmt(d.totals.phaseCommitted) + '</td><td></td></tr></tbody></table><div class="leg"><span><i class="dot" style="background:var(--line)"></i>planned</span><span><i class="dot" style="background:var(--acc)"></i>committed</span></div></div><div class="card"><h3>From the project lines</h3><div class="subv">' + m.lines + ' lines · committed ' + fmt(m.lineCommitted) + ' · invoiced ' + fmt(m.lineInvoiced) + ' · actual cost (project balance) ' + fmt(m.spent) + '</div></div>' : '<div class="card"><span class="nodata">this project has no phases to cost</span></div>');
    var ni = '<span class="nodata" data-notinstalled="1" title="@WHAT@ not readable on this server">no data (not installed)</span>';
    panel('procurement', '<div class="card tscroll">' + (d.orders === null ? ni.replace('@WHAT@', 'Purchase orders are') : d.orders.rows.length ? '<table id="poTable"><thead><tr><th>Order</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>' + d.orders.rows.map(function (o) { return '<tr data-order="' + esc(o.id) + '" data-open="' + (o.open ? 1 : 0) + '"><td>' + esc(o.id) + '</td><td>' + esc(o.status) + '</td><td class="n">' + esc(curInfo(o.cur).ISO_Code) + ' ' + fmt(o.total) + '</td><td>' + (o.open ? '<span class="chip" style="background:var(--warn)">open</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table><div class="subv">' + d.orders.open + ' open of ' + d.orders.rows.length + ' purchase orders · open = not Completed, Closed, Voided or Reversed (proposed)</div>' : '<span class="nodata">this project has no purchase orders</span>') + '</div>');
    panel('documents', '<div class="card tscroll">' + (d.docs === null ? ni.replace('@WHAT@', 'The BIM Document module is') : d.docs.rows.length ? '<table id="docTable"><thead><tr><th>Deliverable</th><th>Name</th><th>Rev</th><th>Status</th></tr></thead><tbody>' + d.docs.rows.map(function (r) { return '<tr data-deliverable="' + esc(r.no) + '" data-rev="' + r.rev + '" data-status="' + esc(r.status) + '"><td>' + esc(r.no) + '</td><td>' + esc(r.name || '') + '</td><td>' + r.rev + '</td><td>' + ({ CO: 'Issued for construction', IP: 'Issued for review', DR: 'Draft', RE: 'Superseded' }[r.status] || esc(r.status)) + '</td></tr>'; }).join('') + '</tbody></table><div class="docsum subv" data-issued="' + d.docs.issued + '" data-total="' + d.docs.total + '">' + d.docs.issued + ' of ' + d.docs.total + ' deliverables issued for construction (latest revision of each)</div>' : '<span class="nodata">no documents are filed against this project</span>') + '</div>');
    v.appendChild(root);
    if (S.refocusTab) { S.refocusTab = false; var sel = root.querySelector('[role=tab][aria-selected=true]'); if (sel) sel.focus(); }
  }

  function projectsTable(cols, rowFn, head) {
    var P = data().projects.filter(function (p) { return passes(p); });
    var v = $('view'); v.innerHTML = '';
    if (!P.length) { v.innerHTML = '<div class="card"><span class="nodata">no data — no C_Project rows match the filters</span></div>'; return; }
    var tb = '<table data-tile="' + head + '"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + P.map(rowFn).join('') + '</tbody></table>';
    v.innerHTML = tb;
  }
  function passesBase(p) { var f = filters(); return (!f.org || String(p.AD_Org_ID) === f.org) && (!f.category || p.ProjectCategory === f.category) && ({ all: 1, active: p.IsActive === 'Y' && p.Processed !== 'Y', closed: p.Processed === 'Y', inactive: p.IsActive !== 'Y' }[f.status]); }
  function passes(p) { var f = filters(); return passesBase(p) && (!f.project || p.Value === f.project); }
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
  // §5.51 (PROPOSED defaults, labelled): Procurement Risks and Handover. Every count opens the projects behind it (§5.49 keys).
  function moneyTxt(m) { var ks = Object.keys(m || {}).sort(); return ks.length ? ks.map(function (k) { return esc(curInfo(k).ISO_Code) + ' ' + (m[k] / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }).join(' · ') : 'no data'; }
  function drow(key, label, flatKey, inner) { return '<div class="row" data-drill="' + key + '"><span>' + label + '</span><b>' + (flatKey ? fl(flatKey, inner) : inner) + '</b></div>'; }
  function procurement() {
    var p = S.res.tiles.procurement, ni = '<span class="nodata" title="Purchase orders are not readable on this server">no data (not installed)</span>';
    var body = drow('proc:openpo', 'Open purchase orders', 'proc_openpo', p.openpo.notinstalled ? ni : (p.openpo.n ? p.openpo.n + ' · ' + moneyTxt(p.openpo.cur) : '0')) +
      drow('proc:overcommitted', 'Over-committed projects', 'proc_overcommitted', p.overcommitted.n) +
      drow('proc:nopo', 'Budget, nothing ordered', 'proc_nopo', p.nopo.notinstalled ? ni : p.nopo.n);
    var v = $('view'); v.innerHTML = ''; var c = card('Procurement Risks (proposed)', body, null); c.setAttribute('data-tile', 'procurement'); c.insertAdjacentHTML('beforeend', ['proc_openpo', 'proc_overcommitted', 'proc_nopo'].map(note).join('')); v.appendChild(c); fillFlat(v);
  }
  function handover() {
    var h = S.res.tiles.handover, d = S.res.tiles.bim_documents;
    var body = h.vacuous ? '<span class="nodata">no data</span>' : drow('handover:ready', 'Ready for handover (every phase complete)', 'handover_ready', h.ready) + drow('handover:done', 'Handed over (closed)', 'handover_done', h.done) +
      '<div class="row"><span>Documents issued for construction</span><b>' + fl('bim_documents', d.notinstalled ? '<span class="nodata">no data (not installed)</span>' : d.vacuous ? '<span class="nodata">no data</span>' : d.issued + ' / ' + d.total) + '</b></div>';
    var v = $('view'); v.innerHTML = ''; var c = card('Handover (proposed)', body, null); c.setAttribute('data-tile', 'handover'); c.insertAdjacentHTML('beforeend', ['handover_ready', 'handover_done'].map(note).join('')); v.appendChild(c); fillFlat(v);
  }
  // one plain sentence under every menu item's page: what this view is for (the film and the guide say the same)
  var LEAD = { dashboard: 'The whole portfolio on one screen. Click any number to see the projects behind it.', projects: 'Every project that passes the filters, with its planned, actual and committed amounts and a link to its BIM model.',
    budget: 'Money per project: planned, committed, invoiced and actual cost, in the project\'s own currency.', procurement: 'Where buying may go wrong (proposed definitions, awaiting the client): open purchase orders, projects committed above budget, budget with nothing ordered.',
    approvals: 'How many workflow approvals are waiting for someone to act (the badge on the menu is this number).', handover: 'How close projects are to being handed over (proposed definitions, awaiting the client): all phases complete, closed, and drawings issued.' };
  function addLead() { var v = $('view'); if (!v || !LEAD[S.view]) return; var p = h('p', 'lead', esc(LEAD[S.view])); p.setAttribute('data-lead', S.view); v.insertBefore(p, v.firstChild); }
  function simple(title, body, k) { var v = $('view'); v.innerHTML = ''; v.appendChild(card(title, body, k)); fillFlat(v); }

  var PROJECT_URL = Q.get('project') || '';   // ?project=<C_Project.Value> pre-selects the Project filter (§15.1, §5.36A); the drop-down is the one place the choice lives
  function filters() { var fp = $('fProject'); return { org: $('fOrg').value, category: $('fCat').value, status: $('fStatus').value, project: fp ? fp.value : '', today: TODAY }; }
  // §5.36A: the Project filter. Blank = All Projects; the options are the projects that pass Org / Category / Status (never one the other filters hide); a selected project that falls out resets to blank.
  //   At the first fill the URL's project is always offered (the old ?project= link keeps working whatever Status says). Both sources apply the same filter through T.compute.
  var _projFirst = true;
  function fillProjects() {
    var d = data(), P = d ? d.projects : [], sel = $('fProject'), want = _projFirst ? PROJECT_URL : sel.value, f0 = $('fProject').value;
    var rows = P.filter(function (p) { var keep = p.Value && passesBase(p); return keep || (_projFirst && PROJECT_URL && p.Value === PROJECT_URL); });
    rows.sort(function (a, b) { return String(a.Value).localeCompare(String(b.Value)); });
    sel.innerHTML = '<option value="">All Projects</option>' + rows.map(function (p) { return '<option value="' + esc(p.Value) + '">' + esc(p.Value) + (p.Name && p.Name !== p.Value ? ' — ' + esc(p.Name) : '') + '</option>'; }).join('');
    var has = rows.some(function (p) { return p.Value === want; }), reset = !!want && !has;
    sel.value = has ? want : '';
    _projFirst = false;
    log('§DASH_PROJSEL source=' + S.cur + ' options=' + rows.length + ' selected=' + (sel.value || '') + ' reset=' + (reset ? 1 : 0) + ' (all projects=' + P.length + ')');
  }
  // §5.49 drill-down: a number on the page opens the projects behind it in a side panel; a project opens the ERP Project window (window 130) on that record
  function openDrill(key, label) { openDrillRows((S.res.drill || {})[key] || [], label, key); }
  function openDrillRows(rows, label, key) {
    var d = $('drill'), f = function (v) { return v == null || v === '' ? '<span class="nodata">—</span>' : (+v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    // the row opens the record in the system the numbers came from: legacy -> its WebUI zoom (AdempiereWebUI.processParameters: Action=Zoom&TableName&Record_ID); twin -> the ERP Project window (130)
    var link = function (r) { return esc(S.cur === 'legacy' ? CFG.legacyUi + '?Action=Zoom&TableName=C_Project&Record_ID=' + r.id : CFG.erpUrl + '?window=130&record=' + r.id); }, page = function (r) { return esc('#project/' + r.id); };
    d.innerHTML = '<div class="dhead"><b>' + esc(label) + '</b> <span class="dn" data-drill-n="' + rows.length + '">' + rows.length + ' project' + (rows.length === 1 ? '' : 's') + '</span><button type="button" id="drillClose" aria-label="Close">×</button></div>' +
      (rows.length ? '<table><thead><tr><th>Project</th><th>Cur</th><th>Approved</th><th>Spent</th><th>Due</th><th>Done</th><th>Health</th><th>Schedule</th><th>Budget</th></tr></thead><tbody>' +
        rows.map(function (r) { return '<tr data-project="' + esc(r.id) + '"><td><a class="open" href="' + page(r) + '" title="Open the project page">' + esc(r.Value) + '</a> <a class="erp" href="' + link(r) + '" title="Open in the ERP (' + esc(S.cur) + ')" target="_blank" rel="noopener">ERP ↗</a><small>' + esc(r.Name || '') + '</small></td><td>' + esc(curInfo(r.cur).ISO_Code || r.cur) + '</td><td>' + f(r.planned) + '</td><td>' + f(r.spent) + '</td><td>' + f(r.due) + '</td><td>' + f(r.done) + '</td><td>' + esc(r.health || '') + '</td><td>' + esc(r.schedule || '') + '</td><td>' + esc(r.budget || '') + '</td></tr>'; }).join('') + '</tbody></table>'
        : '<div class="nodata">no project in this bucket</div>');
    d.hidden = false; d.setAttribute('data-key', key);
    $('drillClose').onclick = function () { d.hidden = true; };
    log('§DASH_DRILL_UI key=' + key + ' rows=' + rows.length + ' label=' + label);
  }
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('#view [data-drill]'); if (!el || ev.target.closest('a')) return;
    var card = el.closest('.card'), lbl = (card ? card.querySelector('h3').textContent : '') + (el.classList.contains('row') ? ' · ' + el.querySelector('span').textContent : '');
    openDrill(el.getAttribute('data-drill'), lbl);
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && $('drill')) $('drill').hidden = true; });
  function render() {
    var d = data(); if (!d) { $('view').innerHTML = '<div class="card"><span class="nodata">no data source loaded</span></div>'; $('foot').textContent = '§DASH_NODATA no source'; return; }
    var f = filters(); S.res = T.compute(d, f); S.flat = T.flatten(S.res.tiles);
    log('§DASH_RENDER source=' + S.cur + ' today=' + TODAY + ' filters=' + JSON.stringify({ org: f.org, category: f.category, status: f.status, project: f.project }) + ' pop=' + JSON.stringify(S.res.pop));
    Object.keys(S.flat).forEach(function (k) { log('§DASH_TILE source=' + S.cur + ' tile=' + k + ' value=' + S.flat[k]); });
    $('lastUpdated').textContent = S.flat.last_updated; $('lastUpdated').setAttribute('data-value', S.flat.last_updated);
    var b = $('badgeApprovals'); b.textContent = S.res.tiles.approvals.n != null ? S.res.tiles.approvals.n : ''; b.setAttribute('data-value', S.flat.approvals);
    ({ dashboard: dashboard, projects: projects, budget: budget,
       procurement: procurement, handover: handover,
       project: projectPage, approvals: function () { var a = S.res.tiles.approvals; simple('Approval Pending', a.inconclusive ? state(a) : '<div class="big">' + fl('approvals', a.n) + '</div>', 'approvals'); } })[S.view](); addLead();
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
    $('src').value = S.cur; $('srcInfo').textContent = S.sources.legacy ? '' : 'Source B (legacy) not loaded';
    fillSelects(); fillProjects(); await probeBim(); runTwin(); render();
    $('src').onchange = function () { S.cur = this.value; fillSelects(); fillProjects(); probeBim().then(render); };
    ['fOrg', 'fCat', 'fStatus'].forEach(function (id) { $(id).onchange = function () { fillProjects(); runTwin(); render(); }; });
    applySkin(); $('fTheme').innerHTML = Object.keys(THEMES).map(function (k) { return '<option value="' + k + '">' + THEMES[k] + '</option>'; }).join(''); $('fSkin').innerHTML = Object.keys(SKINS).map(function (k) { return '<option value="' + k + '">' + SKINS[k] + '</option>'; }).join(''); $('fTheme').value = S.theme; $('fSkin').value = S.skin;
    $('fTheme').onchange = function () { S.theme = $('fTheme').value; remember('theme', S.theme); render(); }; $('fSkin').onchange = function () { S.skin = $('fSkin').value; remember('skin', S.skin); applySkin(); };
    $('fProject').onchange = function () { runTwin(); render(); };
    window.onhashchange = nav; nav();
  }
  function nav() {
    var hs = (location.hash || '#dashboard').slice(1), pm = /^project\/([^/]+)(?:\/([a-z]+))?$/.exec(hs);
    if (pm) { S.view = 'project'; S.projId = pm[1]; S.tab = PTABS.some(function (t) { return t[0] === pm[2]; }) ? pm[2] : 'overview'; }
    else { S.view = hs; if (!{ dashboard: 1, projects: 1, budget: 1, procurement: 1, approvals: 1, handover: 1 }[S.view]) S.view = 'dashboard'; }
    var drl = $('drill'); if (drl) drl.hidden = true;   // navigating closes the panel
    document.body.setAttribute('data-view', S.view);   // the project page hides the portfolio filter bar (it does not apply to one project)
    [].forEach.call(document.querySelectorAll('#nav a'), function (a) { a.classList.toggle('on', a.getAttribute('data-view') === (S.view === 'project' ? 'dashboard' : S.view)); });
    if (data()) render(); else render();
  }
  boot();
})();

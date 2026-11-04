#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PA-RENDER (spec prompts/CAPEX_DASHBOARD.md §5.19, G3). Headless CPU Chromium on the REAL erp/idempiere.html. READ THE LOG: verdict = §PA_RENDER_VERDICT; the exit code is not evidence.
// THE ISSUE it proves/disproves: "the CAPEX dashboard does not reach the twin's own Home through the twin plugin bundle (capex/plugin/capex_dashboard.mjs, its 2Pack generated from the legacy
//   migration scripts): the System Administrator installs + starts it, the next boot restores it, and a GardenWorld user's Performance gadget draws every CAPEX goal = what the twin's one PA owner
//   (erp/goal_engine.js) computes on that page's DB". No core file is involved (EXTENSION-LAYER LAW).
// Read from the page, never from a screenshot: the §PLUGIN / §PACKIN lines, the AD_Package_Imp row, and per CAPEX goal the drawn title / colour (DOM) vs goal_engine.evaluate + the stock title rule
//   (WPerformanceIndicator.init: "<Name>: <percent>%" with a target, else "<Name>: <MeasureActual #,##0>") and MColorSchema colour (dashboard_gadgets.colorOf) on that same DB.
// Break (MUST FAIL): PA_RENDER_BREAK=1 compares each drawn title against the computed value + 1.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
var ROOT = path.join(__dirname, '..', '..'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
var BREAK = process.env.PA_RENDER_BREAK === '1', log = console.log, judged = 0, fails = 0;
function ck(n, ok, info) { judged++; if (!ok) fails++; log('  §PA_RENDER ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info !== undefined ? ' ' + JSON.stringify(info) : '')); }
var server = http.createServer(function (req, res) { var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, function (e, buf) { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }); });
(async function () {
  await new Promise(function (r) { server.listen(0, r); });
  var base = 'http://localhost:' + server.address().port, browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  try {
    var page, logs = [], errs = [];
    var ctx = await browser.newContext();   // ONE browser profile across the sessions (browser.newPage() would give each its own storage: the reboot would not be a reboot)
    var open = async function () { page = await ctx.newPage(); logs = []; errs = [];
      page.on('console', function (m) { var t = m.text(); if (t.indexOf('§') === 0) logs.push(t); }); page.on('pageerror', function (e) { errs.push(String(e)); });
      await page.goto(base + '/erp/idempiere.html', { waitUntil: 'networkidle' }); await page.waitForFunction(function () { return !!window.__idmpDb; }, null, { timeout: 30000 }); };
    var login = async function (client, user) {
      await page.waitForFunction(function () { return document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 20000 });
      await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + client + "'))", { timeout: 6000 }); await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
      await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))", { timeout: 6000 }); await page.waitForSelector('#idmp-login-step2:visible', { timeout: 8000 }); await page.click('#idmp-login-ok'); };
    // 0 — a clean browser (every IndexedDB of the origin: the seed cache AND the plugin store)
    await open();
    await page.evaluate(function () { return indexedDB.databases().then(function (ds) { return Promise.all(ds.map(function (d) { return new Promise(function (r) { var q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; }); })); }); });
    await page.close();
    // 1 — the System Administrator installs the bundle by URL and starts it (the Plugins & Releases console's own calls: plugin_release.js install / start + persist)
    await open(); await login('System', 'System');
    var inst = await page.evaluate(async function (url) {
      var reg = window.PluginEngine && window.PluginEngine._reg && window.PluginEngine._reg(); if (!reg) return { error: 'no plugin engine' };
      var before = reg.list().map(function (b) { return b.id; });
      try { var b = await reg.installBundle(new URL(url, location.href).href); await reg.startBundle(b.id || (b.manifest && b.manifest.id)); await window.PluginEngine.persist(); }
      catch (e) { return { error: e.message, before: before }; }
      return { before: before, after: reg.list().map(function (b) { return b.id + ':' + b.state; }) };
    }, '/capex/plugin/capex_dashboard.mjs');
    var packin = logs.filter(function (l) { return /^§(PACKIN|PLUGIN-START|PLUGIN-INSTALL|CAPEX-PLUGIN)/.test(l); });
    log('§PA_RENDER install ' + JSON.stringify(inst)); packin.slice(0, 6).forEach(function (l) { log('    ' + l.slice(0, 220)); });
    ck('I1 the System Administrator installs + starts org.bimootb.capex (no error)', !inst.error && (inst.after || []).some(function (x) { return /^org\.bimootb\.capex:ACTIVE$/i.test(x); }), inst);
    if (process.env.PA_RENDER_DEBUG) log('  dbg content=' + JSON.stringify(await page.evaluate(function () { var c = document.getElementById('idmp-content'); return { home: !!document.getElementById('idmp-home'), ph: !!document.getElementById('idmp-placeholder'), kids: c ? [].map.call(c.children, function (k) { return k.id || k.className; }).slice(0, 6) : null, text: c ? c.innerText.slice(0, 120) : null }; })));
    if (process.env.PA_RENDER_DEBUG) logs.filter(function (l) { return /PLUGIN|PACK|CAPEX/.test(l); }).forEach(function (l) { log('  dbg1 ' + l.slice(0, 240)); });
    await page.close();
    // 2 — next boot (the plugin restored), a GardenWorld user
    await open(); for (var bw = 0; bw < 60 && !logs.some(function (l) { return /^§PACKIN incremental bundle=org\.bimootb\.capex /.test(l); }); bw++) await new Promise(function (r) { setTimeout(r, 250); });   // the restore logs after networkidle: reading at once failed B1 1 run in 3, on a clean main too
    var bootLogs = logs.slice();
    await login('GardenWorld', 'GardenAdmin');
    if (process.env.PA_RENDER_DEBUG) logs.filter(function (l) { return /PLUGIN|PACK|CAPEX/.test(l); }).forEach(function (l) { log('  dbg2 ' + l.slice(0, 240)); });
    if (process.env.PA_RENDER_DEBUG) logs.filter(function (l) { return /§DASH-HOME|§DASH-ERR|§DASH-GADGET perf|§OPLOG/i.test(l); }).slice(0, 40).forEach(function (l) { log('  dbg ' + l.slice(0, 260)); });
    var R = await page.evaluate(function (brk) {
      var db = window.__idmpDb, q = function (sql, p) { var st = db.prepare(sql), out = []; try { if (p) st.bind(p); while (st.step()) { var o = st.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); out.push(k); } } finally { st.free(); } return out; };
      var A = window.APP || {}, access = window.GoalEngine.accessOf(q, A.roleId, A.clientId), d = new Date(), p2 = function (n) { return ('0' + n).slice(-2); }, today = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
      var reg = q("SELECT name, pk_version AS v, pk_status AS st FROM ad_package_imp WHERE name='org.bimootb.capex'"), goals = q("SELECT * FROM pa_goal WHERE name LIKE 'CAPEX %' AND ad_client_id=11 AND isactive='Y' ORDER BY seqno");
      var drawn = {}; [].forEach.call(document.querySelectorAll('#idmp-home .pi'), function (p) { drawn[p.getAttribute('data-goal-id')] = { title: p.querySelector('.pt').textContent, color: p.getAttribute('data-color'), tip: p.title }; });
      var rows = goals.map(function (g) {
        var r = window.GoalEngine.evaluate(q, g.pa_goal_id, { today: today, access: access }), t = Number(g.measuretarget || 0);
        var v = r.ok ? r.actual + (brk ? 1 : 0) : null, pct = r.ok ? r.percent : null;
        var want = r.ok ? g.name + ': ' + (t !== 0 ? pct + '%' : window.DashboardGadgets.fmtInt(v)) : null;
        return { id: Number(g.pa_goal_id), name: g.name, want: want, wantColor: r.ok ? window.DashboardGadgets.colorOf(q, g.pa_colorschema_id, pct) : null, got: drawn[String(g.pa_goal_id)] || null, err: r.ok ? null : r.reason };
      });
      return { reg: reg, rows: rows, client: A.clientId, role: A.roleId, nDrawn: Object.keys(drawn).length };
    }, BREAK);
    var restore = bootLogs.filter(function (l) { return /^§(PLUGIN-BOOT|PACKIN|PLUGIN-START|CAPEX-PLUGIN)/.test(l); });
    restore.slice(0, 6).forEach(function (l) { log('    boot: ' + l.slice(0, 220)); });
    log('§PA_RENDER session client=' + R.client + ' role=' + R.role + ' indicatorsDrawn=' + R.nDrawn + ' packageImp=' + JSON.stringify(R.reg));
    ck('B1 the next boot restored the active bundle: its pack delta replayed and it started again, with no new pack applied', restore.some(function (l) { return /^§PACKIN-REPLAY bundle=org\.bimootb\.capex /.test(l); }) && restore.some(function (l) { return /^§PACKIN incremental bundle=org\.bimootb\.capex installed=\[1\.0\.0,1\.0\.1,1\.0\.2\] toApply=\[\]/.test(l); }) && restore.some(function (l) { return /^§CAPEX-PLUGIN start/.test(l); }), restore.filter(function (l) { return /capex|CAPEX/.test(l); }));
    ck('B2 AD_Package_Imp records the packs org.bimootb.capex 1.0.0, 1.0.1 and 1.0.2 (PackInHandler)', ['1.0.0', '1.0.1', '1.0.2'].every(function (v) { return R.reg.some(function (r) { return String(r.v) === v; }); }), R.reg);
    ck('B3 the 27 CAPEX goals of the packs (13 of 1.0.0 + 14 of 1.0.1) exist once each in the page DB', R.rows.length === 27 && new Set(R.rows.map(function (r) { return r.name; })).size === 27, R.rows.length);
    R.rows.forEach(function (r) {
      log('    §PA_RENDER goal=' + r.id + ' drawn=' + JSON.stringify(r.got && r.got.title) + ' computed=' + JSON.stringify(r.want) + ' colour drawn=' + (r.got && r.got.color) + ' computed=' + r.wantColor + (r.err ? ' err=' + r.err : ''));
      ck('R ' + r.name + ' drawn == goal_engine (title + colour)', !!r.got && r.want != null && r.got.title === r.want && r.got.color === r.wantColor, { drawn: r.got && r.got.title, computed: r.want });
    });
    ck('P no page errors', errs.length === 0, errs.slice(0, 3));
  } catch (e) { ck('flow', false, String(e && e.message || e)); }
  finally { await browser.close(); server.close(); }
  var verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  log('§PA_RENDER_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (PA_RENDER_BREAK=1: FAIL expected)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})();

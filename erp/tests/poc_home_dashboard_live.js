// W-HOME-DASHBOARD-LIVE — the Home dashboard in the REAL idempiere.html after login (headless CPU). ⚠ DO NOT REMOVE — spec bim-compiler prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY D2c.
// READ THE LOG: §HDL-CHECK lines. ISSUE it proves/disproves: after login the user lands on the legacy Home - the gadget set and order equal what MDashboardContentAccess.get + DashboardController select for
//   that user/role (oracle scripts/bridge/dashboard_select_legacy.js: GardenAdmin 8 main + 2 side, System 5 main + 2 side); the Performance gadget shows the 4 goals with a title, a tooltip and a colour; EVERY
//   other selected gadget is visible as a named "Not ported yet" panel AND carries a §DASH-UNPORTED log line - zero silent drops. Data values (percent) are NOT compared to the pilot here: the browser seed's invoices differ
//   from the pilot's; the values are proven in witness_goal_engine / witness_dashboard_performance.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
var ROOT = path.join(__dirname, '..', '..'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
var DST = JSON.parse(fs.readFileSync(process.env.DST_ORACLE || '/home/red1/bim-compiler/scripts/bridge/out/docstatus_legacy.json', 'utf8'));
var ORA = JSON.parse(fs.readFileSync(process.env.DS_ORACLE || '/home/red1/bim-compiler/scripts/bridge/out/dashboard_select_legacy.json', 'utf8'));
var server = http.createServer(function (req, res) { var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, function (e, buf) { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }); });
var fails = 0, judged = 0; function ck(ok, what, info) { judged++; if (!ok) fails++; console.log('  §HDL-CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + what + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  await new Promise(function (r) { server.listen(0, r); });
  var base = 'http://localhost:' + server.address().port, browser = await chromium.launch({ args: ['--no-sandbox'] });
  async function session(clientName, userName, expectCase) {
    var page = await browser.newPage(), logs = [], errs = [];
    page.on('console', function (m) { var t = m.text(); if (t.indexOf('§') === 0) logs.push(t); }); page.on('pageerror', function (e) { errs.push(String(e)); });
    await page.goto(base + '/erp/idempiere.html', { waitUntil: 'networkidle' });
    await page.evaluate(function () { return new Promise(function (r) { var q = indexedDB.deleteDatabase('erp_cache'); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; }); });
    await page.goto(base + '/erp/idempiere.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(function () { return !!window.__idmpDb; }, null, { timeout: 30000 });
    await page.waitForFunction(function () { return document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 20000 });
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + clientName + "'))", { timeout: 6000 }); await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + userName + "'))", { timeout: 6000 }); await page.waitForSelector('#idmp-login-step2:visible', { timeout: 8000 }); await page.click('#idmp-login-ok');
    await page.waitForSelector('#idmp-home', { timeout: 15000 }).catch(function () {});
    var dom = await page.evaluate(function () {
      var cols = [].map.call(document.querySelectorAll('#idmp-home .idmp-hcol'), function (c) { return [].map.call(c.querySelectorAll('.idmp-gadget'), function (g) { return { id: Number(g.getAttribute('data-gadget-id')), name: g.getAttribute('data-gadget-name'), kind: g.getAttribute('data-gadget-kind'), text: g.querySelector('.gb').textContent.slice(0, 40) }; }); });
      var ds = [].map.call(document.querySelectorAll('#idmp-home .ds'), function (d) { return { id: Number(d.getAttribute('data-ds-id')), name: d.querySelector('.dl').textContent, count: d.getAttribute('data-ds-count') }; });
      var perf = [].map.call(document.querySelectorAll('#idmp-home .pi'), function (p) { return { goal: Number(p.getAttribute('data-goal-id')), title: p.querySelector('.pt').textContent, tip: p.title, color: p.getAttribute('data-color') }; });
      return { present: !!document.getElementById('idmp-home'), cols: cols, perf: perf, ds: ds, placeholderHidden: (document.getElementById('idmp-placeholder') || {}).style && document.getElementById('idmp-placeholder').style.display === 'none' };
    });
    var flat = [].concat.apply([], dom.cols), want0 = ORA.cases.filter(function (c) { return c.name.indexOf(expectCase) === 0; })[0];
    var empty = logs.filter(function (l) { return l.indexOf('§DASH-EMPTY') === 0; }).map(function (l) { return Number(/id=(\d+)/.exec(l)[1]); });   // legacy detaches a lazy gadget that has nothing to show (DashboardController.java:483-492)
    var want = { name: want0.name, side: want0.side, detail: want0.detail, main: want0.main.filter(function (id) { return empty.indexOf(id) < 0; }) };
    ck(empty.every(function (id) { return want0.detail.filter(function (d) { return d.id === id; })[0].zul.indexOf('performance.zul') >= 0; }), expectCase + ': only the Performance gadget may be detached as empty (' + (empty.join(',') || 'none') + ')', empty);
    var wantNames = want.main.map(function (id) { return want.detail.filter(function (d) { return d.id === id; })[0].name; });
    ck(dom.present && flat.length === want.main.length, expectCase + ': Home shows ' + want.main.length + ' gadgets (main dashboard)', { got: flat.length });
    ck(JSON.stringify(flat.map(function (g) { return g.id; })) === JSON.stringify(want.main), expectCase + ': gadget ids in legacy column/line order', { got: flat.map(function (g) { return g.id; }), want: want.main });
    ck(JSON.stringify(flat.map(function (g) { return g.name; })) === JSON.stringify(wantNames), expectCase + ': gadget names ' + wantNames.join(' | '), flat.map(function (g) { return g.name; }));
    var unp = logs.filter(function (l) { return l.indexOf('§DASH-UNPORTED') === 0; }), nonPerfMain = flat.filter(function (g) { return g.kind !== 'performance' && g.kind !== 'docstatus'; });
    ck(nonPerfMain.every(function (g) { return /Not ported yet/.test(g.text) && unp.some(function (l) { return l.indexOf('id=' + g.id + ' ') > 0 && l.indexOf('placement=main') > 0; }); }), expectCase + ': every main gadget other than performance / docstatus is a named "Not ported yet" panel with a §DASH-UNPORTED line (zero silent drops)', unp.slice(0, 3));
    ck(want.side.every(function (id) { return unp.some(function (l) { return l.indexOf('id=' + id + ' ') > 0 && l.indexOf('placement=side') > 0; }); }), expectCase + ': side-panel gadgets (' + want.side + ') each named in a §DASH-UNPORTED line', unp.map(function (l) { return l.slice(0, 60); }));
    var hasPerf = flat.some(function (g) { return g.kind === 'performance'; });
    if (!hasPerf) ck(empty.length === 1 && dom.perf.length === 0, expectCase + ': no goals for this client -> the Performance gadget is detached, not shown empty', { empty: empty });
    if (hasPerf) ck(dom.perf.length === 4 && dom.perf.every(function (p) { return /^[^:]+: (\d+%|[\d,]+)$/.test(p.title) && /^#[0-9a-f]{6}$/.test(p.color) && p.tip; }) && new Set(dom.perf.map(function (p) { return p.goal; })).size === 4, expectCase + ': Performance gadget = 4 indicators with title, tooltip and colour', dom.perf);
    var dcase = DST.cases.filter(function (c) { return c.name.indexOf(expectCase) === 0; })[0], wantDs = dcase.indicators.filter(function (i) { return i.shown; }).map(function (i) { return i.name; });
    // HARNESS: the indicators shown are the legacy ones in legacy order; FINDING: the System tenant overlay carries no role-0 form/process access (SYSTEM_ADMIN_LANE keeps it minimal), so an indicator that
    // legacy opens through a FORM (Workflow Activities, form 117) is missing there - named below, never hidden.
    var gotNames = dom.ds.map(function (d) { return d.name; }), missingDs = wantDs.filter(function (n) { return gotNames.indexOf(n) < 0; });
    missingDs.forEach(function (n) { console.log('§DASH-GAP case=' + expectCase + ' indicator="' + n + '" shown on legacy, absent here: the twin dictionary lacks the role access it needs (AD_Form_Access role 0 / form 117)'); });
    var subseq = gotNames.every(function (n) { return wantDs.indexOf(n) >= 0; }) && JSON.stringify(gotNames) === JSON.stringify(wantDs.filter(function (n) { return gotNames.indexOf(n) >= 0; }));
    ck(subseq && dom.ds.every(function (d) { return /^\d+$/.test(d.count); }) && (expectCase === 'System' ? missingDs.length <= 1 : missingDs.length === 0), expectCase + ': Activities gadget = the legacy indicators in legacy order with numeric counts' + (missingDs.length ? ' (missing, reported as §DASH-GAP: ' + missingDs.join(',') + ')' : ' (' + wantDs.length + ' of ' + wantDs.length + ')'), { got: dom.ds, missing: missingDs });
    ck(errs.length === 0, expectCase + ': no page errors', errs.slice(0, 2));
    await page.close();
  }
  try { await session('GardenWorld', 'GardenAdmin', 'GardenAdmin'); await session('System', 'System', 'System'); } catch (e) { ck(false, 'flow', String(e.message).slice(0, 200)); }
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; console.log('§HDL-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails);
  await browser.close(); server.close(); process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§HDL-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });

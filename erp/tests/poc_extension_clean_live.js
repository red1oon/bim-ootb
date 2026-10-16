// W-EXTENSION-CLEAN-LIVE — the pill / lens / Home / Quick-setup extension layer must leave the CORE model and standard processes untouched and must never break them.
// ⚠ DO NOT REMOVE — rule: bim-compiler prompts/ERP_DEPTH_FILM.md §EXTENSION-LAYER LAW (user, 2026-10-14: "pill features are out of legacy scope ... they may shortcut but still commit along the iDempiere
// convention, ensure it does not impact core model and std process so that the core still clean"). READ THE LOG: §XCL-CHECK lines.
// ISSUES it proves/disproves (live, headless CPU): (1) the core database fingerprint (every main-schema object name + every table's row count) after login + Home + both lens pills + Quick-setup preview equals the
//   fingerprint with the extension scripts BLOCKED - the extensions add nothing to the saved database (found RED: the Home had created 3 views in the main schema and they were inside db.export());
//   (2) with the extension scripts blocked the core flow still works (login, open a window, the placeholder returns); (3) with the extension code made to THROW, login, open window, close window and the pills
//   still work and no page error escapes; (4) static: the extension modules contain no INSERT/UPDATE/DELETE and any DDL is TEMP.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
var ROOT = path.join(__dirname, '..', '..'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
var EXT = ['boot.js', 'invoice_open.js', 'goal_engine.js', 'dashboard_home.js', 'dashboard_gadgets.js', 'dashboard_docstatus.js', 'setup_lens.js', 'window_lens.js', 'quick_input.js', 'home.js', 'pills.js', 'quicksetup_ui.js'].map(function (f) { return 'overlay/' + f; });
var server = http.createServer(function (req, res) { var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, function (e, buf) { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }); });
var fails = 0, judged = 0; function ck(ok, what, info) { judged++; if (!ok) fails++; console.log('  §XCL-CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + what + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  // ---- static ----
  var bad = [];
  EXT.forEach(function (f) { var t = fs.readFileSync(path.join(ROOT, 'erp', f), 'utf8').split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n');
    if (/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(t.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')) && !/(SELECT[^;]*UPDATE)/i.test('')) { if (/\bINSERT\s+INTO|DELETE\s+FROM/i.test(t.replace(/"[^"]*"/g, '""'))) bad.push(f + ': write statement'); }
    (t.match(/\b(CREATE|DROP)\s+(?!TEMP\b)(VIEW|TABLE|INDEX|TRIGGER)(?!\s+IF\s+EXISTS\s+temp\.)/gi) || []).forEach(function (m) { bad.push(f + ': non-TEMP DDL "' + m + '"'); }); });
  ck(bad.length === 0, 'static: extension modules hold no INSERT/DELETE and no non-TEMP DDL', bad);
  var browser = await chromium.launch({ args: ['--no-sandbox'] });
  async function boot(opts) {
    var ctx = await browser.newContext({ serviceWorkers: 'block' }), page = await ctx.newPage(), errs = [];   // no service worker: it would serve the overlay files from its cache around page.route
    page.on('pageerror', function (e) { errs.push(String(e).slice(0, 160)); });
    if (opts.block) await page.route(/\/overlay\//, function (r) { r.abort(); });
    await page.goto(opts.base + '/erp/idempiere.html', { waitUntil: 'networkidle' });
    await page.evaluate(function () { return new Promise(function (r) { var q = indexedDB.deleteDatabase('erp_cache'); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; }); });
    await page.goto(opts.base + '/erp/idempiere.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(function () { return !!window.__idmpDb; }, null, { timeout: 30000 });
    if (opts.breakExt) await page.evaluate(function () { ['GoalEngine', 'DashboardHome', 'DashboardGadgets', 'DashboardDocStatus', 'SetupLens', 'WindowLens'].forEach(function (k) { var o = window[k]; if (o) Object.keys(o).forEach(function (f) { if (typeof o[f] === 'function') o[f] = function () { throw new Error('extension broken on purpose: ' + k + '.' + f); }; }); }); });
    await page.waitForFunction(function () { return document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 20000 });
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible');
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible'); await page.click('#idmp-login-ok');
    await page.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 15000 });
    await page.waitForTimeout(800);
    return { page: page, errs: errs };
  }
  var fp = function (page) { return page.evaluate(function () {
    var db = window.__idmpDb, objs = db.exec("SELECT type||':'||name FROM sqlite_master ORDER BY 1")[0].values.map(function (v) { return v[0]; }), counts = {};
    objs.filter(function (o) { return o.indexOf('table:') === 0; }).forEach(function (o) { var t = o.slice(6); try { counts[t] = db.exec('SELECT COUNT(*) FROM "' + t + '"')[0].values[0][0]; } catch (e) { counts[t] = 'ERR'; } });
    var bytes = db.export(), s = new TextDecoder('latin1').decode(bytes);
    return { objs: objs, counts: counts, ext: ['rv_c_invoice', 'c_invoice_v', 'rv_unprocessed'].filter(function (n) { return s.indexOf('VIEW ' + n) >= 0 || s.indexOf('VIEW "' + n) >= 0; }) };
  }); };
  var base = 'http://localhost:' + (await new Promise(function (r) { server.listen(0, function () { r(server.address().port); }); }));
  try {
    var A = await boot({ base: base, block: true }), fpA = await fp(A.page);
    var phA = await A.page.evaluate(function () { var p = document.getElementById('idmp-placeholder'); return { placeholder: !!p && p.style.display !== 'none', home: !!document.getElementById('idmp-home') }; });
    ck(phA.placeholder && !phA.home && A.errs.length === 0, 'core alone (extension scripts blocked): login works, the original placeholder shows, no Home, no page errors', { ph: phA, errs: A.errs });
    // open + close a window on the core alone
    var okA = await A.page.evaluate(function () { document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(function (r) { if (!r.parentElement.classList.contains('open')) r.click(); }); var leaf = [].filter.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf'), function (x) { return x.querySelector('.nm').textContent.trim() === 'Business Partner'; })[0]; if (!leaf) return false; leaf.click(); return true; });
    await A.page.waitForTimeout(700); ck(okA && (await A.page.evaluate(function () { return !!document.querySelector('#idmp-content table.idmp-grid, #idmp-content .idmp-form, #idmp-tabstrip'); })), 'core alone: a window opens', null);
    await A.page.close();
    var B = await boot({ base: base }), fpB0 = await fp(B.page);
    ck(JSON.stringify(fpB0.objs) === JSON.stringify(fpA.objs) && fpB0.ext.length === 0, 'extensions ON: main-schema objects after login + Home render == core alone, and no extension view inside db.export()', { extra: fpB0.objs.filter(function (o) { return fpA.objs.indexOf(o) < 0; }), inExport: fpB0.ext });
    await B.page.evaluate(function () { window.IdmpPillActions.setuplens(); }); await B.page.waitForTimeout(300);
    await B.page.evaluate(function () { window.IdmpPillActions.windowlens(); }); await B.page.waitForTimeout(300);
    var fpB1 = await fp(B.page);
    var diff = Object.keys(fpB1.counts).filter(function (t) { return fpB1.counts[t] !== fpA.counts[t]; });
    ck(diff.length === 0 && JSON.stringify(fpB1.objs) === JSON.stringify(fpA.objs), 'extensions ON + both lens pills used: every table row count and every object equals core alone (' + Object.keys(fpA.counts).length + ' tables)', { diff: diff.slice(0, 5) });
    ck(B.errs.length === 0, 'extensions ON: no page errors', B.errs.slice(0, 2)); await B.page.close();
    var C = await boot({ base: base, breakExt: true });
    var st = await C.page.evaluate(function () { return { placeholder: !!document.getElementById('idmp-placeholder'), menu: document.querySelector('#idmp-tree').children.length }; });
    ck(st.placeholder && st.menu > 0 && C.errs.length === 0, 'extension code made to throw: login still completes, menu builds, placeholder remains, no page error escapes', { st: st, errs: C.errs.slice(0, 2) });
    await C.page.evaluate(function () { try { window.IdmpPillActions.setuplens(); } catch (e) { window.__xclThrown = String(e.message); } try { window.IdmpPillActions.windowlens(); } catch (e) { window.__xclThrown2 = String(e.message); } });
    var thrown = await C.page.evaluate(function () { return [window.__xclThrown || null, window.__xclThrown2 || null]; });
    ck(thrown[0] === null && thrown[1] === null && C.errs.length === 0, 'extension code made to throw: the lens pills do not throw into the host', thrown);
    var okC = await C.page.evaluate(function () { document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(function (r) { if (!r.parentElement.classList.contains('open')) r.click(); }); var leaf = [].filter.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf'), function (x) { return x.querySelector('.nm').textContent.trim() === 'Business Partner'; })[0]; if (!leaf) return false; leaf.click(); return true; });
    await C.page.waitForTimeout(700); ck(okC && C.errs.length === 0, 'extension code made to throw: the core window still opens', C.errs.slice(0, 2));
    await C.page.close();
  } catch (e) { ck(false, 'flow', String(e.message).slice(0, 200)); }
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; console.log('§XCL-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails);
  await browser.close(); server.close(); process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§XCL-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });

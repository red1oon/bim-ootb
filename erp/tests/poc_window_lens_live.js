// SPDX-License-Identifier: GPL-2.0-only
// W-WINDOW-LENS-LIVE — the Window anatomy pill in the REAL idempiere.html (headless CPU). ⚠ DO NOT REMOVE — spec bim-compiler prompts/ERP_DEPTH_FILM.md §WINDOW-LENS. READ THE LOG: §WLL-CHECK lines.
// ISSUE it proves/disproves: what the USER SEES (the rendered tab strip of an opened window) == what the lens says the window is made of (tab count + names). A window where they differ is a dictionary-vs-UI
//   gap (AD-LAYER LAW item 3: witness the rendered result, sweep the dictionary). Sample = every Nth active window that the menu lets GardenAdmin open, capped; INCONCLUSIVE if < 10 judged.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
var ROOT = path.join(__dirname, '..', '..'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
var server = http.createServer(function (req, res) { var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, function (e, buf) { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }); });
var fails = 0, judged = 0; function ck(ok, what, info) { judged++; if (!ok) fails++; console.log('  §WLL-CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + what + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  await new Promise(function (r) { server.listen(0, r); });
  var base = 'http://localhost:' + server.address().port, logs = [], errs = [];
  var browser = await chromium.launch({ args: ['--no-sandbox'] }), page = await browser.newPage();
  page.on('console', function (m) { var t = m.text(); if (t.indexOf('§') === 0) logs.push(t); }); page.on('pageerror', function (e) { errs.push(String(e)); });
  await page.goto(base + '/erp/idempiere.html', { waitUntil: 'networkidle' });
  await page.evaluate(function () { return new Promise(function (r) { var q = indexedDB.deleteDatabase('erp_cache'); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; }); });
  await page.goto(base + '/erp/idempiere.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.__idmpDb; }, null, { timeout: 30000 });
  await page.waitForFunction(function () { return document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 20000 });
  var res = { rows: [] };
  try {
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))", { timeout: 6000 }); await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))", { timeout: 6000 }); await page.waitForSelector('#idmp-login-step2:visible', { timeout: 8000 }); await page.click('#idmp-login-ok');
    await page.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 10000 });
    // 0. no window open -> the pill says so (nothing invented)
    await page.evaluate(function () { window.IdmpPillActions.windowlens(); }); await page.waitForTimeout(300);
    var msg0 = await page.evaluate(function () { return document.querySelector('.idmp-ovl-pane') ? document.querySelector('.idmp-ovl-pane').textContent : ''; });
    ck(/Open a window first/.test(msg0), 'no window open: the pill says "Open a window first"', msg0.slice(0, 80));
    // windows the role can open = the menu's window leaves; sample by clicking leaves
    await page.evaluate(function () { document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(function (r) { if (!r.parentElement.classList.contains('open')) r.click(); }); });
    var n = await page.$$eval('#idmp-tree .idmp-row.leaf', function (e) { return e.length; }), pick = [];
    for (var i = 0; i < n && pick.length < 40; i += Math.max(1, Math.floor(n / 40))) pick.push(i);
    for (var k = 0; k < pick.length; k++) {
      var info = await page.evaluate(function (ix) { var r = document.querySelectorAll('#idmp-tree .idmp-row.leaf')[ix]; return { name: r.querySelector('.nm').textContent.trim() }; }, pick[k]);
      await page.evaluate(function (ix) { document.querySelectorAll('#idmp-tree .idmp-row.leaf')[ix].click(); }, pick[k]); await page.waitForTimeout(450);
      var strip = await page.evaluate(function () { var s = document.getElementById('idmp-tabstrip'); return s && s.style.display !== 'none' ? [].map.call(s.children, function (c) { return c.textContent.trim(); }) : null; });
      if (!strip) continue;   // a process / form / report leaf, not a window
      await page.evaluate(function () { window.IdmpPillActions.windowlens(); });
      var lens = await page.evaluate(function () { var r = {}; document.querySelectorAll('[data-windowlens-row]').forEach(function (e) { r[e.getAttribute('data-windowlens-row')] = e.querySelector('.sub').textContent; }); var h = document.querySelector('.idmp-ovl-pane .sub'); return { rows: r, head: h ? h.textContent : '' }; });
      var m = /(\d+) tabs/.exec(lens.head), lt = m ? +m[1] : -1, names = (lens.rows.tabs || '').split(' — ')[0].replace(/^\d+:\s*/, '').split(' › ').map(function (x) { return x.replace(/\(L\d+\)$/, ''); });
      res.rows.push({ leaf: info.name, rendered: strip.length, lens: lt, same: strip.length === lt && JSON.stringify(strip) === JSON.stringify(names), strip: strip, names: names });
      await page.evaluate(function () { /* leave the pane; the next leaf click re-opens a window */ });
    }
    // Project window (130): legacy has 8 tabs incl. the pilot's BIM tab (G-WL1, mirrored in patches/ad_seed.db.sql)
    var pj = await page.evaluate(function () { var r = [].filter.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf'), function (x) { return x.querySelector('.nm').textContent.trim() === 'Project'; })[0]; if (!r) return false; r.click(); return true; });
    if (!pj) console.log('§WLL project-window INCONCLUSIVE (no "Project" menu leaf for this role)');
    else {
      await page.waitForTimeout(600);
      var pstrip = await page.evaluate(function () { var s = document.getElementById('idmp-tabstrip'); return s ? [].map.call(s.children, function (c) { return c.textContent.trim(); }) : []; });
      await page.evaluate(function () { window.IdmpPillActions.windowlens(); });
      var phead = await page.evaluate(function () { var h = document.querySelector('.idmp-ovl-pane .sub'); return h ? h.textContent : ''; });
      ck(pstrip.length === 8 && pstrip.indexOf('BIM') >= 0 && /8 tabs/.test(phead), 'Project window renders 8 tabs including BIM, lens agrees (legacy: 8)', { strip: pstrip, head: phead });
    }
  } catch (e) { errs.push('flow: ' + e.message); }
  var bad = res.rows.filter(function (r) { return !r.same; });
  console.log('§WLL sampled windows=' + res.rows.length + ' same=' + (res.rows.length - bad.length) + ' differ=' + bad.length);
  bad.slice(0, 8).forEach(function (r) { console.log('§WLL-GAP leaf="' + r.leaf + '" rendered=' + r.rendered + ' ' + JSON.stringify(r.strip) + ' lens=' + r.lens + ' ' + JSON.stringify(r.names)); });
  ck(res.rows.length >= 10, 'enough windows sampled to judge (>=10)', res.rows.length);
  ck(bad.length === 0, 'rendered tab strip == lens tab list for every sampled window', bad.slice(0, 3).map(function (r) { return r.leaf; }));
  ck(errs.length === 0, 'no page errors / flow errors', errs.slice(0, 3));
  logs.filter(function (l) { return /WINDOW-LENS/.test(l); }).slice(0, 3).forEach(function (l) { console.log('  ' + l.slice(0, 220)); });
  var v = !res.rows.length ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; console.log('§WLL-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails);
  await browser.close(); server.close(); process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§WLL-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });

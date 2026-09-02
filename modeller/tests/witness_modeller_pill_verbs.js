#!/usr/bin/env node
/**
 * W-UX-VERBS — headless witness for the pill-rail verbs (RESUME_MODELLER_UX_OUTLINER_PILL §W-UX-5).
 *   • UserGuide  — NEW pill #b-guide opens a self-contained modeller guide overlay (the gap this slice fills)
 *   • 3D Grid    — #b-grid pill is present + enabled; clicking toggles the grid datums (already shipped)
 *   • Export — #b-export pill present + enabled (the ONE export menu: Native .db / IFC / BCF)
 *   • History    — the #hist-slider timeline surface is present (already shipped)
 * Every #bar button auto-joins the rail + the ? help registry, so these are all discoverable pills.
 * Pure-UI wiring gate; serves viewer/ only (no building DB needed).
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('playwright');

var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };

function serve() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      var fp = path.join(ROOT, p === '/' ? 'modeller/modeller.html' : p);
      fs.readFile(fp, function (e, buf) {
        if (e) { res.statusCode = 404; return res.end('nf'); }
        res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        res.end(buf);
      });
    });
    srv.listen(0, function () { resolve(srv); });
  });
}

(async function () {
  var srv = await serve();
  var port = srv.address().port;
  var logs = [];
  var browser = await chromium.launch();
  var page = await browser.newPage();
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });

  await page.goto('http://localhost:' + port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(function () { return window.__sceneReady === true; }, { timeout: 20000 }).catch(function () {});
  await page.waitForTimeout(300);

  var pass = 0, fail = 0;
  function chk(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); } else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); } }
  console.log('═══ W-UX-VERBS — pill rail verbs (headless) ═══');

  var present = await page.evaluate(function () {
    function btn(id) { var b = document.getElementById(id); return b ? { exists: true, disabled: b.disabled, inBar: b.closest('#bar') != null } : { exists: false }; }
    return { guide: btn('b-guide'), grid: btn('b-grid'), exp: btn('b-export'), open: btn('b-open'),
      hist: !!document.getElementById('hist-slider') };
  });
  chk('D1 UserGuide pill #b-guide present in the rail', present.guide.exists && present.guide.inBar);
  chk('D2 3D Grid pill #b-grid present + enabled', present.grid.exists && present.grid.inBar && !present.grid.disabled, 'disabled=' + present.grid.disabled);
  chk('D3 Export pill #b-export present + enabled (the one Export menu, ex #b-ifc/#b-bcf)', present.exp.exists && present.exp.inBar && !present.exp.disabled, 'disabled=' + present.exp.disabled);
  chk('D4 History timeline (#hist-slider) present', present.hist);

  // UserGuide overlay opens with the real sections
  await page.click('#b-guide');
  await page.waitForTimeout(150);
  var guide = await page.evaluate(function () {
    var p = document.getElementById('m-guide-panel');
    if (!p || p.style.display !== 'block') return { open: false };
    var secs = [].slice.call(p.querySelectorAll('.mg-sec')).map(function (d) { return (d.firstChild && d.firstChild.textContent || '').trim(); });
    return { open: true, count: secs.length, secs: secs };
  });
  chk('D5 Guide overlay opens with the modeller verb sections', guide.open && guide.count === 7, 'sections=' + guide.count);
  chk('D6 Guide covers Open + Disc=walker + 3D Grid', guide.open && guide.secs.indexOf('Open') >= 0 &&
    guide.secs.indexOf('Disc = walker') >= 0 && guide.secs.indexOf('3D Grid') >= 0, (guide.secs || []).join(' · '));

  // 3D Grid pill toggles the datums
  var beforeGrid = await page.evaluate(function () { return !!(window.Bonsai && window.Bonsai.grid && window.Bonsai.grid.active); });
  await page.click('#b-grid');
  await page.waitForTimeout(150);
  var afterGrid = await page.evaluate(function () { return !!(window.Bonsai && window.Bonsai.grid && window.Bonsai.grid.active); });
  chk('D7 3D Grid pill toggles grid.active', beforeGrid !== afterGrid, 'before=' + beforeGrid + ' after=' + afterGrid);

  var guideLogged = logs.some(function (l) { return /§MODELLER-GUIDE open=true/.test(l); });
  chk('D8 §MODELLER-GUIDE logged', guideLogged);
  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('D9 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  console.log('W-UX-VERBS: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();

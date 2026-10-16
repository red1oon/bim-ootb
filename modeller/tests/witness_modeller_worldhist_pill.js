#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MODELLER-WORLDHIST: headless-Chrome witness for the Modeller "W" pill wiring
 * (prompts/RESUME_WORLD_HISTORY_DEDUP_RESTORE.md's 4-step handoff, finally picked up). Drives the REAL
 * production stack (modeller.html -> common/whole_history.js -> common/history_bar.js ->
 * modeller_history.js -> str_walker_outliner.js's _openBuffer), not a reimplementation.
 * Read the log after every run — exit code alone is not evidence.
 *
 * Checks:
 *   W1 whole_history.js loads + WholeHistory.mount() fires for page=modeller (§WHOLE-MOUNT logged)
 *   W2 #b-worldhist pill present in the #bar rail, enabled
 *   W3 clicking #b-worldhist opens the World History panel (#whole-hist-panel.show)
 *   W4 clicking it again closes the panel (toggleOpen)
 *   W5 opening a resident (SampleHouse) fires ONE BUILDING_OPEN doc-event into the SHARED cross-page
 *      log (localStorage['bim.docHistory']) with page==='modeller' — the actual gap this closes: before
 *      this wiring, whole_history.js was never loaded in Modeller, so the mirror silently had nowhere to
 *      write and no card ever showed up for a Modeller building-open.
 *   W6 re-opening the panel afterward renders that modeller row (pageLabel 'Modeller')
 *   W7 no script LOAD_FAIL / pageerror
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

// Same readiness gate as witness_modeller_git_history.js's openResident.
async function openResident(page, key) {
  await page.click('#b-open');
  await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="' + key + '"]');
  await page.waitForFunction(function () {
    var t = window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree && window.BOMTreeOutliner._currentTree();
    return !!t && Object.keys(t.nodes).some(function (id) { return t.nodes[id].kind === 'disc'; });
  }, null, { timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(500);
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
  await page.waitForFunction(function () { return window.__sceneReady === true && !!window.SQL; }, { timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(300);

  var pass = 0, fail = 0;
  function chk(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); } else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); } }
  console.log('═══ W-MODELLER-WORLDHIST — the “W” pill wiring (headless, SampleHouse) ═══');

  var mountLogged = logs.some(function (l) { return /§WHOLE-MOUNT page=modeller/.test(l); });
  chk('W1 §WHOLE-MOUNT page=modeller logged (whole_history.js loaded + mounted)', mountLogged);

  var present = await page.evaluate(function () {
    var b = document.getElementById('b-worldhist');
    return b ? { exists: true, disabled: b.disabled, inBar: b.closest('#bar') != null } : { exists: false };
  });
  chk('W2 #b-worldhist pill present in the rail, enabled', present.exists && present.inBar && !present.disabled,
    JSON.stringify(present));

  await page.click('#b-worldhist');
  await page.waitForTimeout(200);
  var openedNow = await page.evaluate(function () {
    var p = document.getElementById('whole-hist-panel');
    return !!(p && p.classList.contains('show'));
  });
  chk('W3 click opens #whole-hist-panel', openedNow);

  // Close via the panel's own X button — the panel is a full-viewport modal (z-index 61 > #bar's 11),
  // so it correctly COVERS the pill itself; closing is by design via #whole-hist-x or a backdrop click,
  // never by re-clicking the now-covered trigger (same contract as idempiere/glassbowl/gravity).
  await page.click('#whole-hist-x');
  await page.waitForTimeout(200);
  var closedNow = await page.evaluate(function () {
    var p = document.getElementById('whole-hist-panel');
    return !(p && p.classList.contains('show'));
  });
  chk('W4 the panel\'s own X button closes it (toggleOpen)', closedNow);

  // Baseline: how many modeller rows exist in the shared log BEFORE opening a resident (should be 0 —
  // a fresh page + fresh localStorage per test run).
  var before = await page.evaluate(function () {
    try { return (JSON.parse(localStorage.getItem('bim.docHistory') || '[]')).filter(function (e) { return e.page === 'modeller'; }).length; } catch (e) { return -1; }
  });

  await openResident(page, 'SampleHouse');
  await page.waitForTimeout(300);

  var after = await page.evaluate(function () {
    try { return JSON.parse(localStorage.getItem('bim.docHistory') || '[]'); } catch (e) { return []; }
  });
  var modellerRows = after.filter(function (e) { return e.page === 'modeller'; });
  chk('W5 opening SampleHouse writes exactly ONE modeller BUILDING_OPEN row into the shared cross-page log',
    before === 0 && modellerRows.length === 1 && modellerRows[0].kind === 'op',
    'before=' + before + ' after=' + modellerRows.length + ' row=' + JSON.stringify(modellerRows[0]));

  await page.click('#b-worldhist');
  await page.waitForTimeout(200);
  var rendered = await page.evaluate(function () {
    var body = document.getElementById('whole-hist-body') || document.getElementById('whole-stretch');
    return body ? body.textContent : '';
  });
  chk('W6 the panel renders the modeller row (pageLabel "Modeller")', /Modeller/.test(rendered), rendered.slice(0, 200));

  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('W7 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 3).join(' | '));

  console.log('W-MODELLER-WORLDHIST: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();

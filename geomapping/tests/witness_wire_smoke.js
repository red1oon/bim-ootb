#!/usr/bin/env node
// witness_wire_smoke.js — §GEOMAP-WIRE browser smoke (headless Chromium, self-served). SECONDARY to the
// node value witness (witness_wire.js W1-W6) per docs/TestArchitecture.md §Browser Testing: this proves
// WIRING ONLY — the scripts load un-collided, the bridge data fetch really happens, the real user path
// (click Open → resident seeds) emits the §GEOMAP-VALIDATE audit, and window.__gmSeedAudit is readable.
//
// ISSUE PROVED: node module-isolation HIDES browser global-collision/load-order bugs
// (feedback_browser_iife_wrap_engines — the HBA burn) — only a live page catches a bridge that never
// loads, a fetch path that 404s, or a gmReady() race that silently disables the audit forever.
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
  await page.waitForFunction(function () { return window.__sceneReady === true && !!window.SQL; }, { timeout: 25000 }).catch(function () {});

  var pass = 0, fail = 0;
  function chk(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); } else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); } }
  console.log('═══ §GEOMAP-WIRE-SMOKE — live bridge + seed audit (headless) ═══');

  // G1 bridge data really loaded (fetch path + init, not just script parse)
  await page.waitForFunction(function () { return window.GeomapBridge && window.GeomapBridge.gmReady() === true; }, { timeout: 15000 }).catch(function () {});
  var ready = await page.evaluate(function () { return !!(window.GeomapBridge && window.GeomapBridge.gmReady()); });
  chk('G1 GeomapBridge loaded + data fetched (gmReady)', ready,
    logs.filter(function (l) { return l.indexOf('§GEOMAP-BRIDGE') === 0; }).slice(0, 1).join(''));

  // G2 the REAL user path (click Open → SampleHouse) seeds WITH the audit
  await page.click('#b-open'); await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="SampleHouse"]');
  await page.waitForFunction(function () {
    return !!(window.__gmSeedAudit && window.__gmSeedAudit.SampleHouse);
  }, { timeout: 25000 }).catch(function () {});
  var audit = await page.evaluate(function () { return (window.__gmSeedAudit && window.__gmSeedAudit.SampleHouse) || null; });
  chk('G2 seed ran the audit → window.__gmSeedAudit.SampleHouse present', !!audit,
    audit && ('checked=' + audit.checked + ' flagged=' + audit.flagged.length + ' noBand=' + audit.noBand + ' inBandRate=' + audit.inBandRate));
  chk('G2b audit accounting sane (checked>0)', !!audit && audit.checked > 0);

  // G3 the §GEOMAP-VALIDATE summary hit the live console (the whitebox §-log-first channel)
  var sumLine = logs.find(function (l) { return l.indexOf('§GEOMAP-VALIDATE summary') > -1; });
  chk('G3 §GEOMAP-VALIDATE summary line emitted in live console', !!sumLine, sumLine && sumLine.slice(0, 120));

  // G4 zero load failures / pageerrors with the new scripts present
  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('G4 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  console.log('§GEOMAP-WIRE-SMOKE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log('§GEOMAP-WIRE-SMOKE FATAL ' + (e && e.stack)); process.exit(1); });

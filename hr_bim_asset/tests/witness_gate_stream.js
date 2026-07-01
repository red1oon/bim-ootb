#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-GATE-STREAM (RESUME_OVERLAY_PILL_ICONS.md). Proves viewer/hba_lens.js's FM-pill
//   data-gate poll waits for A.streaming to go false (the real stream-complete signal, viewer/streaming.js
//   streamTick) before settling availableLenses() — NOT the first tick guidMap merely has keys. The bug
//   (§HBA_GATE FM=on available=[dash] guidMap=500 in a live capture): geometry streams incrementally, so
//   guidMap goes non-empty long before every element (and its lens-relevant guid) has arrived; the OLD poll
//   cleared its interval on that first tick and never re-evaluated, so the FM pill locked onto a half-loaded
//   model. Harness: hba_gate_harness.html (a fake asset guid arrives mid-stream, A.streaming flips false
//   after). Run: node hr_bim_asset/tests/witness_gate_stream.js 2>&1 | tee <log> — then READ the log.
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var FIX = '/hr_bim_asset/tests/hba_gate_harness.html';

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  console.log('\n═══ W-HBA-GATE-STREAM — FM pill gate waits for real stream-complete, not first-guidMap-tick ═══\n');
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(req.url.split('?')[0]);
    var fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(fs.readFileSync(fp));
  });
  await new Promise(function (r) { server.listen(0, r); });
  var port = server.address().port, base = 'http://localhost:' + port + FIX;
  var browser = await reqPw().chromium.launch();
  try {
    var page = await browser.newPage();
    await page.goto(base, { waitUntil: 'load' });
    // let the poll run past the fake stream-complete (t~1.6s) plus one more 500ms tick to settle.
    await page.waitForTimeout(2500);
    var r = await page.evaluate(function () {
      return { log: window.__log, pillBuilds: window.__pillBuilds || 0, pill: window._mainPillActions[0] };
    });
    var gateLines = r.log.filter(function (l) { return l.indexOf('§HBA_GATE') === 0; });
    verdict(gateLines.length === 1, 'gate settles exactly once (no repeated rebuild storms)', 'lines=' + gateLines.length);
    var finalLine = gateLines[0] || '';
    verdict(finalLine.indexOf('maintenance') !== -1,
      'settled AFTER stream-complete — sees the maintenance lens (its guid arrived mid-stream, not at tick 1)', finalLine);
    verdict(r.pill.pill === undefined, 'hbaFM pill flipped ON (pill=undefined = visible, not pill:false)', 'pill.pill=' + r.pill.pill);
    verdict(r.pillBuilds === 1, '_buildPill() called exactly once', 'builds=' + r.pillBuilds);
    await page.close();
  } finally {
    await browser.close(); server.close();
  }
  var n = 4;
  console.log('\n' + (fails === 0 ? '✅ W-HBA-GATE-STREAM ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '')); process.exit(1); });

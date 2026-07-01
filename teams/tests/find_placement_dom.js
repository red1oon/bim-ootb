#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-FIND-PLACEMENT-DOM (RESUME_TEAMS_UI_CONSISTENCY §R6). A chromium check that the
//   placement actually RENDERS onto the operate Storey→Rooms Find panel (no handwave on the visible fact):
//     §FP-AFTER-CHIP — WHO-dots are appended AFTER each row's state chip (the `.row-dots` follows `.st`).
//     §FP-ROOM-COUNT — Room C shows the fan-out (2 visible dots + a `+3` badge); Room A shows 2, Room B 1.
//     §FP-STOREY-N   — the storey header gets a `+N` density badge (L1=+3, L2=+5) — HR's density grammar.
//     §FP-OFF        — clear (off model) removes every `.row-dots`/`.storey-density` → rows === OFF baseline.
//   Run: node teams/tests/find_placement_dom.js 2>&1 | tee teams/logs/find_placement_dom.log — then READ the log.
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  console.log('\n═══ W-FIND-PLACEMENT-DOM — dots render after the state chip; storey rolls up +N ═══\n');
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/tests/fixtures/find_rows.html';
    var fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(fs.readFileSync(fp));
  });
  await new Promise(function (r) { server.listen(0, r); });
  var port = server.address().port;
  var browser = await reqPw().chromium.launch();
  try {
    var page = await browser.newPage();
    var consoleErrs = [];                                        // silent-failure guard (IIFE-wrap doctrine)
    page.on('console', function (m) { if (m.type() === 'error') consoleErrs.push(m.text()); });
    page.on('pageerror', function (e) { consoleErrs.push(e.message); });
    await page.goto('http://localhost:' + port + '/', { waitUntil: 'load' });
    await page.waitForFunction('window.__teamsReady === true', { timeout: 8000 });
    var baseline = await page.$eval('#find', function (n) { return n.innerHTML; });

    await page.evaluate('window.__teamsPaint()');

    // §FP-AFTER-CHIP — in Room A, the .row-dots immediately follows the .st chip.
    var afterChip = await page.evaluate(function () {
      var row = document.querySelector('.find-row[data-guid="GUID-A"]');
      var chip = row.querySelector('.st');
      return chip && chip.nextElementSibling && chip.nextElementSibling.classList.contains('row-dots');
    });
    verdict(afterChip === true, '§FP-AFTER-CHIP  WHO-dots inserted after the state chip', 'ok=' + afterChip);

    // §FP-ROOM-COUNT — Room C = 2 visible dots + a '+3' badge; A=2 dots; B=1 dot.
    var counts = await page.evaluate(function () {
      function row(g) { var r = document.querySelector('.find-row[data-guid="' + g + '"] .row-dots');
        return r ? { dots: r.querySelectorAll('.tdot').length, badge: (r.querySelector('.tbadge') || {}).textContent || null } : { dots: 0, badge: null }; }
      return { A: row('GUID-A'), B: row('GUID-B'), C: row('GUID-C') };
    });
    verdict(counts.A.dots === 2 && counts.B.dots === 1 && counts.C.dots === 2 && counts.C.badge === '+3',
      '§FP-ROOM-COUNT  room fan-out: A=2 · B=1 · C=2+(+3)', JSON.stringify(counts));

    // §FP-STOREY-N — storey headers get the +N density badge: L1=+3 (A2+B1), L2=+5 (C).
    var storeys = await page.evaluate(function () {
      function hdr(s) { var b = document.querySelector('.storey-hdr[data-storey="' + s + '"] .storey-density'); return b ? b.textContent : null; }
      return { L1: hdr('L1'), L2: hdr('L2') };
    });
    verdict(storeys.L1 === '+3' && storeys.L2 === '+5', '§FP-STOREY-N  storey rollup +N density badge', JSON.stringify(storeys));

    // §FP-OFF — clear → all our nodes gone → rows === OFF baseline.
    await page.evaluate('window.__teamsClear()');
    var after = await page.evaluate(function () {
      return { added: document.querySelectorAll('#find .row-dots, #find .storey-density').length, html: document.getElementById('find').innerHTML };
    });
    verdict(after.added === 0 && after.html === baseline, '§FP-OFF  clear === OFF baseline (zero footprint)',
      'added=' + after.added + ' identical=' + (after.html === baseline));

    // §FP-NOERR — no console.error / pageerror across the whole run.
    verdict(consoleErrs.length === 0, '§FP-NOERR  0 console errors (no silent JS failure)', 'errs=' + consoleErrs.length + (consoleErrs.length ? ' :: ' + consoleErrs.join(' | ') : ''));
  } finally {
    await browser.close(); server.close();
  }

  var n = 5;
  console.log('\n' + (fails === 0 ? '✅ W-FIND-PLACEMENT-DOM ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });

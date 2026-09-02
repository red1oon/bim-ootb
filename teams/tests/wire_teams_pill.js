#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TEAM-WIRE (teams/ROADMAP.md §S9, Phase E). A Playwright WIRING check (project
//   doctrine: Playwright = wiring/deploy checks, not value verification) over the STANDALONE demo page
//   teams/demo/erp_teams_pill.html. Proves the embed contract:
//     §WIRE-LOADS    — the teams scripts load + the distinct Teams pill exists (id 'teams-pill', NOT redpill/zoom).
//     §WIRE-OFF      — Team OFF (default) = pixel-identical: no overlay pane, no dots; chrome DOM == baseline.
//     §WIRE-ON       — click the pill → the overlay pane mounts + dots paint onto the rows.
//     §WIRE-REVERSIBLE — click again → pane removed + chrome DOM === the OFF baseline (off = identical, reversible).
//     §WIRE-CLOSE-X  — FABLE5_FOLLOWUP_2026-07-04 §Item 2: the STANDALONE fallback pane carries a visible
//                      close affordance (.teams-pane-close ✕ — the host `.bim-panel-close` analogue) and
//                      clicking IT routes through the same close(): pane gone, pill un-pressed, OFF baseline.
//                      ISSUE PROVED: pre-fix the standalone pane had NO close button (only the PillBuilder-
//                      hosted variant did) — the only way out was knowing to re-click the pill.
//   Run: node teams/tests/wire_teams_pill.js 2>&1 | tee teams/logs/wire_teams_pill.log — then READ the log.
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..');                       // serve teams/ so ../overlay/* resolves
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  console.log('\n═══ W-TEAM-WIRE — the Teams pill embed: OFF pixel-identical · ON mounts · reversible ═══\n');
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/demo/erp_teams_pill.html';
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
    await page.goto('http://localhost:' + port + '/demo/erp_teams_pill.html', { waitUntil: 'load' });
    await page.waitForFunction('window.__teamsReady === true', { timeout: 8000 });

    // §WIRE-LOADS — the distinct Teams pill exists; it is NOT the red-pill / zoom-across.
    var pill = await page.$('#teams-pill');
    var hasRedpill = await page.$('.redpill, #redpill, #zoom-across, .zoom-across');
    verdict(!!pill && !hasRedpill, '§WIRE-LOADS  distinct Teams pill present (not redpill/zoom)', 'pill=' + !!pill + ' collision=' + !!hasRedpill);

    // §WIRE-OFF — Team OFF: no pane, no dots; snapshot the chrome as the baseline.
    var baseline = await page.$eval('#chrome', function (n) { return n.innerHTML; });
    var offState = await page.evaluate(function () {
      return { pane: !!document.getElementById('teams-pane'), dots: document.querySelectorAll('#chrome .row-dots').length,
               pressed: document.getElementById('teams-pill').getAttribute('aria-pressed') };
    });
    verdict(offState.pane === false && offState.dots === 0 && offState.pressed === 'false',
      '§WIRE-OFF  Team off = pixel-identical (no pane, no dots)', 'pane=' + offState.pane + ' dots=' + offState.dots);

    // §WIRE-ON — click → pane mounts + dots paint.
    await page.click('#teams-pill');
    var onState = await page.evaluate(function () {
      return { pane: !!document.getElementById('teams-pane'), dots: document.querySelectorAll('#chrome .row-dots').length,
               paneEntries: document.querySelectorAll('#teams-pane .pe').length, pressed: document.getElementById('teams-pill').getAttribute('aria-pressed') };
    });
    verdict(onState.pane === true && onState.dots > 0 && onState.paneEntries > 0 && onState.pressed === 'true',
      '§WIRE-ON  click mounts the overlay pane + paints dots', 'pane=' + onState.pane + ' dots=' + onState.dots + ' paneEntries=' + onState.paneEntries);

    // §WIRE-REVERSIBLE — click again → pane gone + chrome DOM === the OFF baseline.
    await page.click('#teams-pill');
    var after = await page.evaluate(function () {
      return { pane: !!document.getElementById('teams-pane'), html: document.getElementById('chrome').innerHTML };
    });
    verdict(after.pane === false && after.html === baseline,
      '§WIRE-REVERSIBLE  off again === OFF baseline (reversible)', 'pane=' + after.pane + ' chromeIdentical=' + (after.html === baseline));

    // §WIRE-CLOSE-X — re-open, then close via the pane's OWN ✕ (not the pill): same close(), same baseline.
    await page.click('#teams-pill');
    var xBtn = await page.$('#teams-pane .teams-pane-close');
    verdict(!!xBtn, '§WIRE-CLOSE-X  standalone pane carries a visible close affordance', 'sel=#teams-pane .teams-pane-close');
    if (xBtn) await xBtn.click();
    var afterX = await page.evaluate(function () {
      return { pane: !!document.getElementById('teams-pane'), pressed: document.getElementById('teams-pill').getAttribute('aria-pressed'),
               html: document.getElementById('chrome').innerHTML };
    });
    verdict(afterX.pane === false && afterX.pressed === 'false' && afterX.html === baseline,
      '§WIRE-CLOSE-X  ✕ routes through close(): pane gone, pill un-pressed, OFF baseline', 'pane=' + afterX.pane + ' pressed=' + afterX.pressed + ' chromeIdentical=' + (afterX.html === baseline));
  } finally {
    await browser.close(); server.close();
  }

  var n = 6;
  console.log('\n' + (fails === 0 ? '✅ W-TEAM-WIRE ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });

#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-EMBED-WIRE (teams/ROADMAP.md §S9 follow-up, the GATED embed into production chrome).
//   A Playwright WIRING check (doctrine: Playwright = wiring/deploy checks, not value verification) over a
//   MINIMAL iDempiere host fixture + the production /erp/teams_embed.js. NOT the full app (that harness is
//   unavailable in-env); this isolates the EMBED contract that the full-app smoke would otherwise prove:
//     §EMBED-OFF   — flag OFF (default) = pixel-identical: NO teams-pill, the host #idmp-pill is byte-identical,
//                    and teams_embed reports {enabled:false} (it did not even lazy-load the modules).
//     §EMBED-ON    — flag ON (?teams=1) = teams_embed lazy-loads the proven modules + mounts the DISTINCT
//                    Teams pill INTO the live #idmp-pill bar (not redpill/zoom), without disturbing the lens pill.
//     §EMBED-PANE  — click → the pane folds the HOST's read-only op-log (involvement entries) + paints row dots.
//     §EMBED-REVERT— click again → pane + dots removed → the bar is back to its pill-mounted baseline (reversible).
//   Run: node erp/tests/wire_teams_embed.js 2>&1 | tee teams/logs/wire_teams_embed.log — then READ the log.
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');                 // repo root: serves /erp/* AND /teams/*
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var FIX = '/erp/tests/fixtures/teams_embed_host.html';

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  console.log('\n═══ W-EMBED-WIRE — Teams pill into production chrome: OFF pixel-identical · ON mounts · reversible ═══\n');
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
    // ── §EMBED-OFF — NO query → flag off → no pill, header byte-identical, modules NOT loaded. ──
    var off = await browser.newPage();
    await off.goto(base, { waitUntil: 'load' });
    await off.waitForFunction('window.__embedInit !== undefined', { timeout: 8000 });
    var offState = await off.evaluate(function () {
      return { pill: !!document.getElementById('teams-pill'), bar: document.getElementById('idmp-pill').innerHTML,
               enabled: window.__embedInit.enabled, dotLayerLoaded: !!window.TeamsDotLayer, pillLoaded: !!window.TeamsPill };
    });
    var barBaseline = offState.bar;
    verdict(offState.pill === false && offState.enabled === false && offState.bar === '<button id="pill-kanban" type="button">K</button>' &&
            !offState.dotLayerLoaded && !offState.pillLoaded,
      '§EMBED-OFF  flag off = pixel-identical (no pill, no module fetch)',
      'pill=' + offState.pill + ' enabled=' + offState.enabled + ' modulesLoaded=' + (offState.dotLayerLoaded || offState.pillLoaded));
    await off.close();

    // ── §EMBED-ON — ?teams=1 → lazy-load + mount the distinct pill INTO #idmp-pill. ──
    var on = await browser.newPage();
    await on.goto(base + '?teams=1', { waitUntil: 'load' });
    await on.waitForFunction('window.__teamsEmbedReady === true', { timeout: 10000 });
    var onState = await on.evaluate(function () {
      var bar = document.getElementById('idmp-pill');
      return { pill: !!document.getElementById('teams-pill'),
               pillInBar: !!(bar && bar.querySelector('#teams-pill')),
               lensPillIntact: !!document.getElementById('pill-kanban'),
               collision: !!document.querySelector('.redpill, #redpill, #zoom-across, .zoom-across'),
               enabled: window.__embedInit && window.__embedInit.enabled, mounted: window.__embedInit && window.__embedInit.mounted };
    });
    verdict(onState.pill && onState.pillInBar && onState.lensPillIntact && !onState.collision && onState.mounted,
      '§EMBED-ON  distinct Teams pill mounted into the live #idmp-pill bar',
      'pillInBar=' + onState.pillInBar + ' lensIntact=' + onState.lensPillIntact + ' collision=' + onState.collision);

    // ── §EMBED-PANE — click → pane folds the host op-log (involvement) + row dots. ──
    await on.click('#teams-pill');
    await on.waitForSelector('#teams-pane', { timeout: 5000 });
    var pane = await on.evaluate(function () {
      return { pane: !!document.getElementById('teams-pane'),
               entries: document.querySelectorAll('#teams-pane div').length,
               dots: document.querySelectorAll('#grid .teams-row-dots').length,
               hot: (function () { var h = document.querySelector('#teams-pane span'); return h ? h.textContent : ''; })() };
    });
    verdict(pane.pane && pane.entries >= 3 && pane.dots > 0,
      '§EMBED-PANE  pane folds host op-log (involvement) + row dots', 'entries=' + pane.entries + ' dots=' + pane.dots + ' first=' + pane.hot);

    // ── §EMBED-REVERT — click again → pane + dots removed, bar back to its pill-mounted baseline. ──
    await on.click('#teams-pill');
    var revert = await on.evaluate(function () {
      return { pane: !!document.getElementById('teams-pane'), dots: document.querySelectorAll('#grid .teams-row-dots').length,
               pillStill: !!document.getElementById('teams-pill') };
    });
    verdict(revert.pane === false && revert.dots === 0 && revert.pillStill === true,
      '§EMBED-REVERT  pane+dots removed; pill persists (reversible)', 'pane=' + revert.pane + ' dots=' + revert.dots + ' pill=' + revert.pillStill);
    void barBaseline;
    await on.close();
  } finally {
    await browser.close(); server.close();
  }

  var n = 4;
  console.log('\n' + (fails === 0 ? '✅ W-EMBED-WIRE ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });

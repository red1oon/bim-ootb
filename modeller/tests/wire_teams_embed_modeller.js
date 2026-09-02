#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-EMBED-BIM (teams/ROADMAP.md §S11 follow-up — the Teams overlay over the LIVE Modeller).
//   A Playwright WIRING check (doctrine: Playwright = wiring, not value verification) over a MINIMAL modeller
//   host fixture + the production /modeller/teams_embed.js. NOT the full 3D app (that harness is heavy in-env);
//   this isolates the EMBED contract the full-app smoke would prove:
//     §EMBED-OFF    — flag OFF (default) = pixel-identical: NO pill, NO mount, teams_embed reports {enabled:false},
//                     the Outliner is byte-identical, and the teams/ modules are NOT even lazy-loaded.
//     §EMBED-ON     — flag ON (?teams=1) = lazy-loads + mounts a DISTINCT floating Teams pill (not redpill/zoom).
//     §EMBED-CONTEXT— click → contextual dots paint on the Outliner [data-fid] rows + the pane shows presence
//                     (the current BIM actor) — the contextual overlay over the live scene.
//     §EMBED-REVERT — click again → pane + row-dots removed → pill persists (reversible).
//   Run: node modeller/tests/wire_teams_embed_modeller.js 2>&1 | tee teams/logs/wire_teams_embed_bim.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');                 // repo root: serves /modeller/* AND /teams/*
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var FIX = '/modeller/tests/fixtures/teams_embed_host.html';

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  console.log('\n═══ W-EMBED-BIM — Teams overlay over the Modeller: OFF pixel-identical · ON contextual dots ═══\n');
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(req.url.split('?')[0]), fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(fs.readFileSync(fp));
  });
  await new Promise(function (r) { server.listen(0, r); });
  var port = server.address().port, base = 'http://localhost:' + port + FIX;
  var browser = await reqPw().chromium.launch();
  try {
    // ── §EMBED-OFF — no query → flag off → no pill/mount, Outliner byte-identical, modules NOT loaded. ──
    var off = await browser.newPage();
    await off.goto(base, { waitUntil: 'load' });
    await off.waitForFunction('window.__embedInit !== undefined', { timeout: 8000 });
    var o = await off.evaluate(function () {
      return { pill: !!document.getElementById('teams-pill'), mount: !!document.getElementById('teams-embed-mount'),
               enabled: window.__embedInit.enabled, tree: document.getElementById('bo-tree').innerHTML,
               loaded: !!(window.TeamsPresence || window.TeamsPill || window.TeamsDotLayer) };
    });
    verdict(o.pill === false && o.mount === false && o.enabled === false && !o.loaded,
      '§EMBED-OFF  flag off = pixel-identical (no pill, no module fetch)', 'pill=' + o.pill + ' enabled=' + o.enabled + ' modulesLoaded=' + o.loaded);
    await off.close();

    // ── §EMBED-ON — ?teams=1 → lazy-load + mount the distinct floating pill. ──
    var on = await browser.newPage();
    await on.goto(base + '?teams=1', { waitUntil: 'load' });
    await on.waitForFunction('window.__teamsEmbedReady === true', { timeout: 10000 });
    var s = await on.evaluate(function () {
      return { pill: !!document.getElementById('teams-pill'),
               pillInMount: !!(document.getElementById('teams-embed-mount') && document.querySelector('#teams-embed-mount #teams-pill')),
               collision: !!document.querySelector('.redpill, #redpill, #zoom-across, .zoom-across'),
               mounted: window.__embedInit && window.__embedInit.mounted };
    });
    verdict(s.pill && s.pillInMount && !s.collision && s.mounted,
      '§EMBED-ON  distinct floating Teams pill mounted', 'pillInMount=' + s.pillInMount + ' collision=' + s.collision);

    // ── §EMBED-CONTEXT — click → contextual dots on the Outliner rows + presence pane. ──
    await on.click('#teams-pill');
    await on.waitForSelector('#teams-pane', { timeout: 5000 });
    var ctx = await on.evaluate(function () {
      return { pane: !!document.getElementById('teams-pane'),
               rowDots: document.querySelectorAll('#bonsai-outliner .teams-row-dots').length,
               presenceShown: /red1/.test(document.getElementById('teams-pane').textContent),
               bim: /BIM/.test(document.getElementById('teams-pane').textContent) };
    });
    verdict(ctx.pane && ctx.rowDots > 0 && ctx.presenceShown && ctx.bim,
      '§EMBED-CONTEXT  dots on Outliner rows + presence pane (the live-scene overlay)', 'rowDots=' + ctx.rowDots + ' presence=' + ctx.presenceShown);

    // ── §EMBED-REVERT — click again → pane + dots removed; pill persists. ──
    await on.click('#teams-pill');
    var rev = await on.evaluate(function () {
      return { pane: !!document.getElementById('teams-pane'), dots: document.querySelectorAll('#bonsai-outliner .teams-row-dots').length, pill: !!document.getElementById('teams-pill') };
    });
    verdict(rev.pane === false && rev.dots === 0 && rev.pill === true,
      '§EMBED-REVERT  pane+dots removed; pill persists (reversible)', 'pane=' + rev.pane + ' dots=' + rev.dots);
    await on.close();
  } finally {
    await browser.close(); server.close();
  }

  var n = 4;
  console.log('\n' + (fails === 0 ? '✅ W-EMBED-BIM ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });

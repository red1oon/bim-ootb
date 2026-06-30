#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TEAMS-UI-CONSISTENT (RESUME_TEAMS_UI_CONSISTENCY §3). A chromium consistency check over
//   the host fixture teams/tests/fixtures/idmp_host.html (the audited A.icon/A.createPanel contract + real
//   --idmp-* tokens). Proves the Teams overlay SPEAKS THE HOST'S VISUAL LANGUAGE, never imposes its own:
//     §UI-ICON   — the pill is built via A.icon (an <svg> from the host registry, NOT a text node) + hover title.
//     §UI-TOKEN  — the active pill resolves --idmp-blue; the overlay injects NO foreign hardcoded #3a6df0.
//     §UI-PANE   — the pane is a host `.bim-panel` (the standard shell), not a bespoke drawer.
//     §UI-DOTID  — an identity dot colour is NOT in HR's state palette (who never reads as state, §R5).
//     §UI-OFF    — OFF (default) is still pixel-identical: no pane, no dots, chrome DOM == baseline.
//   Run: node teams/tests/ui_consistent.js 2>&1 | tee teams/logs/ui_consistent.log — then READ the log.
//   NB this lane NEVER touches viewer/panels.js (that is the HBA/viewer seam) — the overlay CONSUMES the host
//   factory at runtime; the fixture self-contains only the `share` glyph the pill needs.
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..');                       // serve teams/ so ../../overlay/* resolves
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }

// §R0/§R5 — HR's state palette (overlay.js COLORS + dashboard.js AGE_COLORS). An identity dot MUST avoid these.
var HR_STATE_RGB = ['rgb(46, 125, 50)', 'rgb(249, 168, 37)', 'rgb(142, 36, 170)', 'rgb(158, 158, 158)',
                    'rgb(198, 40, 40)', 'rgb(251, 140, 0)'];
var IDMP_BLUE_RGB = 'rgb(28, 95, 168)';                       // --idmp-blue #1c5fa8

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  console.log('\n═══ W-TEAMS-UI-CONSISTENT — the overlay speaks the host language (icon · token · pane · dot · OFF) ═══\n');
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/tests/fixtures/idmp_host.html';
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
    await page.goto('http://localhost:' + port + '/', { waitUntil: 'load' });
    await page.waitForFunction('window.__teamsReady === true', { timeout: 8000 });

    // §UI-OFF (baseline first) — OFF = pixel-identical: snapshot chrome, no pane, no dots.
    var baseline = await page.$eval('#chrome', function (n) { return n.innerHTML; });
    var off = await page.evaluate(function () {
      return { pane: !!document.getElementById('teams-pane'), dots: document.querySelectorAll('#chrome .row-dots').length };
    });
    verdict(off.pane === false && off.dots === 0, '§UI-OFF  OFF default = pixel-identical (no pane, no dots)',
      'pane=' + off.pane + ' dots=' + off.dots);

    // §UI-ICON — the pill is an A.icon button: contains an <svg> built by the host factory (has xmlns, which
    //   the self-contained fallback glyph does NOT), and carries a hover title.
    var icon = await page.evaluate(function () {
      var p = document.getElementById('teams-pill'); if (!p) return null;
      var svg = p.querySelector('svg');
      return { hasSvg: !!svg, fromFactory: !!(svg && svg.getAttribute('xmlns')), title: p.getAttribute('title') || '' };
    });
    verdict(!!icon && icon.hasSvg && icon.fromFactory && icon.title.length > 0,
      '§UI-ICON  pill built via A.icon (host <svg>, not text) + hover title',
      icon ? 'svg=' + icon.hasSvg + ' factory=' + icon.fromFactory + ' title="' + icon.title + '"' : 'no pill');

    // turn the overlay ON for the token/pane/dot checks.
    await page.click('#teams-pill');
    await page.waitForFunction("document.querySelectorAll('#chrome .tdot.person').length > 0", { timeout: 5000 });

    // §UI-TOKEN — the active pill resolves --idmp-blue (NOT #3a6df0); no overlay-injected node carries #3a6df0.
    var tok = await page.evaluate(function () {
      var p = document.getElementById('teams-pill');
      var bg = getComputedStyle(p).backgroundColor;
      // scan every stylesheet rule + inline style for the foreign blue (the overlay must inject none).
      var foreign = false;
      try {
        for (var s = 0; s < document.styleSheets.length; s++) {
          var rules = document.styleSheets[s].cssRules || [];
          for (var r = 0; r < rules.length; r++) if ((rules[r].cssText || '').toLowerCase().indexOf('#3a6df0') >= 0) foreign = true;
        }
      } catch (e) {}
      var inline = Array.prototype.some.call(document.querySelectorAll('[style]'), function (n) {
        return (n.getAttribute('style') || '').toLowerCase().indexOf('#3a6df0') >= 0; });
      return { bg: bg, foreign: foreign || inline };
    });
    verdict(tok.bg === IDMP_BLUE_RGB && tok.foreign === false,
      '§UI-TOKEN  active band = --idmp-blue, no foreign #3a6df0', 'bg=' + tok.bg + ' foreign=' + tok.foreign);

    // §UI-PANE — the pane is the host `.bim-panel` shell (createPanel), not a bespoke `.teams-pane` drawer.
    var pane = await page.evaluate(function () {
      var el = document.getElementById('teams-pane');
      return el ? { cls: el.className, isBim: el.classList.contains('bim-panel'), hasClose: !!el.querySelector('.bim-panel-close') } : null;
    });
    verdict(!!pane && pane.isBim && pane.hasClose, '§UI-PANE  pane = host .bim-panel shell (not bespoke drawer)',
      pane ? 'class="' + pane.cls + '" close=' + pane.hasClose : 'no pane');

    // §UI-DOTID — an identity dot's rendered colour is NOT one of HR's state colours.
    var dot = await page.evaluate(function () {
      var d = document.querySelector('#chrome .tdot.person');
      return d ? getComputedStyle(d).backgroundColor : null;
    });
    var stateSet = HR_STATE_RGB;
    verdict(!!dot && stateSet.indexOf(dot) < 0, '§UI-DOTID  identity dot ∉ HR state palette (who ≠ state)',
      'dot=' + dot);

    // §UI-OFF (reversible) — click again → pane gone + chrome DOM === baseline.
    await page.click('#teams-pill');
    var rev = await page.evaluate(function () {
      return { pane: !!document.getElementById('teams-pane'), html: document.getElementById('chrome').innerHTML };
    });
    verdict(rev.pane === false && rev.html === baseline, '§UI-OFF  reversible — off again === OFF baseline',
      'pane=' + rev.pane + ' chromeIdentical=' + (rev.html === baseline));
  } finally {
    await browser.close(); server.close();
  }

  var n = 6;
  console.log('\n' + (fails === 0 ? '✅ W-TEAMS-UI-CONSISTENT ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });

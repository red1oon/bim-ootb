#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-EMBED-ICON (RESUME_OVERLAY_PILL_ICONS.md). Proves the Teams pill reuses the REAL
//   icon registry (window.ICONS, erp/icons.js — verbatim-copied from panels.js ICONS, the source of truth)
//   when the host page carries one, instead of always drawing its own hardcoded inline SVG. Two fixtures:
//     teams_embed_host.html          (no icons.js)  → falls back to the pill's own inline glyph (unchanged).
//     teams_embed_host_registry.html (loads icons.js, production's real order) → pill draws window.ICONS.share.
//   Run: node erp/tests/wire_teams_embed_icon.js 2>&1 | tee <log> — then READ the log.
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  console.log('\n═══ W-EMBED-ICON — Teams pill reuses the host icon registry when one is present ═══\n');
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(req.url.split('?')[0]);
    var fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(fs.readFileSync(fp));
  });
  await new Promise(function (r) { server.listen(0, r); });
  var port = server.address().port;
  var browser = await reqPw().chromium.launch();
  try {
    // ── no-registry fixture: pill keeps its own inline glyph (no regression vs baseline) ──
    var noReg = await browser.newPage();
    await noReg.goto('http://localhost:' + port + '/erp/tests/fixtures/teams_embed_host.html?teams=1', { waitUntil: 'load' });
    await noReg.waitForFunction('window.__teamsEmbedReady === true', { timeout: 10000 });
    var noRegState = await noReg.evaluate(function () {
      var pill = document.getElementById('teams-pill');
      return { hasSvg: !!(pill && pill.querySelector('svg')), isButton: !!pill && pill.tagName === 'BUTTON' };
    });
    verdict(noRegState.hasSvg, 'no-registry fixture: pill still renders a visible glyph (inline fallback intact)', JSON.stringify(noRegState));

    // ── registry fixture: pill MUST draw window.ICONS.share (byte-identical path data), not the inline fallback ──
    var reg = await browser.newPage();
    await reg.goto('http://localhost:' + port + '/erp/tests/fixtures/teams_embed_host_registry.html?teams=1', { waitUntil: 'load' });
    await reg.waitForFunction('window.__teamsEmbedReady === true', { timeout: 10000 });
    var regState = await reg.evaluate(function () {
      var pill = document.getElementById('teams-pill');
      var svg = pill && pill.querySelector('svg');
      // normalize BOTH through the same DOM parse (source markup vs. live DOM serialize differ in quoting/
      // self-closing form even when semantically identical) — compare post-parse, in the SAME document.
      var probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      probe.innerHTML = (window.ICONS && window.ICONS.share) ? window.ICONS.share.svg : '';
      return {
        pillInBar: !!(document.getElementById('idmp-pill') && document.getElementById('idmp-pill').querySelector('#teams-pill')),
        svgHtml: svg ? svg.innerHTML : null,
        registryShareHtmlNormalized: probe.innerHTML,
        isButton: !!pill && pill.tagName === 'BUTTON'
      };
    });
    verdict(regState.pillInBar, 'registry fixture: pill still mounts into #idmp-pill', JSON.stringify({ pillInBar: regState.pillInBar }));
    verdict(!!regState.registryShareHtmlNormalized && regState.svgHtml === regState.registryShareHtmlNormalized,
      'registry fixture: pill SVG is BYTE-IDENTICAL to window.ICONS.share (the real registry glyph, not inline TEAMS_ICON)',
      'svg=' + regState.svgHtml);
    await noReg.close(); await reg.close();
  } finally {
    await browser.close(); server.close();
  }
  var n = 3;
  console.log('\n' + (fails === 0 ? '✅ W-EMBED-ICON ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '')); process.exit(1); });

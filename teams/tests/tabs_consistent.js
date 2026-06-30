#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TEAMS-TABS (RESUME_TEAMS_UI_CONSISTENCY §R3). A chromium check that the EMBED pane's
//   Outliner uses the ONE canonical tab markup/class set — the SAME as teams/teams.html — never a new one:
//     §TABS-SCHEMA — the pane has `.tabs` with `.tab[data-t]` + a `.pane#pane-<id>` per tab (the canonical markup).
//     §TABS-PARITY — the embed's data-t set === teams.html's data-t set (tree/chat/dash) — one schema, not forked.
//     §TABS-ONE-ON — exactly one `.tab.on` at a time; default = tree (as teams.html).
//     §TABS-SWITCH — click Chat → pane-chat shows · pane-tree hides · `.on` moves (identical to teams.html tab()).
//     §TABS-OFF    — OFF (default) still has NO pane → pixel-identical (doctrine §P①).
//   Run: node teams/tests/tabs_consistent.js 2>&1 | tee teams/logs/tabs_consistent.log — then READ the log.
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

// teams.html's canonical data-t set, read from the file itself (the source of truth, not a hardcode).
function teamsHtmlDataT() {
  var html = fs.readFileSync(path.join(ROOT, 'teams.html'), 'utf8');
  var re = /class="tab(?:\s+on)?"\s+data-t="([a-z]+)"/g, out = [], m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

(async function () {
  console.log('\n═══ W-TEAMS-TABS — the embed Outliner uses teams.html\'s ONE tab schema (parity · switch · OFF) ═══\n');
  var canonical = teamsHtmlDataT();
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

    // §TABS-OFF — before any click: no pane (pixel-identical).
    var offPane = await page.evaluate(function () { return !!document.getElementById('teams-pane'); });
    verdict(offPane === false, '§TABS-OFF  OFF default = no pane (pixel-identical)', 'pane=' + offPane);

    await page.click('#teams-pill');
    await page.waitForFunction("document.querySelector('#teams-pane .tabs')", { timeout: 5000 });

    // §TABS-SCHEMA — `.tabs` bar + `.tab[data-t]` + a `.pane#pane-<id>` per tab.
    var schema = await page.evaluate(function () {
      var pane = document.getElementById('teams-pane');
      var tabs = Array.prototype.map.call(pane.querySelectorAll('.tabs .tab'), function (t) { return t.getAttribute('data-t'); });
      var panesOk = tabs.every(function (id) { var p = document.getElementById('pane-' + id); return p && p.classList.contains('pane'); });
      return { hasBar: !!pane.querySelector('.tabs'), tabs: tabs, panesOk: panesOk };
    });
    verdict(schema.hasBar && schema.tabs.length >= 3 && schema.panesOk,
      '§TABS-SCHEMA  .tabs > .tab[data-t] + .pane#pane-<id> (canonical markup)', JSON.stringify(schema.tabs) + ' panesOk=' + schema.panesOk);

    // §TABS-PARITY — embed data-t set === teams.html's set.
    var parity = JSON.stringify(schema.tabs) === JSON.stringify(canonical);
    verdict(parity && canonical.length >= 3, '§TABS-PARITY  embed data-t === teams.html data-t (one schema)',
      'embed=' + JSON.stringify(schema.tabs) + ' teams.html=' + JSON.stringify(canonical));

    // §TABS-ONE-ON — exactly one .tab.on; default tree.
    var onState = await page.evaluate(function () {
      var on = document.querySelectorAll('#teams-pane .tab.on');
      return { count: on.length, active: on[0] && on[0].getAttribute('data-t') };
    });
    verdict(onState.count === 1 && onState.active === 'tree', '§TABS-ONE-ON  exactly one active tab, default tree',
      'count=' + onState.count + ' active=' + onState.active);

    // §TABS-SWITCH — click Chat → pane-chat visible · pane-tree hidden · .on moves.
    await page.click('#teams-pane .tab[data-t="chat"]');
    var sw = await page.evaluate(function () {
      var pt = document.getElementById('pane-tree'), pc = document.getElementById('pane-chat');
      var on = document.querySelector('#teams-pane .tab.on');
      return { treeHidden: getComputedStyle(pt).display === 'none', chatShown: getComputedStyle(pc).display !== 'none',
               active: on && on.getAttribute('data-t') };
    });
    verdict(sw.treeHidden && sw.chatShown && sw.active === 'chat', '§TABS-SWITCH  click Chat switches pane + active tab',
      'treeHidden=' + sw.treeHidden + ' chatShown=' + sw.chatShown + ' active=' + sw.active);
  } finally {
    await browser.close(); server.close();
  }

  var n = 5;
  console.log('\n' + (fails === 0 ? '✅ W-TEAMS-TABS ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
